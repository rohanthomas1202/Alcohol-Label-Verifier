export interface ApplicationData {
  brandName: string
  classType: string
  alcoholContent: string
  netContents: string
  governmentWarning?: string
  producerName?: string
  countryOfOrigin?: string
}

export interface ExtractedFields {
  brand_name: string | null
  class_type: string | null
  alcohol_content: string | null
  net_contents: string | null
  producer_name: string | null
  country_of_origin: string | null
  government_warning_text: string | null
  government_warning_prefix_caps: boolean
  government_warning_prefix_bold: boolean
  image_quality_issues: string[]
}

export type FieldStatus = 'match' | 'mismatch' | 'review' | 'not_found'
export type OverallStatus = 'approved' | 'review' | 'rejected'

export interface FieldResult {
  fieldName: string
  applicationValue: string
  labelValue: string | null
  status: FieldStatus
  notes?: string
}

export interface VerificationResponse {
  overallStatus: OverallStatus
  fields: FieldResult[]
  imageQualityIssues: string[]
  processingMs: number
}

export interface VerifyRequest {
  applicationData: ApplicationData
  imageBase64: string
}
