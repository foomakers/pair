// GENERATED FILE — do not edit.
// Source: packages/knowledge-hub/src/tools/codex-fanout.ts
// Regenerate: pnpm --filter @pair/knowledge-hub codex:asset

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.COMMANDS = exports.resumePlan = exports.reconstructState = exports.appendAudit = exports.auditLine = exports.collectOutcome = exports.schemaViolations = exports.TERMINAL_OUTCOMES = exports.buildPacket = exports.assertBlind = exports.PacketRejected = exports.BLIND_DENY_PREFIXES = exports.isPhase = exports.PHASE_CONTRACTS = exports.PHASES = exports.effectiveParallelism = exports.resolveRealization = exports.HARNESS_SURFACE_MAP = exports.REALIZATION_TIERS = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
exports.REALIZATION_TIERS = Object.freeze({
    IN_HARNESS: 1,
    EXTERNAL_DRIVER: 2,
    DEGRADED: 3,
});
const CODEX_MULTI_AGENT_V2 = {
    id: 'codex-multi-agent-v2',
    tier: exports.REALIZATION_TIERS.IN_HARNESS,
    harness: 'codex',
    namespace: '',
    namespaceKey: 'features.multi_agent_v2.tool_namespace',
    handles: { spawn: 'spawn', wait: 'wait', cancel: 'interrupt_agent' },
    gating: { featureKey: 'features.multi_agent_v2', defaultOn: false },
    bounding: {
        concurrencyKey: 'features.multi_agent_v2.max_concurrent_threads_per_session',
        waitTimeoutKeys: {
            min: 'features.multi_agent_v2.min_wait_timeout_ms',
            max: 'features.multi_agent_v2.max_wait_timeout_ms',
            default: 'features.multi_agent_v2.default_wait_timeout_ms',
        },
    },
    verifiedAgainst: 'codex-cli 0.149.0 — `codex features list` (stable, default off), 2026-08-22',
};
const CODEX_MULTI_AGENT_V1 = {
    id: 'codex-multi-agent-v1',
    tier: exports.REALIZATION_TIERS.IN_HARNESS,
    harness: 'codex',
    namespace: '',
    handles: {
        spawn: 'spawn_agent',
        wait: 'wait_agent',
        cancel: 'close_agent',
        resume: 'resume_agent',
    },
    gating: { featureKey: 'features.multi_agent', defaultOn: true },
    bounding: {
        concurrencyKey: 'agents.max_concurrent_threads_per_session',
        waitTimeoutKeys: {
            min: 'features.multi_agent_v2.min_wait_timeout_ms',
            max: 'features.multi_agent_v2.max_wait_timeout_ms',
            default: 'features.multi_agent_v2.default_wait_timeout_ms',
        },
    },
    verifiedAgainst: 'codex-cli 0.149.0 — `codex features list` (stable, default on), 2026-08-22',
};
exports.HARNESS_SURFACE_MAP = Object.freeze([
    CODEX_MULTI_AGENT_V2,
    CODEX_MULTI_AGENT_V1,
]);
function qualify(namespace, handle) {
    return namespace === '' ? handle : `${namespace}.${handle}`;
}
function matchRealization(def, exposed, namespaceOverride) {
    const ns = typeof namespaceOverride === 'string' ? namespaceOverride : def.namespace;
    const spawn = qualify(ns, def.handles.spawn);
    const wait = qualify(ns, def.handles.wait);
    return exposed.has(spawn) && exposed.has(wait) ? { spawn, wait } : null;
}
const DEGRADED_REASON = 'no fan-out primitive is exposed in this session — availability is established by probing ' +
    'the tools the session actually offers, never by the product name or a version';
