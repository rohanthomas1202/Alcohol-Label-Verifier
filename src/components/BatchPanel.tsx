'use client'
import { useCallback, useRef, useState } from 'react'
import type { ApplicationData, OverallStatus, VerificationResponse } from '@/types'
import { parseCSVRows, buildCSVRow } from '@/lib/csv'

const CSV_TEMPLATE =
  'id,image_filename,brand_name,class_type,alcohol_content,net_contents,producer_name,country_of_origin\n' +
  '001,label_001.jpg,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol. (90 Proof),750 mL,,\n'

interface BatchRow {
  id: string
  imageFilename: string
  applicationData: ApplicationData
  imageFile: File | null
  status: 'pending' | 'processing' | 'done' | 'error'
  result?: VerificationResponse
  error?: string
}

function parseCSV(text: string): Array<{ id: string; imageFilename: string } & ApplicationData> {
  const rows = parseCSVRows(text)
  if (rows.length < 2) return []
  const headers = rows[0]
  return rows.slice(1).map(values => {
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return {
      id: row.id ?? '',
      imageFilename: row.image_filename ?? '',
      brandName: row.brand_name ?? '',
      classType: row.class_type ?? '',
      alcoholContent: row.alcohol_content ?? '',
      netContents: row.net_contents ?? '',
      producerName: row.producer_name || undefined,
      countryOfOrigin: row.country_of_origin || undefined,
    }
  })
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function verifyOne(applicationData: ApplicationData, imageFile: File): Promise<VerificationResponse> {
  const imageBase64 = await readFileAsDataURL(imageFile)
  const res = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applicationData, imageBase64 }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Verification failed')
  return data as VerificationResponse
}

