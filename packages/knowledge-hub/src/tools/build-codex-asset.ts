import { buildKbAsset, type KbAssetSpec } from './build-kb-asset'

/**
 * Builds the shipped Codex fan-out asset out of its single tested source.
 *
 * Same pattern as the coverage ratchet, for the same reason: the deterministic half of a
 * skill's behaviour belongs in a tested module, and it reaches the skill as a generated KB
 * asset rather than as a CLI command — an adopter's `pair install` already installs the KB
 * tree, and the Codex orchestrator invokes the asset with `node`.
 *
 * Output (both copies, kept byte-identical, drift-guarded by
 * conformance/codex-fanout-asset.test.ts):
 *   - packages/knowledge-hub/dataset/.pair/knowledge/assets/codex-fanout.cjs  (shipped corpus)
 *   - .pair/knowledge/assets/codex-fanout.cjs                                 (pair's own installed copy)
 */
export const CODEX_FANOUT_ASSET: KbAssetSpec = {
  source: 'packages/knowledge-hub/src/tools/codex-fanout.ts',
  regenerateScript: 'codex:asset',
  targets: [
    'packages/knowledge-hub/dataset/.pair/knowledge/assets/codex-fanout.cjs',
    '.pair/knowledge/assets/codex-fanout.cjs',
  ],
}

if (require.main === module) buildKbAsset(CODEX_FANOUT_ASSET)