function degrade(probe) {
    const external = probe.externalDriverAvailable === true;
    const tier = external ? exports.REALIZATION_TIERS.EXTERNAL_DRIVER : exports.REALIZATION_TIERS.DEGRADED;
    const realization = external ? 'external-driver' : 'degraded-one-card';
    const next = external
        ? 'degrading to the external driver: one fresh process per iteration, re-invoked on the continue-token'
        : 'degrading to the one-card path: exactly one eligible card driven to its gate, then a continue-token';
    return {
        tier,
        realization,
        primitive: null,
        reason: `${DEGRADED_REASON}; ${next}`,
        announcement: `fan-out realization: ${realization} (tier ${tier}) — ${next}`,
        harnessCeiling: null,
    };
}
function resolveRealization(probe) {
    const exposed = new Set((probe.tools ?? []).filter(t => typeof t === 'string'));
    for (const def of exports.HARNESS_SURFACE_MAP) {
        const hit = matchRealization(def, exposed, probe.namespace);
        if (!hit)
            continue;
        const ceiling = Number.isInteger(probe.harnessCeiling) ? probe.harnessCeiling : null;
        const reason = `probed this session: \`${hit.spawn}\` and \`${hit.wait}\` are both exposed ` +
            `(gated by \`${def.gating.featureKey}\`, default ${def.gating.defaultOn ? 'on' : 'off'}; ` +
            `verified against ${def.verifiedAgainst})`;
        return {
            tier: def.tier,
            realization: def.id,
            primitive: hit.spawn,
            reason,
            announcement: `fan-out realization: ${def.id} (tier ${def.tier}, ${def.harness}) — bound to \`${hit.spawn}\`/\`${hit.wait}\`; ${reason}`,
            harnessCeiling: ceiling,
        };
    }
    return degrade(probe);
}
exports.resolveRealization = resolveRealization;
function ceilingEntries(c) {
    const entries = [
        { source: 'dependency', value: c.dependencyAllowed },
        { source: 'policy', value: c.policyMax },
    ];
    if (typeof c.harnessCeiling === 'number')
        entries.push({ source: 'harness', value: c.harnessCeiling });
    return entries;
}
function effectiveParallelism(c) {
    const entries = ceilingEntries(c);
    for (const entry of entries)
        if (!Number.isInteger(entry.value) || entry.value < 0)
            throw new Error(`codex-fanout: a ceiling must be a non-negative integer, got ${JSON.stringify(entry.value)}. ` +
                `A malformed ceiling is never rounded into a usable one — the run stops here.`);
    let best = { source: 'dependency', value: c.dependencyAllowed };
    for (const entry of entries)
        if (entry.value < best.value)
            best = entry;
    const detail = entries.map(e => `${e.source}=${e.value}`).join(', ');
    const suffix = best.value === 0 ? ' — nothing is dispatched this iteration' : '';
    return {
        cap: best.value,
        boundBy: best.source,
        line: `effective parallelism: ${best.value} (bound by ${best.source}; ${detail})${suffix}`,
    };
}
exports.effectiveParallelism = effectiveParallelism;
exports.PHASES = ['implement', 'pr', 'review', 'fix'];
const STEP_SCHEMA = {
    type: 'object',
    properties: {
        branch: { type: 'string' },
        checkpointPath: { type: 'string' },
        gatesPassed: { type: 'boolean' },
        summary: { type: 'string' },
    },
    required: ['gatesPassed'],
};
const PR_SCHEMA = {
    type: 'object',
    properties: { prNumber: { type: 'number' }, url: { type: 'string' } },
    required: ['prNumber'],
};
const REVIEW_SCHEMA = {
    type: 'object',
    properties: {
        verdict: { type: 'string' },
        needsHumanDecision: { type: 'boolean' },
        findings: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    location: { type: 'string' },
                    severity: { type: 'string' },
                    description: { type: 'string' },
                    recommendation: { type: 'string' },
                    nonActionable: { type: 'boolean' },
                    disposition: { type: 'string' },
                },
            },
        },
    },
    required: ['verdict'],
};
const FIX_SCHEMA = {
    type: 'object',
    properties: { fixed: { type: 'boolean' }, needsHumanDecision: { type: 'boolean' } },
    required: ['fixed'],
};
exports.PHASE_CONTRACTS = Object.freeze({
    implement: {
        role: 'implementer',
        skill: '/pair-process-implement',
        schema: STEP_SCHEMA,
        blind: false,
    },
    pr: {
        role: 'implementer',
        skill: '/pair-capability-publish-pr',
        schema: PR_SCHEMA,
        blind: false,
    },
    review: { role: 'reviewer', skill: '/pair-process-review', schema: REVIEW_SCHEMA, blind: true },
    fix: { role: 'implementer', skill: '/pair-process-implement', schema: FIX_SCHEMA, blind: false },
});
function isPhase(value) {
    return typeof value === 'string' && exports.PHASES.includes(value);
}
exports.isPhase = isPhase;
exports.BLIND_DENY_PREFIXES = Object.freeze(['.pair/working/']);
const WORKTREE_ROOT_DEFAULT = '../pair-worktrees';
class PacketRejected extends Error {
    constructor(message) {
        super(message);
        this.name = 'PacketRejected';
    }
}
exports.PacketRejected = PacketRejected;
function normalizeAttachment(entry) {
    if (typeof entry !== 'string' || entry.trim() === '')
        throw new PacketRejected('codex-fanout: an attachment must be a non-empty path');
    if ((0, node_path_1.isAbsolute)(entry))
        throw new PacketRejected(`codex-fanout: attachment \`${entry}\` is absolute; a packet references project-relative paths only`);
    return (0, node_path_1.normalize)(entry).replace(/\\/g, '/');
}
function assertBlind(attachments, phase) {
    for (const raw of attachments) {
        const entry = normalizeAttachment(raw);
        for (const denied of exports.BLIND_DENY_PREFIXES)
            if (entry === denied.replace(/\/$/, '') || entry.startsWith(denied))
                throw new PacketRejected(`codex-fanout: the ${phase} packet would carry \`${entry}\`, which is under \`${denied}\` — ` +
                    `the ${phase} role is blind to the authoring chain's working artifacts. Rejected before spawn.`);
    }
}
exports.assertBlind = assertBlind;
function assertSingleCard(card) {
    const missing = ['id', 'title', 'branch'].filter(k => typeof card?.[k] !== 'string' || card[k].trim() === '');
    if (missing.length > 0)
        throw new PacketRejected(`codex-fanout: a packet describes exactly one card and needs ${missing.join(', ')}; ` +
            `a packet assembled from an incomplete card would spawn a subagent that has to guess its scope`);
}
const ROLE_INSTRUCTIONS = Object.freeze({
    implementer: 'You are the authoring chain for ONE story: implement, open or update its single PR, and apply review fixes. ' +
        'You NEVER merge, never close the story and never delete branches. Work only inside the worktree named below. ' +
        'Return the declared schema and nothing else.',
    reviewer: 'You are an INDEPENDENT reviewer for ONE pull request. You did not write this code and you must not act as if you had: ' +
        'review the story acceptance criteria, the PR diff and the code, and nothing else. ' +
        'You MUST NOT read the authoring chain’s working artifacts. You NEVER merge, whatever the verdict. ' +
        'Return the declared schema and nothing else.',
});
function buildPacket(request) {
    if (!isPhase(request?.phase))
        throw new PacketRejected(`codex-fanout: unknown phase ${JSON.stringify(request?.phase)}; expected one of ${exports.PHASES.join(', ')}`);
    const contract = exports.PHASE_CONTRACTS[request.phase];
    assertSingleCard(request.card);
    const attachments = (request.attachments ?? []).map(normalizeAttachment);
    if (contract.blind)
        assertBlind(attachments, request.phase);
    const root = request.worktreeRoot ?? WORKTREE_ROOT_DEFAULT;
    return {
        phase: request.phase,
        role: contract.role,
        skill: contract.skill,
        card: request.card,
        worktree: `${root}/${request.card.id}`,
        schema: contract.schema,
        attachments,
        instructions: ROLE_INSTRUCTIONS[contract.role],
        blind: contract.blind,
    };
}
exports.buildPacket = buildPacket;
exports.TERMINAL_OUTCOMES = [
    'completed',
    'failed-validation',
    'timed-out',
    'cancelled',
    'died',
    'not-started',
];
const STATUS_MAP = Object.freeze({
    completed: 'completed',
    succeeded: 'completed',
    ok: 'completed',
    timeout: 'timed-out',
    'timed-out': 'timed-out',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    interrupted: 'cancelled',
    failed: 'died',
    error: 'died',
    died: 'died',
    'not-started': 'not-started',
    'spawn-failed': 'not-started',
});
function failClosed(outcome, reason) {
    return { outcome, advances: false, reason, value: null };
}
function objectViolations(value, schema, path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return [`${path} must be an object`];
    const record = value;
    const errs = [];
    for (const key of schema.required ?? [])
        if (record[key] === undefined)
            errs.push(`${path}.${key} is required and absent`);
    for (const [key, sub] of Object.entries(schema.properties ?? {}))
        if (record[key] !== undefined)
            errs.push(...schemaViolations(record[key], sub, `${path}.${key}`));
    return errs;
}
function arrayViolations(value, schema, path) {
    if (!Array.isArray(value))
        return [`${path} must be an array`];
    const items = schema.items;
    if (!items)
        return [];
    return value.flatMap((item, i) => schemaViolations(item, items, `${path}[${i}]`));
}
function schemaViolations(value, schema, path = 'value') {
    if (schema.type === 'object')
        return objectViolations(value, schema, path);
    if (schema.type === 'array')
        return arrayViolations(value, schema, path);
    const actual = typeof value;
    return actual === schema.type ? [] : [`${path} must be ${schema.type}, got ${actual}`];
}
exports.schemaViolations = schemaViolations;
function classifyWait(result) {
    const mapped = STATUS_MAP[String(result.status ?? '').toLowerCase()];
    if (!mapped)
        return failClosed('failed-validation', `unrecognised wait status ${JSON.stringify(result.status)} — an outcome this file cannot name is never read as success`);
    if (mapped !== 'completed')
        return failClosed(mapped, result.detail ?? `the harness reported \`${result.status}\``);
    return null;
}
function collectOutcome(phase, result, schemaOverride) {
    if (!result || typeof result !== 'object')
        return failClosed('not-started', 'the harness returned nothing for this dispatch');
    const nonTerminal = classifyWait(result);
    if (nonTerminal)
        return nonTerminal;
    if (result.value === undefined || result.value === null)
        return failClosed('failed-validation', 'the dispatch completed with no return value');
    const errs = schemaViolations(result.value, schemaOverride ?? exports.PHASE_CONTRACTS[phase].schema);
    if (errs.length > 0)
        return failClosed('failed-validation', `return value violates the ${phase} contract: ${errs.join('; ')}`);
    return {
        outcome: 'completed',
        advances: true,
        reason: `${phase} returned a contract-valid result`,
        value: result.value,
    };
}
exports.collectOutcome = collectOutcome;
const NODE_AUDIT_FS = { mkdirSync: node_fs_1.mkdirSync, appendFileSync: node_fs_1.appendFileSync, readFileSync: node_fs_1.readFileSync };
function auditLine(record) {
    return `${JSON.stringify(record)}\n`;
}
exports.auditLine = auditLine;
function appendAudit(path, records, fs = NODE_AUDIT_FS) {
    const payload = records.map(auditLine).join('');
    try {
        fs.mkdirSync((0, node_path_1.dirname)(path), { recursive: true });
        fs.appendFileSync(path, payload);
        const back = fs.readFileSync(path, 'utf8');
        if (!back.endsWith(payload))
            throw new Error('the file does not end with what was just appended');
        return { written: records.length, path };
    }
    catch (err) {
        throw new Error(`codex-fanout: the audit at \`${path}\` could not be written and read back ` +
            `(${err instanceof Error ? err.message : String(err)}). An unattended run with no audit ` +
            `trail is not an acceptable degraded mode — stopping.`);
    }
}
exports.appendAudit = appendAudit;
function emptyState() {
    return { completed: [], prNumber: null, halted: false, reason: null };
}
function applyRecord(state, record) {
    if (typeof record.prNumber === 'number')
        state.prNumber = record.prNumber;
    if (record.excluded === true) {
        state.halted = true;
        state.reason = record.reason ?? 'excluded by a previous iteration';
        return;
    }
    if (!isPhase(record.phase) || !record.outcome)
        return;
    if (record.outcome === 'completed') {
        if (!state.completed.includes(record.phase))
            state.completed.push(record.phase);
        return;
    }
    state.halted = true;
    state.reason = record.reason ?? `${record.phase} ended \`${record.outcome}\``;
}
function reconstructState(auditText) {
    const states = {};
    for (const line of auditText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '')
            continue;
        let record;
        try {
            record = JSON.parse(trimmed);
        }
        catch {
            continue;
        }
        if (!record || typeof record.id !== 'string')
            continue;
        const state = states[record.id] ?? emptyState();
        states[record.id] = state;
        applyRecord(state, record);
    }
    return states;
}
exports.reconstructState = reconstructState;
function resumePlan(id, state) {
    const s = state ?? emptyState();
    const done = new Set(s.completed);
    if (s.prNumber !== null)
        done.add('pr');
    const redispatch = s.halted ? [] : exports.PHASES.filter(p => !done.has(p));
    const note = s.halted
        ? `halted by a previous iteration: ${s.reason ?? 'no reason recorded'} — not re-driven`
        : s.prNumber !== null
            ? `story already carries PR #${s.prNumber} — continued on it, never a second PR`
            : 'no prior state recorded — full pipeline';
    return {
        id,
        redispatch,
        skipped: exports.PHASES.filter(p => done.has(p)),
        halted: s.halted,
        prNumber: s.prNumber,
        note,
    };
}
exports.resumePlan = resumePlan;
exports.COMMANDS = ['bind', 'cap', 'packet', 'collect', 'audit', 'resume'];
function runCommand(command, req) {
    if (command === 'bind')
        return resolveRealization(req.probe ?? {});
    if (command === 'cap')
        return effectiveParallelism(req.ceilings);
    if (command === 'packet')
        return buildPacket(req.packet);
    if (command === 'collect')
        return collectOutcome(req.phase, req.result, req.schema);
    if (command === 'audit')
        return appendAudit(req.path, req.records ?? []);
    const states = reconstructState(req.audit ?? '');
    if (typeof req.id === 'string')
        return resumePlan(req.id, states[req.id]);
    return Object.keys(states).map(id => resumePlan(id, states[id]));
}
function readStdin() {
    try {
        return (0, node_fs_1.readFileSync)(0, 'utf8');
    }
    catch {
        return '';
    }
}
function main(argv, stdin) {
    const command = argv[0];
    if (!exports.COMMANDS.includes(command))
        return {
            code: 1,
            out: JSON.stringify({
                error: `unknown command ${JSON.stringify(argv[0])}; expected one of ${exports.COMMANDS.join(', ')}`,
            }),
        };
    let req;
    try {
        req = stdin.trim() === '' ? {} : JSON.parse(stdin);
    }
    catch {
        return {
            code: 1,
            out: JSON.stringify({
                error: 'stdin is not JSON; this tool takes one JSON request on stdin',
            }),
        };
    }
    try {
        return { code: 0, out: JSON.stringify(runCommand(command, req)) };
    }
    catch (err) {
        return {
            code: 1,
            out: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        };
    }
}
exports.main = main;
if (require.main === module) {
    const { code, out } = main(process.argv.slice(2), readStdin());
    process.stdout.write(`${out}\n`);
    process.exitCode = code;
}
