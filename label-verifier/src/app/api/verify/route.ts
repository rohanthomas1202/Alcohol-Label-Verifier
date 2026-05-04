import { NextRequest, NextResponse } from 'next/server'
import { extractLabelFields } from '@/lib/claude'
import { matchFields } from '@/lib/matcher'
import type { VerifyRequest } from '@/types'

export const maxDuration = 60

// 5 MB raw image → ~6.67 MB base64 + small data-URL prefix. 7 MB cap gives headroom.
const MAX_IMAGE_BASE64_BYTES = 7 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerifyRequest

    if (!body.applicationData || typeof body.imageBase64 !== 'string') {
      return NextResponse.json({ error: 'Missing applicationData or imageBase64' }, { status: 400 })
    }

    if (body.imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
      return NextResponse.json(
        { error: 'Image exceeds 5 MB limit' },
        { status: 413 }
      )
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
