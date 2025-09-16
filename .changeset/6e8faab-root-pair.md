---
'pair': patch
---

Workspace tooling and CI configuration updates

Summary of changes:

- Update Changesets configuration to align versioning and changelog policies
  (`.changeset/config.json`).
- Modify GitHub Actions workflows used for versioning and release to improve
  changeset selection and CI-side version commit/tag creation
  (`.github/workflows/version.yml`, `.github/workflows/release.yml`).
- Adjust top-level workspace manifests and lockfiles (`package.json`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`) to reflect dependency or script
  updates required by tooling changes.
- Update tooling package metadata (e.g. `tools/eslint-config`,
  `tools/prettier-config`) to sync linting/format policies used by repository
  scripts and hooks.

Reason: these are developer tooling and CI config changes intended to
improve release workflow reliability; they do not affect runtime behaviour of
published packages.

Files of note: `.changeset/config.json`, files under `.github/workflows/`,
root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
`tools/eslint-config/package.json`, `tools/prettier-config/package.json`.

---

## "pair": patch

Aggiornamenti di configurazione del workspace, toolchain e workflow CI

Descrizione dettagliata delle modifiche incluse nella commit:

- Configurazione Changesets: aggiornamento del file `.changeset/config.json`
  per allineare le impostazioni di versioning e changelog con le policy del
  repository (es. `baseBranch`, `access` e `updateInternalDependencies`).
- Workflow CI: modifiche ai workflow GitHub Actions relativi al versioning e al
  rilascio (`.github/workflows/version.yml` e `.github/workflows/release.yml`)
  per migliorare la selezione dei changeset, la creazione di commit di versione
  e la generazione dei tag in ambiente CI.
- Manifest e workspace metadata: aggiornamenti ai file di configurazione di
  workspace (top-level `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`)
  per riflettere modifiche a dipendenze o a script utili al processo di build e
  packaging.
- Tooling repository: aggiornamenti ai metadati dei pacchetti di supporto
  (ad esempio `tools/eslint-config/package.json` e
  `tools/prettier-config/package.json`) per sincronizzare le policy di linting
  e formattazione usate dagli script e dagli hook di repository.

Motivazione del livello "patch": le modifiche sono limitate agli strumenti di
sviluppo e alle pipeline CI; non comportano cambiamenti breaking al runtime dei
pacchetti pubblicati. Gli aggiornamenti migliorano la robustezza del processo
di rilascio e la coerenza delle configurazioni di sviluppo.

File di riferimento principali: `.changeset/config.json`, file sotto
`.github/workflows/`, `package.json` di root, `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, e i `package.json` di `tools/eslint-config` e
`tools/prettier-config`.
