# TTB Label Verification App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web app where TTB compliance agents upload a label image and application data, and AI verifies each field matches — returning approved/review/rejected with per-field explanations.

**Architecture:** Single Next.js 15 (App Router) repo on Vercel. `POST /api/verify` receives application fields + base64 image, calls Claude Vision to extract label fields via tool use, then pure TypeScript matcher compares them. Claude extracts; TypeScript matches.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, `@anthropic-ai/sdk`, Vitest, Vercel

---

## File Map

| File | Responsibility |
|---|---|
| `src/types/index.ts` | Shared types: ApplicationData, ExtractedFields, FieldResult, VerificationResponse |
| `src/lib/gov-warning.ts` | Government warning exact validator + standard TTB text constant |
| `src/lib/matcher.ts` | Field-by-field comparison: normalized, numeric, exact |
| `src/lib/claude.ts` | Anthropic SDK client, system prompt, tool schema, `extractLabelFields()` |
| `src/app/api/verify/route.ts` | POST handler: parse request → Claude → matcher → respond |
| `src/components/ApplicationForm.tsx` | Controlled form for all application fields |
| `src/components/LabelUpload.tsx` | Drag-drop single image upload, base64 output |
| `src/components/VerificationResult.tsx` | Renders overall status + per-field rows |
| `src/components/BatchPanel.tsx` | CSV + image batch upload, concurrent processing, results grid |
| `src/app/page.tsx` | Single/batch tab shell, wires single-label components together |
| `src/app/layout.tsx` | Root layout with metadata |
| `vitest.config.ts` | Vitest config with `@` alias |
| `__tests__/lib/gov-warning.test.ts` | Unit tests for gov-warning |
| `__tests__/lib/matcher.test.ts` | Unit tests for matcher |

---

## Task 1: Scaffold project

**Files:**
- Create: project root (all generated files)
- Create: `vitest.config.ts`
- Modify: `package.json` (add test scripts + vitest)

- [ ] **Step 1: Create Next.js app**

```bash
cd /Users/rohanthomas/TakeHome
npx create-next-app@latest label-verifier \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git
cd label-verifier
```

Expected: directory `label-verifier/` created with Next.js 15 boilerplate.

- [ ] **Step 2: Install runtime and test dependencies**

```bash
npm install @anthropic-ai/sdk
npm install -D vitest @vitest/globals
```

Expected: both packages appear in `package.json`.

- [ ] **Step 3: Add test scripts to `package.json`**

Open `package.json` and add to the `"scripts"` block:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 5: Create `.env.local`**

```bash
echo "ANTHROPIC_API_KEY=your-key-here" > .env.local
```

- [ ] **Step 6: Update `.gitignore` to exclude sensitive files**

Append to `.gitignore`:

```
.env.local
.superpowers/
```

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```

Expected: `▲ Next.js 15.x.x — ready on http://localhost:3000`. Ctrl+C to stop.

- [ ] **Step 8: Commit scaffold**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with Tailwind, TS, Vitest"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create `src/types/index.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Government warning validator

**Files:**
- Create: `src/lib/gov-warning.ts`
- Create: `__tests__/lib/gov-warning.test.ts`

- [ ] **Step 1: Create `__tests__/lib/gov-warning.test.ts` with failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- gov-warning
```

Expected: `FAIL — Cannot find module '@/lib/gov-warning'`

- [ ] **Step 3: Create `src/lib/gov-warning.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- gov-warning
```

Expected: `✓ 6 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/gov-warning.ts __tests__/lib/gov-warning.test.ts
git commit -m "feat: add government warning validator with tests"
```

---

## Task 4: Field matcher

**Files:**
- Create: `src/lib/matcher.ts`
- Create: `__tests__/lib/matcher.test.ts`

- [ ] **Step 1: Create `__tests__/lib/matcher.test.ts` with failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- matcher
```

Expected: `FAIL — Cannot find module '@/lib/matcher'`

- [ ] **Step 3: Create `src/lib/matcher.ts`**

```typescript
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
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: `✓ 12 tests passed` (6 gov-warning + 12 matcher)

- [ ] **Step 5: Commit**

```bash
git add src/lib/matcher.ts __tests__/lib/matcher.test.ts
git commit -m "feat: add field matcher with normalized/numeric comparison and tests"
```

---

## Task 5: Claude extraction client

**Files:**
- Create: `src/lib/claude.ts`

No automated test — this calls an external API. Verified manually via the API route in Task 10.

- [ ] **Step 1: Create `src/lib/claude.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedFields } from '@/types'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are a TTB (Alcohol and Tobacco Tax and Trade Bureau) label analysis assistant. Your job is to carefully read alcohol beverage label images and extract specific regulatory fields.

Call the extract_label_fields tool with exactly what you see on the label. Be precise — do not infer or guess values not visible on the label. If a field is not visible or unreadable, return null.

For the government warning:
- Extract the complete text verbatim as it appears
- Set government_warning_prefix_caps to true ONLY if "GOVERNMENT WARNING:" appears in ALL CAPS
- Set government_warning_prefix_bold to true ONLY if the prefix appears visually bold or prominently weighted

