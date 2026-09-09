export const meta = {
  // The registry keys a workflow by `meta.name`, not by its filename, so the `pair-` prefix
  // has to be HERE too: an adopter with their own `implement-batch` workflow would otherwise
  // collide with this one under an undefined winner. File name and registry name match.
  name: 'pair-implement-batch',
  description:
    'Drive a mutex-safe batch of ready story cards, each to a review-approved PR through four judgment stages (preparation -> independent contract validation + seal -> implementation -> independent final verification), resuming a cycle from its first incomplete step. Stops at PR-ready; NEVER merges (human gate).',
  // NOTE: `meta` must be a PURE LITERAL — the loader parses it statically and rejects any
  // expression node. A `+`-concatenated string is a BinaryExpression and makes the whole
  // workflow UNLOADABLE: it silently disappears from the registry and only `scriptPath`
  // reports why. Keep every value here a single literal, however long the line gets
  // (.claude/workflows/ is outside the prettier gate, so no formatter will re-wrap it).
  whenToUse:
    'REQUIRED args shape: {"cards":[{"id":"234","title":"...","branch":"feature/US-234-..."}]} (`stories` is the accepted alias; never pass both) — a bare space-separated list of issue refs is NOT accepted and the run throws: title feeds the prompts and branch feeds `git worktree add`, and the sandbox has no gh/filesystem access to derive them. Optional per card: base (the branch it stacks on), notes (scope directive), prNumber (re-enter the review loop on an existing PR). Optional per run: maxParallelism, severityFloor, model, models (roles implementation | reviewer | red | redVerifier | green), runId (resume a cycle by naming its run directory), pipeline (skill names, worktree root, audit-log dir, base branch, review-template path, maxFixRounds, reviewers). Engine 3.0.0 retired the planner, sealer, P3, cycle-comments and pr-phase dispatches: the keys `pipeline.skills.remediationPlan|redSeal|p3Verify|cycleComments|prPhase` and `models.planner|seal|preflight|pr` are REJECTED with a migration message, never silently mapped. Every value is validated by TYPE at parse time and a wrong one throws before any agent runs; card fields AND pipeline values are also validated by CONTENT (git refs, safe path segments, skill names) because they reach the shell commands the agents run — a value carrying shell syntax or `..` is rejected, never quoted. An unset optional key may be omitted or spelled `undefined`/`null` — all three mean absent; an EMPTY string is not one of them and throws. Pre-filter for mutex safety — no two cards may touch the same shared skill/file. A dependency must be MERGED, not just PR-ready, before its dependent enters a batch. Prefer ONE long run over pause/resume cycles: each stop kills the agents and loses the in-worktree review log. Tell each implementer NOT to run a single command that can be silent for over ~2 minutes (a cold full-repo quality gate qualifies) and to COMMIT AFTER EVERY TASK: the supervisor kills an agent after 180s without visible progress, and an uncommitted worktree loses everything.',
  phases: [
    { title: 'Contracts', model: 'haiku' },
    { title: 'Prepare', model: 'opus' },
    { title: 'Validate', model: 'opus' },
    { title: 'Implement', model: 'opus' },
    { title: 'Verify', model: 'opus' },
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
//   models?,                      // role-scoped override. Keys: implementation, reviewer, red,
//                                 // redVerifier, green. A role key wins over `model`; use this for an
//                                 // A/B trial without changing the independent verifier or the
//                                 // evidence chain. Retired roles (planner, seal, preflight, pr) THROW.
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
//   workflowVersion,
//   contracts: [{ name, status }],
//   batch:     [{ id, status, prNumber?, reviewedHead?, verdict?, findings?, acceptedFindings?,
//                 reason?, metrics, story }],
//   died:      [id],              // cards that never returned anything
//   metrics:   { dispatches, retries, redirects, wallMs, tokens: 'unknown' },
//   note,                         // derived from the STATUSES: how many cards ADVANCED to a
//                                 // PR (ready-for-merge/escalate) and what the rest did —
//                                 // a batch where every card failed says so, never "ready"
// }
//   status ∈ ready-for-merge | escalate
//          | failed-preparation | failed-contract | failed-seal | failed-implement | failed-fix
//          | failed-verify | failed-custody | failed-resume | incompatible
//   ONLY `ready-for-merge` may advance, and only when the row carries a 40-hex `reviewedHead`
//   and a `verdict` — a caller MUST treat every other status — including one this list does not
//   name yet — as halted. `escalate` and `failed-*` rows carry `reason` and the open findings.
//
// FOUR JUDGMENT STAGES, ONE TRANSITION AUTHORITY. The cycle of a story is a chain of phase
// handoffs under `.pair/working/runs/<runId>/<story>/` in the MAIN checkout. Every phase skill
// runs `cycle-state.mjs resolve` before doing anything and after publishing its handoff, and
// returns the typed `next` step; this file dispatches `next`, validates the typed evidence each
// stage returns, enforces the budgets, and never derives a transition of its own. A same-input
// resume therefore continues from the first incomplete step; a moved head or changed relevant
// inputs re-validate the prior findings plus the delta; an incompatible workflow major or
// ambiguous run scope is `incompatible`, never silently reused.
//
// REBASE IS NOT REPAIRED. There is no custody probe, no card-level reset and no
// SHA-scoped history waiver. An in-flight attempt whose base moved fails closed where it is
// measured — the sealer refuses a HEAD that is not its base, the custody check refuses a snapshot
// that is not an ancestor — and the trusted snapshot is preserved, never reset. A finding whose
// only fix is a history rewrite is a HUMAN decision: the verifier types it
// `humanDecisionKind: 'history-rewrite'` and the engine escalates before any RED/seal/GREEN, with
// nothing in the engine able to accept or waive it.
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
  const modelRoles = ['implementation', 'reviewer', 'red', 'redVerifier', 'green']
  // Engine 3.0.0 retired four dispatch roles. A caller still naming one is told what replaced it —
  // never silently remapped, never silently dropped (two engines would be worse than one error).
  const RETIRED_MODEL_ROLES = { planner: 'red (the preparation stage owns grouping)', seal: 'redVerifier (validation seals in the same execution)', preflight: 'reviewer (the final verifier owns custody and P3 evidence)', pr: 'implementation (implement-phase publishes the PR)' }
  let models
  if (a.models !== undefined && a.models !== null) {
    if (typeof a.models !== 'object' || Array.isArray(a.models))
      throw new Error('implement-batch: `args.models` must be an object keyed by workflow role, or be omitted.')
    for (const role of Object.keys(a.models))
      if (RETIRED_MODEL_ROLES[role])
        throw new Error(`implement-batch: \`args.models.${role}\` was retired by engine 3.0.0 (ADR-024 amendment b) — its work now runs inside ${RETIRED_MODEL_ROLES[role]}. Remove the key; it is never mapped silently.`)
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
const WORKFLOW_VERSION = '3.0.0'

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
    // The five phase skills of the four judgment stages (+ the batch-level template contract).
    // The engine dispatches them BY NAME with typed arguments; every step, rule and command
    // lives in the skill, not here. An adopter who renames them overrides the key.
    contractPhase: '/pair-workflow-contract-phase',
    redSpec: '/pair-workflow-red-spec',
    redVerify: '/pair-workflow-red-verify',
    implementPhase: '/pair-workflow-implement-phase',
    greenFix: '/pair-workflow-green-fix',
    reviewPhase: '/pair-workflow-review-phase',
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
  // Independent final verifiers per head — the tier's reviewer count (KB default 1 at every tier;
  // an adoption override in way-of-working's Review Tier Matrix is passed here by the caller).
  reviewers: 1,
}
// Retired by engine 3.0.0 — named so the migration message can say what absorbed each one.
const RETIRED_SKILL_KEYS = {
  remediationPlan: 'redSpec (grouping is a step of preparation)',
  redSeal: 'redVerify (the seal runs in the validation execution)',
  p3Verify: 'reviewPhase (custody + evidence are the final verifier\'s first steps)',
  cycleComments: 'reviewPhase / greenFix (probe, synthesis and flush are scripts inside those stages)',
  prPhase: 'implementPhase (the implementer publishes the PR)',
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
  rejectUnknownKeys(raw, ['skills', 'worktreeRoot', 'auditLogDir', 'baseBranch', 'reviewTemplate', 'maxFixRounds', 'reviewers'], 'args.pipeline')
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
  for (const k of Object.keys(raw.skills ?? {}))
    if (RETIRED_SKILL_KEYS[k])
      throw new Error(`implement-batch: \`args.pipeline.skills.${k}\` was retired by engine 3.0.0 (ADR-024 amendment b) — its work now runs inside ${RETIRED_SKILL_KEYS[k]}. Remove the key; a retired dispatch is never mapped silently and never re-added.`)
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
    reviewers: posInt(raw.reviewers, 'reviewers', PIPELINE_DEFAULTS.reviewers),
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
// terminal before sealing or GREEN. Unchanged by decision (ADL 2026-09-09); never raised as a remedy.
const MAX_RED_CONTRACT_REPAIRS = 1
// An approved test failing on production returns to implementation on the SAME seal once; a second
// failure is `failed-fix` — the contract was right, the fix was not, and a third GREEN is drift.
const MAX_GREEN_RETRIES = 1
// A cycle that asks for more dispatches than this in one run is looping, not converging.
const MAX_DISPATCHES_PER_STORY = 40

// ── Schemas (orchestration return-value contracts) ─────────────────────────
// These are the compact values agents RETURN for control-flow — NOT the artifact
// formats. The human-facing artifacts follow the KB templates, applied by the
// agents: the PR body → `pr-template.md`, the review report → the configured review
// template (`code-review-template.md` by default), the checkpoint → `checkpoint-template.md`.
// Where a schema field overlaps a template field it MIRRORS the template's vocabulary.
//
// Every phase result carries `next`: the typed step the durable cycle state names after the
// skill published its handoff (`cycle-state.mjs resolve`). A skill whose Step 0 found another
// step due returns `{ status: 'redirect', next }` and nothing else — no judgment was spent.
const STEPS = ['prepare', 'validate', 'implement', 'green', 'verify', 'done', 'blocked']
const NEXT_SCHEMA = {
  type: 'object',
  properties: {
    step: { type: 'string', enum: STEPS },
    mode: { type: 'string' },
    phase: { type: 'string' },
    round: { type: 'integer' },
    attempt: { type: 'integer' },
    revision: { type: 'integer' },
    reviewer: { type: 'integer' },
    base: { type: 'string' },
    reason: { type: 'string' },
    budget: { type: 'string' },
    detail: { type: 'string' },
    reviewedHead: { type: 'string' },
    verdict: { type: 'string' },
    prior: { type: 'string' },
    openIds: { type: 'array', items: { type: 'string' } },
    headMoved: { type: 'boolean' },
    inputsChanged: { type: 'boolean' },
    invalidated: { type: 'array', items: { type: 'string' } },
    contract: { type: 'object' },
    group: { type: 'object' },
    plan: { type: 'object' },
    findings: { type: 'array', items: { type: 'object' } },
    rejection: { type: 'array', items: { type: 'object' } },
    refusal: { type: 'string' },
  },
  required: ['step'],
}
const REDIRECT_STATUS = 'redirect'
const PHASE_RE = /^(a0|r\d+(?:-g\d+(?:-rev\d+)?)?)$/
const SHA40 = /^[0-9a-f]{40}$/
const SHA256_RE = /^sha256:[0-9a-f]{64}$/
const hasNext = n => !!n && typeof n === 'object' && STEPS.includes(n.step)
// A `next` the coordinator will act on: the step is known and, for a dispatchable step, the phase
// id has the shape the run directory expects. Anything else is `failed-resume`.
const usableNext = n =>
  hasNext(n) &&
  (n.step === 'done'
    ? SHA40.test(String(n.reviewedHead ?? ''))
    : n.step === 'blocked'
      ? !!String(n.reason ?? '').trim()
      : PHASE_RE.test(String(n.phase ?? '')) && (n.base === undefined || SHA40.test(String(n.base))))
const isRedirect = r => !!r && r.status === REDIRECT_STATUS && usableNext(r.next)
const isOtherRun = r => !!r && r.status === 'other-run' && isSegment(String(r.runId ?? ''))

// ── Stage 1: preparation (red-spec) ──────────────────────────────────────────
const FIX_SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    owner: { type: 'string' },
    mode: { type: 'string', enum: ['behavioral', 'structural', 'test'] },
    allowedPaths: { type: 'array', items: { type: 'string' } },
  },
  required: ['owner', 'mode', 'allowedPaths'],
}
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          groupId: { type: 'string' },
          findings: { type: 'array', items: { type: 'string' } }, // stable finding IDs
          owner: { type: 'string' },
          mode: { type: 'string', enum: ['behavioral', 'structural', 'test'] },
          allowedPaths: { type: 'array', items: { type: 'string' } },
          oracle: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
        required: ['groupId', 'findings', 'owner', 'mode', 'allowedPaths'],
      },
    },
    // A finding whose correction lies OUTSIDE the repository: it stays BLOCKING until a human
    // disposition or a read-back-verified correction — `carried` names a location, never acceptance.
    carried: {
      type: 'array',
      items: { type: 'object', properties: { finding: { type: 'string' }, disposition: { type: 'string' } }, required: ['finding', 'disposition'] },
    },
  },
  required: ['groups'],
}
const PREPARE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['red', 'stale', 'split-required', 'unprovable', 'dirty', REDIRECT_STATUS] },
    mode: { type: 'string', enum: ['initial', 'remediation', 'repair', 'revision'] },
    inputHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    sourceOfTruth: { type: 'string' },
    // The authoritative inventory: what each obligation (AC or finding) maps to.
    inventory: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' }, // AC-1 | <finding id>
          producer: { type: 'string' }, // the function/grammar/command that owns the behavior
          inputs: { type: 'array', items: { type: 'string' } },
          representations: { type: 'array', items: { type: 'string' } },
          consumers: { type: 'array', items: { type: 'string' } },
          classes: { type: 'array', items: { type: 'string' } }, // equivalence classes incl. invalid/boundary
          interactions: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'producer', 'classes'],
      },
    },
    fixScope: FIX_SCOPE_SCHEMA,
    matrix: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['witness', 'control', 'boundary', 'interaction', 'not-applicable'] },
          baseline: { type: 'string', enum: ['red', 'pass'] },
          condition: { type: 'string' },
          oracle: { type: 'string' },
          expected: { type: 'string' },
          covers: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string' },
        },
        required: ['id', 'kind', 'baseline', 'condition', 'oracle', 'expected', 'covers'],
      },
    },
    redTests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          kind: { type: 'string', enum: ['test', 'fixture'] },
          baseline: { type: 'string', enum: ['red', 'pass'] },
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
    contractPath: { type: 'string' },
    contractHash: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    plan: PLAN_SCHEMA,
    splitReason: { type: 'string' },
    reason: { type: 'string' },
    preserved: { type: 'array', items: { type: 'string' } }, // unknown edits found and left alone
    next: NEXT_SCHEMA,
  },
  required: ['status'],
}
const PREPARE_REFUSALS = new Set(['stale', 'split-required', 'unprovable', 'dirty'])
const isPrepareRefusal = r => !!r && PREPARE_REFUSALS.has(r.status)
// The persisted contract lives in the MAIN checkout's run directory while later stages `cd` into
// the story worktree, so the path is ABSOLUTE by design (repository-relative is accepted and
// resolves against the main checkout).
// Spaces are legal (a checkout under "~/My Projects/…" is a real path) because the value travels
// JSON-quoted as DATA in the prompt and the skills quote it on their command lines; shell
// metacharacters, control characters and `..` are not.
const isContractPath = p =>
  typeof p === 'string' &&
  !p.includes('..') &&
  !/[`$;|&<>"'\\\r\n\x00-\x1f]/.test(p) &&
  (isRelPath(p) || (p.startsWith('/') && /\/\.pair\/working\/runs\//.test(p)))
const validScope = scope => {
  if (!scope || !String(scope.owner ?? '').trim() || !['behavioral', 'structural', 'test'].includes(scope.mode) || !Array.isArray(scope.allowedPaths)) return false
  if (scope.mode === 'test' ? scope.allowedPaths.length !== 0 : scope.allowedPaths.length === 0) return false
  const seen = new Set()
  for (const path of scope.allowedPaths) {
    const file = String(path ?? '').trim()
    if (!file || !isRelPath(file.replace(/\/$/, '')) || seen.has(file)) return false
    seen.add(file)
  }
  return true
}
// A plan is usable only when EVERY received finding id lands in exactly one group or in `carried`,
// every group is non-empty and well-typed, and the dependency graph is acyclic.
const validPlan = (plan, ids) => {
  if (!plan || !Array.isArray(plan.groups)) return false
  const carried = plan.carried ?? []
  if (!Array.isArray(carried)) return false
  if (plan.groups.length === 0 && carried.length === 0) return false
  const seen = new Set()
  const expected = new Set(ids)
  for (const c of carried) {
    if (!c || typeof c.finding !== 'string' || !expected.has(c.finding) || seen.has(c.finding) || !String(c.disposition ?? '').trim()) return false
    seen.add(c.finding)
  }
  const groupIds = new Set()
  for (const g of plan.groups) {
    if (!g || !/^r\d+-g\d+$/.test(String(g.groupId ?? '')) || groupIds.has(g.groupId)) return false
    groupIds.add(g.groupId)
    if (!validScope(g)) return false
    if (!Array.isArray(g.findings) || g.findings.length === 0) return false
    for (const id of g.findings) {
      if (typeof id !== 'string' || !expected.has(id) || seen.has(id)) return false
      seen.add(id)
    }
    if (g.dependsOn !== undefined && (!Array.isArray(g.dependsOn) || g.dependsOn.some(d => typeof d !== 'string' || !groupIds.has(d) && !plan.groups.some(x => x.groupId === d) || d === g.groupId))) return false
  }
  return seen.size === expected.size && orderGroups(plan.groups) !== null
}
function orderGroups(groups) {
  const byId = new Map(groups.map(g => [g.groupId, g]))
  const done = new Set()
  const out = []
  const visiting = new Set()
  const visit = g => {
    if (!g) return false
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
const artifactKind = a => String(a?.kind ?? 'test')
const artifactBaseline = a => String(a?.baseline ?? 'red')
const isProvenArtifact = a => {
  if (!String(a?.command ?? '').trim()) return false
  const observed = String(a?.observed ?? '')
  return artifactBaseline(a) === 'pass' ? /pass|ok|green/i.test(observed) && !/fail/i.test(observed) : /fail/i.test(observed)
}
// The evidence a preparation result must carry before anyone validates it: an inventory, a
// discriminating matrix that covers every inventory item (or says why not), hashed artifacts whose
// observed baseline matches the row they prove, a typed scope and an absolute contract path.
function hasPreparedContract(r, { needPlan = false, ids = [] } = {}) {
  if (!r || r.status !== 'red') return false
  if (!SHA40.test(String(r.inputHead ?? ''))) return false
  if (!String(r.sourceOfTruth ?? '').trim()) return false
  if (!isContractPath(r.contractPath) || !SHA256_RE.test(String(r.contractHash ?? ''))) return false
  if (!validScope(r.fixScope)) return false
  if (!Array.isArray(r.inventory) || r.inventory.length === 0) return false
  const inventoryIds = new Set()
  for (const item of r.inventory) {
    if (!item || !String(item.id ?? '').trim() || !String(item.producer ?? '').trim() || !Array.isArray(item.classes) || item.classes.length === 0 || inventoryIds.has(item.id)) return false
    inventoryIds.add(item.id)
  }
  if (!Array.isArray(r.matrix) || r.matrix.length === 0) return false
  const rowIds = new Set()
  const covered = new Set()
  let witnesses = 0
  for (const row of r.matrix) {
    if (!row || !String(row.id ?? '').trim() || rowIds.has(row.id)) return false
    rowIds.add(row.id)
    if (!['witness', 'control', 'boundary', 'interaction', 'not-applicable'].includes(row.kind) || !['red', 'pass'].includes(row.baseline)) return false
    if (!String(row.condition ?? '').trim() || !String(row.oracle ?? '').trim() || !String(row.expected ?? '').trim()) return false
    if (!Array.isArray(row.covers) || row.covers.length === 0 || row.covers.some(c => !inventoryIds.has(c))) return false
    if (row.kind === 'not-applicable' && !String(row.rationale ?? '').trim()) return false
    if (row.kind === 'witness' && row.baseline === 'red') witnesses++
    for (const c of row.covers) covered.add(c)
  }
  if (covered.size !== inventoryIds.size) return false
  if (needPlan && !validPlan(r.plan, ids)) return false
  if (r.testExempt === true) return !!String(r.exemptionRationale ?? '').trim()
  if (r.testExempt !== false || !Array.isArray(r.redTests) || r.redTests.length === 0) return false
  // Without one discriminating witness the contract cannot fail for the defect it claims to close.
  if (witnesses === 0 && r.fixScope.mode !== 'test') return false
  const byFile = new Map()
  for (const a of r.redTests) {
    const file = String(a?.file ?? '').trim()
    if (!file || byFile.has(file) || !isRelPath(file) || !SHA256_RE.test(String(a?.sha256 ?? ''))) return false
    if (!['test', 'fixture'].includes(artifactKind(a)) || !['red', 'pass'].includes(artifactBaseline(a))) return false
    byFile.set(file, a)
  }
  return r.redTests.every(a => (artifactKind(a) === 'test' ? isProvenArtifact(a) : (() => { const c = byFile.get(String(a?.consumedBy ?? '').trim()); return !!c && artifactKind(c) === 'test' && isProvenArtifact(c) })()))
}

// ── Stage 2: independent validation + seal (red-verify) ──────────────────────
const VALIDATE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['verified', 'rejected', REDIRECT_STATUS] },
    verified: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'object' } },
    sealed: { type: 'boolean' },
    snapshot: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    manifest: { type: 'string' },
    contractHash: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
    reason: { type: 'string' },
    next: NEXT_SCHEMA,
  },
  required: ['status'],
}
const hasValidation = r => !!r && typeof r.verified === 'boolean' && Array.isArray(r.findings) && (r.verified === false ? r.findings.length > 0 : true)
const hasSeal = r => r?.sealed === true && SHA40.test(String(r.snapshot ?? ''))

// ── Stage 3: implementation (implement-phase | green-fix) ────────────────────
const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'failed', REDIRECT_STATUS] },
    gatesPassed: { type: 'boolean' },
    branch: { type: 'string' },
    checkpointPath: { type: 'string' },
    prNumber: { type: 'number' },
    url: { type: 'string' },
    outputHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    summary: { type: 'string' },
    reason: { type: 'string' },
    next: NEXT_SCHEMA,
  },
  required: ['status'],
}
const hasImplementation = r => !!r && r.status === 'ok' && r.gatesPassed === true && isPosInt(r.prNumber) && SHA40.test(String(r.outputHead ?? ''))
const GREEN_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['fixed', 'failed', 'human', REDIRECT_STATUS] },
    fixed: { type: 'boolean' },
    needsHumanDecision: { type: 'boolean' },
    outputHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    evidenceLedger: {
      type: 'array',
      items: { type: 'object', properties: { claim: { type: 'string' }, oracle: { type: 'string' }, probe: { type: 'string' }, observed: { type: 'string' } }, required: ['claim', 'oracle', 'probe', 'observed'] },
    },
    reason: { type: 'string' },
    next: NEXT_SCHEMA,
  },
  required: ['status'],
}
const hasGreen = r => !!r && typeof r.fixed === 'boolean' && Array.isArray(r.evidenceLedger) && (r.fixed ? SHA40.test(String(r.outputHead ?? '')) : true)

// ── Stage 4: final verification (review-phase) ──────────────────────────────
const LOOSE_REVIEW_SCHEMA = {
  // Mirrors the configured review template: the `## Verdict`-line verdict options and the
  // `Findings by severity` finding fields (File:Line / severity / description / recommendation).
  // This is the loose FALLBACK skeleton: phase-0 (ensure-contract, below) derives an enum-locked
  // version from the template via an AI-generated contract.json; when that contract is
  // missing/stale-and-ungeneratable/malformed, this skeleton is used as-is so the run never breaks.
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    reviewedHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    needsHumanDecision: { type: 'boolean' },
    humanDecisionKind: { type: 'string', enum: ['history-rewrite'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          location: { type: 'string' },
          severity: { type: 'string' },
          description: { type: 'string' },
          recommendation: { type: 'string' },
          nonActionable: { type: 'boolean' },
          disposition: { type: 'string' },
        },
      },
    },
  },
  required: ['verdict', 'reviewedHead'],
}
// The orchestration fields every finding carries on top of the template's own: a stable id
// assigned once, the policy decision (`blocking`, computed by the skill's script from the floor
// the coordinator passed and re-checked here), the transition of a prior finding, and the KIND
// that routes recovery (an approved test failing on production returns to GREEN; a contract gap
// revises the affected obligation; a defect opens a round; a regression is a defect on old code).
const FINDING_ORCHESTRATION = {
  id: { type: 'string' },
  blocking: { type: 'boolean' },
  transition: { type: 'string', enum: ['open', 'resolved', 'superseded', 'human'] },
  kind: { type: 'string', enum: ['defect', 'regression', 'approved-test-failing', 'contract-gap', 'question'] },
  external: { type: 'boolean' },
  groupId: { type: 'string' },
  rowId: { type: 'string' },
  severityEvidence: { type: 'string' },
  missedUpstream: { type: 'boolean' },
  evidence: { type: 'string' },
}
const FINDING_ID_RE = /^r\d+(-[a-z])?-\d+$/
const TRANSITIONS = new Set(['open', 'resolved', 'superseded', 'human'])
const KINDS = new Set(['defect', 'regression', 'approved-test-failing', 'contract-gap', 'question'])

