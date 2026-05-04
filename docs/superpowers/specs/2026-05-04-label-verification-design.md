# TTB AI-Powered Alcohol Label Verification App — Design Spec

**Date:** 2026-05-04
**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Anthropic SDK · Vercel

---

## Overview

A web app for TTB compliance agents to verify that physical alcohol label artwork matches the data submitted in a label application. The agent enters the application's claimed field values, uploads a label image, and the app uses Claude Vision to extract fields from the image and compare them field-by-field.

**Core constraint:** Results in under 5 seconds per label. No extra infrastructure — single Next.js repo deployed to Vercel.

---

## Architecture

```
Browser (React UI)
  → POST /api/verify  (Next.js Route Handler, Vercel serverless)
    → Claude API  (claude-sonnet-4-6, vision + tool use)
      → returns ExtractedFields JSON
    → matcher.ts  (pure TypeScript field comparison)
      → returns FieldResult[]
  ← VerificationResponse
```

**Key principle:** Claude only *extracts* — it reads the label and returns structured JSON of what it sees. TypeScript code does all *matching*. Matching logic is testable without calling Claude; business rules can be tuned without touching the AI prompt.

---

## Project Structure

```
src/
  app/
    page.tsx                    # main UI (single + batch tabs)
    api/verify/route.ts         # POST /api/verify
  components/
    ApplicationForm.tsx         # form for entering submitted fields
    LabelUpload.tsx             # drag-drop image upload
    VerificationResult.tsx      # field-by-field result display
    BatchPanel.tsx              # batch progress grid
  lib/
    claude.ts                   # Anthropic SDK client, system prompt, tool schema
    matcher.ts                  # field comparison logic
    gov-warning.ts              # government warning exact validator
  types/index.ts
```

---

## API

### `POST /api/verify`

**Request:**
```typescript
{
  applicationData: {
    brandName: string
    classType: string
    alcoholContent: string
    netContents: string
    governmentWarning?: string   // omit to use standard TTB warning
    producerName?: string
    countryOfOrigin?: string
  }
  imageBase64: string            // data URL or raw base64
}
```

**Response:**
```typescript
{
  overallStatus: 'approved' | 'review' | 'rejected'
  fields: FieldResult[]
  imageQualityIssues: string[]   // e.g. ["glare", "skewed"]
  processingMs: number
}

type FieldResult = {
  fieldName: string
  applicationValue: string
  labelValue: string | null
  status: 'match' | 'mismatch' | 'review' | 'not_found'
  notes?: string
}
```

**Overall status rules:**
- `rejected` — any field has status `mismatch`
- `review` — any field has status `not_found` or `review`, or `imageQualityIssues` is non-empty
- `approved` — all fields have status `match`

Note: a label can only be `approved` if the government warning text matches exactly AND `government_warning_prefix_caps` and `government_warning_prefix_bold` are both `true`.

---

## Claude Integration (`lib/claude.ts`)

**Model:** `claude-sonnet-4-6` with vision.

**Tool use:** Claude is given a single tool `extract_label_fields` with a strict JSON schema and instructed it must call it. This forces structured output with no free-text parsing.

**Tool schema fields:**
```typescript
{
  brand_name: string | null
  class_type: string | null
  alcohol_content: string | null
  net_contents: string | null
  producer_name: string | null
  country_of_origin: string | null
  government_warning_text: string | null
  government_warning_prefix_caps: boolean   // is "GOVERNMENT WARNING:" all-caps?
  government_warning_prefix_bold: boolean   // is the prefix visually bold/prominent?
  image_quality_issues: string[]            // ["glare", "skewed", "low-res", ...]
}
```

**Prompt caching:** The system prompt and tool schema block are marked with `cache_control: { type: "ephemeral" }`. For a batch of 300 labels, 299 are cache hits — roughly 90% cheaper and ~40% faster on subsequent calls. Expected timing: ~3–4s cold, ~1.5–2.5s warm. Both are under Sarah's 5-second limit.

---

## Matching Logic (`lib/matcher.ts`, `lib/gov-warning.ts`)

| Field | Match Type | Rules |
|---|---|---|
| Government Warning | **EXACT** | Normalize whitespace only. Word-for-word TTB text required. Additionally: `government_warning_prefix_caps` must be `true` and `government_warning_prefix_bold` must be `true`. Any failure → `rejected`. |
| Brand Name | **NORMALIZED** | Lowercase, trim, collapse whitespace, normalize unicode apostrophes/dashes. "STONE'S THROW" == "Stone's Throw". |
| Class / Type | **NORMALIZED** | Same normalization as brand name. |
| Alcohol Content | **NUMERIC** | Parse numeric value from both strings. "45%" == "45.0% Alc./Vol." == "45 percent". |
| Net Contents | **NUMERIC** | Parse value + normalize units. "750 mL" == "750mL". Convert to ml for comparison. |
| Producer / Origin | **NORMALIZED** | Case + whitespace insensitive. |

**Standard TTB government warning text** (used when `applicationData.governmentWarning` is omitted):
> GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

---

## UI Design

### Single Mode — Two-Panel Layout

Left panel: `ApplicationForm` (submitted field values) + `LabelUpload` (drag-drop image) + Verify button.
Right panel: `VerificationResult` — overall status badge + per-field rows (field name, submitted value, extracted value, status icon + notes).

Results appear in the right panel without navigation; agent sees submitted values and label values side by side.

### Batch Mode — CSV + Image Drop

1. Agent downloads a CSV template with columns: `id, image_filename, brand_name, class_type, alcohol_content, net_contents, producer_name, country_of_origin`. Fills in one row per application.
2. Agent drops the filled CSV + label image files (each image filename must match the `image_filename` column in the CSV).
3. "Run Batch" fires all verifications with a concurrency limit of 5 simultaneous requests.
4. Live result grid: each label gets a card that updates from "⏳ processing" to color-coded status as it resolves.
5. Progress bar shows overall completion.
6. Filter buttons (All / Approved / Review / Rejected) + "Export CSV" button for the full result set.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Image unreadable (glare, blur, skew) | Return `review` with `imageQualityIssues` listed — never auto-reject, let agent decide |
| Field not found on label | `status: 'not_found'` → overall `review` |
| Claude API error / timeout | Card shows error state with retry button; rest of batch continues |
| Invalid file type | Client-side validation before request, clear inline error |
| Vercel function timeout | Stream the response using `ReadableStream` — flush a heartbeat byte immediately so Vercel's 10s idle timeout doesn't fire while Claude is thinking. `maxDuration = 60` can be set on Pro plans as an additional guard. |
| Rate limit (batch) | Exponential backoff with jitter inside the concurrency queue |

No silent failures. Every error state is visible and actionable.

---

## Deployment

- **Platform:** Vercel (zero-config for Next.js)
- **Environment variable:** `ANTHROPIC_API_KEY`
- **No database.** All state is in-session. Results are exported via CSV if the agent needs to retain them.
- Add `.superpowers/` and `.env.local` to `.gitignore`.

---

## Out of Scope (for this prototype)

- COLA system integration
- User authentication / agent accounts
- Persistent storage of verification history
- Proof checking (label artwork compliance beyond field matching)
