---
name: pair-assistant
description: "Your assistant for pair. Sets pair up when it is missing — installs pair-cli (locally when a package.json exists, otherwise npx), creates the git repository if absent, runs the install — and once pair is in place, turns a request into the right CLI command or the right knowledge-base answer: install, update, version check, KB validation, packaging, scaffolding an external KB. Discovers the CLI surface from the CLI itself and the project's standards from its own .pair/llms.txt, so neither can go stale. Idempotent; the entry point on the Claude Code marketplace channel."
version: 0.1.0
author: Foomakers
---

# /pair-assistant — your assistant for pair

One entry point for two jobs: **get pair into this project** when it is not there, and **help you use it** once it is.

## Step 0 — Preflight: read the state before choosing a job

```bash
git rev-parse --is-inside-work-tree 2>/dev/null   # is this a repository?
ls package.json 2>/dev/null                        # local install possible?
ls .pair/llms.txt 2>/dev/null                      # is pair installed here?
ls node_modules/.bin/pair-cli 2>/dev/null           # CLI installed locally?
command -v pair-cli 2>/dev/null                    # CLI on PATH?
git ls-files | head -50                            # is there already a codebase here?
```

| State | Go to |
| --- | --- |
| `.pair/` present and the CLI answers | **Assist** (step 5) |
| No `.pair/`, and the repository is empty or nearly so | **Setup** (steps 1–4) — greenfield, just install |
| No `.pair/`, but **there is already a codebase** | **Ask first** (step 0b), then Setup |

Say which branch you took and why. A user who cannot tell whether you are installing or operating has to guess what you are about to change.

### Never run a bare `npx pair-cli`

**An unscoped `pair-cli` package exists on npm and is not ours** (`pair-cli@0.1.0`, a third party; pair publishes `@foomakers/pair-cli`). So `npx pair-cli …` on a machine with no local binary fetches and executes a stranger's package — and a `2>/dev/null` would hide npx's own notice that it is doing so. Two rules, no exceptions:

- To run the **project's** binary: `npx --no pair-cli …`. `--no` refuses to fetch anything, so it either runs the local install or fails naming what it would have downloaded.
- To run **ours without installing**: name it in full, `npx @foomakers/pair-cli …`.

Detect the CLI by looking for the binary (above), never by invoking it.

### Step 0b — An existing project: ask before writing anything

Adopting pair into a project that already exists is not the same as starting one with it. The project already has a stack, conventions and a way of working; pair's value there is that its adoption files **describe that reality**, not that they arrive as blank templates. So do not decide for the user.

First, tell them exactly what install touches, because one part of it **does** overwrite and they must know before they answer:

- **Your adoption decisions are safe.** `.pair/adoption/**` installs with `add` behaviour — new files only, existing ones untouched.
- **`CLAUDE.md` and `AGENTS.md` are REPLACED.** They are targets of a mirrored registry and the copy is unconditional. If this project has its own — very likely — it will be overwritten. Say so, and offer to save a copy first (`cp CLAUDE.md CLAUDE.md.bak`) or to stop.
- **`.pair/knowledge/**` and `.github/**` are mirrored** — replaced, and files no longer in the source are deleted.
- `.claude/skills/**` is overwritten in place, without deleting.

Do not compress this into "nothing you have is overwritten". That sentence was in an earlier draft of this skill and it was false.

Then ask, presenting both outcomes concretely:

> This project already has code. I can do either of these:
>
> 1. **Install pair only** — adds `.pair/` (knowledge base, adoption templates) and `.claude/skills/` (the skill catalog), and replaces `CLAUDE.md`/`AGENTS.md` as noted above. You end up with pair's standards available, and adoption files still to fill in.
> 2. **Install pair and adopt this project into it** — the same install, then a pass that describes this project in pair's terms: its tech stack, its architecture, its way of working, its quality gates. That is the difference between having pair's defaults and having *your* project on record — which is what every process skill then reads.
>
>    One thing to know, because it decides whether option 2 does anything: install writes the adoption files **already populated with pair's own choices**, and the adoption pass skips a section whose file is already populated. So it will not silently rewrite them — where a section already says something, you and I have to change it deliberately. I will show you which sections those are before touching any.
>
> Which would you like? (1 is safe and reversible; 2 takes longer and asks you questions.)

- **Option 1** → continue with Setup and stop there, saying what was written.
- **Option 2** → run Setup first (the adoption pass needs the knowledge base it installs), then hand off to `/pair-process-bootstrap` **with the project's context** (below). Do not improvise that flow here: it is a real skill with its own phases, and it arrives with the install.

