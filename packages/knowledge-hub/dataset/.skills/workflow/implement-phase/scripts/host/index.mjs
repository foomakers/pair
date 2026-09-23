// index.mjs — which PM/code-host adapter a cycle talks to (US-492).
//
// Registry: every `<id>.mjs` in THIS directory whose default export is a `defineAdapter(...)` is an
// adapter; nothing else registers one. Adding a host is therefore a new file here plus a
// way-of-working declaration — never an edit to an existing adapter, to this file or to
// `cycle-state.mjs` (story business rule 2).
//
// Resolution (ADR-018, way-of-working-pm-resolution.md — no new rule):
//   pm-tool    an explicit `- \`pm-tool\`: \`<id>\`` line, else the "<Tool> is adopted for project
//              management" declaration; nothing declared (or no way-of-working at all) ⇒ `github`,
//              the default every pre-US-492 script already assumed (D21: GitHub is the only adapter
//              active by default; any other is opt-in by declaration).
//   code-host  `## Git Workflow` → `- \`code-host\`: \`<id>\``; omitted ⇒ the PM tool when it hosts
//              code, otherwise undeclared (every PR operation then fails `code-host-undeclared`).
//   Spellings compare through the alias row of each adapter (case/separator-insensitive).
//   A declared tool with no adapter file ⇒ `host-unsupported`, naming the declared value and the
//   implemented set — never a silent fallback to GitHub .
//
// Binding: a coordinator resolves ONCE at its start — `cycle-state.mjs bind-hosts --dir
// <run/story dir>` writes `.host-binding.json` there — and every later call that names the same
// directory uses that binding, whatever way-of-working says by then. A call with no binding file
// resolves from way-of-working once per process (memoized by adoption file).
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { HostError, CODE_METHODS, PM_METHODS } from './adapter-kit.mjs'

export { HostError, INTERFACE_METHODS, REQUIRED_METHODS, SUPPORT_METHODS, PM_METHODS, CODE_METHODS, canonicalCardHash, defineAdapter } from './adapter-kit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const NOT_ADAPTERS = new Set(['index.mjs', 'adapter-kit.mjs'])
export const BINDING_FILE = '.host-binding.json'
export const DEFAULT_PM_TOOL = 'github'
const ADOPTION_REL = join('.pair', 'adoption', 'tech', 'way-of-working.md')

// Loads every adapter file of `dir`. A file that fails to load or is not an adapter is recorded as
// broken — it can never be bound, and it never takes the other adapters down with it.
export async function loadAdapters(dir = HERE) {
  const adapters = new Map()
  const broken = new Map()
  for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs') && !NOT_ADAPTERS.has(f)).sort()) {
    const id = f.slice(0, -'.mjs'.length)
    try {
      const mod = await import(pathToFileURL(join(dir, f)).href)
      const a = mod.default
      if (!a || typeof a.instantiate !== 'function' || a.id !== id) throw new Error(`default export must be defineAdapter({ id: '${id}', … })`)
      adapters.set(id, a)
    } catch (e) {
      broken.set(id, e?.message ?? String(e))
    }
  }
  return { adapters, broken }
}

const SHIPPED = await loadAdapters(HERE)
export const implementedHosts = (registry = SHIPPED) => [...registry.adapters.keys()].sort()

