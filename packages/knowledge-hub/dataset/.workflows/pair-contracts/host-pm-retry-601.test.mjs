import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import azure from '../../skills/pair-workflow-cycle/scripts/host/azure-devops.mjs'
import linear from '../../skills/pair-workflow-cycle/scripts/host/linear.mjs'

function executable(responses) {
  const dir = mkdtempSync(join(tmpdir(), 'pair-601-pm-retry-'))
  const count = join(dir, 'count')
  const bin = join(dir, 'host')
  const program = `#!/usr/bin/env node
const fs = require('node:fs')
const file = ${JSON.stringify(count)}
const n = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0
fs.writeFileSync(file, String(n + 1))
const response = ${JSON.stringify(responses)}[Math.min(n, ${responses.length - 1})]
process.stdout.write(response.stdout || '')
process.stderr.write(response.stderr || '')
process.exit(response.status || 0)
`
  writeFileSync(bin, program)
  chmodSync(bin, 0o755)
  return { bin, calls: () => Number(readFileSync(count, 'utf8')) }
}

test('#601 AC1 r0-3: Azure read retries a transient host failure', () => {
  const host = executable([
    { status: 1, stderr: 'HTTP 503 Service Unavailable' },
    { stdout: JSON.stringify({ id: 7, url: 'https://dev.azure.com/acme/_apis/wit/workItems/7', fields: { 'System.Title': 'fixture', 'System.State': 'Active', 'System.TeamProject': 'p' } }) },
  ])
  const pauses = []
  const adapter = azure.instantiate({ azBin: host.bin, sleep: ms => pauses.push(ms) })
  assert.equal(adapter.readCard(7, { fields: ['number'] }).number, 7)
  assert.equal(host.calls(), 2)
  assert.deepEqual(pauses, [1000])
})

test('#601 AC1: Azure writes are never replayed after an ambiguous transient failure', () => {
  const host = executable([{ status: 1, stderr: 'HTTP 503 Service Unavailable' }, { stdout: '{}' }])
  const pauses = []
  const adapter = azure.instantiate({ azBin: host.bin, sleep: ms => pauses.push(ms) })
  assert.throws(() => adapter.updateCard({ id: 7, body: 'update' }))
  assert.equal(host.calls(), 1)
  assert.deepEqual(pauses, [])
})

test('#601 AC1: Azure read stops after four transient attempts', () => {
  const host = executable([{ status: 1, stderr: 'HTTP 503 Service Unavailable' }])
  const pauses = []
  const adapter = azure.instantiate({ azBin: host.bin, sleep: ms => pauses.push(ms) })
  assert.throws(() => adapter.readCard(7), error => error.kind === 'transient-exhausted')
  assert.equal(host.calls(), 4)
  assert.deepEqual(pauses, [1000, 2000, 4000])
})

test('#601 AC1: Azure permanent errors are not retried', () => {
  const host = executable([{ status: 1, stderr: 'HTTP 403 Forbidden' }])
  const adapter = azure.instantiate({ azBin: host.bin, sleep: () => { throw new Error('unexpected retry') } })
  assert.throws(() => adapter.readCard(7), error => error.kind === 'failed')
  assert.equal(host.calls(), 1)
})

