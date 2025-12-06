export function normalizeVersionTag(version: string): { clean: string; tag: string } {
  const clean = version.startsWith('v') ? version.slice(1) : version
  const tag = version.startsWith('v') ? version : `v${version}`
  return { clean, tag }
}

export function buildGithubReleaseUrl(version: string): string {
  const { clean, tag } = normalizeVersionTag(version)
  const assetName = `knowledge-base-${clean}.zip`
  return `https://github.com/foomakers/pair/releases/download/${tag}/${assetName}`
}

export default { normalizeVersionTag, buildGithubReleaseUrl }
