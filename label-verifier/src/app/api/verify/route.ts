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
