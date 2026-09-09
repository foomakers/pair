export const meta = {
  // The registry keys a workflow by `meta.name`, not by its filename, so the `pair-` prefix
  // has to be HERE too: an adopter with their own `implement-batch` workflow would otherwise
  // collide with this one under an undefined winner. File name and registry name match.
  name: 'pair-implement-batch',
  description:
    'Drive a mutex-safe batch of ready story cards, each to a review-approved PR (implement -> PR -> independent review <-> fix loop). Stops at PR-ready; NEVER merges (human gate).',
  // NOTE: `meta` must be a PURE LITERAL — the loader parses it statically and rejects any
  // expression node. A `+`-concatenated string is a BinaryExpression and makes the whole
  // workflow UNLOADABLE: it silently disappears from the registry and only `scriptPath`
  // reports why. Keep every value here a single literal, however long the line gets
  // (.claude/workflows/ is outside the prettier gate, so no formatter will re-wrap it).
  whenToUse:
    'REQUIRED args shape: {"cards":[{"id":"234","title":"...","branch":"feature/US-234-..."}]} (`stories` is the accepted alias; never pass both) — a bare space-separated list of issue refs is NOT accepted and the run throws: title feeds the prompts and branch feeds `git worktree add`, and the sandbox has no gh/filesystem access to derive them. Optional per card: base (the branch it stacks on), notes (scope directive), prNumber (re-enter the review loop on an existing PR). Optional per run: maxParallelism, severityFloor, model, pipeline (skill names, worktree root, audit-log dir, base branch, review-template path, maxFixRounds). Every value is validated by TYPE at parse time and a wrong one throws before any agent runs; card fields AND pipeline values are also validated by CONTENT (git refs, safe path segments, skill names) because they reach the shell commands the agents run — a value carrying shell syntax or `..` is rejected, never quoted. An unset optional key may be omitted or spelled `undefined`/`null` — all three mean absent; an EMPTY string is not one of them and throws. Pre-filter for mutex safety — no two cards may touch the same shared skill/file. A dependency must be MERGED, not just PR-ready, before its dependent enters a batch. Prefer ONE long run over pause/resume cycles: each stop kills the agents and loses the in-worktree review log. Tell each implementer NOT to run a single command that can be silent for over ~2 minutes (a cold full-repo quality gate qualifies) and to COMMIT AFTER EVERY TASK: the supervisor kills an agent after 180s without visible progress, and an uncommitted worktree loses everything.',
  phases: [
    { title: 'Contracts', model: 'haiku' },
    { title: 'Implement', model: 'opus' },
    { title: 'PR', model: 'sonnet' },
    { title: 'Review', model: 'opus' },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CONTRACT — what `pair-loop` codes against.
// Stable. A rename here breaks a caller this repo cannot see, so treat every name
// below as public API.
//
// INPUT  args = {
//   cards: [{                     // `stories` is the accepted pair-era alias; never both
//     id, title, branch,          // required — id+title feed prompts, branch feeds worktree add
//     base?,                      // the branch this card STACKS on (default: pipeline.baseBranch)
//     notes?,                     // scope directive threaded into implement + PR
//     prNumber?,                  // resume an existing PR straight into the review<->fix loop.
//                                 // A POSITIVE integer (>= 1): `0`/negative do not name a PR,
//                                 // and `0` would skip implement AND the probe and report an
//                                 // unbuilt story as review-approved.
//     requiredFindings?,         // verified P3 evidence that RED must re-prove on its exact
//                                 // observedHead; it stays outside reviewer context.
//   }],                           // every card VALUE is validated, not just its key set: id is one
//                                 // path segment, branch/base are git refs, title/notes are plain
//                                 // text. They reach shell command text an agent runs, so a value
//                                 // carrying shell syntax or `..` is REJECTED, never quoted.
//   maxParallelism?,              // integer >= 1; absent = unbounded fan-out
//   runId?,                       // one safe path segment; names the handoff directory
//                                 // `.pair/working/runs/<runId>/<story>/` every phase skill writes to.
//                                 // Absent → `story-<id>` per card.
//   severityFloor?,               // findings below it are carried, not fixed. It is spelled in
//                                 // the REVIEW TEMPLATE's severity vocabulary (pipeline.reviewTemplate
//                                 // -> contract `vocabulary.severities`), pair's own when none is
//                                 // configured; a value outside that set THROWS rather than rank
//                                 // against a foreign scale.
//   model?,                       // legacy global override: fable | haiku | sonnet | opus
//   models?,                      // role-scoped override. Keys: implementation, pr, reviewer,
//                                 // planner, red, redVerifier, seal, green, preflight. A role key wins
//                                 // over `model`; use this for an A/B trial without changing the
//                                 // independent reviewer or evidence chain.
//   pipeline?,                    // per-key overrides — see PIPELINE_DEFAULTS (skill names,
//                                 // worktreeRoot, auditLogDir, baseBranch, reviewTemplate,
//                                 // maxFixRounds). Its VALUES are validated by the SAME
//                                 // predicates the card fields are: `baseBranch` is a git ref
//                                 // (it is the default for `cards[i].base`, on the same command
//                                 // line), `worktreeRoot`/`auditLogDir`/`reviewTemplate` are
//                                 // relative paths of safe segments (one leading `..` at most),
//                                 // `skills.*` are skill names. A pipeline default reaches the
//                                 // same shell command text a card value does, so it carries the
//                                 // same authority and gets the same check.
// }
//
// PRESENT-BUT-EMPTY IS AN ERROR, at every level: `''` (or whitespace) on any string option —
// `severityFloor`, `model`, any `pipeline` key, any optional CARD field (`base`, `notes`) —
// THROWS rather than being read as absent. The
// three spellings of "unset" are the ones above; an empty string is a value the caller wrote,
// and treating it as absent runs the batch on a setting nobody chose.
//
// UNSET OPTIONAL KEYS. Every `?` key above has ONE spelling for "not set": OMIT it, or set it
// to `undefined` or `null`. All three mean ABSENT, on every optional key, at every level —
// card fields, run options and `pipeline` overrides alike. A caller composing cards in code
// (`{ id, title, branch, prNumber: state.prNumber }`) must not have to branch on whether a
// field happens to be set.
// Anything ELSE that is present and wrong-typed still THROWS — the rule loosens the spelling
// of "absent", never the type check on a value that is actually there.
//
// MUTEX is the CALLER's precondition, not this engine's guarantee: it drives what it is
// given, in parallel. Declaring which cards may run together is `pair-loop`'s dependency
// analysis, because only the caller knows the file sets.
//
// RETURN {
//   contracts: [{ name, status }],
//   batch:     [{ id, status, prNumber?, findings?, acceptedFindings?, story, ... }],
//   died:      [id],              // cards that never returned anything
//   note,                         // derived from the STATUSES: how many cards ADVANCED to a
//                                 // PR (ready-for-merge/escalate) and what the rest did —
//                                 // a batch where every card failed says so, never "ready"
// }
//   status ∈ ready-for-merge | escalate
//          | failed-implement | failed-pr | failed-review | failed-fix
//          | failed-plan | failed-red-contract | failed-preflight | failed-required-findings
//   ONLY `ready-for-merge` may advance. A caller MUST treat every other status — including one
//   this list does not name yet — as halted.
//
// REBASE IS NOT REPAIRED. There is no custody probe, no card-level reset and no
// SHA-scoped history waiver. An in-flight attempt whose base moved fails closed where it is
// measured — the sealer refuses a HEAD that is not its base, the preflight refuses a snapshot
// that is not an ancestor — and a resumed run starts a fresh review on the current head; older
// snapshots are historical evidence, never a later breach. A finding whose only fix is a history
// rewrite is a HUMAN decision: the reviewer types it `humanDecisionKind: 'history-rewrite'` and the
// engine escalates before any RED/seal/GREEN, with nothing in the engine able to accept or waive it.
//
// NEVER `merged`. Merge is the human/policy gate on every path; auto-advance is the loop's
// concern, never this engine's.
// ═══════════════════════════════════════════════════════════════════════════

// ── Model / effort policy ──────────────────────────────────────────────────
// MODEL is set per ROLE in each agent's frontmatter (.claude/agents/*.md): the
// stable default — implementer & reviewer -> opus, contract-generator -> haiku.
// EFFORT is set per STEP below in the agent() opts (the guaranteed lever for a
// running workflow), scaled to the step's difficulty. The one MODEL exception is
// the PR-open step: an implementer doing light checkpoint->PR authoring, dialed
// down to sonnet/medium via opts (opts win over frontmatter). Spend concentrates
// where quality pays: coding (implement/fix, opus/high) and the adversarial
// review gate (opus/xhigh). NOTE: .claude/workflows/ is outside the packages/apps
// prettier gate — keep the one-line opts style already used in this file.

// ── Input ────────────────────────────────────────────────────────────────
// args.stories = the batch of STORIES (never tasks) to drive THIS run. A batch ITEM IS A STORY,
// not a task: each story is delivered on ONE branch with ONE PR — opened the first time and
// UPDATED for all subsequent work on that story (further tasks/features included). NEVER
// one-PR-per-task, and NEVER a second PR for the same story: continuing a story that already
// has a PR reuses its existing branch/{prNumber} and updates that PR (create-or-update). A
// second PR for the same story is forbidden unless a human explicitly instructs it. MUST be
// pre-filtered to be mutex-safe: no two stories here may touch the same shared skill/file
// (pair-next, pair-process-review, record-decision, apps/pair-cli, templates). Chains advance
// ACROSS runs: after you merge these PRs, re-run with the next batch (the now-unblocked heads).
// A story's dependency must be MERGED, not just PR-ready, before its dependent enters a batch.
// Each story: { id, title, branch }. Add { prNumber } to RESUME an existing PR mid-review —
// implement+PR are skipped and the story re-enters the review<->fix loop directly (drives
// remaining findings, incl. minor, to zero). Optional { notes } = a scope directive threaded
// into the implement+PR prompts (overrides the issue body on conflict), e.g. "resolve all
// findings in ONE PR, do not split". An orchestrator asked to drive stories and driving none
// must fail, not report success. An EXPLICIT empty list stays a legal no-op: a caller that
// computed "nothing to do" is not making a mistake.

// Every caller-facing object validates its key SET, not just the keys it recognises.
function rejectUnknownKeys(obj, allowed, where) {
  for (const k of Object.keys(obj ?? {}))
    if (!allowed.includes(k))
      throw new Error(
        `implement-batch: unknown \`${where}.${k}\`; expected one of ${allowed.join(', ')}. ` +
          `An unrecognised key would be dropped in silence and the run would use the default ` +
          `while the caller believed otherwise.`,
      )
}

// ── The value predicates ───────────────────────────────────────────────────
// MODULE scope, not per-card: the CARD fields and the PIPELINE defaults land on the SAME
// command lines (`cards[i].base` and `pipeline.baseBranch` are the same `<base>` argument of
// `git worktree add`; `cards[i].id` and `pipeline.worktreeRoot` are two halves of the one path
// `git worktree remove --force` deletes). They lived inside the per-card `.map()` closure, so
// `resolvePipeline` could not reach them and checked its values for "present and non-empty"
// only — leaving `pipeline.baseBranch: 'origin/main; gh pr merge 432 --admin'` to render a
// merge command, with the flag that bypasses branch protection, into the implement prompt.
// One definition, both callers: a predicate the pipeline layer cannot reach is a predicate the
// pipeline layer will reimplement more loosely.
// Git ref charset. Never a leading `-` (the shell reads it as a flag) and never `..`
// (a traversal in a path position, and illegal in a ref anyway).
const isRef = v => /^[A-Za-z0-9._][A-Za-z0-9._/#-]*$/.test(v) && !v.includes('..')
// Free prose, minus the two forms that become a COMMAND when an agent puts the value on a
// command line: backtick and `$(`. Punctuation, spaces and non-ASCII stay legal — a real
// card title ("PR state flow (gate≠review) + …") must keep working.
const isProse = v => !/[`\r\n\x00-\x1f]/.test(v) && !v.includes('$(')
// Must START alphanumeric, not merely be built from safe characters. `-rf` is read by the shell
// as a FLAG rather than as the path argument it sits in, and `.` resolves to the worktree ROOT
// — `git worktree remove --force <root>/<id>-review` on either is not recoverable. Same rule,
// same spelling, in the sibling engine — held by the differential in the test file.
const isSegment = v => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v) && !v.includes('..')
// A RELATIVE directory/file path the agents `cd` into, create worktrees under and aim
// `git worktree remove --force` at. Every component is a safe segment (so `;`, `&&`, spaces,
// backticks and `$(` cannot survive), never absolute, never starting with `-`.
// EXACTLY ONE leading `..` is legal, because pair's own default IS `../pair-worktrees` — the
// worktree root is a SIBLING of the repository by design. Anything deeper is not: the point of
// `isSegment` on `id` was that a `--force` remove must stay inside the root, and
// `worktreeRoot: '../../../../tmp/evil'` re-opens exactly that, one component to the left.
const isRelPath = v => {
  const parts = v.split('/')
  const rest = parts[0] === '..' ? parts.slice(1) : parts
  return rest.length > 0 && rest.every(p => p !== '.' && p !== '..' && /^[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(p))
}
// A skill NAME, as an agent is told to invoke it: an optional leading slash, then a name.
// A name, never a sentence: `skills.implement: '/x and then gh pr merge 432 --squash'` is
// rendered verbatim into the implement prompt as the process the agent must follow, so the
// space is the giveaway — no legitimate skill reference carries one.
const isSkillRef = v => /^\/?[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(v) && !v.includes('..')
// A STRICTLY POSITIVE integer. `0` and negatives are not smaller values of these fields, they
// are non-values: there is no PR #0, no cap of 0 agents, no 0 fix rounds. `Number.isInteger`
// alone accepted both, and on `cards[i].prNumber` that was the worst input this engine takes —
// `0` flipped the card into RESUME mode (implement + open-PR skipped) while `if (pr?.prNumber)`
// read it as falsy (continuation probe skipped), so the batch reported `ready-for-merge` for a
// card that was never implemented and has no PR. ONE definition for the rule, every numeric
// caller value: `posInt`, `parseMaxParallelism` and the card guard all ask this predicate, so a
// numeric field added later cannot be added with a looser test than the three beside it.
const isPosInt = v => typeof v === 'number' && Number.isInteger(v) && v >= 1

function parseBatchArgs(raw) {
  let a = raw
  if (typeof a === 'string') {
    const t = a.trim()
    try {
      a = JSON.parse(t)
    } catch {
      throw new Error(
        `implement-batch: \`args\` is a string that is not JSON: ${JSON.stringify(t.slice(0, 60))}. ` +
          `A bare list of issue refs is NOT a valid batch — each story needs { id, title, branch }: ` +
          `title goes into the implement/PR prompts and branch into \`git worktree add\`, and this ` +
          `sandbox has no gh/filesystem access to derive either. Pass, verbatim: ` +
          `{"stories":[{"id":"234","title":"PR state flow…","branch":"feature/US-234-pr-state-flow"}]}`,
      )
    }
  }
  // A bare array is unambiguous — read it as the card list.
  if (Array.isArray(a)) a = { cards: a }
  // Both present is an ERROR rather than a preference: silently picking one would drive a batch
  // the caller did not describe.
  if (a && typeof a === 'object' && Array.isArray(a.cards) && Array.isArray(a.stories))
    throw new Error(
      `implement-batch: \`args\` carries both \`cards\` and \`stories\`. They are the same field — ` +
        `\`cards\` is the current name, \`stories\` the accepted alias. Pass exactly one.`,
    )
  // `Object.hasOwn` + the undefined/null test, not a bare `in`: the unset-optional rule of this
  // contract holds HERE too. `in` counted an explicitly-undefined alias key as PRESENT, so `{
  // cards: [...], stories: undefined }` skipped the mapping and threw "`args` must be {
  // stories: [...] }" — telling a caller who passed a list that no list was there, and naming
  // the ALIAS rather than the key they used. Its mirror image (`{ stories, cards: undefined }`)
  // worked, which is the asymmetry the rule exists to remove.
  const hasStories = a && typeof a === 'object' && Object.hasOwn(a, 'stories') && a.stories !== undefined && a.stories !== null
  const hasCards = a && typeof a === 'object' && Array.isArray(a.cards)
  // EVERY error below names the spelling the CALLER actually used, and indexes cards with it.
  // `cards` is the default because it is the contract key; the alias is named only when the
  // alias is what arrived.
  const listKey = hasStories && !hasCards ? 'stories' : 'cards'
  if (hasCards && !hasStories) a = { ...a, stories: a.cards }
  if (!a || typeof a !== 'object' || !Array.isArray(a.stories))
    throw new Error(
      `implement-batch: \`args\` must be { ${listKey}: [...] }` +
        `${listKey === 'cards' ? ' (`stories` is the accepted alias)' : ''} — or a bare array of cards. Received: ` +
        `${a === undefined || a === null ? String(a) : JSON.stringify(a).slice(0, 80)}. ` +
        `Nothing was run — this is an input error, not an empty batch.`,
    )
  const seenIds = new Map()
  const stories = a.stories.map((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s))
      throw new Error(`implement-batch: ${listKey}[${i}] is not an object: ${JSON.stringify(s)}.`)
    // The CARD's key set is validated like every other caller-facing object.
    rejectUnknownKeys(s, ['id', 'title', 'branch', 'base', 'notes', 'requiredFindings', 'prNumber'], `${listKey}[${i}]`)
    // Same rule as the sibling engine.
    if (s.id !== undefined && s.id !== null && typeof s.id !== 'string' && typeof s.id !== 'number')
      throw new Error(
        `implement-batch: ${listKey}[${i}] has id of type ${Array.isArray(s.id) ? 'array' : typeof s.id}, which is not a string or a number. ` +
          `It would be COERCED (an array joins on commas, a boolean becomes "true") and could then pass every ` +
          `value check as an id the caller never wrote — and that id becomes the worktree directory. ` +
          `Pass the issue ref as a string or a number.`,
      )
    const id = String(s.id ?? '').trim().replace(/^#/, '')
    const missing = ['id', 'title', 'branch'].filter(
      k => !String((k === 'id' ? id : s[k]) ?? '').trim(),
    )
    if (missing.length)
      throw new Error(
        `implement-batch: ${listKey}[${i}]${id ? ` (#${id})` : ''} is missing ${missing.join(', ')}. ` +
          `All three are required — id + title feed the prompts, branch feeds \`git worktree add\`; ` +
          `an absent one would reach a shell command as \`undefined\`.`,
      )
    // Presence is not validity. Every field below is interpolated VERBATIM into command text a
    // Bash-capable agent then runs — `git worktree add <root>/<id> -B <branch> <base>` and `git
    // worktree remove --force <root>/<id>-review` — so a card value carries the authority of
    // the command line it lands on.
    const constrain = (value, key, ok, what) => {
      // Reject a present-but-non-string value BEFORE coercing it. `String(value ??
      if (value !== undefined && value !== null && typeof value !== 'string')
        throw new Error(
          `implement-batch: ${listKey}[${i}] (#${id}) has ${key} of type ${Array.isArray(value) ? 'array' : typeof value}, which is not a string. ` +
            `A non-string would be COERCED into the shell commands the agents run (an object becomes "[object Object]", ` +
            `an array joins on commas) as if the caller had typed it. Pass a string, or omit the key.`,
        )
      const v = String(value ?? '').trim()
      // `''` was read as ABSENT here while `args.severityFloor: ''` and `args.pipeline.<key>:
      // ''` both threw for the stated reason. ''` was branched off `pipeline.baseBranch` and
      // the whole `This story is STACKED on …` clause vanished from the implement prompt — a PR
      // built on `origin/main` without its dependency's commits, and a review diffed against
      // the wrong range, with nothing reported. `undefined`/`null` remain the spellings of
      // "unset"; an empty string is a value the caller wrote.
      if (value !== undefined && value !== null && !v)
        throw new Error(
          `implement-batch: ${listKey}[${i}]${id ? ` (#${id})` : ''} has ${key} empty — omit the key entirely (or pass \`null\`/\`undefined\`) to mean "not set". ` +
            `An empty string is a value the caller wrote, and reading it as absent would drive the card on a setting nobody chose.`,
        )
      if (!v) return // absent (undefined/null) — falls back to a default, or was required and caught above
      if (!ok(v))
        throw new Error(
          `implement-batch: ${listKey}[${i}] (#${id}) has ${key} ${JSON.stringify(v)}, which is not ${what}. ` +
            `Card fields are interpolated verbatim into the shell commands the agents run, so a value carrying ` +
            `shell syntax or a path escape would EXECUTE rather than name a ${key}. Rejected, never quoted.`,
        )
    }
    // `isRef` / `isProse` / `isSegment` live at MODULE scope (see the block above
    // `parseBatchArgs`): `resolvePipeline` validates its own values with the SAME predicates,
    // because pipeline defaults and card fields land on the same command lines.
    constrain(id, 'id', isSegment, 'a single safe path segment (it becomes the worktree directory)')
    constrain(s.branch, 'branch', isRef, 'a valid git ref')
    constrain(s.base, 'base', isRef, 'a valid git ref')
    constrain(s.title, 'title', isProse, 'plain text (no backtick, no `$(`, no newline)')
    constrain(s.notes, 'notes', isProse, 'plain text (no backtick, no `$(`, no newline)')
    // A verified P3 result must not disappear merely because a later independent reviewer
    // sampled a different portion of the same head. A different head is not "probably close
    // enough": that would turn old evidence into a new specification without rerunning its
    // oracle.
    let requiredFindings = []
    if (s.requiredFindings !== undefined && s.requiredFindings !== null) {
      if (!Array.isArray(s.requiredFindings) || s.requiredFindings.length === 0)
        throw new Error(
          `implement-batch: ${listKey}[${i}] (#${id}) requiredFindings must be a non-empty array when provided.`,
        )
      const requiredKeys = new Set()
      requiredFindings = s.requiredFindings.map((finding, j) => {
        if (!finding || typeof finding !== 'object' || Array.isArray(finding))
          throw new Error(`implement-batch: ${listKey}[${i}] (#${id}) requiredFindings[${j}] must be an object.`)
        rejectUnknownKeys(
          finding,
          ['observedHead', 'location', 'severity', 'description', 'recommendation', 'oracle', 'probe', 'observed'],
          `${listKey}[${i}].requiredFindings[${j}]`,
        )
        if (typeof finding.observedHead !== 'string' || !/^[0-9a-f]{40}$/.test(finding.observedHead))
          throw new Error(
            `implement-batch: ${listKey}[${i}] (#${id}) requiredFindings[${j}].observedHead must be the lower-case 40-character SHA on which its oracle was measured.`,
          )
        const normalized = { observedHead: finding.observedHead }
        for (const key of ['location', 'severity', 'description', 'recommendation', 'oracle', 'probe', 'observed']) {
          const value = finding[key]
          if (typeof value !== 'string' || !value.trim() || !isProse(value.trim()))
            throw new Error(
              `implement-batch: ${listKey}[${i}] (#${id}) requiredFindings[${j}].${key} must be non-empty plain text (no backtick, no \`$(\`, no newline).`,
            )
          normalized[key] = value.trim()
        }
        const key = `${normalized.observedHead}\u0000${normalized.location}\u0000${normalized.description}\u0000${normalized.recommendation}`
        if (requiredKeys.has(key))
          throw new Error(`implement-batch: ${listKey}[${i}] (#${id}) requiredFindings contains the same measured finding more than once.`)
        requiredKeys.add(key)
        return normalized
      })
    }
    // `prNumber` decides the ENTIRE lifecycle: an integer re-enters the review loop on the
    // existing PR, anything else falls through to implement+publishPr. An UNSET optional key
    // has ONE spelling across the whole card: `undefined`/`null` mean ABSENT here exactly as
    // they already do in `constrain`. `Object.hasOwn`, not `in`: `in` walks the prototype
    // chain. POSITIVE, not merely integral (`isPosInt`, the same predicate
    // `posInt`/`maxParallelism` ask). `Number.isInteger(0)` is true, so `prNumber: 0` passed
    // and then decided the lifecycle wrongly TWICE: `resuming` became true (implement + open-PR
    // skipped) while `if (pr?.prNumber)` read the same `0` as falsy (continuation probe
    // skipped), and the batch returned `ready-for-merge` for a card that was never implemented
    // and has no PR. `0` is what a caller composing cards in code produces from `Number(row.pr
    // ?? '')`, an uninitialized counter or a tracker field defaulting to 0 — the same shape as
    // the `prNumber: undefined` defect, one value along.
    if (Object.hasOwn(s, 'prNumber') && s.prNumber !== undefined && s.prNumber !== null && !isPosInt(s.prNumber))
      throw new Error(
        `implement-batch: ${listKey}[${i}] (#${id}) has prNumber ${JSON.stringify(s.prNumber)}, which is not a positive integer (>= 1). ` +
          `An unusable value is NOT treated as "no PR": a non-integer would run implement + open a SECOND PR for a story ` +
          `that already has one, and \`0\` or a negative would SKIP implement and the PR entirely and report a story ` +
          `that was never built as review-approved. Pass the real PR number, or omit the key entirely to start a fresh story.`,
      )
    // Two cards with the same id resolve to the SAME worktree path, so under an unbounded cap
    // two implementers would interleave `git worktree add`/checkout/commit in one working tree
    // and one card's committed work would be lost. `died` also mis-reports: it matches on the
    // surviving twin, so a duplicate that failed reads as having returned.
    if (seenIds.has(id))
      throw new Error(
        `implement-batch: ${listKey}[${seenIds.get(id)}] and ${listKey}[${i}] both carry id #${id}. ` +
          `One story is one worktree and one PR — two cards sharing an id would run two ` +
          `implementers in the same working tree and lose one of them. Pass each story once.`,
      )
    seenIds.set(id, i)
    return { ...s, id, requiredFindings }
  })
  // Return the NORMALIZED container, not just the list. Every option must be read from the
  // parsed object, once.
  rejectUnknownKeys(a, ['cards', 'stories', 'severityFloor', 'model', 'models', 'pipeline', 'maxParallelism', 'runId'], 'args')
  // Reject the TYPE before anything coerces it, the same rule `constrain` applies to card
  // fields. Checked HERE, at parse time, not where each is consumed: `severityFloor` is only
  // rankable after the contract dispatch, and a wrong TYPE should not wait on an agent to be
  // reported.
  for (const key of ['severityFloor', 'model', 'runId']) {
    if (a[key] !== undefined && a[key] !== null && typeof a[key] !== 'string')
      throw new Error(
        `implement-batch: \`args.${key}\` has ${key} of type ${Array.isArray(a[key]) ? 'array' : typeof a[key]}, which is not a string. ` +
          `It would be COERCED (an array joins on commas) into a value the caller never wrote. Pass a string, or omit the key.`,
      )
    // An EMPTY string is a present value that says nothing, and it was read as ABSENT — the one
    // spelling of "unset" this contract does NOT recognise, while `args.pipeline.<key>: ''` one
    // function away throws for exactly the stated reason. The realistic caller is config-driven
    // (`severityFloor: cfg.floor ?? ''`, or a JSON template rendering an unset key as `""`) and
    // paid the full fix-round budget with every finding blocking, believing the floor was set.
    if (typeof a[key] === 'string' && !a[key].trim())
      throw new Error(
        `implement-batch: \`args.${key}\` is empty — omit the key entirely (or pass \`null\`/\`undefined\`) to mean "not set". ` +
          `An empty string is a value the caller wrote, and reading it as absent would run the batch on a setting nobody chose.`,
      )
  }
  const modelRoles = ['implementation', 'pr', 'reviewer', 'planner', 'red', 'redVerifier', 'seal', 'green', 'preflight']
  let models
  if (a.models !== undefined && a.models !== null) {
    if (typeof a.models !== 'object' || Array.isArray(a.models))
      throw new Error('implement-batch: `args.models` must be an object keyed by workflow role, or be omitted.')
    rejectUnknownKeys(a.models, modelRoles, 'args.models')
    models = {}
    for (const [role, value] of Object.entries(a.models)) {
      if (typeof value !== 'string' || !value.trim())
        throw new Error(`implement-batch: \`args.models.${role}\` must be a non-empty model name.`)
      models[role] = value.trim()
    }
  }
  const runId = a.runId === undefined || a.runId === null ? undefined : String(a.runId).trim()
  if (runId !== undefined && !isSegment(runId))
    throw new Error(
      `implement-batch: \`args.runId\` ${JSON.stringify(runId)} is not a single safe path segment — it names the handoff directory under .pair/working/runs/.`,
    )
  return { stories, severityFloor: a.severityFloor, model: a.model, models, pipeline: a.pipeline, maxParallelism: a.maxParallelism, runId }
}
const PARSED = parseBatchArgs(args)
const RUN_ID = PARSED.runId
// The coordinator's own version, returned with every result and handed to every phase skill so
// each handoff records which coordinator produced it. Bump on any change to the dispatch
// contract (skill names, argument names, statuses).
const WORKFLOW_VERSION = '2.0.0'

// ── Pipeline configuration: what makes this engine reusable ─────────────────
// Every value here was a literal spelled `pair` somewhere in a prompt. They are now resolved
// ONCE, with pair's own values as the defaults, so two things hold at the same time: an adopter
// whose skills are named differently drives the same engine by passing `args.pipeline`, and
// pair's own dogfood invocation keeps working with no configuration at all — the defaults ARE
// what the script said before. Resolution is per-key, not all-or-nothing: a caller overriding
// one skill name keeps the defaults for the rest.
const PIPELINE_DEFAULTS = {
  skills: {
    implement: '/pair-process-implement',
    publishPr: '/pair-capability-publish-pr',
    review: '/pair-process-review',
    verifyQuality: '/pair-capability-verify-quality',
    checkpoint: '/pair-capability-checkpoint',
    recordDecision: '/pair-capability-record-decision',
    writeIssue: '/pair-capability-write-issue',
    // The engine dispatches them BY NAME with typed arguments; every step, rule and command of
    // the review ↔ fix loop lives in the skill, not here. An adopter who renames them overrides
    // the key, exactly like the six above.
    remediationPlan: '/pair-workflow-remediation-plan',
    redSpec: '/pair-workflow-red-spec',
    redVerify: '/pair-workflow-red-verify',
    redSeal: '/pair-workflow-red-seal',
    greenFix: '/pair-workflow-green-fix',
    p3Verify: '/pair-workflow-p3-verify',
    reviewPhase: '/pair-workflow-review-phase',
    cycleComments: '/pair-workflow-cycle-comments',
    contractPhase: '/pair-workflow-contract-phase',
    implementPhase: '/pair-workflow-implement-phase',
    prPhase: '/pair-workflow-pr-phase',
  },
  worktreeRoot: '../pair-worktrees',
  auditLogDir: '.pair/working/reviews',
  baseBranch: 'origin/main',
  // A FULL path, not a basename. Path and label are now independent: the label is derived with
  // `templateLabel()` below. The path is repo-relative (one leading `..` at most, like every
  // other path here): a template reachable only through a deep traversal is outside the
  // repository, and the agent handed it has `Read`/`Write`.
  reviewTemplate: '.pair/knowledge/guidelines/collaboration/templates/code-review-template.md',
  // Rounds of autonomous fix<->re-review before escalating to a human.
  maxFixRounds: 3,
}

// The human-readable NAME of the contract template, for the prompt sentence "using the …
// vocabulary". Derived from the path so a configured path never leaks into prose.
const templateLabel = (p) => String(p).split('/').filter(Boolean).pop() || String(p)

function resolvePipeline(raw) {
  // `undefined`/`null` = absent, the same rule every optional key in this contract follows.
  if (raw === undefined || raw === null) return PIPELINE_DEFAULTS
  if (typeof raw !== 'object' || Array.isArray(raw))
    throw new Error(
      `implement-batch: \`args.pipeline\` must be an object; received ${JSON.stringify(raw).slice(0, 60)}. ` +
        `Omit it entirely to run on pair's defaults.`,
    )
  rejectUnknownKeys(raw, ['skills', 'worktreeRoot', 'auditLogDir', 'baseBranch', 'reviewTemplate', 'maxFixRounds'], 'args.pipeline')
  // Every value below is interpolated VERBATIM into the same command text `cards[i]` values
  // are, so it is validated by the SAME predicates — `ok`/`what` are not optional. Presence is
  // not validity here either: `baseBranch` is the `<base>` argument of `git worktree add`
  // whenever a card does not carry its own, and `worktreeRoot` is the directory
  // `git worktree remove --force <root>/<id>-review` deletes.
  const str = (v, key, fallback, ok, what) => {
    // `null` is ABSENT here too, not a bad value — one spelling for an unset optional key
    // across the whole contract (see the contract block's "unset optional" rule).
    if (v === undefined || v === null) return fallback
    // `String(v)` on an object yields '[object Object]', which interpolates into a prompt as
    // a skill name no agent can follow. Reject the type rather than coerce it.
    if (typeof v !== 'string')
      throw new Error(
        `implement-batch: \`args.pipeline.${key}\` must be a string; received ${typeof v}.`,
      )
    const t = String(v).trim()
    // An empty override is the dangerous case: it would interpolate as an empty string and
    // produce `cd /` or a bare `git worktree add`. Reject it rather than fall back silently,
    // so a caller who meant to configure something learns that they did not.
    if (!t) throw new Error(`implement-batch: \`args.pipeline.${key}\` is empty — omit the key to keep the default (${fallback}).`)
    if (!ok(t))
      throw new Error(
        `implement-batch: \`args.pipeline.${key}\` is ${JSON.stringify(t)}, which is not ${what}. ` +
          `Pipeline values are interpolated verbatim into the shell commands the agents run — the same command lines the ` +
          `card fields are validated for — so a value carrying shell syntax or a path escape would EXECUTE rather than ` +
          `name a ${key}. Rejected, never quoted.`,
      )
    return t
  }
  // `args.pipeline` is type-checked; its nested object was not.
  if (raw.skills !== undefined && raw.skills !== null && (typeof raw.skills !== 'object' || Array.isArray(raw.skills)))
    throw new Error(
      `implement-batch: \`args.pipeline.skills\` must be an object; received ${Array.isArray(raw.skills) ? 'array' : typeof raw.skills}. ` +
        `A non-object would be silently ignored and pair's own skill names would run instead. Omit the key to keep them deliberately.`,
    )
  rejectUnknownKeys(raw.skills, Object.keys(PIPELINE_DEFAULTS.skills), 'args.pipeline.skills')
  const skills = { ...PIPELINE_DEFAULTS.skills }
  for (const [k, v] of Object.entries(raw.skills ?? {}))
    skills[k] = str(v, `skills.${k}`, PIPELINE_DEFAULTS.skills[k], isSkillRef, 'a skill name as an agent invokes one — no spaces, no shell syntax, no `..`')
  return {
    skills,
    worktreeRoot: str(raw.worktreeRoot, 'worktreeRoot', PIPELINE_DEFAULTS.worktreeRoot, isRelPath, 'a relative path built from safe segments (at most one leading `..`; it is the root a `--force` worktree remove is aimed at)'),
    auditLogDir: str(raw.auditLogDir, 'auditLogDir', PIPELINE_DEFAULTS.auditLogDir, isRelPath, 'a relative path built from safe segments (at most one leading `..`)'),
    baseBranch: str(raw.baseBranch, 'baseBranch', PIPELINE_DEFAULTS.baseBranch, isRef, 'a valid git ref (it is the `<base>` argument of `git worktree add`, exactly like a card\'s `base`)'),
    reviewTemplate: str(raw.reviewTemplate, 'reviewTemplate', PIPELINE_DEFAULTS.reviewTemplate, isRelPath, 'a relative path built from safe segments (at most one leading `..`)'),
    maxFixRounds: posInt(raw.maxFixRounds, 'maxFixRounds', PIPELINE_DEFAULTS.maxFixRounds),
  }
}
// The one NUMERIC pipeline key. Rejected rather than coerced, for the same reason
// `maxParallelism` is: a cap that cannot be honoured must not silently become pair's default —
// the discarded setting is the one deciding how much autonomous work happens before a human is
// asked, so the failure would be a loop running three rounds while the caller believes it runs
// one. `'2'` is the shape a hand-written JSON arg produces, so it is named explicitly.
function posInt(v, key, fallback) {
  if (v === undefined || v === null) return fallback
  if (!isPosInt(v))
    throw new Error(
      `implement-batch: \`args.pipeline.${key}\` must be an integer >= 1; received ${JSON.stringify(v)}. ` +
        `Omit the key to keep pair's default (${fallback}) — it is never inferred from a bad value.`,
    )
  return v
}

// ── Bounded fan-out ────────────────────────────────────────────────────────
// `pair-loop` derives a ceiling from `tech/automation.md` (ADR-017 §6) and passes it here. The
// bound has to live in THIS file: the sandbox `parallel` primitive is an unbounded
// `Promise.all`, so handing it N thunks starts N agents no matter what the caller asked for.
// Absent cap = today's behaviour, unbounded. That default is deliberate: every existing caller
// keeps the fan-out it already has, so landing this option changes nobody's run.
function parseMaxParallelism(raw) {
  if (raw === undefined || raw === null) return undefined
  // Rejected rather than coerced.
  if (!isPosInt(raw))
    throw new Error(
      `implement-batch: \`args.maxParallelism\` must be an integer >= 1; received ${JSON.stringify(raw)}. ` +
        `Omit it entirely for unbounded fan-out — it is never inferred from a bad value.`,
    )
  return raw
}
const MAX_PARALLELISM = parseMaxParallelism(PARSED.maxParallelism)

// Runs `thunks` with at most `cap` in flight. Mirrors `parallel`'s contract exactly:
// results stay in INPUT order, and a thunk that throws resolves to `null` instead of
// rejecting the whole batch — one card dying must not cancel the others mid-flight.
async function boundedParallel(thunks, cap) {
  if (!cap || cap >= thunks.length) return parallel(thunks)
  const results = new Array(thunks.length)
  let next = 0
  const worker = async () => {
    while (next < thunks.length) {
      const i = next++
      try {
        results[i] = await thunks[i]()
      } catch {
        results[i] = null
      }
    }
  }
  await Promise.all(Array.from({ length: cap }, worker))
  return results
}

const PIPELINE = resolvePipeline(PARSED.pipeline)
const SK = PIPELINE.skills
// The reviewer prompt names the template TWICE as prose ("using the … vocabulary", "… structure").
// Interpolating the configured PATH there produced a sentence like "using the
// ../../../kb/templates/code-review-template.md vocabulary"; the label keeps the two independent.
const REVIEW_TEMPLATE_LABEL = templateLabel(PIPELINE.reviewTemplate)
// The blindness clause has to name the CONFIGURED working locations, not pair's literals: a
// caller that sets `auditLogDir` to `.ops/reviews` would otherwise leave the file holding every
// prior round's findings unnamed, and "the review is independent and blind" would go unguarded.
const BLIND_PATHS = [...new Set(['.pair/working/', PIPELINE.auditLogDir])].map((p) => `\`${p}\``).join(' or ')

const STORIES = PARSED.stories

// ── Severity floor: what BLOCKS convergence, versus what is carried to the human ──
// Convergence requires ZERO actionable findings, so a single Minor keeps the loop open — and on
// markdown skill files the supply of Minors is effectively inexhaustible (duplicated rationale
// between a skill and its ADL, a wording ambiguity, an assertion that cannot fail
// independently). Each round also enlarges the diff, creating fresh surface for the next round
// to read. The loop therefore cannot terminate by fixing, only by exhausting MAX_FIX_ROUNDS.
// `severityFloor` names the lowest severity that BLOCKS. Absent → every actionable finding
// blocks (the previous behaviour), so nothing changes for a caller that does not ask for a
// floor. The floor speaks the REVIEW's OWN vocabulary, not a table private to this file: the
// contract derived from the configured template supplies the severities and their explicit
// ranks, and a floor outside that set throws rather than rank against a foreign scale. A
// severity in neither the configured vocabulary nor pair's table blocks (rank Infinity), so an
// unknown severity can never fall below a floor. Prototype-free, like every
// rank map below it: a severity is arbitrary text from a review template, so
// `ranks['constructor']` on a plain object returns an INHERITED function — not a number, not
// undefined, so `?? Infinity` never fires and every `<`/`>=` comparison against it is false.
const SEVERITY_RANK = Object.assign(Object.create(null), { critical: 4, blocker: 4, major: 3, minor: 2, questions: 1, question: 1, nit: 1, info: 1 })
const normSeverity = (s) => String(s ?? '').trim().toLowerCase()
// The rank of a CONFIGURED severity is the EXPLICIT ordinal the contract states for it
// (`severityRanks`, higher = more severe), never the position of its name in
// `vocabulary.severities`. And the contract is hash-cached, so one bad extraction persists
// across every later batch. Hence: ordinals are stated and validated (`ensure-contract.mjs`),
// and when they are missing or ambiguous this engine REFUSES to rank rather than guessing an
// order — see `parseFloor`. With no contract at all there is no configured vocabulary, and
// pair's own table is the fallback. It carries aliases (`blocker`, `nit`, `info`) that no
// template lists, which is why it is not itself derived from DEFAULT_SEVERITIES. Where they are
// actually reachable, stated precisely rather than as a vague "callers use them": (a) as a
// caller-passed `severityFloor`, because `parseFloor` validates against
// `Object.keys(SEVERITY_RANK)` on the unconfigured path, so `severityFloor: 'blocker'` is
// accepted and ranks with `critical`; (b) as the severity of a FINDING whose reviewer answered
// off-vocabulary — the prompt names DEFAULT_SEVERITIES (Critical|Major|Minor|Questions), so a
// `Blocker` coming back is a reviewer deviating from it, and the alias is what keeps that
// finding ranked instead of falling to `Infinity`. Neither is the normal path. They are kept
// because removing them is a BREAKING change for a floor an adopter may already pass, not
// because the normal path needs them — and (b) is fail-safe either way, since `Infinity`
// blocks. `severityRankErrors` duplicates ensure-contract.mjs's canonical check, and the
// duplication is FORCED, not lazy: this sandbox has no filesystem and no imports, so the only
// contract bytes that ever reach it are an agent's RETURN VALUE. The copy `ensure-contract.mjs
// write` validated on disk is unreadable from here, and dispatching a second agent to read it
// back would yield another unvalidated agent return value — the same trust boundary, one
// dispatch more expensive. So this function is NOT a redundant second line: it is THE
// validation on the path that decides the severity floor, and it may never be weaker than the
// canonical one. Keys are therefore matched EXACTLY, as canonical does, plus one rule canonical
// does not need: two VOCABULARY names that normalize to the same string (`High` and `high` both
// listed) would collapse this consumer's normalized lookup map, so that vocabulary is refused
// too. Strictly stronger than canonical, never looser — asserted by the canonical/consumer
// differential in the test file, which CAN import the real module.
function severityRankErrors(names, severityRanks) {
  if (!severityRanks || typeof severityRanks !== 'object' || Array.isArray(severityRanks))
    return ['severityRanks is missing: the contract states no explicit rank per severity, and the order of `vocabulary.severities` is not a ranking']
  const errors = []
  const keys = Object.keys(severityRanks)
  const missing = names.filter((n) => !keys.includes(n))
  if (missing.length) errors.push(`severityRanks is missing a rank for: ${missing.join(', ')}`)
  const extra = keys.filter((k) => !names.includes(k))
  if (extra.length) errors.push(`severityRanks ranks names absent from vocabulary.severities: ${extra.join(', ')} — a key that is not spelled exactly as the vocabulary spells it (a case variant included) is ambiguous, never a synonym`)
  // Consumer-specific: ranks are looked up by NORMALIZED severity, so two names that
  // normalize alike cannot both be ranked — the second would silently overwrite the first.
  const seen = new Map()
  for (const n of names) {
    const norm = normSeverity(n)
    if (seen.has(norm) && seen.get(norm) !== n)
      errors.push(`vocabulary.severities is ambiguous: ${seen.get(norm)} and ${n} differ only in case/whitespace, so their ranks cannot be told apart`)
    else seen.set(norm, n)
  }
  const byRank = new Map()
  for (const key of keys) {
    const value = severityRanks[key]
    if (typeof value !== 'number' || !Number.isInteger(value))
      errors.push(`severityRanks.${key} must be an integer (higher = more severe), got ${JSON.stringify(value)}`)
    else if (byRank.has(value))
      errors.push(`severityRanks must be unique: ${byRank.get(value)} and ${key} share rank ${value} — an ambiguous scale cannot decide a severity floor`)
    else byRank.set(value, key)
  }
  return errors
}
function resolveSeverityScale(severities, severityRanks) {
  // Names keep their ORIGINAL spelling — the error message tells a caller what to type, and
  // `blocker, high, medium, low` is not what their template says. Ranks are keyed normalized,
  // so matching stays case- and whitespace-insensitive.
  const names = (Array.isArray(severities) ? severities : []).map((s) => String(s ?? '').trim()).filter(Boolean)
  if (!names.length) return { ranks: SEVERITY_RANK, names: [...new Set(Object.keys(SEVERITY_RANK))], configured: false, rankError: null }
  const errors = severityRankErrors(names, severityRanks)
  // `ranks: null` = the vocabulary is known but its ORDERING is not. The run still uses the
  // contract (schema + reviewer prompt); only ranking — i.e. a floor — is refused, loudly.
  if (errors.length) return { ranks: null, names: [...new Set(names)], configured: true, rankError: errors.join('; ') }
  // Prototype-free and built from the EXACT keys the check above accepted — after it, every
  // name is a key of `severityRanks` spelled identically, and no two names normalize alike.
  const ranks = Object.create(null)
  for (const n of names) ranks[normSeverity(n)] = severityRanks[n]
  return { ranks, names: [...new Set(names)], configured: true, rankError: null }
}
// Resolved once the contract is known — see SEVERITY_SCALE, after REVIEW_VOCAB. Infinity, not a
// mid-tier default: a severity in NEITHER the configured vocabulary nor pair's own table
// outranks every possible floor, so it always blocks. The previous `?? 3` claimed to be
// fail-safe and was not — any floor of rank >= 4 sat above it. Unreachable with an unranked
// scale (no floor can exist then), and Infinity there too for the same reason. Own-key
// membership answers it once, for both the prototype-free maps and any future one that is not.
const rankOf = (s) => {
  const map = SEVERITY_SCALE.ranks
  if (!map) return Infinity
  const key = normSeverity(s)
  return Object.hasOwn(map, key) ? map[key] : Infinity
}
function parseFloor(raw) {
  const v = String(raw ?? '').trim()
  if (!v) return null
  // An unranked configured vocabulary cannot answer "is this below the floor?", and the one
  // answer that is never acceptable is a guess: refuse the floor and name the real cause.
  // Direction is safe — without a floor every actionable finding blocks.
  if (!SEVERITY_SCALE.ranks)
    throw new Error(
      `implement-batch: severityFloor ${JSON.stringify(v)} cannot be applied — the review template's machine contract carries no usable severity ranking (${SEVERITY_SCALE.rankError}). ` +
        `Rank is NEVER inferred from the order of \`vocabulary.severities\`: delete the cached \`*.contract.json\` so the generator re-runs and emits \`severityRanks\`, ` +
        `or omit \`severityFloor\` so every actionable finding blocks.`,
    )
  const key = normSeverity(v)
  // Membership, not truthiness: an explicit ordinal may legitimately be `0` (a template's
  // lowest level), and `!r` would have rejected exactly that floor as a typo.
  const r = Object.hasOwn(SEVERITY_SCALE.ranks, key) ? SEVERITY_SCALE.ranks[key] : undefined
  // A floor the reviewer cannot express is a configuration error, never a silent
  // reclassification: rejecting it is what stops `Critical` from out-ranking an adopter's whole
  // scale. A typo still throws, in either vocabulary. TWO different failures wear the same
  // shape here, and the message decides which one an operator goes looking for. When a contract
  // WAS derived, an unmatched floor is a caller typo. Naming the transient cause is what makes
  // a re-run the obvious next step.
  if (r === undefined)
    throw new Error(
      SEVERITY_SCALE.configured
        ? `implement-batch: unknown severityFloor ${JSON.stringify(v)}. It must be one of the severities the configured review template declares: ` +
          `${SEVERITY_SCALE.names.join(', ')} — or omit it so every actionable finding blocks.`
        : `implement-batch: severityFloor ${JSON.stringify(v)} cannot be applied — no machine contract could be derived for the review template on this run, so the only vocabulary available is pair's own default ` +
          `(${SEVERITY_SCALE.names.join(', ')}). If ${JSON.stringify(v)} is a severity YOUR template declares, this is a contract-generation failure and not a typo: re-run (the generator is dispatched once per batch and its result is hash-cached), ` +
          `check \`contracts[].status\` in the previous run's result, or omit \`severityFloor\` so every actionable finding blocks.`,
    )
  return { name: v, rank: r }
}

// A global `model` remains for compatibility. New runs should select an explicit role in
// `models`: A/B testing GREEN alone must not simultaneously change the adversarial reviewer,
// RED author and P3 verifier — otherwise a result cannot say whether model or workflow caused it.
const KNOWN_MODELS = ['fable', 'haiku', 'sonnet', 'opus']
const validateModel = (value, where) => {
  const v = String(value ?? '').trim()
  if (!v) return undefined
  if (!KNOWN_MODELS.includes(v))
    throw new Error(`implement-batch: unknown model ${JSON.stringify(v)} at ${where}; expected one of ${KNOWN_MODELS.join(' | ')}.`)
  return v
}
const BATCH_MODEL = validateModel(PARSED.model, 'args.model')
const ROLE_MODELS = Object.fromEntries(
  Object.entries(PARSED.models ?? {}).map(([role, value]) => [role, validateModel(value, `args.models.${role}`)]),
)
// Deliberate fixed-model utility steps do not call this helper: they are not part of a model
// comparison and remain deterministic.
const withModel = (role, opts) => {
  const model = ROLE_MODELS[role] ?? BATCH_MODEL
  return model ? { ...opts, model } : opts
}
// Rounds of autonomous fix<->re-review before escalating to a human. Beyond 3 the loop is
// usually not converging for a reason a fourth round won't fix either (a design disagreement),
// and `needsHumanDecision` already exits early for that case.
const MAX_FIX_ROUNDS = PIPELINE.maxFixRounds
// A rejected RED contract is still test-only and has not contaminated source or Git history.
// More attempts turn a specification defect into an unattended loop, so the second rejection is
// terminal before sealing or GREEN.
const MAX_RED_CONTRACT_REPAIRS = 1

// ── Step retry ─────────────────────────────────────────────────────────────
// Without a retry a single such death takes the whole story out of the run: driveStory returns
// `failed-*` and the card ends the batch with no PR at all, even though the worktree still
// holds every committed task. Each authoring step is re-entrant by construction (persistent
// worktree + checkpoint + committed work), so a second attempt RESUMES rather than restarts.
// WHAT COUNTS AS A DEAD STEP IS THE CALLER'S CALL (`isUsable`).
async function agentRetry(prompt, opts, isUsable = r => !!r) {
  const first = await agent(prompt, opts)
  if (isUsable(first)) return first
  log(`${opts.label}: step returned nothing usable (agent died or returned an invalid shape) — retrying once`)
  return agent(prompt, { ...opts, label: `${opts.label} retry` })
}

// Positive evidence that a review HAPPENED: a verdict is a required field of the
// review contract, so its absence — null, `{}`, `{findings: []}`, a blank string —
// means the reviewer did not return one. Absence of findings is not evidence.
// ONE predicate, asked by the retry and by the convergence guard, so the two
// cannot drift into disagreeing about what a dead reviewer is.
const hasVerdict = r => !!r && !!String(r.verdict ?? '').trim()
const REVIEWED_HEAD_PATTERN = /^[0-9a-f]{40}$/
// A review also has to identify the immutable PR revision it actually inspected.
// Without that baseline a later reviewer cannot distinguish the fix delta from the
// already-audited PR surface, which turns each re-review into another full scan.
const hasReviewEvidence = r => hasVerdict(r) && REVIEWED_HEAD_PATTERN.test(String(r.reviewedHead ?? ''))
// A preflight is useful only when it says whether the exact head was verified and returns its
// full finding set. A truthy `{}` would otherwise look clean and recreate the same unsafe
// direction that `hasReviewEvidence` prevents for the outer review.
const hasPreflightEvidence = r =>
  !!r &&
  typeof r.verified === 'boolean' &&
  Array.isArray(r.findings) &&
  REVIEWED_HEAD_PATTERN.test(String(r.reviewedHead ?? ''))

// ── Schemas (orchestration return-value contracts) ─────────────────────────
// These are the compact values agents RETURN for control-flow — NOT the artifact
// formats. The human-facing artifacts follow the KB templates, applied by the
// agents: the PR body → `pr-template.md`, the review report → the configured review
// template (`code-review-template.md` by default)
// (posted as a PR comment by the reviewer), the checkpoint → `checkpoint-template.md`.
// Where a schema field overlaps a template field it MIRRORS the template's
// vocabulary (single source of truth) so the machine contract and the human
// artifact cannot drift.
const STEP_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    checkpointPath: { type: 'string' }, // checkpoint body follows checkpoint-template.md
    gatesPassed: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['gatesPassed'],
}
const PR_SCHEMA = {
  // The PR BODY follows pr-template.md (authored by the agent); this is only the handle.
  type: 'object',
  properties: { prNumber: { type: 'number' }, url: { type: 'string' } },
  required: ['prNumber'],
}
const LOOSE_REVIEW_SCHEMA = {
  // Mirrors the configured review template: the `## Verdict`-line verdict options and the
  // `Findings by severity` finding fields (File:Line / severity / description /
  // recommendation). The posted report is the artifact; this is the return value.
  // This is the loose FALLBACK skeleton: phase-0 (ensure-contract, below) derives an
  // enum-locked version from the template via an AI-generated contract.json; when
  // that contract is missing/stale-and-ungeneratable/malformed, this skeleton is
  // used as-is so the run never breaks.
  type: 'object',
  properties: {
    // Free string mirroring the review template's `## Verdict`-line options
    // (APPROVED / CHANGES-REQUESTED / TECH-DEBT) — NOT enum-locked here, so a
    // template vocabulary change doesn't break validation.
    // Control flow keys on `nonActionable` + actionable count, never on specific
    // verdict strings.
    verdict: { type: 'string' },
    // Immutable full SHA of the PR head reviewed. This is workflow evidence, not
    // part of the human-facing review template vocabulary.
    reviewedHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    needsHumanDecision: { type: 'boolean' },
    // A history rewrite has to be escalated before a new RED snapshot can freeze the commits
    // the human needs to decide about. Other human decisions retain the normal one-fix-round
    // behavior below.
    humanDecisionKind: { type: 'string', enum: ['history-rewrite'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          location: { type: 'string' }, // File:Line
          severity: { type: 'string' }, // Critical | Major | Minor | Questions per template (not enum-locked)
          description: { type: 'string' }, // the issue and its impact
          recommendation: { type: 'string' }, // suggested resolution
          // true = by-design / won't-fix: fixing it would be wrong (byte-consistent
          // with a source of truth, matches an existing convention, resolves only
          // post-merge, etc.). Put the justification in `description`. Non-actionable
          // findings do NOT block convergence; surfaced to the human at the merge gate.
          nonActionable: { type: 'boolean' },
          // When nonActionable, the SPECIFIC disposition that replaces the opaque
          // "non-actionable" label in human-facing output: exactly `Deferred to #<n>`
          // when the finding belongs to a separate tracked story, else a concrete
          // by-design reason (By convention … / Historical record / Forward-ref to
          // unbuilt #<n> / Resolves after merge).
          disposition: { type: 'string' },
        },
      },
    },
  },
  required: ['verdict', 'reviewedHead'],
}
const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'boolean' },
    needsHumanDecision: { type: 'boolean' },
    outputHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    evidenceLedger: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          oracle: { type: 'string' },
          probe: { type: 'string' },
          observed: { type: 'string' },
        },
        required: ['claim', 'oracle', 'probe', 'observed'],
      },
    },
  },
  required: ['fixed', 'evidenceLedger'],
}
// RED is an artifact, not an intention. A separate agent writes the test-only contract before
// the fixer sees the source change; its hashes let the later verifier detect the old escape
// hatch where the same session weakened the test it had just made pass.
const RED_TEST_SCHEMA = {
  type: 'object',
  properties: {
    sourceOfTruth: { type: 'string' },
    // A contract is either behavioral OR structural. Combining both lets a correct bug fix
    // smuggle a refactor past the same tests; make the choice explicit before GREEN exists.
    fixScope: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        mode: { type: 'string', enum: ['behavioral', 'structural', 'test'] },
        allowedPaths: { type: 'array', items: { type: 'string' } },
      },
      required: ['owner', 'mode', 'allowedPaths'],
    },
    matrix: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          condition: { type: 'string' },
          oracle: { type: 'string' },
          expected: { type: 'string' },
        },
        required: ['condition', 'oracle', 'expected'],
      },
    },
    redTests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          // Omitted means `test` for contracts written before fixtures became explicit.
          kind: { type: 'string', enum: ['test', 'fixture'] },
          sha256: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
          command: { type: 'string' },
          observed: { type: 'string' },
          consumedBy: { type: 'string' },
        },
        required: ['file', 'sha256'],
      },
    },
    testExempt: { type: 'boolean' },
    exemptionRationale: { type: 'string' },
    status: { type: 'string', enum: ['red', 'stale', 'split-required'] },
    contractPath: { type: 'string' },
    domains: { type: 'array', items: { type: 'object' } },
  },
  required: ['sourceOfTruth', 'fixScope', 'matrix', 'redTests', 'testExempt'],
}
// D0 — the frozen plan one round's actionable findings are remediated under. `findings` are
// INDICES into the finding array the planner received, so the plan is bound to the exact set.
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['planned', 'stale'] },
    inputHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          groupId: { type: 'string' },
          findings: { type: 'array', items: { type: 'integer' } },
          owner: { type: 'string' },
          mode: { type: 'string', enum: ['behavioral', 'structural', 'test'] },
          allowedPaths: { type: 'array', items: { type: 'string' } },
          oracle: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
        required: ['groupId', 'findings', 'owner', 'mode', 'allowedPaths'],
      },
    },
  },
  required: ['status', 'groups'],
}
// A plan is usable only when EVERY finding index appears in exactly one group, every group
// is non-empty and well-typed, and the dependency graph is acyclic. Anything else is
// `failed-plan`: a finding left out of the plan is a finding nobody fixes.
const hasPlanEvidence = count => plan => {
  if (!plan || plan.status !== 'planned' || !Array.isArray(plan.groups) || plan.groups.length === 0) return false
  const seen = new Set()
  const ids = new Set()
  for (const g of plan.groups) {
    if (!g || !String(g.groupId ?? '').trim() || ids.has(g.groupId)) return false
    ids.add(g.groupId)
    if (!String(g.owner ?? '').trim() || !['behavioral', 'structural', 'test'].includes(g.mode)) return false
    // A `test` group repairs a guard, not production: it declares no production paths at all.
    if (g.mode === 'test' ? !Array.isArray(g.allowedPaths) || g.allowedPaths.length !== 0 : !Array.isArray(g.allowedPaths) || g.allowedPaths.length === 0 || !g.allowedPaths.every(pth => typeof pth === 'string' && isRelPath(pth.replace(/\/$/, '')))) return false
    if (!Array.isArray(g.findings) || g.findings.length === 0) return false
    for (const i of g.findings) {
      if (!Number.isInteger(i) || i < 0 || i >= count || seen.has(i)) return false
      seen.add(i)
    }
    if (g.dependsOn !== undefined && (!Array.isArray(g.dependsOn) || g.dependsOn.some(d => typeof d !== 'string'))) return false
  }
  if (seen.size !== count) return false
  for (const g of plan.groups) for (const d of g.dependsOn ?? []) if (!ids.has(d) || d === g.groupId) return false
  return orderGroups(plan.groups) !== null
}
// Topological order by `dependsOn`, stable on the planner's order; null on a cycle.
function orderGroups(groups) {
  const byId = new Map(groups.map(g => [g.groupId, g]))
  const done = new Set()
  const out = []
  const visiting = new Set()
  const visit = g => {
    if (done.has(g.groupId)) return true
    if (visiting.has(g.groupId)) return false
    visiting.add(g.groupId)
    for (const d of g.dependsOn ?? []) if (!visit(byId.get(d))) return false
    visiting.delete(g.groupId)
    done.add(g.groupId)
    out.push(g)
    return true
  }
  for (const g of groups) if (!visit(g)) return null
  return out
}
const RED_TEST_SHA256 = /^sha256:[0-9a-f]{64}$/
const RED_SNAPSHOT_SHA = /^[0-9a-f]{40}$/
const redArtifactKind = artifact => String(artifact?.kind ?? 'test')
const isRedTestArtifact = artifact =>
  redArtifactKind(artifact) === 'test' &&
  !!String(artifact?.command ?? '').trim() &&
  /fail/i.test(String(artifact?.observed ?? ''))
