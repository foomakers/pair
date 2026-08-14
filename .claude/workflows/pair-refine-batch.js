export const meta = {
  // The registry keys a workflow by `meta.name`, not by its filename, so the `pair-` prefix
  // belongs here too: an adopter who has a `refine-batch` of their own would otherwise collide
  // with this one, under an undefined winner. NOTE: no apostrophes in a comment inside `meta`
  // — the pure-literal guard scans this block character by character and reads one as a string.
  name: 'pair-refine-batch',
  description:
    'Drive a batch of backlog cards to Ready in parallel: classify-only (matrix + risk tag), full refinement, or read-only triage. Writes to the PM tool only — never to the repo.',
  // NOTE: `meta` must be a PURE LITERAL — the loader parses it statically and rejects any
  // expression node. Keep every value a single literal, however long the line gets.
  whenToUse:
    'REQUIRED args shape: {"items":[{"id":"218","mode":"classify"}]} where mode is one of classify | refine | triage. Optional per item: notes (a directive threaded into the prompt), breakdown (refine only: carry the card past Ready into a task list) and fixStatusLine (the issue body declares a status contradicting its content). Both flags must be REAL booleans, true or false — a JSON string "true" or a number is rejected, never coerced, because a wrong-typed flag would silently drop the directive it controls. This batch is I/O-bound (GitHub API + KB reads) and touches NO repo file, so it is safe to run CONCURRENTLY with an implement-batch: the two contend for neither files nor CPU. Items are independent by construction — each writes a different issue — so there is no mutex to pre-filter, unlike implement-batch.',
  phases: [{ title: 'Work' }, { title: 'Verify' }],
}

// ── Why this workflow exists ───────────────────────────────────────────────
// The backlog's refinement debt is NOT uniform, and treating it as one job wastes
// the cheap part. Measured on the board, three distinct shapes hide behind
// "needs refinement":
//   - classify: the body is already complete (Given-When-Then AC, DoD, story points)
//     and ONLY the classification matrix + risk tag are missing. Mechanical, uniform,
//     and the single largest group.
//   - refine:   genuinely empty (no AC, no DoD, no sizing) — needs the full
//     Draft->Ready path.
//   - triage:   already tagged but absent from the plan / the board — decide whether
//     it is Ready, a duplicate, or blocked, WITHOUT writing anything.
// Splitting them means the mechanical majority runs at low effort and full width
// instead of being paced by the few cards that need real thought.
//
// ── Why this workflow carries NEITHER of implement-batch's two knobs (#219) ─
// This file ships to adopters alongside `pair-implement-batch.js`, so the difference is
// deliberate and stated here rather than left for a reader to infer:
//
//   NO parallelism cap (AC6). The cap exists on the implement engine because a card there
//   OCCUPIES a working tree: N cards = N worktrees, N checkouts, N `pnpm install`s, N agents
//   doing real CPU work, and the machine is the constraint. A card here costs one PM-tool API
//   round trip and touches no repo file at all — the fan-out is bounded by the tracker's rate
//   limit, not by local resources, and throttling it would only make a batch slower. If that
//   ever changes (a tracker that rate-limits hard), add the cap here the same way: inside the
//   file, because the sandbox `pipeline`/`parallel` primitives are unbounded by construction.
//
//   NO `args.pipeline` (AC1). The implement engine was generalized because its prompts named
//   pair skills for steps that EVERY project performs under some name (implement, open a PR,
//   review). This workflow's prompts name `/pair-capability-classify`,
//   `/pair-process-refine-story` and `/pair-process-plan-tasks` — and those are not generic
//   steps with a local equivalent, they ARE pair's refinement method: the classification
//   matrix, the Given-When-Then Draft->Ready path, the AC-coverage table. Swapping the skill
//   name would leave the prompts describing artifacts the substitute does not produce, so a
//   `pipeline` key here would be configuration that cannot actually be honoured. Generalizing
//   this workflow means generalizing the method, which is a separate decision, not a knob.

