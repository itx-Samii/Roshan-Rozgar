import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export type Profile = { id: string; role: 'customer' | 'worker' | null; display_name: string; preferred_lang: 'ur' | 'en' }

const Ctx = createContext<{ session: Session | null; ready: boolean }>({ session: null, ready: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const qc = useQueryClient()
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); qc.invalidateQueries() })
    return () => data.subscription.unsubscribe()
  }, [qc])
  return <Ctx.Provider value={{ session, ready }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

export function useProfile() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['profile', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, role, display_name, preferred_lang').eq('id', session!.user.id).single()
      if (error) throw error
      return data as Profile
    },
  })
}
