#!/usr/bin/env node
import { bindHosts } from './host/index.mjs'
import { prereqState } from './cycle-state.mjs'

const [, , action, card] = process.argv
try {
  const host = bindHosts({ from: process.cwd() })
  let result
  if (action === 'prerequisites') {
    const data = prereqState({ story: card, host })
    if (data.blocked && data.prerequisites.length === 0) throw new Error(data.blockedBy?.reason ?? 'prerequisites unreadable')
    result = data.prerequisites.filter(p => p.state !== 'merged').map(p => String(p.id))
  } else {
    const { code } = host
    if (typeof code.workflowPr !== 'function') throw new Error('code host cannot resolve workflow PRs')
    const pr = code.workflowPr({ id: card })
    const sha = code.prHead({ pr })
    if (action === 'head') result = sha
    else if (action === 'ci') {
      const checks = code.readCiChecks({ sha, pr }).filter(c => !['pair-review', 'pair-explicit-approval'].includes(c.name))
      result = checks.some(c => c.conclusion === 'failure') ? 'red'
        : checks.length === 0 || checks.some(c => c.conclusion !== 'success') ? 'pending' : 'green'
    } else if (action === 'review') {
      result = (code.readCheckRun({ sha, context: 'pair-review' }) ?? code.readCheck({ sha, context: 'pair-review' })) === 'success'
    } else throw new Error('unknown workflow fact')
  }
  console.log(JSON.stringify(result))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
