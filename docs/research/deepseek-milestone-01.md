# DeepSeek milestone 01: read-only DOM research

Date: 2026-10-14
Branch: `feature/deepseek-adapter`
Status: **Experimental / no live DeepSeek verification**

## Evidence

Current public third-party code provides *candidate*, not confirmed, selectors:
- [Context-Sync](https://github.com/Vineetpandey0/context-sync/blob/main/injectors/deepseek.js): `textarea#chat-input`, generic `textarea`, Lexical `[contenteditable]`, uses native textarea setter + input events.
- [webcode](https://github.com/three-water666/webcode/blob/main/gateway-vscode/src/platforms.ts): `.ds-message`, `.ds-markdown`, `textarea.ds-scroll-area`; mentions DOM virtualization.

These implementations conflict on some selectors. No provider-specific send implementation is authorized by selector guesses alone.

## First prototype

`experimental/deepseek-readonly-probe.js` implements a **no-text read-only selector inventory**: for an explicitly supplied DeepSeek DOM, count candidates for composer, messages, assistant content, controls and identity markers. It does **not** read message bodies, collect cookies/tokens, scroll, click, type, call network APIs, or store any data.

The module is deliberately **not referenced by manifest.json**; v1.0 behavior remains exactly unchanged.

Test: `node --test tests/test-deepseek-readonly-probe.cjs`. Four isolated fixture tests passed locally on 2026-10-14.

## Next questions requiring actual DeepSeek test page

1. What selectors identify a *single user turn* and *one completed assistant turn* without double-counting nested elements?
2. Are stable per-turn IDs available, or does virtualization require baselines by DOM order and semantic content?
3. Does the page expose a reliable busy/stop state separate from intermediate reasoning?
4. Can the extension confirm a click sent the *complete* message, including Markdown/LaTeX, without auto retry?
5. How does Chrome background/minimized behavior affect this site?
6. What are the current platform terms and privacy implications of site automation?

Until these are confirmed, **do not declare DeepSeek supported** or include `chat.deepseek.com` in production manifest host permissions.

## Source release preservation

The user-confirmed ChatGPT-to-ChatGPT v1.0 code is preserved at `release/v1.0.0`. All experiments go on `feature/deepseek-adapter` or pull requests; do not modify main before tests.
