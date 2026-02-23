# @pair/eslint-config

Shared ESLint configuration for the pair monorepo. All packages use these rules by default unless they provide their own config.

## Usage

Reference in your package's `package.json` scripts (via the `lint` / `lint-fix` bin wrappers):

```json
"scripts": {
  "lint": "lint",
  "lint:fix": "lint-fix"
}
```

Or extend directly in a custom config:

```js
module.exports = require('@pair/eslint-config')
```

### Available Configs

| Config | Import | Use Case |
|--------|--------|----------|
| Base | `@pair/eslint-config` | TypeScript packages |
| React | `@pair/eslint-config/react` | React packages |
| React + a11y | `@pair/eslint-config/react-a11y` | React with accessibility rules |

### Extending in a Package

Create an `eslint.config.cjs` in your package root:

```js
module.exports = {
  extends: [require.resolve('@pair/eslint-config')],
  rules: {
    // package-specific overrides
  },
}
```

## Files

- `index.js` — base config (TypeScript + general rules)
- `react.js` — React plugin rules
- `react-a11y.js` — React + jsx-a11y rules
- `bin/` — wrapper scripts (`lint`, `lint-fix`, `eslint`)
- `.eslintignore` — ignored patterns
