<div align="center">

# Label Verifier

**AI-powered TTB alcohol label verification.**
Upload an application form and a label image — get a field-by-field compliance verdict in seconds.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Claude](https://img.shields.io/badge/Claude-Sonnet%204.6-D97757)](https://www.anthropic.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Tests](https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

[Quickstart](#quickstart) · [How it works](#how-it-works) · [API](#api) · [Testing](#testing) · [Deploy](#deploy)

</div>

---

## Overview

Submitting an alcohol label for TTB approval means proving the artwork on the bottle matches the data on the application — brand, class/type, ABV, net contents, government warning, and more. Doing it by eye is slow and error-prone.

**Label Verifier** automates that check. It uses Claude's vision capabilities to *extract* what is printed on the label, then runs the comparison against the submitted application in pure TypeScript — so the matching rules are deterministic, testable, and tunable without retraining anything.

## Features

| | |
|---|---|
| **Vision extraction** | Claude Sonnet 4.6 reads the label image via tool-use, returning structured JSON |
| **Deterministic matching** | All field comparison happens in pure TypeScript — fully unit-tested |
| **Government Warning check** | Verifies exact federal text, ALL-CAPS prefix, and bold weighting |
| **Single + batch modes** | Verify one label, or run a CSV of applications against a folder of images |
| **Concurrent processing** | Batch mode runs up to 5 verifications in flight with live progress |
| **CSV export** | Download batch results in a regulator-friendly format |
| **Prompt caching** | System prompt and tool schema are cached to cut latency and cost |
| **Quality flags** | Glare, blur, skew, and low-res are surfaced as review reasons, not silent failures |

## Quickstart

```bash
git clone https://github.com/rohanthomas1202/Alcohol-Label-Verifier.git
cd Alcohol-Label-Verifier/label-verifier
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Open <http://localhost:3000>.

**Requirements:** Node.js 20+, an Anthropic API key.

## How it works

```
┌──────────────────────┐
│  Browser (React UI)  │  ApplicationForm + LabelUpload + VerificationResult
└──────────┬───────────┘
           │ POST /api/verify  { applicationData, imageBase64 }
           ▼
┌──────────────────────┐
│  Next.js Route       │  src/app/api/verify/route.ts
│  Handler             │  validates input, sets 60s maxDuration
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Claude Sonnet 4.6   │  src/lib/claude.ts
│  (vision + tool use) │  extracts ExtractedFields JSON
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  matcher.ts          │  pure TS field comparison
│  + gov-warning.ts    │  exact-text validator
└──────────┬───────────┘
           │
           ▼
   VerificationResponse
   { overallStatus, fields[], imageQualityIssues[] }
```

**Design principle.** Claude only *extracts* what it sees on the label. TypeScript does all the *matching*. This means the matcher is unit-tested without any API calls, and business rules can be tuned without touching the prompt.

### Verdict logic

| Verdict | Condition |
|---|---|
| **Approved** | Every required field matches, and the Government Warning passes its exact-text check (text + ALL-CAPS prefix + bold prefix) |
| **Review** | Image quality issues (glare, blur, skew) may have affected extraction, or an optional field couldn't be confirmed |
| **Rejected** | Any required field mismatches |

## Modes

**Single label.** Enter the application data, drop a label image, get a per-field verdict with notes.

**Batch.** Upload a CSV of applications and a folder of label images. The app runs verifications concurrently (capped at 5 in flight), shows live progress, and exports results back as CSV.

The CSV template can be downloaded from the UI. Columns:

```csv
id,image_filename,brand_name,class_type,alcohol_content,net_contents,producer_name,country_of_origin
```

## API

### `POST /api/verify`

**Request**

```ts
{
  applicationData: {
    brandName: string
    classType: string
    alcoholContent: string
    netContents: string
    producerName?: string
    countryOfOrigin?: string
    governmentWarning?: string
  }
  imageBase64: string  // data URL or raw base64, JPEG/PNG/WebP/GIF, ≤5 MB
}
```

**Response**

```ts
{
  overallStatus: 'approved' | 'review' | 'rejected'
  fields: Array<{
    fieldName: string
    applicationValue: string
    labelValue: string | null
    status: 'match' | 'mismatch' | 'review' | 'not_found'
    notes?: string
  }>
  imageQualityIssues: string[]
  processingMs: number
}
```

## Project structure

```
label-verifier/
├── src/
│   ├── app/
│   │   ├── api/verify/route.ts      POST /api/verify
│   │   ├── layout.tsx
│   │   └── page.tsx                 main UI
│   ├── components/
│   │   ├── ApplicationForm.tsx
│   │   ├── LabelUpload.tsx
│   │   ├── VerificationResult.tsx
│   │   └── BatchPanel.tsx
│   ├── lib/
│   │   ├── claude.ts                Anthropic client, prompt, tool schema
│   │   ├── matcher.ts               normalized + numeric field comparison
│   │   ├── gov-warning.ts           exact-text Government Warning validator
│   │   └── csv.ts                   RFC-4180 quote-aware parser/writer
│   └── types/index.ts               shared TS types
├── __tests__/lib/                   unit tests (vitest)
└── package.json
```

## Testing

```bash
npm test            # one-shot
npm run test:watch  # watch mode
npm run lint        # eslint
```

Unit tests cover the matcher, the Government Warning validator, and the CSV parser/writer — i.e. all the deterministic logic. The Claude call is intentionally *not* mocked into the test suite; the matcher is tested against fixed `ExtractedFields` inputs.

## Limits

- Image upload: JPEG / PNG / WebP / GIF, max 5 MB (enforced client + server)
- Server route timeout: 60 s (`maxDuration` in `route.ts`)
- Batch concurrency: 5 simultaneous verifications

## Deploy

Vercel is the path of least resistance — `next build` works out of the box.

```bash
vercel --prod
```

Set `ANTHROPIC_API_KEY` as a project environment variable. No database, no queue, no other infrastructure required.

## Tech stack

- **[Next.js 16](https://nextjs.org)** — App Router + Route Handlers
- **[React 19](https://react.dev)** + **TypeScript 5**
- **[Tailwind CSS 4](https://tailwindcss.com)** — styling
- **[Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)** — Claude Sonnet 4.6 with vision and tool use
- **[Vitest](https://vitest.dev)** — unit tests
- **[ESLint 9](https://eslint.org)** — linting

## License

Built as a take-home project. See repository for licensing details.
