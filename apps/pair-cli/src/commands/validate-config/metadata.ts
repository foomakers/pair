export const validateConfigMetadata = {
  name: 'validate-config',
  description: 'Validate asset registry configuration and KB structure',
  usage: 'pair validate-config [options]',
  examples: [
    'pair validate-config                           # Validate default config.json',
    'pair validate-config --config ./my-config.json # Validate custom config file',
  ],
  options: [{ flags: '-c, --config <file>', description: 'Path to config.json file to validate' }],
  notes: [
    'Validates config.json structure and required fields',
    'Checks asset registry definitions for correctness',
    'Returns exit code 0 on success, 1 on validation errors',
    'Displays detailed error messages for failed validations',
  ],
} as const
