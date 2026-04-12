---
"@pair/pair-cli": patch
---

fix: normalize include paths in buildCopyOptions to match resolveBehavior keys

Include filter on mirror registries (e.g., `.github` with `include: ["/agents"]`) silently skipped all included directories during install. Keys in `folderBehavior` now include the registry source prefix and strip leading slashes to match `resolveBehavior` lookup.
