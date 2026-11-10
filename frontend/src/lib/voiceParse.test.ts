import { describe, expect, it } from 'vitest'
import { normalise, parseProfile, yearsToRange, type ParseRef } from './voiceParse'

const ref: ParseRef = {
  areas: [
    { id: 1, name_en: 'Gulberg', name_ur: 'گلبرگ' }, { id: 2, name_en: 'Model Town', name_ur: 'ماڈل ٹاؤن' },
    { id: 3, name_en: 'Johar Town', name_ur: 'جوہر ٹاؤن' }, { id: 4, name_en: 'DHA', name_ur: 'ڈی ایچ اے' },
    { id: 10, name_en: 'Cantt', name_ur: 'کینٹ' },
  ],
  categories: [
    { id: 1, slug: 'electrician', name_en: 'Electrician', name_ur: 'الیکٹریشن' },
    { id: 2, slug: 'plumber', name_en: 'Plumber', name_ur: 'پلمبر' },
    { id: 3, slug: 'ac-technician', name_en: 'AC technician', name_ur: 'اے سی ٹیکنیشن' },
  ],
}

describe('parseProfile', () => {
  it('reads the Figma example in Urdu script', () => {
    const r = parseProfile('میرا نام احمد علی ہے، 8 سال سے کام کر رہا ہوں، گلبرگ اور ماڈل ٹاؤن میں۔', ref)
    expect(r.name).toBe('احمد علی')
    expect(r.years).toBe(8)
    expect(r.areaIds.sort()).toEqual([1, 2])
  })
  it('reads Urdu number words and Urdu digits', () => {
    expect(parseProfile('میں پانچ سال سے کام کرتا ہوں', ref).years).toBe(4)
    expect(parseProfile('۱۲ سال کا تجربہ ہے', ref).years).toBe(12)
  })
  it('reads Roman Urdu', () => {
    const r = parseProfile('mera naam bilal hai, 3 saal se plumber ka kaam karta hoon johar town aur defence mein', ref)
    expect(r.name).toBe('Bilal')
    expect(r.years).toBe(4)
    expect(r.areaIds.sort()).toEqual([3, 4])
    expect(r.categoryIds).toEqual([2])
  })
  it('reads English', () => {
    const r = parseProfile('My name is Imran Khalid and I have worked 15 years as an electrician in Cantt, fee 500 rupees', ref)
    expect(r.name).toBe('Imran Khalid')
    expect(r.years).toBe(12)
    expect(r.areaIds).toEqual([10])
    expect(r.categoryIds).toEqual([1])
    expect(r.fee).toBe(500)
  })
  it('returns nulls/empty instead of guessing when nothing matches', () => {
    expect(parseProfile('hello there', ref)).toEqual({ name: null, years: null, areaIds: [], categoryIds: [], fee: null })
  })
  it('does not match area names inside other words', () => {
    expect(parseProfile('the tradesman', ref).areaIds).toEqual([])
  })
})

describe('helpers', () => {
  it('maps years to the stored ranges', () => {
    expect([1, 2, 3, 5, 6, 10, 11, 30].map(yearsToRange)).toEqual([1, 1, 4, 4, 8, 8, 12, 12])
  })
  it('normalises Urdu digits and punctuation', () => {
    expect(normalise('۸ سال، گلبرگ۔')).toBe('8 سال گلبرگ')
  })
})
