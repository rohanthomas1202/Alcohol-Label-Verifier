'use client'
import { useCallback, useState } from 'react'

interface Props {
  onImage: (base64: string) => void
  disabled?: boolean
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE_MB = 5

export function LabelUpload({ onImage, disabled }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Please upload a JPEG, PNG, WebP, or GIF image')
        return
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`Image must be under ${MAX_SIZE_MB}MB`)
        return
      }
      setError(null)
      const reader = new FileReader()
      reader.onload = e => {
        const dataUrl = e.target?.result as string
        setPreview(dataUrl)
        onImage(dataUrl)
      }
      reader.readAsDataURL(file)
    },
    [onImage]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Label Image <span className="text-red-500">*</span>
      </label>
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !disabled && document.getElementById('label-file-input')?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors min-h-[120px] flex items-center justify-center ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {preview ? (
          <img src={preview} alt="Label preview" className="max-h-48 max-w-full object-contain" />
        ) : (
          <div className="text-gray-400">
            <div className="text-3xl mb-2">📎</div>
            <div className="text-sm">Drop label image here or click to browse</div>
            <div className="text-xs mt-1">JPEG, PNG, WebP up to 5MB</div>
          </div>
        )}
      </div>
      <input
        id="label-file-input"
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        disabled={disabled}
        onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}
