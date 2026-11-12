import { execFileSync } from 'node:child_process'

export interface CardLabelHost {
  readLabels(card: string): Promise<string[]>
  writeLabels(card: string, labels: string[]): Promise<void>
}

export interface ReconcileResult {
  status: 'confirmed' | 'unconfirmed' | 'skipped'
  reason?: string
  labels?: string[]
}

const RANK = ['risk:green', 'risk:yellow', 'risk:red']
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isRisk = (l: string) => l.startsWith('risk:')

/** Final tier = highest of card's risk labels and the reviewed one (never lowers the floor). */
export async function reconcileCardRiskLabel(input: {
  card: string
  reviewed: string | undefined
  link: 'unique' | 'ambiguous' | 'unavailable'
  projection: boolean
  host: CardLabelHost
}): Promise<ReconcileResult> {
  const { card, reviewed, link, projection, host } = input
  if (!projection || !reviewed) return { status: 'skipped' }
  const fail = (why: string): ReconcileResult => ({
    status: 'unconfirmed',
    reason: `card ${card} propagation unconfirmed: ${why}`,
  })
  if (!RANK.includes(reviewed)) return fail(`unknown reviewed tier ${JSON.stringify(reviewed)}`)
  if (link !== 'unique') return fail(`PR link to the card is ${link}`)
  try {
    const current = await host.readLabels(card)
    const final = [reviewed, ...current.filter(isRisk)].reduce((a, b) =>
      RANK.indexOf(b) > RANK.indexOf(a) ? b : a,
    )
    const risk = current.filter(isRisk)
    if (risk.length === 1 && risk[0] === final) return { status: 'confirmed', labels: current }
    const next = [...current.filter(l => !isRisk(l)), final]
    try {
      await host.writeLabels(card, next)
    } catch (e) {
      return fail(`write refused: ${msg(e)}`)
    }
    return await verify(host, card, final)
  } catch (e) {
    return fail(`read failed: ${msg(e)}`)
  }
}

async function verify(host: CardLabelHost, card: string, final: string): Promise<ReconcileResult> {
  const fail = (why: string): ReconcileResult => ({
    status: 'unconfirmed',
    reason: `card ${card} propagation unconfirmed: ${why}`,
  })
  let back: string[]
  try {
    back = await host.readLabels(card)
  } catch (e) {
    return fail(`read-back failed: ${msg(e)}`)
  }
  const got = back.filter(isRisk)
  if (got.length !== 1 || got[0] !== final) {
    return fail(`read-back shows ${JSON.stringify(got)}, expected ["${final}"] (write dropped)`)
  }
  return { status: 'confirmed', labels: back }
}

type Gh = (args: readonly string[]) => string

/** CardLabelHost over the user's authenticated `gh` (the same tracker access the rest of the run uses). */
export function ghCardLabelHost(
  cwd: string,
  gh: Gh = args =>
    execFileSync('gh', [...args], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }),
): CardLabelHost {
  const read = async (card: string): Promise<string[]> =>
    (JSON.parse(gh(['issue', 'view', card, '--json', 'labels'])).labels ?? []).map(
      (l: { name?: string }) => l.name ?? '',
    )
  return {
    readLabels: read,
    async writeLabels(card, labels) {
      const current = await read(card)
      const add = labels.filter(l => !current.includes(l))
      const remove = current.filter(l => !labels.includes(l))
      if (!add.length && !remove.length) return
      gh([
        'issue',
        'edit',
        card,
        ...(add.length ? ['--add-label', add.join(',')] : []),
        ...(remove.length ? ['--remove-label', remove.join(',')] : []),
      ])
    },
  }
}
