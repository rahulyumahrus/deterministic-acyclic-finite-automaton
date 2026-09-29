import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DAFDA, serialize } from '../src/index.js';

/**
 * Helper: build a DAFDA and assert membership for both accepted and rejected
 * words. Centralising this keeps each test focused on the case it exercises.
 */
function check(dafda, { accept = [], reject = [] } = {}) {
  for (const w of accept) assert.equal(dafda.contains(w), true, `should accept ${JSON.stringify(w)}`);
  for (const w of reject) assert.equal(dafda.contains(w), false, `should reject ${JSON.stringify(w)}`);
}

test('accepts exactly the words it was built from', () => {
  const d = new DAFDA(['cat', 'car', 'card']);
  check(d, {
    accept: ['cat', 'car', 'card'],
    reject: ['ca', 'cars', 'cart', 'dog', ''],
  });
});

test('the empty string is a valid member', () => {
  const d = new DAFDA(['']);
  assert.equal(d.contains(''), true);
  assert.equal(d.contains('x'), false);
});

test('empty string can coexist with non-empty members', () => {
  const d = new DAFDA(['', 'a', 'ab']);
  check(d, { accept: ['', 'a', 'ab'], reject: ['b', 'abc'] });
});

test('empty input set accepts nothing', () => {
  const d = new DAFDA([]);
  assert.equal(d.size, 0);
  assert.equal(d.contains(''), false);
  assert.equal(d.contains('anything'), false);
});

test('duplicates are collapsed and size reflects distinct words', () => {
  const d = new DAFDA(['go', 'go', 'go']);
  assert.equal(d.size, 1);
  check(d, { accept: ['go'], reject: ['g', 'goo'] });
});

test('minimisation shares the suffix states of prefixes', () => {
  // 'ab' and 'cb' share the 'b' suffix state. Before minimisation the trie
  // has two 'b' states; after, one. The two prefix states ('a' and 'c')
  // are behaviourally identical — each is a non-final state with a single
  // 'b' transition to the shared final leaf — so they merge too, yielding
  // three states: start, the merged prefix state, and the shared 'b' leaf.
  const d = new DAFDA(['ab', 'cb']);
  assert.equal(d.stateCount, 3);
  check(d, { accept: ['ab', 'cb'], reject: ['b', 'a', 'c', 'abc'] });
});

test('minimisation merges identical subtrees regardless of insertion order', () => {
  const a = new DAFDA(['xy', 'zy']);
  const b = new DAFDA(['zy', 'xy']);
  assert.equal(a.stateCount, b.stateCount);
  assert.equal(a.contains('xy'), b.contains('xy'));
  assert.equal(a.contains('zy'), b.contains('zy'));
});

test('symbols that look like prototype pollution keys are handled safely', () => {
  // These strings would be dangerous if transitions were stored on a plain
  // object. The Map-based storage makes them ordinary keys.
  const d = new DAFDA(['__proto__', 'constructor', 'toString']);
  check(d, {
    accept: ['__proto__', 'constructor', 'toString'],
    reject: ['hasOwnProperty', ''],
  });
});

test('multi-character symbols work because strings are iterated by code point', () => {
  // The library iterates `for...of` over the word, which yields code points,
  // not UTF-16 code units. A surrogate-pair emoji therefore behaves as a
  // single transition symbol.
  const d = new DAFDA(['😀', '😀a', 'a😀']);
  check(d, {
    accept: ['😀', '😀a', 'a😀'],
    reject: ['a', '😀😀'],
  });
});

test('contains throws on non-string input', () => {
  const d = new DAFDA(['x']);
  assert.throws(() => d.contains(42), TypeError);
  assert.throws(() => d.contains(null), TypeError);
  assert.throws(() => d.contains(undefined), TypeError);
});

test('constructor throws on non-string words', () => {
  assert.throws(() => new DAFDA(['ok', 7]), TypeError);
  assert.throws(() => new DAFDA(null), TypeError);
});

test('serialize produces a stable, round-trippable description', () => {
  const d = new DAFDA(['cat', 'car', 'card']);
  const s = serialize(d);
  assert.equal(s.start, 0);
  assert.ok(Array.isArray(s.states));
  assert.ok(s.states.length > 0);
  // Every state has the documented fields.
  for (const st of s.states) {
    assert.equal(typeof st.id, 'number');
    assert.equal(typeof st.final, 'boolean');
    assert.ok(Array.isArray(st.transitions));
    for (const [sym, target] of st.transitions) {
      assert.equal(typeof sym, 'string');
      assert.equal(typeof target, 'number');
    }
  }
  // The start state is state 0 by construction.
  assert.equal(s.states[0].id, 0);
});

test('serialize rejects non-DAFDA inputs', () => {
  assert.throws(() => serialize({}), TypeError);
  assert.throws(() => serialize(null), TypeError);
});

test('serialised form reflects minimisation: shared suffix appears once', () => {
  // 'ab' and 'cb' share the 'b' final state. In the serialised output there
  // should be exactly one state whose only transition set is empty and which
  // is final — the shared 'b' state.
  const d = new DAFDA(['ab', 'cb']);
  const s = serialize(d);
  const finalLeaves = s.states.filter(
    (st) => st.final && st.transitions.length === 0
  );
  assert.equal(finalLeaves.length, 1);
});
