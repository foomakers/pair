# Installation FAQ

Common installation and setup issues with step-by-step solutions for pair-cli.

## Quick Diagnostics

Before diving into specific issues, run these commands to gather diagnostic information:

```bash
# Check your environment
node --version        # Should be 18 or higher
pnpm --version       # Should be installed
pair-cli --version   # Current pair-cli version (if installed)

# Check installation location
which pair-cli       # Should show installation path
npm list -g @pair/pair-cli  # Global npm installation check
```

## Permission Issues

### Problem: `EACCES` or permission denied errors during installation

**On macOS/Linux:**

```bash
# Option 1: Use npm with correct permissions (recommended)
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
source ~/.profile
npm install -g @pair/pair-cli

# Option 2: Use pnpm (avoids permission issues)
npm install -g pnpm
pnpm add -g @pair/pair-cli

# Option 3: Fix npm permissions (if you prefer npm)
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}
npm install -g @pair/pair-cli
```

**On Windows:**

```cmd
# Run PowerShell as Administrator, then:
npm install -g @pair/pair-cli
```

### Problem: Can't write to `/usr/local/lib/node_modules`

```bash
# Change npm's default directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
source ~/.profile

# Now install
npm install -g @pair/pair-cli
```

## Node Version Issues

### Problem: `Unsupported Node.js version` or compatibility errors

**Check your Node version:**

```bash
node --version
# Must be 18.0.0 or higher
```

**Fix with Node Version Manager (recommended):**

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install and use Node 18+
nvm install 18
nvm use 18
nvm alias default 18

# Verify
node --version
npm install -g @pair/pair-cli
```

**Fix with Volta (alternative):**

```bash
# Install volta
curl https://get.volta.sh | bash
source ~/.bashrc

# Install Node 18
volta install node@18
volta install npm

# Verify and install
node --version
npm install -g @pair/pair-cli
```

### Problem: Multiple Node versions causing conflicts

```bash
# Clean up and start fresh
npm uninstall -g @pair/pair-cli
nvm use 18  # or your preferred version
npm cache clean --force
npm install -g @pair/pair-cli
```

## pnpm Issues

### Problem: `pnpm` command not found

**Install pnpm:**

```bash
# Via npm
npm install -g pnpm

# Via Homebrew (macOS)
brew install pnpm

# Via curl (Unix)
curl -fsSL https://get.pnpm.io/install.sh | sh
```

### Problem: pnpm store corruption or cache issues

**Clean and reinstall:**

```bash
# Clear pnpm store and cache
pnpm store prune
pnpm cache clear

# Remove existing installation
pnpm remove -g @pair/pair-cli

# Reinstall fresh
pnpm add -g @pair/pair-cli
```

### Problem: `ERR_PNPM_STORE_BROKEN` or store corruption

**Reset pnpm completely:**

```bash
# Remove the store
rm -rf ~/.pnpm-store
rm -rf ~/.pnpm-state

# Reinstall pnpm and pair-cli
npm install -g pnpm
pnpm add -g @pair/pair-cli
```

## Native Build Failures

### Problem: `node-gyp` errors or native module build failures

**On macOS:**

```bash
# Install Xcode Command Line Tools
xcode-select --install

# If that fails, install manually:
# 1. Download Xcode from App Store
# 2. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
# 3. Accept license: sudo xcodebuild -license accept

# Clear and reinstall
npm uninstall -g @pair/pair-cli
npm install -g @pair/pair-cli
```

**On Linux (Ubuntu/Debian):**

```bash
# Install build tools
sudo apt update
sudo apt install build-essential python3-distutils

# Clear and reinstall
npm uninstall -g @pair/pair-cli
npm install -g @pair/pair-cli
```

**On Linux (CentOS/RHEL/Fedora):**

```bash
# Install development tools
sudo yum groupinstall "Development Tools"
# or for newer versions:
sudo dnf groupinstall "Development Tools"

