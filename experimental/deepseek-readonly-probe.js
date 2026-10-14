/*
 * DeepSeek DOM survey — research-only, NOT integrated into the extension.
 * Deliberately does not extract message text, user IDs, tokens or cookies,
 * click, type, scroll, write storage, or issue network requests.
 * Candidate CSS selectors are based on third-party implementations and
 * MUST be checked against the live website before use.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DeepSeekReadonlyProbe = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const CANDIDATES = Object.freeze({
    composer: ['textarea#chat-input', 'textarea.ds-scroll-area', 'textarea', '[contenteditable="true"][data-lexical-editor="true"]'],
    messages: ['.ds-message', '[class*="user-message"]', '[class*="assistant-message"]', '.ds-markdown'],
    assistantContent: ['.ds-markdown.ds-assistant-message-main-content', '[class*="assistant-message"] .ds-markdown'],
    controls: ['button[type="submit"]', 'button[aria-label*="Send" i]', 'button[aria-label*="Stop" i]'],
    identityMarkers: ['[data-message-id]', '[data-testid*="message"]', '[data-role="user"]', '[data-role="assistant"]']
  });
  function snapshot(doc, location) {
    if (!doc || typeof doc.querySelectorAll !== 'function') throw new TypeError('A DOM Document is required');
    const origin = String(location?.origin ?? '');
    if (origin !== 'https://chat.deepseek.com') return {ok:false, reason:'wrong-origin'};
    const counts = {};
    for (const [group, selectors] of Object.entries(CANDIDATES)) {
      counts[group] = selectors.map(selector => {
        try {return {selector, matches:doc.querySelectorAll(selector).length};}
        catch (_) {return {selector, matches:null};}
      });
    }
    return {ok:true, site:'deepseek', status:'research-only', counts};
  }
  return Object.freeze({CANDIDATES, snapshot});
});
