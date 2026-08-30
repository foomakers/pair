// GENERATED FILE — do not edit.
// Source: packages/knowledge-hub/src/tools/codex-fanout.ts
// Regenerate: pnpm --filter @pair/knowledge-hub codex:asset

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.COMMANDS = exports.resumePlan = exports.reconstructState = exports.OWED_PHASES = exports.appendAudit = exports.REVIEW_ACTIONS = exports.isCardRecord = exports.auditLine = exports.converge = exports.MAX_FIX_ROUNDS_DEFAULT = exports.collectOutcome = exports.schemaViolations = exports.TERMINAL_OUTCOMES = exports.buildPacket = exports.assertBlind = exports.blindDenyPrefixes = exports.BLIND_DENY_PREFIXES = exports.WORKING_PATH_DEFAULT = exports.PacketRejected = exports.isPhase = exports.PHASE_CONTRACTS = exports.PHASES = exports.effectiveParallelism = exports.resolveRealization = exports.HARNESS_SURFACE_MAP = exports.requiredHandles = exports.REALIZATION_TIERS = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
exports.REALIZATION_TIERS = Object.freeze({
    IN_HARNESS: 1,
    EXTERNAL_DRIVER: 2,
    DEGRADED: 3,
});
function requiredHandles(handles) {
    return handles.dispatch === 'spawn-wait' ? [handles.spawn, handles.wait] : [handles.delegate];
}
exports.requiredHandles = requiredHandles;
const FALLBACK_WAIT_TIMEOUT_MS = 1_800_000;
const CLAUDE_CODE_WORKFLOW = {
    id: 'claude-code-workflow',
    tier: exports.REALIZATION_TIERS.IN_HARNESS,
    harness: 'claude-code',
    namespace: '',
    handles: { dispatch: 'delegated-run', delegate: 'Workflow' },
    gating: { featureKey: 'workflows', defaultOn: true },
    verifiedAgainst: 'claude-code — the `Workflow` tool as exposed to a session with the `workflows` asset ' +
        'registry installed (`pair-loop`, `pair-implement-batch`), 2026-08-28',
};
const CODEX_MULTI_AGENT_V2 = {
    id: 'codex-multi-agent-v2',
    tier: exports.REALIZATION_TIERS.IN_HARNESS,
    harness: 'codex',
    namespace: '',
    namespaceKey: 'features.multi_agent_v2.tool_namespace',
    handles: { dispatch: 'spawn-wait', spawn: 'spawn', wait: 'wait', cancel: 'interrupt_agent' },
    gating: { featureKey: 'features.multi_agent_v2', defaultOn: false },
    bounding: {
        concurrencyKey: 'features.multi_agent_v2.max_concurrent_threads_per_session',
        waitTimeoutKeys: {
            min: 'features.multi_agent_v2.min_wait_timeout_ms',
            max: 'features.multi_agent_v2.max_wait_timeout_ms',
            default: 'features.multi_agent_v2.default_wait_timeout_ms',
        },
        fallbackWaitTimeoutMs: FALLBACK_WAIT_TIMEOUT_MS,
    },
    verifiedAgainst: 'codex-cli 0.150.1 — `codex features list` reports `multi_agent_v2 stable false`; the ' +
        'bounding keys read off the shipped binary, where `min_wait_timeout_ms`, ' +
        '`max_wait_timeout_ms`, `default_wait_timeout_ms` and ' +
        '`max_concurrent_threads_per_session` are all fields of this feature’s own config ' +
        'section, 2026-08-28',
};
const CODEX_MULTI_AGENT_V1 = {
    id: 'codex-multi-agent-v1',
    tier: exports.REALIZATION_TIERS.IN_HARNESS,
    harness: 'codex',
    namespace: '',
    handles: {
        dispatch: 'spawn-wait',
        spawn: 'spawn_agent',
        wait: 'wait_agent',
        cancel: 'close_agent',
        resume: 'resume_agent',
    },
    gating: { featureKey: 'features.multi_agent', defaultOn: true },
    bounding: {
        concurrencyKey: 'agents.max_concurrent_threads_per_session',
        waitTimeoutKeys: null,
        fallbackWaitTimeoutMs: FALLBACK_WAIT_TIMEOUT_MS,
    },
    verifiedAgainst: 'codex-cli 0.150.1 — `codex features list` reports `multi_agent stable true`; the shipped ' +
        'binary carries `agents.max_concurrent_threads_per_session` for this generation and NO ' +
        'wait-timeout key outside the `multi_agent_v2` config section, so the wait bound here is ' +
        'not configurable and the declared fallback is what applies, 2026-08-28',
};
exports.HARNESS_SURFACE_MAP = Object.freeze([
    CLAUDE_CODE_WORKFLOW,
    CODEX_MULTI_AGENT_V2,
    CODEX_MULTI_AGENT_V1,
]);
function qualify(namespace, handle) {
    return namespace === '' ? handle : `${namespace}.${handle}`;
}
function matchRealization(def, exposed, namespaceOverride) {
    const renameable = typeof def.namespaceKey === 'string' && def.namespaceKey !== '';
    const ns = renameable && typeof namespaceOverride === 'string' ? namespaceOverride : def.namespace;
    const required = requiredHandles(def.handles).map(handle => qualify(ns, handle));
    return required.every(handle => exposed.has(handle)) ? required : null;
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
        dispatch: null,
        primitive: null,
        reason: `${DEGRADED_REASON}; ${next}`,
        announcement: `fan-out realization: ${realization} (tier ${tier}) — ${next}`,
        harnessCeiling: null,
        concurrencyKey: null,
        waitTimeoutMs: null,
        waitTimeoutSource: null,
        waitTimeoutKeys: null,
    };
}
function concurrencyBound(def, probe) {
    const bounding = def.bounding;
    if (!bounding)
        return { harnessCeiling: null, concurrencyKey: null };
    const reported = probe.harnessCeiling;
    return {
        harnessCeiling: Number.isInteger(reported) ? reported : null,
        concurrencyKey: bounding.concurrencyKey,
    };
}
function waitBound(def, probe) {
    const bounding = def.bounding;
    if (!bounding)
        return { waitTimeoutMs: null, waitTimeoutSource: null, waitTimeoutKeys: null };
    const reported = probe.harnessWaitTimeoutMs;
    const usable = Number.isInteger(reported) && reported > 0;
    return {
        waitTimeoutMs: usable ? reported : bounding.fallbackWaitTimeoutMs,
        waitTimeoutSource: usable ? 'probe' : 'realization-default',
        waitTimeoutKeys: bounding.waitTimeoutKeys,
    };
}
function waitClause(bound) {
    if (bound.waitTimeoutMs === null)
        return '';
    const configurable = bound.waitTimeoutKeys === null ? ', not configurable here' : '';
    return `; wait bound ${bound.waitTimeoutMs}ms (${bound.waitTimeoutSource}${configurable})`;
}
function resolveRealization(probe) {
    const exposed = new Set((probe.tools ?? []).filter(t => typeof t === 'string'));
    for (const def of exports.HARNESS_SURFACE_MAP) {
        const hit = matchRealization(def, exposed, probe.namespace);
        if (!hit)
            continue;
        const bound = hit.map(handle => `\`${handle}\``).join('/');
        const reason = `probed this session: ${bound} ${hit.length > 1 ? 'are all' : 'is'} exposed ` +
            `(gated by \`${def.gating.featureKey}\`, default ${def.gating.defaultOn ? 'on' : 'off'}; ` +
            `verified against ${def.verifiedAgainst})`;
        const waiting = waitBound(def, probe);
        const concurrency = concurrencyBound(def, probe);
        return {
            tier: def.tier,
            realization: def.id,
            dispatch: def.handles.dispatch,
            primitive: hit[0] ?? null,
            reason,
            announcement: `fan-out realization: ${def.id} (tier ${def.tier}, ${def.harness}, ` +
                `${def.handles.dispatch}) — bound to ${bound}${waitClause(waiting)}; ${reason}`,
            ...concurrency,
            ...waiting,
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
const PACKET_KEYS = [
    'phase',
    'card',
    'worktreeRoot',
    'attachments',
    'workingPath',
    'findings',
];
const CARD_KEYS = ['id', 'title', 'branch', 'base', 'notes', 'prNumber'];
class PacketRejected extends Error {
    constructor(message) {
        super(message);
        this.name = 'PacketRejected';
    }
}
exports.PacketRejected = PacketRejected;
exports.WORKING_PATH_DEFAULT = '.pair/working';
exports.BLIND_DENY_PREFIXES = Object.freeze([`${exports.WORKING_PATH_DEFAULT}/`]);
function blindDenyPrefixes(workingPath) {
    const raw = typeof workingPath === 'string' ? workingPath.trim() : '';
    if (raw === '')
        return exports.BLIND_DENY_PREFIXES;
    const resolved = (0, node_path_1.normalize)(raw).replace(/\\/g, '/').replace(/\/+$/, '');
    if (resolved === '' || resolved === '.' || (0, node_path_1.isAbsolute)(raw) || resolved.startsWith('..'))
        throw new PacketRejected(`codex-fanout: working path \`${workingPath}\` is not a project-relative directory; ` +
            `\`working_path\` must be project-relative (working-area.md) and an unresolvable one is ` +
            `never silently replaced by the default — the blindness check would then guard the wrong path`);
    const denied = [`${resolved}/`];
    if (denied[0] !== exports.BLIND_DENY_PREFIXES[0])
        denied.push(...exports.BLIND_DENY_PREFIXES);
    return Object.freeze(denied);
}
exports.blindDenyPrefixes = blindDenyPrefixes;
const WORKTREE_ROOT_DEFAULT = '../pair-worktrees';
function normalizeAttachment(entry) {
    if (typeof entry !== 'string' || entry.trim() === '')
        throw new PacketRejected('codex-fanout: an attachment must be a non-empty path');
    if ((0, node_path_1.isAbsolute)(entry))
        throw new PacketRejected(`codex-fanout: attachment \`${entry}\` is absolute; a packet references project-relative paths only`);
    const normalized = (0, node_path_1.normalize)(entry).replace(/\\/g, '/');
    if (normalized === '..' || normalized.startsWith('../'))
        throw new PacketRejected(`codex-fanout: attachment \`${entry}\` escapes the project (\`${normalized}\`); a packet ` +
            `references project-relative paths only, and a path that leaves the project can spell any ` +
            `denied path from outside it`);
    return normalized;
}
function assertBlind(attachments, phase, workingPath) {
    const prefixes = blindDenyPrefixes(workingPath);
    for (const raw of attachments) {
        const entry = normalizeAttachment(raw);
        for (const denied of prefixes)
            if (entry === denied.replace(/\/$/, '') || entry.startsWith(denied))
                throw new PacketRejected(`codex-fanout: the ${phase} packet would carry \`${entry}\`, which is under \`${denied}\` — ` +
                    `the ${phase} role is blind to the authoring chain's working artifacts. Rejected before spawn.`);
    }
}
exports.assertBlind = assertBlind;
function assertBlindCardText(card, phase, workingPath) {
    const prefixes = blindDenyPrefixes(workingPath);
    for (const [field, value] of [
        ['title', card.title],
        ['notes', card.notes],
    ]) {
        if (typeof value !== 'string')
            continue;
        const denied = prefixes.find(prefix => value.includes(prefix));
        if (denied)
            throw new PacketRejected(`codex-fanout: the ${phase} packet's card.${field} contains a pointer under \`${denied}\` — ` +
                `the ${phase} role is blind to the authoring chain's working artifacts. Rejected before spawn.`);
    }
}
function assertKnownKeys(value, allowed, where, make) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return;
    const unknown = Object.keys(value).filter(key => !allowed.includes(key));
    if (unknown.length > 0)
        throw make(`codex-fanout: unknown key(s) ${unknown.map(k => `\`${k}\``).join(', ')} in ${where}; ` +
            `expected one of ${allowed.join(', ')}. An unknown key is REJECTED rather than dropped: ` +
            `a misplaced one would silently leave the default in force — and the defaults here are ` +
            `exactly what the caller passes these keys to override.`);
}
function assertSingleCard(card) {
    assertKnownKeys(card, CARD_KEYS, 'the card', message => new PacketRejected(message));
    const missing = ['id', 'title', 'branch'].filter(k => typeof card?.[k] !== 'string' || card[k].trim() === '');
    if (missing.length > 0)
        throw new PacketRejected(`codex-fanout: a packet describes exactly one card and needs ${missing.join(', ')}; ` +
            `a packet assembled from an incomplete card would spawn a subagent that has to guess its scope`);
}
function parseFindings(raw) {
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw))
        throw new PacketRejected('codex-fanout: `findings` must be an array of finding objects');
    for (const finding of raw)
        if (finding === null || typeof finding !== 'object' || Array.isArray(finding))
            throw new PacketRejected(`codex-fanout: every finding must be an object as the review contract carries it, got ` +
                `${JSON.stringify(finding)}`);
    return raw;
}
function resolveFindings(request, contract) {
    const findings = parseFindings(request.findings);
    if (contract.blind && findings.length > 0)
        throw new PacketRejected(`codex-fanout: a blind packet carries no findings — the ${request.phase} role derives its own ` +
            `from the diff, and a previous round's set primes the very judgement it is asked for`);
    if (request.phase === 'fix' && findings.length === 0)
        throw new PacketRejected('codex-fanout: a `fix` packet carries the findings it must fix, and none were passed. ' +
            "Pass `converge`'s `actionable` set as `findings`. A fixer spawned without them fixes " +
            'nothing determinable, the mandated re-review re-raises the same findings, and the card ' +
            'burns its whole round cap to an escalation nobody chose.');
    return findings;
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
    assertKnownKeys(request, PACKET_KEYS, 'the packet request', m => new PacketRejected(m));
    if (!isPhase(request?.phase))
        throw new PacketRejected(`codex-fanout: unknown phase ${JSON.stringify(request?.phase)}; expected one of ${exports.PHASES.join(', ')}`);
    const contract = exports.PHASE_CONTRACTS[request.phase];
    assertSingleCard(request.card);
    const findings = resolveFindings(request, contract);
    const attachments = (request.attachments ?? []).map(normalizeAttachment);
    if (contract.blind) {
        assertBlind(attachments, request.phase, request.workingPath);
        assertBlindCardText(request.card, request.phase, request.workingPath);
    }
    const root = request.worktreeRoot ?? WORKTREE_ROOT_DEFAULT;
    return {
        phase: request.phase,
        role: contract.role,
        skill: contract.skill,
        card: request.card,
        worktree: `${root}/${request.card.id}`,
        schema: contract.schema,
        attachments,
        findings,
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
function enumViolations(value, schema, path) {
    if (!Array.isArray(schema.enum))
        return [];
    return schema.enum.includes(value)
        ? []
        : [`${path} must be one of ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`];
}
function schemaViolations(value, schema, path = 'value') {
    if (schema.type === 'object')
        return objectViolations(value, schema, path);
    if (schema.type === 'array')
        return arrayViolations(value, schema, path);
    const actual = typeof value;
    if (actual !== schema.type)
        return [`${path} must be ${schema.type}, got ${actual}`];
    return enumViolations(value, schema, path);
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
    if (!isPhase(phase))
        return failClosed('failed-validation', `unknown phase ${JSON.stringify(phase)}; expected one of ${exports.PHASES.join(', ')} — ` +
            `an outcome this file cannot name is never read as success`);
    if (!result || typeof result !== 'object')
        return failClosed('not-started', 'the harness returned nothing for this dispatch');
    const nonTerminal = classifyWait(result);
    if (nonTerminal)
        return nonTerminal;
    if (result.value === undefined || result.value === null)
        return failClosed('failed-validation', 'the dispatch completed with no return value');
    const errs = [
        ...new Set([
            ...schemaViolations(result.value, exports.PHASE_CONTRACTS[phase].schema),
            ...(schemaOverride ? schemaViolations(result.value, schemaOverride) : []),
        ]),
    ];
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
exports.MAX_FIX_ROUNDS_DEFAULT = 3;
function normSeverity(name) {
    return typeof name === 'string' ? name.trim().toLowerCase() : '';
}
function floorRank(req) {
    if (typeof req.severityFloor !== 'string' || req.severityFloor.trim() === '')
        return null;
    const ranks = req.severityRanks;
    if (!ranks || typeof ranks !== 'object' || Array.isArray(ranks))
        throw new Error(`codex-fanout: severityFloor \`${req.severityFloor}\` was given with no severityRanks. ` +
            `Rank is NEVER inferred from the order severities happen to appear in — pass the contract's ` +
            `\`severityRanks\`, or omit the floor so every actionable finding blocks.`);
    const entry = Object.entries(ranks).find(([name]) => normSeverity(name) === normSeverity(req.severityFloor));
    if (!entry || !Number.isInteger(entry[1]))
        throw new Error(`codex-fanout: severityFloor \`${req.severityFloor}\` is not ranked by severityRanks ` +
            `(${Object.keys(ranks).join(', ') || 'empty'}); omit the floor so every actionable finding blocks.`);
    return entry[1];
}
function hasVerdict(review) {
    const v = review?.verdict;
    return typeof v === 'string' && v.trim() !== '';
}
const NO_FINDINGS = { actionable: [], belowFloor: [], nonActionable: [] };
function partition(review, req) {
    const raw = review?.findings;
    const findings = Array.isArray(raw) ? raw : [];
    const floor = floorRank(req);
    const ranks = Object.entries(req.severityRanks ?? {});
    const rankOf = (f) => {
        const hit = ranks.find(([name]) => normSeverity(name) === normSeverity(f?.severity));
        return hit && Number.isInteger(hit[1]) ? hit[1] : Number.NaN;
    };
    const belowFloor = [];
    const actionable = [];
    for (const f of findings)
        if (f?.nonActionable !== true)
            (floor !== null && rankOf(f) < floor ? belowFloor : actionable).push(f);
    return { actionable, belowFloor, nonActionable: findings.filter(f => f?.nonActionable === true) };
}
function convergeBounds(req) {
    return {
        round: Number.isInteger(req.round) ? req.round : 0,
        max: Number.isInteger(req.maxFixRounds) ? req.maxFixRounds : exports.MAX_FIX_ROUNDS_DEFAULT,
        pending: req.humanDecisionPending === true,
    };
}
function decide(b, d) {
    return {
        action: d.action,
        round: d.round ?? b.round,
        ...d.parts,
        humanDecisionPending: d.pending ?? b.pending,
        reason: d.reason,
        line: `review convergence: ${d.action} after ${b.round} fix round(s) of at most ${b.max} — ${d.reason}`,
    };
}
function decideOpen(review, b, parts) {
    const open = parts.actionable.length;
    const wantsHuman = review.needsHumanDecision === true;
    if (wantsHuman && !b.pending && b.round < b.max)
        return decide(b, {
            action: 'fix',
            reason: `the reviewer asked for a human decision — spending one fix round on the ${open} ` +
                `actionable finding(s) first, then escalating if it still stands`,
            parts,
            round: b.round + 1,
            pending: true,
        });
    if (b.round >= b.max || wantsHuman)
        return decide(b, {
            action: 'escalate',
            reason: wantsHuman
                ? 'the reviewer asked for a human decision again after a fix round — a genuine disagreement'
                : `${open} actionable finding(s) still open after ${b.round} fix round(s)`,
            parts,
        });
    return decide(b, {
        action: 'fix',
        reason: `${open} actionable finding(s) — one fix round, then RE-REVIEW`,
        parts,
        round: b.round + 1,
    });
}
function converge(req) {
    const bounds = convergeBounds(req);
    if (!hasVerdict(req.review))
        return decide(bounds, {
            action: 'escalate',
            reason: 'the review returned no verdict — absence of findings is not evidence that a review happened',
            parts: NO_FINDINGS,
        });
    const parts = partition(req.review, req);
    if (parts.actionable.length === 0)
        return decide(bounds, {
            action: 'converged',
            reason: 'no actionable finding remains — the PR is review-approved',
            parts,
        });
    return decideOpen(req.review, bounds, parts);
}
exports.converge = converge;
const NODE_AUDIT_FS = { mkdirSync: node_fs_1.mkdirSync, appendFileSync: node_fs_1.appendFileSync, readFileSync: node_fs_1.readFileSync };
function auditLine(record) {
    return `${JSON.stringify(record)}\n`;
}
exports.auditLine = auditLine;
function isCardRecord(record) {
    return record?.kind !== 'run' && typeof record?.id === 'string' && record.id.trim() !== '';
}
exports.isCardRecord = isCardRecord;
exports.REVIEW_ACTIONS = Object.freeze([
    'converged',
    'fix',
    'escalate',
]);
function isReviewAction(value) {
    return exports.REVIEW_ACTIONS.includes(value);
}
function assertAuditable(record, index) {
    if (record?.kind !== 'run' && !isCardRecord(record))
        throw new Error(`codex-fanout: audit record #${index} names no card \`id\` and is not marked \`kind:"run"\`. ` +
            `A run-level line — the realization announcement, a run-level halt — is written as ` +
            `\`{"kind":"run", …}\`; everything else names the card it belongs to. Neither is inferred, ` +
            `because a record with an invented id becomes a phantom card owed a full pipeline, and one ` +
            `with no id at all is unreadable on resume.`);
    if (typeof record.run !== 'string' || record.run.trim() === '')
        throw new Error(`codex-fanout: audit record #${index} has no non-empty string \`run\`. Every card and run ` +
            `record carries the invocation boundary because resume scopes halts to it; it is never inferred ` +
            `from a later caller or audit line.`);
    if (record.phase !== 'review' || record.outcome !== 'completed')
        return;
    if (isReviewAction(record.action))
        return;
    throw new Error(`codex-fanout: audit record #${index} completes a \`review\` without saying what \`converge\` ` +
        `decided (\`action\` was ${JSON.stringify(record.action)}; expected one of ` +
        `${exports.REVIEW_ACTIONS.join(', ')}). A review round is not a finished cycle: with the action ` +
        `missing or misspelled, a run killed between the review and its fix round resumes with ` +
        `nothing left to do, and a PR carrying unresolved actionable findings reaches the merge ` +
        `gate. The stamp is not optional and is not inferred.`);
}
function appendAudit(path, records, fs = NODE_AUDIT_FS) {
    records.forEach(assertAuditable);
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
exports.OWED_PHASES = ['implement', 'pr', 'review'];
function emptyState() {
    return {
        completed: [],
        prNumber: null,
        halted: false,
        haltedBy: null,
        reason: null,
        round: 0,
        cycleOpen: false,
    };
}
function complete(state, phase) {
    if (!state.completed.includes(phase))
        state.completed.push(phase);
}
function clearHalt(state, phase) {
    if (state.haltedBy === phase) {
        state.halted = false;
        state.haltedBy = null;
        state.reason = null;
    }
}
function halt(state, by, reason) {
    state.halted = true;
    state.haltedBy = by;
    state.reason = reason;
}
function applyReviewRecord(state, record, canHalt) {
    state.cycleOpen = record.action !== 'converged';
    if (record.action === 'escalate') {
        if (canHalt)
            halt(state, 'review', record.reason ?? 'the review cycle escalated to a human');
        return;
    }
    if (!state.cycleOpen)
        complete(state, 'review');
}
function applyCompleted(state, record, canHalt) {
    const phase = record.phase;
    clearHalt(state, phase);
    if (phase === 'review')
        return applyReviewRecord(state, record, canHalt);
    complete(state, phase);
}
function carryForward(state, record) {
    if (typeof record.prNumber === 'number')
        state.prNumber = record.prNumber;
    if (Number.isInteger(record.round))
        state.round = record.round;
}
function haltReason(record) {
    if (typeof record.reason === 'string' && record.reason !== '')
        return record.reason;
    if (record.excluded === true)
        return 'excluded by a previous iteration';
    return `${record.phase} ended \`${record.outcome}\``;
}
function applyRecord(state, record, canHalt) {
    carryForward(state, record);
    if (record.excluded === true) {
        if (canHalt)
            halt(state, null, haltReason(record));
        return;
    }
    if (!isPhase(record.phase) || !record.outcome)
        return;
    if (record.outcome === 'completed')
        return applyCompleted(state, record, canHalt);
    if (canHalt)
        halt(state, record.phase, haltReason(record));
}
function parseAudit(auditText, requireRun) {
    const records = [];
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
        if (!record || (record.kind !== 'run' && typeof record.id !== 'string'))
            continue;
        if (requireRun && (typeof record.run !== 'string' || record.run.trim() === '')) {
            throw new Error('codex-fanout: audit record has no non-empty string `run`; resume cannot scope an ' +
                'unstamped record to the invocation that wrote it, so it refuses the audit instead of ' +
                "treating an escalation as another run's history.");
        }
        records.push(record);
    }
    return records;
}
function reconstructState(auditText, scope = {}) {
    const records = parseAudit(auditText, typeof scope.run === 'string' && scope.run.trim() !== '');
    const lastRun = records.at(-1)?.run;
    const canHalt = (record) => {
        if (typeof scope.run === 'string')
            return record.run === scope.run;
        if (Number.isInteger(scope.sinceIteration))
            return Number(record.iteration) >= scope.sinceIteration;
        return record.run === lastRun;
    };
    const states = {};
    for (const record of records) {
        if (!isCardRecord(record))
            continue;
        const state = states[record.id] ?? emptyState();
        states[record.id] = state;
        applyRecord(state, record, canHalt(record));
    }
    return states;
}
exports.reconstructState = reconstructState;
function resumePlan(id, state) {
    const s = state ?? emptyState();
    const done = new Set(s.completed);
    if (s.prNumber !== null)
        done.add('pr');
    const redispatch = s.halted ? [] : exports.OWED_PHASES.filter(p => !done.has(p));
    const note = s.halted
        ? `halted in this run: ${s.reason ?? 'no reason recorded'} — not re-driven`
        : s.cycleOpen
            ? `review cycle open after ${s.round} fix round(s) — re-enters at \`review\`, never at a replayed \`fix\``
            : s.prNumber !== null
                ? `story already carries PR #${s.prNumber} — continued on it, never a second PR`
                : s.completed.length > 0
                    ? `resuming: ${s.completed.join(', ')} already recorded complete`
                    : 'no prior state recorded — full pipeline';
    return {
        id,
        redispatch,
        skipped: exports.PHASES.filter(p => done.has(p)),
        halted: s.halted,
        prNumber: s.prNumber,
        round: s.round,
        note,
    };
}
exports.resumePlan = resumePlan;
exports.COMMANDS = ['bind', 'cap', 'packet', 'collect', 'converge', 'audit', 'resume'];
const REQUEST_KEYS = [
    'probe',
    'ceilings',
    'packet',
    'phase',
    'result',
    'schema',
    'path',
    'records',
    'audit',
    'id',
    'review',
    'round',
    'maxFixRounds',
    'severityFloor',
    'severityRanks',
    'humanDecisionPending',
    'run',
    'sinceIteration',
    'workingPath',
    'worktreeRoot',
    'findings',
];
function packetRequestFrom(req) {
    const packet = (req.packet ?? {});
    assertKnownKeys(packet, PACKET_KEYS, 'the packet', m => new PacketRejected(m));
    const workingPath = packet.workingPath ?? req.workingPath;
    const worktreeRoot = packet.worktreeRoot ?? req.worktreeRoot;
    const findings = packet.findings ?? req.findings;
    return {
        ...packet,
        ...(workingPath === undefined ? {} : { workingPath }),
        ...(worktreeRoot === undefined ? {} : { worktreeRoot }),
        ...(findings === undefined ? {} : { findings }),
    };
}
function runResume(req) {
    if (typeof req.run !== 'string' || req.run.trim() === '')
        throw new Error('codex-fanout: `resume` requires a non-empty string `run`; it scopes halts to this invocation ' +
            'and every audit record must carry the same boundary.');
    const states = reconstructState(req.audit ?? '', req);
    if (typeof req.id === 'string')
        return resumePlan(req.id, states[req.id]);
    return Object.keys(states).map(id => resumePlan(id, states[id]));
}
const PROBE_KEYS = [
    'tools',
    'namespace',
    'harnessCeiling',
    'harnessWaitTimeoutMs',
    'externalDriverAvailable',
];
const CEILING_KEYS = ['dependencyAllowed', 'policyMax', 'harnessCeiling'];
function checked(value, allowed, where) {
    assertKnownKeys(value, allowed, where, message => new Error(message));
    return value;
}
function checkedCeilings(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('codex-fanout: `cap` requires a `ceilings` object with `dependencyAllowed` and `policyMax` ' +
            '(plus optional `harnessCeiling`).');
    return checked(value, CEILING_KEYS, 'the ceilings');
}
const HANDLERS = Object.freeze({
    bind: req => resolveRealization(checked(req.probe ?? {}, PROBE_KEYS, 'the probe')),
    cap: req => effectiveParallelism(checkedCeilings(req.ceilings)),
    packet: req => buildPacket(packetRequestFrom(req)),
    collect: req => collectOutcome(req.phase, req.result, req.schema),
    converge: req => converge(req),
    audit: req => appendAudit(req.path, req.records ?? []),
    resume: runResume,
});
function runCommand(command, req) {
    assertKnownKeys(req, REQUEST_KEYS, 'the request root', message => new Error(message));
    return HANDLERS[command](req);
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
