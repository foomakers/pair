// GENERATED FILE — do not edit.
// Source: packages/knowledge-hub/src/tools/mirror-realign.ts
// Regenerate: pnpm --filter @pair/knowledge-hub realign:asset

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
function fail(message, code) {
    process.stderr.write(`mirror-realign: ${message}\n`);
    process.exit(code);
}
function sh(dir, args) {
    const child = (0, node_child_process_1.spawnSync)('git', args, { cwd: dir, encoding: 'utf-8' });
    if (child.error)
        return { ok: false, out: '', err: String(child.error) };
    return { ok: child.status === 0, out: child.stdout ?? '', err: child.stderr ?? '' };
}
function parsePorcelainZ(out) {
    const entries = [];
    const fields = out.split('\0');
    for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i];
        if (field === '')
            continue;
        const xy = field.slice(0, 2);
        entries.push({ xy, path: field.slice(3) });
        if (xy.includes('R') || xy.includes('C'))
            i += 1;
    }
    return entries;
}
function snapshotEntries(dir) {
    const res = sh(dir, ['status', '--porcelain', '-z', '--untracked-files=all']);
    if (!res.ok)
        fail(`could not snapshot the working tree: ${res.err.trim()}`, 1);
    return parsePorcelainZ(res.out);
}
function digestPaths(dir, paths, write) {
    const digests = new Map();
    for (const path of paths) {
        if (!(0, node_fs_1.existsSync)(`${dir}/${path}`))
            continue;
        const args = write ? ['hash-object', '-w', '--', path] : ['hash-object', '--', path];
        const res = sh(dir, args);
        if (res.ok)
            digests.set(path, res.out.trim());
    }
    return digests;
}
function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i += 1) {
        const c = glob[i];
        if (c !== '*' && c !== '?') {
            re += c.replace(/[.+^${}()|[\]\\]/, '\\$&');
            continue;
        }
        if (c === '?') {
            re += '[^/]';
            continue;
        }
        if (glob[i + 1] === '*') {
            re += glob[i + 2] === '/' ? '(.*/)?' : '.*';
            i += glob[i + 2] === '/' ? 2 : 1;
        }
        else {
            re += '[^/]*';
        }
    }
    return new RegExp(`^${re}$`);
}
function isHeadUnknown(xy) {
    return xy === '??' || xy[0] === 'A';
}
function quotePath(path) {
    return `'${path.replace(/'/g, `'\\''`)}'`;
}
function parseArgs(argv) {
    const parsed = { command: '', message: '', unsafe: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--command')
            parsed.command = argv[(i += 1)] ?? '';
        else if (arg === '--message')
            parsed.message = argv[(i += 1)] ?? '';
        else if (arg === '--unsafe')
            parsed.unsafe.push(argv[(i += 1)] ?? '');
        else
            fail(`unknown argument ${JSON.stringify(arg)}`, 2);
    }
    if (!parsed.command)
        fail('missing --command — the adoption command to run', 2);
    if (!parsed.message)
        fail('missing --message — the regeneration commit message', 2);
    return parsed;
}
function haltIfUnsafe(before, unsafe) {
    const matchers = unsafe.map(globToRegExp);
    const atRisk = before.filter(entry => isHeadUnknown(entry.xy) && matchers.some(match => match.test(entry.path)));
    if (atRisk.length === 0)
        return;
    const lines = ['refusing to run: untracked file(s) under unsafe tree(s):'];
    for (const entry of atRisk) {
        lines.push(`  ${entry.path}`);
        lines.push(`  remedy: git stash push -u -- ${quotePath(entry.path)}`);
    }
    fail(lines.join('\n'), 2);
}
function runWriterCommand(dir, command) {
    const ran = (0, node_child_process_1.spawnSync)(command, { cwd: dir, shell: true, encoding: 'utf-8' });
    if (ran.error)
        fail(`could not run the command: ${String(ran.error)}`, 1);
    if (ran.status !== 0) {
        const detail = (ran.stderr || ran.stdout || '').trim();
        fail(`the command exited ${ran.status} — nothing was committed${detail ? `: ${detail}` : ''}`, 1);
    }
}
function computeStagedSet(before, after, beforeDigests, afterDigests) {
    const staged = new Set();
    const beforeByPath = new Map(before.map(entry => [entry.path, entry.xy]));
    const afterByPath = new Map(after.map(entry => [entry.path, entry.xy]));
    for (const entry of after) {
        if (beforeByPath.get(entry.path) !== entry.xy)
            staged.add(entry.path);
    }
    for (const entry of before) {
        if (!afterByPath.has(entry.path))
            staged.add(entry.path);
    }
    for (const [path, sha] of beforeDigests) {
        const now = afterDigests.get(path);
        if (now !== undefined && now !== sha)
            staged.add(path);
    }
    return staged;
}
function buildRecoverRows(before, beforeDigests, afterDigests, removed) {
    const rows = [];
    for (const path of [...beforeDigests.keys()].sort()) {
        const sha = beforeDigests.get(path);
        if (afterDigests.get(path) !== undefined) {
            if (afterDigests.get(path) !== sha) {
                rows.push(`overwrote uncommitted changes in: ${path} (recover: git cat-file -p ${sha} > ${path})`);
            }
            continue;
        }
        const entry = before.find(e => e.path === path);
        if (entry && isHeadUnknown(entry.xy)) {
            removed.push(path);
            rows.push(`removed untracked: ${path} (recover: git cat-file -p ${sha} > ${path})`);
        }
    }
    return rows;
}
function commitStagedSet(dir, message, stageable, rows) {
    const added = sh(dir, ['add', '--', ...stageable]);
    if (!added.ok)
        fail(`could not stage the regenerated paths: ${added.err.trim()}`, 1);
    const cached = sh(dir, ['diff', '--cached', '--quiet', '--', ...stageable]);
    if (cached.ok) {
        const suffix = rows.length > 0 ? `; ${rows.join('; ')}` : '';
        process.stdout.write(`no commit — every regenerated path already equals HEAD${suffix}\n`);
        return;
    }
    const committed = sh(dir, ['commit', '-m', message, '--', ...stageable]);
    if (!committed.ok)
        fail(`could not commit the regenerated paths: ${committed.err.trim()}`, 1);
    const short = sh(dir, ['rev-parse', '--short', 'HEAD']);
    const listed = sh(dir, ['show', '--name-only', '--format=', '-z', 'HEAD']);
    const files = listed.out.split('\0').filter(Boolean);
    const suffix = rows.length > 0 ? `; ${rows.join('; ')}` : '';
    process.stdout.write(`regenerated — commit ${short.out.trim()}, ${files.length} file(s)${suffix}\n`);
}
function main() {
    const { command, message, unsafe } = parseArgs(process.argv.slice(2));
    const dir = process.cwd();
    const before = snapshotEntries(dir);
    const beforeDigests = digestPaths(dir, before.map(entry => entry.path), true);
    haltIfUnsafe(before, unsafe);
    runWriterCommand(dir, command);
    const after = snapshotEntries(dir);
    const afterDigests = digestPaths(dir, [...beforeDigests.keys()].filter(path => (0, node_fs_1.existsSync)(`${dir}/${path}`)), false);
    const staged = computeStagedSet(before, after, beforeDigests, afterDigests);
    const removed = [];
    const rows = buildRecoverRows(before, beforeDigests, afterDigests, removed);
    const stageable = [...staged].filter(path => !removed.includes(path)).sort();
    if (stageable.length === 0) {
        process.stdout.write('no-op\n');
        return;
    }
    commitStagedSet(dir, message, stageable, rows);
}
exports.main = main;
if (require.main === module)
    main();
