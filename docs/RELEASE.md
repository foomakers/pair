# Release & Manual Install Guide

This document describes the bundled manual-install packaging used by the release pipeline (issue #19).

## Overview

- **Build once**: CI runs changesets to version packages, builds the monorepo, and produces artifacts.
- **Bundled artifact**: `pair-cli-manual-vX.Y.Z.zip` contains a self-contained JavaScript bundle created with ncc, along with metadata, TypeScript definitions, and cross-platform executables.
- **Checksum**: For each artifact a SHA256 checksum file is produced (`*.sha256`).

## Packaging (local)

**Script**: `scripts/package-manual.sh <version>`

This script creates a completely self-contained bundled artifact using [ncc](https://github.com/vercel/ncc) bundler. It produces:

1. **JavaScript bundle**: Single self-contained file with all dependencies
2. **TypeScript definitions**: Generated `.d.ts` files for type safety
3. **Cross-platform executables**: Bin wrappers for Unix/Linux/macOS and Windows
4. **Metadata files**: `package.json`, `README.md`, `LICENSE`, `config.json`
5. **Dataset inclusion**: Copies knowledge base dataset if present
6. **ZIP archive**: Compressed artifact with SHA256 checksum

## Artifact Structure

```
pair-cli-manual-vX.Y.Z/
├── bundle-cli/           # Self-contained JavaScript bundle
│   ├── index.js         # Main bundled application
│   ├── index.d.ts       # TypeScript definitions
│   └── dataset/         # Knowledge base data (if present)
├── bin/                 # Executable wrappers
│   └── pair-cli        # Unix/Linux/macOS executable
├── pair-cli            # Top-level executable (Unix/Linux/macOS)
├── pair-cli.cmd        # Windows executable
├── package.json        # Clean package.json for bundled artifact
├── README.md           # CLI documentation
├── LICENSE             # License file
└── config.json         # Default configuration
```

## CI Integration

CI should run the following high-level jobs:

1. **version** (changesets): Update package versions
2. **build** (`pnpm -w build`): Build all packages including TypeScript compilation
3. **package** (`scripts/package-manual.sh $VERSION`): Create bundled artifact using ncc
4. **release**: Create GitHub Release v$VERSION and upload artifacts

### Prerequisites

Before running the packaging script, ensure:

- All packages are built (`pnpm -w build`)
- Node.js and npm/npx are available in CI environment
- `ncc` bundler is accessible via npx (auto-installs if needed)
- `dts-bundle-generator` is available for TypeScript definitions

### Build Dependencies

The packaging process requires these tools:

- **ncc** (`@vercel/ncc`): Node.js bundler for creating self-contained artifacts
- **dts-bundle-generator**: Generates TypeScript definition files
- **zip**: Archive creation utility
- **sha256sum/shasum**: Checksum generation

## Notes

- **Bundling approach**: Uses ncc to create a single self-contained JavaScript file with all dependencies, eliminating the need for `node_modules` in the final artifact
- **Cross-platform support**: Generates executables for Unix/Linux/macOS and Windows automatically
- **TypeScript support**: Includes generated `.d.ts` files for type safety when used as a library
- **Dataset inclusion**: Automatically includes the knowledge base dataset if present in the repository
- **Clean package.json**: Creates a minimal `package.json` suitable for the bundled artifact
- **Source maps**: Includes source maps in the bundle for debugging purposes

## Installation from Manual Artifact

Users can install the manual artifact by:

1. **Download**: Get `pair-cli-manual-vX.Y.Z.zip` from GitHub releases
2. **Extract**: Unzip to desired location
3. **Execute**: Run `./pair-cli` (Unix/Linux/macOS) or `pair-cli.cmd` (Windows)

No additional dependencies or `npm install` required - the bundle is completely self-contained.

## Next steps

- ✅ **Packaging script**: Implemented and tested with ncc bundling
- ✅ **CI workflow**: Created `.github/workflows/release.yml` to automate the release process
- ⏳ **Release testing**: Test manual installation process on different platforms
- ⏳ **Documentation**: Update installation guides to reference manual artifacts

## Automated Release Process

The release process is now fully automated through GitHub Actions. The `.github/workflows/release.yml` workflow handles the complete release pipeline:

### Trigger Conditions

The release workflow is triggered by:

- **Tag push**: When a tag matching `v*` is pushed to the repository
- **Release creation**: When a GitHub release is published
- **Manual dispatch**: Can be triggered manually with a specific version

### Workflow Steps

1. **Environment Setup**

   - Checkout code
   - Install pnpm and Node.js
   - Install dependencies
   - Load environment variables

2. **Quality Assurance**

   - Run `pnpm quality-gate` (type checking, tests, linting)
   - Build all packages with `pnpm build`

3. **Artifact Creation**

   - Execute `scripts/package-manual.sh` with the release version
   - Generate bundled artifacts using ncc
   - Create cross-platform executables and ZIP archive

4. **Release Publication**
   - Upload artifacts to GitHub Actions artifacts
   - Create/update GitHub release with artifacts attached
   - Generate release notes with installation instructions

### Release Artifacts

The workflow produces:

- `pair-cli-manual-{version}.zip` - Complete bundled artifact
- `pair-cli-manual-{version}.zip.sha256` - SHA256 checksum for verification
- GitHub release with download links and installation instructions

### Manual Workflow Dispatch

You can manually trigger a release by:

1. Going to GitHub Actions → Release workflow
2. Click "Run workflow"
3. Enter the version (e.g., `v1.0.0`)
4. The workflow will create a release with that version tag

### Environment Variables

The workflow uses:

- `GITHUB_TOKEN` - Automatically provided for release creation

This automated process ensures consistent, reproducible releases with bundled artifacts ready for manual installation in any environment.