const hasRedTestEvidence = r => {
  if (!r || !String(r.sourceOfTruth ?? '').trim() || !Array.isArray(r.matrix) || r.matrix.length === 0) return false
  const scope = r.fixScope
  if (!scope || !String(scope.owner ?? '').trim() || !['behavioral', 'structural', 'test'].includes(scope.mode) || !Array.isArray(scope.allowedPaths))
    return false
  if (scope.mode === 'test' ? scope.allowedPaths.length !== 0 : scope.allowedPaths.length === 0) return false
  const allowedPaths = new Set()
  for (const path of scope.allowedPaths) {
    const file = String(path ?? '').trim()
    if (!file || !isRelPath(file) || allowedPaths.has(file)) return false
    allowedPaths.add(file)
  }
  if (r.testExempt === true) return !!String(r.exemptionRationale ?? '').trim()
  if (r.testExempt !== false || !Array.isArray(r.redTests) || r.redTests.length === 0) return false

  const byFile = new Map()
  for (const artifact of r.redTests) {
    const file = String(artifact?.file ?? '').trim()
    const kind = redArtifactKind(artifact)
    if (!file || byFile.has(file) || !RED_TEST_SHA256.test(String(artifact?.sha256 ?? ''))) return false
    if (kind !== 'test' && kind !== 'fixture') return false
    byFile.set(file, artifact)
  }

  return r.redTests.every(artifact => {
    if (redArtifactKind(artifact) === 'test') return isRedTestArtifact(artifact)
    const consumer = byFile.get(String(artifact?.consumedBy ?? '').trim())
    return !!consumer && isRedTestArtifact(consumer)
  })
}
const RED_SNAPSHOT_SCHEMA = {
  type: 'object',
  properties: {
    sealed: { type: 'boolean' },
    snapshot: { type: 'string', pattern: '^[0-9a-f]{40}$' },
  },
  required: ['sealed', 'snapshot'],
}
const hasSealedRedSnapshot = r => r?.sealed === true && RED_SNAPSHOT_SHA.test(String(r.snapshot ?? ''))
// Either signal suppresses a second first-review.
const PROBE_SCHEMA = {
  type: 'object',
  properties: { logExists: { type: 'boolean' }, firstReviewPosted: { type: 'boolean' } },
  required: ['logExists', 'firstReviewPosted'],
}

