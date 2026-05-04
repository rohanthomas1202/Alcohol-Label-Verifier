# Label Verifier

AI-powered TTB alcohol label verification. Upload an application form and a label image; Claude Vision extracts the fields from the label and the app compares them against the submitted application — field-by-field, with a verdict per field and an overall status.

## Architecture

```
Browser (React UI)
  → POST /api/verify  (Next.js Route Handler)
    → Claude API  (claude-sonnet-4-6, vision + tool use, prompt caching)
      ↳ returns ExtractedFields JSON
    → matcher.ts  (pure TypeScript field comparison)
      ↳ returns FieldResult[]
  ← VerificationResponse
```

**Design principle:** Claude only *extracts* what it sees on the label. TypeScript does all the *matching*. The matcher is unit-tested without calling Claude; business rules can be tuned without touching the AI prompt.

Key files:
- `src/lib/claude.ts` — Anthropic client, system prompt, extraction tool schema, prompt caching
- `src/lib/matcher.ts` — normalized + numeric field comparison
- `src/lib/gov-warning.ts` — exact-text validator for the federal Government Warning
- `src/lib/csv.ts` — RFC-4180 quote-aware CSV parser/writer for batch mode
- `src/app/api/verify/route.ts` — `POST /api/verify`
- `src/components/` — `ApplicationForm`, `LabelUpload`, `VerificationResult`, `BatchPanel`

## Setup

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
```

## Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm test         # run unit tests (vitest)
npm run lint     # eslint
```

## Modes

- **Single label** — enter the application form, drop an image, get a per-field verification with overall verdict (approved / review / rejected).
- **Batch** — upload a CSV of applications and a folder of label images. Runs verifications concurrently (capped at 5 in flight), shows live progress, and exports results as CSV.

The batch CSV template can be downloaded from the UI. Columns:
`id, image_filename, brand_name, class_type, alcohol_content, net_contents, producer_name, country_of_origin`

## Verdict logic

A label is **approved** when every required field matches and the Government Warning passes its exact-text check (text + ALL-CAPS prefix + bold prefix). It's **rejected** when any required field mismatches. **Review** is returned when image quality issues (glare, blur, skew) might have affected extraction, or when an optional field couldn't be confirmed.

## Limits

- Image upload: JPEG / PNG / WebP / GIF, max 5 MB (enforced both client-side and server-side)
- Server route timeout: 60 s (`maxDuration` in `route.ts`)
- Batch concurrency: 5 simultaneous verifications

## Deploy

Vercel:
```bash
vercel --prod
```
Set `ANTHROPIC_API_KEY` as a project environment variable. No other infrastructure required.
