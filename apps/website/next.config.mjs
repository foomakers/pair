import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pair/brand'],
  eslint: { ignoreDuringBuilds: true },
}

export default withMDX(nextConfig)