// ── Phase 0: ensure machine contracts (md template → contract.json) ────────
// The KB markdown template is the single source of truth; the machine contract
// is DERIVED from it by an AI generator agent (this sandbox has no filesystem
// access, so all file work — hashing, cache check, generation, validation —
// happens in the agent via the `ensure-contract.mjs` script that ships inside the
// contract-phase skill).
// Cache-by-hash: the contract stores the template's sha256; unchanged hash →
// reuse (no regeneration), changed hash → regenerate. Malformed/failed contract
// → the loose skeleton above is used as-is (the run never breaks) and the
// fallback is reported in the run result (`contracts[].status: 'fallback-loose'`).
// The pattern is per-template and reusable: add a spec below to contract another
// template — e.g. { name: 'pr', template: '.../pr-template.md', contract:
// '.claude/workflows/pair-contracts/pr.contract.json', skeleton: PR_SCHEMA, mirrors: ... }
// once the PR return value grows beyond a handle.
const CONTRACT_SPECS = [
  {
    name: 'code-review',
    template: PIPELINE.reviewTemplate,
    contract: '.claude/workflows/pair-contracts/code-review.contract.json',
    skeleton: LOOSE_REVIEW_SCHEMA,
    mirrors:
      'verdict ← the `## Verdict`-line options; findings[].severity ← the `Findings by severity` severity levels. ' +
      'The RELATIVE severity of those levels is a contract TERM, carried by the top-level `severityRanks` map (one explicit integer per severity, higher = more severe) — the consumer ranks a merge-blocking floor with it and IGNORES the order of the `severities` array entirely',
  },
]