// ── Phase 0: ensure machine contracts (md template → contract.json) ────────
// The KB markdown template is the single source of truth; the machine contract is DERIVED from it
// by an AI generator agent (this sandbox has no filesystem access, so all file work — hashing,
// cache check, generation, validation — happens in the agent via the `ensure-contract.mjs` script
// that ships inside the contract-phase skill). Cache-by-hash: unchanged template → reuse (no
// regeneration). Malformed/failed contract → the loose skeleton above is used as-is (the run never
// breaks) and the fallback is reported in the run result (`contracts[].status: 'fallback-loose'`).
// This is the TEMPLATE contract (review vocabulary). It is never the ACCEPTANCE contract a story
// is judged against — that one is prepared and sealed per cycle (stages 1–2 above).
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
  properties: { status: { type: 'string' }, contract: { type: 'object' } },
  required: ['status'],
}
// Last-resort consumer-side guard (pure, value-agnostic): accept the generated schema only if it
// keeps the structure the control flow depends on. Generic contract integrity is validated by
// ensure-contract.mjs — the canonical validator; the sandbox cannot import it.
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
// ── Dispatch accounting ───────────────────────────────────────────────────────
// Every agent call is recorded with its label, role, model/effort, wall time and whether it was a
// retry or a redirect. Token counters are NOT exposed to a workflow script by the harness, so they
// are reported as 'unknown' — never as zero.
const METRICS = { dispatches: [], retries: 0, redirects: 0, startedAt: Date.now() }
async function dispatch(prompt, opts, { retry = false } = {}) {
  const t0 = Date.now()
  const result = await agent(prompt, opts)
  METRICS.dispatches.push({ label: opts.label, agentType: opts.agentType, phase: opts.phase, model: opts.model ?? 'frontmatter', effort: opts.effort, ms: Date.now() - t0, retry, usable: result !== null && result !== undefined })
  if (retry) METRICS.retries++
  return result
}
// A dead step (null, or a shape the stage cannot use) is retried ONCE with the same prompt: every
// stage is re-entrant by construction (it resolves the durable state first), so the retry RESUMES.
// A typed answer — a refusal, a redirect, a rejection — is never retried.
async function agentRetry(prompt, opts, isUsable = r => !!r) {
  const first = await dispatch(prompt, opts)
  if (isUsable(first)) return first
  log(`${opts.label}: step returned nothing usable (agent died or returned an invalid shape) — retrying once`)
  return dispatch(prompt, { ...opts, label: `${opts.label} retry` }, { retry: true })
}

