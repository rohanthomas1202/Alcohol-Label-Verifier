'use client'
import { useState } from 'react'
import { ApplicationForm } from '@/components/ApplicationForm'
import { LabelUpload } from '@/components/LabelUpload'
import { VerificationResult } from '@/components/VerificationResult'
import { BatchPanel } from '@/components/BatchPanel'
import type { ApplicationData, VerificationResponse } from '@/types'

const EMPTY_FORM: ApplicationData = {
  brandName: '',
  classType: '',
  alcoholContent: '',
  netContents: '',
  producerName: '',
  countryOfOrigin: '',
}

export default function Home() {
  const [tab, setTab] = useState<'single' | 'batch'>('single')
  const [form, setForm] = useState<ApplicationData>(EMPTY_FORM)
  const [image, setImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerificationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canVerify = !!(form.brandName && form.classType && form.alcoholContent && form.netContents && image)

  async function handleVerify() {
    if (!canVerify) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationData: form, imageBase64: image }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Verification failed')
      setResult(data as VerificationResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">TTB Label Verifier</h1>
            <p className="text-xs text-gray-500 mt-0.5">AI-powered label compliance checking</p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['single', 'batch'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'single' ? 'Single Label' : 'Batch Upload'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {tab === 'single' ? (
          <div className="grid grid-cols-2 gap-6">
            {/* Left panel — inputs */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <h2 className="font-semibold text-gray-900">Application Data</h2>
              <ApplicationForm value={form} onChange={setForm} disabled={loading} />
              <LabelUpload onImage={setImage} disabled={loading} />
              <button
                onClick={handleVerify}
                disabled={!canVerify || loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Verifying...' : 'Verify Label'}
              </button>
            </div>

            {/* Right panel — results */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Results</h2>
              {!result && !error && !loading && (
                <div className="flex flex-col items-center justify-center h-64 text-gray-300">
                  <div className="text-5xl mb-3">🔍</div>
                  <p className="text-sm text-center">
                    Fill in the application data,<br />upload a label image, and click Verify
                  </p>
                </div>
              )}
              {loading && (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <div className="text-4xl mb-3 animate-spin">⚙️</div>
                  <p className="text-sm">Analyzing label with AI...</p>
                </div>
              )}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                  {error}
                </div>
              )}
              {result && <VerificationResult result={result} />}
            </div>
          </div>
        ) : (
          <BatchPanel />
        )}
      </div>
    </main>
  )
}
