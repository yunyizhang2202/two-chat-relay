# ADR-0001 — Keep the v1.0 relay engine as baseline; introduce site adapters

Date: 2026-10-14  
Status: **Proposed; not yet implemented**

## Context

`background.js` and `popup.js` currently hard-code `https://chatgpt.com/` and ChatGPT conversation URL readiness; `content.js` assumes ChatGPT conversation DOM and composer. Mixing DeepSeek selectors directly into these functions risks breaking the working baseline.

## Decision proposed

- Preserve v1.0.0 as the ChatGPT-only baseline (tagging and release on GitHub when available).
- Define a small provider interface: `matchUrl`, `isConversationReady`, `listUserTurns`, `listAssistantTurns`, `getStableTurnId`, `extractText`, `isGenerating`, `insertPrompt`, `submitPrompt`, `confirmSent`.
- Add `providers/chatgpt` and `providers/deepseek` behind an explicit provider detector, keeping transport/state-machine semantics unchanged.
- Default new adapters to **read-only diagnostics**, enabling send only after correct per-provider verification tests.
- Grant site-specific permissions only for supported providers; avoid `<all_urls>`, blanket content injection, network interception and undocumented backend calls.
- Do not retry unknown sends automatically. Preserve cross-provider delivery checks and fail-closed behavior.

## Consequences

Adds some structure but should simplify maintenance and enable site-to-site conversations (ChatGPT ↔ DeepSeek). Site changes may still break adapters. No claims of DeepSeek support until exercised with real pages and terms reviewed.