For image_quality_issues, include any applicable: "blurry", "glare", "skewed", "low-res", "partially-obscured".`

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_label_fields',
  description: 'Extract regulatory fields from an alcohol beverage label image',
  input_schema: {
    type: 'object' as const,
    properties: {
      brand_name: { type: ['string', 'null'] as unknown as 'string', description: 'Brand name as shown on label' },
      class_type: { type: ['string', 'null'] as unknown as 'string', description: 'Class and type designation' },
      alcohol_content: { type: ['string', 'null'] as unknown as 'string', description: 'Alcohol content as shown, e.g. "45% Alc./Vol. (90 Proof)"' },
      net_contents: { type: ['string', 'null'] as unknown as 'string', description: 'Net contents/volume, e.g. "750 mL"' },
      producer_name: { type: ['string', 'null'] as unknown as 'string', description: 'Name and address of bottler/producer' },
      country_of_origin: { type: ['string', 'null'] as unknown as 'string', description: 'Country of origin for imports, null if domestic' },
      government_warning_text: { type: ['string', 'null'] as unknown as 'string', description: 'Complete government warning text verbatim' },
      government_warning_prefix_caps: { type: 'boolean' as const, description: 'Is "GOVERNMENT WARNING:" in all capitals?' },
      government_warning_prefix_bold: { type: 'boolean' as const, description: 'Is the "GOVERNMENT WARNING:" prefix visually bold/prominent?' },
      image_quality_issues: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Image quality issues that may affect accuracy',
      },
    },
    required: [
      'brand_name', 'class_type', 'alcohol_content', 'net_contents',
      'producer_name', 'country_of_origin', 'government_warning_text',
      'government_warning_prefix_caps', 'government_warning_prefix_bold',
      'image_quality_issues',
    ],
  },
}

export async function extractLabelFields(imageBase64: string): Promise<ExtractedFields> {
  const base64Data = imageBase64.replace(/^data:image\/[a-z+]+;base64,/, '')
  const mediaTypeMatch = imageBase64.match(/^data:(image\/[a-z+]+);base64,/)
  const mediaType = (mediaTypeMatch?.[1] ?? 'image/jpeg') as
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'

  const response = await client.messages.create(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        {
          type: 'text' as const,
          text: SYSTEM_PROMPT,
          // @ts-expect-error prompt-caching beta field not yet in SDK types
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool' as const, name: 'extract_label_fields' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            { type: 'text', text: 'Extract all regulatory fields from this alcohol beverage label.' },
          ],
        },
      ],
    },
    {
      headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
    }
  )

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!toolUse) throw new Error('Claude did not call extract_label_fields tool')

  return toolUse.input as ExtractedFields
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/claude.ts
git commit -m "feat: add Claude vision extraction client with prompt caching"
```

---

## Task 6: API route

**Files:**
- Create: `src/app/api/verify/route.ts`

- [ ] **Step 1: Create `src/app/api/verify/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { extractLabelFields } from '@/lib/claude'
import { matchFields } from '@/lib/matcher'
import type { VerifyRequest } from '@/types'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerifyRequest

    if (!body.applicationData || !body.imageBase64) {
      return NextResponse.json({ error: 'Missing applicationData or imageBase64' }, { status: 400 })
    }

    const { brandName, classType, alcoholContent, netContents } = body.applicationData
    if (!brandName || !classType || !alcoholContent || !netContents) {
      return NextResponse.json(
        { error: 'brandName, classType, alcoholContent, and netContents are required' },
        { status: 400 }
      )
    }

    const extracted = await extractLabelFields(body.imageBase64)
    const result = matchFields(body.applicationData, extracted)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/verify/route.ts
git commit -m "feat: add POST /api/verify route handler"
```

---

## Task 7: ApplicationForm component

**Files:**
- Create: `src/components/ApplicationForm.tsx`

- [ ] **Step 1: Create `src/components/ApplicationForm.tsx`**

```typescript
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
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ApplicationForm.tsx
git commit -m "feat: add ApplicationForm component"
```

---

## Task 8: LabelUpload component

**Files:**
- Create: `src/components/LabelUpload.tsx`

- [ ] **Step 1: Create `src/components/LabelUpload.tsx`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LabelUpload.tsx
git commit -m "feat: add drag-drop LabelUpload component"
```

---

## Task 9: VerificationResult component

**Files:**
- Create: `src/components/VerificationResult.tsx`

- [ ] **Step 1: Create `src/components/VerificationResult.tsx`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/VerificationResult.tsx
git commit -m "feat: add VerificationResult component"
```

---

## Task 10: Single-label page

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update `src/app/layout.tsx` with app metadata**

```typescript
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TTB Label Verifier',
  description: 'AI-powered alcohol label compliance verification',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={geist.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Replace `src/app/page.tsx` with the single-label shell**

```typescript
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
```

- [ ] **Step 3: Run dev server and test single-label flow manually**

```bash
npm run dev
```

Open http://localhost:3000. Fill in the form, upload a label image, click Verify Label. Confirm:
- Results appear in the right panel
- Each field shows submitted vs. extracted value with status icon
- Overall badge shows correct status

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx
git commit -m "feat: add single-label two-panel UI"
```

