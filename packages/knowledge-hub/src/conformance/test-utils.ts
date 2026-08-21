/**
 * `text.slice(text.indexOf(a), text.indexOf(b))`, but FAILS CLOSED: `indexOf` returns -1 on a
 * miss, and a bare `slice(start, -1)` WIDENS to nearly the whole string instead of narrowing to
 * nothing — the opposite of what a missing section boundary should do to a scoped assertion.
 *
 * This started as two independent copies (`web-cloud-environment.test.ts` and
 * `docs-page-coverage.test.ts`), each hand-fixed in place across rounds 4-5 of the same
 * independent-review loop. A round-6 finding pointed out the duplication itself was the risk —
 * a future hardening of one copy leaves the other fail-open — so this is the one copy both
 * import. Throws a plain `Error` rather than using vitest's `expect` — this file is plain `.ts`,
 * not `.test.ts`, so it is NOT excluded from the package's `tsc --noEmit` (`tsconfig.json`
 * excludes only files ending in `.test.ts`), and vitest's own type declarations are ESM-only;
 * importing `expect` here trips a CJS/ESM `tsc` error that `.test.ts` files never hit. A thrown
 * `Error` inside a test body fails that test exactly the same way `expect(...).toBe(...)` would.
 */
export const sectionBetween = (text: string, startMarker: string, endMarker: string): string => {
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker, start + startMarker.length)
  if (start === -1) throw new Error(`sectionBetween: "${startMarker}" not found`)
  if (end === -1 || end <= start) {
    throw new Error(`sectionBetween: "${endMarker}" not found after "${startMarker}"`)
  }
  return text.slice(start, end)
}
