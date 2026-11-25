import { schemas } from '../describe'

if (process.argv[2] === 'schema') {
  process.stdout.write(`${JSON.stringify(schemas())}\n`)
} else {
  process.stderr.write('Usage: node workflow.mjs schema\n')
  process.exitCode = 1
}
