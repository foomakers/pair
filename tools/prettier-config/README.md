# @pair/prettier-config

Shared Prettier configuration for the pair monorepo.

## Usage

**Default Behavior:** All packages use the standard shared Prettier rules unless a package provides its own config file. Customization is optional.

### 1. Configuration

To use this config, add to your `package.json`:

```json
"prettier": "@pair/prettier-config"
```

Or import directly:

```js
module.exports = require('@pair/prettier-config/.prettierrc.json')
```

### 2. CLI Commands

To check code style:

```sh
pnpm prettier-check
```

To automatically format code:

```sh
pnpm prettier-fix
```

### 3. Ignored Files

Files and folders to ignore are defined in `.prettierignore`.

## Extending the Shared Config in Your Package

To extend the shared Prettier config in a package, create a `.prettierrc.js` file in your package root:

```js
module.exports = {
  ...require('@pair/prettier-config/.prettierrc.json'),
  // Add or override options specific to your package
  // Example:
  // printWidth: 120,
}
```

Alternatively, you can reference the config directly in your `package.json`:

```json
"prettier": "@pair/prettier-config"
```

See [Code Design Guidelines](../../.pair/tech/knowledge-base/02-code-design-guidelines.md#prettier-configuration) for more details.