async function ensureContract(spec) {
  const res = await dispatch(
    `Invoke **${SK.contractPhase}** with $name=${spec.name} $template=${spec.template} $contract=${spec.contract} $skeleton=${JSON.stringify(spec.skeleton)} $mirrors=${JSON.stringify(spec.mirrors)} $workflowVersion=${WORKFLOW_VERSION}. The skill is the process of record: execute its steps exactly and return exactly the structured result it defines.`,
    { agentType: 'pair-contract-generator', phase: 'Contracts', label: `contract:${spec.name}`, effort: 'low', schema: CONTRACT_RESULT_SCHEMA },
  )
  const schema = usableSchema(res?.contract)
  return { name: spec.name, status: schema ? (res?.status ?? 'regenerated') : 'fallback-loose', contract: schema ? res.contract : null, schema: schema ?? spec.skeleton }
}
// Contracts are ensured up-front (skipped for an empty batch — nothing to drive).
const contracts = STORIES.length ? await parallel(CONTRACT_SPECS.map((s) => () => ensureContract(s))) : []
const crContract = contracts.find((c) => c.name === 'code-review')
const REVIEW_SCHEMA_BASE = crContract?.schema ?? LOOSE_REVIEW_SCHEMA
const REVIEW_FINDING_SCHEMA = REVIEW_SCHEMA_BASE.properties.findings
// The final verifier's return: the template's verdict/finding vocabulary, the orchestration
// evidence (reviewedHead, custody, readiness, publication) and the finding orchestration fields.
const VERIFY_SCHEMA = {
  ...REVIEW_SCHEMA_BASE,
  properties: {
    ...REVIEW_SCHEMA_BASE.properties,
    status: { type: 'string', enum: ['reviewed', REDIRECT_STATUS] },
    reviewedHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    humanDecisionKind: { type: 'string', enum: ['history-rewrite'] },
    findings: {
      ...REVIEW_FINDING_SCHEMA,
      items: { ...REVIEW_FINDING_SCHEMA.items, properties: { ...(REVIEW_FINDING_SCHEMA.items?.properties ?? {}), ...FINDING_ORCHESTRATION } },
    },
    custody: { type: 'object', properties: { verified: { type: 'boolean' }, contractBreach: { type: 'boolean' }, breaches: { type: 'array', items: { type: 'object' } } }, required: ['verified', 'contractBreach'] },
    readiness: { type: 'object', properties: { ready: { type: 'boolean' }, remoteHead: { type: 'string' } }, required: ['ready'] },
    published: { type: 'object', properties: { firstReview: { type: 'boolean' }, synthesis: { type: 'boolean' }, flush: { type: 'boolean' } } },
    tier: { type: 'string' },
    passes: { type: 'array', items: { type: 'string' } },
    partial: { type: 'boolean' },
    reviewer: { type: 'integer' },
    next: NEXT_SCHEMA,
  },
  required: [...new Set([...(REVIEW_SCHEMA_BASE.required ?? []), 'status', 'verdict', 'reviewedHead', 'findings', 'custody', 'readiness'])],
}
const hasVerdict = r => !!r && !!String(r.verdict ?? '').trim()
const hasReviewEvidence = r => hasVerdict(r) && SHA40.test(String(r.reviewedHead ?? '')) && Array.isArray(r.findings) && !!r.custody && typeof r.custody.contractBreach === 'boolean' && !!r.readiness && typeof r.readiness.ready === 'boolean'

