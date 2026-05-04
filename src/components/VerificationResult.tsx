import type { FieldResult, FieldStatus, VerificationResponse } from '@/types'

const FIELD_STATUS_STYLE: Record<FieldStatus, { bg: string; text: string; icon: string; label: string }> = {
  match:     { bg: 'bg-green-50',  text: 'text-green-700',  icon: '✓', label: 'Match' },
  mismatch:  { bg: 'bg-red-50',    text: 'text-red-700',    icon: '✗', label: 'Mismatch' },
  review:    { bg: 'bg-yellow-50', text: 'text-yellow-700', icon: '⚠', label: 'Review' },
  not_found: { bg: 'bg-gray-50',   text: 'text-gray-500',   icon: '?', label: 'Not found' },
}

const OVERALL_STYLE = {
  approved: { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-800', label: '✅ APPROVED' },
  review:   { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-800', label: '⚠️ REVIEW REQUIRED' },
  rejected: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-800', label: '❌ REJECTED' },
}

function FieldRow({ field }: { field: FieldResult }) {
  const s = FIELD_STATUS_STYLE[field.status]
  return (
    <div className={`${s.bg} rounded-md p-3 mb-2 last:mb-0`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{field.fieldName}</span>
        <span className={`text-xs font-bold ${s.text}`}>{s.icon} {s.label}</span>
      </div>
      <div className="text-xs text-gray-500 space-y-0.5">
        <div><span className="font-medium">Submitted:</span> {field.applicationValue || '—'}</div>
        <div><span className="font-medium">On label:</span> {field.labelValue ?? 'not found'}</div>
        {field.notes && <div className={`${s.text} font-medium mt-1`}>{field.notes}</div>}
      </div>
    </div>
  )
}

export function VerificationResult({ result }: { result: VerificationResponse }) {
  const o = OVERALL_STYLE[result.overallStatus]
  const matchCount = result.fields.filter(f => f.status === 'match').length

  return (
    <div>
      <div className={`${o.bg} ${o.border} border rounded-lg p-4 mb-4`}>
        <div className={`text-lg font-bold ${o.text}`}>{o.label}</div>
        <div className="text-sm text-gray-600 mt-1">
          {matchCount}/{result.fields.length} fields match · {result.processingMs}ms
        </div>
        {result.imageQualityIssues.length > 0 && (
          <div className="text-xs text-yellow-700 mt-1">
            Image issues detected: {result.imageQualityIssues.join(', ')}
          </div>
        )}
      </div>
      <div>
        {result.fields.map(field => <FieldRow key={field.fieldName} field={field} />)}
      </div>
    </div>
  )
}