If the user does not answer, do **option 1**. Installing files is recoverable; a half-finished adoption pass that leaves the project described wrongly is worse than one not started.

#### Handing bootstrap the project's context — fewer questions, faster

On an existing project the interview should be short, because most answers are already visible in the repository. Two facts about `/pair-process-bootstrap` make that cheap, and both mean **you do not build a detector here**:

- It **already reads project state** for the tech stack — only an *undetectable* stack (nothing to read) is asked.
- It **already resumes**: each phase checks whether its output exists and skips it, so nothing completed is redone.

So your job is to hand over the evidence you have and let it skip work, not to re-derive what it derives better. Collect only what is cheap and unambiguous — you ran most of it in the preflight:

```bash
ls pnpm-lock.yaml yarn.lock package-lock.json bun.lockb 2>/dev/null   # package manager
git remote -v                                                         # code host
ls .github/workflows .gitlab-ci.yml azure-pipelines.yml 2>/dev/null   # existing CI
```

State those findings in the handoff, as evidence rather than as decisions — a question whose answer is already on disk does not need to be asked. Leave the deeper reading to the skills that own it: `/pair-capability-assess-stack` for the stack, `/pair-capability-setup-gates` for gates. Do not summarise their job into a guess of your own.

**Which depth to propose.** Bootstrap has two: `guided` (its default — it asks, each question pre-filled) and `$mode: quick` (same resolved values, taken as-is instead of confirmed).

Read that difference precisely, because it decides the recommendation: **both depths resolve each value through the same cascade** — explicit argument, then **project state**, then a previously recorded decision, then a KB fallback. Quick does not mean "use pair's defaults"; it means "do not stop to confirm". On an existing project most values therefore come from the repository in either depth: the stack from `package.json` and lockfiles, the test runner from the resolved stack, the AI tooling from `.claude/` or `AGENTS.md`, the categorization from PRD signals.

- **Existing project, and the user wants it done** → `$mode: quick` is the right suggestion, and the honest way to describe it is "it reads your project and does not stop to confirm", not "it guesses" — **and not "it asks nothing"**. Three things stay asked even in quick, and the first is blocking: a **missing or template PRD** starts an interactive authoring session (`/pair-process-specify-prd`) and HALTs if the PRD is still absent; the **PM tool** and an **undetectable tech stack** have no safe default and are asked or reported. Say those up front, or "minutes" becomes a promise you did not keep.
- **Existing project, and the user wants to see each decision** → guided, with the evidence above so each question arrives already answered.
- **Where the repository genuinely cannot tell** — architecture style, infrastructure, observability — quick fills from the KB fallback. Say which sections those are when you propose it, so the user knows exactly which values arrived without evidence and can correct those files first.

Either way, tell the user **what to expect before it starts**: which questions remain, which phases will be skipped because their output already exists, and that re-invoking bootstrap resumes rather than restarting.

## What this skill may and may not reference

Every other pair skill **links** into `.pair/knowledge/**`. This one must not, and the distinction is exact:

- **A link is forbidden.** This skill ships inside the plugin, whose payload is copied into Claude Code's cache. A relative link out of it (`../../../.pair/knowledge/...`) resolves *inside that cache* — to pair's own knowledge base, or to nothing at all. Either way it answers for the wrong project. That is the defect this channel's design exists to remove, so a convenient link must not reintroduce it.
- **A runtime read of the project's own files is not only allowed, it is the point.** Once step 0 confirms `.pair/llms.txt` exists, read it **relative to the working directory** — the user's repository, never skill-relative. That is *their* knowledge base, installed by the CLI, and it is the authoritative answer to anything about their standards.

So nothing about pair's own KB is hard-coded here: everything is written in this file, asked of the CLI, or read from the project.

---

## Setup — when pair is not in this project yet

### Step 1 — Establish a repository

- **Inside a work tree** → continue.
- **Not a repository** → create one and continue. The absence of a repository is a handled precondition, not a failure:

```bash
git init
```

Say which branch `git init` created, because the rest of the session (branch names, PR flow) depends on it.

### Step 2 — Choose the install mode

Two facts decide it: whether this project has a `package.json`, and which package manager it uses.

```bash
ls pnpm-lock.yaml yarn.lock package-lock.json bun.lockb 2>/dev/null
```

| State | Mode | Command |
| --- | --- | --- |
| `package.json` + `pnpm-lock.yaml` | local dev dependency | `pnpm add -D @foomakers/pair-cli` |
| `package.json` + `yarn.lock` | local dev dependency | `yarn add -D @foomakers/pair-cli` |
| `package.json` + `package-lock.json` | local dev dependency | `npm install -D @foomakers/pair-cli` |
| `package.json`, no lockfile | local dev dependency | ask which manager to use, then the matching command |
| no `package.json` | no install | `npx @foomakers/pair-cli <command>` |

