# Issue drafts to create when the public repository exists

## Issue 1 — DeepSeek read-only adapter spike

**Labels**: enhancement, research  
**Goal**: Run site-specific DOM diagnostics on a non-sensitive DeepSeek test chat, identifying conversation URLs, input/send controls, assistant/user turns, stable IDs, streaming indicator, and virtualization without accessing message text in reports.  
**Done when**: redacted DOM probe works in a Chromium tab and role/identity/ready states are testable with fixtures. No sends are performed.

## Issue 2 — Modular provider interface without v1 regression

**Labels**: architecture, enhancement  
**Goal**: Extract site-dependent URL match/readiness, DOM turn detection, composer actions, and delivery confirmation behind an adapter API without changing the core relay state machine.  
**Done when**: 63 existing Node tests and browser mock tests pass; ChatGPT v1 behavior remains stable.

## Issue 3 — ChatGPT ↔ DeepSeek end-to-end relay

**Labels**: enhancement, needs-testing  
**Goal**: Enable explicitly selected cross-provider tabs using per-site minimal permissions; ensure identity-based new turn detection, strict long-text fidelity, fail-closed unknown sends.  
**Done when**: manual/live test cases in docs/research/deepseek-adapter.md pass both ways. Not supported until then.
