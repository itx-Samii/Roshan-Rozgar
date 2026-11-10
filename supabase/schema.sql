-- Roshan Rozgar MVP schema. Run once in Supabase Dashboard → SQL Editor (new project).
-- Business rules live here (see docs/DATABASE.md): no double booking, valid status transitions,
-- address hidden until confirmed, reviews only after completion. Clients cannot UPDATE jobs directly.

-- ============ Types ============
create type public.app_role as enum ('customer', 'worker');
create type public.job_status as enum ('requested','quoted','confirmed','in_progress','awaiting_confirmation','completed','cancelled','disputed');
create type public.quote_status as enum ('pending','accepted','declined','expired');

-- ============ Reference data ============
create table public.service_categories (
  id smallint primary key, slug text unique not null, name_en text not null, name_ur text not null, sort smallint not null default 0
);
create table public.service_areas (
  id smallint primary key, city text not null, name_en text not null, name_ur text not null
);

-- ============ Identity ============
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role public.app_role,
  display_name text not null check (char_length(display_name) between 1 and 80),
  preferred_lang text not null default 'ur' check (preferred_lang in ('ur','en')),
  created_at timestamptz not null default now()
);
create table public.worker_profiles (
  user_id uuid primary key references public.profiles on delete cascade,
  years_experience smallint not null default 0 check (years_experience between 0 and 60),
  visit_fee_from int check (visit_fee_from between 0 and 100000),
  manual_availability text not null default 'offline' check (manual_availability in ('available','offline')),
  onboarded_at timestamptz
);
create table public.worker_services (
  worker_id uuid references public.worker_profiles on delete cascade,
  category_id smallint references public.service_categories,
  primary key (worker_id, category_id)
);
create table public.worker_areas (
  worker_id uuid references public.worker_profiles on delete cascade,
  area_id smallint references public.service_areas,
  primary key (worker_id, area_id)
);

-- ============ Jobs ============
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles,
  worker_id uuid not null references public.profiles,
  category_id smallint not null references public.service_categories,
  area_id smallint not null references public.service_areas,
  status public.job_status not null default 'requested',
  problem text not null check (char_length(problem) between 3 and 500),
  agreed_price int,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_id <> worker_id)
);
-- INVARIANT: a worker has at most one active booking (prevents double booking under concurrency)
create unique index uniq_active_booking_per_worker on public.jobs (worker_id)
  where status in ('confirmed','in_progress','awaiting_confirmation');
-- one open request per customer→worker pair
create unique index uniq_open_request on public.jobs (customer_id, worker_id) where status in ('requested','quoted');
create index jobs_worker_status on public.jobs (worker_id, status);
create index jobs_customer_status on public.jobs (customer_id, status);

create table public.job_private (
  job_id uuid primary key references public.jobs on delete cascade,
  address text not null check (char_length(address) between 5 and 200)
);
create table public.job_quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs on delete cascade,
  amount_pkr int not null check (amount_pkr between 100 and 1000000),
  includes_parts boolean not null default false,
  note text check (char_length(note) <= 300),
  status public.quote_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now()
);
create unique index uniq_pending_quote on public.job_quotes (job_id) where status = 'pending';
create table public.job_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index job_messages_job on public.job_messages (job_id, created_at);
create table public.job_status_history (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs on delete cascade,
  from_status public.job_status, to_status public.job_status not null,
  actor_id uuid, created_at timestamptz not null default now()
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid unique not null references public.jobs,
  worker_id uuid not null references public.profiles,
  customer_id uuid not null references public.profiles,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);

-- ============ Row Level Security (deny by default) ============
alter table public.service_categories enable row level security;
alter table public.service_areas enable row level security;
alter table public.profiles enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.worker_services enable row level security;
alter table public.worker_areas enable row level security;
alter table public.jobs enable row level security;
alter table public.job_private enable row level security;
alter table public.job_quotes enable row level security;
alter table public.job_messages enable row level security;
alter table public.job_status_history enable row level security;
alter table public.reviews enable row level security;

create policy "ref read" on public.service_categories for select using (true);
create policy "ref read" on public.service_areas for select using (true);
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name, preferred_lang) on public.profiles to authenticated;
create policy "worker read" on public.worker_profiles for select to authenticated using (true);
create policy "worker services read" on public.worker_services for select to authenticated using (true);
create policy "worker areas read" on public.worker_areas for select to authenticated using (true);
create policy "reviews read" on public.reviews for select to authenticated using (true);

