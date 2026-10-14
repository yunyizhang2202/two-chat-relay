# ADR 0001 — Provider adapters

**Status:** Proposed. Date: 2026-10-14.

Current v1.0 is a Chrome / ChatGPT-only proof of concept. Websites have different DOMs and editing mechanisms. For DeepSeek we will keep the existing relay state machine and introduce independent site adapters with operations such as `matchesUrl`, `readTurns`, `isGenerating`, `getComposer`, `send`, `confirmSend`.

Requirements: preserve baseline tests; stable message identity over DOM remount; prevent duplicate sends; confirm message fidelity after formatting; fail closed on uncertainty; minimal per-host permissions.

Do not use hidden backend endpoints, cookies or network interception to bypass site behavior. Implement in a feature branch, and merge only after test evidence.