// Reviewer prompt vocabulary — from the contract when present, pair's own only as the fallback.
const REVIEW_VOCAB = crContract?.contract?.vocabulary
const DEFAULT_SEVERITIES = ['Critical', 'Major', 'Minor', 'Questions']
const DEFAULT_VERDICTS = ['APPROVED', 'CHANGES-REQUESTED', 'TECH-DEBT']
const SEVERITIES = (REVIEW_VOCAB?.severities ?? DEFAULT_SEVERITIES).join(', ')
const VERDICTS = (REVIEW_VOCAB?.verdictOptions ?? DEFAULT_VERDICTS).join(', ')
// The severity scale is resolved from the SAME array `SEVERITIES` threads into the verifier
// prompt; its RANKING comes from the contract's explicit `severityRanks`, never array order.
const SEVERITY_SCALE = resolveSeverityScale(REVIEW_VOCAB?.severities, crContract?.contract?.severityRanks)
if (SEVERITY_SCALE.rankError) log(`contract:code-review: severities are NOT ranked (${SEVERITY_SCALE.rankError}) — \`severityFloor\` is unavailable until the contract is regenerated`)
// The floor DEFAULTS to `Minor`: Major and Minor block and drive fix rounds, Questions are carried
// to the merge gate. An explicit `severityFloor` wins. The default is applied SOFTLY (a vocabulary
// without `Minor`, or an unranked contract, falls back to no floor); a caller-spelled floor that
// cannot be applied throws.
const DEFAULT_SEVERITY_FLOOR = 'Minor'
function defaultFloor() {
  if (!SEVERITY_SCALE.ranks) return null
  const key = normSeverity(DEFAULT_SEVERITY_FLOOR)
  if (!Object.hasOwn(SEVERITY_SCALE.ranks, key)) return null
  return { name: DEFAULT_SEVERITY_FLOOR, rank: SEVERITY_SCALE.ranks[key] }
}
const SEVERITY_FLOOR = String(PARSED.severityFloor ?? '').trim() ? parseFloor(PARSED.severityFloor) : defaultFloor()
// The ranks handed to the verifier so its script can compute `blocking` under the SAME policy this
// file re-checks — one policy, two readers, and a disagreement fails closed.
const RANKS_ARG = SEVERITY_SCALE.ranks ? JSON.stringify(Object.fromEntries(SEVERITY_SCALE.names.map(n => [n, SEVERITY_SCALE.ranks[normSeverity(n)]]))) : '{}'

