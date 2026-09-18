#!/usr/bin/env node
/**
 * Deterministic local HTTPS fixture for AC6 (US-136) — "a well-formed HTTPS URL
 * that returns 404". `NodeHttpClientService` (packages/content-ops/src/http)
 * dials the `https` module unconditionally regardless of the URL's own scheme
 * (verified empirically: `https.get('http://...')` throws `ERR_INVALID_PROTOCOL`
 * before any socket opens), so a plain `python3 -m http.server` never reaches the
 * code path AC6 exercises. This is why the fixture speaks TLS, not the technical
 * note's "python3 -m http.server" suggestion.
 *
 * Usage: node https-404-server.js <keyPath> <certPath>
 * Prints exactly one line — the bound port — to stdout once listening, then
 * serves 404 for every request until killed. Caller is responsible for the port
 * lifecycle (kill the PID); this process never exits on its own.
 */
'use strict'

const https = require('https')
const fs = require('fs')

const [, , keyPath, certPath] = process.argv
if (!keyPath || !certPath) {
  console.error('usage: https-404-server.js <keyPath> <certPath>')
  process.exit(2)
}

const options = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
}

const server = https.createServer(options, (_req, res) => {
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('not found')
})

server.on('error', err => {
  console.error(`https-404-server: ${err.message}`)
  process.exit(1)
})

server.listen(0, '127.0.0.1', () => {
  // Exactly one line, exactly the port: the caller greps stdout for it.
  console.log(String(server.address().port))
})
