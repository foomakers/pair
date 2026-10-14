#!/usr/bin/env node
// word-limits.mjs — flags body sections over the template's per-section word limits (#433 T-13).
// Usage: node word-limits.mjs check --template <template.md> --body <body.md>
// Exit: 0 within limits (or template declares none) · 1 one or more sections over · 2 usage/IO error.
// Limits: the template's `<!-- word-limits: Section=N; ... -->` comment. Words: whitespace-split,
// HTML comments excluded. Sections: `## ` headings (### stays inside). Headings match ignoring
// leading emoji/punctuation and case. Dependency-free; byte-identical in every writing skill.
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const norm = h => h.replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase()

export function parseLimits(template) {
  const m = /<!-- word-limits: (.*?) -->/s.exec(template)
  if (!m) return null
  const out = new Map()
  for (const part of m[1].split(';')) {
    const kv = /^\s*(.+?)\s*=\s*(\d+)\s*$/.exec(part)
    if (kv) out.set(kv[1], Number(kv[2]))
  }
  return out
}

export function sectionsOf(body) {
  const out = new Map()
  const parts = body.split(/^## (.+)$/m)
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i].trim(), parts[i + 1] ?? '')
  return out
}

export const countWords = s => s.replace(/<!--[\s\S]*?-->/g, ' ').split(/\s+/).filter(Boolean).length

export function check(template, body) {
  const limits = parseLimits(template)
  if (!limits) return { limits: null, over: [], unlimited: [] }
  const byNorm = new Map([...limits].map(([k, v]) => [norm(k), [k, v]]))
  const over = []
  const unlimited = []
  for (const [h, text] of sectionsOf(body)) {
    const hit = byNorm.get(norm(h))
    if (!hit) { unlimited.push(h); continue }
    const words = countWords(text)
    if (words > hit[1]) over.push({ section: hit[0], words, limit: hit[1] })
  }
  return { limits, over, unlimited }
}

function main(argv) {
  const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  const tpl = arg('--template')
  const bodyFile = arg('--body')
  if (argv[0] !== 'check' || !tpl || !bodyFile) {
    console.error('usage: word-limits.mjs check --template <template.md> --body <body.md>')
    return 2
  }
  let template, body
  try {
    template = readFileSync(tpl, 'utf8')
    body = readFileSync(bodyFile, 'utf8')
  } catch (e) {
    console.error(`word-limits: ${e.message}`)
    return 2
  }
  const r = check(template, body)
  if (!r.limits) {
    console.log(`ok: no word-limits comment in ${tpl} — nothing to check`)
    return 0
  }
  for (const o of r.over) console.log(`over: ${o.section} ${o.words}/${o.limit}`)
  if (r.unlimited.length) console.log(`note: no limit for ${r.unlimited.join(', ')}`)
  if (r.over.length) return 1
  console.log('ok: every section within its limit')
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = main(process.argv.slice(2))