const CONTRACT_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string' }, // cache-hit | regenerated | failed
    contract: { type: 'object' }, // parsed contract.json: { $meta, vocabulary, schema }
  },
  required: ['status'],
}

// Last-resort consumer-side guard (pure, value-agnostic): accept the generated
// schema only if it keeps the structure the control flow depends on. Generic
// contract integrity (hash, vocabulary, JSON-Schema shape) is validated by
// ensure-contract.mjs — the canonical validator; the sandbox cannot import it,
// so this is a deliberately minimal duplicate covering only THIS consumer's needs.
function usableSchema(contract) {
  try {
    const s = contract?.schema
    if (!s || s.type !== 'object' || !s.properties || typeof s.properties !== 'object') return null
    if (s.properties.verdict?.type !== 'string') return null
    if (s.properties.needsHumanDecision?.type !== 'boolean') return null
    const findings = s.properties.findings
    if (findings?.type !== 'array') return null
    const fp = findings.items?.properties
    if (!fp || fp.nonActionable?.type !== 'boolean' || !fp.severity || !fp.description) return null
    return s
  } catch {
    return null
  }
}

async function ensureContract(spec) {
  const res = await agent(
    `Invoke **${SK.contractPhase}** with $name=${spec.name} $template=${spec.template} $contract=${spec.contract} $skeleton=${JSON.stringify(spec.skeleton)} $mirrors=${JSON.stringify(spec.mirrors)} $workflowVersion=${WORKFLOW_VERSION}. The skill is the process of record: execute its steps exactly and return exactly the structured result it defines.`,
    { agentType: 'pair-contract-generator', phase: 'Contracts', label: `contract:${spec.name}`, effort: 'low', schema: CONTRACT_RESULT_SCHEMA },
  )
  const schema = usableSchema(res?.contract)
  return {
    name: spec.name,
    status: schema ? (res?.status ?? 'regenerated') : 'fallback-loose',
    contract: schema ? res.contract : null,
    schema: schema ?? spec.skeleton,
  }
}