// Every caller-facing object validates its key SET, not just the keys it recognises. Duplicated
// verbatim from `pair-implement-batch.js` (same convention as `severityRankErrors`): these files
// are sandbox scripts with NO imports, so a shared helper is not reachable — keep the two copies
// together, and change them together. Here the hole was worse than on the sibling: the VERIFY
// stage is keyed off the same fields a typo drops, so `fixstatusline` (one character) produced a
// work prompt with no directive, a verify prompt asserting none, and the card in `ready` with
// `verified: true` — the #401 shape, hidden behind the very stage built to catch it.
function rejectUnknownKeys(obj, allowed, where) {
  for (const k of Object.keys(obj ?? {}))
    if (!allowed.includes(k))
      throw new Error(
        `refine-batch: unknown \`${where}.${k}\`; expected one of ${allowed.join(', ')}. ` +
          `An unrecognised key would be dropped in silence and the run would use the default ` +
          `while the caller believed otherwise.`,
      )
}

function parseArgs(raw) {
  let a = raw
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a.trim())
    } catch {
      throw new Error(
        `refine-batch: \`args\` is a string that is not JSON: ${JSON.stringify(String(raw).slice(0, 60))}. ` +
          `Pass, verbatim: {"items":[{"id":"218","mode":"classify"}]}.`,
      )
    }
  }
  if (Array.isArray(a)) a = { items: a }
  if (!a || typeof a !== 'object' || !Array.isArray(a.items))
    throw new Error(
      `refine-batch: \`args\` must be { items: [...] } (or a bare array). Received: ` +
        `${a === undefined || a === null ? String(a) : JSON.stringify(a).slice(0, 80)}. ` +
        `Nothing was run — this is an input error, not an empty batch.`,
    )
  const MODES = ['classify', 'refine', 'triage']
  // Validated against the known set rather than passed through: a typo in a model name
  // is otherwise silent — the override is ignored, the batch runs on the inherited model,
  // and the report looks exactly like a successful override. Fail loudly at parse time.
  const MODELS = ['fable', 'haiku', 'sonnet', 'opus']
  const checkModel = (m, where) => {
    const v = String(m ?? '').trim()
    if (!v) return undefined
    if (!MODELS.includes(v))
      throw new Error(`refine-batch: ${where} has unknown model ${JSON.stringify(v)}; expected one of ${MODELS.join(' | ')}.`)
    return v
  }
  const batchModel = checkModel(a.model, '`args.model`')
  const seenIds = new Map()
  const items = a.items.map((it, i) => {
    if (!it || typeof it !== 'object' || Array.isArray(it))
      throw new Error(`refine-batch: items[${i}] is not an object: ${JSON.stringify(it)}.`)
    rejectUnknownKeys(it, ['id', 'mode', 'notes', 'breakdown', 'fixStatusLine', 'model'], `items[${i}]`)
    // A number is lossless and unambiguous for an issue ref (`{"id":218}` is what a caller
    // composing JSON from an issue number writes), so it is coerced deliberately. Anything
    // else is not: `id: ['218']` and `id: true` both used to survive `String()` and then PASS
    // the safe-path-segment test as "218"/"true", so a caller who passed the wrong shape got a
    // plausible-looking run against an id they never named. See `constrain` below.
    if (it.id !== undefined && it.id !== null && typeof it.id !== 'string' && typeof it.id !== 'number')
      throw new Error(
        `refine-batch: items[${i}] has id of type ${Array.isArray(it.id) ? 'array' : typeof it.id}, which is not a string or a number. ` +
          `It would be COERCED (an array joins on commas, a boolean becomes "true") and could then pass every ` +
          `value check as an id the caller never wrote. Pass the issue ref as a string or a number.`,
      )
    const id = String(it.id ?? '').trim().replace(/^#/, '')
    if (!id) throw new Error(`refine-batch: items[${i}] is missing id.`)
    // Presence is not validity. `id` and `notes` are interpolated VERBATIM into the prompt of a
    // `general-purpose` agent — a host built-in with UNRESTRICTED tools, `Bash` included — and
    // `id` lands inside an instruction the agent then runs as `gh issue view <id>`. So a card
    // value here carries the authority of the command line it reaches, exactly as on the sibling
    // engine: `id: '218 --json body; gh pr merge 432 --squash'` reached the prompt and the agent
    // label intact, and a `notes` carrying a backtick or a newline restructures the prompt around
    // the READONLY clause it sits next to. Rejected rather than quoted: an escaped value still
    // RUNS, and the caller who typed something that was never an issue ref never learns it.
    const constrain = (value, key, ok, what) => {
      // Reject a present-but-non-string value BEFORE coercing it. `String(value ?? '')` first
      // meant `notes: {a:1}` reached the prompt as `[object Object]` and `notes: ['a','b']` as
      // `a,b` — the coerce-instead-of-reject direction this file rejects everywhere else, and
      // it defeats the type check a reader assumes is there.
      if (value !== undefined && value !== null && typeof value !== 'string')
        throw new Error(
          `refine-batch: items[${i}] (#${id}) has ${key} of type ${Array.isArray(value) ? 'array' : typeof value}, which is not a string. ` +
            `A non-string would be COERCED into the prompt (an object becomes "[object Object]", an array joins on commas) ` +
            `as if the caller had typed it. Pass a string, or omit the key.`,
        )
      const v = String(value ?? '').trim()
      if (!v) return // absent/blank is handled above (required) or simply omitted from the prompt
      if (!ok(v))
        throw new Error(
          `refine-batch: items[${i}] (#${id}) has ${key} ${JSON.stringify(v)}, which is not ${what}. ` +
            `Card fields are interpolated verbatim into the prompt of a Bash-capable agent, so a value ` +
            `carrying shell syntax or a path escape would EXECUTE rather than name a ${key}. Rejected, never quoted.`,
        )
    }
    // Free prose, minus the two forms that become a COMMAND when an agent puts the value on a
    // command line: backtick and `$(`. Newlines and control characters go too — they are what
    // restructures a prompt. Punctuation, spaces and non-ASCII stay legal: a real note
    // ("triage says #234/#390 already shipped this (gate≠review)") must keep working.
    const isProse = v => !/[`\r\n\x00-\x1f]/.test(v) && !v.includes('$(')
    constrain(id, 'id', v => /^[A-Za-z0-9._-]+$/.test(v) && !v.includes('..'), 'a single safe path segment (it reaches `gh issue view <id>`)')
    constrain(it.notes, 'notes', isProse, 'plain text (no backtick, no `$(`, no newline)')
    const mode = String(it.mode ?? 'classify').trim()
    if (!MODES.includes(mode))
      throw new Error(`refine-batch: items[${i}] (#${id}) has unknown mode ${JSON.stringify(mode)}; expected one of ${MODES.join(' | ')}.`)
    // A boolean field is validated as a boolean and coerced NOWHERE. The two flags used to
    // disagree with each other, in opposite directions and with nothing reported either way:
    // `breakdown` was read `=== true` (a wrong-typed YES silently ignored) while
    // `fixStatusLine` was a bare truthiness test (a wrong-typed NO — the string "false", which
    // is truthy — silently APPLIED). The ignored direction is the dangerous one and it is the
    // #401 shape: `breakdown: "true"` dropped the plan-tasks directive from the work prompt AND
    // the AC-coverage assertion from the verify prompt — the stage that exists to catch a
    // dropped directive is keyed off the same field — so the card came back `verified` and
    // landed in `ready` with no breakdown at all. Realistic, not theoretical: the runtime hands
    // this script a JSON STRING (see `parseArgs` above) and `"breakdown":"true"` is what a
    // hand-written JSON arg looks like. Same call the sibling engine makes on `prNumber`
    // (`pair-implement-batch.js`): a present-but-unusable value is an error, never a silently
    // ignored one.
    const checkFlag = key => {
      if (key in it && typeof it[key] !== 'boolean')
        throw new Error(
          `refine-batch: items[${i}] (#${id}) has ${key} ${JSON.stringify(it[key]) ?? String(it[key])} ` +
            `(${Array.isArray(it[key]) ? 'array' : typeof it[key]}), which is not a boolean. ` +
            `A non-boolean is NOT read as "flag absent": the directive it controls would be dropped from the work ` +
            `prompt AND from the verify assertion built to catch that drop, and the card would still be reported ` +
            `Ready. Pass true or false, or omit the key.`,
        )
    }
    checkFlag('breakdown')
    checkFlag('fixStatusLine')
    // `breakdown: true` carries the card past Ready into an implementation task list.
    // Only meaningful for `refine`: a classify-only card already has its body, and a
    // triage writes nothing at all.
    const breakdown = it.breakdown === true
    if (breakdown && mode !== 'refine')
      throw new Error(
        `refine-batch: items[${i}] (#${id}) sets breakdown on mode "${mode}" — task breakdown only follows a full refine.`,
      )
    // Two items with the same id are two writers on the SAME issue body, dispatched
    // concurrently: a `classify` and a `refine` race and the last write wins, silently. `failed`
    // is computed by id match, so it reports neither of them correctly — a twin that died reads
    // as having returned, because its surviving sibling answers for it.
    if (seenIds.has(id))
      throw new Error(
        `refine-batch: items[${seenIds.get(id)}] and items[${i}] both carry id #${id}. ` +
          `One card is one issue and one write — two items sharing an id would run two writers ` +
          `on the same issue body and lose one of them. Pass each card once.`,
      )
    seenIds.set(id, i)
    return { ...it, id, mode, breakdown, model: checkModel(it.model, `items[${i}] (#${id})`) }
  })
  // Read every option off the PARSED object, once, and validate the key set here too: the
  // runtime can hand this script a JSON STRING, and an unknown top-level key was accepted in
  // silence — `maxParallelism: 2` ran the batch completely unthrottled with no error and no
  // effect, while the sibling engine throws on the same typo.
  rejectUnknownKeys(a, ['items', 'model'], 'args')
  return { items, batchModel }
}
// `model` (per batch via `args.model`, per card via `item.model`) overrides the model for the
// WORK stage only — the stage that actually reads the card and the code. The verify stage keeps
// its own deliberate sonnet/low setting: it is a cheap, mechanical re-read whose job is to be
// RELIABLE rather than clever, and pinning it means a change of authoring model never silently
// changes what counts as verified. Omit both and every agent inherits the session model.
const { items: ITEMS, batchModel: BATCH_MODEL } = parseArgs(args)

// One retry per item, same rationale as implement-batch: `agent()` returns null when the
// subagent dies or is killed for silence, and without a retry a single death drops the card
// from the run entirely. These agents are read-mostly and re-entrant (a classify that already
// wrote its matrix simply finds it there), so a second attempt resumes rather than duplicates.
async function agentRetry(prompt, opts) {
  const first = await agent(prompt, opts)
  if (first) return first
  log(`${opts.label}: returned nothing (agent died or returned an invalid shape) — retrying once`)
  return agent(prompt, { ...opts, label: `${opts.label} retry` })
}

// The card's post-condition, as READ BACK from the tracker — never as reported by
// the agent that wrote it. This mirrors the invariant #403 establishes: `gh project
// item-add` exits 0 without creating the item, so no write is assumed, every write
// is re-read. `verified` is set by the SECOND agent, which re-fetches the issue.
const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    number: { type: 'number' },
    riskTag: { type: 'string' }, // e.g. risk:yellow — '' when the mode writes no tag
    boardStatus: { type: 'string' }, // the board column after the write
    changed: { type: 'array', items: { type: 'string' } }, // what this agent actually wrote
    recommendation: { type: 'string' }, // triage only: Ready / needs-refinement / close / blocked
    blockedBy: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['number'],
}
const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    number: { type: 'number' },
    verified: { type: 'boolean' },
    riskTag: { type: 'string' },
    boardStatus: { type: 'string' },
    missing: { type: 'array', items: { type: 'string' } }, // what the re-read could NOT find
    note: { type: 'string' },
  },
  required: ['number', 'verified'],
}

