# @pair/prettier-config

Shared Prettier configuration for the pair monorepo. All packages use these rules by default unless they provide their own config.

## Usage

Add to your package's `package.json`:

```json
"prettier": "@pair/prettier-config"
```

Scripts (via bin wrappers):

```json
"scripts": {
  "prettier:check": "prettier-check",
  "prettier:fix": "prettier-fix"
}
```

### Extending in a Package

Create a `.prettierrc.js` in your package root:

```js
module.exports = {
  ...require('@pair/prettier-config/.prettierrc.json'),
  // package-specific overrides
}
```

## Files

- `.prettierrc.json` — formatting rules
- `bin/` — wrapper scripts (`prettier-check`, `prettier-fix`)
- `.prettierignore` — ignored patterns
