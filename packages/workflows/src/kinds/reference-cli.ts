import { renderKindReference } from './reference'

// `pnpm --filter @pair/workflows kinds:reference` redirects this into the published page.
process.stdout.write(renderKindReference())
