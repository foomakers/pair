// run-guard.mjs — the fail-closed guard of every cycle script that WRITES to a card for `--story`
// (cycle-prepare escalate|complete, cycle-merge escalate). Kept out of autonomy-policy.mjs, which stays pure.
import { readdirSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { spawnSync } from 'node:child_process'

// Fail-closed guard of every script that WRITES to a card for `--story` (cycle-prepare escalate|complete, cycle-merge
// escalate): the run dir must belong to the story (named for it, or its handoffs carry that story id and none another),
// and the repo the write will land in must be the run's recorded repo when a handoff records one. Throws — the caller exits
// non-zero before any host is bound, so nothing is written.
export function assertRunOwnsStory({ dir, story, repo, cwd = process.cwd() }) {
  const id = String(story)
  const handoffs = []
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json') || f.startsWith('.')) continue
      try {
        const h = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
        if (h && typeof h === 'object') handoffs.push(h)
      } catch {
        /* not a handoff */
      }
    }
  } catch {
    /* no such dir: only its name can vouch for it */
  }
  const stories = handoffs.filter(h => h.story !== undefined).map(h => String(h.story))
  if (stories.some(x => x !== id)) throw new Error(`run dir ${dir} belongs to another story (handoffs carry ${[...new Set(stories)].join(', ')}), not #${id} — nothing written`)
  if (basename(String(dir).replace(/\/+$/, '')) !== id && !stories.includes(id)) throw new Error(`run dir ${dir} does not belong to story #${id} (not named for it, no handoff carries it) — nothing written`)
  const recorded = [...new Set(handoffs.map(h => h.repo).filter(r => typeof r === 'string' && r))]
  if (recorded.length) {
    let effective = repo
    if (!effective) {
      const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8' })
      effective = /[:/]([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(String(r.stdout ?? '').trim())?.[1]
    }
    if (!effective || recorded.some(r => r !== effective)) throw new Error(`the run records repo ${recorded.join(', ')} but the write would land in ${effective ?? 'an unresolvable repo'} (pass --repo) — nothing written`)
  }
}
