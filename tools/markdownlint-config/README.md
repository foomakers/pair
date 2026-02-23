# @pair/markdownlint-config

Shared markdownlint configuration for the pair monorepo.

## Usage

Scripts (via bin wrappers):

```json
"scripts": {
  "mdlint:check": "markdownlint-check",
  "mdlint:fix": "markdownlint-fix"
}
```

The bin scripts auto-discover `.markdownlint.jsonc` and `.markdownlintignore` from this package.

## Files

- `.markdownlint.jsonc` — lint rules
- `.markdownlintignore` — ignored patterns (node_modules, dist, CHANGELOG.md, etc.)
- `bin/` — wrapper scripts (`markdownlint-check`, `markdownlint-fix`)
