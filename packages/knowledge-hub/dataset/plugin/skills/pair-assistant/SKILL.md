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
npx pair-cli --version 2>/dev/null                 # is the CLI reachable?
```

| State | Go to |
| --- | --- |
| No `.pair/`, or no CLI reachable | **Setup** (steps 1–4) |
| `.pair/` present and the CLI answers | **Assist** (step 5) |

Say which branch you took and why. A user who cannot tell whether you are installing or operating has to guess what you are about to change.

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
# local mode — npx resolves the project's own binary first, so this is
# manager-agnostic and needs no pnpm/yarn/npm exec variant
npx pair-cli install

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
npx pair-cli --help              # the command list, with one-line descriptions
npx pair-cli <command> --help    # that command's options, exactly as shipped
```

Run the relevant `--help` **before** proposing a command with options. This file deliberately lists no flags: a flag list here would be a third copy of the CLI's surface (after the code and the published reference) with nothing keeping it honest — and the version installed in *this* project may differ from the one this file was written against.

**The project describes its own standards.** `.pair/llms.txt` is a machine-readable index of the installed knowledge base (llmstxt.org): guidelines, how-to guides, templates, adoption files. Read it from the working directory, then follow it to the file that answers the question:

```bash
cat .pair/llms.txt
```

Use it whenever the request is about *how this project works* rather than about a CLI command — its testing strategy, its code-design rules, its way of working, which how-to covers a task. The answer then comes from the user's repository, so it is right for their project by construction, and it stays right when they change it.

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
| to know what to work on next | `/pair-next` | it reads adoption files and PM state; do not reimplement it here |

If a request matches nothing here, go back to `--help` and to `llms.txt` and reason from what is actually there. If it matches nothing in either, say so plainly instead of inventing a flag or a rule.

### How to act

1. **State the command and what it will change** before running it. Anything that writes into the user's repository is theirs to approve.
2. **Prefer the project's own binary** (`npx pair-cli …`) over a fetched one, so the version matches the project.
3. **Report what the CLI printed**, including warnings. Never restate a failure as a success, and never summarise away a message that names a path.
4. **Stop on the first failure** and show its output. Do not retry with different flags hoping one works.
5. **Quote the project's own words** when answering from `llms.txt`, and name the file — so the user can check you, and correct the source rather than you.

### What this skill does not do

- It does not configure a PM tool, quality gates, or any adoption decision — those are their own skills, and they need the knowledge base this one installs.
- It does not write the knowledge base or adoption files. The CLI writes the KB; other skills own their content.
- It does not replace the catalog. Once pair is installed the process skills are there — this assistant points at them rather than reimplementing them.
- It does not uninstall the plugin for you. Removing a plugin from the user's Claude Code installation is theirs to run, not a side effect of a setup step.

## Idempotence

Re-running is safe and is expected to be a confirmation, not a repeat: an existing repository is left alone, an installed CLI is not reinstalled, and `install` on an already-installed project reports what it finds. If a step would overwrite something the user changed, say so and stop.
