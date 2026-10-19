// ===========================================================================
// Estado reativo minimo
//
// Substitui o que reactiveVal()/observeEvent() faziam no Shiny. Sao ~40
// linhas porque e tudo de que este painel precisa: um objeto de estado, um
// set() que avisa quem escutou, e nada mais. Nao ha servidor, entao nao ha
// invalidacao em cascata nem ciclo de vida de sessao para administrar.
// ===========================================================================

export function createStore(initial) {
  const state = { ...initial };
  const subs = new Map();   // chave -> Set<fn>
  const anySubs = new Set();

  function notify(keys) {
    for (const k of keys) {
      const s = subs.get(k);
      if (s) for (const fn of s) fn(state[k], state);
    }
    for (const fn of anySubs) fn(state, keys);
  }

  return {
    get state() { return state; },
    get(k) { return state[k]; },

    /** set('k', v) ou set({a, b}). Chaves com valor inalterado nao notificam. */
    set(k, v) {
      const patch = typeof k === 'object' ? k : { [k]: v };
      const changed = [];
      for (const [key, val] of Object.entries(patch)) {
        if (!Object.is(state[key], val)) {
          state[key] = val;
          changed.push(key);
        }
      }
      if (changed.length) notify(changed);
      return changed.length > 0;
    },

    /** on('k', fn) ou on(['a','b'], fn). Devolve a funcao de cancelamento. */
    on(keys, fn, { immediate = false } = {}) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        if (!subs.has(k)) subs.set(k, new Set());
        subs.get(k).add(fn);
      }
      if (immediate) fn(state[list[0]], state);
      return () => { for (const k of list) subs.get(k)?.delete(fn); };
    },

    onAny(fn) { anySubs.add(fn); return () => anySubs.delete(fn); },
  };
}