// Every agent in this batch is repo-READ-ONLY. They read the KB to resolve the quality
// model and the templates, and they write ONLY to the PM tool. Stated as a hard clause
// because an implement-batch is running concurrently in sibling worktrees: a stray edit
// or a `git` command here would land in whichever tree the agent happened to be in.
const READONLY = `REPO SAFETY (mandatory): this is a PM-tool task, not a code task. Read the repository freely, but do NOT create, edit or delete ANY file, do NOT run any git command that mutates state (no add/commit/checkout/branch/worktree/stash), and do NOT touch \`.pair/working/\`. An implement-batch is running CONCURRENTLY in sibling worktrees — a stray write here corrupts someone else's story. Every change you make goes to the issue tracker via \`gh\`.`

// Re-read, don't assume. A second, fresh agent re-fetches the issue and reports what it
// can actually SEE — the classification section, the risk label, the board column. It is
// deliberately a different agent from the writer: an agent asked to confirm its own write
// reports its intent, not the tracker's state.
//
// The post-condition names the EXACT expected board column, not merely "a board status".
// The first version asked for "a board status" and #219/#250 came back `verified: true`
// while still sitting in `Todo` — the very column they were supposed to leave. `Todo` IS a
// status, so the check passed and two cards were reported Ready while the board said
// otherwise. A verification predicate must name the expected VALUE: "some value is present"
// verifies nothing. `fixStatusLine` is now asserted for the same reason — that directive was
// silently skipped by the writer and nothing caught it.
async function verify(item, wrote) {
  const expected =
    item.mode === 'triage'
      ? ' (for triage: nothing was to be written, so `verified` is true as long as the issue is readable and UNCHANGED).'
      : `: a \`## Classification\` section with the matrix in the body, a \`risk:*\` label, and a board column of EXACTLY \`Refined\` — any other column, \`Todo\` included, means NOT verified however plausible the writer's report.${item.fixStatusLine === true ? ` ALSO required for this card: the body's own \`**Status**:\` line must now read \`Refined\`. Ignore the \`### Status Workflow\` legend — it lists every state by design and is NOT the card's status.` : ''}${item.breakdown ? ` ALSO required: an implementation task checklist in the body AND an AC-coverage table mapping tasks to acceptance criteria. Check the table is COMPLETE — every acceptance criterion covered by at least one task; report an uncovered criterion in \`missing\`, since a breakdown with a hole is what silently ships an unimplemented AC.` : ''} List anything you expected but could NOT find in \`missing\`.`
  return agent(
    `Re-read issue #${item.id} from the tracker and report its CURRENT state as stored. ${READONLY} Fetch the issue (body + labels) and its project-board item. Report: \`riskTag\` (the \`risk:*\` label actually present, '' if none), \`boardStatus\` (the board column actually set, '' if the issue is not on the board), and \`verified\` — true ONLY if the issue now genuinely carries what this mode was supposed to produce${expected} The writing agent reported: ${JSON.stringify(wrote ?? null)} — treat that as a CLAIM to check, not as fact. Do NOT fix anything you find missing; just report it.`,
    { agentType: 'general-purpose', phase: 'Verify', label: `verify:#${item.id}`, model: 'sonnet', effort: 'low', schema: VERIFY_SCHEMA },
  )
}

