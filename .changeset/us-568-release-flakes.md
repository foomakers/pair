---
'@pair/pair-cli': patch
'@pair/website': patch
---

Release flakes and v0.5 validation defects: `tokens.pipe` test no longer spawns the CLI in a hook, website `ts:check` runs after the build that regenerates `.source`, `run --dry-run --profile <unknown>` halts for `--card` and `--root`, 404 message keeps hyphenated prerelease ids, invalid project config prints the error prefix once, `pair-cli --help | head` exits quietly on EPIPE, docs sidebar separator renders, `package` skips the markdown parse for link-free files, `/pair-assistant` states how to opt back in after a skipped registry and names every installed path.

Release with `--version X.Y.Z`: CHANGELOG headings and `@pair/*` dependency lines now carry X.Y.Z, like every `package.json` (`changelog-version` step in `version.yml`).

`install --source <github.com URL>` that is not the official release no longer announces the CLI version in the download line.
