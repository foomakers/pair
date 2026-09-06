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
// THE CONTRACT (#219 AC7) — what `pair-loop` (#250) codes against.
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
//     historyDecision?,          // narrow human decision: exact sealed-history commit subjects
//                                 // only, { commits: [lower-case full SHA...], disposition }
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
// field happens to be set: an explicit `undefined` on a field nobody set used to abort the
// WHOLE batch at parse time while the sibling field beside it accepted the same spelling.
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
//          | failed-implement | failed-pr | failed-review | failed-fix | failed-preflight
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
// Optional { historyDecision } = a narrow human decision on the SUBJECTS of exact historical
// commits when rewriting them would alter a sealed RED base. It is reviewer context, never a
// waiver for code, docs, tests, configuration or other commits; a history-only finding without
// it escalates before RED/seal/GREEN can make its remediation impossible in this cycle.
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
// Must START alphanumeric, not merely be built from safe characters. `-rf` is read by the
// shell as a FLAG rather than as the path argument it sits in, and `.` resolves to the
// worktree ROOT — `git worktree remove --force <root>/<id>-review` on either is not
// recoverable. Both passed the earlier charset test, which only forbade `..`. Same rule,
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
  // `cards` is the generalized contract name (#219 AC7); `stories` is the pair-era alias,
  // kept working so no existing caller breaks. Both present is an ERROR rather than a
  // preference: silently picking one would drive a batch the caller did not describe.
  if (a && typeof a === 'object' && Array.isArray(a.cards) && Array.isArray(a.stories))
    throw new Error(
      `implement-batch: \`args\` carries both \`cards\` and \`stories\`. They are the same field — ` +
        `\`cards\` is the current name, \`stories\` the accepted alias. Pass exactly one.`,
    )
  // `Object.hasOwn` + the undefined/null test, not a bare `in`: the unset-optional rule of this
  // contract holds HERE too. `in` counted an explicitly-undefined alias key as PRESENT, so
  // `{ cards: [...], stories: undefined }` skipped the mapping and threw "`args` must be
  // { stories: [...] }" — telling a caller who passed a list that no list was there, and naming
  // the ALIAS rather than the key they used. Its mirror image (`{ stories, cards: undefined }`)
  // worked, which is the asymmetry the rule exists to remove. (The naming half of that same
  // defect is closed by `listKey` just below — it survived this fix by one round.)
  const hasStories = a && typeof a === 'object' && Object.hasOwn(a, 'stories') && a.stories !== undefined && a.stories !== null
  const hasCards = a && typeof a === 'object' && Array.isArray(a.cards)
  // EVERY error below names the spelling the CALLER actually used, and indexes cards with it.
  // The guards used to disagree: three said `stories[i]` unconditionally while the four beside
  // them said `cards[i]`, so ONE malformed input produced two different index labels depending
  // on which guard happened to fire — and the message a caller got for the most common mistake
  // (`{cards: [{id, branch}]}` → "stories[0] … is missing title") named a key they had not
  // passed and steered them to the deprecated spelling. `cards` is the default because it is
  // the contract key; the alias is named only when the alias is what arrived. `#250` is the
  // caller this contract is frozen for, and this text is the only guidance it ever reads.
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
    // The CARD's key set is validated like every other caller-facing object. Without this,
    // `prNumbr: 432` (typo) or a card carrying an invented key was dropped in silence:
    // `resuming` stayed false, the engine ran IMPLEMENT then publishPr, and opened a SECOND
    // PR for a story that already had one — the very thing this file forbids in as many words.
    rejectUnknownKeys(s, ['id', 'title', 'branch', 'base', 'notes', 'historyDecision', 'prNumber'], `${listKey}[${i}]`)
    // `#234` and `234` name the same story; normalize once so no prompt, worktree
    // path or marker ever carries a stray `#`. A number is lossless and unambiguous for an
    // issue ref and is coerced deliberately; anything else is not — `id: ['234']` and
    // `id: true` both survived `String()` and then PASSED the safe-path-segment test as
    // "234"/"true", naming a worktree the caller never wrote. Same rule as the sibling engine.
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
          `implement-batch: ${listKey}[${i}] (#${id}) has ${key} of type ${Array.isArray(value) ? 'array' : typeof value}, which is not a string. ` +
            `A non-string would be COERCED into the shell commands the agents run (an object becomes "[object Object]", ` +
            `an array joins on commas) as if the caller had typed it. Pass a string, or omit the key.`,
        )
      const v = String(value ?? '').trim()
      // PRESENT-BUT-EMPTY IS AN ERROR, at every level — the rule the contract block states and
      // the one this early return used to break. `''` was read as ABSENT here while
      // `args.severityFloor: ''` and `args.pipeline.<key>: ''` both threw for the stated reason.
      // `base` is what it cost: a card composing `base: cfg.base ?? ''` was branched off
      // `pipeline.baseBranch` and the whole `This story is STACKED on …` clause vanished from the
      // implement prompt — a PR built on `origin/main` without its dependency's commits, and a
      // review diffed against the wrong range, with nothing reported. `undefined`/`null` remain
      // the spellings of "unset"; an empty string is a value the caller wrote.
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
    // A seal makes its ancestors intentionally immutable. A human can accept an exact
    // historical commit subject as trace, but the exception must remain narrow: broad caller
    // prose must never become a way to suppress a current-tree finding in the reviewer prompt.
    let historyDecision
    if (s.historyDecision !== undefined && s.historyDecision !== null) {
      const d = s.historyDecision
      if (!d || typeof d !== 'object' || Array.isArray(d))
        throw new Error(
          `implement-batch: ${listKey}[${i}] (#${id}) historyDecision must be an object with commits + disposition, or be omitted.`,
        )
      rejectUnknownKeys(d, ['commits', 'disposition'], `${listKey}[${i}].historyDecision`)
      if (!Array.isArray(d.commits) || d.commits.length === 0)
        throw new Error(
          `implement-batch: ${listKey}[${i}] (#${id}) historyDecision.commits must be a non-empty array of lower-case 40-character SHAs.`,
        )
      const commits = d.commits.map((commit, j) => {
        if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit))
          throw new Error(
            `implement-batch: ${listKey}[${i}] (#${id}) historyDecision.commits[${j}] must be a lower-case 40-character SHA.`,
          )
        return commit
      })
      if (new Set(commits).size !== commits.length)
        throw new Error(
          `implement-batch: ${listKey}[${i}] (#${id}) historyDecision.commits contains a duplicate SHA; name each historical commit once.`,
        )
      if (typeof d.disposition !== 'string' || !d.disposition.trim() || !isProse(d.disposition.trim()))
        throw new Error(
          `implement-batch: ${listKey}[${i}] (#${id}) historyDecision.disposition must be non-empty plain text (no backtick, no \`$(\`, no newline).`,
        )
      historyDecision = { commits, disposition: d.disposition.trim() }
    }
    // `prNumber` decides the ENTIRE lifecycle: an integer re-enters the review loop on the
    // existing PR, anything else falls through to implement+publishPr. A JSON-stringified
    // `"432"` therefore opened a second PR while the caller believed it was resuming, so a
    // present-but-unusable value is an error rather than a silently ignored one.
    // An UNSET optional key has ONE spelling across the whole card: `undefined`/`null` mean
    // ABSENT here exactly as they already do in `constrain`. A bare `'prNumber' in s` made
    // `notes: undefined` legal and `prNumber: undefined` fatal inside the SAME object, so a
    // caller composing cards in JS (`{ id, title, branch, prNumber: state.prNumber }`, #250)
    // lost a 20-card batch at parse time on a field nobody set. `Object.hasOwn`, not `in`:
    // `in` walks the prototype chain.
    // POSITIVE, not merely integral (`isPosInt`, the same predicate `posInt`/`maxParallelism`
    // ask). `Number.isInteger(0)` is true, so `prNumber: 0` passed and then decided the
    // lifecycle wrongly TWICE: `resuming` became true (implement + open-PR skipped) while
    // `if (pr?.prNumber)` read the same `0` as falsy (continuation probe skipped), and the batch
    // returned `ready-for-merge` for a card that was never implemented and has no PR. `0` is
    // what a caller composing cards in code produces from `Number(row.pr ?? '')`, an
    // uninitialized counter or a tracker field defaulting to 0 — the same shape as the
    // `prNumber: undefined` defect, one value along.
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
    return { ...s, id, historyDecision }
  })
  // Return the NORMALIZED container, not just the list. Reading a second option off the
  // raw `args` was a real bug: the runtime can hand this script a JSON STRING, and
  // `typeof args === 'object'` is false for it — so `args.severityFloor` came back
  // undefined and the floor was silently ignored while the caller believed it was set.
  // A batch ran with Minors still blocking and reported escalation as if the floor had
  // been honoured. Every option must be read from the parsed object, once.
  rejectUnknownKeys(a, ['cards', 'stories', 'severityFloor', 'model', 'pipeline', 'maxParallelism'], 'args')
  // Reject the TYPE before anything coerces it, the same rule `constrain` applies to card
  // fields. A whitelist bounds each of these two downstream, so the behavioural cost today is
  // nil (`severityFloor: ['Major']` joined to "Major" and was accepted) — the cost is the
  // invariant: "every caller value is type-checked" has to be true for a reader auditing it,
  // and the next option added beside these inherits the pattern with no whitelist to save it.
  // Checked HERE, at parse time, not where each is consumed: `severityFloor` is only rankable
  // after the contract dispatch, and a wrong TYPE should not wait on an agent to be reported.
  for (const key of ['severityFloor', 'model']) {
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
  // layout modes) could otherwise not name their template at all — and the basename then also
  // rendered as the vocabulary label in the reviewer prompt. Path and label are now
  // independent: the label is derived with `templateLabel()` below. The path is repo-relative
  // (one leading `..` at most, like every other path here): a template reachable only through a
  // deep traversal is outside the repository, and the agent handed it has `Read`/`Write`.
  reviewTemplate: '.pair/knowledge/guidelines/collaboration/templates/code-review-template.md',
  // Rounds of autonomous fix<->re-review before escalating to a human. Pair's 3 is measured
  // (see the rationale at MAX_FIX_ROUNDS below) and is the DEFAULT, not the rule: story
  // assumption A1 lists the fix-round cap among the limits a caller configures, and once the
  // engine ships this number is an adopter-visible contract — a review loop that converges in
  // one round should not pay for three, and a caller who wants a longer leash should not have
  // to fork the file to get it.
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
  // `args.pipeline` is type-checked; its nested object was not. `Object.keys(5)` is `[]`, so
  // `rejectUnknownKeys` passed and `Object.entries(raw.skills ?? {})` yielded nothing: a
  // `skills: 5` (or `true`, or `[]`) was ACCEPTED and pair's own skill names ran while the
  // caller believed they had configured theirs — the discarded-setting failure (#401) on the
  // one key whose entire purpose is that the adopter's skills are named differently.
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

// ── Bounded fan-out (#219 AC6) ─────────────────────────────────────────────
// `pair-loop` derives a ceiling from `tech/automation.md` (ADR-017 §6) and passes it here.
// The bound has to live in THIS file: the sandbox `parallel` primitive is an unbounded
// `Promise.all`, so handing it N thunks starts N agents no matter what the caller asked for.
//
// Absent cap = today's behaviour, unbounded. That default is deliberate: every existing
// caller keeps the fan-out it already has, so landing this option changes nobody's run.
function parseMaxParallelism(raw) {
  if (raw === undefined || raw === null) return undefined
  // Rejected rather than coerced. A cap that cannot be honoured must not silently become
  // "no cap": the discarded setting is the one holding back load, so the failure would be a
  // batch running at full width while the caller believes it is throttled (#401's shape).
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
// fallback. It carries aliases (`blocker`, `nit`, `info`) that no template lists, which is why
// it is not itself derived from DEFAULT_SEVERITIES. Where they are actually reachable, stated
// precisely rather than as a vague "callers use them": (a) as a caller-passed `severityFloor`,
// because `parseFloor` validates against `Object.keys(SEVERITY_RANK)` on the unconfigured path,
// so `severityFloor: 'blocker'` is accepted and ranks with `critical`; (b) as the severity of a
// FINDING whose reviewer answered off-vocabulary — the prompt names DEFAULT_SEVERITIES
// (Critical|Major|Minor|Questions), so a `Blocker` coming back is a reviewer deviating from it,
// and the alias is what keeps that finding ranked instead of falling to `Infinity`. Neither is
// the normal path. They are kept because removing them is a BREAKING change for a floor an
// adopter may already pass, not because the normal path needs them — and (b) is fail-safe
// either way, since `Infinity` blocks.
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
  // TWO different failures wear the same shape here, and the message decides which one an
  // operator goes looking for. When a contract WAS derived, an unmatched floor is a caller
  // typo. When it was NOT (the generator died, or returned nothing usable, so the run is on the
  // loose fallback), the floor is measured against pair's own table instead of the adopter's —
  // a correctly-spelled `High` then throws, and the old message told them to check their
  // spelling. Naming the transient cause is what makes a re-run the obvious next step.
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
// Rounds of autonomous fix<->re-review before escalating to a human. Caller-configurable
// (`args.pipeline.maxFixRounds`); pair's own 3 is the default and the measured one. Raised
// from 2: an escalation costs a human round-trip (read the flush, decide, re-run the batch),
// which is strictly more expensive than one more opus fix round — and the observed
// escalations were dominated by long tails of minor findings that a third round
// clears. Beyond 3 the loop is usually not converging for a reason a fourth round
// won't fix either (a design disagreement), and `needsHumanDecision` already exits
// early for that case.
const MAX_FIX_ROUNDS = PIPELINE.maxFixRounds

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
//
// WHAT COUNTS AS A DEAD STEP IS THE CALLER'S CALL (`isUsable`). A bare truthiness
// test retried the NULL return and not the truthy-but-CONTENTLESS one (`{}`, a
// truncated structured output) — and the contentless shape is the one this repo
// actually measured on #432 (the machine slept mid-response), i.e. the retry
// missed the exact incident it was written for while covering its rarer sibling.
// The review step therefore passes `hasReviewEvidence`, the SAME predicate its
// convergence guard uses, so "did not review" means one thing at both sites: the
// transient gets its second chance, and a step that comes back contentless twice
// still fails closed.
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
  },
  required: ['sourceOfTruth', 'matrix', 'redTests', 'testExempt'],
}
const RED_TEST_SHA256 = /^sha256:[0-9a-f]{64}$/
const RED_SNAPSHOT_SHA = /^[0-9a-f]{40}$/
const RED_SNAPSHOT_TRAILER = 'Pair-RED-Snapshot'
const redArtifactKind = artifact => String(artifact?.kind ?? 'test')
const isRedTestArtifact = artifact =>
  redArtifactKind(artifact) === 'test' &&
  !!String(artifact?.command ?? '').trim() &&
  /fail/i.test(String(artifact?.observed ?? ''))
