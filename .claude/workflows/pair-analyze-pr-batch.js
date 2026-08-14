export const meta = {
  // Prefixed like every other pair artifact: the registry keys a workflow by `meta.name`, so an
  // unprefixed name would shadow — or be shadowed by — a workflow of the same name elsewhere.
  name: 'pair-analyze-pr-batch',
  description:
    'Produce an evidence-based analysis of each open PR and persist it under .pair/working/pr-analyses/, stamped with the head SHA it describes.',
  // NOTE: `meta` must be a PURE LITERAL — the loader parses it statically and rejects any
  // expression node. Keep every value a single literal, however long the line gets.
  whenToUse:
    'PREREQUISITE: this workflow dispatches every agent to the **/analyze-pr** skill, which is a PERSONAL, user-level skill — it is installed in neither this repo\'s `.claude/skills/` nor the shipped pair dataset. Without it the agents have nothing to follow: they fabricate the six sections or die, while the run still reports the paths it wrote. Install /analyze-pr at user level before running this. That prerequisite is also why this workflow is deliberately NOT shipped to adopters (see the exclusion note in `packages/knowledge-hub/src/tools/workflow-mirror.test.ts`). REQUIRED args shape: {"prs":[{"number":424,"branch":"feature/US-400-smoke-in-ci","story":"400"}]}. Optional per PR: model; optional per run: model. Every value is validated by TYPE and by CONTENT at parse time and a wrong one throws before any agent runs — number is a positive integer, branch a git ref, story a safe path segment — because they reach the shell commands a general-purpose (unrestricted-tools) agent runs; a value carrying shell syntax or `..` is rejected, never quoted. An unset optional key may be omitted or spelled `undefined`/`null`; an EMPTY string is not one of them and throws. Run this on STABLE heads — after the implement/review batch has finished, not while it is still pushing fix commits, or every analysis describes a head that no longer exists. Read-only: it runs git diff / gh / shasum and writes ONLY under .pair/working/pr-analyses/. Safe to run against a repo whose worktrees are idle.',
  phases: [{ title: 'Analyze' }, { title: 'Freshness' }],
}

// ── Why the head SHA is stamped, and why a second agent re-checks it ───────
// An analysis whose counts come from a real diff is only true of ONE commit. If the PR
// moves while the analysis is being written — a fix round pushing, a rebase — the file
// keeps describing a head that no longer exists, and nothing in it says so. Every
// analysis therefore records the SHA it was computed from, and a second, cheap agent
// re-reads the PR afterwards and compares. A stale analysis is reported as stale, never
// silently served as current. This is the same invariant as #403's, applied to a
// derived artifact instead of a tracker write: what was produced is re-read, not assumed.

// ═══════════════════════════════════════════════════════════════════════════
// INPUT  args = {
//   prs: [{
//     number,                     // required — a POSITIVE integer (a string or `#`-prefixed
//                                 // string is accepted and normalized); it names the PR
//     branch,                     // required — a git ref; it lands on `git fetch origin <branch>`
//     story?,                     // the issue ref this PR delivers; one safe path segment
//     model?,                     // fable | haiku | sonnet | opus — routes the ANALYSIS stage
//   }],
//   model?,                       // the same set, as the batch-level default
// }
//
// Every value here is validated by TYPE and by CONTENT, on the same rules and with the same
// predicates as `pair-implement-batch.js` / `pair-refine-batch.js` — held in agreement by the
// engine differential in `pair-refine-batch.test.mjs`. The reason is stronger here than on
// either sibling: these prompts go to `general-purpose`, a host built-in whose tool set the
// shipped docs page itself calls UNRESTRICTED, and `branch` reaches it inside `git fetch origin
// <branch>` and `git rev-parse origin/<branch>`. A value carrying shell syntax or a path escape
// is REJECTED, never quoted: an escaped value still RUNS, and the caller who typed something
// that was never a branch never learns it.
//
// PRESENT-BUT-EMPTY IS AN ERROR, at every level, and an UNSET optional key has ONE spelling:
// omit it, or pass `undefined`/`null`. Same contract as both siblings.
// ═══════════════════════════════════════════════════════════════════════════

// Every caller-facing object validates its key SET, not just the keys it recognises. Duplicated
// verbatim from the two sibling engines (same convention as `constrain`): these files are
// sandbox scripts with NO imports, so a shared helper is not reachable — keep the copies
// together, and change them together. Neither level had this check: `{"branch":"main",
// "bogusKey":1}` was accepted and dropped in silence, and a top-level `maxParallelism: 2` ran
// the batch with no error and no effect while both siblings throw on the identical typo.
function rejectUnknownKeys(obj, allowed, where) {
  for (const k of Object.keys(obj ?? {}))
    if (!allowed.includes(k))
      throw new Error(
        `analyze-pr-batch: unknown \`${where}.${k}\`; expected one of ${allowed.join(', ')}. ` +
          `An unrecognised key would be dropped in silence and the run would use the default ` +
          `while the caller believed otherwise.`,
      )
}

