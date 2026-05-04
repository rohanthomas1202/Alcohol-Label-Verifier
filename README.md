<div align="center">

# Label Verifier

**AI-powered TTB alcohol label verification.**
Upload an application form and a label image — get a field-by-field compliance verdict in seconds.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Claude](https://img.shields.io/badge/Claude-Sonnet%204.6-D97757)](https://www.anthropic.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Tests](https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

**[Live demo →](https://alcohol-label-verifier-two.vercel.app)**

[Quickstart](#quickstart) · [How it works](#how-it-works) · [API](#api) · [Assumptions](#assumptions) · [Trade-offs](#trade-offs) · [Deploy](#deploy)

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
| **Government Warning check** | Word-for-word body match plus separate ALL-CAPS and bold checks on the `GOVERNMENT WARNING:` prefix |
| **Single + batch modes** | Verify one label, or run a CSV of applications against a folder of images |
| **Concurrent processing** | Batch mode runs up to 5 verifications in flight with live progress |
| **CSV export** | Download batch results in a regulator-friendly format |
| **Prompt caching** | System prompt and tool schema are cached to cut latency and cost |
| **Quality flags** | Glare, blur, skew, and low-res are surfaced as review reasons, not silent failures |

## Quickstart

```bash
git clone https://github.com/rohanthomas1202/Alcohol-Label-Verifier.git
cd Alcohol-Label-Verifier
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
│  + gov-warning.ts    │  warning body + prefix validator
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
| **Approved** | Every required field matches, and the Government Warning passes all three checks (word-for-word body + ALL-CAPS prefix + bold prefix) |
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
src/
├── app/
│   ├── api/verify/route.ts      POST /api/verify
│   ├── layout.tsx
│   └── page.tsx                 main UI
├── components/
│   ├── ApplicationForm.tsx
│   ├── LabelUpload.tsx
│   ├── VerificationResult.tsx
│   └── BatchPanel.tsx
├── lib/
│   ├── claude.ts                Anthropic client, prompt, tool schema
│   ├── matcher.ts               normalized + numeric field comparison
│   ├── gov-warning.ts           Government Warning validator (body + prefix caps + bold)
│   └── csv.ts                   RFC-4180 quote-aware parser/writer
└── types/index.ts               shared TS types
__tests__/lib/                   unit tests (vitest)
package.json
```

## Testing

```bash
npm test            # one-shot
npm run test:watch  # watch mode
npm run lint        # eslint
```

Unit tests cover the matcher, the Government Warning validator, and the CSV parser/writer — i.e. all the deterministic logic. The Claude call is intentionally *not* mocked into the test suite; the matcher is tested against fixed `ExtractedFields` inputs.

## Assumptions

These are the calls made when filling in gaps from the brief and the stakeholder interviews:

- **Standalone POC, no COLA integration.** Per Marcus's interview — this is a proof-of-concept, not a production integration. No persistence, no auth, no audit log.
- **Canonical TTB warning text** is hardcoded in `gov-warning.ts` and used when the application omits a custom warning. The validator does word-for-word matching on the body (case- and smart-quote-insensitive — many real labels print the body in ALL CAPS) *plus* Jenny's two specific concerns: ALL-CAPS `GOVERNMENT WARNING:` prefix and bold weighting on that prefix, both checked separately.
- **Bold/caps detection is delegated to Claude's vision model.** The matcher trusts the boolean flags in the extracted JSON. There's no client-side OCR cross-check.
- **Case- and punctuation-insensitive matching** for free-text fields (Brand, Class/Type, Producer, Country). Dave's `STONE'S THROW` vs `Stone's Throw` example matches; smart quotes are folded to ASCII.
- **Numeric fields parse before comparing.** `45%` matches `45.0% Alc./Vol.`; `750 mL` matches `0.75 L`. Falls back to text comparison only if parsing fails.
- **Image quality issues lower the verdict to `review`, not `rejected`.** Dave's "you need judgment" point — the tool surfaces glare/blur/skew and asks the agent, rather than auto-rejecting.
- **No PII storage.** Image is processed in-memory, sent once to the Anthropic API, and discarded. Marcus's "don't do anything crazy" — no S3, no DB.
- **Single Anthropic outbound call** per verification. Marcus's note about TTB's firewall blocking outbound traffic — this keeps the integration surface to one well-known endpoint.
- **Sub-5s latency target** (Sarah's hard requirement from the prior pilot). System prompt and tool schema are cached via Anthropic prompt caching; cold call ~3-4s, warm ~2s.

## Trade-offs

- **Vision extraction is a black box.** Claude reads the label and returns JSON. If extraction is wrong, the match is wrong. Mitigation: image quality flags + a `review` verdict instead of silent failure.
- **Matcher is deterministic, prompt is not.** All field-comparison logic is pure TypeScript and unit-tested. Tuning matching rules doesn't require touching the prompt or re-evaluating against a test set.
- **No persistence.** Reload the page and your batch results are gone. For a production version, results would land in a queue + DB. Out of scope for a POC.
- **Batch concurrency is fixed at 5.** Higher would saturate the Anthropic rate limit on the default tier; lower would slow Janet's 200-label imports. 5 is a reasonable middle for the POC.
- **Government Warning check accepts only the canonical TTB wording.** Off-brand wording, missing clauses, or truly creative violations (warning embedded in artwork, wrapped across two lines) all fail the body match — which is the desired behavior, but a regulator-blessed list of acceptable variants would need to be maintained for edge cases. None ship with this prototype.
- **Error responses occasionally use HTTP 500 for client-input errors** (e.g. malformed `imageBase64`). Cosmetic; doesn't affect the UI flow but should be cleaned up before production.

## Limits

- Image upload: JPEG / PNG / WebP / GIF, max 5 MB (enforced client + server)
- Server route timeout: 60 s (`maxDuration` in `route.ts`)
- Batch concurrency: 5 simultaneous verifications

## Deploy

Live at <https://alcohol-label-verifier-two.vercel.app>. Vercel is the path of least resistance — `next build` works out of the box.

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
