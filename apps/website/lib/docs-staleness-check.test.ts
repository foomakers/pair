import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import {
  findSkillCountMismatches,
  findPluginSkillCountMismatches,
  countDeclaredPluginSkills,
  findGuideCountMismatches,
  findDeadLinks,
  checkCatalogSync,
  checkCommandAnchors,
  checkDocsCommands,
  countHowToGuides,
  buildValidRoutes,
  runAllChecks,
  deriveSkillCommand,
  extractFirstSentence,
  transformCommandTokens,
  readSkillDescription,
  parseCatalogRow,
  checkCatalogContent,
  generateCatalogRows,
  checkBatchEnginePaths,
  checkBatchEngineAgents,
  checkBatchEngineWorkflows,
  batchEngineErrors,
  checkListTargetsSamples,
} from './docs-staleness-check'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

// White-box unit tests for the docs-staleness gate LOGIC. Exported functions are
// tested directly — no spawning of any CLI/script. The thin `tsx` CLI wrapper is
// out of scope here (its logic is these functions); parity with the real docs
// tree is asserted in-process via runAllChecks() below.

const REPO_ROOT = resolve(__dirname, '../../..')

describe('findSkillCountMismatches', () => {
  it('flags a wrong bare "N skills"', () => {
    expect(findSkillCountMismatches('has 5 skills', 'a.mdx', 35)).toHaveLength(1)
  })

  it('passes a matching "N skills"', () => {
    expect(findSkillCountMismatches('has 35 skills', 'a.mdx', 35)).toHaveLength(0)
  })

  it('flags a wrong "N composable skills" (adjective between number and skills)', () => {
    const errs = findSkillCountMismatches('7 composable skills', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('7 composable skills')
  })

  it('flags a wrong "N+ skills" (trailing plus)', () => {
    expect(findSkillCountMismatches('30+ skills', 'a.mdx', 35)).toHaveLength(1)
  })

  it('flags a wrong "N agent skills"', () => {
    const errs = findSkillCountMismatches('exposes 7 agent skills', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('7 agent skills')
  })

  it('passes matching "N composable skills" and "N+ skills"', () => {
    expect(findSkillCountMismatches('1 composable skills and 1+ skills', 'a.mdx', 1)).toHaveLength(
      0,
    )
  })

  it('ignores subset counts ("N process skills")', () => {
    expect(findSkillCountMismatches('9 process skills', 'a.mdx', 35)).toHaveLength(0)
  })

  // The two phrasings the marketplace docs introduced, both of which drifted
  // silently (docs said 40 while the dataset held 41) because neither matched.
  it('flags a wrong "N declared pair skills"', () => {
    const errs = findSkillCountMismatches('exactly the 40 declared pair skills', 'a.mdx', 41)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('40 declared pair skills')
  })

  // The `Skills (N)` transcript is NOT a dataset-skill count — check 1 must ignore it,
  // or the two readings fight over one number (the plugin declares 1, the dataset 41).
  it('leaves the `Skills (N)` plugin transcript to the plugin check', () => {
    expect(findSkillCountMismatches('reports `Skills (1)`', 'a.mdx', 41)).toHaveLength(0)
  })
})

describe('findPluginSkillCountMismatches', () => {
  it('flags a `Skills (N)` transcript that disagrees with the manifest', () => {
    const errs = findPluginSkillCountMismatches('reports `Skills (40)`, `Agents (0)`', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('Skills (40)')
    expect(errs[0]).toContain('Plugin skill count')
  })

  it('passes a matching transcript', () => {
    expect(findPluginSkillCountMismatches('reports `Skills (1)`', 'a.mdx', 1)).toHaveLength(0)
  })

  it('does not read a sibling `Agents (N)`/`Hooks (N)` count as a skill count', () => {
    expect(
      findPluginSkillCountMismatches('`Agents (0)`, `Hooks (0)`, `MCP servers (0)`', 'a.mdx', 1),
    ).toHaveLength(0)
  })
})

describe('countDeclaredPluginSkills', () => {
  it('reads the real manifest at the plugin root', () => {
    const manifest = join(
      REPO_ROOT,
      'packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json',
    )
    expect(countDeclaredPluginSkills(manifest)).toBeGreaterThan(0)
  })

  it('returns null for a missing manifest, so the probe check is skipped not zeroed', () => {
    expect(countDeclaredPluginSkills(join(REPO_ROOT, 'nope/plugin.json'))).toBeNull()
  })
})

describe('findGuideCountMismatches', () => {
  it('flags a wrong "N how-to guides"', () => {
    expect(findGuideCountMismatches('11 how-to guides', 'a.mdx', 9)).toHaveLength(1)
  })

  it('passes a matching "N how-to guides"', () => {
    expect(findGuideCountMismatches('9 how-to guides', 'a.mdx', 9)).toHaveLength(0)
  })

  it('flags wrong counts in adjective phrasings ("N sequential/step-by-step guides")', () => {
    const errs = findGuideCountMismatches(
      '11 sequential guides and 11 step-by-step guides',
      'a.mdx',
      9,
    )
    expect(errs).toHaveLength(2)
    expect(errs[0]).toContain('11 sequential guides')
    expect(errs[1]).toContain('11 step-by-step guides')
  })

  it('flags "N step-by-step process guides" and "N process guides"', () => {
    expect(findGuideCountMismatches('11 step-by-step process guides', 'a.mdx', 9)).toHaveLength(1)
    expect(findGuideCountMismatches('11 process guides', 'a.mdx', 9)).toHaveLength(1)
  })

  it('does NOT false-positive on bare "N guides" prose (no how-to qualifier)', () => {
    expect(
      findGuideCountMismatches('5 guides at the museum and 3 tour guides', 'a.mdx', 9),
    ).toHaveLength(0)
  })
})

describe('countHowToGuides', () => {
  it('returns null when the how-to dir is missing (drives the loud gate failure)', () => {
    expect(countHowToGuides(resolve(REPO_ROOT, 'does/not/exist'))).toBeNull()
  })

  it('counts NN-how-to-*.md files in the real dataset (ignoring README)', () => {
    const n = countHowToGuides(
      resolve(REPO_ROOT, 'packages/knowledge-hub/dataset/.pair/knowledge/how-to'),
    )
    expect(n).toBe(9)
  })
})

describe('findDeadLinks', () => {
  const routes = new Set(['/docs', '/docs/reference/skills-catalog', '/docs/tutorials'])

  it('flags a dead markdown link', () => {
    expect(findDeadLinks('see [x](/docs/nope)', 'a.mdx', routes)).toHaveLength(1)
  })

  it('flags a dead JSX href="/docs/..." card link', () => {
    const errs = findDeadLinks('<Card href="/docs/does-not-exist">x</Card>', 'a.mdx', routes)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('/docs/does-not-exist')
  })

  it('passes a valid JSX href and a valid markdown link (incl. anchors)', () => {
    const ok = '<Card href="/docs/reference/skills-catalog">x</Card> and [t](/docs/tutorials#top)'
    expect(findDeadLinks(ok, 'a.mdx', routes)).toHaveLength(0)
  })
})

describe('checkCatalogSync', () => {
  it('flags a skill dir missing from the catalog', () => {
    expect(checkCatalogSync(['implement'], 'no rows here')).toHaveLength(1)
  })

  it('flags a catalog row with no matching dir', () => {
    expect(checkCatalogSync([], '| **ghost** | row |')).toHaveLength(1)
  })

  it('passes when both directions agree', () => {
    expect(checkCatalogSync(['implement'], '| **implement** | row |')).toHaveLength(0)
  })
})

describe('checkCommandAnchors', () => {
  it('flags a command dir with no anchor', () => {
    expect(checkCommandAnchors(['install'], 'no anchors')).toHaveLength(1)
  })

  it('passes when the anchor exists', () => {
    expect(checkCommandAnchors(['install'], '## install (#install)')).toHaveLength(0)
  })
})

describe('checkDocsCommands', () => {
  const commands = ['install', 'update', 'kb-validate']
  const doc = (content: string) => [{ rel: 'a.mdx', content }]

  it('flags a command a doc tells the reader to run that does not exist', () => {
    const errs = checkDocsCommands(doc('Run `pair-cli init` first.'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('pair-cli init')
  })

  it('flags a hyphen-less subcommand (`kb validate`)', () => {
    expect(checkDocsCommands(doc('```bash\npair-cli kb validate\n```'), commands)).toHaveLength(1)
  })

  it('passes a real command in a span and in a fence', () => {
    expect(checkDocsCommands(doc('Run `pair-cli install`.'), commands)).toHaveLength(0)
    expect(checkDocsCommands(doc('```bash\nnpx --no pair-cli update\n```'), commands)).toHaveLength(
      0,
    )
  })

  // The npx runner is a PREFIX of the binary, not a slot that swallows it: the real form
  // docs use names the SCOPED PACKAGE (`npx --no @foomakers/pair-cli <cmd>`), and an
  // earlier shape consumed `@foomakers/pair-cli` as the package token and then still
  // demanded a literal binary after it — so nothing behind npx could ever match and a
  // misspelled command shipped silently. The `npx --no pair-cli update` case above passed
  // only by accident (`--no` swallowed as the package token), which is why it alone was
  // false confidence.
  it('flags a misspelled command behind npx with the scoped package', () => {
    const errs = checkDocsCommands(
      doc('```bash\nnpx --no @foomakers/pair-cli kb-valdate\n```'),
      commands,
    )
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('kb-valdate')
  })

  it('flags a nonexistent command behind a bare npx', () => {
    const errs = checkDocsCommands(doc('```bash\nnpx pair-cli bogus-command\n```'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('bogus-command')
  })

  it('passes a real command behind npx with a versioned scoped package', () => {
    expect(
      checkDocsCommands(
        doc('```bash\nnpx --yes @foomakers/pair-cli@latest install\n```'),
        commands,
      ),
    ).toHaveLength(0)
  })

  it('flags a bare `pair` behind npx — the runner does not launder the wrong binary', () => {
    const errs = checkDocsCommands(doc('```bash\nnpx --no @foomakers/pair install\n```'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('pair-cli install')
  })

  // US-449 round 6: npx was the ONLY runner the prefix knew, and the docs publish three
  // other forms today — `pnpm dlx pair-cli install` (reference/cli/workflows.mdx:269),
  // `pnpm pair-cli install` (tutorials/team-setup.mdx:48), `pnpm pair-cli --version`
  // (tutorials/first-project.mdx:75). Drop the `-cli` on any of them and the gate returned
  // [] — the drift this rule exists to catch, on the exact lines the site publishes.
  it('flags a bare `pair` behind `pnpm dlx` — the form workflows.mdx publishes', () => {
    const errs = checkDocsCommands(doc('```bash\npnpm dlx pair install\n```'), commands)
    expect(errs).toEqual([
      'a.mdx tells the reader to run "pair install", but the published binary is ' +
        '"pair-cli" — write "pair-cli install"',
    ])
  })

  it('flags a bare `pair` behind a bare `pnpm` — the form team-setup.mdx publishes', () => {
    const errs = checkDocsCommands(doc('Use `pnpm pair install` instead.'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('"pair install"')
  })

  it('flags a bare `pair` behind `yarn dlx` and `pnpm exec`', () => {
    expect(checkDocsCommands(doc('```bash\nyarn dlx pair update\n```'), commands)).toHaveLength(1)
    expect(checkDocsCommands(doc('```bash\npnpm exec pair install\n```'), commands)).toHaveLength(1)
  })

  it('sees an unknown command behind a non-npx runner too', () => {
    const errs = checkDocsCommands(doc('```bash\npnpm dlx pair-cli kb validate\n```'), commands)
    expect(errs).toEqual(['a.mdx tells the reader to run "pair-cli kb", which is not a command'])
  })

  it('passes the correct pnpm forms the docs already publish', () => {
    expect(
      checkDocsCommands(doc('```bash\npnpm dlx pair-cli install\n```'), commands),
    ).toHaveLength(0)
    expect(
      checkDocsCommands(doc('```bash\npnpm dlx pair-cli update-link --dry-run\n```'), [
        ...commands,
        'update-link',
      ]),
    ).toHaveLength(0)
    expect(checkDocsCommands(doc('```bash\npnpm pair-cli --version\n```'), commands)).toHaveLength(
      0,
    )
  })

  // US-449 round 7: `--package`/`-p` is the one runner flag whose ARGUMENT is a package
  // NAME, and the flag run consumed the flag alone. So the canonical npx idiom for a
  // package whose bin differs from its package name —
  // `npx --package @foomakers/pair-cli pair-cli install`, a CORRECT line — had `--package `
  // eaten as a flag, `@foomakers/` read as the scope, the first `pair-cli` read as the
  // binary and the REAL binary token read as the command: `"pair-cli pair-cli" … is not a
  // command`, a CI red on a correct page with no edit that clears it short of deleting a
  // correct instruction. Same for `-p` and, since the runner list widened, for
  // `pnpm dlx --package …`.
  it('consumes `--package`/`-p` together with its package argument', () => {
    expect(
      checkDocsCommands(
        doc('```bash\nnpx --package @foomakers/pair-cli pair-cli install\n```'),
        commands,
      ),
    ).toEqual([])
    expect(
      checkDocsCommands(doc('```bash\nnpx -p @foomakers/pair-cli pair-cli install\n```'), commands),
    ).toEqual([])
    expect(
      checkDocsCommands(
        doc('```bash\npnpm dlx --package @foomakers/pair-cli pair-cli install\n```'),
        commands,
      ),
    ).toEqual([])
  })

  // The other direction of the same flag: consuming the argument must not launder the
  // WRONG binary that follows it.
  it('still flags a bare `pair` after a consumed `--package` argument', () => {
    expect(
      checkDocsCommands(doc('```bash\nnpx -p @foomakers/pair-cli pair install\n```'), commands),
    ).toEqual([
      'a.mdx tells the reader to run "pair install", but the published binary is ' +
        '"pair-cli" — write "pair-cli install"',
    ])
  })

  // The `--flag=value` spelling had no form at all in the flag run, so real drift shipped
  // green behind a LISTED runner: `npx --package=@foomakers/pair-cli pair install`
  // returned [].
  it('accepts the `--flag=value` spelling of a runner flag', () => {
    expect(
      checkDocsCommands(
        doc('```bash\nnpx --package=@foomakers/pair-cli pair install\n```'),
        commands,
      ),
    ).toEqual([
      'a.mdx tells the reader to run "pair install", but the published binary is ' +
        '"pair-cli" — write "pair-cli install"',
    ])
    expect(
      checkDocsCommands(
        doc('```bash\npnpm dlx --package=@foomakers/pair-cli pair-cli install\n```'),
        commands,
      ),
    ).toEqual([])
  })

  // Why the BARE package-manager form takes no flag run, while `npx`/`pnpm dlx` do:
  // `pnpm --filter <pkg>` puts a PACKAGE NAME in flag-argument position, and this
  // repo's package is literally called `pair-cli`. Consuming `--filter ` as a flag would
  // read the filter's argument as the binary and the script name as its command —
  // `pnpm --filter @pair/pair-cli build` would be reported as the nonexistent command
  // `build`, on three pages that are correct as written.
  it('does not read `pnpm --filter <pkg> <script>` as an invocation of the CLI', () => {
    expect(
      checkDocsCommands(doc('```bash\npnpm --filter @pair/pair-cli build\n```'), commands),
    ).toHaveLength(0)
    expect(
      checkDocsCommands(doc('```bash\npnpm --filter pair-cli dev update .\n```'), commands),
    ).toHaveLength(0)
    expect(
      checkDocsCommands(doc('Use `pnpm --filter` to scope a command.'), commands),
    ).toHaveLength(0)
  })

  it('does not read a package INSTALL as an invocation', () => {
    expect(
      checkDocsCommands(doc('```bash\npnpm add -D @foomakers/pair-cli\n```'), commands),
    ).toHaveLength(0)
    expect(
      checkDocsCommands(doc('```bash\nnpm install -g @foomakers/pair-cli\n```'), commands),
    ).toHaveLength(0)
  })

  // The reason the rule is positional rather than a prose-word allow-list: these are
  // English, and an earlier list-based version had to grow a word for each of them.
  it('ignores "pair-cli" used as a noun in prose', () => {
    const prose = 'Common pair-cli workflows, and the pair-cli version it invokes.'
    expect(checkDocsCommands(doc(prose), commands)).toHaveLength(0)
  })

  it('ignores a version string printed as OUTPUT in a fence', () => {
    expect(checkDocsCommands(doc('```text\npair-cli vX.Y.Z\n```'), commands)).toHaveLength(0)
  })

  // A flag is never a command NAME, so `pair-cli --version` must stay clean — but the
  // token is still an invocation, and behind the wrong binary it is the single most
  // copy-pasted line in the docs. The command token therefore accepts `-`-leading tokens
  // and the command-existence half is skipped for them; only the binary half applies.
  it('ignores a flag, which is never a command name', () => {
    expect(checkDocsCommands(doc('```bash\npair-cli --version\n```'), commands)).toHaveLength(0)
    expect(checkDocsCommands(doc('```bash\npair-cli --help\n```'), commands)).toHaveLength(0)
    expect(checkDocsCommands(doc('Run `pair-cli --version` to check.'), commands)).toHaveLength(0)
  })

  // US-449 round 5: `pair --version` is the exact form 9 pages already carry in its
  // CORRECT spelling, so the bare slip is one edit away — and the old command group
  // (`[A-Za-z][\w.-]*`) could not match a leading `-`, so the whole prefix failed and the
  // line was not seen as an invocation at all. The page shipped green telling the reader
  // to run a binary no npm install creates.
  it('flags a bare `pair --version` in a fence — a flag does not launder the binary', () => {
    const errs = checkDocsCommands(doc('```bash\npair --version\n```'), commands)
    expect(errs).toEqual([
      'a.mdx tells the reader to run "pair --version", but the published binary is "pair-cli"',
    ])
  })

  it('flags a bare `pair --help` in an inline span', () => {
    const errs = checkDocsCommands(doc('Read `pair --help` for the list.'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('"pair --help"')
    // The command-existence half must stay OFF for a flag: no "is not one of its
    // commands", and no `write "pair-cli --help"` prescription either way round.
    expect(errs[0]).not.toContain('is not one of its commands')
  })

  it('flags a bare `pair -v` short flag too', () => {
    expect(checkDocsCommands(doc('```bash\npair -v\n```'), commands)).toHaveLength(1)
  })

  // `--` alone, or an arrow, is not a flag token: the capture needs a word character
  // after the dashes, so fenced ASCII diagrams and prose stay clean.
  it('does not read `pair -> x` or a bare `pair --` as an invocation', () => {
    expect(checkDocsCommands(doc('```text\npair -> story\n```'), commands)).toHaveLength(0)
    expect(checkDocsCommands(doc('```bash\npair -- install\n```'), commands)).toHaveLength(0)
  })

  // US-449: the published bin is `pair-cli`; `pair` is not installed by any npm install,
  // so a doc telling the reader to run it is a copy-paste that fails with "command not
  // found". Before this, the gate matched the literal `pair-cli` prefix only and was
  // structurally blind to the wrong name — the exact drift it exists to catch.
  it('flags a bare `pair <cmd>` invocation in a span — the published bin is pair-cli', () => {
    expect(checkDocsCommands(doc('Run `pair install` first.'), commands)).toEqual([
      'a.mdx tells the reader to run "pair install", but the published binary is ' +
        '"pair-cli" — write "pair-cli install"',
    ])
  })

  it('flags a bare `pair <cmd>` invocation in a fence, even for a real command', () => {
    const errs = checkDocsCommands(doc('```bash\npair kb-validate\n```'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('pair-cli kb-validate')
  })

  it('flags a bare `pair <cmd>` behind a shell prompt', () => {
    expect(checkDocsCommands(doc('```bash\n$ pair update\n```'), commands)).toHaveLength(1)
  })

  // The bare-`pair` case reports the binary once — it is not ALSO an unknown-command
  // error, or every renamed line would be counted twice. The TEXT is asserted too: one
  // error must not mean half a message. `write "pair-cli init"` for a command that does
  // not exist is the gate telling a writer to publish a different broken invocation, and
  // the next run answers `"pair-cli init" … is not a command` — two red rounds, the first
  // of them wrong. Asserting the count alone is what let that ship.
  it('reports a bare `pair <unknown>` once, and does not recommend the nonexistent command', () => {
    const errs = checkDocsCommands(doc('Run `pair init` first.'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('"init" is not one of its commands')
    expect(errs[0]).not.toContain('write "pair-cli init"')
  })

  // Why the separator is ONE space and not `\s+`: the PM-tool pages align two columns
  // under a fenced heading (`pair                    Linear`). A run of whitespace is a
  // diagram, never an invocation — widening to bare `pair` must not start reading them
  // as "run `pair Linear`".
  it('ignores an aligned column in a fenced diagram', () => {
    const diagram =
      '```text\npair                    Linear\n─────\nEpic                    Project\n```'
    expect(checkDocsCommands(doc(diagram), commands)).toHaveLength(0)
  })

  // Same rule, other side: ONE literal space excludes a TAB too, for the same diagram
  // reason — a tab is column alignment by definition. Pinned so the exclusion reads as
  // deliberate: a later reader who finds a tab-separated invocation unflagged should
  // narrow the diagram, not re-widen the separator to `\s`.
  it('does not read a TAB-separated line as an invocation', () => {
    expect(checkDocsCommands(doc('```bash\npair-cli\tbogus-tab\n```'), commands)).toHaveLength(0)
    expect(checkDocsCommands(doc('```bash\npair-cli bogus-one\n```'), commands)).toHaveLength(1)
  })

  it('ignores "pair" used as the product name in prose', () => {
    const prose = 'pair installs bridge files, and pair maps its hierarchy to Linear.'
    expect(checkDocsCommands(doc(prose), commands)).toHaveLength(0)
  })

  // A CLOSING FENCE ends with a backtick. The span rule's leading `\s*` used to cross the
  // newline from it into the paragraph below, reading "pair creates Markdown files" as an
  // invocation of the (nonexistent) command `creates`. Latent while only `pair-cli`
  // matched — a paragraph rarely opens with it — and immediate once bare `pair` counts.
  it('does not let a closing fence reach into the next paragraph', () => {
    const md = '```text\nEpic → Story\n```\n\npair creates Markdown files from the template.'
    expect(checkDocsCommands(doc(md), commands)).toHaveLength(0)
  })

  // Same class as the closing fence, one line down and unpinned until now: a CLOSING
  // INLINE span also ends with a backtick, so "after a backtick" read the prose that
  // follows it as an invocation. `pair` is the product name on ~10 docs pages, so this
  // turns a correct edit red with advice that would corrupt the sentence — "write
  // `pair-cli skills`" inside "pair skills follow the Agent Skills standard".
  it('does not read prose after a CLOSING inline span as an invocation', () => {
    expect(
      checkDocsCommands(doc('Read `config.json` pair skills resolve state.'), commands),
    ).toHaveLength(0)
    expect(
      checkDocsCommands(doc('See `way-of-working.md` pair install markers here.'), commands),
    ).toHaveLength(0)
  })

  it('still flags an invocation that OPENS its own span later on the same line', () => {
    const errs = checkDocsCommands(doc('Read `config.json`, then run `pair install`.'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('pair-cli install')
  })
})

describe('buildValidRoutes', () => {
  it('maps index.mdx to /docs and folder index to the folder route', () => {
    const docsDir = '/x/docs'
    const routes = buildValidRoutes(
      ['/x/docs/index.mdx', '/x/docs/reference/index.mdx', '/x/docs/tutorials/first.mdx'],
      docsDir,
    )
    expect(routes.has('/docs')).toBe(true)
    expect(routes.has('/docs/reference')).toBe(true)
    expect(routes.has('/docs/tutorials/first')).toBe(true)
  })
})

describe('runAllChecks (in-process, real docs tree)', () => {
  it('reports zero drift and 44 skills against the actual repo', () => {
    const { errors, skillCount } = runAllChecks(REPO_ROOT)
    expect(errors, errors.join('\n')).toHaveLength(0)
    expect(skillCount).toBe(44)
  })
})

// Check 2c — catalog ROW CONTENT single-sourced from the dataset SKILL.md frontmatter.
describe('deriveSkillCommand', () => {
  it('non-meta skill → /pair-<category>-<name>', () => {
    expect(deriveSkillCommand('process', 'review')).toBe('/pair-process-review')
    expect(deriveSkillCommand('capability', 'classify')).toBe('/pair-capability-classify')
  })
  it('meta skill (name === category) → /pair-<name>', () => {
    expect(deriveSkillCommand('next', 'next')).toBe('/pair-next')
  })
})

describe('readSkillDescription', () => {
  it('extracts the quoted description scalar from frontmatter', () => {
    expect(readSkillDescription('---\nname: x\ndescription: "Hello world."\n---\n# x\n')).toBe(
      'Hello world.',
    )
  })
  it('returns empty string when absent', () => {
    expect(readSkillDescription('---\nname: x\n---\n')).toBe('')
  })
})

describe('extractFirstSentence', () => {
  it('cuts at the first sentence-terminating period', () => {
    expect(extractFirstSentence('First sentence. Second one.')).toBe('First sentence.')
  })
  it('does not cut on known abbreviations (e.g.)', () => {
    expect(extractFirstSentence('Uses e.g. this and that. Next.')).toBe('Uses e.g. this and that.')
  })
  it('cuts before a $scope/$mode enumeration and ensures a closing period', () => {
    expect(extractFirstSentence('Does a thing: `$scope: full` here.')).toBe('Does a thing.')
  })
})

describe('transformCommandTokens', () => {
  const cmds = new Map([['classify', '/pair-capability-classify']])
  it('backticks + qualifies a bare /command at a word boundary', () => {
    expect(transformCommandTokens('Composes /classify here.', cmds)).toBe(
      'Composes `/pair-capability-classify` here.',
    )
  })
  it('leaves slash-joined prose (map-a/map-b) intact', () => {
    expect(transformCommandTokens('see map-a/map-b flow', cmds)).toBe('see map-a/map-b flow')
  })
})

describe('parseCatalogRow', () => {
  const catalog = '| **classify** | `/pair-capability-classify` | Applies the model. | — |'
  it('parses the command + description cells of a row', () => {
    expect(parseCatalogRow(catalog, 'classify')).toEqual({
      command: '/pair-capability-classify',
      description: 'Applies the model.',
    })
  })
  it('returns null when the skill has no row', () => {
    expect(parseCatalogRow(catalog, 'ghost')).toBeNull()
  })
})

describe('checkCatalogContent (Check 2c)', () => {
  const catalog = '| **classify** | `/pair-capability-classify` | Applies the model. | — |'
  it('passes when the row matches the generated truth', () => {
    const expected = new Map([
      ['classify', { command: '/pair-capability-classify', description: 'Applies the model.' }],
    ])
    expect(checkCatalogContent(expected, catalog)).toEqual([])
  })
  it('flags command drift, naming the skill', () => {
    const expected = new Map([
      ['classify', { command: '/pair-capability-classify-X', description: 'Applies the model.' }],
    ])
    const errs = checkCatalogContent(expected, catalog)
    expect(errs.some(e => e.includes('command drift') && e.includes('classify'))).toBe(true)
  })
  it('flags description drift, naming the skill', () => {
    const expected = new Map([
      ['classify', { command: '/pair-capability-classify', description: 'Something else.' }],
    ])
    const errs = checkCatalogContent(expected, catalog)
    expect(errs.some(e => e.includes('description drift') && e.includes('classify'))).toBe(true)
  })
  it('skips a skill with no catalog row (checkCatalogSync owns presence)', () => {
    const expected = new Map([['ghost', { command: '/pair-ghost', description: 'X.' }]])
    expect(checkCatalogContent(expected, catalog)).toEqual([])
  })
})

describe('generateCatalogRows + committed catalog parity (Check 2c integration)', () => {
  const SKILLS_DIR = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')
  const CATALOG = join(REPO_ROOT, 'apps/website/content/docs/reference/skills-catalog.mdx')
  it('derives a command + non-empty description for every dataset skill', () => {
    const rows = generateCatalogRows(SKILLS_DIR)
    expect(rows.size).toBe(44)
    expect(rows.get('next')?.command).toBe('/pair-next')
    for (const [, row] of rows) expect(row.description.length).toBeGreaterThan(0)
  })
  it('the committed skills-catalog rows match the dataset-derived truth (no drift)', () => {
    const rows = generateCatalogRows(SKILLS_DIR)
    const errors = checkCatalogContent(rows, readFileSync(CATALOG, 'utf-8'))
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
})

// ── The batch-engine page's claims (#219, review of #432) ─────────────────────
// Both gates were shipped without a unit test, so their failure branches had never been
// executed — including the one for a DELETED registry, which cannot be reached from the real
// config at all. The repo's own convention (ADL 2026-07-13) is that gate logic lives in tested
// production modules, and every sibling check in this file has tests.
describe('checkBatchEnginePaths', () => {
  const doc = 'installs into `.claude/workflows/` and `.claude/agents/`'
  const registries = {
    workflows: { targets: [{ path: '.claude/workflows/' }] },
    'agent-definitions': { targets: [{ path: '.claude/agents/' }] },
  }

  it('passes when the page names every install target', () => {
    expect(checkBatchEnginePaths(registries, doc)).toEqual([])
  })

  it('fails when a registry target is RENAMED and the page still names the old one', () => {
    const renamed = { ...registries, workflows: { targets: [{ path: '.claude/flows/' }] } }
    expect(checkBatchEnginePaths(renamed, doc)).toEqual([
      'batch-engine.mdx does not mention ".claude/flows/", where the "workflows" registry installs',
    ])
  })

  it('fails when a registry is REMOVED entirely but the page still documents it', () => {
    // Unreachable from the real config, which is exactly why it needs a test: this branch had
    // never run, so a doc describing an install that no longer happens would have passed.
    const rest = Object.fromEntries(
      Object.entries(registries).filter(([name]) => name !== 'workflows'),
    )
    expect(checkBatchEnginePaths(rest, doc)).toEqual([
      'asset_registries."workflows" is gone but batch-engine.mdx still documents it',
    ])
  })
})

describe('checkBatchEngineAgents', () => {
  const agents = [
    { name: 'pair-implementer', tools: 'Read, Edit, Write, Bash' },
    { name: 'pair-reviewer', tools: 'Read, Grep, Bash' },
  ]
  const doc =
    '`pair-implementer` holds `Read, Edit, Write, Bash`; `pair-reviewer` holds `Read, Grep, Bash`'

  it('passes when every agent is named with its exact declared tools', () => {
    expect(checkBatchEngineAgents(agents, doc)).toEqual([])
  })

  it('fails when an agent is not enumerated at all', () => {
    const withThird = [...agents, { name: 'pair-contract-generator', tools: 'Read, Write, Bash' }]
    expect(checkBatchEngineAgents(withThird, doc)).toEqual([
      'batch-engine.mdx does not name the shipped agent "pair-contract-generator"',
    ])
  })

  it('fails when an agent is named but its tool list is understated', () => {
    // The measured case: the page said `pair-reviewer` holds `Bash` while its frontmatter
    // declared five tools, so the note understated the authority an adopter installs.
    const widened = [{ name: 'pair-reviewer', tools: 'Read, Grep, Glob, Bash, Skill' }]
    expect(checkBatchEngineAgents(widened, doc)).toEqual([
      'batch-engine.mdx does not state "pair-reviewer" tools as declared in its frontmatter: "Read, Grep, Glob, Bash, Skill"',
    ])
  })

  it('reports an empty agent set rather than passing vacuously', () => {
    // Deleting the dataset agents directory would otherwise turn the check green.
    expect(checkBatchEngineAgents([], doc)).toEqual([
      'no agent definitions found in the dataset — the batch-engine agent check is vacuous',
    ])
  })
})

// The AGENT table is derived; the WORKFLOW table beside it was not, so a third shipped
// workflow — or a renamed one — left the page silently describing a set that no longer exists.
// Same shape as the agent check, same reason: what installs is a fact, and a fact on this page
// is read from the dataset rather than hand-copied.
describe('checkBatchEngineWorkflows', () => {
  const doc =
    '| Workflow | What it drives |\n| --- | --- |\n| `pair-implement-batch` | … |\n| `pair-refine-batch` | … |\n\nprose about `pair-implementer` and `pair-reviewer`.'

  it('passes when the page names every shipped workflow', () => {
    expect(checkBatchEngineWorkflows(['pair-implement-batch', 'pair-refine-batch'], doc)).toEqual(
      [],
    )
  })

  it('fails when a shipped workflow is missing from the table', () => {
    expect(
      checkBatchEngineWorkflows(
        ['pair-implement-batch', 'pair-refine-batch', 'pair-triage-batch'],
        doc,
      ),
    ).toEqual(['batch-engine.mdx does not name the shipped workflow "pair-triage-batch"'])
  })

  it('fails when the page names a workflow that no longer ships', () => {
    // The reverse direction matters as much: a page promising a workflow the adopter never
    // receives is the same defect pointed the other way.
    expect(checkBatchEngineWorkflows(['pair-implement-batch'], doc)).toEqual([
      'batch-engine.mdx names "pair-refine-batch", which the workflows registry does not ship',
    ])
  })

  // The reverse direction matched `` `pair-*-batch` `` only, so it could catch a stale name
  // exactly when that name kept the `-batch` suffix. A workflow renamed or retired WITHOUT it
  // — `pair-triage`, the shape a future non-batch workflow takes — stayed on the page promising
  // an install nobody gets, which is the very failure the reverse check exists for. Reading the
  // table's own rows answers it for any name, and keeps the agent table's `pair-*` names (which
  // this check does not own) out of the scan.
  it('fails when the page names a retired workflow whose name has no `-batch` suffix', () => {
    const withTriage = `${doc}\n`.replace(
      '| `pair-refine-batch` | … |',
      '| `pair-refine-batch` | … |\n| `pair-triage` | … |',
    )
    expect(
      checkBatchEngineWorkflows(['pair-implement-batch', 'pair-refine-batch'], withTriage),
    ).toEqual(['batch-engine.mdx names "pair-triage", which the workflows registry does not ship'])
  })

  it('does not read the AGENT table or prose as workflow names', () => {
    const withAgents = `${doc}\n\n| Agent | Tools |\n| --- | --- |\n| \`pair-implementer\` | … |\n| \`pair-reviewer\` | … |`
    expect(
      checkBatchEngineWorkflows(['pair-implement-batch', 'pair-refine-batch'], withAgents),
    ).toEqual([])
  })

  it('reports an empty workflow set rather than passing vacuously', () => {
    expect(checkBatchEngineWorkflows([], doc)).toEqual([
      'no shipped workflows found in the dataset — the batch-engine workflow check is vacuous',
    ])
  })

  it('reports a missing workflow TABLE rather than passing its reverse check vacuously', () => {
    // Same loud-on-absence rule the sibling checks follow: with no table to read, the reverse
    // direction proves nothing and must say so instead of returning green.
    expect(checkBatchEngineWorkflows(['pair-implement-batch'], 'no table here')).toEqual([
      'batch-engine.mdx does not name the shipped workflow "pair-implement-batch"',
      'batch-engine.mdx has no workflow table — the reverse check (a name the registry does not ship) cannot run',
    ])
  })
})

// The page's own gate must not be disabled by deleting the page. `batchEngineErrors` returned
// `[]` when the file was absent, so removing `batch-engine.mdx` turned every check above green
// — and AC8 requires the note to EXIST. The same file states the loud-on-absence convention
// twice for other checks; this one contradicted it.
describe('batchEngineErrors on a missing page', () => {
  it('fails loudly instead of self-disabling when the page is gone', () => {
    const errors = batchEngineErrors({
      BATCH_ENGINE_FILE: '/nowhere/batch-engine.mdx',
      CLI_CONFIG: '/nowhere/config.json',
      AGENTS_DIR: '/nowhere/.agents',
      WORKFLOWS_DIR: '/nowhere/.workflows',
    })
    expect(errors).toEqual([
      'Batch engine page not found: /nowhere/batch-engine.mdx — the batch-engine checks cannot run',
    ])
  })
})

describe('checkListTargetsSamples', () => {
  // The shipped shape, trimmed to two registries.
  const registries = {
    github: { behavior: 'mirror', targets: [{ path: '.github' }] },
    knowledge: { behavior: 'mirror', targets: [{ path: '.pair/knowledge' }] },
  }

  // What `listTargets` really prints (handler.ts), uncoloured.
  const real = [
    '  Asset Registries',
    '',
    '  github',
    '    target:   .github',
    '    behavior: mirror',
    '    GitHub workflows and configuration files',
    '',
    '  knowledge',
    '    target:   .pair/knowledge',
    '    behavior: mirror',
    '    Knowledge base and documentation',
  ].join('\n')

  // What the three pages carried before #216 — a columnar table under an invented
  // header, with `.pair` where the registry installs `.pair/knowledge`.
  const invented = [
    'Available asset registries:',
    '  github     .github         GitHub workflows and configuration files',
    '  knowledge  .pair            Knowledge base and documentation',
  ].join('\n')

  it('passes a sample that reproduces the renderer output', () => {
    expect(checkListTargetsSamples(registries, [{ rel: 'a.mdx', content: real }])).toEqual([])
  })

  it('flags the invented columnar transcript on every count', () => {
    const errors = checkListTargetsSamples(registries, [{ rel: 'a.mdx', content: invented }])
    expect(errors).toHaveLength(4) // missing header + invented header + 2 registries
    expect(errors.some(e => e.includes('Available asset registries:'))).toBe(true)
    expect(errors.some(e => e.includes('"knowledge" registry'))).toBe(true)
  })

  it('flags a registry the sample omits', () => {
    const withExtra = {
      ...registries,
      adoption: { behavior: 'add', targets: [{ path: '.pair/adoption' }] },
    }
    const errors = checkListTargetsSamples(withExtra, [{ rel: 'a.mdx', content: real }])
    expect(errors).toEqual([
      'a.mdx: --list-targets sample does not print the "adoption" registry as the CLI does ' +
        '(expected "  adoption" / "    target:   .pair/adoption" / "    behavior: add")',
    ])
  })

  it('flags a RE-TARGETED registry the sample still shows at the old path', () => {
    const moved = {
      ...registries,
      knowledge: { behavior: 'mirror', targets: [{ path: '.pair/kb' }] },
    }
    const errors = checkListTargetsSamples(moved, [{ rel: 'a.mdx', content: real }])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('    target:   .pair/kb')
  })

  it('flags a behavior change the sample does not follow', () => {
    const rebehaved = { ...registries, github: { behavior: 'add', targets: [{ path: '.github' }] } }
    expect(checkListTargetsSamples(rebehaved, [{ rel: 'a.mdx', content: real }])).toHaveLength(1)
  })
})
