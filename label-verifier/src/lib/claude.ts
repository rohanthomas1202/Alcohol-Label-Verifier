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
    type: 'object',
    properties: {
      brand_name: {
        type: ['string', 'null'],
        description: 'Brand name as shown on label, or null if not visible',
      },
      class_type: {
        type: ['string', 'null'],
        description: 'Class and type designation, or null if not visible',
      },
      alcohol_content: {
        type: ['string', 'null'],
        description: 'Alcohol content as shown, e.g. "45% Alc./Vol. (90 Proof)", or null if not visible',
      },
      net_contents: {
        type: ['string', 'null'],
        description: 'Net contents/volume, e.g. "750 mL", or null if not visible',
      },
      producer_name: {
        type: ['string', 'null'],
        description: 'Name and address of bottler/producer, or null if not visible',
      },
      country_of_origin: {
        type: ['string', 'null'],
        description: 'Country of origin for imports; null if domestic or not visible',
      },
      government_warning_text: {
        type: ['string', 'null'],
        description: 'Complete government warning text verbatim, or null if not visible',
      },
      government_warning_prefix_caps: {
        type: 'boolean',
        description: 'Is "GOVERNMENT WARNING:" in all capitals?',
      },
      government_warning_prefix_bold: {
        type: 'boolean',
        description: 'Is the "GOVERNMENT WARNING:" prefix visually bold/prominent?',
      },
      image_quality_issues: {
        type: 'array',
        items: { type: 'string' },
        description: 'Image quality issues that may affect accuracy (e.g. blurry, glare, skewed, low-res, partially-obscured)',
      },
    },
    required: [
      'brand_name',
      'class_type',
      'alcohol_content',
      'net_contents',
      'producer_name',
      'country_of_origin',
      'government_warning_text',
      'government_warning_prefix_caps',
      'government_warning_prefix_bold',
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

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'extract_label_fields' },
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
  })

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  )
  if (!toolUse) throw new Error('Claude did not call extract_label_fields tool')

  return toolUse.input as ExtractedFields
}