const PROMPTS = {
  // The body is already complete; only the matrix + tag are missing. Uniform, mechanical,
  // low effort — this is the group that makes the batch worth running wide.
  classify: (item) =>
    `Classify backlog card #${item.id}. ${READONLY} Its body ALREADY has Given-When-Then acceptance criteria, a Definition of Done and story points — do NOT rewrite, re-scope or re-estimate any of that. The ONLY thing missing is the classification. Run /pair-capability-classify against the existing content to build the classification matrix, then apply it with /pair-capability-write-issue: add the \`## Classification\` section to the body, apply the resulting \`risk:*\` label, and set the board status to Refined. Follow the project's quality model (KB default + any \`tech/risk-matrix.md\` adoption delta) — do not invent criteria.${item.fixStatusLine === true ? ` ALSO: this card's body declares a status line that CONTRADICTS its own content (it says Todo while carrying AC, DoD and points). Correct the body's status line to match the content, and say so in \`changed\`.` : ''}${item.notes ? ` CONTEXT: ${item.notes}` : ''} Remember the tracker invariant: \`gh project item-add\` exits 0 WITHOUT creating the item — re-read every write before reporting it. Return what you changed.`,

  // Full Draft->Ready path. Covers BOTH shapes: a genuinely empty card, and a card whose
  // existing content has gone wrong (AC that presume a feature nobody shipped, a plan for
  // something already merged, a body superseded by a reformulation). The second shape is the
  // dangerous one — an agent told "this card has no AC" when it HAS them will append a second
  // set beside the broken ones instead of replacing them, leaving a body that contradicts
  // itself. So the instruction is to read what is there and decide, per section, replace vs keep.
  refine: (item) =>
    `Refine backlog card #${item.id} to Ready via /pair-process-refine-story. ${READONLY} Deliver the full path: Given-When-Then acceptance criteria, Definition of Done, subdomain/context mapping scoped to what it touches, the classification matrix, the \`risk:*\` label, story points, and board status Refined.

FIRST read the card as it stands. It may be empty, or it may already carry content that is WRONG — acceptance criteria presuming a capability that was never shipped, a plan for something merged since, a body superseded by a reformulation whose old sections were never removed. Where existing content is wrong, REPLACE it; do not append a second version beside it, and do not leave a body that contradicts itself (that includes the title: if it names a superseded framing, say so in your return so it can be corrected). Where it is right, keep it and say so rather than rewriting for the sake of it.

Ground every criterion in the repository as it is TODAY — read the code and the KB before asserting what a card must do, and never write an AC against a capability you have not verified exists.${item.notes ? `

