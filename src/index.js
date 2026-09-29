/**
 * Public entry point for the dafda library.
 *
 * Re-exports the two pieces of API surface that callers actually need:
 * the `DAFDA` class (build + query) and the `serialize` helper for persisting
 * a compiled automaton to a compact JSON-safe structure.
 */
export { DAFDA } from './core.js';
export { serialize } from './core.js';
