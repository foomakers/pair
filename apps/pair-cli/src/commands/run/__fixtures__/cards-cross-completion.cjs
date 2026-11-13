const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  cp = require('child_process')
const req = require('module').createRequire(
  path.resolve('apps/pair-cli/src/commands/run/cards-run.ts'),
)
const ts = require('typescript')
function driver(text) {
  const m = { exports: {} }
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
  )(req, m, m.exports)
  return m.exports.runCardList
}
async function probe(run) {
  let done = false
  const calls = []
  await run({
    cards: ['12', '15'],
    maxPasses: 2,
    readRank: () => 0,
    atTarget: id => id === '15' && done,
    readState: async id => ({ progress: 0, atTarget: id === '15' && done }),
    interrupted: () => false,
    runCard: async id => {
      calls.push(id)
      done = true
      return {
        outcome: { id, outcome: 'completed', detail: 'exit 0', cycleStatus: 'target-ready' },
      }
    },
  })
  return calls
}
;(async () => {
  const baseline = await probe(
    driver(
      cp.execFileSync(
        'git',
        [
          'show',
          'fd8c8b18f34034e94e611de9f0746a6be41067a1:apps/pair-cli/src/commands/run/cards-run.ts',
        ],
        { encoding: 'utf8', timeout: 10000 },
      ),
    ),
  )
  assert.deepEqual(baseline, ['12'])
  const current = await probe(
    driver(fs.readFileSync('apps/pair-cli/src/commands/run/cards-run.ts', 'utf8')),
  )
  console.log(JSON.stringify({ baseline, current }))
  assert.deepEqual(current, ['12'], 'AC8: completed later card must not be invoked')
})().catch(e => {
  console.error(e.message)
  process.exitCode = 1
})