create function public.is_participant(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.jobs j where j.id = p_job and auth.uid() in (j.customer_id, j.worker_id));
$$;
create policy "jobs participants" on public.jobs for select to authenticated using (auth.uid() in (customer_id, worker_id));
create policy "quotes participants" on public.job_quotes for select to authenticated using (public.is_participant(job_id));
create policy "history participants" on public.job_status_history for select to authenticated using (public.is_participant(job_id));
create policy "messages read" on public.job_messages for select to authenticated using (public.is_participant(job_id));
create policy "messages write" on public.job_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_participant(job_id));
-- Address: customer always; worker only once the booking is confirmed
create policy "address visibility" on public.job_private for select to authenticated using (
  exists (select 1 from public.jobs j where j.id = job_id and (
    j.customer_id = auth.uid() or
    (j.worker_id = auth.uid() and j.status in ('confirmed','in_progress','awaiting_confirmation','completed')))));

-- ============ New user → profile ============
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============ Helpers ============
create function public._history(p_job uuid, p_from public.job_status, p_to public.job_status) returns void
language sql security definer set search_path = '' as $$
  insert into public.job_status_history (job_id, from_status, to_status, actor_id) values (p_job, p_from, p_to, auth.uid());
$$;

-- ============ Role & worker profile ============
create function public.choose_role(p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set role = p_role where id = auth.uid() and role is null;
  if not found then raise exception 'ROLE_ALREADY_SET'; end if;
  if p_role = 'worker' then insert into public.worker_profiles (user_id) values (auth.uid()); end if;
end $$;

create function public.complete_onboarding(p_name text, p_years int, p_fee int, p_categories smallint[], p_areas smallint[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'worker') then raise exception 'FORBIDDEN'; end if;
  if coalesce(array_length(p_categories,1),0) not between 1 and 6 or coalesce(array_length(p_areas,1),0) not between 1 and 10 then
    raise exception 'VALIDATION_FAILED'; end if;
  update public.profiles set display_name = trim(p_name) where id = auth.uid();
  update public.worker_profiles set years_experience = p_years, visit_fee_from = p_fee,
    onboarded_at = coalesce(onboarded_at, now()), manual_availability = 'available' where user_id = auth.uid();
  delete from public.worker_services where worker_id = auth.uid();
  insert into public.worker_services select auth.uid(), unnest(p_categories);
  delete from public.worker_areas where worker_id = auth.uid();
  insert into public.worker_areas select auth.uid(), unnest(p_areas);
end $$;

create function public.set_availability(p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('available','offline') then raise exception 'VALIDATION_FAILED'; end if;
  update public.worker_profiles set manual_availability = p_status where user_id = auth.uid();
  if not found then raise exception 'FORBIDDEN'; end if;
end $$;

-- Effective availability is DERIVED: busy whenever an active booking exists
create function public.search_workers(p_category smallint default null, p_area smallint default null)
returns table (worker_id uuid, display_name text, years_experience smallint, visit_fee_from int, availability text,
               rating numeric, review_count bigint, completed_jobs bigint)
language sql stable security definer set search_path = '' as $$
  select * from (
    select p.id, p.display_name, w.years_experience, w.visit_fee_from,
      case when exists (select 1 from public.jobs j where j.worker_id = p.id and j.status in ('confirmed','in_progress','awaiting_confirmation'))
           then 'busy' else w.manual_availability end as availability,
      (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.worker_id = p.id) as rating,
      (select count(*) from public.reviews r where r.worker_id = p.id) as review_count,
      (select count(*) from public.jobs j where j.worker_id = p.id and j.status = 'completed') as completed_jobs
    from public.profiles p join public.worker_profiles w on w.user_id = p.id
    where w.onboarded_at is not null
      and (p_category is null or exists (select 1 from public.worker_services s where s.worker_id = p.id and s.category_id = p_category))
      and (p_area is null or exists (select 1 from public.worker_areas a where a.worker_id = p.id and a.area_id = p_area))
  ) x
  order by case x.availability when 'available' then 0 when 'busy' then 1 else 2 end, x.rating desc nulls last, x.completed_jobs desc;
$$;

-- ============ Booking lifecycle (each call is one transaction) ============
create function public.create_job_request(p_worker uuid, p_category smallint, p_area smallint, p_problem text, p_address text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'customer') then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.worker_services where worker_id = p_worker and category_id = p_category) then raise exception 'NOT_FOUND'; end if;
  begin
    insert into public.jobs (customer_id, worker_id, category_id, area_id, problem)
      values (auth.uid(), p_worker, p_category, p_area, trim(p_problem)) returning id into v_id;
  exception when unique_violation then raise exception 'OPEN_REQUEST_EXISTS';
  end;
  insert into public.job_private (job_id, address) values (v_id, trim(p_address));
  perform public._history(v_id, null, 'requested');
  return v_id;
end $$;

create function public.send_quote(p_job uuid, p_amount int, p_includes_parts boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_job for update;
  if j.id is null or j.worker_id <> auth.uid() then raise exception 'NOT_FOUND'; end if;
  if j.status not in ('requested','quoted') then raise exception 'INVALID_TRANSITION'; end if;
  update public.job_quotes set status = 'expired' where job_id = p_job and status = 'pending';
  insert into public.job_quotes (job_id, amount_pkr, includes_parts, note) values (p_job, p_amount, p_includes_parts, nullif(trim(p_note),''));
  update public.jobs set status = 'quoted', version = version + 1, updated_at = now() where id = p_job;
  if j.status <> 'quoted' then perform public._history(p_job, j.status, 'quoted'); end if;
end $$;

-- Customer accepts or declines the current quote. Accept is atomic; a busy worker raises WORKER_BUSY.
create function public.respond_quote(p_quote uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.job_quotes; j public.jobs;
begin
  select * into q from public.job_quotes where id = p_quote;
  if q.id is null then raise exception 'NOT_FOUND'; end if;
  select * into j from public.jobs where id = q.job_id for update;
  if j.customer_id <> auth.uid() then raise exception 'NOT_FOUND'; end if;
  if q.status <> 'pending' or j.status <> 'quoted' then raise exception 'QUOTE_NOT_CURRENT'; end if;
  if q.expires_at < now() then
    update public.job_quotes set status = 'expired' where id = p_quote;
    update public.jobs set status = 'requested', version = version + 1 where id = j.id;
    raise exception 'QUOTE_EXPIRED';
  end if;
  if p_accept then
    begin
      update public.jobs set status = 'confirmed', agreed_price = q.amount_pkr, version = version + 1, updated_at = now() where id = j.id;
    exception when unique_violation then raise exception 'WORKER_BUSY';
    end;
    update public.job_quotes set status = 'accepted' where id = p_quote;
    perform public._history(j.id, 'quoted', 'confirmed');
  else
    update public.job_quotes set status = 'declined' where id = p_quote;
    update public.jobs set status = 'requested', version = version + 1, updated_at = now() where id = j.id;
    perform public._history(j.id, 'quoted', 'requested');
  end if;
end $$;

-- start | done (worker) · confirm | problem (customer) · cancel (either, before work starts) · decline (worker)
create function public.job_action(p_job uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; v_to public.job_status; is_worker boolean; is_customer boolean;
begin
  select * into j from public.jobs where id = p_job for update;
  if j.id is null or auth.uid() not in (j.customer_id, j.worker_id) then raise exception 'NOT_FOUND'; end if;
  is_worker := auth.uid() = j.worker_id; is_customer := auth.uid() = j.customer_id;
  v_to := case
    when p_action = 'start'   and is_worker   and j.status = 'confirmed' then 'in_progress'
    when p_action = 'done'    and is_worker   and j.status = 'in_progress' then 'awaiting_confirmation'
    when p_action = 'confirm' and is_customer and j.status = 'awaiting_confirmation' then 'completed'
    when p_action = 'problem' and is_customer and j.status = 'awaiting_confirmation' then 'disputed'
    when p_action = 'decline' and is_worker   and j.status in ('requested','quoted') then 'cancelled'
    when p_action = 'cancel'  and j.status in ('requested','quoted','confirmed') then 'cancelled'
    else null end;
  if v_to is null then raise exception 'INVALID_TRANSITION'; end if;
  if v_to = 'cancelled' then update public.job_quotes set status = 'expired' where job_id = p_job and status = 'pending'; end if;
  update public.jobs set status = v_to, version = version + 1, updated_at = now() where id = p_job;
  perform public._history(p_job, j.status, v_to);
end $$;

create function public.submit_review(p_job uuid, p_rating int, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_job;
  if j.id is null or j.customer_id <> auth.uid() then raise exception 'NOT_FOUND'; end if;
  if j.status <> 'completed' then raise exception 'INVALID_TRANSITION'; end if;
  insert into public.reviews (job_id, worker_id, customer_id, rating, comment)
    values (p_job, j.worker_id, j.customer_id, p_rating, nullif(trim(p_comment),''));
exception when unique_violation then raise exception 'ALREADY_REVIEWED';
end $$;

-- Only signed-in users may call functions; internal helpers are not callable by clients
revoke execute on all functions in schema public from public, anon;
grant execute on function public.choose_role, public.complete_onboarding, public.set_availability, public.search_workers,
  public.create_job_request, public.send_quote, public.respond_quote, public.job_action, public.submit_review to authenticated;
revoke execute on function public._history, public.handle_new_user from authenticated;
grant execute on function public.is_participant to authenticated;

-- ============ Seed reference data (no fake people) ============
insert into public.service_categories (id, slug, name_en, name_ur, sort) values
  (1,'electrician','Electrician','الیکٹریشن',1),(2,'plumber','Plumber','پلمبر',2),(3,'ac-technician','AC technician','اے سی ٹیکنیشن',3),
  (4,'mechanic','Mechanic','مکینک',4),(5,'carpenter','Carpenter','بڑھئی',5),(6,'painter','Painter','پینٹر',6);
insert into public.service_areas (id, city, name_en, name_ur) values
  (1,'Lahore','Gulberg','گلبرگ'),(2,'Lahore','Model Town','ماڈل ٹاؤن'),(3,'Lahore','Johar Town','جوہر ٹاؤن'),
  (4,'Lahore','DHA','ڈیفنس'),(5,'Lahore','Iqbal Town','اقبال ٹاؤن'),(6,'Lahore','Garden Town','گارڈن ٹاؤن'),
  (7,'Lahore','Township','ٹاؤن شپ'),(8,'Lahore','Wapda Town','واپڈا ٹاؤن'),(9,'Lahore','Samanabad','سمن آباد'),(10,'Lahore','Cantt','کینٹ');

-- ============ Migration 2 (2026-11-10): offline workers are hidden and not requestable ============
create or replace function public.search_workers(p_category smallint default null, p_area smallint default null)
returns table (worker_id uuid, display_name text, years_experience smallint, visit_fee_from int, availability text,
               rating numeric, review_count bigint, completed_jobs bigint)
language sql stable security definer set search_path = '' as $$
  select * from (
    select p.id, p.display_name, w.years_experience, w.visit_fee_from,
      case when exists (select 1 from public.jobs j where j.worker_id = p.id and j.status in ('confirmed','in_progress','awaiting_confirmation'))
           then 'busy' else w.manual_availability end as availability,
      (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.worker_id = p.id) as rating,
      (select count(*) from public.reviews r where r.worker_id = p.id) as review_count,
      (select count(*) from public.jobs j where j.worker_id = p.id and j.status = 'completed') as completed_jobs
    from public.profiles p join public.worker_profiles w on w.user_id = p.id
    where w.onboarded_at is not null
      and (p_category is null or exists (select 1 from public.worker_services s where s.worker_id = p.id and s.category_id = p_category))
      and (p_area is null or exists (select 1 from public.worker_areas a where a.worker_id = p.id and a.area_id = p_area))
  ) x
  where x.availability <> 'offline'
  order by case x.availability when 'available' then 0 else 1 end, x.rating desc nulls last, x.completed_jobs desc;
$$;

create or replace function public.create_job_request(p_worker uuid, p_category smallint, p_area smallint, p_problem text, p_address text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'customer') then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.worker_services where worker_id = p_worker and category_id = p_category) then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.worker_profiles where user_id = p_worker and manual_availability = 'offline') then raise exception 'WORKER_OFFLINE'; end if;
  begin
    insert into public.jobs (customer_id, worker_id, category_id, area_id, problem)
      values (auth.uid(), p_worker, p_category, p_area, trim(p_problem)) returning id into v_id;
  exception when unique_violation then raise exception 'OPEN_REQUEST_EXISTS';
  end;
  insert into public.job_private (job_id, address) values (v_id, trim(p_address));
  perform public._history(v_id, null, 'requested');
  return v_id;
end $$;

revoke execute on function public.search_workers, public.create_job_request from public, anon;
grant execute on function public.search_workers, public.create_job_request to authenticated;

-- ============ Migration 3: profile edits keep the worker's chosen availability ============
create or replace function public.complete_onboarding(p_name text, p_years int, p_fee int, p_categories smallint[], p_areas smallint[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'worker') then raise exception 'FORBIDDEN'; end if;
  if coalesce(array_length(p_categories,1),0) not between 1 and 6 or coalesce(array_length(p_areas,1),0) not between 1 and 10
     or char_length(trim(coalesce(p_name,''))) not between 1 and 80 then
    raise exception 'VALIDATION_FAILED'; end if;
  update public.profiles set display_name = trim(p_name) where id = auth.uid();
  -- first-time onboarding makes the worker available; later edits keep their chosen status
  update public.worker_profiles set years_experience = p_years, visit_fee_from = p_fee,
    manual_availability = case when onboarded_at is null then 'available' else manual_availability end,
    onboarded_at = coalesce(onboarded_at, now())
  where user_id = auth.uid();
  delete from public.worker_services where worker_id = auth.uid();
  insert into public.worker_services select auth.uid(), unnest(p_categories);
  delete from public.worker_areas where worker_id = auth.uid();
  insert into public.worker_areas select auth.uid(), unnest(p_areas);
end $$;
