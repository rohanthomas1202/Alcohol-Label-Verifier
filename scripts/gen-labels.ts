import { Resvg } from '@resvg/resvg-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'samples/images')

type WarningMode = 'correct' | 'all_caps_body' | 'title_case_prefix' | 'missing' | 'wrong_text'

interface TestCase {
  id: string
  imageFilename: string
  csv: {
    brandName: string
    classType: string
    alcoholContent: string
    netContents: string
    producerName?: string
    countryOfOrigin?: string
  }
  // Overrides for what's printed on the label. Defaults to csv values.
  label?: Partial<{
    brand: string
    class: string
    abv: string
    net: string
    producer: string
    country: string
  }>
  warning?: WarningMode
  expected: string
}

const cases: TestCase[] = [
  {
    id: '001',
    imageFilename: 'label_001.png',
    csv: { brandName: 'OLD TOM DISTILLERY', classType: 'Kentucky Straight Bourbon Whiskey', alcoholContent: '45% Alc./Vol. (90 Proof)', netContents: '750 mL' },
    expected: 'APPROVED — clean baseline match',
  },
  {
    id: '002',
    imageFilename: 'label_002.png',
    csv: { brandName: "Stone's Throw", classType: 'Vodka', alcoholContent: '40% Alc./Vol. (80 Proof)', netContents: '750 mL' },
    label: { brand: "STONE'S THROW" },
    expected: "APPROVED — case-insensitive brand match (Dave's example)",
  },
  {
    id: '003',
    imageFilename: 'label_003.png',
    csv: { brandName: 'DESERT MOON', classType: 'Tequila Blanco', alcoholContent: '38% Alc./Vol.', netContents: '750 mL' },
    label: { abv: '40% Alc./Vol.' },
    expected: 'REJECTED — ABV on label (40%) differs from application (38%)',
  },
  {
    id: '004',
    imageFilename: 'label_004.png',
    csv: { brandName: 'NORTH RIDGE', classType: 'Single Malt Scotch Whisky', alcoholContent: '43% Alc./Vol.', netContents: '750 mL' },
    label: { net: '0.75 L' },
    expected: 'APPROVED — unit-converted net contents (0.75 L = 750 mL)',
  },
  {
    id: '005',
    imageFilename: 'label_005.png',
    csv: { brandName: 'STORM CHASER', classType: 'Spiced Rum', alcoholContent: '35% Alc./Vol.', netContents: '750 mL' },
    warning: 'missing',
    expected: 'REJECTED — government warning entirely missing from label',
  },
  {
    id: '006',
    imageFilename: 'label_006.png',
    csv: { brandName: 'HIGHLAND BREW', classType: 'India Pale Ale', alcoholContent: '6.5% Alc./Vol.', netContents: '12 fl oz' },
    warning: 'title_case_prefix',
    expected: 'REJECTED — "Government Warning:" prefix is title case, not ALL CAPS (Jenny\'s rule)',
  },
  {
    id: '007',
    imageFilename: 'label_007.png',
    csv: { brandName: 'CASA RIOJA', classType: 'Tempranillo Red Wine', alcoholContent: '13.5% Alc./Vol.', netContents: '750 mL', countryOfOrigin: 'Spain' },
    warning: 'all_caps_body',
    expected: 'APPROVED — entire warning printed in ALL CAPS (case-insensitive body match)',
  },
  {
    id: '008',
    imageFilename: 'label_008.png',
    csv: { brandName: 'BLUE PIER', classType: 'Imported Lager', alcoholContent: '4.5% Alc./Vol.', netContents: '12 fl oz', countryOfOrigin: 'Mexico' },
    label: { brand: 'BLUE BAY' },
    expected: 'REJECTED — brand on label (BLUE BAY) differs from application (BLUE PIER)',
  },
  {
    id: '009',
    imageFilename: 'label_009.png',
    csv: { brandName: 'RIVER HOLLOW', classType: 'Bourbon', alcoholContent: '50% Alc./Vol. (100 Proof)', netContents: '1.75 L' },
    expected: 'APPROVED — large-format bottle (1.75 L)',
  },
  {
    id: '010',
    imageFilename: 'label_010.png',
    csv: { brandName: 'OAK & EMBER', classType: 'Reserve Whiskey', alcoholContent: '47% Alc./Vol.', netContents: '750 mL' },
    warning: 'wrong_text',
    expected: 'REJECTED — warning replaced with "Drink Responsibly" marketing text',
  },
  {
    id: '011',
    imageFilename: 'label_011.png',
    csv: { brandName: 'MIDNIGHT HARVEST', classType: 'Cabernet Sauvignon', alcoholContent: '14% Alc./Vol.', netContents: '750 mL', countryOfOrigin: 'United States' },
    expected: 'APPROVED — domestic red wine',
  },
  {
    id: '012',
    imageFilename: 'label_012.png',
    csv: { brandName: 'IRON GATE', classType: 'London Dry Gin', alcoholContent: '47.3% Alc./Vol. (94.6 Proof)', netContents: '750 mL' },
    label: { class: 'Distilled Gin' },
    expected: 'REJECTED — class on label (Distilled Gin) differs from application (London Dry Gin)',
  },
]

function escapeXML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeCSV(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur.length === 0) { cur = w; continue }
    if ((cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w }
    else cur += ' ' + w
  }
  if (cur) lines.push(cur)
  return lines
}

