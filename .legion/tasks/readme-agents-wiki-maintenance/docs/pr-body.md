## Summary

- Move the README / AGENTS / wiki maintenance work onto a new branch from latest `origin/main` after PR #16 merged.
- Update project docs and Legion wiki for the Yuan-backed dual-device implementation, including the distinction between `enable_WebRTC: true` and observed DataChannel usage.
- Add the full `dual-device-play` gameplay wiki, update the docs index, and preserve the newer `communication-table` wiki entry from main.

## Tests

- `node common/scripts/install-run-rush.js install`
- `node common/scripts/install-run-rush.js lint`
- `node common/scripts/install-run-rush.js validate-content`
- `grep "本轮|本次|MVP|Later" docs/gameplay/dual-device-play`

## Notes

- No production app code changed.
- WebRTC DataChannel observability remains a code follow-up; current docs intentionally avoid claiming that local `enable_WebRTC: true` proves DataChannel is active.
