---
'@pair/website': patch
---

Docs information architecture, per the clean-context IA review (#552):

- Process Lifecycle moves to the `process-lifecycle` slug as a five-part spine: overview, `phases/` (induction, strategic planning, iteration, execution), analysis and refinement workflow, delivery workflow with the delivery cycle in depth beneath it, lifecycle modes with a mode-by-assistant matrix, skill layers, tag-driven automation. Every spine and concept page ends with a Next link.
- Three labels everywhere a step names its path: "In your assistant" (skills), "With pair-cli" (real commands), "With `/pair-assistant` (optional, Claude Code)".
- The five stapled guides are recipes again; their tails are `reference/cli/install-sources`, `reference/cli/update-link`, `tutorials/release-testing`, `tutorials/share-ai-artifacts` and `getting-started/verify`.
- Customization is dissolved into Guides (`customize-for-your-team`, `customize-templates`, `monorepo-rules`, one `external-kb` guide with `scaffold-kb` plus the generated release script as the default channel), Reference (`templates-catalog`) and Concepts (`package-local-adoption`). The three role quickstarts merge into `getting-started/choose-your-path`; the quickstart is install and first run only.
- New `concepts/glossary`; `concepts/index` lists every page in groups; `reference/cli/workflows` merges into `cli/examples`; the batch engine page moves to Contributing as "Batch engine internals".
- Contradictions fixed: fresh-card stage order, `Ready` instead of `Refined`, `## Autonomy` as the canonical automation vocabulary with `## Eligibility` and `## Auto-Advance` documented as legacy, Windows support stated once (WSL2 or Git Bash).
- Captions say what to notice; the lifecycle diagram opens the hub and Getting Started. Redirects for every moved page; `lib/docs-ia.test.ts` guards the structure.
