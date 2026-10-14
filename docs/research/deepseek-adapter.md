# DeepSeek adapter research / DeepSeek 网页适配研究

**Research date / 研究日期:** 2026-10-14  
**Status / 状态:** design exploration only, **not implemented / 尚未实现**.

## Goal / 目标

Connect one existing ChatGPT tab and one existing DeepSeek chat tab for turn-by-turn relaying, without model API keys, while keeping the existing reliable ChatGPT↔ChatGPT baseline intact.

## Source observations / 来源支持

- Official DeepSeek chat website: https://chat.deepseek.com/ (site confirmed). No guarantee of stable DOM selectors.
- The open-source [Context-Sync DeepSeek injector](https://github.com/Vineetpandey0/context-sync/blob/main/injectors/deepseek.js) attempts `textarea#chat-input`, visible `textarea`, then Lexical `contenteditable`; it uses the native `HTMLTextAreaElement.value` setter and input/change events before pressing Send. Its message scraper also uses `.ds-markdown` and other class-based fallbacks. These are **third-party implementation hints**, not verified selectors for this user's login/page version.
- The open-source [webcode site table](https://github.com/three-water666/webcode/blob/main/gateway-vscode/src/platforms.ts) names `textarea.ds-scroll-area`, `.ds-message`, virtualized messages, and a platform-specific send/stop control. These differ from Context-Sync, showing why a single selector is not reliable.
- Chrome docs: [content scripts](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts), [message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging). Host permissions and isolated content scripts should be scoped to specific hosts.

## Initial comparison / 初步差异

| Capability | ChatGPT v1.0 | DeepSeek research |
|---|---|---|
| Host | `chatgpt.com` | `chat.deepseek.com` |
| Existing conversation URL | validated `/c/{id}` | must identify with read-only page probe |
| Text input | existing ChatGPT composer | `textarea#chat-input` / `.ds-scroll-area` candidates (unverified) |
| Message containers | existing ChatGPT new/old structure | `.ds-message`, `.ds-markdown` candidates (unverified) |
| Stable message IDs | handled by v1.0 adapter | must probe; may virtualize older messages |
| Streaming finished | ChatGPT detection + stability | inspect visible generating/stop signal; don't guess |
| Complete long messages | Markdown / LaTeX checks | must test folds, code and math formatting |

## Main risks / 风险

1. **Virtualization**: A site may remove old messages from the DOM while scrolling. Message *counts* and naive element identities can regress; rely on semantic/stable turn identity where possible.
2. **Duplicate/uncertain send**: Never retry just because visible text did not match. Distinguish formatting from actual truncation.
3. **Focus/background behavior**: Switch between A and B, test minimized Chrome and frozen/discarded pages without assuming success.
4. **Account safety / Terms**: Review current DeepSeek and ChatGPT terms and privacy before any live automation. Start with throwaway chats with no personal data. Never intercept authenticated API requests/cookies.
5. **Different response streams**: DeepSeek may display reasoning and final answer separately; transfer only the visible finalized answer, not intermediate work or control metadata.

## Validation checklist / 验证计划

- [ ] Get a redacted, non-sensitive DeepSeek page structure report for one signed-in test chat (no message text, cookies or credentials).
- [ ] Detect existing conversation and user/assistant roles independently of text content.
- [ ] Identify stable turn keys under rerender and scroll virtualization.
- [ ] Detect actual response completion and no-response timeout.
- [ ] Insert and send a short Chinese and English prompt with positive confirmation.
- [ ] Strict Markdown/LaTeX long-message confirmation, and real truncation rejection.
- [ ] ChatGPT → DeepSeek and DeepSeek → ChatGPT, both tab orders.
- [ ] Test tab switching, minimized Chrome and safe pause/recovery.
- [ ] Verify minimal permissions, terms and privacy, then update README support matrix.

## Next implementation step / 下一步

Write a read-only `DeepSeek` diagnostics adapter on a **separate feature branch**, with selectors configurable but no send action. Gather the DOM counts/roles/composer readiness from the user's own test tab. Introduce the adapter only after tests and review; do not change the v1.0 release files for exploratory work.
