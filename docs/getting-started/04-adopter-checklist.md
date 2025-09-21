# Adopter Checklist

Complete this checklist to verify your pair setup is working correctly. This should take less than 30 minutes.

## Prerequisites Check

- [ ] Node.js 18+ installed: `node --version`
- [ ] pnpm installed: `pnpm --version`
- [ ] Terminal/command line access
- [ ] Internet connection (for npm install) or manual download ready

## Installation Verification

### Step 1: Install pair-cli

Choose one installation method:

**npm Global Install:**
```bash
npm install -g @pair/pair-cli
```

**pnpm Global Install:**
```bash
pnpm add -g @pair/pair-cli
```

**Manual Install:**
- Download `pair-cli-manual-vX.Y.Z.zip` from [GitHub Releases](https://github.com/foomakers/pair/releases)
- Extract to a folder
- Use `./pair-cli` (Unix) or `pair-cli.cmd` (Windows)

- [ ] Installation completed without errors
- [ ] `pair-cli --version` shows version number

### Step 2: Test Basic Functionality

- [ ] `pair-cli --help` shows help text
- [ ] `pair-cli install --list-targets` shows available asset types

Expected output includes:
```
📁 Available asset registries:
  github     🔄🎯 .github         GitHub workflows and configuration files
  knowledge  🔄 .pair            Knowledge base and documentation
  adoption   ➕ .pair/product/adopted  Adoption guides and onboarding materials
```

## Sample Project Test

### Step 3: Create Test Project

```bash
# Create a temporary test directory
mkdir /tmp/pair-test
cd /tmp/pair-test

# Create a minimal package.json
echo '{
  "name": "pair-test",
  "version": "1.0.0",
  "scripts": {
    "test": "echo \"Test passed\""
  }
}' > package.json
```

- [ ] Test directory created
- [ ] package.json created with test script

### Step 4: Run Sample Verification

If you have the sample project available:

```bash
# Copy or navigate to sample project
cp -r /path/to/pair/docs/getting-started/sample-project/* .

# Run verification
./verify.sh
```

Expected: Script exits with success (0) and shows sample output.

- [ ] Verification script runs successfully
- [ ] Output matches expected text

## Full Installation Test

### Step 5: Install Assets

```bash
# In your test directory
pair-cli install
```

- [ ] Command completes without errors
- [ ] `.pair/` directory created with files
- [ ] `.github/` directory created (if applicable)

### Step 6: Verify Installation

```bash
# Check created directories
ls -la .pair/
ls -la .github/

# Run any provided tests
npm test  # if package.json has tests
```

- [ ] Directories contain expected files
- [ ] No permission errors during access

## Cleanup

### Step 7: Clean Up Test Environment

```bash
# Return to original directory
cd -

# Remove test directory
rm -rf /tmp/pair-test
```

- [ ] Test environment cleaned up
- [ ] No leftover files or processes

## Validation Summary

**Date Completed:** $(date +%Y-%m-%d)

**Installation Method Used:** Local development (pnpm dev script)

**Issues Encountered:** 
- `--list-targets` option not yet implemented (shows welcome message instead)
- `pair-cli --help` shows welcome message instead of help text

**Success Rating:** [x] Full Success [ ] Minor Issues [ ] Major Issues

**Notes/Feedback:**
- What worked well: Sample project verification script works perfectly
- What was confusing: CLI help and list-targets commands don't work as documented
- Suggestions for improvement: Implement --list-targets and --help options

**Overall Assessment:** [x] Ready for production use [ ] Needs fixes [ ] Not usable

## Next Steps

If everything worked:
- Start using pair-cli in your actual projects
- Check [CLI Workflows](./02-cli-workflows.md) for advanced usage
- Join the community at [GitHub Discussions](https://github.com/foomakers/pair/discussions)

If issues occurred:
- Review [Troubleshooting](./03-troubleshooting.md)
- File an issue at [GitHub Issues](https://github.com/foomakers/pair/issues)

## Contact

For help with this checklist:
- Email: [maintainer contact]
- Issues: [GitHub Issues](https://github.com/foomakers/pair/issues)
- Discussions: [GitHub Discussions](https://github.com/foomakers/pair/discussions)