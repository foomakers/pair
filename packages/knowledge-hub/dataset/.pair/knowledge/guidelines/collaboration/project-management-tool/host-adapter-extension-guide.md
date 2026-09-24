# PM / Code-Host Adapter — Extension Guide

How to make the delivery cycle (`/pair-workflow-cycle`, `pair-cli run --card`, the batch engine's stages) talk to a PM tool or code host it does not support yet. Adding a host is **one new file** plus **one way-of-working declaration** — never an edit to an existing adapter, to `cycle-state.mjs`, or to any cycle rule.

## Where adapters live

Every workflow skill that runs a cycle script ships the same directory, byte-identical:

```text
.skills/workflow/<skill>/scripts/host/
├── index.mjs          registry, resolution (ADR-018), the once-per-coordinator binding
├── adapter-kit.mjs    defineAdapter, the shared card hash, the marker upsert, the CLI spawn
├── github.mjs         GitHub (gh)
├── azure-devops.mjs   Azure DevOps (az boards / az repos / az devops invoke)
└── <id>.mjs           ← your adapter
```

**Registration is the file itself.** `index.mjs` exports `loadAdapters(dir)`, which loads every `<id>.mjs` in the directory whose default export is `defineAdapter({ id: '<id>', … })`; there is no list to edit. A file that fails to load is recorded as broken and can never be bound; the other adapters keep working. `resolveHosts({ text, registry })` is the pure function from way-of-working text to `{ pmTool, codeHost }`; `bindHosts({ dir, from, registry, transport })` turns a resolution (or a registry) into the `{ pm, code }` pair a caller uses.

Ship the file in **every** workflow skill's `scripts/host/` — `cycle`, `green-fix`, `implement-phase`, `red-spec`, `red-verify`, `review-phase` (the dataset copies under `packages/knowledge-hub/dataset/.skills/workflow/*/scripts/host/`, then `pnpm mirrors:regenerate` for the installed copies) — the `host-adapter` suite asserts the directories stay identical.

Every `.mjs` file in `scripts/host/` is loaded by `loadAdapters` as a candidate adapter, so a stray helper or test placed there is recorded broken, not run — keep helpers and tests outside the directory.

## The eight methods

`INTERFACE_METHODS` (exported by `index.mjs`, re-exported from `adapter-kit.mjs`) is this list, in order:

| Method            | Side (ADR-018) | Contract                                                                                                                             |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `readCard`        | pm-tool        | `readCard(id, { repo, fields })` — no `fields`: `{ body }`, the card text exactly as stored; `fields`: an object with those keys (`number`, `url`, `title`, `body`) |
| `cardHash`        | pm-tool        | **Not yours to write.** `defineAdapter` derives it from `readCard` with the shared canonicalization; an adapter that defines it is refused |
| `prHead`          | code-host      | `prHead({ pr, repo })` → the PR head as a 40-hex sha; a value that is not a 40-hex sha throws `HostError('invalid-output')` |
| `upsertComment`   | code-host      | `upsertComment({ pr, marker, body, repo })` → `{ action: created \| updated \| unchanged, id, url, marker }`, or `{ error: body-too-long \| marker-ambiguous }` — build it on `upsertByMarker` |
| `concludeCheck`   | code-host      | `concludeCheck({ pr, sha, repo, state, description, targetUrl })` — `state` ∈ `success \| failure \| pending`, posted on the given `sha`; `context` defaults to the adapter's own `checkContext` but is honoured if the caller passes one — cycle callers never do. A well-behaved new adapter refuses to publish when `sha` is not the current PR head, REPORTING `{ published: false }` under its own `checkContext` instead of throwing (the worked example below does this); `github.mjs`/`azure-devops.mjs` post on whatever `sha` and `context` they are given — no cycle caller ever supplies a foreign one. Returns `{ context, sha, state, published, error }` |
| `setPrState`      | code-host      | `setPrState({ pr, repo, label })` — leave exactly one `pr-state:*` label, then read back: `{ applied, removed, confirmed, error }`; cycle callers (`pr-state.mjs`) pass only `stateLabels` values. A well-behaved new adapter refuses a `label` outside `stateLabels` with `confirmed: false` (unknown-label), as the worked example below does; the shipped adapters apply whatever label they are given |
| `merge`           | code-host      | `merge({ pr, repo, strategy, message })` — `strategy` ∈ `squash \| merge \| rebase`; an unsupported one throws `HostError('unsupported')`; on success returns `{ merged, pr, strategy }` |
| `closeAndCascade` | pm-tool        | `closeAndCascade({ id, repo, doneState })` — close the card, then each parent whose children (modelled by the host's own parent field/link) are all done, walking up until a parent has an undone child or none exists; `doneState` defaults to the adapter's own closed/done value (e.g. `'Done'` for Azure DevOps, implicit `completed` for GitHub issues); returns `{ closed: [ids], stoppedAt }` — `stoppedAt` is the id that stopped the cascade, or `null` when it closed every ancestor |

On a **local** host (no repository at all, `hostsCode: false`), `repo` is simply ignored by every method — there is nothing to scope to, so adapters accept and drop it (see the `filesystem` worked example below, whose methods never read `repo`).

Optional primitives (`SUPPORT_METHODS`, exported the same way) serve the scope-decision and `pr-state find` paths:

| Method            | Side (ADR-018) | Contract                                                                                                       |
| ----------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `createCard`      | pm-tool        | `createCard({ repo, title, body })` → returns the created card (adapter-shaped, at least a `url`)               |
| `findCards`       | pm-tool        | `findCards({ repo, search })` → an array of matching cards                                                       |
| `updateCard`      | pm-tool        | `updateCard({ repo, id, body })` → `{ id }`                                                                       |
| `parseCardRef`    | pm-tool        | `parseCardRef(ref, { repo })` → `{ number, inScope }` or `null` when `ref` is not a card reference                |
| `listComments`    | code-host      | `listComments({ pr, repo })` → an array of `{ id, body, url }`                                                    |
| `readComment`     | code-host      | `readComment({ id, repo })` → `{ body, authorLogin, authorIsUser, pr }`                                           |
| `parseCommentRef` | code-host      | `parseCommentRef(ref, { repo })` → `{ pr, id, inScope }` or `null`                                                |
| `commentRef`      | code-host      | `commentRef({ repo, pr, id })` → the comment's URL string                                                         |
| `readCheck`       | code-host      | `readCheck({ sha, repo, context })` → the check's state string, or `null` when absent                            |
| `readLabels`      | code-host      | `readLabels({ pr, repo })` → an array of label name strings                                                       |

Omit one and only the feature that needs it fails, typed `not-implemented` with the method name. Their shapes are the two shipped adapters' (`github.mjs`, `azure-devops.mjs`).

Also expose `checkContext` (the check name, `pair-review`), `stateLabels` (the three `pr-state:*` labels) and `errorPrefix` (a short tag the cycle puts in its failure reasons, e.g. `gh`, `az`).

## The rules every adapter keeps

- **CLI-first.** Every method is a CLI spawn through `runCli` from `adapter-kit.mjs`. No MCP, no HTTP client, no network module. List the CLIs in `binaries: []` only for a local tracker with no CLI — its methods take a stub or nothing through `transport.<x>`, with a `PAIR_<CLI>_BIN` override only mattering when `binaries` is non-empty.
- **No credentials.** Never read, write, store or print a token. The CLI authenticates itself from its own configuration.
- **Take the transport from `create(transport)`.** A test's stub binary comes in there (`transport.<cli>Bin`), with an env override (`PAIR_<CLI>_BIN`) and the bare CLI name as fallbacks. The cycle scripts never name a binary.
- **Fail typed.** Throw `HostError` (`failed`, `invalid-json`, `invalid-output`, `unsupported`). `merge`'s `MERGE_STRATEGIES` and `concludeCheck`'s `CHECK_STATES` (both exported by `adapter-kit.mjs`) are the only accepted values for `strategy` and `state`. Any other exception is reported as an adapter bug, with the method name.

## Registering the host for a project

Declare it in `.pair/adoption/tech/way-of-working.md`. `index.mjs` resolves the pair once per coordinator start, using ADR-018's rules ([way-of-working / PM-tool + code-host resolution](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md)):

```markdown
- `pm-tool`: `<id>`            ← or the prose "<Tool> is adopted for project management."

## Git Workflow

- `code-host`: `<id>`          ← only when the code lives on a different tool
```

- The value matches the adapter's `id` or one of its `aliases` (omitted `aliases` default to `[id]`), case- and separator-insensitively.
- `hostsCode` defaults to `true` when omitted from `defineAdapter`. `hostsCode: false` (a tracker with no repositories) means `code-host` has to be declared. Without it, every PR operation fails `code-host-undeclared`.
- A declared value with no adapter file stops the coordinator with `host-unsupported`, naming the value and the implemented set. The cycle never falls back to GitHub.
- The coordinator binds with `cycle-state.mjs bind-hosts --dir <run/story dir>`. That writes `.host-binding.json`, and every later call naming the directory reuses it, even after way-of-working changes mid-cycle.

## Worked example — a filesystem stub

This is a trivial third host that keeps cards and PRs as local files, useful as a sandbox. The `host-adapter` suite copies the block below **verbatim** into `scripts/host/filesystem.mjs` and runs it, so the example has to keep working.

<!-- worked-example:filesystem -->
```js
// filesystem.mjs — cards as <root>/cards/<id>.md, PRs as <root>/prs/<n>.json. No CLI, no network.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineAdapter, upsertByMarker, HostError } from './adapter-kit.mjs'

const LABELS = ['pr-state:to-be-reviewed', 'pr-state:ready-to-merge', 'pr-state:not-approved']

export default defineAdapter({
  id: 'filesystem',
  hostsCode: false,
  binaries: [],
  create(transport = {}) {
    const root = transport.root ?? join(process.cwd(), '.pair', 'fs-host')
    const card = id => join(root, 'cards', `${id}.md`)
    const prFile = pr => join(root, 'prs', `${pr}.json`)
    const readPr = pr => (existsSync(prFile(pr)) ? JSON.parse(readFileSync(prFile(pr), 'utf8')) : { head: null, comments: [], checks: [], labels: [] })
    const writePr = (pr, data) => {
      mkdirSync(join(root, 'prs'), { recursive: true })
      writeFileSync(prFile(pr), JSON.stringify(data))
    }
    return {
      checkContext: 'pair-review',
      stateLabels: LABELS,
      errorPrefix: 'fs',
      readCard(id, { fields } = {}) {
        if (!existsSync(card(id))) throw new HostError('failed', { command: `read card ${id}`, detail: 'no such card' })
        const body = readFileSync(card(id), 'utf8')
        return fields ? Object.fromEntries(fields.map(f => [f, { number: Number(id), url: card(id), title: body.split('\n')[0], body }[f]])) : { body }
      },
      prHead: ({ pr }) => {
        const head = readPr(pr).head
        if (!/^[0-9a-f]{40}$/.test(head ?? '')) throw new HostError('invalid-output', { command: `pr ${pr} head`, detail: 'not a 40-hex sha' })
        return head
      },
      upsertComment({ pr, marker, body }) {
        const data = readPr(pr)
        return upsertByMarker({
          marker,
          body,
          max: 65536,
          list: () => data.comments,
          update: (hit, full) => {
            hit.body = full
            writePr(pr, data)
            return hit
          },
          create: full => {
            const c = { id: data.comments.length + 1, body: full, url: `${prFile(pr)}#${data.comments.length + 1}` }
            data.comments.push(c)
            writePr(pr, data)
            return c
          },
        })
      },
      concludeCheck({ pr, sha, state }) {
        // A state outside the three CHECK_STATES is a caller bug, not a reportable outcome: it throws.
        if (!['success', 'failure', 'pending'].includes(state)) throw new HostError('unsupported', { message: `check state ${JSON.stringify(state)} (expected success | failure | pending)`, method: 'concludeCheck' })
        // The check always speaks under its OWN context (checkContext), never a caller-supplied one,
        // and only ever lands on the PR's current head — anything else is REPORTED, never thrown.
        const context = 'pair-review'
        const data = readPr(pr)
        if (data.head !== sha) return { context, sha, state, published: false, error: 'not-head' }
        data.checks.push({ sha, state, context })
        writePr(pr, data)
        return { context, sha, state, published: true, error: null }
      },
      setPrState({ pr, label }) {
        // A label outside stateLabels is refused before anything is read back or written.
        if (!LABELS.includes(label)) return { applied: null, removed: [], confirmed: false, error: 'unknown-label' }
        const data = readPr(pr)
        const removed = data.labels.filter(l => LABELS.includes(l) && l !== label)
        data.labels = [...data.labels.filter(l => !LABELS.includes(l)), label]
        writePr(pr, data)
        return { applied: label, removed, confirmed: true, error: null }
      },
      merge({ pr, strategy = 'squash' }) {
        // An unsupported strategy is a caller bug, not a reportable outcome: it throws.
        if (!['squash', 'merge', 'rebase'].includes(strategy)) throw new HostError('unsupported', { message: `merge strategy ${JSON.stringify(strategy)} (expected squash | merge | rebase)`, method: 'merge' })
        writePr(pr, { ...readPr(pr), merged: strategy })
        return { merged: true, pr: Number(pr), strategy }
      },
      closeAndCascade({ id }) {
        writeFileSync(card(id), readFileSync(card(id), 'utf8') + '\n<!-- closed -->\n')
        return { closed: [Number(id)], stoppedAt: null }
      },
    }
  },
})
```

A minimal test proving it end to end — copy it beside your own adapter's tests as a starting point (it never needs the shipped `host-adapter` suite). It gives the adapter an **isolated root** (`transport.root`, a fresh temp directory) rather than the adapter's own `process.cwd()`-relative default, so running it never reads or writes anything under the caller's own `.pair/` and is safe to repeat:

<!-- worked-example:minimal-test -->
```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAdapters, resolveHosts, bindHosts } from '../scripts/host/index.mjs'