---

## Task 11: BatchPanel component

**Files:**
- Create: `src/components/BatchPanel.tsx`

- [ ] **Step 1: Create `src/components/BatchPanel.tsx`**

```typescript
'use client'
import { useCallback, useRef, useState } from 'react'
import type { ApplicationData, OverallStatus, VerificationResponse } from '@/types'

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
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim())
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
    const header = 'id,overall_status,matched_fields,image_quality_issues,error\n'
    const lines = rows.map(r => {
      if (r.status === 'done' && r.result) {
        const m = r.result.fields.filter(f => f.status === 'match').length
        const t = r.result.fields.length
        return `${r.id},${r.result.overallStatus},${m}/${t},"${r.result.imageQualityIssues.join(';')}",`
      }
      return `${r.id},${r.status},,,"${r.error ?? ''}"`
    })
    const blob = new Blob([header + lines.join('\n')], { type: 'text/csv' })
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

          <div
            className="border-2 border-dashed border-gray-300 rounded-lg py-4 text-center cursor-pointer hover:border-indigo-400 transition-colors"
            onClick={() => document.getElementById('csv-input')?.click()}
          >
            <div className="text-2xl mb-1">📄</div>
            <div className="text-sm text-gray-500">Upload filled CSV</div>
            <input
              id="csv-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) loadCSV(f) }}
            />
          </div>

          <div
            className="border-2 border-dashed border-gray-300 rounded-lg py-4 text-center cursor-pointer hover:border-indigo-400 transition-colors"
            onClick={() => document.getElementById('images-input')?.click()}
          >
            <div className="text-2xl mb-1">🖼</div>
            <div className="text-sm text-gray-500">Upload label images</div>
            <input
              id="images-input"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) loadImages(e.target.files) }}
            />
          </div>
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
```

- [ ] **Step 2: Test batch flow manually**

```bash
npm run dev
```

Open http://localhost:3000, click "Batch Upload". Verify:
- CSV template downloads correctly when clicking "Download CSV Template"
- Uploading a CSV + images shows correct row count
- Clicking "Run Batch" processes labels with live card updates
- Export CSV downloads results

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/BatchPanel.tsx
git commit -m "feat: add BatchPanel with concurrent CSV batch processing and export"
```

---

## Task 12: Deploy to Vercel

**Files:**
- No new files. Deploy the existing repo.

- [ ] **Step 1: Push repo to GitHub**

```bash
git remote add origin https://github.com/<your-username>/ttb-label-verifier.git
git push -u origin main
```

- [ ] **Step 2: Import project to Vercel**

Go to https://vercel.com/new, click "Import Git Repository", select `ttb-label-verifier`.

- [ ] **Step 3: Add environment variable in Vercel dashboard**

In the Vercel project settings → Environment Variables, add:

```
ANTHROPIC_API_KEY = <your key>
```

- [ ] **Step 4: Deploy**

Click "Deploy". Wait for build to complete (~1-2 minutes).

Expected: Vercel returns a URL like `https://ttb-label-verifier.vercel.app`.

- [ ] **Step 5: Smoke test on Vercel URL**

Open the production URL. Enter sample application data, upload a label image, click Verify Label. Confirm the full flow works end-to-end on Vercel.

- [ ] **Step 6: Add deployed URL to README.md**

Create `README.md`:

```markdown
# TTB Label Verifier

AI-powered alcohol label compliance verification for TTB agents.

**Live:** https://ttb-label-verifier.vercel.app

## Setup

1. Clone the repo and `cd label-verifier`
2. `npm install`
3. Copy `.env.local.example` to `.env.local` and add your `ANTHROPIC_API_KEY`
4. `npm run dev`

## Running tests

```
npm test
```

## Architecture

Single Next.js 15 app on Vercel. `POST /api/verify` accepts application fields + base64 label image, calls Claude Vision via tool use to extract fields, then TypeScript matcher compares them field-by-field.

- `src/lib/claude.ts` — Claude extraction (with prompt caching)
- `src/lib/matcher.ts` — field comparison logic
- `src/lib/gov-warning.ts` — government warning exact validator
- `src/app/api/verify/route.ts` — POST handler
```

- [ ] **Step 7: Final commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions and deployed URL"
git push
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Architecture ✓, Types ✓, Claude tool use + caching ✓, Matcher (normalized/numeric/exact) ✓, Gov warning exact ✓, Two-panel UI ✓, Batch CSV+images ✓, Concurrent 5 ✓, Filter+export ✓, Error handling ✓, Vercel deploy ✓
- [x] **No placeholders:** All tasks have exact code, commands, and expected output
- [x] **Type consistency:** `ApplicationData`, `ExtractedFields`, `FieldResult`, `VerificationResponse` defined in Task 2 and used consistently through Tasks 3–11. `matchFields()` defined in Task 4 and called in Task 6. `extractLabelFields()` defined in Task 5 and called in Task 6. `BatchRow` is local to `BatchPanel.tsx`. `GovWarningCheckResult` defined and used within `gov-warning.ts` and `matcher.ts`.
