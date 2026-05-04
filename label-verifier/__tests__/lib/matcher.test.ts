import { describe, it, expect } from 'vitest'
import { matchFields } from '@/lib/matcher'
import type { ApplicationData, ExtractedFields } from '@/types'
import { STANDARD_TTB_WARNING } from '@/lib/gov-warning'

const BASE_APP: ApplicationData = {
  brandName: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  alcoholContent: '45% Alc./Vol. (90 Proof)',
  netContents: '750 mL',
}

const BASE_EXTRACTED: ExtractedFields = {
  brand_name: 'OLD TOM DISTILLERY',
  class_type: 'Kentucky Straight Bourbon Whiskey',
  alcohol_content: '45% Alc./Vol. (90 Proof)',
  net_contents: '750 mL',
  producer_name: null,
  country_of_origin: null,
  government_warning_text: STANDARD_TTB_WARNING,
  government_warning_prefix_caps: true,
  government_warning_prefix_bold: true,
  image_quality_issues: [],
}

describe('matchFields', () => {
  it('returns approved when all fields match', () => {
    const result = matchFields(BASE_APP, BASE_EXTRACTED)
    expect(result.overallStatus).toBe('approved')
    expect(result.fields.every(f => f.status === 'match')).toBe(true)
  })

  it("normalizes brand name case — STONE'S THROW matches Stone's Throw", () => {
    const app = { ...BASE_APP, brandName: "Stone's Throw" }
    const ext = { ...BASE_EXTRACTED, brand_name: "STONE'S THROW" }
    const field = matchFields(app, ext).fields.find(f => f.fieldName === 'Brand Name')!
    expect(field.status).toBe('match')
  })

  it('returns rejected when brand name differs', () => {
    const ext = { ...BASE_EXTRACTED, brand_name: 'DIFFERENT DISTILLERY' }
    expect(matchFields(BASE_APP, ext).overallStatus).toBe('rejected')
  })

  it('matches alcohol content numerically — 45% matches 45.0% Alc./Vol.', () => {
    const app = { ...BASE_APP, alcoholContent: '45%' }
    const ext = { ...BASE_EXTRACTED, alcohol_content: '45.0% Alc./Vol.' }
    const field = matchFields(app, ext).fields.find(f => f.fieldName === 'Alcohol Content')!
    expect(field.status).toBe('match')
  })

  it('rejects when alcohol content differs', () => {
    const ext = { ...BASE_EXTRACTED, alcohol_content: '46%' }
    expect(matchFields(BASE_APP, ext).overallStatus).toBe('rejected')
  })

  it('matches net contents ignoring whitespace — 750mL matches 750 mL', () => {
    const app = { ...BASE_APP, netContents: '750mL' }
    const ext = { ...BASE_EXTRACTED, net_contents: '750 mL' }
    const field = matchFields(app, ext).fields.find(f => f.fieldName === 'Net Contents')!
    expect(field.status).toBe('match')
  })

  it('returns rejected when government warning text differs', () => {
    const ext = { ...BASE_EXTRACTED, government_warning_text: 'Wrong warning.' }
    const result = matchFields(BASE_APP, ext)
    expect(result.overallStatus).toBe('rejected')
    expect(result.fields.find(f => f.fieldName === 'Government Warning')!.status).toBe('mismatch')
  })

  it('returns rejected when government warning prefix is not all-caps', () => {
    const ext = { ...BASE_EXTRACTED, government_warning_prefix_caps: false }
    expect(matchFields(BASE_APP, ext).overallStatus).toBe('rejected')
  })

  it('returns review when a field is not found on label', () => {
    const ext = { ...BASE_EXTRACTED, brand_name: null }
    const result = matchFields(BASE_APP, ext)
    expect(result.overallStatus).toBe('review')
    expect(result.fields.find(f => f.fieldName === 'Brand Name')!.status).toBe('not_found')
  })

  it('returns review when image has quality issues', () => {
    const ext = { ...BASE_EXTRACTED, image_quality_issues: ['glare'] }
    const result = matchFields(BASE_APP, ext)
    expect(result.overallStatus).toBe('review')
    expect(result.imageQualityIssues).toContain('glare')
  })

  it('uses standard TTB warning when not provided in application', () => {
    const field = matchFields(BASE_APP, BASE_EXTRACTED).fields.find(f => f.fieldName === 'Government Warning')!
    expect(field.status).toBe('match')
  })

  it('includes optional fields when provided', () => {
    const app = { ...BASE_APP, producerName: 'Tom Distillery LLC', countryOfOrigin: 'USA' }
    const ext = { ...BASE_EXTRACTED, producer_name: 'Tom Distillery LLC', country_of_origin: 'USA' }
    const result = matchFields(app, ext)
    expect(result.fields.some(f => f.fieldName === 'Producer Name')).toBe(true)
    expect(result.fields.some(f => f.fieldName === 'Country of Origin')).toBe(true)
    expect(result.overallStatus).toBe('approved')
  })
})
