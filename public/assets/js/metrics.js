// ===========================================================================
// Valor por sitio em cada modo do mapa
//
// Porta fiel do bloco `map_markers` de R/mod_mapa.R. As regras de agregacao
// nao sao intercambiaveis e estao comentadas uma a uma -- somar riqueza entre
// anos, por exemplo, enviesaria pelo esforco amostral.
// ===========================================================================

import { groupBy, sum, mean } from './data.js';

const UNITS = {
  benthos: () => '%',
  fish: (v) => ({
    richness: ' spp.', n_families: ' fam.', n_events: ' censos',
    mean_abundance: ' ind./censo', total_abundance: ' ind.',
  }[v] ?? ''),
  pollution: (v) => ({
    Salinity: ' g/kg', Temperature: ' °C', DIN: ' µM',
    Ortophosphate: ' µM', 'Total PAHs': ' ng/g', 'Total Sterols': ' µg/g',
  }[v] ?? ' µM'),
  productivity: (v) => ({
    'Live rhodoliths': ' g DW/m²', 'Dead rhodoliths': ' g DW/m²',
    'NCC netflux': ' mmol/m²/d', 'NCP netflux': ' mmol/m²/d',
  }[v] ?? ''),
};

/**
 * @returns {{ values: Map<string, number>, unit: string }}
 */
export function siteValues(core, mode, varName, scope = 'noronha') {
  const values = new Map();
  const unit = (UNITS[mode] ?? (() => ''))(varName);

  // Escala nacional: as mesmas métricas, lidas das tabelas do ReefSYN. As
  // regras de agregação são as mesmas — riqueza nunca somada entre anos,
  // abundância média ponderada pelo esforço.
  if (scope === 'national' && mode === 'fish' && core.reef_fish_year) {
    const porSitio = groupBy(core.reef_fish_year, 'site_id');
    if (varName === 'richness' || varName === 'n_families') {
      const col = varName === 'richness' ? 'n_species' : 'n_families';
      for (const r of core.reef_fish_summary ?? []) values.set(r.site_id, r[col]);
    } else if (varName === 'n_events' || varName === 'total_abundance') {
      for (const [site, g] of porSitio) values.set(site, sum(g.map((r) => r[varName])));
    } else {
      for (const [site, g] of porSitio) {
        const ev = sum(g.map((r) => r.n_events));
        values.set(site, ev > 0 ? sum(g.map((r) => r.total_abundance)) / ev : null);
      }
    }
    for (const [k, v] of values) if (!Number.isFinite(v)) values.set(k, null);
    return { values, unit };
  }

  if (mode === 'benthos') {
    // `proportion` ja vem em escala percentual (0-100) do ETL em R.
    // Multiplicar por 100 aqui era o bug que mostrava 2104% na legenda.
    const rows = core.benthos_comp.filter((r) => r.functional_group === varName);
    for (const [site, g] of groupBy(rows, 'Site')) {
      values.set(site, mean(g.map((r) => r.proportion)));
    }

  } else if (mode === 'fish') {
    if (varName === 'richness' || varName === 'n_families') {
      // Riqueza e numero de familias NAO podem ser somados nem promediados
      // entre anos: o total acumulado de taxons distintos vem do summary.
      const col = varName === 'richness' ? 'n_species' : 'n_families';
      for (const r of core.fish_summary) values.set(r.Site, r[col]);
    } else if (varName === 'n_events' || varName === 'total_abundance') {
      for (const [site, g] of groupBy(core.fish_year, 'Site')) {
        values.set(site, sum(g.map((r) => r[varName])));
      }
    } else {
      // mean_abundance: media ponderada pelo esforco (individuos / censo),
      // nao a media das medias anuais.
      for (const [site, g] of groupBy(core.fish_year, 'Site')) {
        const ev = sum(g.map((r) => r.n_events));
        values.set(site, ev > 0 ? sum(g.map((r) => r.total_abundance)) / ev : null);
      }
    }

  } else if (mode === 'pollution' || mode === 'productivity') {
    // Conjunto ainda bloqueado: a tabela nem foi carregada. Devolver o mapa
    // vazio faz os marcadores saírem cinza com "—", que e a leitura correta
    // (ha amostragem aqui, o valor e que nao esta disponivel).
    const src = mode === 'pollution' ? core.pollution : core.productivity;
    if (!src) return { values, unit };
    for (const [site, g] of groupBy(src, 'Site')) {
      values.set(site, mean(g.map((r) => r[varName])));
    }
  }

  // mean() devolve null quando tudo e NA; normalizamos para manter o
  // contrato "ausente = null" em vez de NaN.
  for (const [k, v] of values) if (!Number.isFinite(v)) values.set(k, null);
  return { values, unit };
}

// ---------------------------------------------------------------------------
// Escala de cor
// ---------------------------------------------------------------------------

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');

/** Interpolador linear sobre uma rampa de N paradas igualmente espacadas. */
export function colorScale(ramp, [lo, hi]) {
  const stops = ramp.map(hex2rgb);
  const span = hi - lo || 1;
  return (v) => {
    if (!Number.isFinite(v)) return '#C9CED6';
    const p = Math.min(1, Math.max(0, (v - lo) / span)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(p));
    const f = p - i;
    return rgb2hex(stops[i].map((c, j) => c + (stops[i + 1][j] - c) * f));
  };
}

/** Dominio dos valores presentes; degenera para [v, v+1] quando ha um so. */
export function domainOf(values) {
  const v = [...values.values()].filter(Number.isFinite);
  if (!v.length) return [0, 100];
  const lo = Math.min(...v), hi = Math.max(...v);
  return lo === hi ? [lo, lo + 1] : [lo, hi];
}

/** Raio do marcador entre 6 e 22 px, proporcional ao valor. */
export function radiusOf(v, [lo, hi]) {
  if (!Number.isFinite(v)) return 5;
  return 6 + 16 * (v - lo) / Math.max(1, hi - lo);
}


// ---------------------------------------------------------------------------
// Valores por ÁREA (estado, unidade de conservação)
// ---------------------------------------------------------------------------

/**
 * No modo de generalização o valor não vive mais no ponto, e sim no polígono
 * que o contém. Estes agregados vêm prontos do R porque **riqueza não é
 * somável**: a riqueza de um estado é o número de espécies distintas entre os
 * sítios dele, não a soma das riquezas de cada um.
 *
 * @param layer 'estados' | 'ucs'
 * @returns {{ values: Map<chave, number>, unit: string, label: string }}
 */
export function areaValues(core, layer, mode, varName) {
  const tabela = layer === 'estados' ? core.fish_by_uf : core.fish_by_uc;
  const chave  = layer === 'estados' ? 'uf' : 'cd_cnuc';
  const values = new Map();
  if (!tabela?.length) return { values, unit: '', label: '' };

  // Fora de um modo de variável não há métrica escolhida; o número de sítios
  // é o que a área tem a dizer sobre si mesma.
  const campo = mode === 'fish' ? varName : 'n_sites';
  const unit = mode === 'fish' ? (UNITS.fish(varName) ?? '') : '';

  for (const r of tabela) {
    const v = r[campo];
    values.set(r[chave], Number.isFinite(v) ? v : null);
  }
  return { values, unit, campo };
}
