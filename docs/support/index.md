# Support Resources

Get help with pair installation, configuration, and usage.

## Quick Links

- **[How Pair Works](../how-pair-works.md)** - Understand the development process and KB management
- **[Installation FAQ](installation-faq.md)** - Solutions for common install issues
- **[Diagnostic Script](../../scripts/diagnose-install.sh)** - Automated environment check
- **[GitHub Issues](https://github.com/foomakers/pair/issues)** - Report bugs and feature requests

## Support Scope

We provide support for:

- ✅ Installation and setup issues
- ✅ Configuration problems
- ✅ Bug reports with reproducible cases
- ✅ Feature requests and enhancement suggestions
- ✅ Documentation improvements

We cannot help with:

- ❌ General Node.js or npm troubleshooting (see their docs)
- ❌ Corporate network/proxy configuration (consult your IT team)
- ❌ Custom modifications to pair source code
- ❌ Integration with third-party tools not mentioned in docs

## Before Reporting Issues

1. **Check the FAQ first**: [Installation FAQ](installation-faq.md) covers 80%+ of issues
2. **Search existing issues**: [GitHub Issues](https://github.com/foomakers/pair/issues)
3. **Try the diagnostic script**: Run `scripts/diagnose-install.sh` for environment info
4. **Test with clean environment**: Isolate the issue from other tools/configs

## Escalation Path

### Step 1: Self-Service

- Review [Installation FAQ](installation-faq.md)
- Run diagnostic script: `bash scripts/diagnose-install.sh`
- Search [existing GitHub issues](https://github.com/foomakers/pair/issues)

### Step 2: Community Support

- **GitHub Discussions**: [pair Discussions](https://github.com/foomakers/pair/discussions)
  - Best for: Usage questions, best practices, community tips
  - Response time: 1-3 days (community-driven)

### Step 3: Issue Reporting

- **GitHub Issues**: [Create New Issue](https://github.com/foomakers/pair/issues/new)
  - Best for: Bug reports, feature requests, installation problems
  - Response time: 3-5 business days
  - **Owner**: @rucka (maintainer)

### Step 4: Direct Contact

- **Email**: gianluca@carucci.org
  - Best for: Security issues, private matters
  - Response time: 5-7 business days
  - Include "pair-cli" in subject line

## Issue Reporting Template

When opening a GitHub issue, include this information:

### Required Information

```markdown
**Environment:**

- OS: [macOS/Linux/Windows + version]
- Architecture: [x64/arm64/other]
- Node.js version: [output of `node --version`]
- npm version: [output of `npm --version`]
- pnpm version: [output of `pnpm --version` or "not installed"]

**pair-cli Info:**

- Version: [output of `pair-cli --version` or "not installed"]
- Install method: [npm global/pnpm global/manual download]
- Install location: [output of `which pair-cli` or "not found"]

**Issue Description:**
[Clear description of the problem]

**Steps to Reproduce:**

1. [First step]
2. [Second step]
3. [Third step]

**Expected Behavior:**
[What you expected to happen]

**Actual Behavior:**
[What actually happened]

**Error Output:**
[Complete error message, if any]

**Diagnostic Output:**
[Output from `bash scripts/diagnose-install.sh` if available]

**Steps Already Tried:**

- [ ] Checked Installation FAQ
- [ ] Searched existing issues
- [ ] Tried clean reinstall
- [ ] Ran diagnostic script
- [ ] [Other steps you tried]
```

### Optional Information

- Screenshots (for UI-related issues)
- Minimal reproduction case
- Corporate environment details (if relevant)
- Related error logs from other tools

### Security Issues

For security-related issues:

- **DO NOT** open public GitHub issues
- Email directly: rucka@tiscalinet.it
- Include "SECURITY" in subject line
- Provide full details privately

## Diagnostic Information Collection

### Automated Diagnostic Script

Run the diagnostic script to collect environment information:

```bash
# Make executable (if needed)
chmod +x scripts/diagnose-install.sh

# Run diagnostic
bash scripts/diagnose-install.sh
```

**Script collects:**

- Operating system and architecture
- Node.js and package manager versions
- pair-cli installation details
- Environment variables (PATH, etc.)
- Common installation paths

### Manual Diagnostic Commands

If the script isn't available, collect this manually:

```bash
# System info
uname -a
node --version
npm --version
pnpm --version 2>/dev/null || echo "pnpm not installed"

# pair-cli info
pair-cli --version 2>/dev/null || echo "pair-cli not found"
which pair-cli 2>/dev/null || echo "pair-cli not in PATH"
npm list -g @pair/pair-cli 2>/dev/null || echo "not installed via npm"

# Environment
echo "PATH: $PATH"
npm config get prefix
```

## Privacy and Data Redaction

### What to Share

- ✅ Error messages and stack traces
- ✅ Command outputs and logs
- ✅ System and software versions
- ✅ Installation paths (if not personal)

### What to Redact

Before sharing diagnostic output, remove:

- ❌ Personal usernames and home directories
- ❌ Corporate network configurations
- ❌ API keys, tokens, or credentials
- ❌ Internal company domain names
- ❌ Sensitive environment variables

**Example redaction:**

```diff
- PATH=/Users/john.smith/bin:/usr/local/bin
+ PATH=/Users/[USERNAME]/bin:/usr/local/bin

- npm config proxy=http://user:pass@proxy.company.com:8080
+ npm config proxy=http://[USER]:[PASS]@[PROXY_HOST]:[PORT]
```

## Channel Owners and Contacts

### Primary Maintainer

- **GitHub**: [@rucka](https://github.com/rucka)
- **Email**: rucka@tiscalinet.it
- **Role**: Lead maintainer, bug fixes, releases

### Fallback Contacts

If primary maintainer is unavailable:

- **GitHub Organization**: [@foomakers](https://github.com/foomakers)
- **Community**: GitHub Discussions for urgent community help

### Response Time Expectations

- **GitHub Issues**: 3-5 business days
- **GitHub Discussions**: 1-3 days (community)
- **Email**: 5-7 business days
- **Security Issues**: 1-2 business days

---

**Need immediate help?** Check the [Installation FAQ](installation-faq.md) first - it solves most issues quickly!
