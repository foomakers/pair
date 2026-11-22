/** Where an answer came from. */
export type Channel = 'flag' | 'comment' | 'review' | 'session'

export interface Answer {
  readonly channel: Channel
  readonly login: string
  readonly verdict: 'approved' | 'rejected'
  readonly note?: string
}

/** `/approve` or `/reject <note>` at the start of a card comment. */
export function parseComment(login: string, body: string): Answer | undefined {
  const line = body.trimStart().split('\n')[0] ?? ''
  const found = /^\/(approve|reject)\b\s*(.*)$/.exec(line.trim())
  if (found === null) return undefined
  const note = found[2]?.trim()
  return {
    channel: 'comment',
    login,
    verdict: found[1] === 'approve' ? 'approved' : 'rejected',
    ...(note && { note }),
  }
}

/** A native PR review: approving is an approval, requesting changes a rejection; others say nothing. */
export function fromReview(login: string, state: string, body = ''): Answer | undefined {
  const verdict = ({ APPROVED: 'approved', CHANGES_REQUESTED: 'rejected' } as const)[
    state as 'APPROVED'
  ]
  const note = body.trim()
  return verdict && { channel: 'review', login, verdict, ...(note && { note }) }
}

export interface Decision {
  readonly answer?: Answer
  /** Answers by logins the platform does not authorize: ignored, reported. */
  readonly ignored: readonly Answer[]
}

/** The first answer whose author the platform authorizes; the others of unauthorized authors are ignored. */
export async function decide(
  answers: readonly Answer[],
  authorized: (login: string) => Promise<boolean>,
): Promise<Decision> {
  const ignored: Answer[] = []
  for (const answer of answers) {
    if (await authorized(answer.login)) return { answer, ignored }
    ignored.push(answer)
  }
  return { ignored }
}