TRIAGE FINDINGS for this card (an independent read; treat as strong evidence, verify before acting): ${item.notes}` : ''}

NON-INTERACTIVE (mandatory): you are running unattended in a batch — there is NO human to answer questions. /pair-process-refine-story opens with a grill interview: do NOT ask questions and do NOT stall waiting for input. Resolve each question yourself from the code, the KB and the linked context, choose the most defensible answer, and RECORD the assumption in the card body (an \`## Assumptions\` section) so the maintainer can overturn it later. If a question genuinely cannot be settled from the repository — it needs a product decision only a human can make — do not invent an answer: leave that part explicitly marked as an open question in the body, keep the rest of the refinement complete, and name it in your \`note\`.

${item.breakdown ? `\n\nTHEN, once the card is Ready, run /pair-process-plan-tasks on it: an implementation task checklist, the dependency graph between tasks, and an AC-coverage table showing which task satisfies which acceptance criterion — added to the SAME issue body. Do NOT create separate task issues. Every acceptance criterion must be covered by at least one task; if one cannot be, that is a signal the criterion is not implementable as written — go back and fix the criterion rather than leaving a hole in the table.\n` : ''}
PACING (mandatory): a supervisor kills any agent that goes 180 seconds without emitting a TEXT MESSAGE — tool calls do not count. Narrate as you go: a short line after each file you read and after each section you write. Silence is fatal, slowness is not.

Do NOT expand the scope beyond what the card states, and do NOT file any new issue — this is binding: refinement records what a card must do, it never spawns a second card to hold the overflow. Where scope exceeds the card, say so in your return and let the maintainer decide. Remember: \`gh project item-add\` exits 0 WITHOUT creating the item — re-read every write. Return what you changed.`,

  // Read-only: decide what the card IS before spending refinement on it.
  triage: (item) =>
    `TRIAGE card #${item.id} — READ-ONLY, write NOTHING. ${READONLY} Do not edit the issue, do not comment, do not label, do not touch the board. Read the issue, its linked context, and the CURRENT state of the code it concerns, then judge: is it genuinely Ready to implement as written, does it still need refinement, is it already obsolete/duplicated by work merged since it was filed, or is it blocked? Report \`recommendation\` as exactly one of: \`ready\` | \`needs-refinement\` | \`obsolete\` | \`blocked\`, with \`blockedBy\` naming the blocker when blocked, and \`note\` giving the one-sentence reason and — if it is ready — which FILES it touches, so the orchestrator can place it in the mutex graph against the cards already in flight.${item.notes ? ` CONTEXT: ${item.notes}` : ''}`,
}