async function runConcurrent(
  tasks: Array<() => Promise<VerificationResponse>>,
  concurrency: number,
  onResult: (index: number, result: VerificationResponse | Error) => void
): Promise<void> {
  let next = 0
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const i = next++
      try { onResult(i, await tasks[i]()) }
      catch (e) { onResult(i, e instanceof Error ? e : new Error(String(e))) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
}

const BADGE: Record<OverallStatus, string> = {
  approved: '✅', review: '⚠️', rejected: '❌'
}
const CARD_BG: Record<OverallStatus, string> = {
  approved: 'border-green-200 bg-green-50',
  review: 'border-yellow-200 bg-yellow-50',
  rejected: 'border-red-200 bg-red-50',
}

export function BatchPanel() {
  const [rows, setRows] = useState<BatchRow[]>([])
  const [running, setRunning] = useState(false)
  const [filter, setFilter] = useState<'all' | OverallStatus>('all')
  const imageMap = useRef<Map<string, File>>(new Map())

  const loadCSV = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const parsed = parseCSV(e.target?.result as string)
      setRows(parsed.map(p => ({
        id: p.id,
        imageFilename: p.imageFilename,
        applicationData: {
          brandName: p.brandName,
          classType: p.classType,
          alcoholContent: p.alcoholContent,
          netContents: p.netContents,
          producerName: p.producerName,
          countryOfOrigin: p.countryOfOrigin,
        },
        imageFile: imageMap.current.get(p.imageFilename) ?? null,
        status: 'pending' as const,
      })))
    }
    reader.readAsText(file)
  }, [])

  const loadImages = useCallback((files: FileList) => {
    Array.from(files).forEach(f => imageMap.current.set(f.name, f))
    setRows(prev =>
      prev.map(row => ({ ...row, imageFile: imageMap.current.get(row.imageFilename) ?? row.imageFile }))
    )
  }, [])

  async function runBatch() {
    const runnable = rows.filter(r => r.imageFile)
    if (runnable.length === 0) return
    setRunning(true)

    const runnableIndices = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.imageFile)
    setRows(prev =>
      prev.map((r, i) =>
        runnableIndices.some(ri => ri.i === i) ? { ...r, status: 'processing' as const } : r
      )
    )

    const tasks = runnableIndices.map(({ r }) => () => verifyOne(r.applicationData, r.imageFile!))

    await runConcurrent(tasks, 5, (taskIdx, res) => {
      const rowIdx = runnableIndices[taskIdx].i
      setRows(prev =>
        prev.map((row, i) => {
          if (i !== rowIdx) return row
          if (res instanceof Error) return { ...row, status: 'error' as const, error: res.message }
          return { ...row, status: 'done' as const, result: res }
        })
      )
    })
    setRunning(false)
  }

  function exportCSV() {
    const header = buildCSVRow(['id', 'overall_status', 'matched_fields', 'image_quality_issues', 'error'])
    const lines = rows.map(r => {
      if (r.status === 'done' && r.result) {
        const m = r.result.fields.filter(f => f.status === 'match').length
        const t = r.result.fields.length
        return buildCSVRow([
          r.id,
          r.result.overallStatus,
          `${m}/${t}`,
          r.result.imageQualityIssues.join(';'),
          '',
        ])
      }
      return buildCSVRow([r.id, r.status, '', '', r.error ?? ''])
    })
    const blob = new Blob([[header, ...lines].join('\n') + '\n'], { type: 'text/csv' })
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'verification-results.csv',
    })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const done = rows.filter(r => r.status === 'done' || r.status === 'error').length
  const counts = {
    approved: rows.filter(r => r.result?.overallStatus === 'approved').length,
    review: rows.filter(r => r.result?.overallStatus === 'review').length,
    rejected: rows.filter(r => r.result?.overallStatus === 'rejected').length,
  }

  const visible = rows.filter(r =>
    filter === 'all' || (r.status === 'done' && r.result?.overallStatus === filter)
  )

  return (
    <div className="space-y-4">
      {/* Upload controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Batch Upload</h2>
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => {
              const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' })),
                download: 'batch-template.csv',
              })
              a.click()
              URL.revokeObjectURL(a.href)
            }}
            className="border border-gray-300 rounded-lg py-4 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ↓ Download CSV Template
          </button>

          <label className="border-2 border-dashed border-gray-300 rounded-lg py-4 text-center cursor-pointer hover:border-indigo-400 transition-colors block">
            <div className="text-2xl mb-1">📄</div>
            <div className="text-sm text-gray-500">Upload filled CSV</div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) loadCSV(f)
                e.target.value = ''
              }}
            />
          </label>

          <label className="border-2 border-dashed border-gray-300 rounded-lg py-4 text-center cursor-pointer hover:border-indigo-400 transition-colors block">
            <div className="text-2xl mb-1">🖼</div>
            <div className="text-sm text-gray-500">Upload label images</div>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files) loadImages(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        {rows.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {rows.length} labels · {rows.filter(r => r.imageFile).length} with images matched
            </span>
            <button
              onClick={runBatch}
              disabled={running || rows.filter(r => r.imageFile).length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors"
            >
              {running ? `Verifying… (${done}/${rows.filter(r => r.imageFile).length})` : 'Run Batch'}
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {running && (
            <div className="mb-4">
              <div className="bg-gray-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${rows.filter(r => r.imageFile).length > 0 ? (done / rows.filter(r => r.imageFile).length) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{done}/{rows.filter(r => r.imageFile).length}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-4 items-center">
            {([
              ['all', `All (${rows.length})`],
              ['approved', `✅ Approved (${counts.approved})`],
              ['review', `⚠️ Review (${counts.review})`],
              ['rejected', `❌ Rejected (${counts.rejected})`],
            ] as const).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
            {rows.some(r => r.status === 'done') && (
              <button
                onClick={exportCSV}
                className="ml-auto bg-gray-900 hover:bg-gray-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                ↓ Export CSV
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {visible.map(row => {
              const bg = row.status === 'done' && row.result
                ? CARD_BG[row.result.overallStatus]
                : row.status === 'error' ? 'border-red-200 bg-red-50'
                : row.status === 'processing' ? 'border-indigo-200 bg-indigo-50'
                : 'border-gray-200 bg-gray-50'

              const badge = row.status === 'done' && row.result
                ? BADGE[row.result.overallStatus]
                : row.status === 'processing' ? '⏳'
                : row.status === 'error' ? '💥'
                : '•'

              return (
                <div key={row.id} className={`border rounded-lg p-3 ${bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-gray-500 truncate">{row.id}</span>
                    <span className="text-sm">{badge}</span>
                  </div>
                  <div className="text-xs font-medium text-gray-800 truncate">
                    {row.applicationData.brandName || '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {row.status === 'done' && row.result
                      ? `${row.result.fields.filter(f => f.status === 'match').length}/${row.result.fields.length} fields match`
                      : row.status === 'processing' ? 'Analyzing…'
                      : row.status === 'error' ? row.error
                      : !row.imageFile ? 'No image matched'
                      : 'Pending'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