Three rules, each with a reason:

1. **Detect the manager from the lockfile, never default to one.** Installing with the wrong manager writes a second lockfile into the project — a change the user did not ask for and will not expect.
2. **With a `package.json`, install locally rather than globally.** The CLI version then travels with the project, so a later run resolves the same version rather than whatever is on the machine.
3. **No `package.json` means no install at all** — use `npx`. Creating a `package.json` to hold a dev dependency would turn a non-Node project into a Node one.

**Already installed?** Skip the install and go to step 3. Do not reinstall.

**Always state the mode you chose** before running anything.

### Step 3 — Let the CLI produce the files

```bash
# local mode — `--no` runs the project's own binary and refuses to fetch,
# so a failed install cannot silently become a stranger's package
npx --no pair-cli install

# no-package.json mode — fetch and run without installing
npx @foomakers/pair-cli install
```

This writes `.pair/` (knowledge base, adoption templates) and `.claude/skills/` (the skill catalog) with the CLI's own naming — the point of routing through the CLI instead of copying files: the paths a skill references and the paths on disk come from the same transform, so they cannot disagree.

Report what the CLI reported. Do not summarise a failure as success.

### Step 4 — Report, then hand off

There is **no duplicate to resolve**, and it is worth saying so rather than leaving the user to wonder: this assistant is the plugin's only skill, and the CLI does not install it — it is authored outside the distributed corpus for exactly that reason. So the project's `.claude/skills/` holds the full catalog, the plugin holds this one skill, and no name resolves from two sources.

> pair is installed in this project: `.pair/` and `.claude/skills/` are now in your repository, generated by the CLI. The marketplace plugin still holds this assistant only — nothing is duplicated, so keep it for the next project or remove it with `/plugin uninstall pair@pair`.

Then point at the next step: `/pair-next` reads the project state and recommends what to do first.

---

## Step 5 — Assist

### Two sources of truth, both read at runtime

**The CLI describes itself.** Do not carry a command reference in this file or in your head:

```bash
npx --no pair-cli --help         # the command list, with one-line descriptions
npx --no pair-cli <command> --help  # that command's options, exactly as shipped
```

Run the relevant `--help` **before** proposing a command with options. This file deliberately lists no flags: a flag list here would be a third copy of the CLI's surface (after the code and the published reference) with nothing keeping it honest — and the version installed in *this* project may differ from the one this file was written against.

**The project describes its own standards.** `.pair/llms.txt` is a machine-readable index of the installed knowledge base (llmstxt.org): guidelines, how-to guides, templates, adoption files. Read it from the working directory, then follow it to the file that answers the question:

```bash
cat .pair/llms.txt
```

Use it whenever the request is about *how this project works* rather than about a CLI command — its testing strategy, its code-design rules, its way of working, which how-to covers a task. The answer then comes from the user's repository, so it is right for their project by construction, and it stays right when they change it.

### Where the context comes from — and where it can be wrong

Both sources have a known weak spot. Knowing them is what keeps an answer honest:

