/* Small, tested policy helpers, shared by background/content. No external dependencies. */
(() => {
  'use strict';
  const normal = s => String(s ?? '').normalize('NFKC').replace(/\s+/g,'').trim();
  const samePrompt = (actual, expected) => Boolean(expected) && normal(actual) === normal(expected);
  // ChatGPT can DISPLAY a submitted Markdown prompt as rich text. The page's
  // innerText then omits Markdown syntax although the underlying message is the
  // same. Only accept known structural Markdown-to-visible transformations,
  // NOT punctuation removal or loose substring comparisons.
  const visibleMarkdown = source => {
    let t=String(source ?? '').replace(/\r\n?/g, '\n');
    t=t.replace(/^ {0,3}```[^\n]*\n/gm, '').replace(/^ {0,3}```[ \t]*$/gm, '');
    t=t.replace(/^ {0,3}#{1,6}[ \t]+/gm, '');
    t=t.replace(/^ {0,3}>[ \t]?/gm, '');
    t=t.replace(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/gm, '');
    t=t.replace(/^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '');
    t=t.replace(/!?\[([^\]]+)\]\((?:[^()\\]|\\.|\([^()]*\))*\)/g, '$1');
    t=t.replace(/(\*\*|__)([^\n]*?\S)\1/g, '$2');
    t=t.replace(/(~~)([^\n]*?\S)\1/g, '$2');
    t=t.replace(/(?<![\w*])\*([^\n*]*?\S)\*(?![\w*])/g, '$1');
    t=t.replace(/(?<!\w)_([^\n_]*?\S)_(?!\w)/g, '$1');
    t=t.replace(/(`+)([^`\n]*?\S)\1/g, '$2');
    t=t.replace(/\\([\\`*_{}\[\]()#+.!>~-])/g, '$1');
    return t;
  };
  // Mathematical notation in a forwarded answer may be displayed as KaTeX/MathML.
  // These are structural transformations, NOT a fuzzy/prefix match: the complete
  // expression, order and surrounding prose must still be identical.
  const visibleMath = source => String(source ?? '')
    .replace(/\\\(([^]*?)\\\)/g,'$1')
    .replace(/\\\[([^]*?)\\\]/g,'$1')
    .replace(/\$\$([^]*?)\$\$/g,'$1');
  const matchForms = source => {
    const raw=String(source??'');
    const candidates=[raw,visibleMarkdown(raw),visibleMath(raw),visibleMarkdown(visibleMath(raw)),visibleMath(visibleMarkdown(raw))];
    return [...new Set(candidates.map(normal))];
  };
  const sameRenderedPrompt = (rendered, expected) => {
    if(!expected || !rendered) return false;
    const norm=normal(rendered);
    return matchForms(expected).some(v=>v===norm);
  };
  // Privacy-preserving discrepancy summary: report position and codepoints,
  // never the prompt contents. This is diagnostic only; it NEVER authorizes a send.
  const diffSummary=(actual,expected)=>{
    const candidates=[String(expected??''),visibleMarkdown(expected),visibleMath(expected),visibleMarkdown(visibleMath(expected))];
    const rendered=normal(actual);
    const ranked=candidates.map(c=>{
      const wanted=normal(c);let i=0;
      while(i<wanted.length&&i<rendered.length&&wanted[i]===rendered[i])i++;
      return {i,wanted};
    }).sort((a,b)=>b.i-a.i);
    const {i,wanted}=ranked[0];
    const point=(s,n)=>n>=s.length?'末尾':`U+${s.codePointAt(n).toString(16).toUpperCase().padStart(4,'0')}`;
    if(i===wanted.length&&rendered.length>wanted.length)
      return `正文前 ${i} 字符一致，末尾多 ${rendered.length-i} 个规范化字符（可能是网页控件文字）`;
    if(i===rendered.length&&wanted.length>rendered.length)
      return `正文前 ${i} 字符一致，末尾少 ${wanted.length-i} 个规范化字符（可能是截断）`;
    return `首个差异约在第 ${i+1} 个规范化字符：预期 ${point(wanted,i)}，读回 ${point(rendered,i)}`;
  };
  const baselineOf = snap => ({
    user:snap.userCount,assistant:snap.assistantCount,
    userKey:snap.lastUserKey||'',assistantKey:snap.lastAssistantKey||''
  });
  const identityStatus=(snap,base)=>{
    if(!snap?.ok||!base)return 'missing';
    const keys=[snap.lastUserKey,snap.lastAssistantKey,base.userKey,base.assistantKey];
    if(keys.some(Boolean)){
      // A partial identity is not enough to distinguish re-rendering from a new turn.
      if(!keys.every(Boolean))return 'partial';
      return snap.lastUserKey!==base.userKey && snap.lastAssistantKey!==base.assistantKey?'new':'old';
    }
    return snap.userCount>base.user && snap.assistantCount>base.assistant?'new':'old';
  };
  const hasNewTurn = (snap, base) => {
    if (!snap?.ok || !base || snap.busy || !snap.stable || !snap.lastSpeakerAssistant || !snap.text) return false;
    if(identityStatus(snap,base)!=='new') return false;
    // A user-configurable length policy is checked in the orchestrator, not here.
    // Never silently discard a long, otherwise complete reply.
    return true;
  };
  // Delivery confirmation is deliberately stricter than detecting a new assistant turn.
  // A count decrease or unchanged count is normal when the chat renderer virtualizes old turns.
  // Never accept a count increase if stable message IDs show the same final user turn.
  const deliveryEvidence = (before, after, expected) => {
    const previous = before?.lastUserKey || '';
    const current = after?.lastUserKey || '';
    const keyed = Boolean(previous && current);
    const changed = keyed ? previous !== current
      : (!previous && !current && Number(after?.userCount) > Number(before?.userCount));
    if (!changed) return 'pending';
    if (!after?.userText) return 'pending'; // transient rendering during tab switches
    const observed = [after.userText, ...(Array.isArray(after.userTextVariants)?after.userTextVariants:[])].filter(Boolean);
    return observed.some(v=>samePrompt(v,expected)||sameRenderedPrompt(v,expected)) ? 'confirmed' : 'mismatch';
  };
  const isStuck = (state, now) => Boolean(state.processing && (!state.pendingAt || now - state.pendingAt > 60000));
  globalThis.RelayCore = Object.freeze({samePrompt, sameRenderedPrompt, visibleMarkdown, visibleMath, diffSummary, baselineOf, identityStatus, hasNewTurn, deliveryEvidence, isStuck});
})();
