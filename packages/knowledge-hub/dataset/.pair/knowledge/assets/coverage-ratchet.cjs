// GENERATED FILE — do not edit.
// Source: packages/knowledge-hub/src/tools/coverage-baseline-ratchet.ts
// Regenerate: pnpm --filter @pair/knowledge-hub ratchet:asset

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderRatchetPlan = exports.ratchetGitPlan = exports.ratchetBranchConfigCommand = exports.gitAuthConfig = exports.ratchetTrackingRefspec = exports.classifyWriteRefusal = exports.applyRaises = exports.planRatchet = exports.shouldSkipCommitBack = exports.readGuardrailFlag = exports.readCommitBackFlag = exports.readBaselineValue = exports.proposeBaseline = exports.EXTRAHEADER_CONFIG_KEY = exports.ADL_SLUG = exports.TOKEN_ENV = exports.DEFAULT_MARGIN_PP = exports.RATCHET_BRANCH = exports.RATCHET_MARKER = void 0;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
exports.RATCHET_MARKER = '[coverage-baseline-ratchet]';
exports.RATCHET_BRANCH = 'chore/coverage-baseline-ratchet';
exports.DEFAULT_MARGIN_PP = 1;
exports.TOKEN_ENV = 'COVERAGE_RATCHET_TOKEN';
exports.ADL_SLUG = '2026-07-30-coverage-ratchet-pr-not-push';
exports.EXTRAHEADER_CONFIG_KEY = 'http.https://github.com/.extraheader';
const DEFAULT_CONFIG_PATH = '.pair/adoption/tech/coverage-baseline.md';
const DEFAULT_WOW_PATH = '.pair/adoption/tech/way-of-working.md';
const BOT_NAME = 'pair-coverage-ratchet[bot]';
const BOT_EMAIL = 'pair-coverage-ratchet[bot]@users.noreply.github.com';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isNumeric = (v) => typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim());
function proposeBaseline(measuredPct, marginPp = exports.DEFAULT_MARGIN_PP) {
    return Math.max(0, Math.floor(measuredPct) - marginPp);
}
exports.proposeBaseline = proposeBaseline;
function readBaselineValue(configText, type) {
    const m = new RegExp(`^baseline\\.${esc(type)}=([^\\r\\n]*)`, 'm').exec(configText);
    if (!m)
        return null;
    const raw = (m[1] ?? '').trim();
    return /^\d+$/.test(raw) ? Number(raw) : null;
}
exports.readBaselineValue = readBaselineValue;
const flagPattern = (label) => new RegExp(`^[ \\t]*[-*][ \\t]*\\**[ \\t]*${label}[ \\t]*\\**[ \\t]*:[ \\t]*\`?[ \\t]*(enabled|disabled)`, 'im');
const COMMIT_BACK_FLAG = flagPattern('coverage[ \\t]+baseline[ \\t]+commit-back');
const GUARDRAIL_FLAG = flagPattern('coverage[ \\t]+guardrail');
const readFlag = (text, pattern) => {
    const m = pattern.exec(text);
    return m ? (m[1] ?? '').toLowerCase() : 'absent';
};
function readCommitBackFlag(wayOfWorkingText) {
    return readFlag(wayOfWorkingText, COMMIT_BACK_FLAG);
}
exports.readCommitBackFlag = readCommitBackFlag;
function readGuardrailFlag(wayOfWorkingText) {
    return readFlag(wayOfWorkingText, GUARDRAIL_FLAG);
}
exports.readGuardrailFlag = readGuardrailFlag;
const RATCHET_MERGE_SUBJECT = new RegExp(`^Merge pull request #\\d+ from \\S+/${esc(exports.RATCHET_BRANCH)}[ \\t\\r]*$`, 'm');
function isRatchetCommitMessage(message) {
    return message.includes(exports.RATCHET_MARKER) || RATCHET_MERGE_SUBJECT.test(message);
}
function shouldSkipCommitBack(ctx) {
    if (ctx.commitBackFlag !== 'enabled') {
        return {
            skip: true,
            code: 'flag-disabled',
            reason: `Coverage baseline commit-back is '${ctx.commitBackFlag}' (default: off) — nothing is written`,
        };
    }
    if (ctx.guardrailFlag !== 'enabled') {
        return {
            skip: true,
            code: 'guardrail-disabled',
            reason: `the parent Coverage guardrail is '${ctx.guardrailFlag}' — the commit-back opt-in is nested under it, and a baseline is not ratcheted for a gate that does not run`,
        };
    }
    if (ctx.eventName !== 'push' || ctx.refName !== ctx.baseBranch) {
        return {
            skip: true,
            code: 'not-base-push',
            reason: `only a push to '${ctx.baseBranch}' writes back (got event '${ctx.eventName}' on '${ctx.refName}') — a pull request never does, see ADL ${exports.ADL_SLUG}`,
        };
    }
    if (isRatchetCommitMessage(ctx.headCommitMessage)) {
        return {
            skip: true,
            code: 'automated-commit',
            reason: `head commit is the ratchet's own ${exports.RATCHET_MARKER} — stopping the loop`,
        };
    }
    return { skip: false };
}
exports.shouldSkipCommitBack = shouldSkipCommitBack;
function planRatchet(configText, measured, marginPp = exports.DEFAULT_MARGIN_PP) {
    return Object.keys(measured).map(type => {
        const raw = measured[type];
        if (!isNumeric(raw === undefined ? undefined : String(raw))) {
            return {
                type,
                measured: null,
                current: readBaselineValue(configText, type),
                proposed: null,
                action: 'not-measured',
                reason: `no usable coverage measured for '${type}' — nothing written (the gate's own fail-safe still applies)`,
            };
        }
        const measuredPct = Number(raw);
        const current = readBaselineValue(configText, type);
        const proposed = proposeBaseline(measuredPct, marginPp);
        if (current === null) {
            return {
                type,
                measured: measuredPct,
                current: null,
                proposed,
                action: 'no-baseline-configured',
                reason: `no valid committed baseline.${type} in the config — reporting the suggestion ${proposed} only, writing nothing (a first baseline stays a human commit)`,
            };
        }
        if (proposed > current) {
            return {
                type,
                measured: measuredPct,
                current,
                proposed,
                action: 'raise',
                reason: `measured ${measuredPct}% => baseline ${proposed} (floor - ${marginPp}pp margin), above committed ${current}`,
            };
        }
        return {
            type,
            measured: measuredPct,
            current,
            proposed,
            action: 'hold',
            reason: `measured ${measuredPct}% => baseline ${proposed}, not above committed ${current} — the ratchet only ever moves up`,
        };
    });
}
exports.planRatchet = planRatchet;
function applyRaises(configText, raises, { pendingText } = {}) {
    let text = configText;
    let changedLines = 0;
    const dropped = [];
    for (const raise of raises) {
        if (raise.proposed === null) {
            dropped.push(raise);
            continue;
        }
        const onDisk = readBaselineValue(text, raise.type);
        if (onDisk === null) {
            dropped.push(raise);
            continue;
        }
        const pending = pendingText ? readBaselineValue(pendingText, raise.type) : null;
        const floor = pending === null ? onDisk : Math.max(onDisk, pending);
        if (raise.proposed <= floor) {
            dropped.push(raise);
            continue;
        }
        const re = new RegExp(`^(baseline\\.${esc(raise.type)}=)([^\\r\\n]*)`, 'm');
        text = text.replace(re, `$1${raise.proposed}`);
        changedLines += 1;
    }
    return { text, changedLines, dropped };
}
exports.applyRaises = applyRaises;
function classifyWriteRefusal(output, opts) {
    if (!opts.hasToken) {
        return {
            code: 'missing-credential',
            message: `no write credential: ${exports.TOKEN_ENV} is not set (a repo-scoped token with contents:write + pull-requests:write — see ADL ${exports.ADL_SLUG})`,
        };
    }
    if (/GH006|protected branch/i.test(output)) {
        return { code: 'protected-branch', message: `refused by branch protection: ${output.trim()}` };
    }
    if (/permission to .* denied|not accessible by integration|403|insufficient/i.test(output)) {
        return {
            code: 'insufficient-scope',
            message: `credential lacks the required permission: ${output.trim()}`,
        };
    }
    if (/stale info|force-with-lease|non-fast-forward|\[rejected\]/i.test(output)) {
        return {
            code: 'stale-lease',
            message: `the ratchet branch moved under us (concurrent run): ${output.trim()}`,
        };
    }
    return { code: 'unknown', message: `write refused, reason not recognized: ${output.trim()}` };
}
exports.classifyWriteRefusal = classifyWriteRefusal;
function ratchetPrBody(raises, configPath, baseBranch) {
    return [
        `Automated coverage-baseline ratchet — opt-in commit-back from story #372.`,
        ``,
        `| Type | Committed | Measured | New baseline |`,
        `| --- | --- | --- | --- |`,
        ...raises.map(r => `| \`${r.type}\` | ${r.current} | ${r.measured}% | **${r.proposed}** |`),
        ``,
        `Only \`baseline.<type>\` values in \`${configPath}\` are edited, in place; the ratchet never lowers a baseline.`,
        `New values are \`floor(measured) - ${exports.DEFAULT_MARGIN_PP}pp\`, the margin that file already documents.`,
        ``,
        `Why a pull request and not a push to \`${baseBranch}\`: \`.pair/adoption/decision-log/${exports.ADL_SLUG}.md\`.`,
        `Merging this raises the guardrail's floor. Closing it declines the raise; the next base-branch push will propose it again.`,
    ].join('\n');
}
function ratchetTrackingRefspec(remote) {
    return `+refs/heads/${exports.RATCHET_BRANCH}:refs/remotes/${remote}/${exports.RATCHET_BRANCH}`;
}
exports.ratchetTrackingRefspec = ratchetTrackingRefspec;
function gitAuthConfig(token) {
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    return {
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: exports.EXTRAHEADER_CONFIG_KEY,
        GIT_CONFIG_VALUE_0: '',
        GIT_CONFIG_KEY_1: exports.EXTRAHEADER_CONFIG_KEY,
        GIT_CONFIG_VALUE_1: `AUTHORIZATION: basic ${basic}`,
        GH_TOKEN: token,
    };
}
exports.gitAuthConfig = gitAuthConfig;
function ratchetBranchConfigCommand(remote, configPath) {
    return ['git', 'show', `refs/remotes/${remote}/${exports.RATCHET_BRANCH}:${configPath}`];
}
exports.ratchetBranchConfigCommand = ratchetBranchConfigCommand;
const EMPTY_GIT_PLAN = {
    prepare: [],
    commands: [],
    prUpdate: [],
    restore: [],
    commitMessage: '',
    prTitle: '',
    prBody: '',
};
function ratchetWriteCommands(args) {
    const { configPath, commitMessage, prTitle, prBody, baseBranch, remote, withRefspec } = args;
    return [
        { argv: ['git', 'config', 'user.name', BOT_NAME] },
        { argv: ['git', 'config', 'user.email', BOT_EMAIL] },
        { argv: ['git', 'add', '--', configPath] },
        { argv: ['git', 'commit', '-m', commitMessage] },
        {
            argv: [
                'git',
                ...withRefspec,
                'push',
                '--force-with-lease',
                remote,
                `HEAD:refs/heads/${exports.RATCHET_BRANCH}`,
            ],
        },
        {
            argv: [
                'gh',
                'pr',
                'create',
                '--base',
                baseBranch,
                '--head',
                exports.RATCHET_BRANCH,
                '--title',
                prTitle,
                '--body',
                prBody,
            ],
        },
    ];
}
function ratchetGitPlan(input) {
    const { raises, configPath, baseBranch, remote, headCommit } = input;
    if (raises.length === 0)
        return EMPTY_GIT_PLAN;
    const summary = raises.map(r => `${r.type} ${r.current}->${r.proposed}`).join(', ');
    const commitMessage = `chore: ratchet coverage baseline (${summary}) ${exports.RATCHET_MARKER}`;
    const prTitle = `chore: ratchet coverage baseline ${exports.RATCHET_MARKER}`;
    const prBody = ratchetPrBody(raises, configPath, baseBranch);
    const trackingRefspec = ratchetTrackingRefspec(remote);
    const withRefspec = ['-c', `remote.${remote}.fetch=${trackingRefspec}`];
    return {
        prepare: [
            {
                argv: ['git', ...withRefspec, 'fetch', '--no-tags', remote, trackingRefspec],
                optional: true,
            },
        ],
        commands: ratchetWriteCommands({
            configPath,
            commitMessage,
            prTitle,
            prBody,
            baseBranch,
            remote,
            withRefspec,
        }),
        prUpdate: ['gh', 'pr', 'edit', exports.RATCHET_BRANCH, '--title', prTitle, '--body', prBody],
        restore: [
            { argv: ['git', 'reset', '--mixed', headCommit] },
            { argv: ['git', 'checkout', '--', configPath] },
        ],
        commitMessage,
        prTitle,
        prBody,
    };
}
exports.ratchetGitPlan = ratchetGitPlan;
function renderRatchetPlan({ skip, plan }) {
    if (skip?.skip) {
        return `coverage-ratchet: SKIPPED (${skip.code}) — ${skip.reason}`;
    }
    const lines = plan.map(p => `coverage-ratchet: ${p.type} — ${p.action}: ${p.reason} [measured=${p.measured ?? 'n/a'} committed=${p.current ?? 'n/a'} proposed=${p.proposed ?? 'n/a'}]`);
    if (!plan.some(p => p.action === 'raise')) {
        lines.push('coverage-ratchet: no raise — nothing to commit back');
    }
    return lines.join('\n');
}
exports.renderRatchetPlan = renderRatchetPlan;
const CLI_FLAGS = {
    '--config': { takesValue: true, apply: (o, v) => void (o.configPath = v) },
    '--way-of-working': { takesValue: true, apply: (o, v) => void (o.wowPath = v) },
    '--measured': {
        takesValue: true,
        apply: (o, v) => {
            for (const entry of v.split(',')) {
                const [type, pct] = entry.split('=');
                if (!type || pct === undefined)
                    throw new Error('--measured expects comma-separated <type>=<pct> entries');
                o.measured[type] = pct;
            }
        },
    },
    '--base-branch': { takesValue: true, apply: (o, v) => void (o.baseBranch = v) },
    '--remote': { takesValue: true, apply: (o, v) => void (o.remote = v) },
    '--margin': {
        takesValue: true,
        apply: (o, v) => {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0) {
                throw new Error(`--margin expects a non-negative number, got '${v}'`);
            }
            o.marginPp = n;
        },
    },
    '--dry-run': { takesValue: false, apply: o => void (o.dryRun = true) },
    '--': { takesValue: false, apply: () => undefined },
};
function parseCliArgs(argv, env) {
    const opts = {
        configPath: DEFAULT_CONFIG_PATH,
        wowPath: DEFAULT_WOW_PATH,
        measured: {},
        baseBranch: env['PAIR_RATCHET_BASE_BRANCH'] || 'main',
        remote: 'origin',
        marginPp: exports.DEFAULT_MARGIN_PP,
        dryRun: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const flag = CLI_FLAGS[arg];
        if (flag === undefined)
            throw new Error(`unknown argument '${arg}'`);
        let value;
        if (flag.takesValue) {
            value = argv[i + 1];
            if (value === undefined)
                throw new Error(`${arg} requires a value`);
            i += 1;
        }
        flag.apply(opts, value);
    }
    return opts;
}
function gitAuthEnv(token) {
    return { ...process.env, ...gitAuthConfig(token) };
}
function warn(message) {
    console.log(`::warning::coverage-ratchet: ${message}`);
}
function anchorToRepoRoot() {
    try {
        const root = (0, node_child_process_1.execFileSync)('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' });
        process.chdir(root.trim());
    }
    catch {
        warn('could not resolve the repository root — resolving paths from the current directory');
    }
}
function failureOutput(e) {
    const err = e;
    return `${err.stderr?.toString() ?? ''}${err.stdout?.toString() ?? ''}` || err.message || '';
}
function printDryRun(gitPlan) {
    console.log('coverage-ratchet: DRY RUN — would run:');
    for (const { argv, optional } of [...gitPlan.prepare, ...gitPlan.commands]) {
        console.log(`  ${argv.join(' ')}${optional === true ? '   # failure tolerated' : ''}`);
    }
    for (const { argv } of gitPlan.restore) {
        console.log(`  ${argv.join(' ')}   # always, restores the workspace`);
    }
}
function runPrepare(gitPlan, env) {
    for (const { argv } of gitPlan.prepare) {
        const [bin, ...args] = argv;
        if (bin === undefined)
            continue;
        try {
            (0, node_child_process_1.execFileSync)(bin, args, { env, stdio: 'pipe' });
        }
        catch {
    void 0 // deliberately ignored
  }
    }
}
function readPendingConfig(remote, configPath, env) {
    const [bin, ...args] = ratchetBranchConfigCommand(remote, configPath);
    try {
        return (0, node_child_process_1.execFileSync)(bin, args, { encoding: 'utf-8', env, stdio: 'pipe' });
    }
    catch {
        return null;
    }
}
function writeRaises(configPath, raises, pendingText) {
    const applied = applyRaises((0, node_fs_1.readFileSync)(configPath, 'utf-8'), raises, { pendingText });
    if (applied.changedLines === 0) {
        const types = applied.dropped.map(d => d.type).join(', ');
        warn(`nothing written — the config already holds a value at or above every proposal (${types}), on the base branch or on the open ratchet branch; a concurrent run won the race`);
        return false;
    }
    (0, node_fs_1.writeFileSync)(configPath, applied.text);
    return true;
}
function refreshOpenPr(prUpdate, env) {
    const [bin, ...args] = prUpdate;
    try {
        (0, node_child_process_1.execFileSync)(bin, args, { env, stdio: 'pipe' });
    }
    catch {
        warn('ratchet PR is already open but its title/body could not be refreshed');
    }
}
function runPlan(gitPlan, env) {
    for (const { argv, optional } of gitPlan.commands) {
        const [bin, ...args] = argv;
        if (bin === undefined)
            continue;
        try {
            (0, node_child_process_1.execFileSync)(bin, args, { env, stdio: 'pipe' });
        }
        catch (e) {
            if (optional === true)
                continue;
            const output = failureOutput(e);
            if (bin === 'gh' && /already exists/i.test(output)) {
                refreshOpenPr(gitPlan.prUpdate, env);
                continue;
            }
            const { message } = classifyWriteRefusal(output, { hasToken: true });
            warn(`${message} (while running: ${bin} ${args[0]})`);
            return false;
        }
    }
    return true;
}
function restoreWorkspace(restore) {
    for (const { argv } of restore) {
        const [bin, ...args] = argv;
        if (bin === undefined)
            continue;
        try {
            (0, node_child_process_1.execFileSync)(bin, args, { stdio: 'pipe' });
        }
        catch {
            warn(`could not restore the checkout after the ratchet attempt (${argv.join(' ')})`);
        }
    }
}
function parseOrExit() {
    try {
        return parseCliArgs(process.argv.slice(2), process.env);
    }
    catch (e) {
        console.log(`::error::coverage-ratchet: ${e.message}`);
        process.exit(1);
    }
}
function resolveSkip(opts) {
    const wow = (0, node_fs_1.readFileSync)(opts.wowPath, 'utf-8');
    return shouldSkipCommitBack({
        commitBackFlag: readCommitBackFlag(wow),
        guardrailFlag: readGuardrailFlag(wow),
        eventName: process.env['GITHUB_EVENT_NAME'] || '',
        refName: process.env['GITHUB_REF_NAME'] || '',
        baseBranch: opts.baseBranch,
        headCommitMessage: process.env['PAIR_RATCHET_HEAD_COMMIT_MESSAGE'] || '',
    });
}
function commitBack(opts, gitPlan, raises) {
    const token = process.env[exports.TOKEN_ENV] || '';
    if (!token) {
        warn(classifyWriteRefusal('', { hasToken: false }).message);
        return;
    }
    const env = gitAuthEnv(token);
    runPrepare(gitPlan, env);
    const pendingText = readPendingConfig(opts.remote, opts.configPath, env);
    if (!writeRaises(opts.configPath, raises, pendingText))
        return;
    try {
        if (runPlan(gitPlan, env)) {
            const raised = raises.map(r => `${r.type}=${r.proposed}`).join(', ');
            console.log(`coverage-ratchet: raised ${raised} via the ratchet PR`);
        }
    }
    finally {
        restoreWorkspace(gitPlan.restore);
    }
}
function run(opts) {
    anchorToRepoRoot();
    const skip = resolveSkip(opts);
    if (skip.skip) {
        console.log(renderRatchetPlan({ skip, plan: [] }));
        return;
    }
    const plan = planRatchet((0, node_fs_1.readFileSync)(opts.configPath, 'utf-8'), opts.measured, opts.marginPp);
    console.log(renderRatchetPlan({ plan }));
    const raises = plan.filter(p => p.action === 'raise');
    if (raises.length === 0)
        return;
    const gitPlan = ratchetGitPlan({
        raises,
        configPath: opts.configPath,
        baseBranch: opts.baseBranch,
        remote: opts.remote,
        headCommit: (0, node_child_process_1.execFileSync)('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim(),
    });
    if (opts.dryRun) {
        printDryRun(gitPlan);
        return;
    }
    commitBack(opts, gitPlan, raises);
}
function main() {
    const opts = parseOrExit();
    try {
        run(opts);
    }
    catch (e) {
        warn(`commit-back could not run: ${e.message} — the coverage gate's verdict is unaffected`);
    }
}
if (require.main === module) {
    main();
}
