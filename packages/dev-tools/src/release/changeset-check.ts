import { readFileSync } from 'fs'

/** PR guard: every PR carries `.changeset/*.md` unless labelled `no-changeset`. */
export const NO_CHANGESET_LABEL = 'no-changeset'

export function checkChangeset(addedOrChanged: string[], labels: string[]) {
  const has = addedOrChanged.some(f => /^\.changeset\/(?!README\.md$)[^/]+\.md$/.test(f))
  if (has || labels.includes(NO_CHANGESET_LABEL)) return { ok: true, message: 'changeset ok' }
  return {
    ok: false,
    message: `No .changeset/<story-id>.md in this PR. Add one, or label the PR '${NO_CHANGESET_LABEL}'.`,
  }
}

// CLI: changeset-check <labels-csv>  (changed files on stdin, one per line)
if (require.main === module) {
  const files = readFileSync(0, 'utf8').split('\n').filter(Boolean)
  const labels = (process.argv[2] ?? '').split(',').filter(Boolean)
  const r = checkChangeset(files, labels)
  console.log(r.message)
  process.exit(r.ok ? 0 : 1)
}
