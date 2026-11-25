import { createHash } from 'node:crypto'
import { join } from 'node:path'
import {
  writeAtomic,
  fromReview,
  type Answer,
  type RunDirectory,
  type StepLaunch,
  type StepResult,
} from '@pair/workflows'

import type { WorkflowFlagAnswer } from './parser'

export interface ApprovalTarget {
  readonly pr: number
  readonly head: string
}
type TargetMismatch = { readonly reason: 'head-moved' | 'pr-changed' }
interface Park extends ApprovalTarget {
  readonly since: string
  readonly notified: boolean
}

export interface ApprovalPlatform {
  target(card: string): Promise<ApprovalTarget>
  notice(card: string, marker: string, body: string): Promise<void>
  answers(
    card: string,
    target: Park,
    flag?: WorkflowFlagAnswer,
  ): Promise<readonly Answer[] | TargetMismatch>
}

function parkKey(run: RunDirectory, step: StepLaunch, target: ApprovalTarget): string {
  const identity = [run.dir, step.id, step.round, target]
  if (step.replayAttempt !== undefined) identity.push(step.replayAttempt)
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex')
}

function approvalMismatch(step: StepLaunch, live: ApprovalTarget): StepResult | undefined {
  const pr = step.inputs['pr']
  if (pr !== undefined && pr !== live.pr)
    return {
      status: 'failed',
      summary: 'Approval PR no longer matches the linked PR',
      reason: 'pr-changed',
    }
  if (
    [step.inputs['reviewedHead'], step.inputs['gatedHead']].some(
      head => head !== undefined && head !== live.head,
    )
  )
    return {
      status: 'failed',
      summary: 'Review or gate covered an earlier head',
      reason: 'head-moved',
    }
  return undefined
}

export function approvalRunner(
  run: RunDirectory,
  platform: ApprovalPlatform,
  flag?: { step: string; answer: WorkflowFlagAnswer },
) {
  return async (step: StepLaunch): Promise<StepResult> => {
    const card = String(step.inputs['card'])
    const live = await platform.target(card)
    const moved = approvalMismatch(step, live)
    if (moved) return moved
    const key = parkKey(run, step, live)
    const dir = join(run.dir, 'steps', step.id, 'approval')
    const path = join(dir, key + '.json')
    await run.files.mkdir(dir, { recursive: true })
    const previous = run.files.existsSync(path)
      ? (JSON.parse(run.files.readFileSync(path)) as Park)
      : undefined
    const park = previous ?? { ...live, since: new Date().toISOString(), notified: false }
    if (previous === undefined) await writeAtomic(run.files, path, JSON.stringify(park))
    if (previous !== undefined) {
      const answers = await platform.answers(
        card,
        park,
        flag?.step === step.id ? flag.answer : undefined,
      )
      if ('reason' in answers)
        return {
          status: 'failed',
          reason: answers.reason,
          summary: 'Approval target changed while reading answers',
        }
      if (answers[0]) return answerResult(answers[0], live)
    }
    return notifyParked(run, platform, { card, step, park, key, path })
  }
}

function answerResult(answer: Answer, target: ApprovalTarget): StepResult {
  if (answer.verdict === 'rejected')
    return {
      status: 'failed',
      summary: `Rejected by ${answer.login}`,
      reason: answer.note || 'approval-rejected',
    }
  return {
    status: 'ok',
    summary: `Approved by ${answer.login} via ${answer.channel}`,
    approvedBy: answer.login,
    approvedHead: target.head,
    approvedPr: target.pr,
  }
}

async function notifyParked(
  run: RunDirectory,
  platform: ApprovalPlatform,
  {
    card,
    step,
    park,
    key,
    path,
  }: { card: string; step: StepLaunch; park: Park; key: string; path: string },
): Promise<StepResult> {
  let reason = `PR #${park.pr} at ${park.head}`
  if (!park.notified) {
    try {
      const question = step.with['question'] ?? 'Approve this workflow to continue?'
      await platform.notice(
        card,
        `<!-- pair-workflow-approval:${key}:${park.since} -->`,
        [
          String(question),
          '',
          reason,
          '',
          `Reply with \`/approve #${park.pr} ${park.head}\` or \`/reject #${park.pr} ${park.head} <reason>\`, or submit a native review.`,
          `PR authors with solo approval enabled use \`/approve ${park.head}\`.`,
        ].join('\n'),
      )
      await writeAtomic(run.files, path, JSON.stringify({ ...park, notified: true }))
    } catch (error) {
      reason += `; card comment missing: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  return { status: 'needs-decision', summary: 'Waiting for an authorized approval', reason }
}

type Operation = (name: string, card: string, data?: unknown) => Promise<unknown>

export function approvalPlatform(call: Operation): ApprovalPlatform {
  return {
    target: async card => {
      const target = (await call('approval-target', card)) as ApprovalTarget
      if (!Number.isInteger(target?.pr) || !/^[0-9a-f]{40}$/.test(target?.head))
        throw new Error('unreadable approval target')
      return target
    },
    notice: async (card, marker, body) => {
      const result = await call('approval-notice', card, { marker, body })
      if (result && typeof result === 'object' && 'error' in result)
        throw new Error(String(result.error))
    },
    answers: async (card, park, flag) => {
      const values = await call('approval-answers', card, { ...park, flag })
      if (!Array.isArray(values)) {
        if (
          values &&
          typeof values === 'object' &&
          'reason' in values &&
          (values.reason === 'head-moved' || values.reason === 'pr-changed')
        )
          return { reason: values.reason }
        throw new Error('unreadable approval answers')
      }
      return values
        .map(row => parseAnswer(row, park))
        .filter((answer): answer is Answer => answer !== undefined)
    },
  }
}

function parseAnswer(row: Record<string, unknown>, target: ApprovalTarget): Answer | undefined {
  const { login, channel, verdict, note, body, state } = row
  if (typeof login !== 'string') return undefined
  if (channel === 'flag') return readDecision(channel, login, verdict, note)
  if (channel === 'comment' && row['pr'] === target.pr && row['head'] === target.head)
    return readDecision(channel, login, verdict, note)
  const message = typeof body === 'string' ? body : ''
  if (channel === 'review' && typeof state === 'string') return fromReview(login, state, message)
  return undefined
}

function readDecision(
  channel: 'flag' | 'comment',
  login: string,
  verdict: unknown,
  note: unknown,
): Answer | undefined {
  if (verdict !== 'approved' && verdict !== 'rejected') return undefined
  return { channel, login, verdict, ...(typeof note === 'string' && { note }) }
}