// ── Isolation convention ───────────────────────────────────────────────────
// The AUTHORING chain (prepare -> validate -> implement/green) runs inside a dedicated, PERSISTENT
// per-story git worktree OUTSIDE the repo, so the main working tree is never touched and parallel
// stories never collide. The final verifier inspects from a DETACHED throwaway worktree. Handoffs
// and the cycle log live in the MAIN checkout (`.pair/working/runs/<runId>/<story>/`,
// `<auditLogDir>/<story>.md`), never in a worktree that may be pruned.
// `story.base` (optional, default `origin/main`) is the branch this story STACKS on: a stacked
// story must start from a COMPLETE base (PR-ready), and the whole stack merges in order.
function baseOf(story) {
  return String(story.base ?? '').trim() || PIPELINE.baseBranch
}
// A deterministic digest of the effective inputs the coordinator knows: the cycle state compares
// it with the one persisted in the last handoff, and a change re-validates the review evidence
// (findings + delta) instead of trusting it. No crypto in this sandbox — FNV-1a over the canonical
// string is an identity for CHANGE DETECTION, not a security primitive.
function fnv1a(str) {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}
const canonical = v => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v))
const effectiveInputs = story =>
  fnv1a(canonical({ workflowVersion: WORKFLOW_VERSION, story: story.id, branch: story.branch, base: baseOf(story), title: story.title, notes: story.notes ?? null, severityFloor: SEVERITY_FLOOR?.name ?? null, skills: SK, reviewTemplate: PIPELINE.reviewTemplate, maxFixRounds: MAX_FIX_ROUNDS, reviewers: PIPELINE.reviewers }))
// The compact finding a stage receives: identity, severity, location, the failure case and the
// recommendation — never raw logs, never the whole review history (the run directory holds it).
const compactFinding = f => ({ id: f.id, severity: f.severity, location: f.location, description: f.description, recommendation: f.recommendation, ...(f.kind ? { kind: f.kind } : {}), ...(f.groupId ? { groupId: f.groupId } : {}), ...(f.rowId ? { rowId: f.rowId } : {}), ...(f.external ? { external: true } : {}), ...(f.missedUpstream ? { missedUpstream: true } : {}) })