test('#601 AC1 r0-3: Linear read retries a transient HTTP response', () => {
  const payload = { data: { issue: { identifier: 'ENG-7', url: 'https://linear.app/acme/issue/ENG-7', title: 'fixture', description: '', labels: { nodes: [] }, state: { name: 'Todo', type: 'unstarted' }, projectItems: { nodes: [] } } } }
  const host = executable([{ stdout: '{}\n503' }, { stdout: `${JSON.stringify(payload)}\n200` }])
  const pauses = []
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: ms => pauses.push(ms) })
    assert.equal(adapter.readCard('ENG-7', { fields: ['number'] }).number, 'ENG-7')
    assert.equal(host.calls(), 2)
    assert.deepEqual(pauses, [1000])
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear writes are never replayed after HTTP 429', () => {
  const payload = { data: { issueUpdate: { success: true } } }
  const host = executable([{ stdout: '{}\n429' }, { stdout: `${JSON.stringify(payload)}\n200` }])
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', retryDelayMs: 0 })
    assert.throws(() => adapter.updateCard({ id: 'ENG-7', body: 'update' }))
    assert.equal(host.calls(), 1)
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear read stops after four transient HTTP responses', () => {
  const host = executable([{ stdout: '{}\n503' }])
  const pauses = []
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: ms => pauses.push(ms) })
    assert.throws(() => adapter.readCard('ENG-7'), error => error.kind === 'transient-exhausted')
    assert.equal(host.calls(), 4)
    assert.deepEqual(pauses, [1000, 2000, 4000])
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear honors a bounded Retry-After header', () => {
  const payload = { data: { issue: { identifier: 'ENG-7', url: 'https://linear.app/acme/issue/ENG-7', title: 'fixture', description: '', labels: { nodes: [] }, state: { name: 'Todo', type: 'unstarted' }, projectItems: { nodes: [] } } } }
  const host = executable([{ stdout: '{}\n503', stderr: 'Retry-After: 3\n' }, { stdout: `${JSON.stringify(payload)}\n200` }])
  const pauses = []
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: ms => pauses.push(ms) })
    assert.equal(adapter.readCard('ENG-7', { fields: ['number'] }).number, 'ENG-7')
    assert.deepEqual(pauses, [3000])
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear reads final response headers from stdout without exposing them', () => {
  const payload = { data: { issue: { identifier: 'ENG-7', title: 'fixture', description: '', labels: { nodes: [] }, state: { name: 'Todo', type: 'unstarted' } } } }
  const host = executable([{ stdout: 'HTTP/1.1 200 Connection established\r\nRetry-After: 0\r\n\r\nHTTP/2 503\r\nRetry-After: 3\r\nSet-Cookie: secret\r\n\r\n{}\n503' }, { stdout: `HTTP/2 200\r\n\r\n${JSON.stringify(payload)}\n200` }])
  const pauses = []
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: ms => pauses.push(ms) })
    assert.equal(adapter.readCard('ENG-7', { fields: ['number'] }).number, 'ENG-7')
    assert.deepEqual(pauses, [3000])
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear never exposes untrusted response headers', () => {
  const host = executable([{ stdout: 'HTTP/2 503\r\nRetry-After: secret-token\r\nSet-Cookie: secret-token\r\n\r\n{}\n503' }])
  const pauses = []
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: ms => pauses.push(ms) })
    assert.throws(() => adapter.readCard('ENG-7', { fields: ['number'] }), error => error.kind === 'transient-exhausted' && !`${error.message} ${error.detail}`.includes('secret-token'))
    assert.deepEqual(pauses, [1000, 2000, 4000])
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear ignores a redirect Retry-After when the final response has none', () => {
  const payload = { data: { issue: { identifier: 'ENG-7', title: 'fixture', description: '', labels: { nodes: [] }, state: { name: 'Todo', type: 'unstarted' } } } }
  const host = executable([{ stdout: 'HTTP/1.1 302 Found\r\nRetry-After: 29\r\n\r\nHTTP/2 503\r\n\r\n{}\n503' }, { stdout: `HTTP/2 200\r\n\r\n${JSON.stringify(payload)}\n200` }])
  const pauses = []
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: ms => pauses.push(ms) })
    assert.equal(adapter.readCard('ENG-7', { fields: ['number'] }).number, 'ENG-7')
    assert.deepEqual(pauses, [1000])
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear does not wait beyond the 30-second budget', () => {
  const host = executable([{ stdout: '{}\n503', stderr: 'Retry-After: 31\n' }])
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: () => { throw new Error('unexpected wait') } })
    assert.throws(() => adapter.readCard('ENG-7'), error => error.kind === 'transient-exhausted')
    assert.equal(host.calls(), 1)
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear honors Retry-After expressed as an HTTP date', () => {
  const payload = { data: { issue: { identifier: 'ENG-7', url: 'https://linear.app/acme/issue/ENG-7', title: 'fixture', description: '', labels: { nodes: [] }, state: { name: 'Todo', type: 'unstarted' }, projectItems: { nodes: [] } } } }
  const host = executable([{ stdout: '{}\n503', stderr: 'Retry-After: Wed, 21 Oct 2015 07:28:05 GMT\n' }, { stdout: `${JSON.stringify(payload)}\n200` }])
  const pauses = []
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: ms => pauses.push(ms), now: () => Date.parse('2015-10-21T07:28:00.000Z') })
    assert.equal(adapter.readCard('ENG-7', { fields: ['number'] }).number, 'ENG-7')
    assert.deepEqual(pauses, [5000])
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear uses Retry-After from the final HTTP response', () => {
  const payload = { data: { issue: { identifier: 'ENG-7', url: 'https://linear.app/acme/issue/ENG-7', title: 'fixture', description: '', labels: { nodes: [] }, state: { name: 'Todo', type: 'unstarted' }, projectItems: { nodes: [] } } } }
  const headers = 'HTTP/1.1 200 Connection established\r\nRetry-After: 0\r\n\r\nHTTP/2 503\r\nRetry-After: 29\r\n\r\n'
  const host = executable([{ stdout: '{}\n503', stderr: headers }, { stdout: `${JSON.stringify(payload)}\n200` }])
  const pauses = []
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: ms => pauses.push(ms), now: () => 0 })
    assert.equal(adapter.readCard('ENG-7', { fields: ['number'] }).number, 'ENG-7')
    assert.deepEqual(pauses, [29000])
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: an intermediate Retry-After does not apply to a final response without one', () => {
  const payload = { data: { issue: { identifier: 'ENG-7', url: 'https://linear.app/acme/issue/ENG-7', title: 'fixture', description: '', labels: { nodes: [] }, state: { name: 'Todo', type: 'unstarted' }, projectItems: { nodes: [] } } } }
  const headers = 'HTTP/1.1 200 Connection established\r\nRetry-After: 0\r\n\r\nHTTP/2 503\r\n\r\n'
  const host = executable([{ stdout: '{}\n503', stderr: headers }, { stdout: `${JSON.stringify(payload)}\n200` }])
  const pauses = []
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: ms => pauses.push(ms) })
    assert.equal(adapter.readCard('ENG-7', { fields: ['number'] }).number, 'ENG-7')
    assert.deepEqual(pauses, [1000])
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC5: Linear does not expose sensitive response headers on curl failure', () => {
  const host = executable([{ status: 23, stderr: 'HTTP/2 503\r\nSet-Cookie: session=FIXTURE_PRIVATE\r\n\r\ncurl: (23) write failed\n' }])
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: () => {} })
    assert.throws(() => adapter.readCard('ENG-7'), error => !`${error.message} ${error.detail}`.includes('FIXTURE_PRIVATE'))
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})

test('#601 AC1: Linear permanent HTTP errors are not retried', () => {
  const host = executable([{ stdout: '{}\n403' }])
  const previous = process.env.LINEAR_API_KEY
  process.env.LINEAR_API_KEY = 'test-token'
  try {
    const adapter = linear.instantiate({ curlBin: host.bin, team: 'ENG', sleep: () => { throw new Error('unexpected retry') } })
    assert.throws(() => adapter.readCard('ENG-7'), error => error.kind === 'failed')
    assert.equal(host.calls(), 1)
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY
    else process.env.LINEAR_API_KEY = previous
  }
})
