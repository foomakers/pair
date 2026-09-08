# Decision: Repo citation anchors are checked against github.com's own slugs, offline

## Date

2026-09-08

## Status

Active

## Category

Convention Adoption

## Context

ADL 2026-09-08-repo-citations-are-gated-through-the-site-compiler gates every `github.com/foomakers/pair/{blob,tree,raw}/main/<path>` citation the docs site emits against `git ls-files`, and explicitly deferred the `#fragment` half: four citation occurrences across three pages (`integrations/web-cloud-environments.mdx` ×2, `reference/guidelines-catalog.mdx`, `reference/quality-model.mdx`) point at a heading inside the cited file, and nothing verified that the heading exists or that its anchor is spelled the way github.com spells it. The oracle that ADL named for the deferral — `gh api /markdown` — turned out not to be one: MEASURED on 2026-09-08, the endpoint returns the rendered HTML **without** heading ids (the `id="user-content-<slug>"` attributes are added by the github.com page, not by the API).

The first attempt at this gate (PR #471) answered the oracle question with a 33,570-line fixture of anchors fetched from the GitHub API for 937 files plus a 70-line generator to refresh it — the single most expensive and fragile piece of that PR.

## Decision

1. **The oracle is github.com's rendered page, measured once and encoded as rules, not as a fixture.** Fetching the rendered pages and extracting `user-content-*` ids: the three `.md` files cited with a fragment today (25 + 25 + 12), `blob/main/apps/website/content/docs/pm-tools/index.mdx` (6 — github.com renders `.mdx` as Markdown), `tree/main/apps/pair-cli` (6 — a `tree/` page renders the directory's README under the listing; a directory without a README serves 0), and, for the inline-anchor shape this repository does not contain, `gitui-org/gitui/blob/2fa693cb/FAQ.md` (8: `## <a name="table-of-contents"></a> Table of Contents` serves both `table-of-contents` and the untrimmed slug `-table-of-contents`). `githubHeadingSlugs()` — `remark-parse` + `remark-gfm` for "which headings", `github-slugger` 2.0.0 over the heading's text content (inline HTML contributes its `id`/`name` but no tag text, and no trimming) for "which slug", a fresh slugger per file so duplicates get `-1`, `-2`… in document order, plus any `id`/`name` written in raw HTML — reproduces all 82 ids across those six pages with no missing and no extra id. That parity measurement is recorded here, not shipped as a test fixture: the rules are github-slugger's, which is the algorithm GitHub publishes for exactly this purpose and the one fumadocs-core already resolves.
2. **Every kind of anchor github.com serves is modelled, and nothing else is assumed to work.** The kind github.com *serves* decides, not the word in the URL: MEASURED 2026-09-08, `tree/<file>` is 301-redirected to `blob/<file>`, and `blob/<dir>` and `raw/<dir>` to `tree/<dir>`, so the gate resolves the kind from the tracked index first (this also corrects Check 5b, which until now reported `blob/<dir>` as untracked). A `blob/` of a Markdown file (`.md`, `.markdown`, `.mdx`) is rendered and has heading anchors; a `tree/` page has the heading anchors of the README tracked in that directory (`README.md`/`.markdown`/`.mdx`, any case) and nothing without one; `#L<n>` / `#L<n>-L<m>` line anchors (columns tolerated: `#L5C1-L9C4`) exist only where github.com shows a source panel — a non-Markdown blob, or a Markdown blob cited with `?plain=1` — and are bounded by the file's line count, so `#L<n>` on a rendered Markdown page is reported with the fix (`cite it with ?plain=1`); `raw/` has no anchors. A fragment that does not fit one of those is a dead citation, reported with the reason.
3. **Frontmatter and fences are not headings, here as on github.com.** github.com renders YAML frontmatter as a table; the reader strips it first, and a `#` inside a fence is a code line to remark-parse as it is to GitHub.
4. **Fails closed.** A tracked target the run cannot read is reported, not skipped; fragment case is exact (ids are lowercase and browser fragment matching is case-sensitive); a percent-escaped fragment is decoded before comparison and a malformed escape is compared literally, never thrown.
5. **No new dependency resolutions.** `github-slugger` 2.0.0 and `mdast-util-to-string` 4.0.0 are declared as `apps/website` devDependencies through the catalog; both were already in the lockfile (resolved by fumadocs-core and the remark pipeline), so the lockfile gains importer entries only. `remark-parse` 11.0.0 and `unified` 11.0.5 were already catalog entries.

