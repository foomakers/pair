// #642 r0-8: Refs identifiers survive event dispatch and bound code-host lookup.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  cpSync,
  existsSync,
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { parse } = createRequire(join(root, 'packages/knowledge-hub/package.json'))('yaml')
const rows = JSON.parse(
  readFileSync(new URL('./board-reference.rows.json', import.meta.url), 'utf8'),
)
const stages = ['cycle', 'green-fix', 'implement-phase', 'red-spec', 'red-verify', 'review-phase']
const bundles = stages.flatMap(stage => [
  `packages/knowledge-hub/dataset/.skills/workflow/${stage}/scripts`,
  `.claude/skills/pair-workflow-${stage}/scripts`,
])
const workflows = [
  '.github/workflows/pair-board-sync.yml',
  'packages/knowledge-hub/dataset/.github/workflows/pair-board-sync.yml',
]
const events = [
  ['opened', false, 'open'],
  ['reopened', false, 'open'],
  ['ready_for_review', false, 'open'],
  ['closed', false, 'closed-unmerged'],
  ['closed', true, 'merged'],
]
const jq = spawnSync('/usr/bin/which', ['jq'], { encoding: 'utf8', timeout: 1000 }).stdout.trim()
function put(path, content, executable = false) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, executable ? { mode: 0o755 } : undefined)
}
function executable(path, content) {
  put(path, `#!${process.execPath}\n${content}`, true)
}
function records(path) {
  return existsSync(path)
    ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : []
}
function transports(bin) {
  const prelude = `const fs = require('node:fs'); const a = process.argv.slice(2);
    const row = JSON.parse(process.env.ROW);
    const log = (path, value) => fs.appendFileSync(path, JSON.stringify(value)+'\\n');
    const unexpected = () => { log(process.env.WRITES, {unexpected: a}); process.exit(97); };
    const lookup = id => {
      if (row.lookupError) process.exit(75);
      if (row.missing || String(id).replace(/^#/, '') !== row.target.replace(/^#/, '')) process.exit(44);
    };
    log(process.env.READS, a);`
  executable(
    join(bin, 'gh'),
    prelude +
      `
    if (a[0] === 'api' && a[1]?.endsWith('/permission')) {
      const wanted = ['api', 'repos/'+process.env.REPO_NAME+'/collaborators/'+process.env.ACTOR+'/permission', '--method', 'GET'];
      if (JSON.stringify(a) !== JSON.stringify(wanted)) unexpected();
      if (row.permissionMode === 'error') process.exit(75);
      if (row.permissionMode === 'malformed') { process.stdout.write('{'); process.exit(0); }
      if (row.permissionMode === 'empty') process.exit(0);
      process.stdout.write(process.env.PERMISSION);
    } else if (a[0] === 'issue' && a[1] === 'view') {
      lookup(a[2]);
      const repoAt = a.indexOf('--repo');
      if (repoAt >= 0 && a[repoAt+1] !== process.env.REPO_NAME) unexpected();
      const card = {number:42, body:'## Story Statement\\nBound fixture', title:'Story', state:'OPEN'};
      process.stdout.write(a.includes('-q') ? card.body : JSON.stringify(card));
    } else unexpected();`,
  )
  executable(join(bin, 'git'), `process.stdout.write(process.env.PAIR_PM_ROOT+'\\n')`)
  azureTransport(bin, prelude)
  executable(
    join(bin, 'curl'),
    `
    const fs=require('node:fs'); const q=JSON.parse(fs.readFileSync(0,'utf8'));
    const row=JSON.parse(process.env.ROW);
    fs.appendFileSync(process.env.READS,JSON.stringify(q)+'\\n');
    if(!q.query.trim().startsWith('query')) { fs.appendFileSync(process.env.WRITES,JSON.stringify(q)+'\\n'); process.exit(97); }
    if(row.lookupError) process.exit(75);
    const cards=JSON.parse(process.env.PM_CARDS);
    const issue=cards.find(c=>c.identifier===q.variables?.id)??null;
    process.stdout.write(JSON.stringify({data:{issue,issues:{nodes:cards,pageInfo:{hasNextPage:false}}}})+'\\n200');`,
  )
}
function azureTransport(bin, prelude) {
  executable(
    join(bin, 'az'),
    prelude +
      `
    if (a.slice(0,3).join(' ') === 'boards work-item show') {
      const id = a[a.indexOf('--id')+1];
      if (!/^\\d+$/.test(id)) process.exit(44);
      lookup(id);
      process.stdout.write(JSON.stringify({id:42,url:'https://dev.azure.com/fixture/',fields:{'System.Title':'Story','System.Description':'## Story Statement\\nBound fixture','System.TeamProject':'fixture','System.State':'Review'}}));
    } else if (a.slice(0,3).join(' ') === 'repos pr list') {
      const expected = JSON.parse(process.env.AZ_ARGS);
      const scoped = JSON.stringify(a) === JSON.stringify(expected);
      const selected = JSON.parse(process.env.PR_ROWS);
      // A missing scope/status option exposes a same-ID foreign PR, changing cardinality/state.
      process.stdout.write(JSON.stringify(scoped ? selected : [...selected,{description:'Refs: '+row.target,status:'completed'}]));
    } else unexpected();`,
  )
}
function azureArgs(row) {
  const repo = Object.hasOwn(row, 'repo') ? row.repo : 'fixture/repository'
  const [project, repository] = String(repo ?? '').split('/')
  return [
    'repos',
    'pr',
    'list',
    '--status',
    'all',
    ...(project ? ['--project', project] : []),
    ...(repository ? ['--repository', repository] : []),
    '--output',
    'json',
  ]
}
function permissionEnv(row) {
  return {
    REPO_NAME: row.repo?.full_name ?? 'fixture/repository',
    ACTOR: row.sender ?? 'actor',
    PERMISSION: JSON.stringify(
      Object.hasOwn(row, 'permission')
        ? row.permission
        : { permission: row.role ?? 'write', role_name: row.role ?? 'write' },
    ),
  }
}
function fixture(row) {
  const dir = mkdtempSync(join(tmpdir(), 'pair-refs-'))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  for (const name of ['sh', 'bash']) symlinkSync(`/bin/${name}`, join(bin, name))
  for (const name of ['cat', 'grep', 'sed', 'tr', 'cut', 'head', 'tail'])
    symlinkSync(`/usr/bin/${name}`, join(bin, name))
  symlinkSync(process.execPath, join(bin, 'node'))
  assert.ok(jq)
  symlinkSync(jq, join(bin, 'jq'))
  transports(bin)
  const cards = row.missing
    ? []
    : [
        {
          id: 'uuid-42',
          identifier: row.target,
          title: 'Story',
          description: '## Story Statement\nBound fixture',
          state: { name: row.actual ?? 'Review', type: 'started' },
          team: { key: 'ENG' },
        },
      ]
  const env = {
    PATH: bin,
    HOME: dir,
    TMPDIR: dir,
    PAIR_PM_ROOT: dir,
    LINEAR_API_KEY: 'fixture',
    PAIR_CURL_BIN: join(bin, 'curl'),
    PAIR_AZ_BIN: join(bin, 'az'),
    ROW: JSON.stringify(row),
    ...permissionEnv(row),
    AZ_ARGS: JSON.stringify(azureArgs(row)),
    READS: join(dir, 'reads'),
    WRITES: join(dir, 'writes'),
    PM_CARDS: JSON.stringify(cards),
    PR_ROWS: JSON.stringify(row.prs ?? [{ description: row.body, status: row.state ?? 'active' }]),
  }
  return { dir, env }
}
function withTransport(env, action) {
  const saved = Object.fromEntries(
    ['READS', 'WRITES', 'PR_ROWS', 'ROW', 'AZ_ARGS'].map(key => [key, process.env[key]]),
  )
  Object.assign(process.env, Object.fromEntries(Object.keys(saved).map(key => [key, env[key]])))
  try {
    action()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
async function azure(row) {
  const f = fixture(row)
  try {
    const mismatches = []
    for (const bundle of bundles) {
      const adapter = (
        await import(pathToFileURL(join(root, bundle, 'host/azure-devops.mjs')))
      ).default.instantiate({ azBin: join(f.dir, 'bin/az') })
      // The adapter subprocess inherits only fixture transport data; never live credentials.
      withTransport(f.env, () => {
        const actual = adapter.linkedPr({
          id: row.target,
          repo: Object.hasOwn(row, 'repo') ? row.repo : 'fixture/repository',
        })
        if (actual !== row.expected) mismatches.push({ bundle, expected: row.expected, actual })
      })
    }
    assert.deepEqual(mismatches, [], JSON.stringify(mismatches))
    assert.deepEqual(
      records(f.env.READS),
      bundles.map(() => azureArgs(row)),
    )
    assert.deepEqual(records(f.env.WRITES), [])
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
}
function prepareWorkflow(f, row, workflow = workflows[1]) {
  const scripts = join(f.dir, '.claude/skills/pair-workflow-cycle/scripts')
  cpSync(
    join(
      root,
      workflow.startsWith('packages/')
        ? 'packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/host'
        : '.claude/skills/pair-workflow-cycle/scripts/host',
    ),
    join(scripts, 'host'),
    { recursive: true },
  )
  put(
    join(scripts, 'board-transition.mjs'),
    `import {appendFileSync} from 'node:fs'; appendFileSync(process.env.WRITES,JSON.stringify({args:process.argv.slice(2)})+'\\n'); console.log('{"confirmed":true}');`,
  )
  put(
    join(f.dir, '.pair/adoption/tech/way-of-working.md'),
    `- \`pm-tool\`: \`${row.pm ?? 'filesystem'}\`\n- \`code-host\`: \`github\`\n- \`linear-team\`: \`ENG\`\n`,
  )
  f.cardsBefore = []
  if (!row.missing) {
    const folder = join(f.dir, '.pair/adoption/product/backlog/03-user-stories/under-review')
    const names = row.ambiguous ? [`${row.target}-first`, `${row.target}-second`] : [row.target]
    for (const name of names) {
      const file = join(folder, `${name}.md`)
      const content = `# Story\n**Status**: ${row.actual ?? 'Review'}\n## Story Statement\nBound fixture\n`
      put(file, content)
      f.cardsBefore.push([file, content])
    }
  }
}
function eventPayload(row, action, merged, repo) {
  const payload = {
    action,
    repository: repo,
    sender: { login: row.sender ?? 'actor' },
    pull_request: {
      number: 77,
      body: row.body,
      title: row.title ?? 'Update',
      merged,
      head: {
        ref: row.branch ?? 'feature/work',
        repo: row.fork ? { id: 200, full_name: 'outsider/repository' } : { ...repo },
      },
      base: { repo: { ...repo } },
    },
  }
  if (row.missingIdentity) {
    const keys = row.missingIdentity.split('.')
    const object = keys.slice(0, -1).reduce((value, key) => value[key], payload)
    delete object[keys.at(-1)]
  }
  if (row.identityPatch) {
    const { side, field, value } = row.identityPatch
    payload.pull_request[side].repo[field] = value
  }
  return payload
}

function workflow(row, workflow, event) {
  const f = fixture(row)
  try {
    prepareWorkflow(f, row, workflow)
    const [action, merged, state] = event
    const repo = row.repo ?? { id: 100, full_name: 'fixture/repository' }
    const payload = eventPayload(row, action, merged, repo)
    put(join(f.dir, 'event.json'), JSON.stringify(payload))
    const doc = parse(readFileSync(join(root, workflow), 'utf8'))
    const step = doc.jobs['pr-state'].steps.find(step => step.run)
    const command = step.run
      .replaceAll('${{ github.event.action }}', action)
      .replaceAll('${{ github.event.pull_request.merged }}', String(merged))
    const result = spawnSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', command],
      {
        cwd: f.dir,
        env: { ...f.env, GITHUB_EVENT_PATH: join(f.dir, 'event.json'), REPO: repo.full_name },
        encoding: 'utf8',
        timeout: 5000,
      },
    )
    assertWorkflow(f, row, { result, repo, state, workflow, action, merged })
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
}
function assertWorkflow(f, row, { result, repo, state, workflow, action, merged }) {
  const writes = records(f.env.WRITES)
  assert.equal(result.status, 0, `${workflow}: ${result.stderr}`)
  assert.deepEqual(
    writes,
    row.allow
      ? [
          {
            args: [
              '--story',
              row.dispatchId ?? row.target,
              '--pr-state',
              state,
              '--repo',
              repo.full_name,
            ],
          },
        ]
      : [],
    `${workflow} ${action}/${merged}: ${result.stdout}`,
  )
  const permissions = records(f.env.READS).filter(read => Array.isArray(read) && read[0] === 'api')
  const expectedPermission = [
    'api',
    `repos/${repo.full_name}/collaborators/${row.sender ?? 'actor'}/permission`,
    '--method',
    'GET',
  ]
  for (const read of permissions) assert.deepEqual(read, expectedPermission)
  if (row.allow)
    assert.deepEqual(
      permissions,
      [expectedPermission],
      'dispatch requires exact successful permission lookup',
    )
  // Transport denies unexpected host writes/comments; also check filesystem card bytes.
  for (const [file, content] of f.cardsBefore) assert.equal(readFileSync(file, 'utf8'), content)
}
function checkFixture(row) {
  const f = fixture(row)
  try {
    prepareWorkflow(f, row)
    const script = `import {bindHosts} from './.claude/skills/pair-workflow-cycle/scripts/host/index.mjs';
      try { const pm=bindHosts({from:process.cwd()}).pm; const ref=pm.parseCardRef(${JSON.stringify(row.target)}, {repo:'fixture/repository'}); const card=pm.readCard(ref?.id ?? ${JSON.stringify(row.target)}, {repo:'fixture/repository'}); console.log(JSON.stringify({resolved:!!card.body})); }
      catch { console.log(JSON.stringify({resolved:false})); }`
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: f.dir,
      env: f.env,
      encoding: 'utf8',
      timeout: 3000,
    })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(JSON.parse(r.stdout), { resolved: row.resolved })
  } finally {
    rmSync(f.dir, { recursive: true, force: true })
  }
}
function audit(row) {
  const results = []
  for (const bundle of [bundles[0], bundles[1]]) {
    const f = fixture(row)
    try {
      prepareWorkflow(f, row)
      const scripts = join(f.dir, '.claude/skills/pair-workflow-cycle/scripts')
      for (const name of ['board-audit.mjs', 'board-sync.mjs'])
        cpSync(join(root, bundle, name), join(scripts, name))
      const adoption = join(f.dir, '.pair/adoption/tech/way-of-working.md')
      put(adoption, readFileSync(adoption, 'utf8').replace('`github`', '`azure-devops`'))
      const r = spawnSync(
        process.execPath,
        [join(scripts, 'board-audit.mjs'), '--repo', 'fixture/repository'],
        { cwd: f.dir, env: f.env, encoding: 'utf8', timeout: 4000 },
      )
      assert.equal(r.status, 0, r.stderr)
      const out = JSON.parse(r.stdout)
      results.push({
        bundle,
        mismatches: out.mismatches,
        gaps: out.gaps,
        writes: records(f.env.WRITES),
      })
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  }
  const mismatches = row.expected
    ? [{ id: row.target, actual: row.actual, expected: row.expected }]
    : []
  const gaps = row.gap ? [{ id: row.target, reason: row.gap }] : []
  assert.deepEqual(
    results,
    [bundles[0], bundles[1]].map(bundle => ({ bundle, mismatches, gaps, writes: [] })),
  )
}
const selected = rows.filter(row => !process.argv[2] || row.id === process.argv[2])
assert.ok(selected.length, 'selector must name an executable row')
for (const row of selected) {
  test(row.id, async () => {
    if (row.surface === 'azure') return azure(row)
    if (row.surface === 'fixture') return checkFixture(row)
    if (row.surface === 'audit') return audit(row)
    const mismatches = []
    for (const file of workflows)
      for (const event of row.allStates ? events : [events[4]]) {
        try {
          workflow(row, file, event)
        } catch (error) {
          mismatches.push(error.message)
        }
      }
    assert.deepEqual(mismatches, [], JSON.stringify(mismatches))
  })
}
