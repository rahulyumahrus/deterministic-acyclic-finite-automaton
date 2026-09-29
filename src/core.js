/**
 * Deterministic Acyclic Finite Automaton (DAFDA).
 *
 * A DAFDA is built from a finite set of strings and supports exactly two
 * operations afterwards: `contains(word)` and `serialize()`. The automaton is
 * acyclic by construction (every accepted word has bounded length), which is
 * what makes minimisation tractable without touching the general DFA
 * minimisation algorithm.
 *
 * Design choices that are not obvious from the code:
 *
 *  - States are plain objects with a `Map` for transitions. Using a Map instead
 *    of a plain object keeps symbol keys safe even when the input alphabet
 *    contains strings like "__proto__" or "constructor". The alphabet here is
 *    arbitrary JavaScript strings, so that defence matters.
 *
 *  - Minimisation is done bottom-up by hashing a canonical signature of each
 *    state (is-final flag + the sorted list of (symbol, child-signature)
 *    pairs). Two states with the same signature are behaviourally identical in
 *    an acyclic automaton, so they can be merged. This is simpler and faster
 *    than Hopcroft-style partition refinement and is correct precisely because
 *    the graph is acyclic.
 *
 *  - The empty string is a legitimate member of the language. We represent it
 *    by making the start state final. This is the only interpretation of
 *    "contains('')" the library supports; see the README.
 */

/**
 * @typedef {Object} DAFDAState
 * @property {boolean} final
 * @property {Map<string, DAFDAState>} transitions
 * @property {number} id  Stable id assigned during minimisation; used only for
 *   serialisation and debugging.
 */

/**
 * @typedef {Object} SerializedDAFDA
 * @property {number} start       The id of the start state.
 * @property {Array<{id: number, final: boolean, transitions: Array<[string, number]>}>} states
 */

/**
 * Build a fresh, mutable state object.
 * @returns {DAFDAState}
 */
function newState() {
  return { final: false, transitions: new Map(), id: -1 };
}

/**
 * Insert a single word into the trie rooted at `root`.
 *
 * We deliberately do NOT deduplicate here: building the trie first and
 * minimising once at the end is cheaper than maintaining minimality on every
 * insertion, because early insertions create states that later insertions will
 * merge away anyway.
 *
 * @param {DAFDAState} root
 * @param {string} word
 */
function insert(root, word) {
  let cur = root;
  for (const ch of word) {
    let next = cur.transitions.get(ch);
    if (!next) {
      next = newState();
      cur.transitions.set(ch, next);
    }
    cur = next;
  }
  cur.final = true;
}

/**
 * Compute a canonical signature for every state in the trie, then rewrite the
 * graph so behaviourally identical states are shared.
 *
 * Returns the new root. Signatures are computed via memoised post-order
 * traversal: a state's signature depends only on its own finality and its
 * children's signatures, and because the graph is acyclic this recursion
 * terminates.
 *
 * @param {DAFDAState} root
 * @returns {DAFDAState}
 */
function minimise(root) {
  // Map from signature string -> representative state.
  const canon = new Map();
  // Map from original state object -> representative state, to break cycles in
  // the (acyclic) sharing graph during traversal.
  const seen = new Map();

  /**
   * @param {DAFDAState} state
   * @returns {DAFDAState}
   */
  function build(state) {
    const cached = seen.get(state);
    if (cached) return cached;

    // Build the signature from already-canonical children, so identical
    // sub-structures collapse to the same string.
    const parts = [];
    for (const [sym, child] of state.transitions) {
      parts.push(sym + '\u0000' + build(child).id);
    }
    // Sorting on the symbol keeps the signature independent of insertion order.
    parts.sort();
    const sig = (state.final ? '1' : '0') + '\u0001' + parts.join('\u0002');

    let rep = canon.get(sig);
    if (!rep) {
      rep = { final: state.final, transitions: new Map(), id: canon.size };
      canon.set(sig, rep);
      for (const [sym, child] of state.transitions) {
        rep.transitions.set(sym, build(child));
      }
    }
    seen.set(state, rep);
    return rep;
  }

  return build(root);
}

export class DAFDA {
  /**
   * @param {Iterable<string>} words
   */
  constructor(words) {
    if (words === null || words === undefined) {
      throw new TypeError('words must be an iterable of strings');
    }
    const root = newState();
    /** @type {Set<string>} */
    const seen = new Set();
    for (const w of words) {
      if (typeof w !== 'string') {
        throw new TypeError('every word must be a string');
      }
      if (seen.has(w)) continue;
      seen.add(w);
      insert(root, w);
    }
    this._root = minimise(root);
    /** @type {number} */
    this._size = seen.size;
  }

  /**
   * Number of distinct words the automaton was built from.
   * @returns {number}
   */
  get size() {
    return this._size;
  }

  /**
   * Number of states in the minimised automaton. Useful for sanity-checking
   * that minimisation actually did something.
   * @returns {number}
   */
  get stateCount() {
    let n = 0;
    const stack = [this._root];
    const visited = new Set();
    while (stack.length) {
      const s = stack.pop();
      if (visited.has(s)) continue;
      visited.add(s);
      n++;
      for (const child of s.transitions.values()) stack.push(child);
    }
    return n;
  }

  /**
   * Test membership of `word`.
   *
   * Iterates one transition per character. If at any point there is no
   * outgoing edge for the current symbol, the word is not in the language. The
   * empty string is accepted iff the start state is final.
   *
   * @param {string} word
   * @returns {boolean}
   */
  contains(word) {
    if (typeof word !== 'string') {
      throw new TypeError('word must be a string');
    }
    let cur = this._root;
    for (const ch of word) {
      cur = cur.transitions.get(ch);
      if (!cur) return false;
    }
    return cur.final;
  }
}

/**
 * Produce a plain-JSON-safe description of `dafda`.
 *
 * The serialised form is a flat array of states, each identified by a stable
 * integer id, plus the start id. Transitions are arrays of [symbol, targetId]
 * pairs. This shape is deliberately verbose-but-trivial to consume from any
 * language; it is not the most compact possible encoding, but it is small
 * enough for the use cases this library targets (thousands to low millions of
 * short strings).
 *
 * @param {DAFDA} dafda
 * @returns {SerializedDAFDA}
 */
export function serialize(dafda) {
  if (!(dafda instanceof DAFDA)) {
    throw new TypeError('serialize() expects a DAFDA instance');
  }
  const states = [];
  const order = [dafda._root];
  const idOf = new Map();
  idOf.set(dafda._root, 0);
  // BFS so that low ids cluster near the root, which makes the serialised
  // form easier to eyeball when debugging.
  while (order.length) {
    const s = order.shift();
    const id = idOf.get(s);
    const transitions = [];
    for (const [sym, child] of s.transitions) {
      let childId = idOf.get(child);
      if (childId === undefined) {
        childId = idOf.size;
        idOf.set(child, childId);
        order.push(child);
      }
      transitions.push([sym, childId]);
    }
    states.push({ id, final: s.final, transitions });
  }
  return { start: 0, states };
}
