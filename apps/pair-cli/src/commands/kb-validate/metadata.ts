export const kbValidateMetadata = {
  name: 'kb-validate',
  description: 'Validate Knowledge Base structure and manifest',
  usage: 'pair kb-validate [options]',
  examples: ['pair kb-validate', 'pair kb-validate --path ./my-kb'],
  options: [
    {
      flags: '--path <path>',
      description: 'Path to knowledge base directory (defaults to current directory)',
    },
  ],
  notes: ['Validates .pair directory structure', 'Returns non-zero exit code if validation fails'],
} as const
