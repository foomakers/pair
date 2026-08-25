# Approval Rounds and the `$approval` Signal

An **approval round** is a step where a skill stops and asks a human to accept what it just produced — "Confirm?", "Approve or adjust?", "Developer approves the delta". It is the right default for a skill a human invoked: the proposal is visible before it becomes adoption.

It is the wrong default for a caller that **cannot** ask: a quick setup depth, an automated run, a supervisor loop. Such a caller has exactly one signal to pass, `$approval`, and every skill that declares an approval round honours it. The caller states its depth **once**; it never enumerates, per composed skill, an approval round it happens to know about.

That enumerating shape is what this convention replaces, and it fails for a structural reason worth stating: a caller-side suppression note cannot see the *next* composed skill that asks. Each new asking surface is a new silent hang, and the caller looks compliant while missing it.

## The signal

| Value | Meaning |
| --- | --- |
| `interactive` | Every approval round runs exactly as written. **The default** — an omitted `$approval` resolves here, so a caller that passes nothing gets today's behaviour, word for word. |
| `auto` | No approval round is asked. Each round resolves per the table below, and what it would have asked is **reported** instead. |

`$approval` is a **skill argument**, not an environment probe. A skill never infers it from a TTY check of its own: the caller knows whether it can ask, and the [guided / quick setup convention](guided-quick-setup.md) owns the environment rule (a detected non-interactive environment can never run a guided depth). This signal is how that decision reaches the skills the depth composes.

## How `auto` resolves a round

Three kinds of round, three resolutions. A skill classifies each of its own rounds once, in the step that declares it.

| Round | Under `$approval: auto` |
| --- | --- |
| **Confirm a proposal** — the skill produced a value and asks for a nod ("Confirm?", "Approve or adjust?") | **Accept it as-is** and report it. The proposal is the skill's own output; a nod adds no information the skill lacks. |
| **Keep or redo / existing vs. proposed** — the round chooses between a value already recorded and a new one (an adoption section that already holds a different choice, a catalog entry whose classification would change) | **Keep what is already recorded**, and report the proposed delta as *not applied*. Never overwrite a recorded decision unasked: silence is not consent, and the conservative branch is one the round already offers. |
| **Judgement gate** — the round has **no proposal to accept**, because the missing input is a human judgement the skill cannot supply (a risk to mitigate or accept, a choice with no safe default) | **It is never resolved by `auto`.** A skill that would **write** what nobody judged **HALTs** — `auto` suppresses *asking*, never *judging*. An output-only skill instead **hands the question back to the caller, unresolved**, in its report: it had nothing to write, so there is nothing to stop, and the caller's own policy owns the call. |

The line between row 1 and row 3 is the whole point: **can the skill state, on its own, what the human would be accepting?** If yes, `auto` accepts it. If the answer is "whichever of these the human prefers", there is nothing to auto-accept and the gate fires — as a HALT where the skill writes, as an unresolved item handed to the caller where it does not.

