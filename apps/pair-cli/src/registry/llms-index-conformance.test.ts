import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { fileSystemService } from '@pair/content-ops'
import { generateLlmsTxt } from './llms-generation'

// What this file guards, since #416: the generator's OUTPUT SHAPE against the real
// repo tree — the sections an adopter's index must carry. It no longer asserts the
// committed `.pair/llms.txt` equals that output.
//
// That byte-for-byte equality moved, whole, to the named gate
// `packages/dev-tools/src/quality-gates/llms-txt-drift-check.ts` (`pnpm
// llms-index:check`, wired into `ci.yml` and the root `quality-gate`). It landed
// here first, in #216/PR #443, as the fastest way to pin a real miss
// (`story-local-markers.md`, in the KB tree and absent from the index on both the
// branch and `main`); #416 owns the coverage properly and the story says REPLACE
// this, do not duplicate it. Two byte-equality guards over one file is the "two
// definitions that drift apart" smell the story exists to remove — and the vitest
// experience here was the one AC2 rejects by name: a raw string diff over a
// 400-line file, with no missing/extra list and no regeneration command.
//
// These cases stay because they are NOT drift assertions. They say what the
// generator must index for any tree of this layout, so a regression in
// `sectionDefs` fails loudly instead of being frozen as "conformant" by whatever
// bytes happen to be committed — the exact trap the byte-equality guard set when it
// pinned an output that carried no Adoption sections at all.

const REPO_ROOT = join(__dirname, '../../../..')

describe('generateLlmsTxt over the real repo tree — the sections the index must carry', () => {
  // The generator scanned `.pair/product/adopted` / `.pair/tech/adopted` —
  // directories no shipped dataset ever created — so the index every agent reads
  // to find project context carried NO Adoption sections at all: an adopting
  // project ran `pair install` and got an llms.txt missing its own PRD,
  // architecture and tech-stack, the highest-value entries in the file, with
  // nothing reporting it. Byte equality above pins whatever the generator emits,
  // so without this case the wrong output would be asserted correct.
  it('indexes the project adoption files from the real layout', async () => {
    const generated = await generateLlmsTxt(fileSystemService, REPO_ROOT)

    expect(generated).toContain('## Adoption — Product')
    expect(generated).toContain('## Adoption — Tech')
    expect(generated).toContain('(.pair/adoption/tech/tech-stack.md)')
    expect(generated).toContain('(.pair/adoption/tech/architecture.md)')
    expect(generated).toContain('(.pair/adoption/product/PRD.md)')
    expect(generated).not.toMatch(/\.pair\/(product|tech)\/adopted/)
  })

  // 50 ADL / analysis entries live in `.pair/adoption/decision-log/` and were
  // reachable from no section, while `adoption/tech/adr/**` was indexed — so the
  // index presented this project's decision record as ADR-only. Concrete failure:
  // an agent reads `.pair/llms.txt` (the index this story exists to repair) looking
  // for why eligibility is one literal label, and neither
  // `2026-08-20-eligibility-is-one-literal-label-until-the-filter-widens.md` nor
  // `2026-08-20-eligibility-schema-lives-in-collaboration-automation.md` is listed.
  it('indexes the decision log, not just the ADRs', async () => {
    const generated = await generateLlmsTxt(fileSystemService, REPO_ROOT)

    expect(generated).toContain('## Adoption — Decisions')
    expect(generated).toContain(
      '(.pair/adoption/decision-log/2026-08-20-eligibility-is-one-literal-label-until-the-filter-widens.md)',
    )
  })

  it('indexes the automation policy shipped by #216', async () => {
    const generated = await generateLlmsTxt(fileSystemService, REPO_ROOT)

    expect(generated).toContain(
      '(.pair/knowledge/guidelines/collaboration/automation/automation-policy.md)',
    )
  })
})
