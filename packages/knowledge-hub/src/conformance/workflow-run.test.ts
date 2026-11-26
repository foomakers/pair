import { describe, expect, it } from 'vitest'
import { fileSystemService } from '@pair/content-ops'
import { join } from 'path'

const DATASET = join(__dirname, '../../dataset/.skills')
const INSTALLED = join(__dirname, '../../../../.claude/skills')
const SCRIPT = 'scripts/workflow.mjs'
const AUTHOR = 'pair-capability-workflow'
const read = (path: string) => fileSystemService.readFileSync(path)

function instructions(root: string, skill: string) {
  const path = join(root, skill, 'SKILL.md')
  expect(fileSystemService.existsSync(path), `Missing skill instructions at ${path}`).toBe(true)
  return read(path).replace(/[*`]/g, '').replace(/\s+/g, ' ')
}

describe('workflow-run — session driver (#696 T-6)', () => {
  it('has one shared bundle in the authoring skill in both distributions (AC-8 control)', () => {
    const script = read(join(DATASET, 'capability/workflow', SCRIPT))
    expect(read(join(INSTALLED, AUTHOR, SCRIPT))).toBe(script)
  })

  describe.each([
    { label: 'dataset', root: DATASET, run: 'workflow/run', author: 'capability/workflow' },
    {
      label: 'installed',
      root: INSTALLED,
      run: 'pair-workflow-run',
      author: AUTHOR,
    },
  ])('$label', ({ root, run, author }) => {
    it('checks for a subagent primitive before opening and stops with the CLI fallback (AC-3)', () => {
      const skill = instructions(root, run)
      expect(skill).toMatch(
        /\bsubagent\b.{0,120}\bbefore\b.{0,50}\b(?:open\w*|start|resume|leas\w*)/i,
      )
      expect(skill).toMatch(/\b(?:unavailable|missing|without|no)\b.{0,100}\b(?:stop|halt)\b/i)
      expect(skill).toMatch(/\b(?:stop|halt)\b.{0,140}\bpair(?:-cli)? run\b/i)
    })

    it('uses the authoring bundle for the leased run lifecycle (AC-1, AC-8)', () => {
      const skill = instructions(root, run)
      expect(skill).toMatch(new RegExp(`(?:${author}|${AUTHOR})/scripts/workflow\\.mjs`))
      expect(fileSystemService.existsSync(join(root, run, SCRIPT))).toBe(false)
      expect(skill).toMatch(/\bstart\s+<[^>]+>\s+--card\b.{0,120}--engine\b/)
      expect(skill).toMatch(/\bresume\s+<[^>]+>\s+--engine\b/)
      for (const command of ['next', 'record', 'stop']) {
        expect(skill).toMatch(new RegExp(`\\b${command}\\s+<[^>]+>[^.]{0,110}--lease\\b`))
      }
    })

    it('sends the composed message unchanged to an independent subagent or the conversation (AC-1, AC-2)', () => {
      const skill = instructions(root, run)
      expect(skill).toMatch(/\b(?:one|fresh|independent|separate)\b.{0,35}\bsubagent\b/i)
      expect(skill).toMatch(/\bmessage\b.{0,100}\b(?:unchanged|verbatim)\b/i)
      expect(skill).toMatch(
        /\binteractive\b.{0,15}\btrue\b.{0,120}\b(?:conversation|current session)\b/i,
      )
      expect(skill).toMatch(/\brecord\s+<[^>]+>\s+<[^>]+>.{0,150}--attempt\b/)
      expect(skill).toMatch(/\brecord\s+<[^>]+>\s+<[^>]+>.{0,150}--result\b/)
      expect(skill).toMatch(
        /\b(?:result|final (?:response|message))\b.{0,100}\b(?:same|fenced|unchanged)\b/i,
      )
    })

    it('checks engine mismatch before dispatch and announces and records the fallback model (AC-5)', () => {
      const skill = instructions(root, run)
      expect(skill).toMatch(/\bengine\b.{0,140}\bbefore\b.{0,50}\b(?:dispatch|execut\w*|launch)/i)
      expect(skill).toMatch(/\b(?:different|mismatch\w*)\b.{0,150}\bpair(?:-cli)? run\b/i)
      expect(skill).toMatch(/\bsession(?:'s)? model\b/i)
      expect(skill).toMatch(/\b(?:announc\w*|tell|show|report)\b.{0,130}\bmodel\b/i)
      expect(skill).toMatch(/--model\s+<[^>]*actual[^>]*>/)
    })

    it('reports the start summary, two lines per step and the final state with resume details (AC-7)', () => {
      const skill = instructions(root, run)
      expect(skill).toMatch(/\bworkflow\b.{0,35}\bcard\b.{0,35}\bconfiguration\b/i)
      expect(skill).toMatch(/\bstep\w*\b.{0,65}\bskill\b.{0,55}\bmodel\b/i)
      expect(skill).toMatch(/\b(?:one|1) line\b.{0,40}\bstart\b/i)
      expect(skill).toMatch(/\b(?:one|1) line\b.{0,55}\b(?:end|finish\w*|outcome)\b/i)
      expect(skill).toMatch(/\b(?:one[- ]sentence|brief|short) summary\b/i)
      expect(skill).toMatch(/\b(?:final|terminal)\b.{0,20}\b(?:state|status)\b/i)
      expect(skill).toMatch(/\b(?:parked|failed)\b.{0,160}\bresume\b/i)
    })
  })
})
