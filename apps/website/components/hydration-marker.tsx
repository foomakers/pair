'use client'

import { useEffect } from 'react'

/**
 * Marks the document as hydrated once React's effects have run.
 *
 * Rendered AFTER `RootProvider` as its later sibling: React runs passive effects in tree order (descendants and earlier
 * siblings first), so by the time this effect fires the search provider's global keyboard-shortcut listener is attached.
 * Page load (`goto`) is NOT that moment — a shortcut sent between `load` and hydration is lost. Tests (and anything else
 * that must wait for interactivity) read `html[data-hydrated="true"]` instead of guessing.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', 'true')
  }, [])
  return null
}
