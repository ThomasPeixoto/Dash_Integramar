// ===========================================================================
// Dinamicas temporais (ECharts)
//
// Porta de R/mod_temporal.R. Tres paineis:
//   1. tendencia por grupo  -- linhas com faixa de erro padrao, ou area 100%
//   2. tendencia por taxon  -- ate 6 taxons escolhidos
//   3. mapa de calor        -- ano x grupo
// ===========================================================================

import { loadTable, groupBy, sum, mean, uniq, fmt } from './data.js';
import { t, getLang } from './config.js';

const TOP_FISH_FAMILIES = 8;

// Paleta categorica derivada da marca: as cinco cores institucionais
// primeiro, depois variacoes, para que as series mais importantes (as
// primeiras) recebam as cores mais fortes.
const CAT = [
  '#353F7C', '#3C9BA5', '#F76043', '#FDA749', '#982263',
  '#6B7FC7', '#7FC4CB', '#C94F2E', '#D9A066', '#C86FA0',
  '#2B3466', '#1E5A61',
];

// Cores fixas para os grupos do bentos, para que a leitura não mude conforme
// o recorte: turf nos verdes, coral no coral, substrato e não-classificado
// em cinza. Os demais grupos (famílias de peixe, por exemplo) seguem pegando
// a próxima cor livre da paleta.
const FIXED = {
  'Algae':               '#3C9BA5',
  'Turf filamentous':    '#7FC4CB',
  'Turf calcareous':     '#A9D8CF',
  'Hard coral':          '#F76043',
  'Other Invertebrates': '#982263',
  'Soft Substrate':      '#C9B79C',
  'Cyanobacteria':       '#6B7FC7',
  'Unclassified':        '#A8B2C8',
};

const colorFor = (() => {
  const m = new Map();
  return (key) => {
    if (FIXED[key]) return FIXED[key];
    if (key === 'Other' || key === 'Outro') return '#A8B2C8';
    if (!m.has(key)) m.set(key, CAT[m.size % CAT.length]);
    return m.get(key);
  };
})();

/** Base comum a todos os graficos: sem grade pesada, fonte da marca. */
const BASE = () => ({
  textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: '#1a1a2e' },
  grid: { left: 54, right: 20, top: 62, bottom: 44, containLabel: true },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,.97)',
    borderColor: 'rgba(53,63,124,.14)',
    borderWidth: 1,
    padding: [10, 13],
    textStyle: { color: '#1a1a2e', fontSize: 12.5 },
    extraCssText: 'box-shadow:0 12px 40px rgba(32,38,75,.16);border-radius:10px;',
  },
  // 'plain' em vez de 'scroll': com 8 grupos funcionais a legenda rolante
  // paginava e cortava os nomes ("Turf c..."). Assim ela quebra em linhas e
  // mostra tudo de uma vez; o grid se afasta do topo para dar lugar.
  legend: {
    type: 'plain', top: 4, icon: 'roundRect',
    itemWidth: 11, itemHeight: 11, itemGap: 14,
    textStyle: { color: '#5a6a8a', fontSize: 11.5 },
  },
  xAxis: {
    type: 'category',
    axisLine: { lineStyle: { color: 'rgba(53,63,124,.18)' } },
    axisTick: { show: false },
    axisLabel: { color: '#5a6a8a', fontSize: 11.5 },
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: 'rgba(53,63,124,.08)' } },
    axisLabel: { color: '#5a6a8a', fontSize: 11.5 },
  },
  animationDuration: 520,
  animationEasing: 'cubicOut',
});

// ---------------------------------------------------------------------------
// Preparo das series
// ---------------------------------------------------------------------------

/**
 * Serie por grupo: grupo funcional no bentos, familia nos peixes.
 * No bentos o valor e cobertura media (%); nos peixes e abundancia por censo
 * -- dividir pelo esforco e obrigatorio, somar abundancia bruta entre sitios
 * com numero diferente de censos compararia coisas distintas.
 */
export function groupSeries(core, dataset, sitesFilter) {
  const inSites = (r) => !sitesFilter?.length || sitesFilter.includes(r.Site);

  if (dataset === 'benthos') {
    return core.benthos_year_fg
      .filter(inSites)
      .map((r) => ({ Site: r.Site, Year: r.Year, group: r.functional_group, value: r.mean_cover }));
  }

  const effort = new Map(core.fish_year.map((r) => [`${r.Site}|${r.Year}`, r.n_events]));
  const rows = core.fish_comp.filter(inSites);

  const tot = [...groupBy(rows, 'family_label')]
    .map(([fam, g]) => [fam, sum(g.map((r) => r.total_abundance))])
    .sort((a, b) => b[1] - a[1]);
  const top = new Set(tot.slice(0, TOP_FISH_FAMILIES).map((x) => x[0]));

  const out = new Map();
  for (const r of rows) {
    const g = top.has(r.family_label) ? r.family_label : 'Other';
    const k = `${r.Site}|${r.Year}|${g}`;
    const prev = out.get(k) ?? { Site: r.Site, Year: r.Year, group: g, abund: 0 };
    prev.abund += r.total_abundance ?? 0;
    out.set(k, prev);
  }
  return [...out.values()].map((r) => {
    const e = effort.get(`${r.Site}|${r.Year}`);
    return { ...r, value: e ? r.abund / e : null };
  });
}