// Contracts are ensured up-front (skipped for an empty batch — nothing to drive).
const contracts = STORIES.length ? await parallel(CONTRACT_SPECS.map((s) => () => ensureContract(s))) : []
const crContract = contracts.find((c) => c.name === 'code-review')
// Schema the reviewer returns: template-derived when the contract is usable,
// the loose skeleton otherwise. Control flow stays value-agnostic either way.
const REVIEW_SCHEMA_BASE = crContract?.schema ?? LOOSE_REVIEW_SCHEMA
// The template's finding vocabulary, shared by the review, preflight and RED-verifier schemas so
// no inner verifier can invent a second severity vocabulary.
const REVIEW_FINDING_SCHEMA = REVIEW_SCHEMA_BASE.properties.findings
// Template contracts own human verdict/finding vocabulary. The orchestration-only
// baseline is layered on top so a template refresh cannot accidentally remove it.
const REVIEW_SCHEMA = {
  ...REVIEW_SCHEMA_BASE,
  properties: {
    ...REVIEW_SCHEMA_BASE.properties,
    reviewedHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    humanDecisionKind: { type: 'string', enum: ['history-rewrite'] },
    findings: REVIEW_FINDING_SCHEMA,
  },
  required: [...new Set([...(REVIEW_SCHEMA_BASE.required ?? []), 'verdict', 'reviewedHead'])],
}
// The preflight does not make a PR verdict or publish a review. Its return is intentionally
// smaller than REVIEW_SCHEMA, but reuses the template-derived finding shape so a verifier
// cannot invent a second severity vocabulary for an inner fix.
const PREFLIGHT_SCHEMA = {
  type: 'object',
  properties: {
    verified: { type: 'boolean' },
    // A broken RED chain is not ordinary fix work: no agent that can change source may
    // repair the evidence that disqualifies it.
    contractBreach: { type: 'boolean' },
    reviewedHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    findings: REVIEW_FINDING_SCHEMA,
  },
  required: ['verified', 'reviewedHead', 'findings'],
}
// A RED contract is usable for sealing only when the skill said `red` (not `stale`, not
// `split-required`) and persisted the file the sealer will read.
const hasRedContractReady = r => hasRedTestEvidence(r) && (r.status === undefined || r.status === 'red') && (r.contractPath === undefined || isRelPath(r.contractPath))
// A typed refusal (`stale`, `split-required`) is the skill's ANSWER, not a dead agent: it is never
// retried with the identical prompt (the canary on #321 spent a second opus author on the same
// `split-required`), and the engine routes it by status.
const RED_REFUSALS = new Set(['stale', 'split-required'])
const isRedRefusal = r => !!r && RED_REFUSALS.has(r.status)
const isRedAnswer = r => hasRedContractReady(r) || isRedRefusal(r)
const isPlanAnswer = count => plan => hasPlanEvidence(count)(plan) || plan?.status === 'stale'
// This verifier runs while RED is still unsealed and test-only. It must independently prove
// the test contract covers the stated behavior before an implementation agent can see it.
const RED_CONTRACT_VERIFIER_SCHEMA = {
  type: 'object',
  properties: {
    verified: { type: 'boolean' },
    findings: REVIEW_FINDING_SCHEMA,
  },
  required: ['verified', 'findings'],
}
const hasRedContractVerification = r =>
  !!r &&
  typeof r.verified === 'boolean' &&
  Array.isArray(r.findings)
