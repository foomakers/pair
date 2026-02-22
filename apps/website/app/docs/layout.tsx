import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { source } from '@/lib/source'
import { PairLogo } from '@pair/brand'
import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.pageTree} nav={{ title: <PairLogo variant='navbar' /> }}>
      {children}
    </DocsLayout>
  )
}
