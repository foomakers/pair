#!/usr/bin/env node
/**
 * Post-build script: Fix package.json imports for compiled output
 *
 * Problem: package.json imports point to src/*.ts files, but runtime needs dist/*.js
 * Solution: Copy package.json to dist/ with imports rewritten for .js files
 */

const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..')
const pkgPath = path.join(rootDir, 'package.json')
const distPkgPath = path.join(rootDir, 'dist', 'package.json')

// Read original package.json
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

// Rewrite imports: ./src/**/*.ts → ./**/*.js
if (pkg.imports) {
  const rewrittenImports = {}
  for (const [key, value] of Object.entries(pkg.imports)) {
    if (typeof value === 'string') {
      // ./src/config/*.ts → ./config/*.js
      // ./src/diagnostics.ts → ./diagnostics.js
      rewrittenImports[key] = value.replace(/^\.\/src\//, './').replace(/\.ts$/, '.js')
    } else {
      rewrittenImports[key] = value
    }
  }
  pkg.imports = rewrittenImports
}

// Remove unnecessary fields for dist
delete pkg.scripts
delete pkg.devDependencies

// Write to dist/package.json
fs.writeFileSync(distPkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log('✅ Post-build: package.json copied to dist/ with rewritten imports')
