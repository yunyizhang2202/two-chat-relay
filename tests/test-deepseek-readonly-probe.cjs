const test = require('node:test');
const assert = require('node:assert/strict');
const probe = require('../experimental/deepseek-readonly-probe.js');
const fakeDocument = { querySelectorAll: sel => Array.from({length: sel.includes('textarea') ? 1 : sel === '.ds-message' ? 4 : 0}) };
test('reject other sites', () => {
  assert.deepEqual(probe.snapshot(fakeDocument, {origin:'https://chatgpt.com'}), {ok:false,reason:'wrong-origin'});
});
test('counts selector matches only', () => {
  const result = probe.snapshot(fakeDocument,{origin:'https://chat.deepseek.com'});
  assert.equal(result.ok,true);
  assert.equal(result.counts.messages.find(x=>x.selector==='.ds-message').matches,4);
  assert.ok(!JSON.stringify(result).includes('messageText'));
  assert.ok(!JSON.stringify(result).includes('cookie'));
});
test('handles obsolete or invalid selectors without aborting', () => {
  const doc = {querySelectorAll: () => {throw Error('Unsupported selector');}};
  const result=probe.snapshot(doc,{origin:'https://chat.deepseek.com'});
  assert.equal(result.counts.composer[0].matches, null);
});
test('refuses missing document', () => assert.throws(()=>probe.snapshot(null,{origin:'https://chat.deepseek.com'})));
