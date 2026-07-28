import type { KbIdentity } from '../identity'

/**
 * GitHub Actions workflow for a scaffolded KB repo.
 *
 * It runs the SAME generated `scripts/release.sh` (which shells out to `pair
 * package`), so workflow and local release can never diverge: pushing a `vX.Y.Z`
 * tag produces the release the maintainer would have produced by hand.
 */
export function renderReleaseWorkflow(options: { identity: KbIdentity }): string {
  const { identity } = options

  return [
    `name: Release ${identity.name}`,
    '',
    'on:',
    '  push:',
    '    tags:',
    "      - 'v*'",
    '',
    'permissions:',
    '  contents: write',
    '',
    'jobs:',
    '  release:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    "          node-version: '20'",
    '      - name: Package and publish the KB',
    '        env:',
    '          GH_TOKEN: ${{ github.token }}',
    '        run: bash scripts/release.sh "${GITHUB_REF_NAME#v}"',
    '',
  ].join('\n')
}
