# dafda

Compiles a fixed set of strings into a minimal deterministic acyclic finite automaton for compact storage and fast membership tests.

```js
import { DAFDA, serialize } from './src/index.js';

const d = new DAFDA(['cat', 'car', 'card']);
d.contains('cat');   // true
d.contains('cart');  // false

const blob = serialize(d);
// { start: 0, states: [ { id: 0, final: false, transitions: [['c', 1]] }, ... ] }
```

## Why this exists

The problem is the boring one: you have a few thousand to a few million short strings (identifiers, tokens, allow-lists) and you want to answer "is this string in the set?" without holding every string in memory and without paying hash-table memory overhead per entry. A minimal DAFDA stores shared prefixes and suffixes as a single graph and answers membership in O(|word|) time.

The trade-off: this library builds the automaton once and then only answers `contains`. It does not support incremental insertion after construction, because maintaining minimality on every insert is more expensive than building a trie and minimising once. If you need a mutable set, use a `Set`.

## Edge cases you will hit

- **The empty string is a legitimate member.** `new DAFDA([''])` accepts `''` and rejects everything else. `new DAFDA(['', 'a'])` accepts both. There is no special "null word"; the start state is simply marked final.
- **Symbols are whole code points, not UTF-16 code units.** `new DAFDA(['😀'])` treats the emoji as one transition. This follows from iterating the word with `for...of`. If you need byte-level granularity, encode your inputs first.
- **Prototype-pollution-style keys are safe.** `'__proto__'`, `'constructor'`, and `'toString'` are ordinary members; transitions are stored in a `Map`, not on a plain object.
- **`serialize` is one-way.** The library can write a compact description of an automaton but does not read one back. Adding a deserialiser would double the API surface for a feature the brief does not require.

## API

- `new DAFDA(words: Iterable<string>)` — build a minimal automaton. Throws `TypeError` if `words` is `null`/`undefined` or if any element is not a string.
- `dafda.contains(word: string): boolean` — membership test. Throws `TypeError` if `word` is not a string.
- `dafda.size: number` — number of distinct words the automaton was built from.
- `dafda.stateCount: number` — number of states in the minimised automaton.
- `serialize(dafda: DAFDA): { start: number, states: Array<{ id: number, final: boolean, transitions: Array<[string, number]> }> }` — produce a JSON-safe description. Throws `TypeError` if the argument is not a `DAFDA` instance.
