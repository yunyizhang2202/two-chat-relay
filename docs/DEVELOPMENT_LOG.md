# Development log / 开发留痕

## 2026-10-14 — v1.0.0 public baseline prepared

**Source**: local v0.13 package used as baseline. User feedback indicates previous ChatGPT↔ChatGPT relay and v0.12 long-text flows worked; v0.13 UI was accepted for publication. These are *user reports*, not an independently reproduced signed-in end-to-end run in this environment.

**Frozen behavior**: select two existing ChatGPT conversations; manual/autonomous/free start; finite/unlimited rounds; length policies; uncertain delivery pauses; no model APIs.

**Change for release**: documentation, MIT license, privacy review, version bump from 0.13.0 to 1.0.0; no modifications to `background.js`, `content.js`, or `relay_core.js`.

**Next research**: DeepSeek (`https://chat.deepseek.com`) provider adapter. Research must not be construed as implemented support.

**Review gates before cross-provider merge**: new-provider read-only probe, role and identity extraction, long text maths, send confirmation, background tab and restart behavior, terms/permissions review.

Reference docs: [DeepSeek adapter](research/deepseek-adapter.md), [architecture decision ADR-0001](adr/0001-provider-adapters.md).
