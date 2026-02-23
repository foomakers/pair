import { getLlmPages, formatLlmsFull } from '@/lib/get-llm-text'

export const dynamic = 'force-static'

const SITE_URL = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://pair.foomakers.com'

export function GET() {
  const pages = getLlmPages()
  const body = formatLlmsFull(pages, SITE_URL)
  const byteLength = Buffer.byteLength(body, 'utf-8')

  if (byteLength > 100_000) {
    console.warn(
      `[llms-full.txt] Content size ${(byteLength / 1024).toFixed(1)}KB exceeds 100KB recommended limit`,
    )
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': String(byteLength),
    },
  })
}
