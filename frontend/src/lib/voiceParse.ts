/**
 * Deterministic (non-AI) extraction of worker profile fields from a spoken sentence.
 * Works on Urdu script, Roman Urdu and English. Used until the Claude extraction endpoint
 * is configured; the worker always checks and confirms the result before it is saved.
 */

export type ParseRef = {
  areas: { id: number; name_en: string; name_ur: string }[]
  categories: { id: number; slug: string; name_en: string; name_ur: string }[]
}
export type ParsedProfile = { name: string | null; years: number | null; areaIds: number[]; categoryIds: number[]; fee: number | null }

const URDU_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

const NUMBER_WORDS: [RegExp, number][] = [
  [/\b(ek|one)\b|ایک/u, 1], [/\b(do|two)\b|(^|\s)دو(\s|$)/u, 2], [/\b(teen|tin|three)\b|تین/u, 3], [/\b(char|chaar|four)\b|چار/u, 4],
  [/\b(panch|paanch|five)\b|پانچ/u, 5], [/\b(chay|chhe|che|six)\b|چھ/u, 6], [/\b(saat|sat|seven)\b|سات/u, 7], [/\b(aath|aat|eight)\b|آٹھ/u, 8],
  [/\b(nau|no|nine)\b|(^|\s)نو(\s|$)/u, 9], [/\b(das|ten)\b|(^|\s)دس(\s|$)/u, 10], [/\b(barah|bara|twelve)\b|بارہ/u, 12], [/\b(pandrah|fifteen)\b|پندرہ/u, 15],
  [/\b(bees|twenty)\b|بیس/u, 20],
]
const YEAR_WORD = /(saal|sal|years?|yrs?|baras|برس|سال)/u

/** Extra spoken forms for seeded Lahore areas and trades (matched in addition to the DB names). */
const AREA_ALIASES: Record<string, string[]> = {
  gulberg: ['gulbarg', 'گلبرگ'], 'model town': ['modeltown', 'ماڈل ٹاؤن', 'ماڈل ٹاون'], 'johar town': ['johar', 'جوہر ٹاؤن', 'جوہر'],
  dha: ['defence', 'defense', 'ڈیفنس', 'ڈی ایچ اے'], 'iqbal town': ['اقبال ٹاؤن', 'iqbal'], 'garden town': ['گارڈن ٹاؤن', 'garden'],
  township: ['ٹاؤن شپ', 'ٹاؤنشپ'], 'wapda town': ['wapda', 'واپڈا'], samanabad: ['سمن آباد'], cantt: ['cantonment', 'کینٹ', 'چھاؤنی'],
}
const TRADE_ALIASES: Record<string, string[]> = {
  electrician: ['bijli', 'بجلی', 'electric', 'wiring'], plumber: ['nalka', 'پانی', 'پائپ', 'pipe'], 'ac-technician': ['ac', 'اے سی', 'air condition'],
  mechanic: ['mistri', 'گاڑی', 'gari', 'car'], carpenter: ['tarkhan', 'ترکھان', 'بڑھئی', 'lakri', 'لکڑی'], painter: ['rang', 'رنگ', 'paint'],
}

export function normalise(text: string) {
  let t = text.toLowerCase()
  for (let i = 0; i < 10; i++) t = t.replaceAll(URDU_DIGITS[i], String(i)).replaceAll(ARABIC_DIGITS[i], String(i))
  return t.replace(/[،۔,.!?؟"“”]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Map a spoken number of years to the stored range value used by the app (1 / 4 / 8 / 12). */
export function yearsToRange(n: number) {
  if (n <= 2) return 1
  if (n <= 5) return 4
  if (n <= 10) return 8
  return 12
}

function findYears(t: string): number | null {
  // "8 saal", "saal 8", "8 years", "آٹھ سال"
  const digit = t.match(new RegExp(`(\\d{1,2})\\s*${YEAR_WORD.source}`, 'u')) ?? t.match(new RegExp(`${YEAR_WORD.source}\\s*(?:se\\s*)?(\\d{1,2})`, 'u'))
  if (digit) { const n = Number(digit[1].match(/\d+/)?.[0] ?? digit[2]); if (n > 0 && n < 60) return n }
  const m = t.match(new RegExp(`(\\S+)\\s*${YEAR_WORD.source}`, 'u'))
  if (m) for (const [re, n] of NUMBER_WORDS) if (re.test(m[1])) return n
  return null
}

function findName(original: string): string | null {
  const t = original.replace(/[،۔,.!?؟"“”]/g, ' ').replace(/\s+/g, ' ').trim()
  const patterns = [
    /میرا نام\s+(.+?)\s+(?:ہے|ہیں)/u,
    /نام\s+(.+?)\s+(?:ہے|ہیں)/u,
    /mera naam\s+(.+?)\s+(?:hai|he|hay)\b/i,
    /naam\s+(.+?)\s+(?:hai|he|hay)\b/i,
    /my name is\s+([a-z][a-z' -]+?)(?:\s+(?:and|i|i've|i'm|from|work)\b|$)/i,
    /(?:main|mein|i am|i'm)\s+([a-z][a-z' ]+?)\s+(?:hoon|hun|here)\b/i,
  ]
  for (const p of patterns) {
    const m = t.match(p)
    if (m) {
      const words = m[1].trim().split(' ').slice(0, 3)
      const name = words.join(' ').replace(/\b(sahab|sahib)\b/i, '').trim()
      if (name.length >= 2) return name.replace(/\b[a-z]/g, (c) => c.toUpperCase())
    }
  }
  return null
}

function findFee(t: string): number | null {
  const m = t.match(/(\d{3,5})\s*(rupay|rupees|rupee|rs|روپے|روپیہ)/u) ?? t.match(/(?:rs|fee|فیس)\s*(\d{3,5})/u)
  if (!m) return null
  const n = Number(m[1])
  return [300, 500, 800, 1000].reduce((best, f) => (Math.abs(f - n) < Math.abs(best - n) ? f : best), 500)
}

export function parseProfile(text: string, ref: ParseRef): ParsedProfile {
  const t = normalise(text)
  const has = (needle: string) => {
    const n = normalise(needle)
    if (!n) return false
    return /^[a-z ]+$/.test(n) ? new RegExp(`\\b${n}\\b`).test(t) : t.includes(n)
  }
  const areaIds = ref.areas.filter((a) => [a.name_en, a.name_ur, ...(AREA_ALIASES[a.name_en.toLowerCase()] ?? [])].some(has)).map((a) => a.id)
  const categoryIds = ref.categories.filter((c) => [c.name_en, c.name_ur, ...(TRADE_ALIASES[c.slug] ?? [])].some(has)).map((c) => c.id)
  const years = findYears(t)
  return { name: findName(text), years: years === null ? null : yearsToRange(years), areaIds, categoryIds, fee: findFee(t) }
}
