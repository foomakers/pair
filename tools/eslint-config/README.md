# @pair/eslint-config

ESLint configuration for the pair monorepo. See the catalog section in `pnpm-workspace.yaml` for downloaded package versions.

## Usage

**Default Behavior:** All packages use the standard shared ESLint rules unless a package provides its own config file. Customization is optional.

Reference this config in your package's `.eslintrc.js` or via CLI:

```js
module.exports = require('@pair/eslint-config')
```

Or via CLI:

```
pnpm exec eslint . --config tools/eslint-config/index.js
```

## Ignore

See `.eslintignore` for ignored files.

## Extending the Shared Config in Your Package

To extend the shared ESLint config in a package, create a `.eslintrc.js` file in your package root:

```js
module.exports = {
  extends: [require.resolve('@pair/eslint-config')],
  rules: {
    // Add or override rules specific to your package
    // Example:
    // '@typescript-eslint/no-explicit-any': 'off',
  },
}
```

You can also extend React or accessibility configs if available:

```js
module.exports = {
  extends: [require.resolve('@pair/eslint-config/react')],
  // ...
}
```

For accessibility:

```js
module.exports = {
  extends: [require.resolve('@pair/eslint-config/react-a11y')],
  // ...
}
```

See [Code Design Guidelines](../../.pair/tech/knowledge-base/02-code-design-guidelines.md#eslint-configuration) for more details.
