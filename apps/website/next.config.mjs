import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

// Permanent redirects for docs IA restructuring (#312, #552). Every destination is a live page:
// Next.js does not chain redirects server-side, and `lib/docs-ia.test.ts` asserts it.
const docsRedirects = [
  // #312 (support, guides dissolved into reference)
  ['/docs/support/faq', '/docs/support/troubleshooting'],
  ['/docs/guides/troubleshooting', '/docs/support/troubleshooting'],
  ['/docs/guides/adopter-checklist', '/docs/getting-started/verify'],
  ['/docs/guides/cli-workflows', '/docs/reference/cli/examples'],
  ['/docs/guides/customize-kb', '/docs/guides/customize-for-your-team'],
  ['/docs/guides/install-from-url', '/docs/reference/cli/install-sources'],
  ['/docs/guides/packaging', '/docs/guides/external-kb'],
  ['/docs/guides/update-link', '/docs/reference/cli/update-link'],
  ['/docs/concepts/delivery-workflow', '/docs/process-lifecycle/delivery-workflow'],
  ['/docs/tutorials/unattended-delivery', '/docs/tutorials/automated-development'],
  ['/docs/customization/install-from-url', '/docs/reference/cli/install-sources'],
  ['/docs/tutorials/managing-ai-artifacts', '/docs/tutorials/share-ai-artifacts'],
  ['/docs/getting-started/checklist', '/docs/getting-started/verify'],
  // #552 increment 6: slug rename, phases folder, delivery cycle under the lifecycle
  ['/docs/developer-journey/induction', '/docs/process-lifecycle/phases/induction'],
  ['/docs/developer-journey/strategic-planning', '/docs/process-lifecycle/phases/strategic-planning'],
  ['/docs/developer-journey/iteration', '/docs/process-lifecycle/phases/iteration'],
  ['/docs/developer-journey/execution', '/docs/process-lifecycle/phases/execution'],
  ['/docs/developer-journey/:path*', '/docs/process-lifecycle/:path*'],
  ['/docs/reference/delivery-cycle', '/docs/process-lifecycle/delivery-cycle'],
  ['/docs/reference/batch-engine', '/docs/contributing/batch-engine-internals'],
  ['/docs/reference/cli/workflows', '/docs/reference/cli/examples'],
  // #552 increment 6: Customization dissolved into Guides, Reference and Concepts
  ['/docs/customization', '/docs/guides'],
  ['/docs/customization/adopt', '/docs/getting-started/quickstart'],
  ['/docs/customization/team', '/docs/guides/customize-for-your-team'],
  ['/docs/customization/templates', '/docs/guides/customize-templates'],
  ['/docs/customization/organization', '/docs/guides/external-kb'],
  ['/docs/customization/external-kb', '/docs/guides/external-kb'],
  ['/docs/customization/package-local-adoption', '/docs/concepts/package-local-adoption'],
  // #552 increment 6: role quickstarts merged, stapled guides split
  ['/docs/getting-started/quickstart-solo', '/docs/getting-started/choose-your-path'],
  ['/docs/getting-started/quickstart-team', '/docs/getting-started/choose-your-path'],
  ['/docs/getting-started/quickstart-org', '/docs/getting-started/choose-your-path'],
  ['/docs/guides/adoption-checklist', '/docs/getting-started/verify'],
  ['/docs/guides/release-tests', '/docs/tutorials/release-testing'],
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pair/brand'],
  redirects: async () =>
    docsRedirects.map(([source, destination]) => ({ source, destination, permanent: true })),
}

export default withMDX(nextConfig)
