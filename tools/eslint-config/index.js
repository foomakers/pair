module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/style',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    es2021: true
  },
  ignorePatterns: ['dist/', 'build/', 'node_modules/'],
  rules: {
    // Custom rules can be added here
  }
};
