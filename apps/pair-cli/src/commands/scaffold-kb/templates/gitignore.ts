/**
 * `.gitignore` for a scaffolded KB repo: packaging output and credentials stay
 * out of the repository (the released ZIP is a build artifact, not source).
 */
export function renderGitignore(): string {
  return [
    '# Packaging output (pair package)',
    'dist/',
    '*.zip',
    '',
    '# Credentials and environment',
    '.env',
    '.env.*',
    '*.pem',
    '*.key',
    '.npmrc',
    '',
    '# Tooling noise',
    'node_modules/',
    '.DS_Store',
    '',
  ].join('\n')
}