// ── Per-story lifecycle ──────────────────────────────────────────────────
async function driveStory(story) {
  const tag = `#${story.id}`
  const worktreePath = `${PIPELINE.worktreeRoot}/${story.id}`
  const reviewWorktreePath = `${PIPELINE.worktreeRoot}/${story.id}-review`
  const storyBase = baseOf(story)
  const stacked = storyBase !== PIPELINE.baseBranch
  // One run directory per story for every phase: `args.runId` when the caller names the run, else
  // `story-<id>`. When the directory is empty but the PR already has a cycle under another run id,
  // the cycle state names it (`other-run`) and the story continues THERE — a new invocation id never
  // opens a second cycle for one PR.
  let runId = RUN_ID ?? `story-${story.id}`
  const runDir = () => `.pair/working/runs/${runId}/${story.id}`
  const resuming = Number.isInteger(story.prNumber)
  let pr = resuming ? story.prNumber : null
  const reviewLog = `${PIPELINE.auditLogDir}/${story.id}.md`
  const firstReviewMarker = () => `<!-- pair:first-review #${story.id} PR#${pr} -->`
  const synthesisMarker = () => `<!-- pair:synthesis #${story.id} PR#${pr} -->`
  const policy = { maxFixRounds: MAX_FIX_ROUNDS, redRepairs: MAX_RED_CONTRACT_REPAIRS, greenRetries: MAX_GREEN_RETRIES, reviewers: PIPELINE.reviewers }
  const inputs = effectiveInputs(story)
  const storyMetrics = { dispatches: 0, retries: 0, redirects: 0, startedAt: Date.now() }
  const common = () =>
    `$run=${runId} $story=${story.id} $branch=${story.branch} $worktree=${worktreePath} $base=${storyBase} $stacked=${stacked}${pr ? ` $pr=${pr}` : ''} $entry=${pr ? 'pr' : 'fresh'} $policy=${JSON.stringify(policy)} $inputs=${inputs}`
  const invoke = (skill, args) =>
    `Invoke **${skill}** for story ${tag} with ${args} $workflowVersion=${WORKFLOW_VERSION}. The skill is the process of record: execute its steps exactly, do not improvise or skip one, and return exactly the structured result it defines — its Step 0 resolves the durable cycle state and returns \`{ status: "redirect", next }\` when another step is due, spending no judgment. Do NOT read ${BLIND_PATHS} except the checkpoint and the run directory \`${runDir()}/\` the skill names; that directory lives in the MAIN checkout — the working directory you were started in, before any cd — never inside a story or review worktree. Do NOT merge.`
  const notesArg = () => (story.notes ? ` $notes=${JSON.stringify(story.notes)}` : '')
  const findingsArg = list => (list && list.length ? ` $findings=${JSON.stringify(list.map(compactFinding))}` : '')

  // Findings carried to the merge gate unfixed — by-design, human-dispositioned or below the floor —
  // accumulate across rounds and runs; never reassigned.
  const accepted = []
  const acceptedKeys = new Set()
  const accept = findings => {
    for (const f of findings) {
      const key = `${f.id ?? ''} ${f.location ?? ''} ${f.description ?? ''}`
      if (acceptedKeys.has(key)) continue
      acceptedKeys.add(key)
      accepted.push(f)
    }
  }
  const result = (status, extra = {}) => ({ story, prNumber: pr ?? undefined, status, acceptedFindings: accepted, metrics: { ...storyMetrics, wallMs: Date.now() - storyMetrics.startedAt, tokens: 'unknown' }, ...extra })
  const blockedResult = n => {
    const map = { 'failed-preparation': 'failed-preparation', 'failed-contract': 'failed-contract', 'failed-seal': 'failed-seal', 'failed-implement': 'failed-implement', 'failed-fix': 'failed-fix', 'failed-custody': 'failed-custody', escalate: 'escalate', 'failed-resume': 'failed-resume' }
    return result(map[n.reason] ?? 'failed-resume', { reason: n.detail ?? n.reason, budget: n.budget, refusal: n.refusal, findings: n.findings ?? n.rejection, phase: n.phase })
  }

  // ── The four stages, each a SKILL invoked by name with typed arguments ─────────────────────
  const prepare = n =>
    agentRetry(
      invoke(SK.redSpec, `${common()} $mode=${n.mode} $phase=${n.phase}${n.base ? ` $head=${n.base}` : ''}${n.mode === 'initial' ? ` $title=${JSON.stringify(story.title)}` : ''}${findingsArg(n.findings)}${n.group ? ` $scope=${JSON.stringify({ groupId: n.group.groupId, owner: n.group.owner, mode: n.group.mode, allowedPaths: n.group.allowedPaths, oracle: n.group.oracle })}` : ''}${n.rejection?.length ? ` $rejection=${JSON.stringify(n.rejection)}` : ''}${n.contract ? ` $contract=${JSON.stringify(n.contract.path)} $contractHash=${n.contract.hash}` : ''}${n.revision ? ` $revision=${n.revision}` : ''}${notesArg()}`),
      withModel('red', { agentType: 'pair-fix-test-author', phase: 'Prepare', label: `prepare:${tag} ${n.phase}${n.mode === 'repair' ? ' repair' : n.mode === 'revision' ? ' revision' : ''}`, effort: 'high', schema: PREPARE_SCHEMA }),
      r => isRedirect(r) || isOtherRun(r) || isPrepareRefusal(r) || hasPreparedContract(r, { needPlan: n.mode === 'remediation' && /-g1$/.test(n.phase), ids: (n.findings ?? []).map(f => f.id) }),
    )
  const validate = n =>
    agentRetry(
      invoke(SK.redVerify, `${common()} $phase=${n.phase} $head=${n.base} $contract=${JSON.stringify(n.contract.path)} $contractHash=${n.contract.hash}${findingsArg(n.findings)}${n.group ? ` $scope=${JSON.stringify({ groupId: n.group.groupId, owner: n.group.owner, mode: n.group.mode, allowedPaths: n.group.allowedPaths })}` : ''}`),
      withModel('redVerifier', { agentType: 'pair-red-contract-verifier', phase: 'Validate', label: `validate:${tag} ${n.phase}`, effort: 'high', schema: VALIDATE_SCHEMA }),
      r => isRedirect(r) || isOtherRun(r) || hasValidation(r),
    )
  const implement = n =>
    agentRetry(
      invoke(SK.implementPhase, `${common()} $phase=${n.phase} $head=${n.base} $snapshot=${n.contract.snapshot} $contract=${JSON.stringify(n.contract.path)} $title=${JSON.stringify(story.title)} $implementSkill=${SK.implement} $verifyQuality=${SK.verifyQuality} $recordDecision=${SK.recordDecision} $checkpoint=${SK.checkpoint} $publishPr=${SK.publishPr}${notesArg()}`),
      withModel('implementation', { agentType: 'pair-implementer', phase: 'Implement', label: `implement:${tag}`, effort: 'high', schema: IMPLEMENT_SCHEMA }),
      r => isRedirect(r) || isOtherRun(r) || (!!r && (r.status === 'ok' || r.status === 'failed') && typeof r.gatesPassed === 'boolean'),
    )
  const green = n =>
    agentRetry(
      invoke(SK.greenFix, `${common()} $phase=${n.phase} $head=${n.base} $attempt=${n.attempt} $snapshot=${n.contract.snapshot} $contract=${JSON.stringify(n.contract.path)}${findingsArg(n.findings)} $reviewLog=${reviewLog} $marker=${JSON.stringify(firstReviewMarker())} $writeIssue=${SK.writeIssue}${notesArg()}`),
      withModel('green', { agentType: 'pair-implementer', phase: 'Implement', label: `green:${tag} ${n.phase}${n.attempt > 1 ? ` attempt ${n.attempt}` : ''}`, effort: 'high', schema: GREEN_SCHEMA }),
      r => isRedirect(r) || isOtherRun(r) || hasGreen(r),
    )
  const verify = (n, required) =>
    agentRetry(
      invoke(
        SK.reviewPhase,
        `${common()} $phase=${n.phase} $mode=${n.mode} $head=${n.base ?? ''} $worktree=${reviewWorktreePath} $reviewLog=${reviewLog} $marker=${JSON.stringify(firstReviewMarker())} $synthesisMarker=${JSON.stringify(synthesisMarker())} $template=${REVIEW_TEMPLATE_LABEL} $severities=${JSON.stringify(SEVERITIES)} $verdicts=${JSON.stringify(VERDICTS)}${SEVERITY_FLOOR ? ` $floor=${SEVERITY_FLOOR.name}` : ''} $ranks=${RANKS_ARG} $reviewer=${n.reviewer ?? 1} $reviewers=${PIPELINE.reviewers} $reviewSkill=${SK.review} $writeIssue=${SK.writeIssue}${n.prior ? ` $prior=${n.prior}` : ''}${n.openIds?.length ? ` $openIds=${JSON.stringify(n.openIds)}` : ''}${n.headMoved ? ' $headMoved=true' : ''}${n.inputsChanged ? ' $inputsChanged=true' : ''}${required.length ? ` $required=${JSON.stringify(required)}` : ''}`,
      ),
      withModel('reviewer', { agentType: 'pair-reviewer', phase: 'Verify', label: `verify:${tag} ${n.phase}${n.reviewer > 1 ? ` reviewer ${n.reviewer}` : ''}`, effort: 'high', schema: VERIFY_SCHEMA }),
      r => isRedirect(r) || isOtherRun(r) || hasReviewEvidence(r),
    )

  // Verified P3 evidence a card carries in: the verifier must re-prove it on its exact head and it
  // stays out of the verifier's independent sample otherwise. Injected once.
  let pendingRequiredFindings = [...(story.requiredFindings ?? [])]
  // Prior findings by id, for the identity/severity checks the coordinator makes on a re-review.
  const known = new Map()

  // The verifier applied the SAME severity policy this file holds: re-derive `blocking` from the
  // floor and refuse a result that disagrees — a policy applied twice must agree, or fail closed.
  const expectedBlocking = f => !f.nonActionable && f.transition !== 'resolved' && f.transition !== 'human' && f.kind !== 'question' && (!SEVERITY_FLOOR || rankOf(f.severity) >= SEVERITY_FLOOR.rank)
  const findingErrors = (review, openIds) => {
    const errs = []
    const ids = new Set()
    for (const f of review.findings) {
      if (!f || typeof f !== 'object') return ['a finding is not an object']
      if (!FINDING_ID_RE.test(String(f.id ?? ''))) errs.push(`finding id ${JSON.stringify(f.id)} is not r<round>[-<reviewer>]-<n>`)
      if (ids.has(f.id)) errs.push(`finding id ${f.id} is duplicated`)
      ids.add(f.id)
      if (!TRANSITIONS.has(f.transition)) errs.push(`finding ${f.id}: transition ${JSON.stringify(f.transition)} is not open | resolved | superseded | human`)
      if (!KINDS.has(f.kind)) errs.push(`finding ${f.id}: kind ${JSON.stringify(f.kind)} is unknown`)
      if (typeof f.blocking !== 'boolean') errs.push(`finding ${f.id}: blocking is not a boolean`)
      else if (f.blocking !== expectedBlocking(f)) errs.push(`finding ${f.id}: blocking=${f.blocking} disagrees with the severity policy (floor ${SEVERITY_FLOOR?.name ?? 'none'}, severity ${f.severity}, transition ${f.transition})`)
      if (f.external === true && f.transition === 'resolved' && !String(f.evidence ?? '').trim()) errs.push(`finding ${f.id}: an external finding is resolved only with read-back evidence`)
      const prior = known.get(f.id)
      if (prior && normSeverity(prior.severity) !== normSeverity(f.severity) && !String(f.severityEvidence ?? '').trim()) errs.push(`finding ${f.id}: severity changed ${prior.severity} -> ${f.severity} without severityEvidence`)
      if (!prior && f.transition !== 'open') errs.push(`finding ${f.id}: a new finding cannot arrive as ${f.transition}`)
    }
    for (const id of openIds ?? []) if (!ids.has(id)) errs.push(`prior open finding ${id} was dropped — every open finding needs a transition`)
    return errs
  }

  let next = resuming ? { step: 'verify', mode: 'first', phase: 'r0', round: 0, attempt: 1 } : { step: 'prepare', mode: 'initial', phase: 'a0', round: 0, attempt: 1 }
  const seen = new Set()
  let redirectsInARow = 0
  while (true) {
    if (next.step === 'done') return result('ready-for-merge', { reviewedHead: next.reviewedHead, verdict: next.verdict, round: next.round })
    if (next.step === 'blocked') return blockedResult(next)
    if (storyMetrics.dispatches >= MAX_DISPATCHES_PER_STORY) return result('failed-resume', { reason: `the cycle asked for more than ${MAX_DISPATCHES_PER_STORY} dispatches in one run — looping, not converging` })
    const key = `${next.step}:${next.phase}:${next.mode ?? ''}:${next.attempt ?? 1}:${next.reviewer ?? 1}`
    if (seen.has(key)) return result('failed-resume', { reason: `the cycle state asked for ${key} twice in one run` })
    seen.add(key)
    let res
    let stage = next.step
    if (stage === 'prepare') res = await prepare(next)
    else if (stage === 'validate') res = await validate(next)
    else if (stage === 'implement') res = await implement(next)
    else if (stage === 'green') res = await green(next)
    else {
      const required = pendingRequiredFindings
      res = await verify(next, required)
    }
    storyMetrics.dispatches = METRICS.dispatches.filter(d => d.label.includes(tag)).length
    storyMetrics.retries = METRICS.dispatches.filter(d => d.label.includes(tag) && d.retry).length
    // Twice dead (null, or a shape no stage can use) is the STAGE's failure — never a clean result.
    if (!res || typeof res !== 'object')
      return result({ prepare: 'failed-preparation', validate: 'failed-contract', implement: 'failed-implement', green: 'failed-fix', verify: 'failed-verify' }[stage], { reason: `${stage} returned nothing usable twice (agent died or returned an invalid shape)`, phase: next.phase })
    if (isOtherRun(res)) {
      // The PR already has a cycle under another run id: continue THERE. Re-dispatch the same step
      // once with the adopted run id; a second `other-run` is an ambiguity the caller resolves.
      if (runId === res.runId) return result('failed-resume', { reason: `the cycle state named the current run ${runId} as another run` })
      log(`${tag}: cycle already lives under run ${res.runId} — continuing there`)
      runId = res.runId
      seen.delete(key)
      continue
    }
    if (isRedirect(res)) {
      storyMetrics.redirects++
      METRICS.redirects++
      if (++redirectsInARow > 2) return result('failed-resume', { reason: 'three consecutive redirects — the durable state and the dispatched step disagree' })
      next = res.next
      continue
    }
    redirectsInARow = 0
    // ── Stage-specific validation of the typed evidence ─────────────────────────────────────
    if (stage === 'prepare') {
      if (isPrepareRefusal(res)) return result('failed-preparation', { reason: res.reason ?? res.splitReason ?? res.status, refusal: res.status, phase: next.phase, findings: next.findings })
      if (!hasPreparedContract(res, { needPlan: next.mode === 'remediation' && /-g1$/.test(next.phase), ids: (next.findings ?? []).map(f => f.id) })) return result('failed-preparation', { reason: 'the preparation stage returned no usable contract', phase: next.phase })
      if (next.mode === 'remediation' && res.plan) {
        const carried = (res.plan.carried ?? []).map(c => ({ ...(next.findings ?? []).find(f => f.id === c.finding), external: true, disposition: `Outside the repository — ${c.disposition}` }))
        // Carried is a LOCATION, not acceptance: the finding stays blocking for the verifier; here it
        // is only recorded so the merge-gate reader sees where it lives.
        if (carried.length) log(`${tag} ${next.phase}: ${carried.length} finding(s) located outside the repository — they stay blocking until dispositioned by a human`)
      }
    } else if (stage === 'validate') {
      if (!hasValidation(res)) return result('failed-contract', { reason: 'the validation stage returned no usable verdict', phase: next.phase })
      if (res.verified === true && !hasSeal(res)) return result('failed-seal', { reason: res.reason ?? 'the contract was verified but not sealed', phase: next.phase })
      if (res.verified === true && res.contractHash && res.contractHash !== next.contract.hash) return result('failed-seal', { reason: `the sealed contract hash ${res.contractHash} is not the prepared ${next.contract.hash}`, phase: next.phase })
    } else if (stage === 'implement') {
      if (res.status !== 'ok') return result('failed-implement', { reason: res.reason ?? 'implementation reported failure', phase: next.phase })
      if (!hasImplementation(res)) return result('failed-implement', { reason: 'implementation returned no PR number, head or green gate', phase: next.phase })
      pr = res.prNumber
    } else if (stage === 'green') {
      if (res.needsHumanDecision === true) return result('escalate', { reason: res.reason ?? 'the fixer asked for a human decision', phase: next.phase, findings: next.findings })
      if (res.fixed !== true) return result('failed-fix', { reason: res.reason ?? 'the fix did not make the contract pass', phase: next.phase, findings: next.findings })
    } else {
      // verify
      if (!hasReviewEvidence(res)) return result('failed-verify', { reason: 'the final verifier returned no verdict, head, custody or readiness', phase: next.phase })
      const reviewedHead = String(res.reviewedHead).toLowerCase()
      const staleRequired = pendingRequiredFindings.filter(f => f.observedHead !== reviewedHead)
      if (staleRequired.length) return result('failed-verify', { reason: 'required findings were measured on a different head', findings: staleRequired })
      pendingRequiredFindings = []
      const errs = findingErrors(res, next.openIds)
      if (errs.length) return result('failed-verify', { reason: errs.join('; '), phase: next.phase })
      for (const f of res.findings) known.set(f.id, f)
      accept(res.findings.filter(f => !f.blocking && f.transition !== 'resolved').map(f => ({ ...compactFinding(f), disposition: f.disposition || (f.nonActionable ? 'By design (see description)' : f.transition === 'human' ? 'Human disposition' : f.kind === 'question' ? 'Question for the human' : `Below severity floor (${SEVERITY_FLOOR?.name}) — carried to the merge gate unfixed`) })))
      if (res.custody.contractBreach === true) return result('failed-custody', { reason: 'GREEN escaped its sealed contract', findings: res.custody.breaches ?? [], phase: next.phase })
      const blocking = res.findings.filter(f => f.blocking)
      if (res.partial !== true) log(`${tag} ${next.phase}: ${res.findings.length} finding(s), ${blocking.length} blocking${res.published?.firstReview ? ', first review posted' : ''}${res.published?.synthesis ? ', synthesis published' : ''}`)
    }
    if (!usableNext(res.next)) return result('failed-resume', { reason: `${stage} returned no usable next step`, phase: next.phase })
    // A `done` may only follow a verification whose own evidence says ready on the head it reviewed.
    if (res.next.step === 'done' && (stage !== 'verify' || res.readiness.ready !== true || res.findings.some(f => f.blocking) || res.next.reviewedHead !== String(res.reviewedHead).toLowerCase() || (res.readiness.remoteHead && String(res.readiness.remoteHead).toLowerCase() !== res.next.reviewedHead)))
      return result('failed-verify', { reason: 'the cycle state declared done without matching verification evidence', phase: next.phase })
    next = res.next
  }
}

