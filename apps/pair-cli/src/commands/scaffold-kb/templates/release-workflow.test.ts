import { describe, it, expect } from 'vitest'
import { renderReleaseWorkflow } from './release-workflow'

const identity = { name: 'acme-kb', slug: 'acme-kb', skillPrefix: 'acme-kb' }

describe('renderReleaseWorkflow', () => {
  const workflow = renderReleaseWorkflow({ identity })

  it('triggers on version tags', () => {
    expect(workflow).toContain('on:')
    expect(workflow).toContain("      - 'v*'")
  })

  it('runs the generated release script so script and workflow never diverge', () => {
    expect(workflow).toContain('bash scripts/release.sh')
  })

  it('grants the token and permission needed to create the release', () => {
    expect(workflow).toContain('contents: write')
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}')
  })

  it('reuses the tag as the released version', () => {
    expect(workflow).toContain('${GITHUB_REF_NAME#v}')
  })
})