/** Media e erro padrao por (ano, grupo), entre sitios. */
function aggregate(rows) {
  const out = [];
  for (const [key, g] of groupBy(rows, (r) => `${r.Year}|${r.group}`)) {
    const [Year, group] = key.split('|');
    const v = g.map((r) => r.value).filter(Number.isFinite);
    const m = v.length ? sum(v) / v.length : null;
    // SE so faz sentido com mais de uma observacao; com n = 1 fica NA e a
    // faixa simplesmente nao e desenhada, em vez de virar zero.
    const se = v.length > 1
      ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)) / Math.sqrt(v.length)
      : null;
    out.push({ Year: +Year, group, mean: m, se });
  }
  return out.sort((a, b) => a.Year - b.Year);
}

// ---------------------------------------------------------------------------
// 1. Tendencia por grupo
// ---------------------------------------------------------------------------

/**
 * `nameOf` traduz a chave do grupo para exibicao. A chave crua continua sendo
 * o que define a cor (colorFor) e o que identifica a serie internamente, para
 * que trocar de idioma nao troque as cores do grafico.
 */
export function trendOption(rows, { type = 'lines', unit = '', nameOf = (g) => g } = {}) {
  const agg = aggregate(rows);
  const years = uniq(agg.map((r) => r.Year)).sort((a, b) => a - b);
  const groups = uniq(agg.map((r) => r.group)).sort();
  const at = (g, y) => agg.find((r) => r.group === g && r.Year === y);

  if (type === 'area') {
    // Area empilhada normalizada a 100%: a leitura e de COMPOSICAO, nao de
    // valor absoluto. Anos sem registro entram como 0 para nao abrir buraco
    // na pilha.
    const totals = years.map((y) => sum(groups.map((g) => at(g, y)?.mean ?? 0)));
    return {
      ...BASE(),
      xAxis: { ...BASE().xAxis, data: years },
      yAxis: { ...BASE().yAxis, max: 100, axisLabel: { ...BASE().yAxis.axisLabel, formatter: '{value}%' } },
      series: groups.map((g) => ({
        name: nameOf(g), type: 'line', stack: 'one', smooth: 0.25,
        showSymbol: false,
        lineStyle: { width: 0.5, color: colorFor(g) },
        areaStyle: { color: colorFor(g), opacity: 0.78 },
        emphasis: { focus: 'series' },
        data: years.map((y, i) =>
          totals[i] > 0 ? (100 * (at(g, y)?.mean ?? 0)) / totals[i] : 0),
      })),
    };
  }

  const series = [];
  for (const g of groups) {
    const col = colorFor(g);
    const hasSE = years.some((y) => Number.isFinite(at(g, y)?.se));
    if (hasSE) {
      // A faixa e desenhada como duas series empilhadas invisiveis: a de
      // baixo e transparente, a de cima pinta a espessura 2*SE. E como o
      // ECharts faz banda de confianca.
      series.push({
        name: `__band_lo_${g}`, type: 'line', stack: `band-${g}`, symbol: 'none',
        lineStyle: { opacity: 0 }, silent: true, legendHoverLink: false,
        tooltip: { show: false },
        data: years.map((y) => {
          const r = at(g, y);
          return Number.isFinite(r?.se) ? Math.max(0, r.mean - r.se) : '-';
        }),
      });
      series.push({
        name: `__band_hi_${g}`, type: 'line', stack: `band-${g}`, symbol: 'none',
        lineStyle: { opacity: 0 }, silent: true, legendHoverLink: false,
        areaStyle: { color: col, opacity: 0.14 }, tooltip: { show: false },
        data: years.map((y) => {
          const r = at(g, y);
          return Number.isFinite(r?.se) ? 2 * r.se : '-';
        }),
      });
    }
    series.push({
      name: nameOf(g), type: 'line', smooth: 0.25,
      symbol: 'circle', symbolSize: 7,
      itemStyle: { color: col, borderColor: '#fff', borderWidth: 1.5 },
      lineStyle: { color: col, width: 2.5 },
      emphasis: { focus: 'series', scale: 1.3 },
      connectNulls: false,
      data: years.map((y) => at(g, y)?.mean ?? '-'),
    });
  }

  return {
    ...BASE(),
    legend: { ...BASE().legend, data: groups.map(nameOf) },
    xAxis: { ...BASE().xAxis, data: years },
    yAxis: { ...BASE().yAxis, axisLabel: { ...BASE().yAxis.axisLabel, formatter: (v) => `${v}${unit}` } },
    tooltip: {
      ...BASE().tooltip,
      // As duas series auxiliares de cada faixa de erro sao empilhadas e seus
      // valores (limite inferior e espessura) nao significam nada sozinhos --
      // o prefixo __band_ existe so para exclui-las daqui e da legenda.
      formatter: (ps) => {
        const real = ps.filter((p) => p.data !== '-' && !p.seriesName.startsWith('__band_'));
        if (!real.length) return '';
        const body = real
          .map((p) => `<div style="display:flex;gap:14px;justify-content:space-between">
              <span>${p.marker} ${p.seriesName}</span>
              <b style="font-variant-numeric:tabular-nums">${fmt(p.data, 2)}${unit}</b></div>`)
          .join('');
        return `<div style="font-weight:700;margin-bottom:5px">${ps[0].axisValue}</div>${body}`;
      },
    },
    series,
  };
}