function warningSVG(mode: WarningMode | undefined, yStart: number): string {
  if (mode === 'missing') return ''

  if (mode === 'wrong_text') {
    return `<text x="50%" y="${yStart}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11" font-style="italic" fill="#444">Please Drink Responsibly.</text>`
  }

  const isAllCaps = mode === 'all_caps_body'
  const isTitleCase = mode === 'title_case_prefix'

  const prefix = isTitleCase ? 'Government Warning:' : 'GOVERNMENT WARNING:'
  const prefixWeight = isTitleCase ? '500' : '900'
  const body =
    "(1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
  const bodyText = isAllCaps ? body.toUpperCase() : body

  const lines = wrapText(bodyText, 82)
  const lineEls = lines
    .map((line, i) => `<tspan x="40" dy="${i === 0 ? 0 : 11}">${escapeXML(line)}</tspan>`)
    .join('')

  return `
    <text x="40" y="${yStart}" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="${prefixWeight}" fill="#000">${escapeXML(prefix)}</text>
    <text x="40" y="${yStart + 14}" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="#000">${lineEls}</text>
  `
}

function renderSVG(c: TestCase): string {
  const brand = c.label?.brand ?? c.csv.brandName
  const cls = c.label?.class ?? c.csv.classType
  const abv = c.label?.abv ?? c.csv.alcoholContent
  const net = c.label?.net ?? c.csv.netContents
  const producer = c.label?.producer ?? c.csv.producerName
  const country = c.label?.country ?? c.csv.countryOfOrigin

  const W = 600
  const H = 800

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Background and frame -->
  <rect width="${W}" height="${H}" fill="#f8f5ee"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#1a1a1a" stroke-width="2"/>
  <rect x="32" y="32" width="${W - 64}" height="${H - 64}" fill="none" stroke="#1a1a1a" stroke-width="0.5"/>

  <!-- Decorative top flourish -->
  <line x1="80" y1="100" x2="${W - 80}" y2="100" stroke="#1a1a1a" stroke-width="1"/>
  <circle cx="${W / 2}" cy="100" r="4" fill="#1a1a1a"/>

  <!-- Brand name -->
  <text x="50%" y="170" text-anchor="middle" font-family="Georgia, serif" font-size="38" font-weight="900" fill="#1a1a1a" letter-spacing="2">${escapeXML(brand)}</text>

  <!-- Class/type -->
  <text x="50%" y="220" text-anchor="middle" font-family="Georgia, serif" font-size="18" font-style="italic" fill="#3a3a3a">${escapeXML(cls)}</text>

  <!-- Decorative middle line -->
  <line x1="160" y1="260" x2="${W - 160}" y2="260" stroke="#1a1a1a" stroke-width="0.5"/>

  <!-- Producer -->
  ${producer ? `<text x="50%" y="320" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="1" fill="#3a3a3a">PRODUCED BY ${escapeXML(producer.toUpperCase())}</text>` : ''}

  <!-- Country -->
  ${country ? `<text x="50%" y="345" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11" letter-spacing="1" fill="#5a5a5a">PRODUCT OF ${escapeXML(country.toUpperCase())}</text>` : ''}

  <!-- ABV (large, prominent) -->
  <text x="50%" y="500" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#1a1a1a">${escapeXML(abv)}</text>

  <!-- Net contents -->
  <text x="50%" y="540" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#3a3a3a">${escapeXML(net)}</text>

  <!-- Decorative bottom line -->
  <line x1="80" y1="600" x2="${W - 80}" y2="600" stroke="#1a1a1a" stroke-width="1"/>
  <circle cx="${W / 2}" cy="600" r="4" fill="#1a1a1a"/>

  <!-- Government warning -->
  ${warningSVG(c.warning, 660)}
</svg>`
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  for (const c of cases) {
    const svg = renderSVG(c)
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 600 } }).render().asPng()
    writeFileSync(resolve(OUT_DIR, c.imageFilename), png)
    console.log(`✓ ${c.imageFilename}  —  ${c.expected}`)
  }

  // Write the CSV the user uploads to the verifier
  const csvHeader = 'id,image_filename,brand_name,class_type,alcohol_content,net_contents,producer_name,country_of_origin'
  const csvLines = cases.map(c =>
    [
      c.id,
      c.imageFilename,
      c.csv.brandName,
      c.csv.classType,
      c.csv.alcoholContent,
      c.csv.netContents,
      c.csv.producerName ?? '',
      c.csv.countryOfOrigin ?? '',
    ].map(escapeCSV).join(',')
  )
  writeFileSync(resolve(ROOT, 'samples/submitted.csv'), [csvHeader, ...csvLines].join('\n') + '\n')

  // Write expected outcomes (for graders / your reference)
  const md = `# Sample Test Set — Expected Outcomes

These ${cases.length} labels were generated by \`scripts/gen-labels.ts\` to exercise the verifier's deterministic match logic and the Government Warning validator.

| ID | File | Expected |
|---|---|---|
${cases.map(c => `| ${c.id} | \`${c.imageFilename}\` | ${c.expected} |`).join('\n')}

## How to use

1. Open the app's **Batch** tab.
2. Upload \`samples/submitted.csv\` as the CSV.
3. Upload all PNGs from \`samples/images/\` as the labels.
4. Click **Run Batch**.
5. Compare results to the expected column above.
`
  writeFileSync(resolve(ROOT, 'samples/EXPECTED.md'), md)

  console.log(`\n✅ Generated ${cases.length} labels + submitted.csv + EXPECTED.md in samples/`)
}

main().catch(e => { console.error(e); process.exit(1) })
