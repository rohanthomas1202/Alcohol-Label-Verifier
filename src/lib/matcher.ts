import type { ApplicationData, ExtractedFields, FieldResult, FieldStatus, OverallStatus, VerificationResponse } from '@/types'
import { STANDARD_TTB_WARNING, checkGovernmentWarning, isGovWarningCompliant } from './gov-warning'

function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[‘’‚‛′‵]/g, "'")
    .replace(/[–—]/g, '-')
}

function parseVolumeMl(s: string): number | null {
  const n = s.toLowerCase().replace(/\s+/g, '')
  const ml = n.match(/^(\d+(?:\.\d+)?)ml$/)
  if (ml) return parseFloat(ml[1])
  const l = n.match(/^(\d+(?:\.\d+)?)l$/)
  if (l) return parseFloat(l[1]) * 1000
  const oz = n.match(/^(\d+(?:\.\d+)?)(?:floz|oz)$/)
  if (oz) return parseFloat(oz[1]) * 29.5735
  return null
}

function parseAlcoholPercent(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/)
  return m ? parseFloat(m[1]) : null
}

function compareNormalized(app: string, label: string | null): FieldStatus {
  if (label === null) return 'not_found'
  return normalizeString(app) === normalizeString(label) ? 'match' : 'mismatch'
}

function compareVolume(app: string, label: string | null): { status: FieldStatus; notes?: string } {
  if (label === null) return { status: 'not_found' }
  const av = parseVolumeMl(app)
  const lv = parseVolumeMl(label)
  if (av === null || lv === null) {
    const status = compareNormalized(app, label)
    return { status, notes: status !== 'match' ? 'Could not parse as volume, used text comparison' : undefined }
  }
  return { status: Math.abs(av - lv) < 0.01 ? 'match' : 'mismatch' }
}

function compareAlcohol(app: string, label: string | null): { status: FieldStatus; notes?: string } {
  if (label === null) return { status: 'not_found' }
  const av = parseAlcoholPercent(app)
  const lv = parseAlcoholPercent(label)
  if (av === null || lv === null) {
    const status = compareNormalized(app, label)
    return { status, notes: 'Could not parse as percentage, used text comparison' }
  }
  return { status: Math.abs(av - lv) < 0.01 ? 'match' : 'mismatch' }
}

export function matchFields(app: ApplicationData, extracted: ExtractedFields): VerificationResponse {
  const start = Date.now()
  const fields: FieldResult[] = []

  fields.push({
    fieldName: 'Brand Name',
    applicationValue: app.brandName,
    labelValue: extracted.brand_name,
    status: compareNormalized(app.brandName, extracted.brand_name),
  })

  fields.push({
    fieldName: 'Class / Type',
    applicationValue: app.classType,
    labelValue: extracted.class_type,
    status: compareNormalized(app.classType, extracted.class_type),
  })

  const alcResult = compareAlcohol(app.alcoholContent, extracted.alcohol_content)
  fields.push({
    fieldName: 'Alcohol Content',
    applicationValue: app.alcoholContent,
    labelValue: extracted.alcohol_content,
    status: alcResult.status,
    notes: alcResult.notes,
  })

  const netResult = compareVolume(app.netContents, extracted.net_contents)
  fields.push({
    fieldName: 'Net Contents',
    applicationValue: app.netContents,
    labelValue: extracted.net_contents,
    status: netResult.status,
    notes: netResult.notes,
  })

  if (app.producerName) {
    fields.push({
      fieldName: 'Producer Name',
      applicationValue: app.producerName,
      labelValue: extracted.producer_name,
      status: compareNormalized(app.producerName, extracted.producer_name),
    })
  }

  if (app.countryOfOrigin) {
    fields.push({
      fieldName: 'Country of Origin',
      applicationValue: app.countryOfOrigin,
      labelValue: extracted.country_of_origin,
      status: compareNormalized(app.countryOfOrigin, extracted.country_of_origin),
    })
  }

  const expectedWarning = app.governmentWarning ?? STANDARD_TTB_WARNING
  const warningCheck = checkGovernmentWarning(
    expectedWarning,
    extracted.government_warning_text,
    extracted.government_warning_prefix_caps,
    extracted.government_warning_prefix_bold
  )
  fields.push({
    fieldName: 'Government Warning',
    applicationValue: expectedWarning,
    labelValue: extracted.government_warning_text,
    status: isGovWarningCompliant(warningCheck) ? 'match' : 'mismatch',
    notes: warningCheck.notes.length > 0 ? warningCheck.notes.join('; ') : undefined,
  })

  const hasMismatch = fields.some(f => f.status === 'mismatch')
  const hasReviewable = fields.some(f => f.status === 'not_found' || f.status === 'review')
  const hasImageIssues = extracted.image_quality_issues.length > 0

  const overallStatus: OverallStatus = hasMismatch ? 'rejected'
    : hasReviewable || hasImageIssues ? 'review'
    : 'approved'

  return { overallStatus, fields, imageQualityIssues: extracted.image_quality_issues, processingMs: Date.now() - start }
}
