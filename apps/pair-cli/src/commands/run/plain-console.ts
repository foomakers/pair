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
  /^pair(-cli)? run$/,
  /^ {2}(Engine|Profile|Delivery cycle|Scripts|Run dir|Worktree root|Rounds bound|Dispatch ceiling|Dispatch|Policy|Readiness|Fallback|Prepare|Prepared|Idle timeout|Cycle status|Next step|Cards):/,
  /^ {2}(Iteration \d+:|Stopped after|stopped:|claude: the stream carried|translated from )/,
  /^ {2}Merge: (CI pending|merged=)/,
  /^(DISPATCH-RECORD|PREPARE-RESULT):/,
  /^ {2}Autonomy \(argument/,
  /^ {4}\S/,
]

/** An ANSI color sequence, built from the ESC code so no control character sits in a regex literal. */
const COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

const STAGE =
  /^ {2}Stage (\w+)(?::\S+)? — process \w+, handoff (advanced|NOT advanced).*?final: (.*)$/

const WORD: Readonly<Record<string, string>> = {
  implement: 'code',
  verify: 'review',
  prepare: 'tests',
  validate: 'tests',
  green: 'fix',
}

function stageNote(step: string, advanced: boolean, final: string): string | undefined {
  const word = WORD[step] ?? step
  if (!advanced) return `  ${word}: retrying`
  if (step === 'verify')
    return /verdict=APPROVED/.test(final) ? '  review: approved' : '  review: changes requested'
  if (step === 'validate')
    return /status=verified/.test(final) ? '  tests: accepted' : '  tests: not accepted, rewriting'
  if (step === 'green') return /status=fixed/.test(final) ? '  fix: done' : '  fix: not done yet'
  if (step === 'implement') return '  code: done, PR opened'
  return undefined
}

export function plainNote(line: string): string | undefined {
  const plain = line.replace(COLOR, '')
  const stage = STAGE.exec(plain)
  if (stage) return stageNote(stage[1]!, stage[2] === 'advanced', stage[3]!)
  if (/^ {2}Merge gate: RESULT: ALL GATES PASS/.test(plain)) return '  checks: passed'
  if (/^ {2}Merge gate: RESULT: BLOCKED/.test(plain)) return '  checks: failed, fixing'
  const audit = /^ {2}Audit: (\S+)/.exec(plain)
  if (audit) return `  audit: ${audit[1]}`
  if (HIDDEN.some(re => re.test(plain))) return undefined
  return line
}

/** True when the console should be plain: a live terminal, no `--quiet`/`--json`, no `--verbose`. */
export const plainConsole = (input: {
  readonly isTTY?: boolean | undefined
  readonly output?: string | undefined
  readonly verbose?: boolean | undefined
}): boolean => input.isTTY === true && input.output === undefined && input.verbose !== true