// Reviewer prompt vocabulary: `verdictOptions` and `severities` are CANONICAL,
// required contract keys (ensure-contract.mjs's validateContract rejects any
// contract missing either) — so whenever a contract IS present, both are
// guaranteed populated and the schema (enum-locked from these same keys) and
// the prompt text can never diverge. The hardcoded arrays below are the
// single fallback, used ONLY in the true fallback-loose case (no usable
// contract at all, `crContract?.contract` is null) — never a second,
// independently-drifting vocabulary source.
const REVIEW_VOCAB = crContract?.contract?.vocabulary
const DEFAULT_SEVERITIES = ['Critical', 'Major', 'Minor', 'Questions']
const DEFAULT_VERDICTS = ['APPROVED', 'CHANGES-REQUESTED', 'TECH-DEBT']
const SEVERITIES = (REVIEW_VOCAB?.severities ?? DEFAULT_SEVERITIES).join(', ')
const VERDICTS = (REVIEW_VOCAB?.verdictOptions ?? DEFAULT_VERDICTS).join(', ')

// The severity scale is resolved from the SAME array `SEVERITIES` above threads into the
// reviewer prompt, so what the engine ranks and what the reviewer answers can never be two
// different vocabularies — and its RANKING comes from the contract's explicit `severityRanks`
// ordinals, never from that array's order. It can only be known after the contract is ensured,
// which is why the floor is validated HERE rather than at arg-parse time: the cost is that a
// bad floor throws one contract dispatch late, still before any card is driven.
const SEVERITY_SCALE = resolveSeverityScale(REVIEW_VOCAB?.severities, crContract?.contract?.severityRanks)
// Said out loud even when no floor is configured: the contract is hash-cached, so an
// unranked one stays unranked until the template changes, and the next caller who does pass
// a floor gets a hard stop. Better the operator sees it on the run that generated it.
if (SEVERITY_SCALE.rankError) log(`contract:code-review: severities are NOT ranked (${SEVERITY_SCALE.rankError}) — \`severityFloor\` is unavailable until the contract is regenerated`)
// The floor DEFAULTS to `Minor`, so Major and Minor block and drive fix rounds while everything
// below them is carried to the merge gate. Questions are, by the review template's own
// definition, questions FOR THE HUMAN; putting them in the fix set contradicts what they are
// and makes convergence a moving target. An explicit `severityFloor` still wins, including a
// lower one that restores the old block-everything behaviour. The default is applied SOFTLY,
// unlike a caller-passed floor: a template whose vocabulary does not declare `Minor`, or whose
// contract carries no ranking, falls back to no floor rather than throwing. A default must
// never break a run that never asked for it; a floor the CALLER spelled wrong still throws,
// because that is a configuration error they made.
const DEFAULT_SEVERITY_FLOOR = 'Minor'
function defaultFloor() {
  if (!SEVERITY_SCALE.ranks) return null
  const key = normSeverity(DEFAULT_SEVERITY_FLOOR)
  if (!Object.hasOwn(SEVERITY_SCALE.ranks, key)) return null
  return { name: DEFAULT_SEVERITY_FLOOR, rank: SEVERITY_SCALE.ranks[key] }
}
const SEVERITY_FLOOR = String(PARSED.severityFloor ?? '').trim() ? parseFloor(PARSED.severityFloor) : defaultFloor()

// ── Isolation convention ───────────────────────────────────────────────────
// The AUTHORING chain (implement -> PR -> fix) runs inside a dedicated, PERSISTENT
// per-story git worktree OUTSIDE the repo, so the main working tree is never
// touched and parallel stories never collide. The worktree persists across the
// whole chain (implement/PR/fix share it) so the untracked checkpoint under
// .pair/working/ survives context resets. The reviewer stays read-only (gh-based,
// no branch switch) so it needs no worktree. Worktrees are cleaned up after merge.
// `story.base` (optional, default `origin/main`) is the branch this story STACKS on.
// It exists to dissolve a purely TEXTUAL mutex — two stories editing different lines
// of the same file (`ci.yml`, root `package.json` scripts, a shared SKILL.md). Branching
// the second story off the FIRST story's branch instead of main means the conflict is
// resolved once, at authoring time, instead of becoming a merge conflict the human hits
// at the gate. It does NOT let the two run concurrently: a stacked story must start from
// a COMPLETE base, so the base story has to be PR-ready first. What it buys is that the
// base does not have to be MERGED — the whole stack is merged in order, in one human
// gate, instead of one gate per link in the chain.
// Use it only for textual mutexes on small, low-risk bases: if review forces a change in
// the base, every stacked child rebases.
// The base a story branches off: its own `base` when it is STACKED, else the configured
// default. One helper, because three prompts ask the question and a diff computed against
// a different base than the branch was cut from silently reviews the wrong range.
function baseOf(story) {
  return String(story.base ?? '').trim() || PIPELINE.baseBranch
}

