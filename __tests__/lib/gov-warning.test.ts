import { describe, it, expect } from 'vitest'
import {
  checkGovernmentWarning,
  isGovWarningCompliant,
  STANDARD_TTB_WARNING,
} from '@/lib/gov-warning'

describe('checkGovernmentWarning', () => {
  it('passes for exact match with proper caps and bold', () => {
    const result = checkGovernmentWarning(STANDARD_TTB_WARNING, STANDARD_TTB_WARNING, true, true)
    expect(isGovWarningCompliant(result)).toBe(true)
    expect(result.notes).toHaveLength(0)
  })

  it('fails when extracted text is null', () => {
    const result = checkGovernmentWarning(STANDARD_TTB_WARNING, null, false, false)
    expect(isGovWarningCompliant(result)).toBe(false)
    expect(result.notes[0]).toMatch(/not found/i)
  })

  it('fails when prefix is not all-caps', () => {
    const result = checkGovernmentWarning(STANDARD_TTB_WARNING, STANDARD_TTB_WARNING, false, true)
    expect(isGovWarningCompliant(result)).toBe(false)
    expect(result.prefixCapsCorrect).toBe(false)
    expect(result.notes.some(n => /all capitals/i.test(n))).toBe(true)
  })

  it('fails when prefix is not bold', () => {
    const result = checkGovernmentWarning(STANDARD_TTB_WARNING, STANDARD_TTB_WARNING, true, false)
    expect(isGovWarningCompliant(result)).toBe(false)
    expect(result.prefixBoldCorrect).toBe(false)
  })

  it('normalizes extra whitespace before comparing', () => {
    const extraSpaces = STANDARD_TTB_WARNING.replace(/\s+/g, '  ')
    const result = checkGovernmentWarning(STANDARD_TTB_WARNING, extraSpaces, true, true)
    expect(result.textMatch).toBe(true)
  })

  it('fails when warning text is different', () => {
    const result = checkGovernmentWarning(
      STANDARD_TTB_WARNING,
      'GOVERNMENT WARNING: Different text.',
      true,
      true
    )
    expect(result.textMatch).toBe(false)
    expect(isGovWarningCompliant(result)).toBe(false)
  })
})