# Clear and reinstall
npm uninstall -g @pair/pair-cli
npm install -g @pair/pair-cli
```

**On Windows:**

```bash
# Install Windows Build Tools
npm install -g windows-build-tools

# Or install Visual Studio Build Tools manually:
# Download from: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2019
```

## Offline/Network-Restricted Installs

### Problem: No internet access or corporate firewall blocks npm

**Use manual artifacts:**

1. Download from [GitHub Releases](https://github.com/foomakers/pair/releases/latest):

   - `pair-cli-manual-vX.Y.Z.zip` for manual installation

2. Extract and use:

```bash
# Extract the ZIP file
unzip pair-cli-manual-vX.Y.Z.zip
cd pair-cli-manual-vX.Y.Z

# Run directly (no installation needed)
./bin/pair-cli --version
./bin/pair-cli --help

# Optional: Add to PATH
echo 'export PATH=$HOME/pair-cli-manual-vX.Y.Z/bin:$PATH' >> ~/.profile
source ~/.profile
```

### Problem: Corporate proxy blocking installs

```bash
# Configure npm for corporate proxy
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080
npm config set registry https://registry.npmjs.org/

# If authentication required:
npm config set proxy http://username:password@proxy.company.com:8080

# Install through proxy
npm install -g @pair/pair-cli
```

## Corrupted Installs

### Problem: `pair-cli` command not found after installation

**Verify installation location:**

```bash
# Check if installed
npm list -g @pair/pair-cli
pnpm list -g @pair/pair-cli

# Check PATH
echo $PATH
which pair-cli
```

**Fix PATH issues:**

```bash
# Add npm global bin to PATH
npm config get prefix  # Note the output path
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.profile
source ~/.profile
```

### Problem: Command exists but fails to run

**Clean reinstall steps:**

```bash
# 1. Remove completely
npm uninstall -g @pair/pair-cli
# or
pnpm remove -g @pair/pair-cli

# 2. Clear caches
npm cache clean --force
# or
pnpm store prune

# 3. Clear global node_modules (careful!)
rm -rf ~/.npm/_global/node_modules/@pair
# or similar path for your system

# 4. Reinstall fresh
npm install -g @pair/pair-cli
```

### Problem: Version conflicts or "command not found" after update

**Deterministic cleanup:**

```bash
# 1. Find all pair-cli installations
find /usr/local -name "*pair-cli*" 2>/dev/null
find ~/.npm -name "*pair-cli*" 2>/dev/null
find ~/.pnpm -name "*pair-cli*" 2>/dev/null

# 2. Remove all found instances
# (Review the list first, then remove manually)

# 3. Clean install
npm install -g @pair/pair-cli

# 4. Verify
pair-cli --version
which pair-cli
```

## Diagnostic Commands

When reporting issues, include output from these commands:

```bash
# System information
uname -a                    # OS and architecture
node --version             # Node.js version
npm --version              # npm version
pnpm --version             # pnpm version (if installed)

# pair-cli specific
pair-cli --version         # pair-cli version
which pair-cli             # Installation location
npm list -g @pair/pair-cli # Installation details

# Environment
echo $PATH                 # PATH variable
npm config get prefix     # npm global prefix
npm config list           # npm configuration
```

**Sample diagnostic output:**

```text
$ uname -a
Darwin MacBook-Pro.local 21.6.0 Darwin Kernel Version 21.6.0

$ node --version
v18.17.0

$ npm --version
9.6.7

$ pair-cli --version
pair-cli v0.1.0

$ which pair-cli
/usr/local/bin/pair-cli
```

## Getting Additional Help

If these solutions don't resolve your issue:

1. **Check existing issues**: [GitHub Issues](https://github.com/foomakers/pair/issues)
2. **Open a new issue**: Include diagnostic output from commands above
3. **Include in your report**:
   - Operating system and version
   - Node.js and npm/pnpm versions
   - Complete error message
   - Steps you've already tried

**Do not include** in reports:

- Personal paths with usernames
- API keys or tokens
- Corporate proxy credentials