// Effort scales to the shape of the work, not to the card. classify is mechanical
// application of an existing model to existing content; refine is genuine authoring;
// triage is a judgment call over code that has moved since the card was filed.
const EFFORT = { classify: 'medium', refine: 'high', triage: 'medium' }

// pipeline, not parallel+parallel: each card verifies as soon as ITS work lands, so a
// slow `refine` never holds back the verification of a fast `classify`. There is no
// cross-item dependency anywhere in this batch, so a barrier would buy nothing and
// cost the difference between the slowest and the fastest item.
const results = await pipeline(
  ITEMS,
  (item) =>
    agentRetry(PROMPTS[item.mode](item), {
      agentType: 'general-purpose',
      phase: 'Work',
      label: `${item.mode}:#${item.id}`,
      effort: EFFORT[item.mode],
      schema: RESULT_SCHEMA,
      // Per-card model wins over the batch default; both absent → inherit the session model.
      ...(item.model || BATCH_MODEL ? { model: item.model || BATCH_MODEL } : {}),
    }),
  // `triage` writes NOTHING by contract, so there is no tracker state for a second agent to
  // read back — its verify would only confirm that an issue nobody touched is unchanged.
  // Paying an agent per card for that doubles the batch's cost to assert a tautology, and on
  // a constrained session that budget is better spent on cards that DID write. The verify
  // stage is what makes a write trustworthy; where there is no write, it is ceremony.
  async (wrote, item) =>
    item.mode === 'triage'
      ? { item, wrote, check: { number: Number(item.id), verified: true, note: 'triage: read-only, nothing to verify' } }
      : { item, wrote, check: await verify(item, wrote) },
)

const rows = results.filter(Boolean)
const failed = ITEMS.filter((it) => !rows.some((r) => r.item.id === it.id)).map((it) => it.id)
const unverified = rows.filter((r) => r.check?.verified !== true)

return {
  ready: rows
    .filter((r) => r.item.mode !== 'triage' && r.check?.verified === true)
    .map((r) => ({ id: r.item.id, riskTag: r.check.riskTag, boardStatus: r.check.boardStatus })),
  triage: rows
    .filter((r) => r.item.mode === 'triage')
    .map((r) => ({ id: r.item.id, recommendation: r.wrote?.recommendation, blockedBy: r.wrote?.blockedBy, note: r.wrote?.note })),
  // Surfaced, never swallowed: a card whose write could not be READ BACK is not Ready,
  // however confidently the writing agent reported success.
  unverified: unverified.map((r) => ({ id: r.item.id, missing: r.check?.missing ?? ['(no verify result)'], note: r.check?.note })),
  failed,
  note: 'Cards in `ready` were re-read from the tracker and carry a matrix, a risk tag and a board status. `unverified` needs a human look. `triage` wrote nothing — it is advice.',
}