// ── Per-story lifecycle ──────────────────────────────────────────────────
async function driveStory(story) {
  const tag = `#${story.id}`
  // ── Every phase is a SKILL invoked by name with typed arguments. ─────────────────────────
  // The workflow names the skill, passes the run's values and validates the typed result; the
  // method, the rules and every shell command live in the skill.
  const worktreePath = `${PIPELINE.worktreeRoot}/${story.id}`
  const reviewWorktreePath = `${PIPELINE.worktreeRoot}/${story.id}-review`
  const storyBase = baseOf(story)
  const stacked = storyBase !== PIPELINE.baseBranch
  // One run directory per story for every phase: `args.runId` when the caller names the run,
  // else `story-<id>` — the same value before and after the PR exists.
  const runId = RUN_ID ?? `story-${story.id}`
  const storyArgs = () =>
    `$run=${runId} $story=${story.id} $branch=${story.branch} $worktree=${worktreePath} $base=${storyBase} $stacked=${stacked}`
  const notesArg = () => (story.notes ? ` $notes=${JSON.stringify(story.notes)}` : '')
  const invoke = (skill, args) =>
    `Invoke **${skill}** for story ${tag} with ${args} $workflowVersion=${WORKFLOW_VERSION}. The skill is the process of record: execute its steps exactly, do not improvise or skip one, and return exactly the structured result it defines. Do NOT read ${BLIND_PATHS} except the checkpoint and the run directory \`.pair/working/runs/${runId}/${story.id}/\` the skill names; that directory lives in the MAIN checkout — the working directory you were started in, before any cd — never inside a story or review worktree. Do NOT merge.`
  const resuming = Number.isInteger(story.prNumber)
  let pr = resuming ? { prNumber: story.prNumber } : null

  if (!resuming) {
    // 1. IMPLEMENT — fresh implementer in the story worktree; writes checkpoint.
    const impl = await agentRetry(
      invoke(
        SK.implementPhase,
        `${storyArgs()} $title=${JSON.stringify(story.title)} $implementSkill=${SK.implement} $verifyQuality=${SK.verifyQuality} $recordDecision=${SK.recordDecision} $checkpoint=${SK.checkpoint}${notesArg()}`,
      ),
      withModel('implementation', { agentType: 'pair-implementer', phase: 'Implement', label: `impl:${tag}`, effort: 'high', schema: STEP_SCHEMA }),
    )
    if (!impl) return { story, status: 'failed-implement' }

    // 2. OPEN PR — fresh implementer instance; resumes from checkpoint (context reset)
    pr = await agentRetry(
      invoke(SK.prPhase, `${storyArgs()} $checkpoint=${SK.checkpoint} $publishPr=${SK.publishPr}${notesArg()}`),
      withModel('pr', { agentType: 'pair-implementer', phase: 'PR', label: `pr:${tag}`, model: 'sonnet', effort: 'medium', schema: PR_SCHEMA }),
    )
    if (!pr?.prNumber) return { story, status: 'failed-pr' }
  }

  // 3. REVIEW <-> FIX loop — the reviewer is independent and BLIND to the author's handoff.
  //    Converges when every ACTIONABLE finding is resolved; findings the reviewer marks
  //    nonActionable (by-design, justified) or below the severity floor do not block and are
  //    carried to the merge gate as `acceptedFindings`, accumulated over every round.
  //    PR-COMMENT POLICY (owned by the cycle-comments skill): the whole cycle of a PR — every
  //    run, escalation and manual round it takes to converge — shows AT MOST one first-review
  //    comment and one final remediation. Fix rounds are appended to the working log
  //    `<auditLogDir>/<id>.md`, whose existence marks an in-flight cycle to CONTINUE across runs;
  //    a first review is detected on the PR by an exact marker match, never by judgment. On
  //    escalation the log is kept and flushed to the PR as the continuation anchor; at
  //    convergence ONE synthesis is posted, intermediates are minimized and the log is deleted.
  //    The probe runs at sonnet/low: a mis-report fails OPEN toward a visible duplicate first
  //    review, never toward suppressing one.
  const reviewLog = `${PIPELINE.auditLogDir}/${story.id}.md`
  // The continuation probe detects a prior first review by an EXACT substring match on this
  // marker, NOT by a semantic reading of the comment's structure — so the cheap sonnet/low
  // probe makes no classification judgment and can't false-positive a non-review comment into
  // silencing a real first review (the story's High-impact over-silencing risk).
  // Minimized/outdated comments still match: gh returns their raw body, which still contains
  // the marker.
  const firstReviewMarker = `<!-- pair:first-review #${story.id} PR#${pr.prNumber} -->`
  // ── Phases C + D: the review ↔ fix loop dispatches SKILLS, not prompts. ──────────────────
  // Each phase skill owns its method, its mutation boundary and its handoff JSON under
  // `.pair/working/runs/<run>/<story>/`; this file names the skill, passes typed arguments and
  // validates the typed result. Nothing below tells an agent HOW to write a test, seal a
  // snapshot or verify a delta — a change to that behaviour is a skill version, never a patch
  // to a running workflow.
  const phaseArgs = (phase, baseHead) =>
    `$run=${runId} $story=${story.id} $pr=${pr.prNumber} $phase=${phase} $base=${baseHead} $branch=${story.branch}`
  const cycleArgs = () =>
    `$run=${runId} $story=${story.id} $pr=${pr.prNumber} $worktree=${worktreePath} $reviewLog=${reviewLog} $marker=${JSON.stringify(firstReviewMarker)}`
  const planRemediation = (findings, phase, baseHead) =>
    agentRetry(
      invoke(SK.remediationPlan, `${phaseArgs(phase, baseHead)} $worktree=${worktreePath} $findings=${JSON.stringify(findings)}`),
      withModel('planner', { agentType: 'pair-remediation-planner', phase: 'Review', label: `plan:${tag} ${phase}`, effort: 'medium', schema: PLAN_SCHEMA }),
      isPlanAnswer(findings.length),
    )
  const redSpec = (targets, scope, phase, baseHead, repairFindings = []) =>
    agentRetry(
      invoke(SK.redSpec, `${phaseArgs(phase, baseHead)} $worktree=${worktreePath} $findings=${JSON.stringify(targets)} $scope=${JSON.stringify(scope)}${repairFindings.length ? ` $repair=${JSON.stringify(repairFindings)}` : ''}`),
      withModel('red', { agentType: 'pair-fix-test-author', phase: 'Review', label: `red-spec:${tag} ${phase}${repairFindings.length ? ' repair' : ''}`, effort: 'high', schema: RED_TEST_SCHEMA }),
      isRedAnswer,
    )
  // Concatenated, not a template literal in backticks: the shipped-artifact guard reads a
  // backticked `.pair/…json` as a dataset document that must exist; this is a runtime path.
  const contractPathOf = (redContract, phase) => redContract.contractPath ?? '.pair/working/runs/' + runId + '/' + story.id + '/' + phase + '-red-contract.json'
  const redVerify = (redContract, targets, phase, baseHead) =>
    agentRetry(
      invoke(SK.redVerify, `${phaseArgs(phase, baseHead)} $worktree=${worktreePath} $contract=${contractPathOf(redContract, phase)} $findings=${JSON.stringify(targets)}`),
      withModel('redVerifier', { agentType: 'pair-red-contract-verifier', phase: 'Review', label: `red-verify:${tag} ${phase}`, effort: 'high', schema: RED_CONTRACT_VERIFIER_SCHEMA }),
      hasRedContractVerification,
    )
  const redSeal = (redContract, phase, baseHead) =>
    agentRetry(
      invoke(SK.redSeal, `${phaseArgs(phase, baseHead)} $worktree=${worktreePath} $contract=${contractPathOf(redContract, phase)}`),
      withModel('seal', { agentType: 'pair-red-sealer', phase: 'Review', label: `red-seal:${tag} ${phase}`, effort: 'low', schema: RED_SNAPSHOT_SCHEMA }),
      hasSealedRedSnapshot,
    )
  const greenFix = (targets, phase, baseHead) =>
    agentRetry(
      invoke(SK.greenFix, `${phaseArgs(phase, baseHead)} $worktree=${worktreePath} $findings=${JSON.stringify(targets)} $reviewLog=${reviewLog} $writeIssue=${SK.writeIssue}${story.notes ? ` $notes=${JSON.stringify(story.notes)}` : ''}`),
      withModel('green', { agentType: 'pair-implementer', phase: 'Review', label: `fix:${tag} ${phase}`, effort: 'high', schema: FIX_SCHEMA }),
    )
  const p3Verify = (targets, ledger, phase, baseHead) =>
    agentRetry(
      invoke(SK.p3Verify, `${phaseArgs(phase, baseHead)} $worktree=${reviewWorktreePath} $findings=${JSON.stringify(targets)} $ledger=${JSON.stringify(ledger)}${SEVERITY_FLOOR ? ` $floor=${SEVERITY_FLOOR.name}` : ''}`),
      withModel('preflight', { agentType: 'pair-fix-verifier', phase: 'Preflight', label: `preflight:${tag} ${phase}`, effort: 'medium', schema: PREFLIGHT_SCHEMA }),
      hasPreflightEvidence,
    )
  let isContinuation = false
  let firstReviewPosted = false
  // The gate is now the PR's existence — a fact the script knows — instead of an argument the
  // caller must remember.
  if (pr?.prNumber) {
    const probe = await agent(
      invoke(SK.cycleComments, `${cycleArgs()} $mode=probe`),
      { agentType: 'pair-implementer', phase: 'Review', label: `probe:${tag}`, model: 'sonnet', effort: 'low', schema: PROBE_SCHEMA },
    )
    // This fail-open direction is deliberate: degrade toward VISIBILITY (post a review a human
    // can see) rather than fail-silent (suppress it). The dangerous case — a genuine
    // continuation where a total probe failure re-posts a first review — is low-probability
    // (requires an agent/schema failure on a resume of an in-flight cycle) and self-announcing
    // (a visible duplicate is noticed and pruned), whereas silent over-suppression of a real
    // review is not. The deterministic marker above removes the misclassification failure mode;
    // only a hard probe failure reaches this fallback.
    isContinuation = probe?.logExists === true
    firstReviewPosted = probe?.firstReviewPosted === true
  }
  let round = 0
  // Remembers a reviewer's human-decision request across the one fix round we now spend
  // before honouring it, so the escalation is deferred by a round rather than dropped.
  let humanDecisionPending = false
  let prevFindings = []
  let prevReviewedHead = null
  // A P3 result is evidence, not reviewer context. It is injected exactly once, after the
  // fresh reviewer has remained blind, and then survives as an ordinary prior finding for the
  // re-review. Re-injecting it after GREEN would force a second fix even when its RED test
  // proved the defect closed.
  let pendingRequiredFindings = [...(story.requiredFindings ?? [])]
  // ACCUMULATES across rounds — never reassigned. So a per-round reassignment loses it: the
  // card converges `ready-for-merge` with an EMPTY accepted table, the convergence prompt
  // renders that empty table, and the merge gate is told nothing was carried. Sub-floor
  // findings are not recoverable elsewhere either — `prevFindings = actionable` excludes them,
  // so they never reach the fixer's working log.
  const accepted = []
  const acceptedKeys = new Set()
  const accept = (findings) => {
    for (const f of findings) {
      // Keep a collision-free delimiter without embedding an invisible raw NUL in the shipped
      // JavaScript source. A readable space collapses `(location, description)` pairs such as
      // (`"a b"`, `"c"`) and (`"a"`, `"b c"`), silently dropping one accepted finding.
      const key = `${f.location ?? ''}\u0000${f.description ?? ''}`
      if (acceptedKeys.has(key)) continue
      acceptedKeys.add(key)
      accepted.push(f)
    }
  }
  // Keep the outer review and the inner preflight on the SAME severity policy. An explicit
  // floor is a human-selected merge rule, not something a preflight may silently override;
  // conversely an unknown severity remains blocking in both paths (rank = Infinity).
  const partitionFindings = (findings) => {
    const allActionable = findings.filter((f) => !f.nonActionable)
    const belowFloor = []
    const actionable = []
    for (const f of allActionable)
      (SEVERITY_FLOOR && rankOf(f.severity) < SEVERITY_FLOOR.rank ? belowFloor : actionable).push(f)
    return {
      belowFloor,
      actionable,
      carried: [
        ...findings.filter((f) => f.nonActionable),
        ...belowFloor.map((f) => ({ ...f, disposition: f.disposition || `Below severity floor (${SEVERITY_FLOOR.name}) — carried to the merge gate unfixed` })),
      ],
    }
  }
  // On a continuation (log present) it is seeded true so an immediate round-0 convergence still
  // posts the ONE final synthesis + deletes the log (never leaves an escalate-flush as the last
  // word). A converged-but-unmerged re-run has NO log (firstReviewPosted true, isContinuation
  // false) → stays false, so a clean round-0 adds nothing and never tries to synth a deleted
  // log.
  let cycleHasRemediation = isContinuation
  while (true) {
    // Either signal makes round-0 a SILENT re-review, so a PR never accrues a second
    // first-review.
    const first = round === 0 && !isContinuation && !firstReviewPosted
    // An initial/resumed-without-history review establishes the whole-PR baseline.
    // Once a fix is in flight, even the file inventory must start at that baseline;
    // otherwise the pacing loop invites a second full audit before its delta rule.
    const reviewBase = prevFindings.length ? prevReviewedHead : baseOf(story)
    const mode = first ? 'first' : prevFindings.length ? 're-review' : 'fresh'
    const review = await agentRetry(
      invoke(
        SK.reviewPhase,
        `${phaseArgs(`r${round}`, reviewBase)} $worktree=${reviewWorktreePath} $mode=${mode} $marker=${JSON.stringify(firstReviewMarker)} $template=${REVIEW_TEMPLATE_LABEL} $severities=${JSON.stringify(SEVERITIES)} $verdicts=${JSON.stringify(VERDICTS)} $reviewSkill=${SK.review} $writeIssue=${SK.writeIssue}${mode === 're-review' ? ` $priorFindings=${JSON.stringify(prevFindings)} $priorHead=${prevReviewedHead}` : ''}`,
      ),
      // Restoring 'xhigh' is legitimate once narration is reliable — it buys review depth,
      // which is the point of this gate.
      withModel('reviewer', { agentType: 'pair-reviewer', phase: 'Review', label: `rev:${tag} r${round}`, effort: 'high', schema: REVIEW_SCHEMA }),
      hasReviewEvidence,
    )
    // A DEAD reviewer is not a clean review. `agent()` returns null when the subagent dies, and
    // `review?.findings ?? []` then yields zero findings — which the convergence test below
    // reads as "nothing actionable remains" and returns `ready-for-merge`. That is the worst
    // possible failure direction: a PR that was never actually reviewed is handed to the human
    // labelled as review-approved, and on a FIRST round it is also missing the first-review
    // comment that would make the absence visible. Distinguish "reviewed, found nothing" from
    // "did not review": only the former may converge. A truthy-but-contentless return (`{}`, a truncated structured
    // output) yields `findings ?? []` = no findings, which reads as "nothing actionable
    // remains". So the test is inverted: a VERDICT must be present. Absence of findings is not
    // evidence that a review happened; presence of a verdict is. `hasReviewEvidence` is the
    // SAME function `agentRetry` was given above: a contentless or unanchored return is retried
    // once like any other dead step, then lands here.
    if (!hasReviewEvidence(review))
      // `acceptedFindings` travels on EVERY terminal arm, this one included.
      return { story, prNumber: pr.prNumber, status: 'failed-review', round, acceptedFindings: accepted, reviewLog: cycleHasRemediation ? reviewLog : undefined }
    const reviewedHead = String(review.reviewedHead).toLowerCase()
    const staleRequired = pendingRequiredFindings.filter((finding) => finding.observedHead !== reviewedHead)
    if (staleRequired.length)
      return {
        story,
        prNumber: pr.prNumber,
        status: 'failed-required-findings',
        findings: staleRequired,
        acceptedFindings: accepted,
        reviewLog: cycleHasRemediation ? reviewLog : undefined,
      }
    const findings = [...(review.findings ?? []), ...pendingRequiredFindings]
    pendingRequiredFindings = []
    // Below the floor: still reported, still shown to the human, just not blocking. One
    // partition predicate makes the complement total: an unknown/non-numeric rank blocks
    // rather than disappearing from both the fix set and the merge-gate record.
    const { belowFloor, actionable, carried } = partitionFindings(findings)
    accept(carried)
    if (belowFloor.length)
      log(`${tag} r${round}: ${belowFloor.length} finding(s) below the ${SEVERITY_FLOOR.name} floor carried to the gate, ${actionable.length} blocking`)
    // Converge once nothing actionable remains (by-design findings don't block).
    if (actionable.length === 0) break
    // The orchestrator was writing detailed fix instructions for an agent that was never
    // invoked. A reviewer raising it is saying "one of these needs a human", not "none of these
    // can be fixed". So spend ONE fix round on the findings first, then escalate if the
    // reviewer still says so. On the second occurrence we stop: a flag raised again after a fix
    // round is a genuine disagreement.
    const wantsHuman = review?.needsHumanDecision === true
    // A sealed snapshot deliberately freezes its base. If the reviewer identifies a finding
    // whose ONLY remediation is rewriting that base's history, spending the normal one fix
    // round first makes the human's legitimate options narrower.
    const historyRewriteDecision = wantsHuman && review?.humanDecisionKind === 'history-rewrite'
    let mustEscalate = false
    if (historyRewriteDecision) {
      mustEscalate = true
      log(`${tag} r${round}: reviewer identified a history-rewrite decision — escalating before RED sealing or GREEN`)
    } else if (wantsHuman && !humanDecisionPending && round < MAX_FIX_ROUNDS) {
      humanDecisionPending = true
      log(`${tag} r${round}: reviewer asked for a human decision — spending one fix round on the ${actionable.length} finding(s) first, then escalating if it still stands`)
    } else if (round >= MAX_FIX_ROUNDS || wantsHuman) {
      mustEscalate = true
    }
    if (mustEscalate) {
      // The gap this closes: a SILENT re-review that escalates with no log — a resumed PR whose
      // prior first review exists but whose untracked working log was never written / was
      // pruned (firstReviewPosted true, isContinuation false → cycleHasRemediation false, first
      // false). Without the `!first` arm the new blocking concern surfaced ONLY in the batch
      // return value and a later resume repeated the silent escalation. The log read is
      // BEST-EFFORT: only a continuing cycle (cycleHasRemediation) has a log to anchor to; the
      // no-log arm escalates from inline findings.
      if (cycleHasRemediation || !first) {
        await agent(
          invoke(SK.cycleComments, `${cycleArgs()} $mode=flush $hasLog=${cycleHasRemediation} $findings=${JSON.stringify(actionable)}`),
          { agentType: 'pair-implementer', phase: 'Review', label: `flush:${tag}`, model: 'sonnet', effort: 'medium' },
        )
      }
      return { story, prNumber: pr.prNumber, status: 'escalate', findings: actionable, acceptedFindings: accepted }
    }

    round++
    prevFindings = actionable
    prevReviewedHead = reviewedHead
    cycleHasRemediation = true
    // D0 — one frozen plan per round. Every actionable finding lands in exactly one group.
    const plan = await planRemediation(prevFindings, `r${round}`, reviewedHead)
    if (!hasPlanEvidence(prevFindings.length)(plan))
      return { story, prNumber: pr.prNumber, status: plan?.status === 'stale' ? 'failed-fix' : 'failed-plan', findings: prevFindings, acceptedFindings: accepted, reviewLog }
    const groups = orderGroups(plan.groups)
    log(`${tag} r${round}: ${groups.length} remediation group(s) planned for ${prevFindings.length} finding(s)`)
    // Each group is one bounded attempt on top of the previous group's GREEN head.
    let groupBase = reviewedHead
    for (const [k, group] of groups.entries()) {
      const phase = `r${round}-g${k + 1}`
      const targets = group.findings.map(idx => prevFindings[idx])
      const scope = { owner: group.owner, mode: group.mode, allowedPaths: group.allowedPaths, oracle: group.oracle }
      // D1 — RED contract, test-only, from an author who is not the fixer.
      let redTargets = targets
      let redTest = await redSpec(redTargets, scope, phase, groupBase)
      if (!hasRedContractReady(redTest))
        return { story, prNumber: pr.prNumber, status: redTest?.status === 'split-required' ? 'failed-red-contract' : 'failed-fix', findings: targets, acceptedFindings: accepted, reviewLog, redRefusal: redTest?.status, splitReason: redTest?.splitReason }
      // D2 — independent reproduction; ONE bounded repair, then terminal.
      let redVerification = await redVerify(redTest, redTargets, phase, groupBase)
      for (let repair = 0; repair < MAX_RED_CONTRACT_REPAIRS && (!hasRedContractVerification(redVerification) || redVerification.verified !== true || redVerification.findings.length > 0); repair++) {
        const repairFindings = redVerification?.findings?.length ? redVerification.findings : []
        if (!repairFindings.length) break
        log(`${tag} ${phase}: RED verifier rejected the unsealed contract; one bounded test-only repair`)
        redTargets = [...redTargets, ...repairFindings]
        redTest = await redSpec(redTargets, scope, phase, groupBase, repairFindings)
        if (!hasRedContractReady(redTest))
          return { story, prNumber: pr.prNumber, status: 'failed-fix', findings: redTargets, acceptedFindings: accepted, reviewLog }
        redVerification = await redVerify(redTest, redTargets, phase, groupBase)
      }
      if (!hasRedContractVerification(redVerification) || redVerification.verified !== true || redVerification.findings.length > 0)
        return {
          story,
          prNumber: pr.prNumber,
          status: 'failed-red-contract',
          findings: redVerification?.findings?.length ? redVerification.findings : redTargets,
          acceptedFindings: accepted,
          reviewLog,
        }
      // D3 — the script seals; the agent only runs it.
      const redSnapshot = await redSeal(redTest, phase, groupBase)
      if (!hasSealedRedSnapshot(redSnapshot))
        return { story, prNumber: pr.prNumber, status: 'failed-fix', findings: targets, acceptedFindings: accepted, reviewLog }
      log(`${tag} ${phase}: sealed RED snapshot ${redSnapshot.snapshot}`)
      // D4 — GREEN inside fixScope, above the seal; the round is logged, never commented.
      // A `test` group has no GREEN: the guard IS the fix, production stays untouched, and P3
      // proves the sealed blobs are unchanged and the suite is green on the same head.
      const fix = group.mode === 'test'
        ? { fixed: true, evidenceLedger: (redTest.matrix ?? []).map(row => ({ claim: row.condition, oracle: row.oracle, probe: row.oracle, observed: row.expected })) }
        : await greenFix(redTargets, phase, groupBase)
      if (!fix) return { story, prNumber: pr.prNumber, status: 'failed-fix', acceptedFindings: accepted, reviewLog: cycleHasRemediation ? reviewLog : undefined }
      if (fix.needsHumanDecision) {
        // The fix round ran and appended to the working log, so the log-backed flush always applies.
        await agent(
          invoke(SK.cycleComments, `${cycleArgs()} $mode=flush $hasLog=true $findings=${JSON.stringify(prevFindings)}`),
          { agentType: 'pair-implementer', phase: 'Review', label: `flush:${tag}`, model: 'sonnet', effort: 'medium' },
        )
        return { story, prNumber: pr.prNumber, status: 'escalate', findings: prevFindings, acceptedFindings: accepted }
      }
      // D5 — custody (script) then evidence (read-only). Terminal on breach or defect: a P3
      // finding proves GREEN escaped its contract, and a hidden second GREEN under the same
      // contract is exactly the fix-on-fix drift this gate exists to stop.
      const preflight = await p3Verify(redTargets, fix.evidenceLedger ?? [], phase, groupBase)
      if (!hasPreflightEvidence(preflight))
        return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: targets, acceptedFindings: accepted, reviewLog }
      if (preflight.contractBreach === true)
        return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: preflight.findings, acceptedFindings: accepted, reviewLog }
      const p3 = partitionFindings(preflight.findings)
      accept(p3.carried)
      if (preflight.verified !== (p3.actionable.length === 0))
        return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: preflight.findings, acceptedFindings: accepted, reviewLog }
      if (p3.belowFloor.length)
        log(`${tag} ${phase} preflight: ${p3.belowFloor.length} finding(s) below the ${SEVERITY_FLOOR.name} floor carried to the gate, ${p3.actionable.length} blocking`)
      if (p3.actionable.length)
        return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: p3.actionable, acceptedFindings: accepted, reviewLog }
      groupBase = String(preflight.reviewedHead).toLowerCase()
    }
  }

  // Converged. If any remediation happened (this run OR a prior run this cycle continues),
  // post ONE synthesized remediation comment (contextual to the first review), minimize any
  // prior intermediate comments, and delete the working log. If the first review was already
  // clean (fresh cycle, no remediation), the first-review comment stands alone — nothing to do.
  if (cycleHasRemediation)
    await agent(
      invoke(SK.cycleComments, `${cycleArgs()} $mode=synthesize $accepted=${JSON.stringify(accepted)}`),
      { agentType: 'pair-implementer', phase: 'Review', label: `synth:${tag}`, model: 'sonnet', effort: 'medium' },
    )

  // STOP at the merge boundary — human decides the merge.
  return { story, prNumber: pr.prNumber, status: 'ready-for-merge', acceptedFindings: accepted }
}