## Alternatives Considered

- **A fetched anchor fixture (PR #471's shape)**: 33,570 lines that go stale on every heading edit anywhere in the repo, refreshed by a generator with network access — the maintenance cost was the reason #471 was reset. Rejected.
- **`gh api /markdown` at gate time**: not an oracle for ids (measured above), and a network call inside `docs:staleness` would make the gate flaky and unavailable offline. Rejected.
- **Fetching the rendered blob page at gate time**: the true oracle, but network-bound and rate-limited, and github.com's page HTML is not a contract. Used once to validate the rules; not run by the gate.
- **Heading-only, no line anchors**: `#L<n>` citations are common in code references and are cheap to bound by line count; leaving them unchecked would be a silent gap the same size as the one this closes. Included.
- **Treating `.mdx` and `tree/` as anchor-less (this ADL's first draft)**: measured false on both counts (6 ids each on the pages above) and, being a blocking gate, each would have been a false positive on a correct citation — the worst outcome for a gate. Corrected before adoption.
- **Leaving the deferral in place**: the anchors in `pm-tools/**` are zero today, but the three pages that carry fragments would keep breaking silently on any heading rename in the cited files. Rejected.

## Consequences

- `docs:staleness` Check 5c: a citation's `#fragment` must be an anchor github.com renders for that file. Wired into the same `findDeadRepoCitations` pass as Check 5b, so a page pays the compile once; anchor checks read the cited file from the repository root (`readTracked`).
- Measured on the real tree at adoption: 4 fragment citations on 3 pages to 3 targets — all pass; a probe page with a dead heading anchor and an out-of-range line anchor fails with two findings that name the fragment and the reason (`no heading or anchor in the target renders to that id`; `line anchor #L999999 is outside the file's 70 lines`), and the same URL in a code span is not reported.
- 41 mutation-verified rows in `docs-staleness-check.test.ts` (live/dead heading, punctuation + backticks + em-dash slug, duplicate suffixes, fence, frontmatter, setext, unicode + percent-escape, html anchors in double/single/no quotes, inline heading anchor and its untrimmed slug, case, `.mdx` live/dead, line anchors in/out of range including the last line and one past it, column ranges, line anchor on a rendered Markdown page, `?plain=1`, `tree/` README live/dead/absent/line, the three 301 shapes live/dead, `raw/`, empty fragment, dead path with fragment, code span) plus `githubHeadingSlugs` unit rows; neutralising the anchor check reddens 24 tests, a per-heading slugger reddens the duplicate rows, dropping the decode reddens the unicode row, dropping `.mdx` from the rendered set, the README lookup from `tree/`, either 301 normalisation, or the exact line bound reddens the row that pins it.
- The cited file is read once per run (`readTracked` memoises by path); its headings are re-parsed per citation occurrence — 4 today, 2.3s for the whole `docs:staleness` run.
- Not modelled, and therefore reported as dead if ever cited: anchors produced by GitHub's rendering of non-Markdown formats it also renders (`.rst`, `.adoc`, notebooks), a `README` with no extension, and headings written as raw HTML (`<h2>…</h2>` — github.com slugs their text, this reader sees an html node); a `tree/` directory holding more than one README variant (the first tracked one is used). Deliberate: fail closed and point the citation at a Markdown heading. A fragment on `raw/<file>` is inert rather than a 404, and is still reported: the author meant an anchor, and the rendered `blob/` URL is the one that serves it.

## Adoption Impact

- `.pair/adoption/tech/tech-stack.md`: register `github-slugger` 2.0.0 and `mdast-util-to-string` 4.0.0 as `apps/website` devDependencies for the docs gate.
- `apps/website/package.json`, `pnpm-workspace.yaml`: catalog entries and devDependencies (`github-slugger`, `mdast-util-to-string`, `remark-parse`, `unified`).
- No change to `.pair/adoption/tech/way-of-working.md`; the gate lives inside the existing `docs:staleness` step.
