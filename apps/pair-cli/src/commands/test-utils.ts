import { InMemoryFileSystemService } from '@pair/content-ops'

/**
 * Creates a test FileSystemService instance for command handler tests.
 * Pre-configured with typical test fixtures.
 */
export function createTestFileSystem(): InMemoryFileSystemService {
  const fs = new InMemoryFileSystemService({}, '/test-module', '/test-project')

  // Setup typical config file in both locations
  const configContent = JSON.stringify({
    dataset_registries: {
      '.pair': {
        source: '.pair',
        target_path: '.pair-knowledge',
        behavior: 'mirror',
        description: 'Test registry',
        default_target: 'latest',
      },
    },
  })

  // Config in project root
  fs.writeFile('/test-project/config.json', configContent)

  // Config in module dir (for pair-cli)
  fs.writeFile('/test-module/config.json', configContent)

  // Create basic .pair directory structure
  fs.writeFile('/test-project/.pair/knowledge/README.md', '# Test KB')

  return fs
}
