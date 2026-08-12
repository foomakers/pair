import type { KbHost, KbIdentity } from '../identity'
import { releaseZipPattern } from './release-script'

function layoutSection(): string[] {
  return [
    '## Repository layout',
    '',
    '```text',
    '.pair/knowledge/   # KB content — mirrored to .pair/knowledge/ in consuming projects',
    '.skills/           # agent skills — one directory per skill, each with a SKILL.md',
    'pair.config.json   # which registries this KB ships (knowledge + skills)',
    'scripts/release.sh # packages + publishes a version (wraps `pair package`)',
    '```',
    '',
    'There is deliberately no `.pair/adoption/` here: adoption files describe a',
    'configured project, while this repository is knowledge.',
    '',
  ]
}

function authoringSection(): string[] {
  return [
    '## Add content',
    '',
    '1. Write guidelines/how-tos under `.pair/knowledge/`.',
    '2. Add a skill as `.skills/<skill-name>/SKILL.md` (frontmatter: `name`, `description`).',
    '3. Commit. Nothing else to wire up — the registries above already cover both paths.',
    '',
  ]
}

function releaseSection(identity: KbIdentity, host: KbHost): string[] {
  const common = [
    '## Cut a release',
    '',
    '```bash',
    'bash scripts/release.sh 1.0.0',
    '```',
    '',
    'The script runs `pair package` (the same command the official KB uses) and',
    `writes \`${releaseZipPattern(identity)}\`.`,
    '',
    'It pins the pair-cli version it invokes, so releases stay reproducible; set',
    '`PAIR_CLI` to move to another version deliberately.',
    '',
  ]

  if (host === 'github') {
    return [
      ...common,
      'It then tags `v1.0.0` and creates a GitHub release with the ZIP attached.',
      'Pushing a `v*` tag does the same in CI via `.github/workflows/release.yml`.',
      'When the `gh` CLI is missing, or this directory is not the root of its own git',
      'repository, the script stops after packaging and tells you where the ZIP is —',
      'publish it however your org does. Nothing is ever tagged in an enclosing repo.',
      '',
    ]
  }

  return [
    ...common,
    'No code-host automation is generated for this host: publish the ZIP however',
    'your org does (release page, artifact store, or any HTTP location).',
    '',
  ]
}

function consumeSection(identity: KbIdentity): string[] {
  return [
    '## Install it in a project',
    '',
    '```bash',
    '# from this repository',
    `pair-cli install --source https://github.com/<org>/${identity.slug}.git`,
    '',
    '# or from a local clone',
    `pair-cli install --source ../${identity.slug} --offline`,
    '',
    '# or from a release ZIP (equivalent to the forms above)',
    `pair-cli install --source ./dist/${identity.slug}-1.0.0.zip --offline`,
    '```',
    '',
    'A fetched source — ZIP, remote ZIP, git clone — is cached in its own slot under',
    "`~/.pair/kb/external/`, never in the official KB's slot, so installing this KB in",
    'one project cannot change what another project on the same machine resolves.',
    '',
    'Current limitations (upstream, tracked):',
    '',
    `- **Skills prefix** — \`install\` resolves the *consuming* project's config, not this`,
    `  KB's, so the \`${identity.skillPrefix}\` prefix declared in \`pair.config.json\` only`,
    '  applies once that project adopts this config (copy the file in). With the default',
    '  config the skills install under the `pair-` prefix',
    '  (<https://github.com/foomakers/pair/issues/397>).',
    '- **Registries this KB does not ship** (`adoption`, `github`, …) are counted as failed',
    '  in the install summary (`! Installation finished with errors`) even though the',
    '  command succeeds (exit 0) and everything this KB ships is installed',
    '  (<https://github.com/foomakers/pair/issues/396>).',
    '',
    'A project consumes one KB channel at a time: an external KB like this one, or',
    'the skill marketplace — not both for the same skill set.',
    '',
  ]
}

/**
 * Operational README for a scaffolded KB repo: layout, authoring, release, install.
 * Scaffold-owned — regenerated (with confirmation) on re-scaffold.
 */
export function renderReadme(options: { identity: KbIdentity; host: KbHost }): string {
  const { identity, host } = options

  return [
    `# ${identity.name}`,
    '',
    'External [pair](https://github.com/foomakers/pair) knowledge base, scaffolded',
    'with `pair-cli scaffold-kb`. It installs into any project exactly like the',
    'official KB.',
    '',
    ...layoutSection(),
    ...authoringSection(),
    ...releaseSection(identity, host),
    ...consumeSection(identity),
  ].join('\n')
}
