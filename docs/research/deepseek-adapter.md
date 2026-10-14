# DeepSeek adapter research / DeepSeek 适配研究

**Date:** 2026-10-14  
**Status:** Research only; **not implemented** in v1.0.

## Goal
Adapt the same two-tab relay to ChatGPT ↔ DeepSeek without model API keys while protecting the Chrome ↔ ChatGPT v1.0 baseline.

## Existing open-source evidence (not confirmed on this user's live page)
- [Context-Sync DeepSeek injector](https://github.com/Vineetpandey0/context-sync/blob/main/injectors/deepseek.js): checks `textarea#chat-input`, generic textarea and Lexical contenteditable, using native textarea setter and input events.
- [webcode platform registry](https://github.com/three-water666/webcode/blob/main/gateway-vscode/src/platforms.ts): uses `.ds-message`, `textarea.ds-scroll-area` and records potential virtualized message lists.
- DeepSeek website: https://chat.deepseek.com/

These selector choices vary across projects. **Treat them as hypotheses**, not stable promises.

## Plan
1. **Read-only DOM probe:** detect conversation URL, composer, assistant/user roles, message IDs, generating/stop status and virtualization without logging chat content or credentials.
2. **Modular provider interface:** isolate site-specific logic without changing v1.0 relay core.
3. **Simulation:** short, long, Chinese, English, code, Markdown and LaTeX.
4. **Live two-way tests:** explicit A/B tab selection, sender confirmation, background tab switching/minimizing, unknown-send safety pause.
5. **Compliance and privacy review:** check both providers' applicable rules and minimize site permissions.

Related issues: #1, #2, #3.
