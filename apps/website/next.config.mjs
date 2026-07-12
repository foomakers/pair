import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pair/brand'],
  async redirects() {
    // Permanent redirects for docs IA restructuring (#312)
    return [
      {
        source: '/docs/support/faq',
        destination: '/docs/support/troubleshooting',
        permanent: true,
      },
      {
        source: '/docs/guides/troubleshooting',
        destination: '/docs/support/troubleshooting',
        permanent: true,
      },
      {
        source: '/docs/guides/adopter-checklist',
        destination: '/docs/getting-started/checklist',
        permanent: true,
      },
      {
        source: '/docs/guides/cli-workflows',
        destination: '/docs/reference/cli/workflows',
        permanent: true,
      },
      {
        source: '/docs/guides/customize-kb',
        destination: '/docs/customization/team',
        permanent: true,
      },
      {
        source: '/docs/guides/install-from-url',
        destination: '/docs/customization/install-from-url',
        permanent: true,
      },
      {
        source: '/docs/guides/packaging',
        destination: '/docs/customization/organization',
        permanent: true,
      },
      {
        source: '/docs/guides/update-link',
        destination: '/docs/reference/cli/update-link',
        permanent: true,
      },
      {
        source: '/docs/guides',
        destination: '/docs',
        permanent: true,
      },
    ]
  },
}

export default withMDX(nextConfig)