// ── The value predicates ───────────────────────────────────────────────────
// Same rules, same spelling, as the two sibling engines — the differential drives all three
// copies over one fixture set and requires the same accept/reject verdict from each.
// Git ref charset. Never a leading `-` (the shell reads it as a flag) and never `..`
// (a traversal in a path position, and illegal in a ref anyway).
const isRef = v => /^[A-Za-z0-9._][A-Za-z0-9._/#-]*$/.test(v) && !v.includes('..')
// Must START alphanumeric, not merely be built from safe characters. `-rf` is read by the
// shell as a FLAG rather than as the argument it sits in, and `.` / `..` name a directory
// instead of a card.
const isSegment = v => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v) && !v.includes('..')
// A STRICTLY POSITIVE integer: there is no PR #0 and no PR #-5. Same predicate name and rule
// as the sibling engine's, where `Number.isInteger` alone let `prNumber: 0` report an unbuilt
// story as review-approved.
const isPosInt = v => typeof v === 'number' && Number.isInteger(v) && v >= 1

let batchModel
function parseArgs(raw) {
  let a = raw
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a.trim())
    } catch {
      throw new Error(
        `analyze-pr-batch: \`args\` is a string that is not JSON: ${JSON.stringify(String(raw).slice(0, 60))}. ` +
          `Pass, verbatim: {"prs":[{"number":424,"branch":"feature/US-400-smoke-in-ci","story":"400"}]}.`,
      )
    }
  }
  if (Array.isArray(a)) a = { prs: a }
  if (!a || typeof a !== 'object' || !Array.isArray(a.prs))
    throw new Error(
      `analyze-pr-batch: \`args\` must be { prs: [...] } (or a bare array). Received: ` +
        `${a === undefined || a === null ? String(a) : JSON.stringify(a).slice(0, 80)}. ` +
        `Nothing was run — this is an input error, not an empty batch.`,
    )
  rejectUnknownKeys(a, ['prs', 'model'], 'args')
  // Validated against the known set: an unrecognised model name would otherwise be
  // ignored in silence, and a run on the wrong tier is indistinguishable from a run on
  // the intended one.
  const MODELS = ['fable', 'haiku', 'sonnet', 'opus']
  const checkModel = (m, where) => {
    // Reject the TYPE before coercing it, exactly as `constrain` does for the string fields. The
    // whitelist below bounds the damage today (`['opus']` joined to "opus" and was accepted),
    // but coerce-then-whitelist is the pattern the next field added here would inherit with no
    // whitelist to save it — and it makes "every caller value is type-checked" read true when
    // it is not.
    if (m !== undefined && m !== null && typeof m !== 'string')
      throw new Error(`analyze-pr-batch: ${where} has model of type ${Array.isArray(m) ? 'array' : typeof m}, which is not a string. Pass one of ${MODELS.join(' | ')}, or omit the key.`)
    // PRESENT-BUT-EMPTY IS AN ERROR: `model: cfg.model ?? ''` used to be read as ABSENT and the
    // batch ran on the inherited tier while the caller believed they had chosen one.
    if (typeof m === 'string' && !m.trim())
      throw new Error(
        `analyze-pr-batch: ${where} has model empty — omit the key entirely (or pass \`null\`/\`undefined\`) to mean "not set". ` +
          `An empty string is a value the caller wrote, and reading it as absent would run the batch on a tier nobody chose.`,
      )
    const v = String(m ?? '').trim()
    if (!v) return undefined
    if (!MODELS.includes(v))
      throw new Error(`analyze-pr-batch: ${where} has unknown model ${JSON.stringify(v)}; expected one of ${MODELS.join(' | ')}.`)
    return v
  }
  batchModel = checkModel(a.model, '`args.model`')
  const seenNumbers = new Map()
  return a.prs.map((p, i) => {
    if (!p || typeof p !== 'object' || Array.isArray(p))
      throw new Error(`analyze-pr-batch: prs[${i}] is not an object: ${JSON.stringify(p)}.`)
    rejectUnknownKeys(p, ['number', 'branch', 'story', 'model'], `prs[${i}]`)
    // A number is lossless and unambiguous for a PR ref, and `"#424"` is what a hand-written
    // arg looks like — both are coerced deliberately. Anything else is not: `number: ['424']`
    // survived `String()` as "424" and named a PR the caller never wrote. Same rule as the two
    // sibling engines apply to `id`.
    if (p.number !== undefined && p.number !== null && typeof p.number !== 'string' && typeof p.number !== 'number')
      throw new Error(
        `analyze-pr-batch: prs[${i}] has number of type ${Array.isArray(p.number) ? 'array' : typeof p.number}, which is not a string or a number. ` +
          `It would be COERCED (an array joins on commas, a boolean becomes "true") and could then name a PR the caller never wrote. ` +
          `Pass the PR number as a string or a number.`,
      )
    const number = Number(String(p.number ?? '').trim().replace(/^#/, ''))
    if (!isPosInt(number))
      throw new Error(`analyze-pr-batch: prs[${i}] has no usable PR number: ${JSON.stringify(p.number)} — it must be a positive integer (>= 1).`)
    // Presence is not validity. Every field below is interpolated VERBATIM into the prompt of a
    // `general-purpose` agent — the WIDEST tool grant of the three engines, `Bash` included —
    // and `branch` lands inside `git fetch origin <branch>` / `git rev-parse origin/<branch>`,
    // which the agent then runs. Measured before this guard existed:
    // `branch: 'main; gh pr merge 432 --admin'` was accepted and BOTH dispatched prompts carried
    // the merge command, with the flag that bypasses branch protection. The file sanitized
    // `branch` for the output FILENAME below and not for the command line.
    const constrain = (value, key, ok, what) => {
      // Reject a present-but-non-string value BEFORE coercing it. `String(value ?? '')` first
      // meant `story: {a:1}` reached the prompt as `[object Object]` and `story: ['a','b']` as
      // `a,b` — the coerce-instead-of-reject direction this file rejects everywhere else.
      if (value !== undefined && value !== null && typeof value !== 'string')
        throw new Error(
          `analyze-pr-batch: prs[${i}] (#${number}) has ${key} of type ${Array.isArray(value) ? 'array' : typeof value}, which is not a string. ` +
            `A non-string would be COERCED into the prompt (an object becomes "[object Object]", an array joins on commas) ` +
            `as if the caller had typed it. Pass a string, or omit the key.`,
        )
      const v = String(value ?? '').trim()
      // PRESENT-BUT-EMPTY IS AN ERROR, at every level — same rule as both siblings.
      if (value !== undefined && value !== null && !v)
        throw new Error(
          `analyze-pr-batch: prs[${i}] (#${number}) has ${key} empty — omit the key entirely (or pass \`null\`/\`undefined\`) to mean "not set". ` +
            `An empty string is a value the caller wrote, and reading it as absent would drive the card on a setting nobody chose.`,
        )
      if (!v) return // absent (undefined/null) — handled above when required, omitted when optional
      if (!ok(v))
        throw new Error(
          `analyze-pr-batch: prs[${i}] (#${number}) has ${key} ${JSON.stringify(v)}, which is not ${what}. ` +
            `Card fields are interpolated verbatim into the shell commands the agents run, so a value carrying ` +
            `shell syntax or a path escape would EXECUTE rather than name a ${key}. Rejected, never quoted.`,
        )
    }
    const branch = String(p.branch ?? '').trim()
    if (!branch)
      throw new Error(
        `analyze-pr-batch: prs[${i}] (#${number}) is missing branch — the analysis diffs \`origin/main...origin/<branch>\` ` +
          `and this sandbox has no gh access to derive it.`,
      )
    constrain(p.branch, 'branch', isRef, 'a valid git ref')
    constrain(p.story, 'story', isSegment, 'a single safe path segment (it is an issue ref)')
    // Two entries for the same PR write the SAME output path, so one analysis clobbers the
    // other in silence; and `failed` is computed by number match, so a twin that died reads as
    // having returned because its surviving sibling answers for it. Both siblings reject a
    // duplicate id for exactly that second reason.
    if (seenNumbers.has(number))
      throw new Error(
        `analyze-pr-batch: prs[${seenNumbers.get(number)}] and prs[${i}] both carry PR #${number}. ` +
          `One PR is one analysis and one output file — two entries sharing a number would write the same ` +
          `path twice and lose one of them. Pass each PR once.`,
      )
    seenNumbers.set(number, i)
    return { ...p, number, branch, model: checkModel(p.model, `prs[${i}] (#${number})`) }
  })
}
const PRS = parseArgs(args)
const OUT_DIR = '.pair/working/pr-analyses'

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    number: { type: 'number' },
    path: { type: 'string' }, // where the analysis was written
    headSha: { type: 'string' }, // the commit the counts describe
    filesChanged: { type: 'number' },
    testsAdded: { type: 'number' },
    contexts: { type: 'array', items: { type: 'string' } }, // bounded contexts touched
    verdictRisk: { type: 'string' }, // anything the analysis surfaced that a merger should see first
    note: { type: 'string' },
  },
  required: ['number', 'path'],
}
const FRESHNESS_SCHEMA = {
  type: 'object',
  properties: {
    number: { type: 'number' },
    fresh: { type: 'boolean' }, // stamped SHA still equals the PR's current head
    stampedSha: { type: 'string' },
    currentSha: { type: 'string' },
    sectionsPresent: { type: 'number' }, // of the skill's six
    note: { type: 'string' },
  },
  required: ['number', 'fresh'],
}

