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

  // Um mesmo ouvinte registrado em várias chaves é chamado UMA vez por lote,
  // não uma vez por chave. Sem isso, `set({ level, layer })` disparava o
  // redesenho do mapa duas vezes e, como ele tem um await no meio, as duas
  // execuções passavam da limpeza e desenhavam os polígonos em dobro.
  function notify(keys) {
    const chamar = new Set();
    for (const k of keys) {
      const s = subs.get(k);
      if (s) for (const fn of s) chamar.add(fn);
    }
    for (const fn of chamar) fn(state[keys[0]], state);
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