const RED_ARTIFACT_CONTRACT =
  'Classify EVERY redTests entry: a `kind: "test"` entry returns repository-relative `file`, `sha256sum <file>` as `sha256:<digest>`, exact `command` and observed RED failure; a `kind: "fixture"` entry returns `file`, `sha256`, and `consumedBy` naming a listed `kind: "test"` file whose command is RED. A fixture has no invented standalone failure — it inherits only that named consumer’s proven failure and remains frozen in the snapshot.'
const FIXTURE_CONSUMPTION_PREFLIGHT =
  'For every manifest artifact with `kind: "fixture"`, verify `consumedBy` names a listed `kind: "test"` artifact, then trace that fixture to the named RED test’s actual assertion; a fixture without that exact consumer proof is a contract breach.'
const hasRedTestEvidence = r => {
  if (!r || !String(r.sourceOfTruth ?? '').trim() || !Array.isArray(r.matrix) || r.matrix.length === 0) return false
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
const redSnapshotManifestPath = (prNumber, phase) =>
  `.pair/red-snapshots/pr-${prNumber}-${String(phase).replace(/[^a-zA-Z0-9._-]/g, '-')}.json`
const sealedRedSnapshot = ({ prNumber, phase, baseHead }) =>
  `SEALED RED SNAPSHOT (mandatory): before editing source, independently find the ONE ancestor commit in \`${baseHead}..HEAD\` carrying the exact \`${RED_SNAPSHOT_TRAILER}: pr=${prNumber}; phase=${phase}; base=${baseHead}; manifest=<path>\` trailer. Read its manifest and test blobs with \`git show\`/\`git ls-tree\`; do not accept a manifest, digest, test path or snapshot id from this prompt. Change implementation/adoption only. Do NOT modify, format, rename, regenerate, delete or weaken any test artifact recorded by that snapshot, and do NOT amend, rebase, reset, replace or otherwise rewrite the snapshot commit. Commit GREEN strictly on top of it. Remove only the transient manifest path named by the snapshot in the GREEN commit, preserving the immutable ancestor for P3. If discovery is missing, ambiguous or contradictory, return needsHumanDecision — never repair the evidence.`
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
const REVIEW_SCHEMA_BASE = crContract?.schema ?? LOOSE_REVIEW_SCHEMA
// Template contracts own human verdict/finding vocabulary. The orchestration-only
// baseline is layered on top so a template refresh cannot accidentally remove it.
const REVIEW_SCHEMA = {
  ...REVIEW_SCHEMA_BASE,
  properties: {
    ...REVIEW_SCHEMA_BASE.properties,
    reviewedHead: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    humanDecisionKind: { type: 'string', enum: ['history-rewrite'] },
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
    findings: REVIEW_SCHEMA_BASE.properties.findings,
  },
  required: ['verified', 'reviewedHead', 'findings'],
}
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

const AUTHORITATIVE_BOUNDARY_PROOF =
  'AUTHORITATIVE BOUNDARY PROOF (mandatory): when a table row, equivalence, normalization or remediation depends on an external command, service, file format or runtime, name the exact real producer/consumer that defines it and run a minimal isolated end-to-end probe for every such claim. Keep rows distinct until that boundary proves them equivalent. A unit test of the function being changed cannot establish external semantics or prove that user-facing repair advice works: apply the advice in a clean temporary environment and verify the promised postcondition.'

const EMPIRICAL_EVIDENCE_LEDGER =
  'EMPIRICAL EVIDENCE LEDGER (mandatory): before asserting or propagating a measured or factual claim in source comments, test names/comments, ADR/ADL, PR body, or a user-facing diagnostic, record Claim | authoritative oracle | exact command/fixture/revision | observed output. Counts, Unicode/category classifications, version facts and external behavior all need that proof. If evidence is absent, remove or qualify the claim. One measured output feeds every distributed restatement: never independently re-count, paraphrase, or invent a plausible explanation.'

const INTERACTION_COLLISION_COMPLETENESS =
  'INTERACTION/COLLISION COMPLETENESS (mandatory): after individual decision-table rows, add the minimal cross-product rows wherever one rule output can also be a valid input, name, state, or reservation of another. Test the actual collision resolver, including duplicate input alongside a pre-existing generated/suffixed outcome; independent happy-path rows do not prove that interaction.'

const LOSSLESS_DIAGNOSTIC_CONTRACT =
  'LOSSLESS DIAGNOSTIC CONTRACT (mandatory when reporting user input or derived identifiers): test lossless distinguishability between actual, expected and candidate values. Escape or name code points for invisible, whitespace-normalized, or confusable characters so an error cannot collapse the wrong spelling into the expected one.'

const CONTRACT_INVENTORY =
  'CONTRACT INVENTORY (mandatory): before reporting findings, map each changed observable contract to its authoritative producer, inputs, consumers and representations. A FIRST review inventories every changed contract; a re-review inventories only its fix delta and directly changed boundary. For a finite protocol, parser, configuration, state transition or command-output domain, build a finite decision table of every supported state plus its invalid/boundary pair, and probe the real behavior. Report every defect that table exposes now; do not leave ordinary rows for a later review. ' +
  EMPIRICAL_EVIDENCE_LEDGER +
  ' ' +
  INTERACTION_COLLISION_COMPLETENESS +
  ' ' +
  LOSSLESS_DIAGNOSTIC_CONTRACT +
  ' ' +
  AUTHORITATIVE_BOUNDARY_PROOF

const FINITE_STATE_COMPLETENESS =
  'FINITE-STATE COMPLETENESS (mandatory when a change parses, selects, snapshots, or branches on a finite protocol/state domain): identify the authoritative grammar or producer, make the complete decision table of supported states and invalid/boundary cases, then write and run a real test for every row before editing the canonical source. Do not implement one newly discovered row at a time and wait for re-review to name the next ordinary variant. ' +
  EMPIRICAL_EVIDENCE_LEDGER +
  ' ' +
  INTERACTION_COLLISION_COMPLETENESS +
  ' ' +
  LOSSLESS_DIAGNOSTIC_CONTRACT +
  ' ' +
  AUTHORITATIVE_BOUNDARY_PROOF

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
// The floor DEFAULTS to `Minor`, so Major and Minor block and drive fix rounds while
// everything below them is carried to the merge gate. Measured on PR #477 across three
// cycles: the PR reached a zero-actionable APPROVED, the next round implemented review
// Questions the reviewer had marked "No change requested", and the re-review found new
// Minors inside the code that round had just added — three the first time, two the second.
// Questions are, by the review template's own definition, questions FOR THE HUMAN; putting
// them in the fix set contradicts what they are and makes convergence a moving target.
// An explicit `severityFloor` still wins, including a lower one that restores the old
// block-everything behaviour.
//
// The default is applied SOFTLY, unlike a caller-passed floor: a template whose vocabulary
// does not declare `Minor`, or whose contract carries no ranking, falls back to no floor
// rather than throwing. A default must never break a run that never asked for it; a floor
// the CALLER spelled wrong still throws, because that is a configuration error they made.
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

function wtClauseBase(story) {
  const base = baseOf(story)
  return `ISOLATION (mandatory): do ALL git/file work inside a dedicated worktree at \`${PIPELINE.worktreeRoot}/${story.id}\` — create-or-reuse it: \`git worktree add ${PIPELINE.worktreeRoot}/${story.id} -B ${story.branch} ${base}\` on first setup, or \`git worktree add ${PIPELINE.worktreeRoot}/${story.id} ${story.branch}\` if the branch already has commits; if the path already exists, just \`cd\` into it. NEVER modify the repo's main working tree and NEVER switch its branch.${base === PIPELINE.baseBranch ? '' : ` This story is STACKED on \`${base}\`: that branch is its base, so its commits are already in your history and must NOT be reverted, duplicated or re-implemented — only ADD your own work on top. When you open the PR, target \`${base}\` as the PR base branch, not \`main\`, so the diff shows only this story's change.`}`
}

function wtClause(story) {
  return `${wtClauseBase(story)} ${FINITE_STATE_COMPLETENESS}`
}

// Reviewer isolation: read-only inspection in a DETACHED throwaway worktree pinned
// to the PR's pushed head. Detached HEAD never occupies the branch, so it can't
// collide with the authoring worktree (which holds it) or with other stories'
// reviewers in a parallel batch — and it never touches the main checkout's branch.
function revWtClauseBase(story) {
  const p = `${PIPELINE.worktreeRoot}/${story.id}-review`
  return `ISOLATION (mandatory, read-only): NEVER switch the main checkout's branch. Inspect the code in a DETACHED throwaway worktree pinned to the PR's current pushed head: \`git worktree remove --force ${p} 2>/dev/null; git fetch origin -q; git worktree add --detach ${p} origin/${story.branch}\`, then \`cd ${p}\`. Read the code there (the untracked checkpoint is absent here — good, stay blind to it). When finished, remove it: \`git worktree remove --force ${p}\`.`
}

