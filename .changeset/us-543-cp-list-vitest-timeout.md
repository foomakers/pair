---
'@pair/website': patch
---

Release validation CP1-CP12 listed in `contributing/release-process` (pair repo docs; `tutorials/release-testing` stays framework-level). `docs-staleness-check` memoizes the MDX compile and heading parse per page content, so repeated `runAllChecks` calls in one vitest worker no longer re-parse the whole docs tree (cold ~1.4 s, warm ~0.2 s): fixes the `[vitest-worker]: Timeout calling "onTaskUpdate"` caused by multi-second synchronous blocks.