An **explicit argument the caller itself passed** (the resolution cascade's Path A `$choice`) is not a guess: `auto` accepts it even against a different recorded value, because the caller outranks adoption by the cascade's own precedence. The conflict is **reported**, loudly, in the same output.

## `auto` means "do not ask", not "do not report"

Every round suppressed under `auto` still owes its content to the caller: the accepted proposal, the kept-existing delta, the reported conflict. They go in the skill's Output Format, which `auto` never shortens. A caller that passes `auto` while being perfectly able to display output — a supervisor loop with a log, an operator watching a batch — must still be able to read what was decided on its behalf.

## Declared marker

Every approval round carries a **marker on its own line**, naming what kind of round it is and how `auto` resolves it:

```text
4. **Verify**: Developer approves the delta. Under `auto` it is accepted as-is and reported. <!-- approval-round: kind=confirm; auto=accept -->
```

Both fields are required, and both are **closed sets**:

| `kind=` | The round |
| --- | --- |
| `confirm` | asks for a nod on something the skill produced |
| `keep-or-redo` | chooses between a recorded value and a new one |
| `choice` | asks which of several candidates to take |
| `gate` | has no proposal to accept (see row 3 above) |

| `auto=` | How `auto` resolves it |
| --- | --- |
| `accept` | take the proposal as-is, report it |
| `keep` | keep the recorded value, report the delta unapplied |
| `project-state-then-unresolved` | settle from project state; if project state is silent, emit no proposal and report the tie unresolved |
| `hand-back` | return the question to the caller, unresolved (output-only skills) |
| `halt` | stop and wait for a human — the judgement gate |

**Why a marker and not prose to interpret.** A checker that reads keywords out of a span computed from markdown layout — the file, the step, a sentence, a character window — cannot be made reliable by narrowing the span. Layout is not contract: when the prose changes shape the check does not fail, it **widens**, and an unrelated line satisfies it. A declared marker moves attachment to line identity and the resolution to an enum, which changes what a bad round *is*: resolving a tie by document order stops being a phrasing a pattern missed and becomes a resolution nobody can spell.

**The enum is the point.** If a round's real behaviour has no value here, that is a finding about the behaviour, not a gap in the list — either it maps to one of the five, or it should not be shipped that way.

## Authoring obligation

**Any skill that declares an approval round must honour `$approval`** — a new family member included, from its first version. Three mechanical obligations, all enforced by the skills conformance gate over the corpus (per skill present, never against a count):

1. The Arguments table carries an `$approval` row.
2. Every line that asks for approval carries its **own** marker (above). A marker on a neighbouring line does not cover it, and a marker whose fields fall outside the enums is a violation rather than an unknown.
3. The prose on that line describes the resolution the marker declares — an `auto=project-state-then-unresolved` round says what settles the tie *and* what happens when nothing does; an `auto=halt` round says it HALTs; an `auto=hand-back` round names the caller. The marker states the contract, the sentence states it to the executor, and neither is allowed to contradict the other.

Prose still names the signal where it helps a reader (`(\`$approval: interactive\`)`,`Under \`auto\` …`); what changed is that prose is no longer what the gate keys on.

**Fail closed, everywhere.** No check may degrade to a wider scope or an empty input when parsing fails: an unreadable marker, an unparseable line, a section lookup that finds nothing — each is a violation, never a silent pass. A guard that answers "nothing to check" when it cannot parse its input is indistinguishable from a guard that passes.

A round inherited from a shared convention — the [resolution cascade](resolution-cascade.md)'s Path A confirmation and Path B keep-or-redo — is qualified **there**, once, for every skill that follows it. A skill restates only its own local rounds.

**A choice is an approval round.** "Which of these two?" blocks an autonomous run exactly as "confirm this?" does, so a tie-break or a top-2 presentation is a round like any other and carries the signal. Which row it lands in depends on one question: **can the skill name a leader without asking?**

- **It can** — from its own scoring, or from what project state already shows: row 1. `auto` takes that leader and reports the runner-up **and the margin** as a choice nobody made.
- **It cannot** — the scores are exactly equal and project state is silent: row 3. Nothing is there to accept, so no proposal is emitted and the tie is reported unresolved.

Two traps, both met in practice:

- **A list is not a ranking.** "Whichever the guideline lists first" looks deterministic and is not: two enumerations of the same candidates routinely disagree (a skill's candidate set is written for coverage, a guideline's comparison table for reading), so the same tie resolves differently depending on which file was open. Resolve from scores or from project state — never from document order.
- **The leader belongs to the `auto` branch, not to the guided presentation.** A round that presented two neutral options and asked which one must keep presenting two neutral options and asking; naming a winner there changes the question a guided caller is asked, which is precisely what the default forbids. If a round *already* names a recommendation, say so — do not add one.

## Edge cases

- **A round that writes before it asks.** It cannot be made conditional as written: under `auto` the write happens and the question that would have prevented it never runs. Move the write after the round (the shape every skill in this corpus already has: propose → approve → write) rather than qualifying the question.
- **The caller is interactive but passes `auto`.** Legitimate, and not a contradiction: the caller has decided the rounds are noise for this run, not that it has no channel. The reporting obligation above is exactly what keeps that honest.
- **A gate that could be resolved by a default, if a default existed.** Then it is row 2, not row 3: name the conservative branch, take it, report the delta. Reserve the HALT for the case where every branch records a judgement nobody made.
- **An input question is not an approval round** — "which database do you use?" asks for a fact the skill does not have, rather than for consent to something it produced. `$approval` does not govern it. But `auto` cannot ask it either: a skill that reaches one under `auto` resolves it from its documented fallback where it has one, and otherwise emits **no proposal** and reports what it could not resolve. Silence is not an answer to a question about the world.
- **A partially-adopting family.** Worse than no signal at all — a caller passing one signal reasonably reads it as total, so an unconverted sibling hangs a run that looks correct. A family adopts the signal atomically; the conformance gate is what makes "atomically" checkable rather than remembered.
