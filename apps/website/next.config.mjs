import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pair/brand'],
}

export default withMDX(nextConfig)