const norm = s => String(s ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')

// A declared spelling → the adapter id whose alias row carries it, or null.
export function canonicalHost(value, registry = SHIPPED) {
  const n = norm(value)
  for (const a of registry.adapters.values()) if (a.aliases.some(x => norm(x) === n)) return a.id
  return null
}

const unsupported = (side, declared, registry) => {
  const implemented = implementedHosts(registry)
  const brokenWhy = registry.broken.get(norm(declared))
  return new HostError('host-unsupported', {
    message: `host-unsupported: ${side} ${JSON.stringify(declared)} has no adapter in scripts/host/ (implemented: ${implemented.join(', ')})${brokenWhy ? ` — scripts/host/${norm(declared)}.mjs failed to load: ${brokenWhy}` : ''}`,
    detail: JSON.stringify({ side, declared, implemented }),
  })
}

// Pure: way-of-working text → { pmTool, codeHost, declared }. Throws HostError('host-unsupported').
export function resolveHosts({ text, registry = SHIPPED } = {}) {
  const src = String(text ?? '')
  const key = k => new RegExp('^\\s*[-*]\\s*`' + k + '`\\s*:\\s*`([^`]+)`', 'm').exec(src)?.[1]
  let declaredPm = key('pm-tool')
  if (declaredPm === undefined) {
    const m = /^\s*(?:[-*]\s+)?(?:\*\*)?(.+?)(?:\*\*)?\s+is adopted for project management/im.exec(src)
    if (m) declaredPm = m[1]
  }
  const declaredCode = key('code-host')
  const pmTool = declaredPm === undefined ? DEFAULT_PM_TOOL : canonicalHost(declaredPm, registry)
  if (!pmTool) throw unsupported('pm-tool', declaredPm, registry)
  let codeHost
  if (declaredCode !== undefined) {
    codeHost = canonicalHost(declaredCode, registry)
    if (!codeHost) throw unsupported('code-host', declaredCode, registry)
  } else codeHost = registry.adapters.get(pmTool).hostsCode ? pmTool : null
  return { pmTool, codeHost, declared: { pmTool: declaredPm ?? null, codeHost: declaredCode ?? null } }
}

export function findAdoptionFile(from) {
  let cur
  try {
    cur = realpathSync(from)
  } catch {
    cur = String(from)
  }
  for (;;) {
    const candidate = join(cur, ADOPTION_REL)
    if (existsSync(candidate)) return candidate
    const up = dirname(cur)
    if (up === cur) return null
    cur = up
  }
}

// Once per process per adoption file (inside one invocation).
const RESOLVED = new Map()
function resolveFrom(from, registry) {
  const file = (from && findAdoptionFile(from)) || findAdoptionFile(process.cwd())
  const memoKey = `${file ?? '<none>'}`
  if (registry === SHIPPED && RESOLVED.has(memoKey)) return RESOLVED.get(memoKey)
  const out = { ...resolveHosts({ text: file ? readFileSync(file, 'utf8') : '', registry }), source: file ? 'adoption' : 'default', adoption: file }
  if (registry === SHIPPED) RESOLVED.set(memoKey, out)
  return out
}

export function readBinding(dir) {
  if (!dir) return null
  const p = join(dir, BINDING_FILE)
  if (!existsSync(p)) return null
  const b = JSON.parse(readFileSync(p, 'utf8'))
  if (!b || typeof b.pmTool !== 'string' || !('codeHost' in b)) throw new HostError('invalid-binding', { message: `invalid host binding at ${p}` })
  return b
}

// The coordinator's ONE resolution: written once, reused verbatim on every later call.
export function writeBinding({ dir, from, registry = SHIPPED }) {
  const existing = readBinding(dir)
  if (existing) return { action: 'reused', binding: existing, path: join(dir, BINDING_FILE) }
  const r = resolveFrom(from ?? dir, registry)
  const binding = { schemaVersion: 1, pmTool: r.pmTool, codeHost: r.codeHost, source: r.source, declared: r.declared, adoption: r.adoption, boundAt: new Date().toISOString() }
  mkdirSync(dir, { recursive: true })
  const p = join(dir, BINDING_FILE)
  const tmp = join(dir, `.tmp-host-binding-${process.pid}-${Date.now()}.json`)
  writeFileSync(tmp, JSON.stringify(binding, null, 2) + '\n')
  renameSync(tmp, p)
  return { action: 'bound', binding, path: p }
}

// The bound pair of adapters. `pm` serves card operations, `code` pull-request operations; on a
// single-tool project they are the same adapter. `transport` is handed to the adapters untouched.
export function bindHosts({ dir, from, binding, transport = {}, registry = SHIPPED } = {}) {
  const b = binding ?? readBinding(dir) ?? resolveFrom(from ?? dir, registry)
  const pmAdapter = registry.adapters.get(b.pmTool)
  if (!pmAdapter) throw unsupported('pm-tool', b.pmTool, registry)
  const codeAdapter = b.codeHost === null ? null : registry.adapters.get(b.codeHost)
  if (b.codeHost !== null && !codeAdapter) throw unsupported('code-host', b.codeHost, registry)
  const pm = pmAdapter.instantiate(transport)
  const code = codeAdapter === null ? undefinedCodeHost(b.pmTool) : codeAdapter.id === pmAdapter.id ? pm : codeAdapter.instantiate(transport)
  return { pmTool: b.pmTool, codeHost: b.codeHost, pm: sided(pm, PM_METHODS, 'pm-tool'), code: sided(code, CODE_METHODS, 'code-host') }
}

// A side exposes only its own operations — a card read through the code host (or a PR write
// through the PM tool) is a routing bug, refused loudly.
function sided(impl, allowed, side) {
  return new Proxy(impl, {
    get(target, prop) {
      if (typeof prop === 'string' && typeof target[prop] === 'function' && !allowed.includes(prop) && (PM_METHODS.includes(prop) || CODE_METHODS.includes(prop))) {
        return () => {
          throw new HostError('wrong-side', { message: `${prop} is not a ${side} operation (ADR-018 routing table)`, method: prop })
        }
      }
      return target[prop]
    },
  })
}

function undefinedCodeHost(pmTool) {
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (typeof prop !== 'string' || !CODE_METHODS.includes(prop)) return undefined
        return () => {
          throw new HostError('code-host-undeclared', { message: `code-host-undeclared: ${pmTool} hosts no repositories or pull requests — declare \`code-host\` in way-of-working.md → ## Git Workflow`, method: prop })
        }
      },
    },
  )
}

// CLI: `node host/index.mjs resolve [--from <dir>]` — read-only, prints the resolution.
const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMain()) {
  const [cmd, flag, value] = process.argv.slice(2)
  try {
    if (cmd !== 'resolve' || (flag !== undefined && flag !== '--from')) throw new Error('usage: index.mjs resolve [--from <dir>]')
    const r = resolveFrom(value ?? process.cwd(), SHIPPED)
    process.stdout.write(JSON.stringify({ pmTool: r.pmTool, codeHost: r.codeHost, source: r.source, declared: r.declared, implemented: implementedHosts() }) + '\n')
  } catch (e) {
    const typed = e.kind === 'host-unsupported'
    process.stdout.write(JSON.stringify({ error: typed ? 'host-unsupported' : e.message, ...(typed ? JSON.parse(e.detail) : {}), message: e.message }) + '\n')
    process.exit(1)
  }
}
