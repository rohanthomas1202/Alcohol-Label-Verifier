import { describe, it, expect } from 'vitest'
import { parseCSVRows, escapeCSVField, buildCSVRow } from '@/lib/csv'

describe('parseCSVRows', () => {
  it('parses a simple header + row', () => {
    const out = parseCSVRows('id,name\n001,Acme\n')
    expect(out).toEqual([
      ['id', 'name'],
      ['001', 'Acme'],
    ])
  })

  it('handles quoted fields containing commas', () => {
    const out = parseCSVRows('id,producer\n001,"Smith, Jr. Distillery"\n')
    expect(out).toEqual([
      ['id', 'producer'],
      ['001', 'Smith, Jr. Distillery'],
    ])
  })

  it('handles escaped double quotes inside quoted fields', () => {
    const out = parseCSVRows('id,name\n001,"He said ""hi"""\n')
    expect(out[1]).toEqual(['001', 'He said "hi"'])
  })

  it('handles quoted fields with embedded newlines', () => {
    const out = parseCSVRows('id,note\n001,"line 1\nline 2"\n')
    expect(out).toEqual([
      ['id', 'note'],
      ['001', 'line 1\nline 2'],
    ])
  })

  it('handles CRLF line endings', () => {
    const out = parseCSVRows('id,name\r\n001,Acme\r\n')
    expect(out).toEqual([
      ['id', 'name'],
      ['001', 'Acme'],
    ])
  })

  it('preserves empty trailing fields', () => {
    const out = parseCSVRows('a,b,c\n1,,\n')
    expect(out[1]).toEqual(['1', '', ''])
  })

  it('trims unquoted fields but preserves whitespace inside quotes', () => {
    const out = parseCSVRows('a,b\n  hello  ,"  spaced  "\n')
    expect(out[1]).toEqual(['hello', '  spaced  '])
  })

  it('returns empty for empty input', () => {
    expect(parseCSVRows('')).toEqual([])
  })

  it('skips blank lines from filter', () => {
    const out = parseCSVRows('a,b\n1,2\n')
    expect(out.length).toBe(2)
  })
})

describe('escapeCSVField', () => {
  it('passes plain values through unchanged', () => {
    expect(escapeCSVField('hello')).toBe('hello')
  })

  it('quotes values containing commas', () => {
    expect(escapeCSVField('Smith, Jr.')).toBe('"Smith, Jr."')
  })

  it('escapes internal double quotes', () => {
    expect(escapeCSVField('He said "hi"')).toBe('"He said ""hi"""')
  })

  it('quotes values containing newlines', () => {
    expect(escapeCSVField('line 1\nline 2')).toBe('"line 1\nline 2"')
  })
})

describe('buildCSVRow', () => {
  it('joins values with proper escaping', () => {
    expect(buildCSVRow(['001', 'Smith, Jr.', 'glare;skewed'])).toBe(
      '001,"Smith, Jr.",glare;skewed'
    )
  })

  it('round-trips through parseCSVRows', () => {
    const original = ['001', 'Smith, "Jr." Distillery', 'line 1\nline 2', 'plain']
    const csv = buildCSVRow(original) + '\n'
    const parsed = parseCSVRows(csv)
    expect(parsed[0]).toEqual(original)
  })
})
