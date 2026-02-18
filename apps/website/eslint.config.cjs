// eslint.config.cjs - Uses React overlay from @pair/eslint-config
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reactConfig = require('@pair/eslint-config/eslint.config.react.cjs')

module.exports = [
  { ignores: ['.source/**', '.next/**', 'next-env.d.ts', 'postcss.config.js'] },
  ...reactConfig,
]