// ---------------------------------------------------------------------------
// 2. Tendencia por taxon
// ---------------------------------------------------------------------------

/** Carrega e normaliza a tabela de taxon por sitio/ano (camada sob demanda). */
export async function taxonSeries(core, dataset, sitesFilter) {
  const inSites = (r) => !sitesFilter?.length || sitesFilter.includes(r.Site);

  if (dataset === 'benthos') {
    const rows = await loadTable('benthos_year_sp');
    return rows.filter(inSites)
      .map((r) => ({ Site: r.Site, Year: r.Year, name: r.name, value: r.mean_cover }));
  }
  const rows = await loadTable('fish_year_sp');
  const effort = new Map(core.fish_year.map((r) => [`${r.Site}|${r.Year}`, r.n_events]));
  return rows.filter(inSites).map((r) => {
    const e = effort.get(`${r.Site}|${r.Year}`);
    return { Site: r.Site, Year: r.Year, name: r.taxon_label, value: e ? r.total_abundance / e : null };
  });
}

export function taxonOption(rows, selected, unit = '') {
  const sel = rows.filter((r) => selected.includes(r.name));
  const years = uniq(sel.map((r) => r.Year)).sort((a, b) => a - b);
  const byName = groupBy(sel, 'name');

  return {
    ...BASE(),
    grid: { ...BASE().grid, top: 40 },
    xAxis: { ...BASE().xAxis, data: years },
    yAxis: { ...BASE().yAxis, axisLabel: { ...BASE().yAxis.axisLabel, formatter: (v) => `${v}${unit}` } },
    series: selected.map((nm, i) => {
      const g = byName.get(nm) ?? [];
      const col = CAT[i % CAT.length];
      return {
        name: nm, type: 'line', smooth: 0.25,
        symbol: 'circle', symbolSize: 6,
        itemStyle: { color: col, borderColor: '#fff', borderWidth: 1.4 },
        lineStyle: { color: col, width: 2.2 },
        emphasis: { focus: 'series' },
        data: years.map((y) => {
          const v = g.filter((r) => r.Year === y).map((r) => r.value);
          return v.length ? mean(v) : '-';
        }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// 3. Mapa de calor ano x grupo
// ---------------------------------------------------------------------------

export function heatmapOption(rows, ramp, unit = '', nameOf = (g) => g) {
  const agg = aggregate(rows);
  const years = uniq(agg.map((r) => r.Year)).sort((a, b) => a - b);
  const groups = uniq(agg.map((r) => r.group)).sort().reverse();

  const data = [];
  let max = 0;
  for (const r of agg) {
    if (!Number.isFinite(r.mean)) continue;
    data.push([years.indexOf(r.Year), groups.indexOf(r.group), r.mean]);
    if (r.mean > max) max = r.mean;
  }

  return {
    ...BASE(),
    grid: { left: 10, right: 16, top: 16, bottom: 56, containLabel: true },
    legend: { show: false },
    tooltip: {
      ...BASE().tooltip,
      trigger: 'item',
      formatter: (p) =>
        `<div style="font-weight:700;margin-bottom:4px">${nameOf(groups[p.data[1]])}</div>
         ${years[p.data[0]]} · <b>${fmt(p.data[2], 2)}${unit}</b>`,
    },
    xAxis: { ...BASE().xAxis, data: years, splitArea: { show: false } },
    yAxis: {
      type: 'category', data: groups.map(nameOf),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#5a6a8a', fontSize: 11 },
    },
    visualMap: {
      min: 0, max: max || 1,
      calculable: true, orient: 'horizontal',
      left: 'center', bottom: 2, itemHeight: 90, itemWidth: 11,
      textStyle: { color: '#5a6a8a', fontSize: 10.5 },
      inRange: { color: ramp },
    },
    series: [{
      type: 'heatmap', data,
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(32,38,75,.3)' } },
      progressive: 0,
    }],
  };
}

export { colorFor, CAT };
