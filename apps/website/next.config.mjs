import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

// Permanent redirects for docs IA restructuring (#312, #552)
const docsRedirects = [
  ['/docs/support/faq', '/docs/support/troubleshooting'],
  ['/docs/guides/troubleshooting', '/docs/support/troubleshooting'],
  ['/docs/guides/adopter-checklist', '/docs/getting-started/checklist'],
  ['/docs/guides/cli-workflows', '/docs/reference/cli/workflows'],
  ['/docs/guides/customize-kb', '/docs/customization/team'],
  ['/docs/guides/install-from-url', '/docs/customization/install-from-url'],
  ['/docs/guides/packaging', '/docs/customization/organization'],
  ['/docs/guides/update-link', '/docs/reference/cli/update-link'],
  ['/docs/concepts/delivery-workflow', '/docs/developer-journey/delivery-workflow'],
  ['/docs/tutorials/unattended-delivery', '/docs/tutorials/automated-development'],
  ['/docs/guides', '/docs'],
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pair/brand'],
  redirects: async () =>
    docsRedirects.map(([source, destination]) => ({ source, destination, permanent: true })),
}

export default withMDX(nextConfig)
