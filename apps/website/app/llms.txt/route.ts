import { getLlmPages, formatLlmsIndex } from '@/lib/get-llm-text'

export const dynamic = 'force-static'

const SITE_URL = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://pair.foomakers.com'

export function GET() {
  const pages = getLlmPages()
  const body = formatLlmsIndex(pages, SITE_URL)

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
