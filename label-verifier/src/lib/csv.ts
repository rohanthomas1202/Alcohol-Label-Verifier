/**
 * RFC-4180 quote-aware CSV utilities.
 * Handles fields containing commas, double quotes (escaped as ""), and CR/LF.
 */

export function parseCSVRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let fieldStartedWithQuote = false
  let i = 0

  while (i < text.length) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }

    if (c === '"' && field.length === 0) {
      inQuotes = true
      fieldStartedWithQuote = true
      i++
      continue
    }

    if (c === ',') {
      row.push(fieldStartedWithQuote ? field : field.trim())
      field = ''
      fieldStartedWithQuote = false
      i++
      continue
    }

    if (c === '\r' || c === '\n') {
      row.push(fieldStartedWithQuote ? field : field.trim())
      rows.push(row)
      row = []
      field = ''
      fieldStartedWithQuote = false
      if (c === '\r' && text[i + 1] === '\n') i += 2
      else i++
      continue
    }

    field += c
    i++
  }

  if (field.length > 0 || row.length > 0) {
    row.push(fieldStartedWithQuote ? field : field.trim())
    rows.push(row)
  }

  return rows.filter(r => !(r.length === 1 && r[0] === ''))
}

export function escapeCSVField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildCSVRow(values: string[]): string {
  return values.map(escapeCSVField).join(',')
}