// ── Fan-out over the mutex-safe batch ────────────────────────────────────
const results = await boundedParallel(
  STORIES.map((s) => () => driveStory(s)),
  MAX_PARALLELISM,
)
const batch = results.filter(Boolean).map((r) => ({ id: r.story?.id, ...r }))
// The note describes what ACTUALLY happened: counting rows is not counting progress. A row
// with a failure status is not a PR, and `batch.length` only drops when the thunk itself
// returned null. So the sentence is derived from the STATUSES: a card ADVANCED only if it
// reached a PR the human can act on (`ready-for-merge` or `escalate`); everything else is named
// by the status it carries.
const died = STORIES.length - batch.length
const ADVANCED = new Set(['ready-for-merge', 'escalate'])
const advanced = batch.filter((r) => ADVANCED.has(r.status))
const failedRows = batch.filter((r) => !ADVANCED.has(r.status))
const tally = (rows) =>
  [...new Set(rows.map((r) => r.status ?? 'unknown'))].sort().map((s) => `${rows.filter((r) => r.status === s).length} ${s}`).join(', ')
// What did NOT advance, in the two ways it can fail — a row carrying a failure status, and a
// card that never returned one at all. Both are named, because they are recovered differently.
const shortfall = [
  failedRows.length ? `${failedRows.length} returned a failure status (${tally(failedRows)})` : '',
  died ? `${died} never returned a result at all (agents stalled or errored)` : '',
]
  .filter(Boolean)
  .join('; ')
const note = !STORIES.length
  ? 'Empty batch — nothing was requested, nothing was run.'
  : !advanced.length
    ? `NOTHING COMPLETED: 0/${STORIES.length} cards advanced to a PR — ${shortfall}. No PR is ready to merge and nothing was escalated. Committed work in the per-story worktrees is intact — re-run to resume; check the machine's load first, since a stall means agents could not show progress within the supervisor's window.`
    : `${advanced.length}/${STORIES.length} cards advanced to a PR (${tally(advanced)})${shortfall ? `; ${shortfall}` : ''}. Those PRs are ready-for-merge or escalated; check each status. Merge is the human gate — review the list, merge, then re-run with the next mutex-safe batch.`
return {
  workflowVersion: WORKFLOW_VERSION,
  contracts: contracts.map(({ name, status }) => ({ name, status })),
  batch,
  // Stories that never returned anything, named so a failed run is actionable
  // rather than merely empty.
  died: STORIES.filter((s) => !batch.some((b) => b.story?.id === s.id)).map((s) => s.id),
  note,
}
