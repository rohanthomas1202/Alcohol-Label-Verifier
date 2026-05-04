export const STANDARD_TTB_WARNING =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.'

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export interface GovWarningCheckResult {
  textMatch: boolean
  prefixCapsCorrect: boolean
  prefixBoldCorrect: boolean
  notes: string[]
}

export function checkGovernmentWarning(
  expectedText: string,
  extractedText: string | null,
  prefixCaps: boolean,
  prefixBold: boolean
): GovWarningCheckResult {
  if (extractedText === null) {
    return {
      textMatch: false,
      prefixCapsCorrect: false,
      prefixBoldCorrect: false,
      notes: ['Government warning not found on label'],
    }
  }

  const textMatch = normalizeWhitespace(expectedText) === normalizeWhitespace(extractedText)
  const notes: string[] = []
  if (!textMatch) notes.push('Warning text does not match required TTB language')
  if (!prefixCaps) notes.push('"GOVERNMENT WARNING:" must be in all capitals')
  if (!prefixBold) notes.push('"GOVERNMENT WARNING:" must be bold/prominent')

  return { textMatch, prefixCapsCorrect: prefixCaps, prefixBoldCorrect: prefixBold, notes }
}

export function isGovWarningCompliant(result: GovWarningCheckResult): boolean {
  return result.textMatch && result.prefixCapsCorrect && result.prefixBoldCorrect
}
