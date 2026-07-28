/**
 * File templates for the scaffolded KB repo. Each template is a pure render
 * function; the plan (../scaffold-plan.ts) decides which ones apply and where.
 */
export { renderPairConfig } from './pair-config'
export { renderGitignore } from './gitignore'
export { renderReadme } from './readme'
export { renderReleaseScript, releaseZipPath, releaseZipPattern } from './release-script'
export { renderReleaseWorkflow } from './release-workflow'
export { renderKnowledgeReadme, renderExampleSkill } from './seed-content'
