---
'@pair/pair-cli': patch
'@pair/website': patch
'@pair/brand': patch
'@pair/knowledge-hub': patch
'@pair/eslint-config': patch
'@pair/prettier-config': patch
---

Release v0.4.5 — Website, Docs & Brand Identity

### Website

- **Landing page** with brand identity, demo video, and accessible design
- **Full-text search** powered by Orama (client-side, zero external deps)
- **Vercel hosting** with automatic preview deploys on PRs

### Documentation

- **Getting Started** guides for solo devs, teams, and organizations
- **4 tutorials**: first project, existing project, team setup, enterprise adoption
- **6 how-to guides**: CLI workflows, install from URL, customize KB, adopter checklist, troubleshooting, update links
- **Reference**: CLI commands, 31 skills catalog, KB structure, configuration
- **Customization**: how to adopt pair, customize templates, scale to teams and orgs
- **Developer Journey**: step-by-step from induction to execution
- **Integrations**: Claude Code, Codex, Cursor, GitHub Copilot, Windsurf
- **PM Tools**: Filesystem, GitHub Projects, Linear
- **Contributing**: dev setup, architecture, skills authoring, KB guidelines, release process
- **FAQ**: 22 answers across 6 categories

### CLI

- **llms.txt support**: auto-generates `.pair/llms.txt` on install/update; website serves `/llms.txt` and `/llms-full.txt` for LLM-friendly discovery
- **New branding**: pair logo and tagline shown on every CLI command

### Fixes

- Search now works correctly on all docs pages
- Navigation no longer loops on section index pages
