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

**Registration is the file itself.** `index.mjs` loads every `<id>.mjs` in the directory whose default export is `defineAdapter({ id: '<id>', … })`. There is no list to edit. A file that fails to load is recorded as broken and can never be bound; the other adapters keep working.

Ship the file in **every** skill's `scripts/host/` (the dataset copies under `packages/knowledge-hub/dataset/.skills/workflow/*/scripts/host/`, then `pnpm mirrors:regenerate` for the installed copies) — the `host-adapter` suite asserts the directories stay identical.

## The eight methods

| Method            | Side (ADR-018) | Contract                                                                                                                             |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `readCard`        | pm-tool        | `readCard(id, { repo, fields })` — no `fields`: `{ body }`, the card text exactly as stored; `fields`: an object with those keys (`number`, `url`, `title`, `body`) |
| `cardHash`        | pm-tool        | **Not yours to write.** `defineAdapter` derives it from `readCard` with the shared canonicalization; an adapter that defines it is refused |
| `prHead`          | code-host      | `prHead({ pr, repo })` → the PR head as a 40-hex sha                                                                                   |
| `upsertComment`   | code-host      | `upsertComment({ pr, marker, body, repo })` → `{ action: created \| updated \| unchanged, id, url, marker }`, or `{ error: body-too-long \| marker-ambiguous }` — build it on `upsertByMarker` |
| `concludeCheck`   | code-host      | `concludeCheck({ pr, sha, repo, state, description, targetUrl })` — `state` ∈ `success \| failure \| pending`, on the EXACT head `sha`; returns `{ context, sha, state, published, error }` and REPORTS a refused write instead of throwing |
| `setPrState`      | code-host      | `setPrState({ pr, repo, label })` — leave exactly one `pr-state:*` label, then read back: `{ applied, removed, confirmed, error }` |
| `merge`           | code-host      | `merge({ pr, repo, strategy, message })` — `strategy` ∈ `squash \| merge \| rebase`; an unsupported one throws `HostError('unsupported')` |
| `closeAndCascade` | pm-tool        | `closeAndCascade({ id, repo, doneState })` — close the card, then each parent whose children are all done; `{ closed: [ids], stoppedAt }` |

Optional primitives (`createCard`, `findCards`, `updateCard`, `parseCardRef`, `listComments`, `readComment`, `parseCommentRef`, `commentRef`, `readCheck`, `readLabels`) serve the scope-decision and `pr-state find` paths. Omit one and only the feature that needs it fails, typed `not-implemented` with the method name. Their shapes are the two shipped adapters'.

Also expose `checkContext` (the check name, `pair-review`), `stateLabels` (the three `pr-state:*` labels) and `errorPrefix` (a short tag the cycle puts in its failure reasons, e.g. `gh`, `az`).

## The rules every adapter keeps

- **CLI-first.** Every method is a CLI spawn through `runCli` from `adapter-kit.mjs`. No MCP, no HTTP client, no network module. List the CLIs in `binaries`; `[]` only for a local tracker with no CLI.
- **No credentials.** Never read, write, store or print a token. The CLI authenticates itself from its own configuration.
- **Take the transport from `create(transport)`.** A test's stub binary comes in there (`transport.<cli>Bin`), with an env override (`PAIR_<CLI>_BIN`) and the bare CLI name as fallbacks. The cycle scripts never name a binary.
- **Fail typed.** Throw `HostError` (`failed`, `invalid-json`, `invalid-output`, `unsupported`). Any other exception is reported as an adapter bug, with the method name.

## Registering the host for a project

Declare it in `.pair/adoption/tech/way-of-working.md`. `index.mjs` resolves the pair once per coordinator start, using ADR-018's rules ([way-of-working / PM-tool + code-host resolution](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md)):

```markdown
- `pm-tool`: `<id>`            ← or the prose "<Tool> is adopted for project management."

## Git Workflow

- `code-host`: `<id>`          ← only when the code lives on a different tool
```

- The value matches the adapter's `id` or one of its `aliases`, case- and separator-insensitively.
- `hostsCode: false` (a tracker with no repositories) means `code-host` has to be declared. Without it, every PR operation fails `code-host-undeclared`.
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
      prHead: ({ pr }) => readPr(pr).head,
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
      concludeCheck({ pr, sha, state, context = 'pair-review' }) {
        const data = readPr(pr)
        data.checks.push({ sha, state, context })
        writePr(pr, data)
        return { context, sha, state, published: true, error: null }
      },
      setPrState({ pr, label }) {
        const data = readPr(pr)
        const removed = data.labels.filter(l => LABELS.includes(l) && l !== label)
        data.labels = [...data.labels.filter(l => !LABELS.includes(l)), label]
        writePr(pr, data)
        return { applied: label, removed, confirmed: true, error: null }
      },
      merge({ pr, strategy = 'squash' }) {
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

Then declare it. `hostsCode` is `false`, so `code-host` has to be declared too:

```markdown
- `pm-tool`: `filesystem`

## Git Workflow

- `code-host`: `filesystem`
```

The coordinator binds it on its next start.

## Checklist for a real host

1. `scripts/host/<id>.mjs` with the seven methods you write, `binaries`, `aliases`, `hostsCode`.
2. A recorder stub for its CLI and tests of all eight methods against it, modeled on `host-adapter.test.mjs`'s `fakeAz`. Tests never call a live service.
3. An implementation guide next to this one (`<id>-implementation.md`), carrying the CLI setup and the auth pointer the adapter assumes.
4. The alias row in [way-of-working / PM-tool + code-host resolution](../../technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) if the product has more than one spelling.
5. The file copied into every workflow skill's `scripts/host/`, and `pnpm mirrors:regenerate`.