const SHA = 'a'.repeat(40)

test('the filesystem worked example resolves and serves a PR operation end to end', async () => {
  const hostDir = fileURLToPath(new URL('../scripts/host/', import.meta.url))
  const { adapters, broken } = await loadAdapters(hostDir)
  assert.equal(broken.size, 0, JSON.stringify([...broken.entries()]))
  const registry = { adapters, broken }
  const declaration = '- `pm-tool`: `filesystem`\n\n## Git Workflow\n\n- `code-host`: `filesystem`\n'
  const { pmTool, codeHost } = resolveHosts({ text: declaration, registry })
  const root = mkdtempSync(join(tmpdir(), 'filesystem-host-')) // isolated: nothing under the caller's cwd
  const { code } = bindHosts({ binding: { pmTool, codeHost }, registry, transport: { root } })
  const created = code.upsertComment({ pr: 1, marker: '<!-- m -->', body: '<!-- m -->\nhi' })
  assert.equal(created.action, 'created')
  mkdirSync(join(root, 'prs'), { recursive: true })
  writeFileSync(join(root, 'prs', '1.json'), JSON.stringify({ head: SHA, comments: [], checks: [], labels: [] }))
  const merged = code.merge({ pr: 1 })
  assert.equal(merged.merged, true)

  // merge: a strategy outside squash | merge | rebase throws HostError('unsupported'), never merges.
  assert.throws(() => code.merge({ pr: 1, strategy: 'fast-forward' }), e => e.kind === 'unsupported', 'merge must refuse an unsupported strategy')

  // concludeCheck: a state outside success | failure | pending throws HostError('unsupported'), never publishes.
  assert.throws(() => code.concludeCheck({ pr: 1, sha: SHA, state: 'bogus' }), e => e.kind === 'unsupported', 'concludeCheck must refuse an unsupported state')

  // prHead: only a 40-hex sha is a valid head — anything else is a typed failure, never null.
  assert.throws(() => code.prHead({ pr: 2 }), e => e.kind === 'invalid-output', 'prHead on a PR with no head must throw invalid-output')

  // setPrState: a label outside stateLabels is refused, never silently confirmed.
  const rejected = code.setPrState({ pr: 1, label: 'pr-state:bogus' })
  assert.equal(rejected.confirmed, false)
  assert.equal(rejected.error, 'unknown-label')

  // concludeCheck: always uses the adapter's own checkContext, and reports (never throws) when the
  // sha given is not the PR's current head.
  const offHead = code.concludeCheck({ pr: 1, sha: 'b'.repeat(40), state: 'success', context: 'not-mine' })
  assert.equal(offHead.published, false)
  assert.equal(offHead.context, 'pair-review')
  const onHead = code.concludeCheck({ pr: 1, sha: SHA, state: 'success' })
  assert.equal(onHead.published, true)
})
```

Then declare it. `hostsCode` is `false`, so `code-host` has to be declared too:

```markdown
- `pm-tool`: `filesystem`

## Git Workflow

- `code-host`: `filesystem`
```

The coordinator binds it on its next start.

## Checklist for a real host

1. `scripts/host/<id>.mjs` with the eight methods you write (`cardHash` is derived, never written), `binaries`, `aliases`, `hostsCode`.
2. A recorder stub for its CLI and tests of all eight methods against it, modeled on `host-adapter.test.mjs`'s `fakeAz`. Tests never call a live service.
3. An implementation guide next to this one (`<id>-implementation.md`), carrying the CLI setup and the auth pointer the adapter assumes.
4. The alias row in [way-of-working / PM-tool + code-host resolution](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) if the product has more than one spelling.
5. The file copied into every workflow skill's `scripts/host/`, and `pnpm mirrors:regenerate`.
