# Coverage Baseline & Targets

Per-type coverage **targets** (gradual goals, human-set) and the established **baseline** the CI guardrail protects, for this project. Read by the shipped [`coverage-gate.sh`](../../knowledge/assets/coverage-gate.sh) guardrail, wired into the pre-merge pipeline per [tier-aware-pipeline.md](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-regression-gate-consumed-by-this-pipeline). Format and KB defaults: [coverage-config-example.md](../../knowledge/assets/coverage-config-example.md).

- The guardrail **blocks a drop below the baseline** (regression), not "must hit target". Below target but at/above baseline only warns.
- `baseline.<type>` left unset is **bootstrapped** from the current coverage on the first gate run — this project starts from bootstrap rather than a fabricated number.
- `<type>` here: `shared` = reusable packages (`packages/*`), `cli` = `apps/pair-cli`, `frontend` = `apps/website`, `default` = anything else.

```ini
target.default=70
target.shared=80
target.cli=70
target.frontend=60

exclude=**/*.d.ts,**/dist/**,**/*.config.ts

# Established baseline — unset => bootstrapped from the current coverage on first run.
# baseline.shared=
# baseline.cli=
# baseline.frontend=
```
