#!/usr/bin/env node
/**
 * Deterministic "nothing is listening here" fixture for AC7 (US-136) —
 * connection-refused must be real, not a guess at an unused port number that
 * something else might already occupy. Bind an ephemeral TCP port, then close
 * it immediately: the OS hands back the SAME port on the very next connection
 * attempt as `ECONNREFUSED` (ADL-shape borrowed from the smoke suite's existing
 * `openssl rand` — a real one-shot value, not a guessed constant), for the short
 * window the caller needs.
 *
 * Usage: node closed-port.js
 * Prints exactly one line — the now-closed port — to stdout, then exits 0.
 */
'use strict'

const net = require('net')

const server = net.createServer()
server.on('error', err => {
  console.error(`closed-port: ${err.message}`)
  process.exit(1)
})
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  server.close(() => {
    console.log(String(port))
  })
})
