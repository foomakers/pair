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
    ]
  },
}

export default withMDX(nextConfig)
