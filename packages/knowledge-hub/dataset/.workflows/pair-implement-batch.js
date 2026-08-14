export const meta = {
  // The registry keys a workflow by `meta.name`, not by its filename, so the `pair-` prefix
  // has to be HERE too: an adopter with their own `implement-batch` workflow would otherwise
  // collide with this one under an undefined winner. File name and registry name match.
  name: 'pair-implement-batch',
  description:
    'Drive a mutex-safe batch of ready Pair stories, each to a review-approved PR (implement -> PR -> independent review <-> fix loop). Stops at PR-ready; NEVER merges (human gate).',
  // NOTE: `meta` must be a PURE LITERAL — the loader parses it statically and rejects any
  // expression node. A `+`-concatenated string is a BinaryExpression and makes the whole
  // workflow UNLOADABLE: it silently disappears from the registry and only `scriptPath`
  // reports why. Keep every value here a single literal, however long the line gets
  // (.claude/workflows/ is outside the prettier gate, so no formatter will re-wrap it).
  whenToUse:
    'REQUIRED args shape: {"stories":[{"id":"234","title":"...","branch":"feature/US-234-..."}]} — a bare list of issue refs ("#234 #236") is NOT accepted and the run throws: title feeds the prompts and branch feeds `git worktree add`, and the sandbox has no gh/filesystem access to derive them. Optional per story: notes (scope directive) and prNumber (re-enter the review loop on an existing PR). Pre-filter for mutex safety — no two stories may touch the same shared skill/file. A dependency must be MERGED, not just PR-ready, before its dependent enters a batch. Prefer ONE long run over pause/resume cycles: each stop kills the agents and loses the in-worktree review log. Tell each implementer NOT to run a single command that can be silent for over ~2 minutes (a full `pnpm quality-gate` on a cold worktree cache qualifies) and to COMMIT AFTER EVERY TASK: the supervisor kills an agent after 180s without visible progress, and an uncommitted worktree loses everything.',
  phases: [
    { title: 'Contracts', model: 'haiku' },
    { title: 'Implement', model: 'opus' },
    { title: 'PR', model: 'sonnet' },
    { title: 'Review', model: 'opus' },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CONTRACT (#219 AC7) — what `pair-loop` (#250) codes against.
// Stable. A rename here breaks a caller this repo cannot see, so treat every name
// below as public API.
//
// INPUT  args = {
//   cards: [{                     // `stories` is the accepted pair-era alias; never both
//     id, title, branch,          // required — id+title feed prompts, branch feeds worktree add
//     base?,                      // the branch this card STACKS on (default: pipeline.baseBranch)
//     notes?,                     // scope directive threaded into implement + PR
//     prNumber?,                  // resume an existing PR straight into the review<->fix loop
//   }],                           // every card VALUE is validated, not just its key set: id is one
//                                 // path segment, branch/base are git refs, title/notes are plain
//                                 // text. They reach shell command text an agent runs, so a value
//                                 // carrying shell syntax or `..` is REJECTED, never quoted.
//   maxParallelism?,              // integer >= 1; absent = unbounded fan-out
//   severityFloor?,               // findings below it are carried, not fixed. It is spelled in
//                                 // the REVIEW TEMPLATE's severity vocabulary (pipeline.reviewTemplate
//                                 // -> contract `vocabulary.severities`), pair's own when none is
//                                 // configured; a value outside that set THROWS rather than rank
//                                 // against a foreign scale.
//   model?,                       // fable | haiku | sonnet | opus
//   pipeline?,                    // per-key overrides — see PIPELINE_DEFAULTS
// }
//
// MUTEX is the CALLER's precondition, not this engine's guarantee: it drives what it is
// given, in parallel. Declaring which cards may run together is `pair-loop`'s dependency
// analysis, because only the caller knows the file sets.
//
// RETURN {
//   contracts: [{ name, status }],
//   batch:     [{ id, status, prNumber?, findings?, acceptedFindings?, story, ... }],
//   died:      [id],              // cards that never returned anything
//   note,                         // says what actually happened, incl. total failure
// }
//   status ∈ ready-for-merge | escalate
//          | failed-implement | failed-pr | failed-review | failed-fix
//
// NEVER `merged`. Merge is the human/policy gate on every path; auto-advance is #250's
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
// args.stories = the batch of STORIES (never tasks) to drive THIS run. A batch
// ITEM IS A STORY, not a task: each story is delivered on ONE branch with ONE
// PR — opened the first time and UPDATED for all subsequent work on that story
// (further tasks/features included). NEVER one-PR-per-task, and NEVER a second
// PR for the same story: continuing a story that already has a PR reuses its
// existing branch/{prNumber} and updates that PR (create-or-update). A second
// PR for the same story is forbidden unless a human explicitly instructs it.
// MUST be pre-filtered to be mutex-safe: no two stories here may touch the same
// shared skill/file (pair-next, pair-process-review, record-decision,
// apps/pair-cli, templates).
// Chains advance ACROSS runs: after you merge these PRs, re-run with the next
// batch (the now-unblocked heads). A story's dependency must be MERGED, not
// just PR-ready, before its dependent enters a batch.
// Each story: { id, title, branch }. Add { prNumber } to RESUME an existing PR
// mid-review — implement+PR are skipped and the story re-enters the review<->fix
// loop directly (drives remaining findings, incl. minor, to zero).
// Optional { notes } = a scope directive threaded into the implement+PR prompts
// (overrides the issue body on conflict), e.g. "resolve all findings in ONE PR,
// do not split".
//
// #401: the input is validated LOUDLY. The previous version coerced an unparseable
// string to `undefined` and fell through to `STORIES = []`, so a caller who
// passed a bare list of refs (`args: "#234 #236"`) got a run that spawned ZERO
// agents, exited in ~30ms and returned the SUCCESS-shaped
// `{ batch: [], note: 'PRs are ready-for-merge or escalated…' }` — a silent
// no-op reported as a completed batch, indistinguishable from a real run whose
// stories all failed. An orchestrator asked to drive stories and driving none
// must fail, not report success. An EXPLICIT empty list stays a legal no-op:
// a caller that computed "nothing to do" is not making a mistake.

// Every caller-facing object validates its key SET, not just the keys it recognises. A
// misspelled key that is merely ignored runs the batch on values nobody chose and reports
// success — the #401 direction — and the shipped docs promise the opposite in as many words.
function rejectUnknownKeys(obj, allowed, where) {
  for (const k of Object.keys(obj ?? {}))
    if (!allowed.includes(k))
      throw new Error(
        `implement-batch: unknown \`${where}.${k}\`; expected one of ${allowed.join(', ')}. ` +
          `An unrecognised key would be dropped in silence and the run would use the default ` +
          `while the caller believed otherwise.`,
      )
}

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
  // `cards` is the generalized contract name (#219 AC7); `stories` is the pair-era alias,
  // kept working so no existing caller breaks. Both present is an ERROR rather than a
  // preference: silently picking one would drive a batch the caller did not describe.
  if (a && typeof a === 'object' && Array.isArray(a.cards) && Array.isArray(a.stories))
    throw new Error(
      `implement-batch: \`args\` carries both \`cards\` and \`stories\`. They are the same field — ` +
        `\`cards\` is the current name, \`stories\` the accepted alias. Pass exactly one.`,
    )
  if (a && typeof a === 'object' && Array.isArray(a.cards) && !('stories' in a)) a = { ...a, stories: a.cards }
  if (!a || typeof a !== 'object' || !Array.isArray(a.stories))
    throw new Error(
      `implement-batch: \`args\` must be { stories: [...] } (or a bare array of stories). Received: ` +
        `${a === undefined || a === null ? String(a) : JSON.stringify(a).slice(0, 80)}. ` +
        `Nothing was run — this is an input error, not an empty batch.`,
    )
  const seenIds = new Map()
  const stories = a.stories.map((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s))
      throw new Error(`implement-batch: stories[${i}] is not an object: ${JSON.stringify(s)}.`)
    // The CARD's key set is validated like every other caller-facing object. Without this,
    // `prNumbr: 432` (typo) or a card carrying an invented key was dropped in silence:
    // `resuming` stayed false, the engine ran IMPLEMENT then publishPr, and opened a SECOND
    // PR for a story that already had one — the very thing this file forbids in as many words.
    rejectUnknownKeys(s, ['id', 'title', 'branch', 'base', 'notes', 'prNumber'], `cards[${i}]`)
    // `#234` and `234` name the same story; normalize once so no prompt, worktree
    // path or marker ever carries a stray `#`. A number is lossless and unambiguous for an
    // issue ref and is coerced deliberately; anything else is not — `id: ['234']` and
    // `id: true` both survived `String()` and then PASSED the safe-path-segment test as
    // "234"/"true", naming a worktree the caller never wrote. Same rule as the sibling engine.
    if (s.id !== undefined && s.id !== null && typeof s.id !== 'string' && typeof s.id !== 'number')
      throw new Error(
        `implement-batch: cards[${i}] has id of type ${Array.isArray(s.id) ? 'array' : typeof s.id}, which is not a string or a number. ` +
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
        `implement-batch: stories[${i}]${id ? ` (#${id})` : ''} is missing ${missing.join(', ')}. ` +
          `All three are required — id + title feed the prompts, branch feeds \`git worktree add\`; ` +
          `an absent one would reach a shell command as \`undefined\`.`,
      )
    // Presence is not validity. Every field below is interpolated VERBATIM into command text a
    // Bash-capable agent then runs — `git worktree add <root>/<id> -B <branch> <base>` and
    // `git worktree remove --force <root>/<id>-review` — so a card value carries the authority
    // of the command line it lands on. Two escapes reachable through the DOCUMENTED contract:
    // `branch: 'x origin/main; gh pr merge 432 --squash'` renders a merge instruction into the
    // implement prompt, defeating AC5's hardest guarantee; `id: '../../scratch'` aims a
    // `--force` remove outside the worktree root, which is not recoverable. Rejected rather
    // than quoted: an escaped value still RUNS, and the caller who typed something that was
    // never a branch never learns it — the #401 direction, on the one input that can merge.
    const constrain = (value, key, ok, what) => {
      // Reject a present-but-non-string value BEFORE coercing it. `String(value ?? '')` first
      // meant `notes: {a:1}` reached the prompt as `[object Object]` and `branch: ['a','b']` as
      // `a,b` — the coerce-instead-of-reject direction this file rejects everywhere else, and
      // it defeats the type check a reader assumes is there.
      if (value !== undefined && value !== null && typeof value !== 'string')
        throw new Error(
          `implement-batch: cards[${i}] (#${id}) has ${key} of type ${Array.isArray(value) ? 'array' : typeof value}, which is not a string. ` +
            `A non-string would be COERCED into the shell commands the agents run (an object becomes "[object Object]", ` +
            `an array joins on commas) as if the caller had typed it. Pass a string, or omit the key.`,
        )
      const v = String(value ?? '').trim()
      if (!v) return // absent/blank is handled above (required) or falls back to a default (optional)
      if (!ok(v))
        throw new Error(
          `implement-batch: cards[${i}] (#${id}) has ${key} ${JSON.stringify(v)}, which is not ${what}. ` +
            `Card fields are interpolated verbatim into the shell commands the agents run, so a value carrying ` +
            `shell syntax or a path escape would EXECUTE rather than name a ${key}. Rejected, never quoted.`,
        )
    }
    // Git ref charset. Never a leading `-` (the shell reads it as a flag) and never `..`
    // (a traversal in a path position, and illegal in a ref anyway).
    const isRef = v => /^[A-Za-z0-9._][A-Za-z0-9._/#-]*$/.test(v) && !v.includes('..')
    // Free prose, minus the two forms that become a COMMAND when an agent puts the value on a
    // command line: backtick and `$(`. Punctuation, spaces and non-ASCII stay legal — a real
    // card title ("PR state flow (gate≠review) + …") must keep working.
    const isProse = v => !/[`\r\n\x00-\x1f]/.test(v) && !v.includes('$(')
    constrain(id, 'id', v => /^[A-Za-z0-9._-]+$/.test(v) && !v.includes('..'), 'a single safe path segment (it becomes the worktree directory)')
    constrain(s.branch, 'branch', isRef, 'a valid git ref')
    constrain(s.base, 'base', isRef, 'a valid git ref')
    constrain(s.title, 'title', isProse, 'plain text (no backtick, no `$(`, no newline)')
    constrain(s.notes, 'notes', isProse, 'plain text (no backtick, no `$(`, no newline)')
    // `prNumber` decides the ENTIRE lifecycle: an integer re-enters the review loop on the
    // existing PR, anything else falls through to implement+publishPr. A JSON-stringified
    // `"432"` therefore opened a second PR while the caller believed it was resuming, so a
    // present-but-unusable value is an error rather than a silently ignored one.
    if ('prNumber' in s && !Number.isInteger(s.prNumber))
      throw new Error(
        `implement-batch: cards[${i}] (#${id}) has prNumber ${JSON.stringify(s.prNumber)}, which is not an integer. ` +
          `A non-integer is NOT treated as "no PR": it would run implement + open a SECOND PR for a story ` +
          `that already has one. Pass an integer, or omit the key entirely to start a fresh story.`,
      )
    // Two cards with the same id resolve to the SAME worktree path, so under an unbounded cap
    // two implementers would interleave `git worktree add`/checkout/commit in one working tree
    // and one card's committed work would be lost. `died` also mis-reports: it matches on the
    // surviving twin, so a duplicate that failed reads as having returned.
    if (seenIds.has(id))
      throw new Error(
        `implement-batch: cards[${seenIds.get(id)}] and cards[${i}] both carry id #${id}. ` +
          `One story is one worktree and one PR — two cards sharing an id would run two ` +
          `implementers in the same working tree and lose one of them. Pass each story once.`,
      )
    seenIds.set(id, i)
    return { ...s, id }
  })
  // Return the NORMALIZED container, not just the list. Reading a second option off the
  // raw `args` was a real bug: the runtime can hand this script a JSON STRING, and
  // `typeof args === 'object'` is false for it — so `args.severityFloor` came back
  // undefined and the floor was silently ignored while the caller believed it was set.
  // A batch ran with Minors still blocking and reported escalation as if the floor had
  // been honoured. Every option must be read from the parsed object, once.
  rejectUnknownKeys(a, ['cards', 'stories', 'severityFloor', 'model', 'pipeline', 'maxParallelism'], 'args')
  return { stories, severityFloor: a.severityFloor, model: a.model, pipeline: a.pipeline, maxParallelism: a.maxParallelism }
}
const PARSED = parseBatchArgs(args)

// ── Pipeline configuration: what makes this engine reusable (#219 AC1) ─────
// Every value here was a literal spelled `pair` somewhere in a prompt. They are now
// resolved ONCE, with pair's own values as the defaults, so two things hold at the same
// time: an adopter whose skills are named differently drives the same engine by passing
// `args.pipeline`, and pair's own dogfood invocation keeps working with no configuration
// at all — the defaults ARE what the script said before.
//
// Resolution is per-key, not all-or-nothing: a caller overriding one skill name keeps the
// defaults for the rest. An all-or-nothing merge would make a partial config silently
// blank the keys it did not mention, which is the shape of failure #401 was about.
const PIPELINE_DEFAULTS = {
  skills: {
    implement: '/pair-process-implement',
    publishPr: '/pair-capability-publish-pr',
    review: '/pair-process-review',
    verifyQuality: '/pair-capability-verify-quality',
    checkpoint: '/pair-capability-checkpoint',
    recordDecision: '/pair-capability-record-decision',
    writeIssue: '/pair-capability-write-issue',
  },
  worktreeRoot: '../pair-worktrees',
  auditLogDir: '.pair/working/reviews',
  baseBranch: 'origin/main',
  // A FULL path, not a basename. AC1 names "the code-review-template.md contract path" as
  // configuration, and an adopter whose KB root is not `.pair/knowledge/` (the CLI supports
  // layout modes) could otherwise only reach their template with a `../../../..` traversal
  // string — which then also rendered as the vocabulary label in the reviewer prompt. Path
  // and label are now independent: the label is derived with `templateLabel()` below.
  reviewTemplate: '.pair/knowledge/guidelines/collaboration/templates/code-review-template.md',
}

// The human-readable NAME of the contract template, for the prompt sentence "using the …
// vocabulary". Derived from the path so a configured path never leaks into prose.
const templateLabel = (p) => String(p).split('/').filter(Boolean).pop() || String(p)

function resolvePipeline(raw) {
  if (raw === undefined || raw === null) return PIPELINE_DEFAULTS
  if (typeof raw !== 'object' || Array.isArray(raw))
    throw new Error(
      `implement-batch: \`args.pipeline\` must be an object; received ${JSON.stringify(raw).slice(0, 60)}. ` +
        `Omit it entirely to run on pair's defaults.`,
    )
  rejectUnknownKeys(raw, ['skills', 'worktreeRoot', 'auditLogDir', 'baseBranch', 'reviewTemplate'], 'args.pipeline')
  const str = (v, key, fallback) => {
    if (v === undefined) return fallback
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
    return t
  }
  rejectUnknownKeys(raw.skills, Object.keys(PIPELINE_DEFAULTS.skills), 'args.pipeline.skills')
  const skills = { ...PIPELINE_DEFAULTS.skills }
  for (const [k, v] of Object.entries(raw.skills ?? {}))
    skills[k] = str(v, `skills.${k}`, PIPELINE_DEFAULTS.skills[k])
  return {
    skills,
    worktreeRoot: str(raw.worktreeRoot, 'worktreeRoot', PIPELINE_DEFAULTS.worktreeRoot),
    auditLogDir: str(raw.auditLogDir, 'auditLogDir', PIPELINE_DEFAULTS.auditLogDir),
    baseBranch: str(raw.baseBranch, 'baseBranch', PIPELINE_DEFAULTS.baseBranch),
    reviewTemplate: str(raw.reviewTemplate, 'reviewTemplate', PIPELINE_DEFAULTS.reviewTemplate),
  }
}

// ── Bounded fan-out (#219 AC6) ─────────────────────────────────────────────
// `pair-loop` derives a ceiling from `tech/automation.md` (ADR-017 §6) and passes it here.
// The bound has to live in THIS file: the sandbox `parallel` primitive is an unbounded
// `Promise.all`, so handing it N thunks starts N agents no matter what the caller asked for.
//
// Absent cap = today's behaviour, unbounded. That default is deliberate: every existing
// caller keeps the fan-out it already has, so landing this option changes nobody's run.
function parseMaxParallelism(raw) {
  if (raw === undefined) return undefined
  // Rejected rather than coerced. A cap that cannot be honoured must not silently become
  // "no cap": the discarded setting is the one holding back load, so the failure would be a
  // batch running at full width while the caller believes it is throttled (#401's shape).
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1)
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
// Measured failure. Three PRs went through three autonomous fix rounds each and their
// findings GREW: #425 4→5, #423 4→7 (with a new Critical), #420 4→3. Convergence requires
// ZERO actionable findings, so a single Minor keeps the loop open — and on markdown skill
// files the supply of Minors is effectively inexhaustible (duplicated rationale between a
// skill and its ADL, a wording ambiguity, an assertion that cannot fail independently).
// Each round also enlarges the diff, creating fresh surface for the next round to read.
// The loop therefore cannot terminate by fixing, only by exhausting MAX_FIX_ROUNDS.
//
// `severityFloor` names the lowest severity that BLOCKS. Findings below it are NOT
// discarded and NOT silently accepted: they are carried to the merge gate in
// `acceptedFindings` with `disposition: 'Below severity floor'`, accumulated across every
// round of the cycle, so the human sees every one and decides. Absent → every actionable finding blocks (the previous behaviour), so
// nothing changes for a caller that does not ask for a floor.
//
// The floor speaks the REVIEW's OWN vocabulary, not a table private to this file.
// AC1 makes `pipeline.reviewTemplate` configurable and the contract generator derives
// `vocabulary.severities` from THAT template — the same array the reviewer prompt is told to
// answer in (`SEVERITIES`, below). Ranking against a hardcoded table instead made the engine
// speak one language and the reviewer another, and the mismatch failed OPEN: with an adopter
// vocabulary `Blocker|High|Medium|Low`, a `Critical` floor converged `ready-for-merge` with an
// unfixed "auth bypass" filed as below the floor, a `Major` floor was a no-op (every adopter
// severity hit the same fallback rank), and the adopter's own `High` was rejected as an unknown
// floor. So: rank against the resolved vocabulary, validate the floor against that SAME set,
// and treat a severity in neither as ABOVE every floor.
// Prototype-free, like every rank map below it: a severity is arbitrary text from a review
// template, so `ranks['constructor']` on a plain object returns an INHERITED function — not a
// number, not undefined, so `?? Infinity` never fires and every `<`/`>=` comparison against it
// is false. Measured (#432 review round 7): a `{severity: 'constructor'}` finding fell out of
// BOTH the below-floor and the actionable set and was recorded nowhere. `Object.create(null)`
// removes the inherited keys; `Object.hasOwn` at every read is the belt to that braces.
const SEVERITY_RANK = Object.assign(Object.create(null), { critical: 4, blocker: 4, major: 3, minor: 2, questions: 1, question: 1, nit: 1, info: 1 })
const normSeverity = (s) => String(s ?? '').trim().toLowerCase()
// The rank of a CONFIGURED severity is the EXPLICIT ordinal the contract states for it
// (`severityRanks`, higher = more severe), never the position of its name in
// `vocabulary.severities`. Position was the round-5 fix and it reproduced the same bug one
// carrier along: that array is whatever an LLM extracted from an arbitrary adopter template,
// and NOTHING said it must be most-severe-first — not the generator prompt, not `mirrors`,
// not `validateContract`. Measured at floor `High` with the (equally legitimate) ascending
// vocabulary `Low|Medium|High|Blocker`: a `Blocker` "auth bypass" ranked BELOW the floor and
// converged `ready-for-merge` with zero fix rounds. And the contract is hash-cached, so one
// bad extraction persists across every later batch. Hence: ordinals are stated and validated
// (`ensure-contract.mjs`), and when they are missing or ambiguous this engine REFUSES to rank
// rather than guessing an order — see `parseFloor`.
// With no contract at all there is no configured vocabulary, and pair's own table is the
// fallback — it carries aliases (`blocker`, `nit`, `info`) that no template lists, which is
// why it is not itself derived from DEFAULT_SEVERITIES: dropping them would change behaviour
// for callers that use them today.
//
// `severityRankErrors` duplicates ensure-contract.mjs's canonical check, and the duplication
// is FORCED, not lazy: this sandbox has no filesystem and no imports, so the only contract
// bytes that ever reach it are an agent's RETURN VALUE. The copy `ensure-contract.mjs write`
// validated on disk is unreadable from here, and dispatching a second agent to read it back
// would yield another unvalidated agent return value — the same trust boundary, one dispatch
// more expensive. So this function is NOT a redundant second line: it is THE validation on
// the path that decides the severity floor, and it may never be weaker than the canonical one.
//
// It WAS weaker, in exactly one way, and that cost a third occurrence of the same bug class
// (#432 review round 7): it matched keys case-INSENSITIVELY and never rejected keys absent
// from the vocabulary, so `{Low:0, Medium:1, Blocker:2, High:3, high:5}` collapsed the two
// case-variants LAST-WINS — `High` became 5, `Blocker` 2 — and a `Blocker` "auth bypass"
// converged `ready-for-merge` with zero fix rounds at a `High` floor, while the canonical
// validator rejected the very same map. Keys are therefore matched EXACTLY, as canonical
// does, plus one rule canonical does not need: two VOCABULARY names that normalize to the
// same string (`High` and `high` both listed) would collapse this consumer's normalized
// lookup map, so that vocabulary is refused too. Strictly stronger than canonical, never
// looser — asserted by the canonical/consumer differential in the test file, which CAN
// import the real module.
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
// Resolved once the contract is known — see SEVERITY_SCALE, after REVIEW_VOCAB.
// Infinity, not a mid-tier default: a severity in NEITHER the configured vocabulary nor pair's
// own table outranks every possible floor, so it always blocks. The previous `?? 3` claimed to
// be fail-safe and was not — any floor of rank >= 4 sat above it. Unreachable with an unranked
// scale (no floor can exist then), and Infinity there too for the same reason.
// `Object.hasOwn`, not `??`: an inherited `Object.prototype` key (`constructor`, `toString`)
// is neither null nor undefined, so `??` would hand a FUNCTION to a `<` comparison and the
// finding would fall out of every partition. Own-key membership answers it once, for both
// the prototype-free maps and any future one that is not.
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
  // OWN-key membership: `in` walks the prototype chain, so `severityFloor: 'constructor'`
  // passed this test and then ranked against an inherited function.
  const r = Object.hasOwn(SEVERITY_SCALE.ranks, key) ? SEVERITY_SCALE.ranks[key] : undefined
  // A floor the reviewer cannot express is a configuration error, never a silent
  // reclassification: rejecting it is what stops `Critical` from out-ranking an adopter's whole
  // scale. A typo still throws, in either vocabulary.
  if (r === undefined)
    throw new Error(
      `implement-batch: unknown severityFloor ${JSON.stringify(v)}. It must be one of the severities ` +
        `${SEVERITY_SCALE.configured ? `the configured review template declares` : `pair's default review vocabulary declares`}: ` +
        `${SEVERITY_SCALE.names.join(', ')} — or omit it so every actionable finding blocks.`,
    )
  return { name: v, rank: r }
}

// `args.model` overrides the model for every AUTHORING and REVIEW agent in the run —
// implement, PR, fix, review. Absent, each agent keeps the tier its frontmatter declares
// (implementer/reviewer -> opus). Validated against the known set so a typo cannot be
// swallowed: an ignored override runs the whole batch on the wrong tier while the caller
// believes otherwise, and the result is indistinguishable from an honoured one.
const BATCH_MODEL = (() => {
  const v = String(PARSED.model ?? '').trim()
  if (!v) return undefined
  const known = ['fable', 'haiku', 'sonnet', 'opus']
  if (!known.includes(v))
    throw new Error(`implement-batch: unknown model ${JSON.stringify(v)}; expected one of ${known.join(' | ')}.`)
  return v
})()
// Applied to an opts object without disturbing a step's own deliberate override.
const withModel = (opts) => (BATCH_MODEL ? { ...opts, model: BATCH_MODEL } : opts)
// Rounds of autonomous fix<->re-review before escalating to a human. Raised from 2:
// an escalation costs a human round-trip (read the flush, decide, re-run the batch),
// which is strictly more expensive than one more opus fix round — and the observed
// escalations were dominated by long tails of minor findings that a third round
// clears. Beyond 3 the loop is usually not converging for a reason a fourth round
// won't fix either (a design disagreement), and `needsHumanDecision` already exits
// early for that case.
const MAX_FIX_ROUNDS = 3

// ── Step retry ─────────────────────────────────────────────────────────────
// `agent()` returns null when the subagent dies on a terminal error or is killed
// by the supervisor (180s without visible progress — a cold `pnpm install` or an
// unscoped `pnpm quality-gate` in a fresh worktree qualifies). Without a retry a
// single such death takes the whole story out of the run: driveStory returns
// `failed-*` and the card ends the batch with no PR at all, even though the
// worktree still holds every committed task. Each authoring step is re-entrant by
// construction (persistent worktree + checkpoint + committed work), so a second
// attempt RESUMES rather than restarts. One retry only: a step that dies twice is
// a real failure, not a timeout, and further opus rounds only delay the rest of
// the batch.
async function agentRetry(prompt, opts) {
  const first = await agent(prompt, opts)
  if (first) return first
  log(`${opts.label}: step returned nothing (agent died or returned an invalid shape) — retrying once`)
  return agent(prompt, { ...opts, label: `${opts.label} retry` })
}

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
    needsHumanDecision: { type: 'boolean' },
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
  required: ['verdict'],
}
const FIX_SCHEMA = {
  type: 'object',
  properties: { fixed: { type: 'boolean' }, needsHumanDecision: { type: 'boolean' } },
  required: ['fixed'],
}
// #373: sandbox-safe continuation probe. The orchestrator has no FS/gh, so a cheap
// agent in the worktree reports two signals used to decide whether round-0 must post
// a fresh first review:
//   - logExists: the persisted working log is present → an in-flight cycle to CONTINUE
//     (silent round-0 + seeds `cycleHasRemediation` so convergence still synthesizes+cleans).
//   - firstReviewPosted: a first-review comment already exists on the PR (PR-side
//     corroboration). Guards the double-first-review the log-only signal can miss when
//     the log is GONE but a first review was already posted — e.g. a converged-but-not-
//     yet-merged PR re-entering a batch (log deleted at convergence, #373 finding 1), or
//     a pruned/recreated worktree / out-of-band clone that lost the untracked log
//     (#373 finding 3). Either signal suppresses a second first-review.
const PROBE_SCHEMA = {
  type: 'object',
  properties: { logExists: { type: 'boolean' }, firstReviewPosted: { type: 'boolean' } },
  required: ['logExists', 'firstReviewPosted'],
}

// ── Phase 0: ensure machine contracts (md template → contract.json) ────────
// The KB markdown template is the single source of truth; the machine contract
// is DERIVED from it by an AI generator agent (this sandbox has no filesystem
// access, so all file work — hashing, cache check, generation, validation —
// happens in the agent via `.claude/workflows/pair-contracts/ensure-contract.mjs`).
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
    `Ensure the machine contract for the \`${spec.name}\` template. Template: \`${spec.template}\`. Contract artifact: \`${spec.contract}\` (git-ignored derived cache). Use \`node .claude/workflows/pair-contracts/ensure-contract.mjs\` (\`check\`, then \`write\`) for ALL hash/cache/validation work — NEVER hand-roll hashing or freshness logic. If \`check\` reports \`fresh\`, return the cached contract file content unchanged with status \`cache-hit\`. Otherwise READ the template and generate the contract: take this skeleton schema and tighten ONLY the fields that mirror template vocabulary (${spec.mirrors}) into \`enum\`s, leaving every other field untouched: ${JSON.stringify(spec.skeleton)}. Also fill the contract's \`vocabulary\` object (e.g. verdictOptions, severities, findingFields) from the template, AND the top-level \`severityRanks\` object: every name in \`vocabulary.severities\`, spelled identically, mapped to an explicit unique integer, HIGHER = MORE SEVERE (e.g. {"Critical": 4, "Major": 3, "Minor": 2, "Questions": 1}). Derive each rank from what the template SAYS the level means — a level it describes as must-fix/merge-blocking outranks one it describes as advisory or a question — and NEVER from the order the levels happen to appear in: the consumer ignores array order, and a wrong rank silently converts a merge-blocking finding into an accepted one. If the template's levels carry no discernible relative severity, return status \`failed\` rather than inventing an order. Persist via the \`write\` command (it validates the draft and stamps the template hash), then return status \`regenerated\` plus the final contract content. Never modify the template. If generation or validation fails after one retry, return status \`failed\` with no contract.`,
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
const REVIEW_SCHEMA = crContract?.schema ?? LOOSE_REVIEW_SCHEMA
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
// ── Text shape (token cost) ────────────────────────────────────────────
// Every artifact this loop produces is READ AGAIN: the PR body by each reviewer, each
// fixer and the analysis agent; the log by the escalate-flush and the final synthesis.
// Prose that restates the diff is paid on every one of those reads and carries nothing the
// reader cannot get from the diff itself. What DOES earn its tokens is the part a reader
// cannot reconstruct: the concrete failure case, and the evidence it is real. So the rule is
// schematic-but-complete, never merely "shorter" — drop the narration, keep inputs -> wrong
// output, keep the proof. Compressing evidence costs an extra review round (~250k tokens),
// which dwarfs every word saved.
const TEXT_SHAPE =
  'TEXT SHAPE (mandatory): write schematically, not in prose. Tables and one-line bullets over paragraphs. ' +
  'NEVER restate what the diff already shows (no file-by-file narration, no "I then changed X to Y"), ' +
  'never re-explain context the reader already has, no preamble, no summary of the summary, no praise. ' +
  'KEEP AT FULL LENGTH the two things a reader cannot reconstruct: the CONCRETE FAILURE CASE ' +
  '(specific inputs/state -> the wrong output or the loss that follows) and the EVIDENCE it is real ' +
  '(what you ran, what it printed). Cut narration, never evidence.'


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
const SEVERITY_FLOOR = parseFloor(PARSED.severityFloor)

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

function wtClause(story) {
  const base = baseOf(story)
  return `ISOLATION (mandatory): do ALL git/file work inside a dedicated worktree at \`${PIPELINE.worktreeRoot}/${story.id}\` — create-or-reuse it: \`git worktree add ${PIPELINE.worktreeRoot}/${story.id} -B ${story.branch} ${base}\` on first setup, or \`git worktree add ${PIPELINE.worktreeRoot}/${story.id} ${story.branch}\` if the branch already has commits; if the path already exists, just \`cd\` into it. NEVER modify the repo's main working tree and NEVER switch its branch.${base === PIPELINE.baseBranch ? '' : ` This story is STACKED on \`${base}\`: that branch is its base, so its commits are already in your history and must NOT be reverted, duplicated or re-implemented — only ADD your own work on top. When you open the PR, target \`${base}\` as the PR base branch, not \`main\`, so the diff shows only this story's change.`}`
}

// Reviewer isolation: read-only inspection in a DETACHED throwaway worktree pinned
// to the PR's pushed head. Detached HEAD never occupies the branch, so it can't
// collide with the authoring worktree (which holds it) or with other stories'
// reviewers in a parallel batch — and it never touches the main checkout's branch.
function revWtClause(story) {
  const p = `${PIPELINE.worktreeRoot}/${story.id}-review`
  return `ISOLATION (mandatory, read-only): NEVER switch the main checkout's branch. Inspect the code in a DETACHED throwaway worktree pinned to the PR's current pushed head: \`git worktree remove --force ${p} 2>/dev/null; git fetch origin -q; git worktree add --detach ${p} origin/${story.branch}\`, then \`cd ${p}\`. Read the code there (the untracked checkpoint is absent here — good, stay blind to it). When finished, remove it: \`git worktree remove --force ${p}\`.`
}

// #373 finding 3: the escalate-flush shared block — supersede-the-prior-flush + the manual
// out-of-band CONVENTION + the untracked-worktree-persistence note — is identical across BOTH
// escalation prompts (MAX_FIX_ROUNDS + needsHumanDecision). Authored ONCE here so a future
// change to the convention or the worktree-persistence wording is made in one place and can't
// silently diverge between the two paths (they had already drifted slightly before this).
// Part A — PR-comment minimize/supersede. Operates ONLY on already-posted PR comments, so it
// does NOT depend on a working log and MUST be emitted on EVERY escalation (both arms), else a
// stale prior flush or a prior convergence's "ready for merge" synthesis is left visible next to
// an active escalation (finding: the no-log arm previously omitted this).
function flushMinimize(prNumber) {
  return `FIRST minimize / mark-outdated any prior escalate-flush comment already posted on PR #${prNumber} — each flush "summarizes the rounds so far", so a new one SUPERSEDES the last; only the newest escalate-flush should stay visible (no-op if there is none). ALSO minimize / mark-outdated any prior final-remediation/synthesis comment left by an EARLIER convergence of this SAME cycle (a converged-but-unmerged PR that was re-run, found new findings and is now escalating): its "review clean / ready for merge" verdict directly contradicts an active escalation, so it must NOT stay visible alongside this flush — mirror the convergence-synthesis path (no-op if there is none), but NEVER minimize the first-review comment.`
}

// Part B — the log/out-of-band CONVENTION + untracked-worktree-persistence note. Only meaningful
// when a working log exists (a continuing cycle), so it is emitted only on the log-backed arms.
function flushLogConvention(story) {
  return `CONVENTION (state it in the comment so the human/orchestrator knows): any further rework or re-review — including manual out-of-band rounds — should be funneled into THIS same working log (append), NOT posted as standalone PR comments; the next orchestrated run on this story continues the same cycle and its convergence will synthesize ONE final remediation and minimize these intermediate comments. Note too (in the comment) that this working log is an UNTRACKED file living ONLY in the persistent authoring worktree \`${PIPELINE.worktreeRoot}/${story.id}\`, so that worktree must be PRESERVED until merge — if it is pruned/recreated the audit log is lost (this flush + the first-review comment still remain on the PR, and the PR-side first-review signal still prevents a duplicate first review on the next run).`
}

// Full convention = minimize (Part A) + log/out-of-band note (Part B), for the log-backed arms.
function flushConvention(story, prNumber) {
  return `${flushMinimize(prNumber)} ${flushLogConvention(story)}`
}

// ── Per-story lifecycle ──────────────────────────────────────────────────
async function driveStory(story) {
  const tag = `#${story.id}`
  const resuming = Number.isInteger(story.prNumber)
  let pr = resuming ? { prNumber: story.prNumber } : null

  if (!resuming) {
    // 1. IMPLEMENT — fresh implementer in the story worktree; writes checkpoint.
    const impl = await agentRetry(
      `Implement story ${tag} ("${story.title}") on branch \`${story.branch}\`, following ${SK.implement}, the reference skills, and the task/commit templates.${story.notes ? ` SCOPE DIRECTIVE (overrides the issue body where they conflict): ${story.notes}` : ''} ${wtClause(story)} Test-first. Verify the gates with ${SK.verifyQuality} (it resolves the story's \`risk:*\` tier and runs exactly the checks CI would run for that tier — do not improvise a gate command, and do not run the whole monorepo). Record any architectural or project decision you take with ${SK.recordDecision} rather than leaving it in a commit message. On completion write the story checkpoint via ${SK.checkpoint} $mode=write (it lives in the worktree) so a fresh instance can open the PR with zero prior context. Do NOT open the PR yet. Do NOT merge.`,
      withModel({ agentType: 'pair-implementer', phase: 'Implement', label: `impl:${tag}`, effort: 'high', schema: STEP_SCHEMA }),
    )
    if (!impl) return { story, status: 'failed-implement' }

    // 2. OPEN PR — fresh implementer instance; resumes from checkpoint (context reset)
    pr = await agentRetry(
      `You are resuming story ${tag}.${story.notes ? ` SCOPE DIRECTIVE: ${story.notes}` : ''} ${wtClause(story)} Read the checkpoint (${SK.checkpoint} $mode=resume) — do not re-derive. Push the branch, then publish the PR by invoking **${SK.publishPr}**. Do NOT hand-roll the PR: that skill owns the whole sequence and a hand-rolled PR silently skips most of it — the tier-resolved quality gate, the PR body composed from \`pr-template.md\` with only the pertinent conditional sections, the story's classification tags copied onto the PR, ready-for-review, the \`pr-state:*\` label and the PR state flow, the PR-URL back-link on the story, and the story's board state moved to Review. Put everything a reviewer needs (rationale, decisions, ADR links) in the PR description — the reviewer cannot see the checkpoint. ${TEXT_SHAPE} A PR body is re-read by every reviewer and every fix round of this cycle, so its length is paid many times over: state each decision once, in a line. ONE EXPECTED SIGNAL: you are running INSIDE a subagent, so when the skill reaches its review-dispatch step it will emit \`Review: review-dispatch-required\` instead of nesting a second subagent. That is CORRECT — this orchestrator dispatches the independent review itself the moment you return. Do NOT dispatch or run a review yourself, and do NOT merge. Return the PR number.`,
      { agentType: 'pair-implementer', phase: 'PR', label: `pr:${tag}`, model: 'sonnet', effort: 'medium', schema: PR_SCHEMA },
    )
    if (!pr?.prNumber) return { story, status: 'failed-pr' }
  }

  // 3. REVIEW <-> FIX loop — reviewer is independent & BLIND to the handoff.
  //    Converges when every ACTIONABLE finding is resolved. Findings the reviewer
  //    marks nonActionable (by-design / won't-fix, justified) don't block: they're
  //    carried to the merge gate as `acceptedFindings` for the human to see —
  //    ACCUMULATED over every round, not just the last one (a round-1 reviewer never
  //    re-raises what round 0 already had accepted).
  //    nonActionable is NOT a scope filter — "not this story's original scope" alone
  //    never qualifies; only "fixing it would be genuinely wrong" does.
  //
  //    PR-COMMENT POLICY (noise reduction — the WHOLE cycle of a PR is ONE logical cycle,
  //    #367 in-loop + #373 across-runs): regardless of how many runs / escalations /
  //    manual out-of-band rounds it takes to converge, a PR shows AT MOST one first-review
  //    comment + AT MOST one final remediation comment.
  //    - The FIRST review IS posted on the PR (the independent review artifact).
  //    - The fix<->re-review rounds are NOT commented per round; each round is appended
  //      to a working log `.pair/working/reviews/<id>.md` (orchestrator-side audit; the
  //      re-reviewer stays BLIND to it — it receives prior findings via the prompt). The
  //      log is the SINGLE SOURCE OF TRUTH for cycle state ACROSS runs: its existence ==
  //      an in-flight cycle to CONTINUE, not restart.
  //    - CONTINUATION (#373): on a resume run a SILENT round-0 (no second first-review) is
  //      triggered by EITHER signal — the working log still exists (an in-flight cycle) OR a
  //      first-review comment already exists on the PR (PR-side corroboration, so a converged-
  //      but-unmerged re-run or a lost/pruned untracked log can't produce a duplicate first
  //      review). The PR-side signal is DETERMINISTIC: the first review emits a fixed hidden
  //      HTML-comment marker and the probe does an EXACT substring match on it — NOT a semantic
  //      reading of the comment's structure — so the probe can't misclassify a
  //      non-review comment into silencing a real first review (finding 1). The probe runs
  //      at sonnet/low (not haiku): its job orchestrates a worktree + a `gh` fetch + a
  //      substring match, and a mis-report fails OPEN toward a duplicate first review (the
  //      very noise this story removes), so the reliability of those tool steps is worth the
  //      small tier bump over the cheapest model. Log existence
  //      additionally seeds `cycleHasRemediation` so convergence still
  //      synthesizes+cleans even if round-0 converges immediately; a first-review-only signal
  //      (no log) does NOT seed it, so a clean round-0 adds nothing and never synths a gone log.
  //    - At convergence ONE synthesized remediation comment is posted, written
  //      CONTEXTUALLY to the first review (maps EVERY finding across ALL runs in the log
  //      -> resolution + accepted dispositions + final verdict), AND any prior intermediate
  //      comments (escalate-flush, manual out-of-band rounds, OR a prior convergence's own
  //      final-remediation comment on a re-run→re-converge cycle) are minimized / marked
  //      outdated so only first-review + this one remediation remain visible; the log is
  //      then deleted.
  //    - On escalation the log is KEPT and flushed to the PR as the continuation anchor. A
  //      new escalate-flush SUPERSEDES the prior one (minimized/marked-outdated in place), so
  //      repeated escalations across runs leave only the newest flush visible, not a pile. It
  //      ALSO minimizes any prior convergence's own final-remediation comment (a converged-but-
  //      unmerged PR re-run that now escalates) — a stale "ready for merge" verdict must not
  //      stay visible next to an active escalation (never the first-review comment), mirroring
  //      the convergence-synthesis minimize set.
  //    - MANUAL OUT-OF-BAND CONVENTION (#373): if a human/orchestrator takes over rework or
  //      re-review after an escalate, they funnel their notes into THIS same working log
  //      (append) rather than posting standalone PR comments; the next orchestrated run
  //      continues the cycle and its convergence synthesizes one final remediation +
  //      minimizes the intermediates. (This is a documented CONVENTION only — standalone
  //      reviewer/fix agents are NOT edited by #373.)
  //    The workflow runs in a sandbox (no FS/gh), so the log existence-probe, comment
  //    posting, and comment minimizing are all delegated to agents running in the worktree.
  const reviewLog = `${PIPELINE.auditLogDir}/${story.id}.md`
  // #373: the first-review comment always emits this hidden HTML-comment marker verbatim
  // (invisible in rendered markdown → no visible noise). The continuation probe detects a
  // prior first review by an EXACT substring match on this marker, NOT by a semantic reading
  // of the comment's structure — so the cheap sonnet/low probe makes no classification
  // judgment and can't false-positive a non-review comment into silencing a real first
  // review (the story's High-impact over-silencing risk). Minimized/outdated comments still
  // match: gh returns their raw body, which still contains the marker.
  const firstReviewMarker = `<!-- pair:first-review #${story.id} PR#${pr.prNumber} -->`
  // #373: continuation detection. Two signals, only meaningful on a resume run (a fresh
  // story branches from origin/main, so neither a prior cycle log nor a prior first-review
  // comment exists): `logExists` = an in-flight cycle to continue; `firstReviewPosted` =
  // PR-side corroboration (deterministic marker match) that a first review already went out
  // (so we never post a second one even if the untracked log is gone — findings 1 & 3).
  let isContinuation = false
  let firstReviewPosted = false
  // #401: the probe used to be gated on `resuming`, i.e. on the CALLER having passed
  // `prNumber` in the story object. That made the duplicate-first-review guard
  // depend on the caller's bookkeeping, and a `Workflow({resumeFromRunId})` resume
  // replays the implement/PR agents from cache with the SAME args — so
  // `story.prNumber` is absent, `resuming` is false, the probe never runs,
  // `firstReviewPosted` stays false, and round-0 posts ANOTHER first review on a PR
  // that already carries one. Observed three times on a single story across three
  // pause/resume cycles: that story was re-reviewed from scratch each time instead of
  // advancing through its fix rounds, and ended up the least-progressed of its batch.
  // The gate is now the PR's existence — a fact the script knows — instead of an
  // argument the caller must remember. One cheap sonnet/low probe per story per run
  // costs far less than one duplicated opus/xhigh review round, and on a genuinely
  // fresh story both signals come back false, leaving the fresh path's behaviour
  // identical (the first review still posts).
  if (pr?.prNumber) {
    const probe = await agent(
      `Story ${tag}: read-only CONTINUATION PROBE (no review, no edits). ${wtClause(story)} Report TWO booleans: (1) \`logExists\` — is the review working log \`${reviewLog}\` present in the worktree? (2) \`firstReviewPosted\` — does PR #${pr.prNumber} ALREADY carry the first-review comment? Match it DETERMINISTICALLY, not by judgment: fetch the PR comments via \`gh\` and report whether ANY comment's raw body contains the EXACT marker substring \`${firstReviewMarker}\` (the first review always emits this hidden marker verbatim; a minimized/outdated comment still counts — its raw body still contains the marker). Do NOT infer from a comment's structure or tone — it is a plain substring match. Return { logExists, firstReviewPosted }. Do NOT create, modify, or delete the log, do NOT post or minimize any comment, and do NOT run the review — this is a cheap probe to decide whether an in-flight review cycle is being CONTINUED and whether a first review was already posted.`,
      { agentType: 'pair-implementer', phase: 'Review', label: `probe:${tag}`, model: 'sonnet', effort: 'low', schema: PROBE_SCHEMA },
    )
    // #373 finding 4: a failed / malformed / schema-invalid probe return yields BOTH signals
    // false (via `?.x === true`), so round-0 falls through to a POSTED first review. This
    // fail-open direction is deliberate: degrade toward VISIBILITY (post a review a human can
    // see) rather than fail-silent (suppress it). The dangerous case — a genuine continuation
    // where a total probe failure re-posts a first review — is low-probability (requires an
    // agent/schema failure on a resume of an in-flight cycle) and self-announcing (a visible
    // duplicate is noticed and pruned), whereas silent over-suppression of a real review is
    // not. The deterministic marker above removes the misclassification failure mode; only a
    // hard probe failure reaches this fallback.
    isContinuation = probe?.logExists === true
    firstReviewPosted = probe?.firstReviewPosted === true
  }
  let round = 0
  // Remembers a reviewer's human-decision request across the one fix round we now spend
  // before honouring it, so the escalation is deferred by a round rather than dropped.
  let humanDecisionPending = false
  let prevFindings = []
  // ACCUMULATES across rounds — never reassigned. A finding accepted in round 0 (by-design, or
  // below the floor) is not re-raised by the round-1 reviewer, because round 1 only sees the
  // fixed code and has no memory of what the human was already told would be carried. So a
  // per-round reassignment loses it: the card converges `ready-for-merge` with an EMPTY accepted
  // table, the convergence prompt renders that empty table, and the merge gate is told nothing was
  // carried. Sub-floor findings are not recoverable elsewhere either — `prevFindings = actionable`
  // excludes them, so they never reach the fixer's working log. AC4 requires them carried, so the
  // accumulator is the carrier of record.
  const accepted = []
  // De-dup key: a re-review repeating a sub-floor finding nobody was asked to fix is the norm, and
  // one finding must occupy one row of the accepted table, not one row per round it survived.
  const acceptedKeys = new Set()
  const accept = (findings) => {
    for (const f of findings) {
      const key = `${f.location ?? ''} ${f.description ?? ''}`
      if (acceptedKeys.has(key)) continue
      acceptedKeys.add(key)
      accepted.push(f)
    }
  }
  // #373: `cycleHasRemediation` tracks whether THIS CYCLE (across all runs it spans) has
  // any remediation state to synthesize — not merely whether a fix happened this run. On a
  // continuation (log present) it is seeded true so an immediate round-0 convergence still
  // posts the ONE final synthesis + deletes the log (never leaves an escalate-flush as the
  // last word). A converged-but-unmerged re-run has NO log (firstReviewPosted true,
  // isContinuation false) → stays false, so a clean round-0 adds nothing and never tries to
  // synth a deleted log. A fresh cycle starts false, so a clean first review stands alone (AC6).
  let cycleHasRemediation = isContinuation
  while (true) {
    // #373: round-0 is the FIRST (posted) review ONLY on a genuinely fresh cycle — no
    // in-flight log AND no first-review comment already on the PR. Either signal makes
    // round-0 a SILENT re-review, so a PR never accrues a second first-review.
    const first = round === 0 && !isContinuation && !firstReviewPosted
    const review = await agentRetry(
      `Independently review PR #${pr.prNumber} for story ${tag}, following ${SK.review}. ${revWtClause(story)} PACING (mandatory — this is what killed the previous four attempts at this review, measured): a supervisor kills any agent that goes 180 seconds without emitting a TEXT MESSAGE. Tool calls do NOT count as progress: the last stalled reviewer was calling \`sed\`/\`cat\` every ~5 seconds and was still killed, because it had not written a sentence in 200 seconds. So: after EVERY file you inspect, write ONE SHORT LINE of prose saying what you found or that it is clean — before moving to the next file. Never read two files in a row without speaking in between, and never go into a long silent analysis pass. Start by listing the changed files (\`git diff ${baseOf(story)}...origin/${story.branch} --name-only\`), say aloud the order you will take them, then go file by file, narrating as you go. Brevity is fine — one line is enough — but silence is fatal. Review ONLY from the story's acceptance criteria, the PR diff+description, and the code. Do NOT read ${BLIND_PATHS}, nor any checkpoint, handoff or working log under them — they are the author's private context and this review is independent and blind to it. Report EVERY finding regardless of severity (including minor/nit), using the ${REVIEW_TEMPLATE_LABEL} vocabulary: each finding = \`location\` (File:Line), \`severity\` ∈ {${SEVERITIES}}, \`description\` (the CONCRETE FAILURE CASE — inputs/state -> wrong output — not a retelling of the diff), \`recommendation\` (the change, in one or two lines); verdict ∈ {${VERDICTS}}. ${TEXT_SHAPE} DO NOT FILE NEW ISSUES. This is a hard rule, and it overrides any habit of deferring work to a follow-up card: a debt you find in this diff is resolved IN PLACE, in this same PR, within this story's scope. Never invoke ${SK.writeIssue}, never write \`Deferred to #<new>\`, and never recommend "track this separately" — a finding parked in a fresh card is a finding nobody fixes, and it converts a reviewed PR into an unreviewed backlog. Set \`nonActionable: true\` ONLY if fixing it would be genuinely WRONG — byte-consistent with a source of truth, matching an existing convention, an ALREADY-EXISTING tracked story (cite its number; do not create one), or something that can only resolve after merge. Being outside this story's originally stated scope is NOT a reason: fix it here. Whenever you set \`nonActionable: true\`, ALSO set \`disposition\` with a concrete reason replacing the bare label (\`By convention …\` / \`Historical record\` / \`Already tracked in #<existing>\` / \`Resolves after merge\`); never leave "non-actionable" as the only explanation. If a finding is SO large that fixing it here would genuinely swamp the story, say so explicitly in \`description\` and leave it ACTIONABLE — the human decides at the merge gate whether to accept the bigger PR or carve it out; that decision is not yours to pre-empt by filing a card. ${first ? `This is the FIRST review: POST your full review report as a PR comment on #${pr.prNumber} (${REVIEW_TEMPLATE_LABEL} structure), and include the marker line \`${firstReviewMarker}\` VERBATIM as the first line of the comment body — it is an HTML comment (invisible in the rendered markdown, so no visible noise) that lets a later resume detect this first review by an EXACT substring match rather than a semantic reading (finding 1). Then return findings + verdict.` : prevFindings.length
            ? `This is a RE-REVIEW: do NOT post any PR comment (the orchestrator synthesizes the cycle at the end). Return findings + verdict only. Verify these prior findings were genuinely resolved: ${JSON.stringify(prevFindings)}.`
            : `This is a RE-REVIEW on a resumed in-flight cycle (round-0 of this run carries no prior findings): do a FRESH, independent full review pass. do NOT post any PR comment (the orchestrator synthesizes the cycle at the end). Return findings + verdict only.`} Return findings and a verdict.`,
      // effort was 'xhigh'. The measured cause of the repeated kills was NOT effort and NOT a
      // stuck command: transcript timing showed the reviewer issuing a tool call every ~5s
      // (97 events, mean gap 4.9s, max 49s — zero gaps over 180s) yet still killed, because
      // the supervisor's window measures TEXT MESSAGES, not tool calls, and the agent had gone
      // 200s without writing a sentence while reading files. The real fix is the PACING clause
      // in the prompt (speak after every file). 'high' is kept only as margin — a lower effort
      // shortens the silent stretches between utterances — so if a future change makes the
      // narration reliable, restoring 'xhigh' is legitimate: it costs review depth, which is
      // the whole point of this gate. Do not read this line as "xhigh causes stalls".
      withModel({ agentType: 'pair-reviewer', phase: 'Review', label: `rev:${tag} r${round}`, effort: 'high', schema: REVIEW_SCHEMA }),
    )
    // A DEAD reviewer is not a clean review. `agent()` returns null when the subagent
    // dies, and `review?.findings ?? []` then yields zero findings — which the
    // convergence test below reads as "nothing actionable remains" and returns
    // `ready-for-merge`. That is the worst possible failure direction: a PR that was
    // never actually reviewed is handed to the human labelled as review-approved, and
    // on a FIRST round it is also missing the first-review comment that would make the
    // absence visible. Distinguish "reviewed, found nothing" from "did not review":
    // only the former may converge.
    //
    // MEASURED (#432): checking only for `null` was not enough. Every reviewer agent died —
    // the machine slept mid-response — the PR carried zero comments and zero reviews, and the
    // batch still returned `ready-for-merge`. A truthy-but-contentless return (`{}`, a
    // truncated structured output) yields `findings ?? []` = no findings, which reads as
    // "nothing actionable remains".
    //
    // So the test is inverted: a VERDICT must be present. Absence of findings is not evidence
    // that a review happened; presence of a verdict is. Every real review emits one — it is a
    // required field of the contract schema — so this costs a genuine clean review nothing.
    if (!review || !String(review.verdict ?? '').trim())
      return { story, prNumber: pr.prNumber, status: 'failed-review', round, reviewLog: cycleHasRemediation ? reviewLog : undefined }
    const findings = review.findings ?? []
    const allActionable = findings.filter((f) => !f.nonActionable)
    // Below the floor: still reported, still shown to the human, just not blocking. Marked
    // with a disposition so the merge gate can tell "we chose not to block on this" from
    // "the reviewer judged it by-design", which are different statements.
    // ONE predicate, two buckets — not two independent filters. `< floor` and `>= floor` are
    // both false for a rank that is not a number (NaN, or an inherited prototype value before
    // `Object.hasOwn` above), so the two-filter form was NOT total: such a finding landed in
    // neither set and was recorded nowhere — not blocking, not even in `acceptedFindings`,
    // which AC4 says never happens (#432 review round 7). Partitioning on the single
    // below-floor test makes the complement the actionable set by construction: anything the
    // test cannot answer YES for blocks, which is also the safe direction.
    const belowFloor = []
    const actionable = []
    for (const f of allActionable)
      (SEVERITY_FLOOR && rankOf(f.severity) < SEVERITY_FLOOR.rank ? belowFloor : actionable).push(f)
    accept([
      ...findings.filter((f) => f.nonActionable),
      ...belowFloor.map((f) => ({ ...f, disposition: f.disposition || `Below severity floor (${SEVERITY_FLOOR.name}) — carried to the merge gate unfixed` })),
    ])
    if (belowFloor.length)
      log(`${tag} r${round}: ${belowFloor.length} finding(s) below the ${SEVERITY_FLOOR.name} floor carried to the gate, ${actionable.length} blocking`)
    // Converge once nothing actionable remains (by-design findings don't block).
    if (actionable.length === 0) break
    // `needsHumanDecision` used to escalate IMMEDIATELY, skipping the fixer entirely — even
    // when the findings were ordinary and already decided. Measured cost: four consecutive
    // rounds on one story and two on another produced review after review and ZERO commits,
    // because the reviewer raised the flag and the loop went straight to the flush. The
    // orchestrator was writing detailed fix instructions for an agent that was never invoked.
    //
    // A reviewer raising it is saying "one of these needs a human", not "none of these can be
    // fixed". So spend ONE fix round on the findings first, then escalate if the reviewer
    // still says so. `humanDecisionPending` remembers the request across that round, so the
    // escalation still happens — it is deferred by one round, not dropped. On the second
    // occurrence we stop: a flag raised again after a fix round is a genuine disagreement.
    const wantsHuman = review?.needsHumanDecision === true
    if (wantsHuman && !humanDecisionPending && round < MAX_FIX_ROUNDS) {
      humanDecisionPending = true
      log(`${tag} r${round}: reviewer asked for a human decision — spending one fix round on the ${actionable.length} finding(s) first, then escalating if it still stands`)
    } else if (round >= MAX_FIX_ROUNDS || wantsHuman) {
      // #373 finding 1: emit a PR-visible escalation UNLESS this run's round-0 ALREADY posted
      // the first review (`first === true`) carrying these same findings. The gap this closes:
      // a SILENT re-review that escalates with no log — a resumed PR whose prior first review
      // exists but whose untracked working log was never written / was pruned (firstReviewPosted
      // true, isContinuation false → cycleHasRemediation false, first false). Without the `!first`
      // arm the new blocking concern surfaced ONLY in the batch return value and a later resume
      // repeated the silent escalation. The log read is BEST-EFFORT: only a continuing cycle
      // (cycleHasRemediation) has a log to anchor to; the no-log arm escalates from inline findings.
      if (cycleHasRemediation || !first) {
        const logClause = cycleHasRemediation
          ? `Read the review log \`${reviewLog}\`. ${flushConvention(story, pr.prNumber)} THEN `
          : `No prior review working log exists (a re-review on a resumed PR whose log was never written or was pruned) — escalate from the inline findings directly. ${flushMinimize(pr.prNumber)} `
        await agent(
          `Story ${tag}: the review<->fix loop is escalating to a human (non-convergence or a design disagreement). ${wtClause(story)} ${logClause}post ONE fresh comment on PR #${pr.prNumber} — written as a response to the first code-review comment — summarizing${cycleHasRemediation ? ' the rounds so far (per finding: what was attempted + current state) and' : ''} the still-open actionable findings: ${JSON.stringify(actionable)}.${cycleHasRemediation ? ' Do NOT delete the log — it is the continuation anchor for this cycle.' : ''} Do NOT merge.`,
          { agentType: 'pair-implementer', phase: 'Review', label: `flush:${tag}`, model: 'sonnet', effort: 'medium' },
        )
      }
      return { story, prNumber: pr.prNumber, status: 'escalate', findings: actionable, acceptedFindings: accepted }
    }

    round++
    prevFindings = actionable
    cycleHasRemediation = true
    // FIX — implementer resumes checkpoint (if present) + resolves actionable findings.
    // Logs the round to the working review log INSTEAD of posting a per-round PR comment.
    const fix = await agentRetry(
      `Resume story ${tag}. ${wtClause(story)} Read the checkpoint if present (${SK.checkpoint} $mode=resume); otherwise work from the PR diff + code. Resolve EVERY one of these actionable review findings on PR #${pr.prNumber} — including minor/nit, do not defer any: ${JSON.stringify(prevFindings)}. Fix them IN PLACE, in this PR: do NOT file a follow-up issue for any of them, do NOT invoke ${SK.writeIssue}, and do NOT leave a "tracked separately" note in lieu of the fix. If a finding turns out to be genuinely larger than this story, still fix what belongs here and say plainly in the working log what remains — the human decides at the merge gate, not a new card. Follow ${SK.implement} for the change itself (test-first where a finding describes a defect), verify with ${SK.verifyQuality} (tier-resolved — do not improvise a gate command), and record any decision a finding forces with ${SK.recordDecision}. Commit and push. Then re-invoke **${SK.publishPr}**: it is create-or-update and idempotent, and re-running it is what keeps the PR body, the classification tags and the \`pr-state:*\` label in sync with the NEW head commit instead of describing the pre-fix state. As in the open-PR step it will emit \`Review: review-dispatch-required\` rather than nesting — expected: this orchestrator drives the re-review. ${TEXT_SHAPE} Re-running it REWRITES the PR body, and this is the only step that does so once a cycle is under way: rewrite it to describe the CURRENT head, do not append a round-by-round history — a body that grows by one section per fix round is re-read in full by every later reviewer of this same cycle. Do NOT post a remediation PR comment; INSTEAD append this round to the working log \`${reviewLog}\` (create it if absent) as a COMPACT TABLE under a \`## Round N\` heading — one row per finding, columns \`severity | location | what changed | commit\`. One row, one line: no paragraph per finding, and do not restate the finding's description (its location identifies it). Add prose ONLY where a fix diverged from the recommendation, and then only the reason. Only for a genuine design disagreement set needsHumanDecision instead of forcing a fix. Do NOT merge.`,
      withModel({ agentType: 'pair-implementer', phase: 'Review', label: `fix:${tag} r${round}`, effort: 'high', schema: FIX_SCHEMA }),
    )
    // failed-fix: the fixer died mid-round; a partial working log may exist. Surface
    // its path in the return so the human / next resume can find (and clean) it.
    if (!fix) return { story, prNumber: pr.prNumber, status: 'failed-fix', reviewLog: cycleHasRemediation ? reviewLog : undefined }
    if (fix.needsHumanDecision) {
      // No guard here: reaching this line means the fix round above already ran, which set
      // `cycleHasRemediation = true` AND had the fixer append this round to the working log.
      // So the log always exists and the flush always fires — there is no no-log arm (unlike
      // the MAX_FIX_ROUNDS escalation at the top of the loop, whose `cycleHasRemediation || !first`
      // guard IS load-bearing because that path can be reached on a silent round-0 re-review).
      await agent(
        `Story ${tag}: escalating a design disagreement to a human. ${wtClause(story)} Read \`${reviewLog}\`. ${flushConvention(story, pr.prNumber)} THEN post ONE fresh comment on PR #${pr.prNumber} (response to the first review) summarizing the remediation rounds so far, the still-open findings (${JSON.stringify(prevFindings)}) and the open decision. Do NOT delete the log — it is the continuation anchor for this cycle. Do NOT merge.`,
        { agentType: 'pair-implementer', phase: 'Review', label: `flush:${tag}`, model: 'sonnet', effort: 'medium' },
      )
      return { story, prNumber: pr.prNumber, status: 'escalate', findings: prevFindings, acceptedFindings: accepted }
    }
  }

  // Converged. If any remediation happened (this run OR a prior run this cycle continues),
  // post ONE synthesized remediation comment (contextual to the first review), minimize any
  // prior intermediate comments, and delete the working log. If the first review was already
  // clean (fresh cycle, no remediation), the first-review comment stands alone — nothing to do.
  if (cycleHasRemediation)
    await agent(
      `Story ${tag} converged: the latest independent re-review found zero actionable findings. ${wtClause(story)} Read the review log \`${reviewLog}\` — it may span MULTIPLE runs / escalations / manual rounds of this ONE cycle. Post ONE remediation comment on PR #${pr.prNumber}, written as a direct RESPONSE to the first code-review comment: render EVERY finding recorded across ALL runs in the log (plus any surfaced during remediation) as ONE MARKDOWN TABLE — columns \`round | severity | location | resolution | commit\` — one row per finding, one line per row. Then a second short table for the accepted/non-actionable findings and their dispositions (${JSON.stringify(accepted)}), and the final verdict (review clean) as a single line. ${TEXT_SHAPE} This comment is the merge-gate reader's entire view of the cycle, so it must stay COMPLETE — no finding dropped, no silent truncation; if one does not fit a row, give it a single line beneath the table. THEN minimize / mark-outdated any prior intermediate PR comments on #${pr.prNumber} — earlier escalate-flush comments, any manual out-of-band rework/re-review comments, AND any earlier final-remediation/synthesis comment left by a prior convergence of this same cycle (a converged-but-unmerged PR that was re-run, found new findings and re-converged — do NOT minimize the first review comment) — so that ONLY the first review comment and this one final remediation remain as the visible current state (if there are none to minimize, that step is a no-op). This single comment IS the durable audit of the ENTIRE review<->fix cycle across every run. Then DELETE \`${reviewLog}\`. Do NOT merge.`,
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
// `id` is lifted to the top of each row: #250 reads it positionally-independently, and
// reaching into `row.story.id` would couple the caller to this engine's internal shape.
const batch = results.filter(Boolean).map((r) => ({ id: r.story?.id, ...r }))
// The note must describe what ACTUALLY happened. The previous version stated
// "PRs are ready-for-merge or escalated" unconditionally — so a run whose stories
// ALL died (every agent stalled out, `parallel` returning six nulls) reported an
// empty batch under a success-shaped sentence, indistinguishable from a completed
// one. That is the same failure class #401 fixed for empty INPUT, reached instead
// through total execution failure: a batch that drove nothing must say so.
const died = STORIES.length - batch.length
const note = !STORIES.length
  ? 'Empty batch — nothing was requested, nothing was run.'
  : !batch.length
    ? `NOTHING COMPLETED: all ${STORIES.length} stories failed before returning a result (agents stalled or errored). No PR advanced in this run. Committed work in the per-story worktrees is intact — re-run to resume; check the machine's load first, since a stall means agents could not show progress within the supervisor's window.`
    : `${batch.length}/${STORIES.length} stories returned a result${died ? ` — ${died} failed outright and advanced nothing` : ''}. PRs are ready-for-merge or escalated; check each status. Merge is the human gate — review the list, merge, then re-run with the next mutex-safe batch.`
return {
  // Contract provenance per template — `fallback-loose` is the logged signal
  // that a contract could not be derived and the loose skeleton was used (AC4).
  contracts: contracts.map(({ name, status }) => ({ name, status })),
  batch,
  // Stories that never returned anything, named so a failed run is actionable
  // rather than merely empty.
  died: STORIES.filter((s) => !batch.some((b) => b.story?.id === s.id)).map((s) => s.id),
  note,
}