function revWtClause(story) {
  return `${revWtClauseBase(story)} ${CONTRACT_INVENTORY}`
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
  // This is human-provided scope for a single otherwise-unfixable finding, not author context:
  // the reviewer still derives every finding independently. Keeping it beside the review loop
  // prevents it leaking into RED/GREEN where it could become an implementation waiver.
  const historyDecisionClause = story.historyDecision
    ? `EXPLICIT HUMAN HISTORY DECISION (not author handoff): commit SUBJECTS on exactly ${JSON.stringify(story.historyDecision.commits)} are accepted historical trace because changing them would rewrite a sealed RED snapshot. Their disposition is: ${JSON.stringify(story.historyDecision.disposition)}. Inspect the actual history before applying this. Only if a finding is solely a subject-line mismatch on exactly one of those commits may you return it nonActionable with that disposition. Do NOT rebase, amend, reset, or release a sealed snapshot for it. This does not waive any code, tests, docs, configuration, generated artifacts, CI behavior, or any other commit. `
    : `HISTORY-REWRITE ESCALATION: if an actionable finding can only be fixed by rewriting, amending, or rebasing existing Git history, set needsHumanDecision: true AND humanDecisionKind: "history-rewrite". Do this before any RED snapshot; still report every other finding normally. `
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
  let prevReviewedHead = null
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
  // The fixer cannot author its own specification. RED writes only tests; a distinct sealer
  // snapshots their exact bytes in Git before GREEN sees the source task. The verifier later
  // discovers that object from history, rather than trusting an orchestrator-owned prompt.
  const authorRedTests = (targets, phase, baseHead) =>
    agentRetry(
      [RED_ARTIFACT_CONTRACT,
      `RED TEST CONTRACT (test-only; no implementation) for story ${tag}, PR #${pr.prNumber}, ${phase}. ${wtClause(story)} The actionable findings are: ${JSON.stringify(targets)}. Inspect the current source and the exact fix boundary \`git diff ${baseHead}...origin/${story.branch} --name-status\`; do NOT read ${BLIND_PATHS}, checkpoints or working logs. Before editing, identify the ONE canonical source of truth for every state transition/classification this fix touches. Build a finite matrix with every branch that changes that owner state, its nearest continuing and interrupting/boundary counterpart, and every renderer/consumer boundary the finding names. A predicate used for laziness, eligibility or a convenience classification is NOT automatically the state-transition oracle: derive expectations from the function that actually mutates/owns the state. Then modify ONLY test artifacts (test source, test fixture or committed oracle row): never modify production source, docs, adoption, configuration, generated assets, commits, pushes, PRs, comments, cards or merges. Run each changed test while the production code is still unfixed and keep it RED for the reported behavior. Do not weaken an existing expectation or replace a failing test with a source-string assertion. Return typed \`redTests\`: every artifact has its repository-relative file path and \`sha256sum <file>\` as \`sha256:<digest>\`; a test has its exact failing command and observed failure, while a fixture declares its RED \`consumedBy\` test rather than inventing one. A pure documentation/formatting finding may set testExempt true only with a concrete rationale; it still needs a matrix. Return sourceOfTruth, matrix rows (condition | oracle | expected), redTests and testExempt. ${FINITE_STATE_COMPLETENESS} ${TEXT_SHAPE}`,
      ].join('\n'),
      withModel({ agentType: 'pair-fix-test-author', phase: 'Review', label: `red-test:${tag} ${phase}`, effort: 'high', schema: RED_TEST_SCHEMA }),
      hasRedTestEvidence,
    )
  const sealRedSnapshot = (redContract, phase, baseHead) => {
    const manifestPath = redSnapshotManifestPath(pr.prNumber, phase)
    return agentRetry(
      `SEAL RED SNAPSHOT (local Git commit; no implementation) for story ${tag}, PR #${pr.prNumber}, round ${phase}. ${wtClause(story)} The independent RED author returned this contract: ${JSON.stringify(redContract)}. Do NOT read ${BLIND_PATHS}, checkpoints or working logs. First search for an already-sealed RED snapshot with exact \`${RED_SNAPSHOT_TRAILER}: pr=${pr.prNumber}; phase=${phase}; base=${baseHead}; manifest=${manifestPath}\`, parent \`${baseHead}\`, matching manifest and matching listed test blobs. If it exists, return it unchanged: this makes a lost agent response retry-safe. Otherwise verify \`git rev-parse HEAD\` is exactly \`${baseHead}\`; otherwise return no seal. Verify every listed test artifact has the stated SHA-256 and that the uncommitted diff contains only those test artifacts. Write the contract verbatim as \`${manifestPath}\`, then create ONE LOCAL commit containing exactly those test artifacts plus that manifest. The test suite is expected to fail, so use \`git commit --no-verify\` solely for this local RED snapshot. Its message MUST carry exactly \`${RED_SNAPSHOT_TRAILER}: pr=${pr.prNumber}; phase=${phase}; base=${baseHead}; manifest=${manifestPath}\`. Never modify production source, docs, adoption, configuration or generated assets; never amend, rebase or reset; never push, post, publish, create a card or merge. Return \`sealed: true\` and the lower-case 40-character \`snapshot\` from \`git rev-parse HEAD\` only after verifying the commit, trailer, manifest and blob paths. ${TEXT_SHAPE}`,
      withModel({ agentType: 'pair-red-sealer', phase: 'Review', label: `red-seal:${tag} ${phase}`, effort: 'medium', schema: RED_SNAPSHOT_SCHEMA }),
      hasSealedRedSnapshot,
    )
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
    // An initial/resumed-without-history review establishes the whole-PR baseline.
    // Once a fix is in flight, even the file inventory must start at that baseline;
    // otherwise the pacing loop invites a second full audit before its delta rule.
    const reviewBase = prevFindings.length ? prevReviewedHead : baseOf(story)
    const review = await agentRetry(
      historyDecisionClause +
      `Independently review PR #${pr.prNumber} for story ${tag}, following ${SK.review}. ${revWtClause(story)} PACING (mandatory — this is what killed the previous four attempts at this review, measured): a supervisor kills any agent that goes 180 seconds without emitting a TEXT MESSAGE. Tool calls do NOT count as progress: the last stalled reviewer was calling \`sed\`/\`cat\` every ~5 seconds and was still killed, because it had not written a sentence in 200 seconds. So: after EVERY file you inspect, write ONE SHORT LINE of prose saying what you found or that it is clean — before moving to the next file. Never read two files in a row without speaking in between, and never go into a long silent analysis pass. Start by listing the changed files (\`git diff ${reviewBase}...origin/${story.branch} --name-only\`), say aloud the order you will take them, then go file by file, narrating as you go. Brevity is fine — one line is enough — but silence is fatal. Review ONLY from the story's acceptance criteria, the PR diff+description, and the code. Do NOT read ${BLIND_PATHS}, nor any checkpoint, handoff or working log under them — they are the author's private context and this review is independent and blind to it. Report EVERY finding regardless of severity (including minor/nit), using the ${REVIEW_TEMPLATE_LABEL} vocabulary: each finding = \`location\` (File:Line), \`severity\` ∈ {${SEVERITIES}}, \`description\` (the CONCRETE FAILURE CASE — inputs/state -> wrong output — not a retelling of the diff), \`recommendation\` (the change, in one or two lines); verdict ∈ {${VERDICTS}}. ACTIONABLE-FINDING ACCEPTANCE PLAN (mandatory): end EVERY actionable \`recommendation\` with \`VERIFY: <concrete input/state -> expected outcome>; ORACLE: <exact command, fixture or authoritative source>; ASSERT: <the observable assertion that consumes that fixture/output>\`. When a changed rule can feed another rule, name the paired direction and the minimal interaction cross-product in VERIFY; a declared fixture column that no expectation reads is not a test. ${TEXT_SHAPE} DO NOT FILE NEW ISSUES. This is a hard rule, and it overrides any habit of deferring work to a follow-up card: a debt you find in this diff is resolved IN PLACE, in this same PR, within this story's scope. Never invoke ${SK.writeIssue}, never write \`Deferred to #<new>\`, and never recommend "track this separately" — a finding parked in a fresh card is a finding nobody fixes, and it converts a reviewed PR into an unreviewed backlog. Set \`nonActionable: true\` ONLY if fixing it would be genuinely WRONG — byte-consistent with a source of truth, matching an existing convention, an ALREADY-EXISTING tracked story (cite its number; do not create one), or something that can only resolve after merge. Being outside this story's originally stated scope is NOT a reason: fix it here. Whenever you set \`nonActionable: true\`, ALSO set \`disposition\` with a concrete reason replacing the bare label (\`By convention …\` / \`Historical record\` / \`Already tracked in #<existing>\` / \`Resolves after merge\`); never leave "non-actionable" as the only explanation. If a finding is SO large that fixing it here would genuinely swamp the story, say so explicitly in \`description\` and leave it ACTIONABLE — the human decides at the merge gate whether to accept the bigger PR or carve it out; that decision is not yours to pre-empt by filing a card. ${first ? `This is the FIRST review: POST your full review report as a PR comment on #${pr.prNumber} (${REVIEW_TEMPLATE_LABEL} structure), and include the marker line \`${firstReviewMarker}\` VERBATIM as the first line of the comment body — it is an HTML comment (invisible in the rendered markdown, so no visible noise) that lets a later resume detect this first review by an EXACT substring match rather than a semantic reading (finding 1). Then return findings + verdict.` : prevFindings.length
            ? `This is a RE-REVIEW: do NOT post any PR comment (the orchestrator synthesizes the cycle at the end). Verify these prior findings were genuinely resolved: ${JSON.stringify(prevFindings)}. The last complete review covered immutable head ${prevReviewedHead}. First inspect ONLY the fix delta with \`git diff ${prevReviewedHead}...origin/${story.branch} --name-status\`, then its directly changed producer/consumer contract boundaries. Do NOT re-audit the unchanged PR surface. A new finding is actionable only if it is in this delta or a contract boundary changed by this delta; otherwise report it as a Question for the human, not a new fix round.`
            : `This is a RE-REVIEW on a resumed in-flight cycle (round-0 of this run carries no prior findings): do a FRESH, independent full review pass. do NOT post any PR comment (the orchestrator synthesizes the cycle at the end).`} Return findings, verdict, and \`reviewedHead\`: the lower-case 40-character SHA printed by \`git rev-parse origin/${story.branch}\` after your inspection.`,
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
      // A review is USABLE only with a verdict and its immutable reviewed head. Without the
      // latter, the next pass cannot be an evidence-bounded re-review.
      hasReviewEvidence,
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
    // `hasReviewEvidence` is the SAME function `agentRetry` was given above: a contentless or
    // unanchored return is retried once like any other dead step, then lands here.
    if (!hasReviewEvidence(review))
      // `acceptedFindings` travels on EVERY terminal arm, this one included. A card whose
      // reviewer dies mid-cycle otherwise reports the by-design and below-floor findings of
      // every earlier round as if none had been raised — and those are precisely the findings
      // the fixer never receives, so they are recoverable from nowhere else. AC4 says an
      // accepted finding always reaches the human; a failure is not an exception to that.
      return { story, prNumber: pr.prNumber, status: 'failed-review', round, acceptedFindings: accepted, reviewLog: cycleHasRemediation ? reviewLog : undefined }
    const reviewedHead = String(review.reviewedHead).toLowerCase()
    const findings = review.findings ?? []
    // Below the floor: still reported, still shown to the human, just not blocking. One
    // partition predicate makes the complement total: an unknown/non-numeric rank blocks
    // rather than disappearing from both the fix set and the merge-gate record.
    const { belowFloor, actionable, carried } = partitionFindings(findings)
    accept(carried)
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
    // A sealed snapshot deliberately freezes its base. If the reviewer identifies a finding
    // whose ONLY remediation is rewriting that base's history, spending the normal one fix
    // round first makes the human's legitimate options narrower. Stop before RED/seal/GREEN;
    // this exceptional route is typed, while all other human decisions retain the measured
    // one-round behavior below.
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
    prevReviewedHead = reviewedHead
    cycleHasRemediation = true
    const redTest = await authorRedTests(prevFindings, `r${round}`, reviewedHead)
    if (!hasRedTestEvidence(redTest))
      return { story, prNumber: pr.prNumber, status: 'failed-fix', findings: prevFindings, acceptedFindings: accepted, reviewLog }
    const redSnapshot = await sealRedSnapshot(redTest, `r${round}`, reviewedHead)
    if (!hasSealedRedSnapshot(redSnapshot))
      return { story, prNumber: pr.prNumber, status: 'failed-fix', findings: prevFindings, acceptedFindings: accepted, reviewLog }
    log(`${tag} r${round}: sealed RED snapshot ${redSnapshot.snapshot}`)
    // FIX — implementer resumes checkpoint (if present) + resolves actionable findings.
    // Logs the round to the working review log INSTEAD of posting a per-round PR comment.
    const fix = await agentRetry(
      `Resume story ${tag}. ${wtClause(story)} Read the checkpoint if present (${SK.checkpoint} $mode=resume); otherwise work from the PR diff + code. Resolve EVERY one of these actionable review findings on PR #${pr.prNumber} — including minor/nit, do not defer any: ${JSON.stringify(prevFindings)}. ${sealedRedSnapshot({ prNumber: pr.prNumber, phase: `r${round}`, baseHead: reviewedHead })} Fix them IN PLACE, in this PR: do NOT file a follow-up issue for any of them, do NOT invoke ${SK.writeIssue}, and do NOT leave a "tracked separately" note in lieu of the fix. If a finding turns out to be genuinely larger than this story, still fix what belongs here and say plainly in the working log what remains — the human decides at the merge gate, not a new card. CONVERGENCE SWEEP (mandatory): the finding location is the starting point, not the contract boundary. Before changing code, make a finite map of the same observable contract: the reported case and its paired success/failure path; any state transition or resume path the contract owns; and the canonical source plus every distributed representation of that behavior (generated asset, dataset, installed copy, or documented command). Change every map cell required for that one contract, then stop — do not use the sweep for unrelated cleanup, new behavior, or speculative hardening. For a generated/distributed artifact, resolve the canonical source from the asset registry, edit only that source, then run the declared generator/installer and inspect its output; never hand-edit a derived copy. PROVISIONED ARTIFACT CONTRACT (mandatory when a change installs, builds, publishes, names, or invokes an executable/package): map \`producer -> published identity -> consumer\` — for example installer/release step -> package manifest/bin/file/export -> workflow or user command. Prove the exact path in a clean temporary environment using the real built or installed artifact. Never stub, alias, or fake the exact producer, published identity, or consumer boundary; external effects may be isolated only after that boundary is crossed. Re-run the RED commands discovered in the sealed manifest, the finding's evidence command and the mapped boundary cases before commit. Follow ${SK.implement} for the change itself: its GREEN discipline and adoption-compliance phase are mandatory. Verify with ${SK.verifyQuality} (tier-resolved — do not improvise a gate command), and record any decision a finding forces with ${SK.recordDecision}. Commit and push. Then re-invoke **${SK.publishPr}**: it is create-or-update and idempotent, and re-running it is what keeps the PR body, the classification tags and the \`pr-state:*\` label in sync with the NEW head commit instead of describing the pre-fix state. As in the open-PR step it will emit \`Review: review-dispatch-required\` rather than nesting — expected: this orchestrator drives the re-review. ${TEXT_SHAPE} Re-running it REWRITES the PR body, and this is the only step that does so once a cycle is under way: rewrite it to describe the CURRENT head, do not append a round-by-round history — a body that grows by one section per fix round is re-read in full by every later reviewer of this same cycle. Do NOT post a remediation PR comment; INSTEAD append this round to the working log \`${reviewLog}\` (create it if absent) as a COMPACT TABLE under a \`## Round N\` heading — one row per finding, columns \`severity | location | what changed | commit\`, followed by \`## Evidence ledger, round N\` with one row per empirical/boundary claim: \`claim | oracle | probe | observed\`. Return that same ledger in \`evidenceLedger\`; return \`[]\` only when the fix made no empirical or boundary claim. One row, one line: no paragraph per finding, and do not restate the finding's description (its location identifies it). Add prose ONLY where a fix diverged from the recommendation, and then only the reason. Only for a genuine design disagreement set needsHumanDecision instead of forcing a fix. Do NOT merge.`,
      withModel({ agentType: 'pair-implementer', phase: 'Review', label: `fix:${tag} r${round}`, effort: 'high', schema: FIX_SCHEMA }),
    )
    // failed-fix: the fixer died mid-round; a partial working log may exist. Surface
    // its path in the return so the human / next resume can find (and clean) it.
    // Same rule as `failed-review` above: whatever was accepted before the death still travels.
    if (!fix) return { story, prNumber: pr.prNumber, status: 'failed-fix', acceptedFindings: accepted, reviewLog: cycleHasRemediation ? reviewLog : undefined }
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

    // PRE-FLIGHT — a fresh read-only verifier audits this FIX DELTA before a costly outer
    // re-review. The old loop trusted the fixer to check its own new helper/test/claim, so
    // the outer reviewer became the first person able to notice a dead fixture column or a
    // missing reverse interaction. This pass may repair one such discovery; a second miss
    // fails closed as `failed-preflight`, without spending or inflating an external round.
    const runPreflight = (baseHead, targets, ledgers, redPhase, pass) =>
      agentRetry(
        [FIXTURE_CONSUMPTION_PREFLIGHT,
        `FIX PREFLIGHT (read-only; NOT a PR review) for story ${tag}, PR #${pr.prNumber}, inner pass ${pass}. ${revWtClause(story)} Inspect ONLY the delta \`git diff ${baseHead}...origin/${story.branch} --name-status\`, its directly changed producer/consumer boundaries, and the real tests/probes it adds or changes. Do NOT read ${BLIND_PATHS}, checkpoints or the working log; do NOT edit, commit, push, publish a review, post a PR comment, or merge. The prior findings being remediated are: ${JSON.stringify(targets)}. The structured evidence ledger(s) returned by the fixer are: ${JSON.stringify(ledgers)}. There is intentionally NO RED manifest, test path, digest or snapshot SHA in this prompt. Independently FIND exactly one ancestor commit in \`${baseHead}..HEAD\` with \`${RED_SNAPSHOT_TRAILER}: pr=${pr.prNumber}; phase=${redPhase}; base=${baseHead}; manifest=<path>\` in its commit message, using \`git log\` or \`git rev-list\`. Read the manifest and every recorded test blob FROM that commit using \`git show\`/\`git ls-tree\`, never an orchestrator-provided value. Verify the snapshot's parent is exactly its declared base with \`git rev-parse <snapshot>^\`; use \`git diff-tree --no-commit-id --name-only -r <base> <snapshot>\` to verify it contains only the manifest and the test artifacts listed in that manifest. Compare each listed test path byte-for-byte (Git blob identity) with HEAD: a changed comment, fixture, expectation, missing or removed file, replacement or an added/changed unlisted test artifact is a contract breach. The snapshot missing, ambiguous, malformed, not an ancestor, carrying a mismatched base or containing any other file is also a contract breach. For any breach return \`contractBreach: true\` and \`verified: false\`; it is not eligible for the inner repair. Re-run every stated oracle/probe yourself against this head; an evidence ledger is an input to verify, never proof by assertion. Check that every new fixture field/table column is actually consumed by an expectation (trace it to the assertion), not merely declared; that comments/test names repeat only measured claims; and that every newly introduced parser/state/normalizer rule has the paired order plus the minimal interaction cross-product whenever an output can feed another rule. For a derived predicate/event, trace every branch that mutates its declared source-of-truth state: it must be emitted from that transition or prove the exact same decision table, never substitute a laziness/eligibility helper for a block/state boundary. For any defect, return a normal finding with its concrete failure case and a recommendation ending \`VERIFY: <input/state -> expected>; ORACLE: <command/fixture>; ASSERT: <observable assertion>\`. Return \`verified: true\` only when there are zero blocking findings under the configured severity floor (${SEVERITY_FLOOR?.name ?? 'none — every actionable finding blocks'}); otherwise return \`verified: false\`. Return the exact lower-case 40-character \`reviewedHead\` from \`git rev-parse origin/${story.branch}\`.`,
        ].join('\n'),
        withModel({ agentType: 'pair-fix-verifier', phase: 'Preflight', label: `preflight:${tag} r${round} p${pass}`, effort: 'medium', schema: PREFLIGHT_SCHEMA }),
        hasPreflightEvidence,
      )
    const preflight = await runPreflight(reviewedHead, prevFindings, [fix.evidenceLedger], `r${round}`, 0)
    if (!hasPreflightEvidence(preflight))
      return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: prevFindings, acceptedFindings: accepted, reviewLog }
    if (preflight.contractBreach === true)
      return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: preflight.findings, acceptedFindings: accepted, reviewLog }
    const firstPreflight = partitionFindings(preflight.findings)
    accept(firstPreflight.carried)
    if (preflight.verified !== (firstPreflight.actionable.length === 0))
      return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: preflight.findings, acceptedFindings: accepted, reviewLog }
    if (firstPreflight.belowFloor.length)
      log(`${tag} r${round} preflight: ${firstPreflight.belowFloor.length} finding(s) below the ${SEVERITY_FLOOR.name} floor carried to the gate, ${firstPreflight.actionable.length} blocking`)
    if (firstPreflight.actionable.length) {
      // One and only one inner repair: the normal reviewer remains the authority on whether
      // the whole PR converged. This only prevents obvious new fix-code mistakes from being
      // discovered for the first time in the next external review.
      prevFindings = [...prevFindings, ...firstPreflight.actionable]
      const preflightRedTest = await authorRedTests(prevFindings, `r${round} p1`, preflight.reviewedHead)
      if (!hasRedTestEvidence(preflightRedTest))
        return { story, prNumber: pr.prNumber, status: 'failed-fix', findings: prevFindings, acceptedFindings: accepted, reviewLog }
      const preflightRedSnapshot = await sealRedSnapshot(preflightRedTest, `r${round} p1`, preflight.reviewedHead)
      if (!hasSealedRedSnapshot(preflightRedSnapshot))
        return { story, prNumber: pr.prNumber, status: 'failed-fix', findings: prevFindings, acceptedFindings: accepted, reviewLog }
      log(`${tag} r${round} p1: sealed RED snapshot ${preflightRedSnapshot.snapshot}`)
      const preflightFix = await agentRetry(
        `Resume story ${tag}. ${wtClause(story)} Fix these preflight findings before any external re-review: ${JSON.stringify(prevFindings)}. ${sealedRedSnapshot({ prNumber: pr.prNumber, phase: `r${round} p1`, baseHead: preflight.reviewedHead })} This is the one bounded inner repair, not a redesign. Change the canonical source only; prove both direction/order rows of every newly combined parser, state or normalization rule and trace every fixture value to its consuming assertion. Re-run every supplied VERIFY/ORACLE/ASSERT, every RED command discovered in the sealed manifest and every ledger probe. Follow ${SK.implement}, ${SK.verifyQuality}, and ${SK.recordDecision} where applicable. Commit, push, then re-invoke ${SK.publishPr} to update the current PR head. Do NOT file a card, post a remediation comment, or merge. Append a compact \`## Round ${round} / preflight 1\` table plus \`## Evidence ledger, round ${round} / preflight 1\` (\`claim | oracle | probe | observed\`) to \`${reviewLog}\`. Return the ledger in \`evidenceLedger\`; return \`[]\` only when no empirical/boundary claim changed.`,
        withModel({ agentType: 'pair-implementer', phase: 'Review', label: `fix:${tag} r${round} p1`, effort: 'high', schema: FIX_SCHEMA }),
      )
      if (!preflightFix)
        return { story, prNumber: pr.prNumber, status: 'failed-fix', acceptedFindings: accepted, reviewLog }
      if (preflightFix.needsHumanDecision)
        return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: prevFindings, acceptedFindings: accepted, reviewLog }
      const finalPreflight = await runPreflight(preflight.reviewedHead, firstPreflight.actionable, [fix.evidenceLedger, preflightFix.evidenceLedger], `r${round} p1`, 1)
      if (!hasPreflightEvidence(finalPreflight))
        return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: prevFindings, acceptedFindings: accepted, reviewLog }
      if (finalPreflight.contractBreach === true)
        return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: finalPreflight.findings, acceptedFindings: accepted, reviewLog }
      const finalPreflightPartition = partitionFindings(finalPreflight.findings)
      accept(finalPreflightPartition.carried)
      if (finalPreflight.verified !== (finalPreflightPartition.actionable.length === 0))
        return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: finalPreflight.findings, acceptedFindings: accepted, reviewLog }
      if (finalPreflightPartition.actionable.length) {
        await agent(
          `Story ${tag}: PRE-FLIGHT STOP. ${wtClause(story)} Append \`## Preflight stop r${round}\` to \`${reviewLog}\`: one compact row per still-open finding (${JSON.stringify(finalPreflightPartition.actionable)}), including its VERIFY/ORACLE/ASSERT. Do NOT change code, commit, push, post a PR comment, create a card, or merge.`,
          { agentType: 'pair-implementer', phase: 'Review', label: `preflight-log:${tag} r${round}`, model: 'sonnet', effort: 'low' },
        )
        return { story, prNumber: pr.prNumber, status: 'failed-preflight', findings: finalPreflightPartition.actionable, acceptedFindings: accepted, reviewLog }
      }
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
//
// COUNTING ROWS IS NOT COUNTING PROGRESS. Branching on `batch.length` alone left the
// failure arm unreachable for the shape that actually happens: `driveStory` returns an
// HONEST `{status: 'failed-implement'}` row when its agents die, so `batch.length ===
// STORIES.length` and a batch where EVERY card failed was reported as "2/2 stories
// returned a result. PRs are ready-for-merge or escalated" — no PR existed and nothing
// was mergeable. `batch.length` only drops when the THUNK itself returns null (a stall
// before `driveStory` could return), which is the rarer half. So the sentence is derived
// from the STATUSES: a card ADVANCED only if it reached a PR the human can act on
// (`ready-for-merge` or `escalate`); everything else is named by the status it carries.
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
  // Contract provenance per template — `fallback-loose` is the logged signal
  // that a contract could not be derived and the loose skeleton was used (AC4).
  contracts: contracts.map(({ name, status }) => ({ name, status })),
  batch,
  // Stories that never returned anything, named so a failed run is actionable
  // rather than merely empty.
  died: STORIES.filter((s) => !batch.some((b) => b.story?.id === s.id)).map((s) => s.id),
  note,
}