- **`llms.txt` is an index, and nothing guards it.** No gate checks that it matches the knowledge base it describes (tracked as issue #416 in the pair repository). So treat it as a table of contents, never as the content: if a path it names does not exist, **do not give up and do not guess** — list `.pair/knowledge/` and find the file, and say that the index is stale so the user can regenerate it. Prefer what a file actually says over what the index says about it.
- **The installed KB may be behind.** `kb-info` reports whether it is. When the answer to a question depends on a guideline, and the KB is behind, say so and offer `update` — an answer from a stale copy is still an answer about their project, but they should know which copy it came from.
- **`--help` is authoritative about flags and silent about conventions.** It tells you what the CLI accepts, never what this project has decided. Never infer a project convention from a CLI option.
- **This file can be older than both.** It ships with the plugin and updates only when the plugin does. If it disagrees with `--help` or with the project's own KB, they win — that is the whole reason neither is copied in here.

Always name the file or command an answer came from. It lets the user correct the source instead of correcting you.

### Intent → where the answer lives

This map is judgment rather than syntax, which is why it is worth stating. Confirm CLI options with `--help`; follow `llms.txt` for the rest.

| The user wants | Source | Notes |
| --- | --- | --- |
| pair in this project, first time | `install` | the Setup branch above already does this |
| the KB and skills refreshed | `update` | not `install` — update is the in-place refresh |
| the installed KB version, or whether it is behind | `kb-info` | also reads a packaged KB's metadata |
| the KB checked for structural soundness | `kb-validate` | structure + manifest |
| a KB **package** checked for integrity | `kb-verify` | checksum + structure + manifest, on a package path |
| to publish or share a KB | `package` | produces a validated ZIP |
| their own knowledge base repository | `scaffold-kb` | a pure external KB + release script |
| broken links in installed KB content fixed | `update-link` | validates and updates links |
| their registry config validated | `validate-config` | asset registries + KB structure |
| to know this project's standards, process or decisions | `.pair/llms.txt` → the file it points to | never answer from memory when the project has its own record |
| to know what to work on next | `/pair-next` | invoke it — it reads adoption files and PM state; never reimplement it here |
| anything a catalogue skill owns (refine, plan, implement, review, gates) | that skill, by bare name | see step 6, including the adoption precondition |
| configure this project for pi, opencode, or another harness | `/pair-capability-setup-harness` | resolves the harness explicitly, verifies fitness, provisions — see step 6 |

If a request matches nothing here, go back to `--help` and to `llms.txt` and reason from what is actually there. If it matches nothing in either, say so plainly instead of inventing a flag or a rule.

### How to act

1. **State the command and what it will change** before running it. Anything that writes into the user's repository is theirs to approve.
2. **Prefer the project's own binary** (`npx --no pair-cli …`) over a fetched one, so the version matches the project — and never a bare `npx pair-cli` (see above).
3. **Report what the CLI printed**, including warnings. Never restate a failure as a success, and never summarise away a message that names a path.
4. **Stop on the first failure** and show its output. Do not retry with different flags hoping one works.
5. **Quote the project's own words** when answering from `llms.txt`, and name the file — so the user can check you, and correct the source rather than you.

## Step 6 — Run the CLI, and invoke the installed skills

This assistant **executes**; it does not only advise. Two things it may drive:

**The CLI.** State the command and what it will change, run it, report what it printed. Anything that writes into the user's repository is theirs to approve first.

**The installed skills.** After setup, the project's `.claude/skills/` holds the full catalogue, and those skills are invoked by their bare `/pair-…` name — the same way the corpus composes internally. Prefer delegating to a skill over doing its job here: it carries the steps, the gates and the templates that this file deliberately does not.

```bash
ls .claude/skills/            # what this project actually has, at this version
```

Discover the catalogue that way rather than from a list written here — the same reason the CLI's flags are not written here. The names change; `ls` does not go stale.

**Why the dispatch is unambiguous.** This assistant exists only in the plugin; the catalogue exists only in the project. So every bare name has exactly one source: `/pair-assistant` resolves to the plugin, `/pair-next` and the rest resolve to the project. That is a property of the packaging (the CLI never installs this skill), not a coincidence to rely on loosely.

### Check the precondition before delegating

**A skill that reads adoption files needs adoption files that are the project's.** Right after `install`, `.pair/adoption/` holds what pair shipped — its structure, and in places pair's own concrete choices, such as a quality-gate table naming specific commands. Those are defaults, **not this project's decisions**, until someone fills them in.

So before invoking an adoption-dependent skill (anything that resolves the PM tool, the risk matrix, the coverage baseline, the tech stack — `/pair-capability-write-issue`, `/pair-process-review`, `/pair-capability-verify-quality`, `/pair-capability-record-decision`, and the process skills composing them), check whether the adoption pass has actually been done:

```bash
cat .pair/adoption/tech/way-of-working.md   # does this describe THIS project?
```

If it still reads as pair's defaults, say so and offer the adoption pass (`/pair-process-bootstrap`) first. Do not invoke the skill and let it act on a decision the project never made — that is the same failure this channel was redesigned to remove, arriving by a different route.

Skills that only read the knowledge base — the guidelines, the how-to guides — have no such precondition and can be invoked immediately.

### What this skill does not do

- It does not configure a PM tool, quality gates, or any adoption decision — those are their own skills, and they need the knowledge base this one installs.
- It does not write the knowledge base or adoption files. The CLI writes the KB; other skills own their content.
- It does not replace the catalogue. Once pair is installed the process skills are there — this assistant **invokes** them (step 6) rather than reimplementing their steps.
- It does not uninstall the plugin for you. Removing a plugin from the user's Claude Code installation is theirs to run, not a side effect of a setup step.

## Idempotence

Re-running is safe and is expected to be a confirmation, not a repeat: an existing repository is left alone, an installed CLI is not reinstalled, and `install` on an already-installed project reports what it finds. If a step would overwrite something the user changed, say so and stop.
