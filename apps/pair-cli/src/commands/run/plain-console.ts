/**
 * The live terminal shows the card line and short plain notes. The driver's technical lines stay in
 * the audit and under `--verbose`; non-TTY, `--quiet` and `--json` keep every line (machines read them:
 * `DISPATCH-RECORD:`, `PREPARE-RESULT:`, the `--parallel` pool's child output).
 *
 * `plainNote(line)`: `undefined` ⇒ hide, a string ⇒ print that instead. A line it does not know is
 * printed unchanged — an error or a question is never hidden.
 * ponytail: a prefix table over the driver's own wording; typed console events would replace it.
 */
const HIDDEN: readonly RegExp[] = [
  /^pair(-cli)? run( --parallel)?$/,
  /^ {2}(Scope|Requested|Unit|Forwarded to each card|Autonomy|Project trust|Excluded):/,
  /^ {2}(Loop \(|Merge: each card|Started #|Ended #|excluded: |Batch outcome:|Plan:|Effective parallelism:|reason )/,
  /^\d{4}-\d\d-\d\dT\S+Z /,
  /^ {2}(Engine|Profile|Delivery cycle|Scripts|Run dir|Worktree root|Rounds bound|Dispatch ceiling|Dispatch|Policy|Readiness|Fallback|Prepare|Prepared|Idle timeout|Cycle status|Next step|Cards):/,
  /^ {2}(Iteration \d+:|Stopped after|stopped:|claude: the stream carried|translated from )/,
  /^ {2}Merge: (CI pending|merged=)/,
  /^(DISPATCH-RECORD|PREPARE-RESULT):/,
  /^ {2}Autonomy \(argument/,
  /^ {4}\S/,
]

/** An ANSI color sequence, built from the ESC code so no control character sits in a regex literal. */
const COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/** A `--parallel` child's line, as the pool prefixes it (`  [#572] <the child's own line>`). */
const CHILD = /^ {2}\[#([^\]]+)\] (.*)$/

const STAGE =
  /^ {2}Stage (\w+)(?::\S+)? — process \w+, handoff (advanced|NOT advanced)(?:.*?final: (.*)|.*)$/

const WORD: Readonly<Record<string, string>> = {
  implement: 'code',
  verify: 'review',
  prepare: 'tests',
  validate: 'tests',
  green: 'fix',
}

function stageNote(step: string, advanced: boolean, final: string): string | undefined {
  // Not advanced: the next note says what follows (a stop, a recovery, a retry on the card row).
  if (!advanced) return undefined
  if (step === 'verify')
    return /verdict=APPROVED/.test(final) ? '  review: approved' : '  review: changes requested'
  if (step === 'validate')
    return /status=verified/.test(final) ? '  tests: accepted' : '  tests: not accepted, rewriting'
  if (step === 'green') return /status=fixed/.test(final) ? '  fix: done' : '  fix: not done yet'
  if (step === 'implement') return '  code: done, PR opened'
  return undefined
}

/** A driver line that becomes a fixed short note. */
const NOTES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^ {2}Merge gate: RESULT: ALL GATES PASS/, '  checks: passed'],
  [/^ {2}Merge gate: RESULT: BLOCKED/, '  checks: failed, fixing'],
  [/^ {2}Merge: CI failed — re-run/, '  CI: failed, re-running'],
  [/^ {2}Merge: CI still red/, '  CI: still red, fixing'],
  [/^ {2}Recovery: dirty worktree/, '  worktree: cleaned, retrying'],
]

const word = (step: string): string => WORD[step] ?? step

/** A driver line whose note keeps a part of it (the stage, the reason, the audit path). */
const SHAPED: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => string]> = [
  [/^ {2}Stage (\w+)\S* stopped the card: (\S+)/, m => `  ${word(m[1]!)}: stopped (${m[2]})`],
  [/^ {2}Recovery: (\S+) — retrying (\w+)/, m => `  ${word(m[2]!)}: ${m[1]}, retrying`],
  [/^ {2}Audit: (\S+)/, m => `  audit: ${m[1]}`],
]

export function plainNote(line: string): string | undefined {
  const child = CHILD.exec(line.replace(COLOR, ''))
  if (child) {
    const note = plainNote(child[2]!)
    return note === undefined ? undefined : `  #${child[1]} ${note.trim()}`
  }
  const plain = line.replace(COLOR, '')
  const stage = STAGE.exec(plain)
  if (stage) return stageNote(stage[1]!, stage[2] === 'advanced', stage[3] ?? '')
  const fixed = NOTES.find(([re]) => re.test(plain))
  if (fixed) return fixed[1]
  for (const [re, note] of SHAPED) {
    const m = re.exec(plain)
    if (m) return note(m)
  }
  if (HIDDEN.some(re => re.test(plain))) return undefined
  return line
}

/** True when the console should be plain: a live terminal, no `--quiet`/`--json`, no `--verbose`. */
export const plainConsole = (input: {
  readonly isTTY?: boolean | undefined
  readonly output?: string | undefined
  readonly verbose?: boolean | undefined
}): boolean => input.isTTY === true && input.output === undefined && input.verbose !== true
