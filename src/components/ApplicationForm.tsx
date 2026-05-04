'use client'
import type { ApplicationData } from '@/types'

interface Props {
  value: ApplicationData
  onChange: (data: ApplicationData) => void
  disabled?: boolean
}

const fields: Array<{ key: keyof ApplicationData; label: string; placeholder: string; required?: boolean }> = [
  { key: 'brandName', label: 'Brand Name', placeholder: 'e.g. OLD TOM DISTILLERY', required: true },
  { key: 'classType', label: 'Class / Type', placeholder: 'e.g. Kentucky Straight Bourbon Whiskey', required: true },
  { key: 'alcoholContent', label: 'Alcohol Content', placeholder: 'e.g. 45% Alc./Vol. (90 Proof)', required: true },
  { key: 'netContents', label: 'Net Contents', placeholder: 'e.g. 750 mL', required: true },
  { key: 'producerName', label: 'Producer Name', placeholder: 'Optional' },
  { key: 'countryOfOrigin', label: 'Country of Origin', placeholder: 'Optional — for imports' },
]

export function ApplicationForm({ value, onChange, disabled }: Props) {
  const update = (key: keyof ApplicationData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, [key]: e.target.value })
  }

  return (
    <div className="space-y-3">
      {fields.map(({ key, label, placeholder, required }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <input
            value={(value[key] as string) ?? ''}
            onChange={update(key)}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
      ))}
    </div>
  )
}