// ── Fan-out over the mutex-safe batch ────────────────────────────────────
const results = await boundedParallel(
  STORIES.map((s) => () => driveStory(s)),
  MAX_PARALLELISM,
)
const batch = results.filter(Boolean).map((r) => ({ id: r.story?.id, ...r }))
// The note describes what ACTUALLY happened: a card ADVANCED only if it reached a PR the human can
// act on (`ready-for-merge` or `escalate`); everything else is named by the status it carries.
const died = STORIES.length - batch.length
const ADVANCED = new Set(['ready-for-merge', 'escalate'])
const advanced = batch.filter((r) => ADVANCED.has(r.status))
const failedRows = batch.filter((r) => !ADVANCED.has(r.status))
const tally = (rows) =>
  [...new Set(rows.map((r) => r.status ?? 'unknown'))].sort().map((s) => `${rows.filter((r) => r.status === s).length} ${s}`).join(', ')
const shortfall = [
  failedRows.length ? `${failedRows.length} returned a failure status (${tally(failedRows)})` : '',
  died ? `${died} never returned a result at all (agents stalled or errored)` : '',
]
  .filter(Boolean)
  .join('; ')
const note = !STORIES.length
  ? 'Empty batch — nothing was requested, nothing was run.'
  : !advanced.length
    ? `NOTHING COMPLETED: 0/${STORIES.length} cards advanced to a PR — ${shortfall}. No PR is ready to merge and nothing was escalated. Committed work in the per-story worktrees and the handoffs under .pair/working/runs/ are intact — re-run with the same runId to resume from the first incomplete step.`
    : `${advanced.length}/${STORIES.length} cards advanced to a PR (${tally(advanced)})${shortfall ? `; ${shortfall}` : ''}. Those PRs are ready-for-merge or escalated; check each status. Merge is the human gate — review the list, merge, then re-run with the next mutex-safe batch.`
return {
  workflowVersion: WORKFLOW_VERSION,
  contracts: contracts.map(({ name, status }) => ({ name, status })),
  batch,
  died: STORIES.filter((s) => !batch.some((b) => b.story?.id === s.id)).map((s) => s.id),
  metrics: { dispatches: METRICS.dispatches.length, retries: METRICS.retries, redirects: METRICS.redirects, wallMs: Date.now() - METRICS.startedAt, tokens: 'unknown', perDispatch: METRICS.dispatches },
  note,
}
