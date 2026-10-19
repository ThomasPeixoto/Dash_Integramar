// ===========================================================================
// Carregamento e decodificacao dos dados
//
// O exportador em R grava cada tabela em formato COLUNAR, e as colunas de
// texto de baixa cardinalidade vem como dicionario:
//
//   { n: 5261, cols: { Site: { d: ["ABC","DEF"], v: [0,0,1,...] },
//                      cover: [0.12, 0.31, ...] } }
//
// Aqui elas voltam a ser array de objetos. A forma colunar existe para o
// TRANSPORTE (e ~10x menor depois do gzip); em memoria array de objetos e
// mais simples e, nesta escala -- a maior tabela tem 11 mil linhas --, mais
// que rapido o bastante.
// ===========================================================================

const BASE = 'data/';

/** Reconstroi uma coluna a partir do dicionario, se houver. */
function decodeColumn(col, n) {
  if (Array.isArray(col)) return col;
  if (col && Array.isArray(col.d) && Array.isArray(col.v)) {
    const { d, v } = col;
    const out = new Array(n);
    // indice -1 marca NA: o dicionario so guarda valores reais, entao
    // ausencia e distinta de qualquer string presente.
    for (let i = 0; i < n; i++) out[i] = v[i] < 0 ? null : d[v[i]];
    return out;
  }
  return col;
}

/**
 * { n, cols } colunar -> array de objetos.
 *
 * `n` pode chegar como numero ou como array de um elemento: o exportador usa
 * auto_unbox = FALSE para que uma coluna de uma linha continue sendo array no
 * JSON, e isso tambem envolve os escalares.
 */
export function decodeTable(t) {
  if (!t || !t.cols) return [];
  const n = Array.isArray(t.n) ? t.n[0] : t.n;
  if (!Number.isFinite(n)) return [];
  const names = Object.keys(t.cols);
  const cols = names.map((nm) => decodeColumn(t.cols[nm], n));
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = {};
    for (let j = 0; j < names.length; j++) r[names[j]] = cols[j][i];
    rows[i] = r;
  }
  return rows;
}

const cache = new Map();

async function fetchJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(BASE + path).then((r) => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  });
  cache.set(path, p);
  return p;
}

/** Camada 1: agregados e metadados. Carregado uma vez, no boot. */
export async function loadCore() {
  const raw = await fetchJSON('core.json');
  const out = { meta: raw.meta };
  for (const [k, v] of Object.entries(raw)) {
    if (k !== 'meta') out[k] = decodeTable(v);
  }
  return out;
}

/** Camada 2: geometria, sob demanda (so quando a camada espacial e ligada). */
export async function loadGeo(name) {
  return fetchJSON(`geo/${name}.geojson`);
}

/** Camada 3: tabelas brutas, sob demanda (explorador / download). */
let manifestPromise = null;
export function loadManifest() {
  if (!manifestPromise) manifestPromise = fetchJSON('tables/manifest.json');
  return manifestPromise;
}

export async function loadTable(name) {
  const man = await loadManifest();
  const entry = man[name];
  if (!entry) throw new Error(`tabela desconhecida: ${name}`);
  // `path` vem do manifesto e ja inclui tables/ ou tables/restricted/.
  const path = Array.isArray(entry.path) ? entry.path[0] : entry.path;
  return decodeTable(await fetchJSON(path));
}

// ---------------------------------------------------------------------------
// Utilitarios de agregacao
// ---------------------------------------------------------------------------

export const sum = (xs) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
export const mean = (xs) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? sum(v) / v.length : null;
};

/** Agrupa um array de objetos por uma chave (string ou funcao). */
export function groupBy(rows, key) {
  const fn = typeof key === 'function' ? key : (r) => r[key];
  const m = new Map();
  for (const r of rows) {
    const k = fn(r);
    let g = m.get(k);
    if (!g) m.set(k, (g = []));
    g.push(r);
  }
  return m;
}

export const uniq = (xs) => [...new Set(xs)].filter((x) => x !== null && x !== undefined);

/** Ordena decrescente por um campo numerico e devolve os n primeiros. */
export const topN = (rows, field, n) =>
  [...rows].sort((a, b) => (b[field] ?? -Infinity) - (a[field] ?? -Infinity)).slice(0, n);

// ---------------------------------------------------------------------------
// Formatacao
// ---------------------------------------------------------------------------

export function fmt(x, digits = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return x.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtInt(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  return Math.round(x).toLocaleString('pt-BR');
}
