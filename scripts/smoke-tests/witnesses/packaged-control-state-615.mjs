import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../../..')
const version = '615-red-spec'
const release = join(root, 'release')
const zip = join(release, `pair-cli-manual-${version}.zip`)
const tgz = join(release, `pair-cli-${version}.tgz`)
const work = mkdtempSync(join(tmpdir(), 'pair-control-state-'))
const run = (command, args, cwd = root, env = process.env) => {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120_000 })
  if (result.error) throw result.error
  return result
}
const output = result => `${result.stdout}\n${result.stderr}`
const put = (path, data) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}
const clean = () => {
  for (const path of [
    join(release, `pair-cli-manual-${version}`),
    zip,
    `${zip}.sha256`,
    tgz,
    `${tgz}.sha256`,
    join(release, `pair-cli-${version}.meta.json`),
  ])
    rmSync(path, { recursive: true, force: true })
  rmSync(work, { recursive: true, force: true })
}

try {
  let result = run(join(root, 'scripts/workflows/release/package-manual.sh'), [version])
  assert.equal(result.status, 0, output(result))
  result = run(join(root, 'scripts/workflows/release/create-registry-tgz.sh'), [version, zip])
  assert.equal(result.status, 0, output(result))
  const zipFiles = run('unzip', ['-Z1', zip]).stdout
  const tgzFiles = run('tar', ['-tzf', tgz]).stdout
  const sourceBytes = readFileSync(
    join(root, 'packages/knowledge-hub/dataset/.skills/next/control-state.mjs'),
  )
  const archiveMatchesSource = (listing, command, args) => {
    const entries = listing
      .split('\n')
      .filter(path => /(?:^|\/)bundle-cli\/(?:assets\/)?control-state\.mjs$/.test(path))
    return (
      entries.length > 0 &&
      entries.every(path => {
        const extracted = spawnSync(command, [...args, path], { timeout: 30_000 })
        assert.equal(extracted.status, 0, String(extracted.stderr))
        return extracted.stdout.equals(sourceBytes)
      })
    )
  }
  const zipPresent = archiveMatchesSource(zipFiles, 'unzip', ['-p', zip])
  const tgzPresent = archiveMatchesSource(tgzFiles, 'tar', ['-xOzf', tgz])
  const controlOnly = process.argv.includes('--targets') || process.argv.includes('--precedence')

  const prefix = join(work, 'prefix')
  result = run('npm', [
    'install',
    '--global',
    '--prefix',
    prefix,
    '--offline',
    '--no-audit',
    '--no-fund',
    tgz,
  ])
  assert.equal(result.status, 0, output(result))
  const project = join(work, 'project')
  mkdirSync(project, { recursive: true })
  result = run('git', ['init', '-q', '-b', 'main'], project)
  assert.equal(result.status, 0, output(result))
  result = run('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '--allow-empty', '-m', 'init'], project)
  assert.equal(result.status, 0, output(result))
  result = run('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], project)
  assert.equal(result.status, 0, output(result))
  put(
    join(project, '.pair/adoption/tech/way-of-working.md'),
    '# Way of Working\n\n## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Refined | Ready |\n',
  )
  cpSync(
    join(root, '.claude/skills/pair-workflow-cycle'),
    join(project, '.claude/skills/pair-workflow-cycle'),
    { recursive: true },
  )
  cpSync(join(root, '.claude/agents'), join(project, '.claude/agents'), { recursive: true })
  const bin = join(work, 'bin')
  put(
    join(bin, 'gh'),
    `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[0]!=='issue'||a[1]!=='view')process.exit(2);const card={title:'Ready story',body:'**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] **T-1**: build it\\n'};process.stdout.write(a.includes('-q')?card.body:JSON.stringify(card))\n`,
  )
  put(join(bin, 'claude'), `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({type:'result',subtype:'success',result:''})+'\\n')\n`)
  run('chmod', ['+x', join(bin, 'gh')])
  run('chmod', ['+x', join(bin, 'claude')])
  const env = {
    ...process.env,
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    PAIR_GH_BIN: join(bin, 'gh'),
  }
  const cli = join(prefix, 'bin/pair-cli')
  const route = () =>
    run(cli, ['run', '--card', '12', '--autonomous', '--until', 'ready'], project, env)
  const cleanRoute = route()
  const cleanOutput = output(cleanRoute)
  const scenarios = {}
  if (!controlOnly) {
    for (const name of ['github-dispatch-adapter', 'run-card', 'cycle-hooks']) {
      const scenario = run(
        '/bin/bash',
        [join(root, `scripts/smoke-tests/scenarios/${name}.sh`)],
        root,
        {
          ...env,
          PATH: `${bin}:${process.env.PATH}`,
          REPO_ROOT: root,
          TEST_BINARY: cli,
          PAIR_RED_SPEC_FOREGROUND_ONLY: '1',
        },
      )
      scenarios[name] = scenario.status
      if (scenario.status !== 0)
        console.error(
          `${name}: ${output(scenario)
            .split('\n')
            .filter(line => /FAIL|Error|error|not found|missing/.test(line))
            .slice(0, 12)
            .join('\n')}`,
        )
    }
  }

  const targets = ['.agents/skills', '.claude/skills']
  put(
    join(project, 'pair.config.json'),
    JSON.stringify({
      asset_registries: {
        skills: {
          source: '.skills',
          behavior: 'overwrite',
          description: 'skills',
          include: [],
          flatten: true,
          prefix: 'pair',
          targets: targets.map(path => ({ path, mode: 'canonical' })),
        },
      },
    }),
  )
  cpSync(
    join(root, '.claude/skills/pair-workflow-cycle'),
    join(project, '.agents/skills/pair-workflow-cycle'),
    { recursive: true },
  )
  const marker = (target, name, value) => {
    const skill = join(project, target, name)
    put(join(skill, 'SKILL.md'), '# next')
    put(join(skill, 'control-state.mjs'), `throw new Error('${value}')\n`)
  }
  for (const name of ['pair-next', 'pair-pair-next', 'next']) {
    const skill = join(project, '.agents/skills', name)
    marker('.agents/skills', name, `target-${name}`)
    const result = route()
    assert.match(
      output(result),
      new RegExp(`target-${name}`),
      `packaged CLI did not select ${name}: ${output(result)}`,
    )
    rmSync(skill, { recursive: true, force: true })
  }
  for (const name of ['pair-next', 'pair-pair-next', 'next']) {
    marker('.agents/skills', name, `coexisting-${name}-marker`)
  }
  assert.match(output(route()), /coexisting-pair-next-marker/)
  rmSync(join(project, '.agents/skills/pair-next'), { recursive: true, force: true })
  assert.match(output(route()), /coexisting-pair-pair-next-marker/)
  rmSync(join(project, '.agents/skills/pair-pair-next'), { recursive: true, force: true })
  assert.match(output(route()), /coexisting-next-marker/)
  marker('.agents/skills', 'next', 'first-target')
  marker('.claude/skills', 'pair-next', 'second-target')
  const precedence = route()
  assert.match(
    output(precedence),
    /first-target/,
    `packaged CLI did not use first target: ${output(precedence)}`,
  )
  console.log('pass: packaged CLI configured names and target precedence')

  if (process.argv.includes('--precedence')) {
    for (const target of targets) {
      for (const name of ['pair-next', 'pair-pair-next', 'next']) {
        rmSync(join(project, target, name), { recursive: true, force: true })
      }
    }
    const bundle = join(prefix, 'lib/node_modules/@foomakers/pair-cli/bundle-cli')
    // Current ncc-relative path plus the release layouts allowed by this contract.
    // All are inside this test's isolated install; no CLI code is changed.
    for (const path of [
      resolve(bundle, '../../assets/control-state.mjs'),
      join(bundle, 'assets/control-state.mjs'),
      join(bundle, 'control-state.mjs'),
    ])
      put(path, "throw new Error('bundled-resolver-marker')\n")
    assert.match(
      output(route()),
      /bundled-resolver-marker/,
      'bundled-only fixture must be reachable',
    )
    marker('.agents/skills', 'pair-next', 'installed-resolver-marker')
    const both = output(route())
    assert.match(both, /installed-resolver-marker/)
    assert.doesNotMatch(both, /bundled-resolver-marker/)
    console.log('pass: installed resolver precedes present reachable bundled fallback')
  }

  if (!controlOnly) {
    console.log(`ZIP_BYTES=${zipPresent} TGZ_BYTES=${tgzPresent} route=${cleanRoute.status}`)
    if (
      !zipPresent ||
      !tgzPresent ||
      cleanRoute.status !== 0 ||
      !cleanOutput.includes('Cycle status: target-ready') ||
      Object.values(scenarios).some(status => status !== 0)
    ) {
      console.error(
        `fail: packaged resolver bytes missing/mismatched or clean route blocked: ${cleanOutput.slice(-900)}`,
      )
      process.exitCode = 1
    } else {
      console.log('pass: manual ZIP, registry TGZ and installed CLI clean route')
    }
  }
} finally {
  clean()
}