// The analysis is a READ of the PR, so it must not perturb what it reads: no branch
// switch in the main checkout (worktrees hold those branches), no writes outside the
// output directory. `git diff origin/main...origin/<branch>` needs no checkout at all.
const SAFETY = `SAFETY (mandatory, read-only): do NOT switch the main checkout's branch, do NOT create/remove worktrees, do NOT commit, push or modify ANY tracked file. The analysis diffs \`origin/main...origin/<branch>\` which needs no checkout. The ONLY file you may write is your output under \`${OUT_DIR}/\`. Other agents may hold these branches in sibling worktrees.`

const results = await pipeline(
  PRS,
  (pr) =>
    agent(
      `Analyze pull request #${pr.number} (branch \`${pr.branch}\`${pr.story ? `, story #${pr.story}` : ''}) by invoking the **/analyze-pr** skill with $PR=${pr.number}. ${SAFETY} Follow that skill exactly — every count must come from the real \`git\`/\`gh\` commands it prescribes, never an estimate, and where a fact cannot be derived say so instead of guessing. Run \`git fetch origin ${pr.branch}\` first, and capture the head SHA you analysed with \`git rev-parse origin/${pr.branch}\` BEFORE you start counting. Write the skill's six sections to \`${OUT_DIR}/PR-${pr.number}-${pr.branch.replace(/[^A-Za-z0-9._-]/g, '-')}.md\`, creating the directory if needed. Begin the file with a short front-matter block giving: PR number, branch${pr.story ? ', story' : ''}, the head SHA you analysed, and the diff base (\`origin/main\`, three-dot). That stamp is what lets a later reader tell whether the analysis still describes the PR. Return the path, the head SHA, and — in \`verdictRisk\` — the ONE thing a person about to merge this PR should see first (a red check, a finding the PR does not address, a surprising blast radius); write \`none\` if the analysis surfaced nothing of the kind.`,
      // `args.model` routes the ANALYSIS stage. The freshness check below stays pinned to
      // sonnet/low: it exists to be reliable, and what counts as 'still current' must not
      // shift with the tier chosen for the analysis itself.
      { agentType: 'general-purpose', phase: 'Analyze', label: `analyze:PR#${pr.number}`, effort: 'medium', schema: ANALYSIS_SCHEMA, ...(pr.model || batchModel ? { model: pr.model || batchModel } : {}) },
    ),
  async (wrote, pr) => ({
    pr,
    wrote,
    check: await agent(
      `Check the freshness of the PR analysis at \`${wrote?.path ?? `${OUT_DIR}/PR-${pr.number}-*.md`}\`. ${SAFETY} Read the file's front-matter stamp to get \`stampedSha\`, then run \`git fetch origin ${pr.branch} -q\` and \`git rev-parse origin/${pr.branch}\` to get \`currentSha\`. Report \`fresh\` = true ONLY if the two SHAs are equal — if the PR moved while the analysis was being written, the file describes a commit that is no longer the head and must be reported stale, not passed off as current. Also report \`sectionsPresent\`: how many of the analyse-pr skill's SIX required sections the file actually contains. Do NOT edit or regenerate the file; just report.`,
      { agentType: 'general-purpose', phase: 'Freshness', label: `fresh:PR#${pr.number}`, model: 'sonnet', effort: 'low', schema: FRESHNESS_SCHEMA },
    ),
  }),
)

const rows = results.filter(Boolean)
return {
  analyses: rows.map((r) => ({
    pr: r.pr.number,
    story: r.pr.story,
    path: r.wrote?.path,
    headSha: r.check?.stampedSha ?? r.wrote?.headSha,
    fresh: r.check?.fresh === true,
    sections: r.check?.sectionsPresent,
    verdictRisk: r.wrote?.verdictRisk,
  })),
  // Called out separately so a stale artifact is never read as a current one.
  stale: rows.filter((r) => r.check?.fresh !== true).map((r) => ({ pr: r.pr.number, stamped: r.check?.stampedSha, current: r.check?.currentSha })),
  incomplete: rows.filter((r) => (r.check?.sectionsPresent ?? 0) < 6).map((r) => ({ pr: r.pr.number, sections: r.check?.sectionsPresent })),
  failed: PRS.filter((p) => !rows.some((r) => r.pr.number === p.number)).map((p) => p.number),
  outputDir: OUT_DIR,
}
