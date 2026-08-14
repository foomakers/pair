export const meta = {
  name: 'analyze-pr-batch',
  description:
    'Produce an evidence-based analysis of each open PR and persist it under .pair/working/pr-analyses/, stamped with the head SHA it describes.',
  // NOTE: `meta` must be a PURE LITERAL — the loader parses it statically and rejects any
  // expression node. Keep every value a single literal, however long the line gets.
  whenToUse:
    'REQUIRED args shape: {"prs":[{"number":424,"branch":"feature/US-400-smoke-in-ci","story":"400"}]}. Run this on STABLE heads — after the implement/review batch has finished, not while it is still pushing fix commits, or every analysis describes a head that no longer exists. Read-only: it runs git diff / gh / shasum and writes ONLY under .pair/working/pr-analyses/. Safe to run against a repo whose worktrees are idle.',
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
  // Validated against the known set: an unrecognised model name would otherwise be
  // ignored in silence, and a run on the wrong tier is indistinguishable from a run on
  // the intended one.
  const MODELS = ['fable', 'haiku', 'sonnet', 'opus']
  const checkModel = (m, where) => {
    const v = String(m ?? '').trim()
    if (!v) return undefined
    if (!MODELS.includes(v))
      throw new Error(`analyze-pr-batch: ${where} has unknown model ${JSON.stringify(v)}; expected one of ${MODELS.join(' | ')}.`)
    return v
  }
  batchModel = checkModel(a.model, '`args.model`')
  return a.prs.map((p, i) => {
    if (!p || typeof p !== 'object' || Array.isArray(p))
      throw new Error(`analyze-pr-batch: prs[${i}] is not an object: ${JSON.stringify(p)}.`)
    const number = Number(String(p.number ?? '').trim().replace(/^#/, ''))
    if (!Number.isInteger(number) || number <= 0)
      throw new Error(`analyze-pr-batch: prs[${i}] has no usable PR number: ${JSON.stringify(p.number)}.`)
    const branch = String(p.branch ?? '').trim()
    if (!branch)
      throw new Error(
        `analyze-pr-batch: prs[${i}] (#${number}) is missing branch — the analysis diffs \`origin/main...origin/<branch>\` ` +
          `and this sandbox has no gh access to derive it.`,
      )
    return { ...p, number, branch }
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
