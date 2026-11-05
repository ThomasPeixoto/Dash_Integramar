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
/** Mediana de uma lista ja filtrada de numeros finitos. */
function mediana(v) {
  if (!v.length) return null;
  const x = [...v].sort((a, b) => a - b);
  const i = Math.floor(x.length / 2);
  return x.length % 2 ? x[i] : (x[i - 1] + x[i]) / 2;
}

/**
 * `stat` escolhe o resumo entre sitios dentro de cada ano. A media e o padrao
 * historico; a mediana resiste a sitios atipicos, que num recife sao a regra e
 * nao a excecao -- um cardume num censo levanta a media do ano inteiro.
 */
function aggregate(rows, { stat = 'mean' } = {}) {
  const out = [];
  for (const [key, g] of groupBy(rows, (r) => `${r.Year}|${r.group}`)) {
    const [Year, group] = key.split('|');
    const v = g.map((r) => r.value).filter(Number.isFinite);
    const m = !v.length ? null
      : (stat === 'median' ? mediana(v) : sum(v) / v.length);
    // SE so faz sentido com mais de uma observacao; com n = 1 fica NA e a
    // faixa simplesmente nao e desenhada, em vez de virar zero. Com mediana
    // nao calculamos SE: o erro-padrao e definido em torno da MEDIA, e
    // desenhar uma faixa dessas ao redor da mediana seria uma faixa errada.
    const med = v.length ? sum(v) / v.length : null;
    const se = (stat === 'mean' && v.length > 1)
      ? Math.sqrt(v.reduce((a, x) => a + (x - med) ** 2, 0) / (v.length - 1)) / Math.sqrt(v.length)
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
export function trendOption(rows, { type = 'lines', unit = '', nameOf = (g) => g, escala = false } = {}) {
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
    // `escala` solta o zero do eixo (nivel trofico vive entre 2 e 4,5).
    yAxis: { ...BASE().yAxis, scale: escala,
      axisLabel: { ...BASE().yAxis.axisLabel, formatter: (v) => `${v}${unit}` } },
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

/**
 * Varios parametros no MESMO grafico, uma cor por linha, UM eixo so.
 *
 * O resumo entre sitios e a MEDIANA. Com media, um sitio atipico levantava o
 * ano inteiro e a abundancia chegava a 11x o numero de familias, o que obrigou
 * a um segundo eixo. A mediana derruba esse fator para ~4x no Brasil inteiro e
 * permite ler as quatro linhas na mesma regua -- que e o ponto de po-las no
 * mesmo grafico. Num recorte pequeno a razao ainda chega a ~10x e as linhas
 * de contagem ficam na parte de baixo; e o preco do eixo unico.
 *
 * Sem faixa de erro-padrao: o SE e definido em torno da media, e desenha-lo em
 * volta da mediana seria uma faixa que nao corresponde ao ponto.
 */
export function multiParamOption(rows, { ordem, rotulo, cores = null, unidade = '',
                                         casas = 1, escala = false } = {}) {
  const agg = aggregate(rows, { stat: 'median' });
  const years = uniq(agg.map((r) => r.Year)).sort((a, b) => a - b);
  const grupos = ordem.filter((g) => agg.some((r) => r.group === g));
  const at = (g, y) => agg.find((r) => r.group === g && r.Year === y);

  const base = BASE();

  return {
    ...base,
    xAxis: { ...base.xAxis, data: years },
    // `escala` solta o zero do eixo: o nivel trofico vive entre 2 e 4,5, e com o
    // zero forcado toda a variacao cabe em 15% da altura.
    yAxis: { ...base.yAxis, scale: escala,
      axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => `${fmt(v, casas)}${unidade}` } },
    tooltip: {
      ...base.tooltip,
      valueFormatter: (v) => (Number.isFinite(v) ? `${fmt(v, casas)}${unidade}` : '—'),
    },
    series: grupos.map((g, i) => ({
      name: rotulo.serie(g),
      type: 'line',
      smooth: 0.25,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 2.2, color: cores?.[i] ?? CAT[i % CAT.length] },
      itemStyle: { color: cores?.[i] ?? CAT[i % CAT.length] },
      emphasis: { focus: 'series' },
      connectNulls: false,
      data: years.map((y) => {
        const r = at(g, y);
        return Number.isFinite(r?.mean) ? r.mean : '-';
      }),
    })),
  };
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

/** Quartis por interpolacao linear (tipo 7, o padrao do R). */
function quartis(vals) {
  const x = [...vals].sort((a, b) => a - b);
  const q = (p) => {
    if (x.length === 1) return x[0];
    const h = (x.length - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return x[lo] + (x[hi] - x[lo]) * (h - lo);
  };
  return [x[0], q(0.25), q(0.5), q(0.75), x[x.length - 1]];
}

/**
 * Cinco numeros da caixa com as hastes de Tukey: a haste para na observacao
 * mais extrema DENTRO da cerca Q1 - 1,5*IQR .. Q3 + 1,5*IQR, como em
 * `boxplot()` do R. Devolve tambem quantas observacoes ficaram fora.
 */
function tukey(vals) {
  const [mi, q1, md, q3, ma] = quartis(vals);
  const iqr = q3 - q1;
  const baixo = q1 - 1.5 * iqr;
  const alto  = q3 + 1.5 * iqr;
  const dentro = vals.filter((v) => v >= baixo && v <= alto);
  const lo = dentro.length ? Math.min(...dentro) : mi;
  const hi = dentro.length ? Math.max(...dentro) : ma;
  const stats = [lo, q1, md, q3, hi];
  stats.fora = vals.length - dentro.length;
  // O maior valor que ficou ALEM DA CERCA pelo lado de cima -- nao o maximo
  // do grupo, que pode estar dentro dela. Null quando nenhum passou por cima.
  const altos = vals.filter((v) => v > alto);
  stats.extremo = altos.length ? Math.max(...altos) : null;
  return stats;
}

/** Quantas observacoes caem fora da cerca, e qual o maior valor. */
export function foraDaCerca(vals) {
  const s = tukey(vals);
  return { fora: s.fora, extremo: s.extremo, haste: s[4] };
}

/**
 * Boxplot de taxons: uma caixa por (taxon x grupo), cada OBSERVACAO e um
 * sitio. O valor do sitio e o resumo dele ao longo dos anos, feito antes de
 * chegar aqui -- a caixa descreve a variacao ENTRE sitios, nao entre anos, e
 * e por isso que ela responde "dentro contra fora da UC".
 *
 * As hastes seguem a regra de Tukey (1,5 x IQR), nao o minimo e o maximo.
 * Medido: com as quatro especies mais abundantes do pais a mediana ficava em
 * 0,65 ind./censo e o maximo em 885 -- um sitio so. Com hastes ate o extremo,
 * as caixas ocupavam os 4% de baixo do eixo e nao se liam. Os pontos fora da
 * cerca NAO sao desenhados, porque desenha-los devolve a mesma compressao;
 * eles sao contados e ditos em `fora`, para que nada fique escondido sem
 * aviso.
 */
export function boxTaxaOption({ categorias, grupos, valores, unidade = '',
                                cores = null, rotuloGrupo = (g) => g, italico = false,
                                casas = 1, escala = false,
                                rotuloN = (k) => `${k} sítios`,
                                rotuloEstat = {
                                  mediana: 'mediana', quartis: 'quartis',
                                  haste: 'hastes (1,5×IQR)',
                                  fora: (k, m) => `${k} fora da cerca, até ${m}`,
                                } } = {}) {
  const base = BASE();
  const chave = (c, g) => `${c}\u0000${g}`;
  const n = (c, g) => (valores.get(chave(c, g)) ?? []).length;

  const series = grupos.map((g, i) => ({
    name: rotuloGrupo(g),
    type: 'boxplot',
    boxWidth: [8, 34],
    itemStyle: {
      color: 'rgba(255,255,255,.88)',
      borderColor: cores?.[i] ?? CAT[i % CAT.length],
      borderWidth: 1.8,
    },
    emphasis: { focus: 'series', itemStyle: { borderWidth: 2.6 } },
    data: categorias.map((c) => {
      const v = valores.get(chave(c, g)) ?? [];
      // '-' e nao null: o boxplot do ECharts le `item.value` de cada celula
      // e estoura num null.
      return v.length ? tukey(v) : '-';
    }),
  }));

  return {
    ...base,
    grid: { ...base.grid, bottom: 92 },
    legend: { ...base.legend, data: grupos.map(rotuloGrupo) },
    xAxis: {
      ...base.xAxis,
      data: categorias,
      // Com poucas categorias o nome cientifico cabe inteiro se quebrar em
      // duas linhas; truncar "Thalassoma noro..." num eixo com espaco de
      // sobra escondia o epiteto, que e o que distingue as especies do
      // mesmo genero logo ao lado.
      axisLabel: {
        ...base.xAxis.axisLabel,
        // So genero e especie vao em italico; familia, nao.
        interval: 0, fontStyle: italico ? 'italic' : 'normal',
        rotate: categorias.length > 5 ? 30 : 0,
        width: categorias.length > 5 ? 120 : 150,
        overflow: categorias.length > 5 ? 'truncate' : 'break',
        lineHeight: 14,
      },
    },
    yAxis: { ...base.yAxis, scale: escala,
      axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => `${fmt(v, casas)}${unidade}` } },
    tooltip: {
      ...base.tooltip,
      trigger: 'item',
      formatter: (p) => {
        const cat = categorias[p.dataIndex];
        const g = grupos[p.seriesIndex];
        // O item de boxplot chega como [indice, min, Q1, mediana, Q3, max] em
        // `value`, mas `data` guarda o array original de cinco. Em vez de
        // apostar em qual dos dois, tiramos o indice quando ele esta la.
        const bruto = p.value ?? p.data;
        const [mi, q1, md, q3, ma] = bruto.length > 5 ? bruto.slice(1) : bruto;
        const u = (x) => `${fmt(x, casas)}${unidade}`;
        const vs = valores.get(chave(cat, g)) ?? [];
        const ext = vs.length ? tukey(vs) : null;
        return `<strong>${cat}</strong><br>${rotuloGrupo(g)}`
          + ` &middot; ${rotuloN(n(cat, g))}<br>`
          + `${rotuloEstat.mediana} <strong>${u(md)}</strong><br>`
          + `${rotuloEstat.quartis} ${u(q1)} – ${u(q3)}<br>`
          + `${rotuloEstat.haste} ${u(mi)} – ${u(ma)}`
          + (ext?.fora ? `<br>${rotuloEstat.fora(ext.fora, u(ext.extremo))}` : '');
      },
    },
    series,
  };
}

// ---------------------------------------------------------------------------
// 3. Mapa de calor ano x grupo
// ---------------------------------------------------------------------------

export function heatmapOption(rows, ramp, unit = '', nameOf = (g) => g, { escala = false } = {}) {
  const agg = aggregate(rows);
  const years = uniq(agg.map((r) => r.Year)).sort((a, b) => a - b);
  const groups = uniq(agg.map((r) => r.group)).sort().reverse();

  const data = [];
  let max = 0, min = Infinity;
  for (const r of agg) {
    if (!Number.isFinite(r.mean)) continue;
    data.push([years.indexOf(r.Year), groups.indexOf(r.group), r.mean]);
    if (r.mean > max) max = r.mean;
    if (r.mean < min) min = r.mean;
  }
  // Com `escala` a rampa comeca no MENOR valor: nivel trofico entre 2 e 4,5 numa
  // rampa de 0 a 4,5 gastaria metade das cores em valores que nao existem.
  const piso = escala && Number.isFinite(min) ? Math.floor(min * 10) / 10 : 0;

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
      min: piso, max: max || 1,
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

// ---------------------------------------------------------------------------
// Gráficos dos eixos 2, 3 e 4
// ---------------------------------------------------------------------------

/** Barras simples. `horizontal` quando os rótulos são nomes longos. */
/**
 * Rosca de composicao. O denominador e a soma das fatias recebidas -- quem
 * chama decide o que entra, e a rosca nunca "falta" pedaco para fechar 100%.
 */
export function donutOption(fatias, { unidade = '' } = {}) {
  const total = sum(fatias.map((f) => f.value));
  const ord = [...fatias].sort((a, b) => b.value - a.value);
  const base = BASE();
  return {
    ...base,
    legend: {
      ...base.legend,
      type: 'scroll', orient: 'vertical', right: 6, top: 'middle',
      itemGap: 9, textStyle: { color: '#5a6a8a', fontSize: 11 },
    },
    tooltip: {
      ...base.tooltip,
      trigger: 'item',
      formatter: (p) => `${p.name}<br><b>${fmt(p.value, 3)}${unidade}</b>`
        + `<br><span style="color:#5a6a8a">${fmt((100 * p.value) / total, 1)}%</span>`,
    },
    series: [{
      type: 'pie',
      radius: ['46%', '72%'],
      center: ['34%', '52%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      labelLine: { show: false },
      emphasis: { scaleSize: 6, itemStyle: { shadowBlur: 14, shadowColor: 'rgba(32,38,75,.22)' } },
      data: ord.map((f, i) => ({
        name: f.name, value: f.value,
        itemStyle: { color: CAT[i % CAT.length] },
      })),
    }],
  };
}

/**
 * Dia contra noite, com o saldo marcado.
 *
 * O numero que interessa -- o fluxo liquido em 24 h -- e a soma de dois
 * processos de sinais opostos. Mostrar so o liquido esconde o mecanismo;
 * mostrar as cinco camaras lado a lado (como antes) mostra a dispersao e
 * esconde o mecanismo tambem. Aqui a barra do dia sobe, a da noite desce, e
 * o losango marca onde o saldo cai.
 */
export function dayNightOption(linhas, { unidade = '' } = {}) {
  const base = BASE();
  const cats = linhas.map((l) => l.nome);
  return {
    ...base,
    grid: { ...base.grid, top: 54, bottom: 30 },
    legend: { ...base.legend, data: linhas[0] ? [linhas[0].rotuloDia, linhas[0].rotuloNoite, linhas[0].rotuloNet] : [] },
    tooltip: {
      ...base.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => (Number.isFinite(v) ? `${fmt(v, 1)}${unidade}` : '—'),
    },
    xAxis: { ...base.xAxis, data: cats },
    yAxis: {
      ...base.yAxis,
      axisLabel: { ...base.yAxis.axisLabel, formatter: (v) => `${v}${unidade}` },
    },
    series: [
      {
        name: linhas[0]?.rotuloDia, type: 'bar', stack: 'dn',
        itemStyle: { color: '#FDA749', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 54,
        data: linhas.map((l) => l.dia),
      },
      {
        name: linhas[0]?.rotuloNoite, type: 'bar', stack: 'dn',
        itemStyle: { color: '#353F7C', borderRadius: [0, 0, 4, 4] },
        barMaxWidth: 54,
        data: linhas.map((l) => l.noite),
      },
      {
        // O losango nao empilha: e o saldo medido, nao a soma das barras.
        // Os dois quase coincidem, e e exatamente isso que queremos mostrar.
        name: linhas[0]?.rotuloNet, type: 'scatter',
        symbol: 'diamond', symbolSize: 15,
        itemStyle: { color: '#F76043', borderColor: '#fff', borderWidth: 2 },
        z: 5,
        data: linhas.map((l) => l.net),
      },
    ],
  };
}

export function barOption({ categories, values, color = '#353F7C', colors = null,
                            unit = '', horizontal = false, decimals = 1 } = {}) {
  const cat = {
    type: 'category', data: categories,
    axisLine: { lineStyle: { color: 'rgba(53,63,124,.18)' } },
    axisTick: { show: false },
    axisLabel: { color: '#5a6a8a', fontSize: 11.5 },
  };
  const val = {
    type: 'value',
    axisLine: { show: false }, axisTick: { show: false },
    splitLine: { lineStyle: { color: 'rgba(53,63,124,.08)' } },
    axisLabel: { color: '#5a6a8a', fontSize: 11.5, formatter: (v) => `${v}${unit}` },
  };
  return {
    ...BASE(),
    legend: { show: false },
    grid: horizontal
      ? { left: 8, right: 34, top: 14, bottom: 14, containLabel: true }
      : { left: 8, right: 14, top: 18, bottom: 14, containLabel: true },
    tooltip: {
      ...BASE().tooltip,
      trigger: 'item',
      formatter: (p) => `${p.name}<br><b>${fmt(p.value, decimals)}${unit}</b>`,
    },
    xAxis: horizontal ? val : cat,
    yAxis: horizontal ? { ...cat, data: categories } : val,
    series: [{
      type: 'bar',
      // `colors` pinta barra a barra -- usado para acender o sitio que esta
      // selecionado no mapa, em vez de obrigar a procurar o nome na lista.
      data: colors
        ? values.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } }))
        : values,
      itemStyle: { color, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
      barMaxWidth: 26,
      emphasis: { itemStyle: { opacity: 0.82 } },
    }],
  };
}

/** Barras agrupadas: uma série por grupo comparado. */
export function groupedBarOption({ categories, series, unit = '', decimals = 1 } = {}) {
  return {
    ...BASE(),
    grid: { left: 8, right: 14, top: 44, bottom: 14, containLabel: true },
    tooltip: {
      ...BASE().tooltip,
      formatter: (ps) => `<div style="font-weight:700;margin-bottom:5px">${ps[0].axisValue}</div>` +
        ps.map((p) => `<div style="display:flex;gap:14px;justify-content:space-between">
            <span>${p.marker} ${p.seriesName}</span>
            <b style="font-variant-numeric:tabular-nums">${fmt(p.value, decimals)}${unit}</b></div>`).join(''),
    },
    xAxis: {
      type: 'category', data: categories,
      axisLine: { lineStyle: { color: 'rgba(53,63,124,.18)' } },
      axisTick: { show: false },
      axisLabel: { color: '#5a6a8a', fontSize: 11.5 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(53,63,124,.08)' } },
      axisLabel: { color: '#5a6a8a', fontSize: 11.5, formatter: (v) => `${v}${unit}` },
    },
    series: series.map((sr) => ({
      name: sr.name, type: 'bar', data: sr.data,
      itemStyle: { color: sr.color, borderRadius: [4, 4, 0, 0] },
      barMaxWidth: 30,
    })),
  };
}

/** Linhas por zona de proteção, ao longo dos anos. */
export function zoneLineOption({ years, series, unit = '' } = {}) {
  return {
    ...BASE(),
    grid: { left: 8, right: 16, top: 44, bottom: 14, containLabel: true },
    xAxis: { ...BASE().xAxis, data: years },
    yAxis: {
      ...BASE().yAxis,
      axisLabel: { ...BASE().yAxis.axisLabel, formatter: (v) => `${v}${unit}` },
    },
    tooltip: {
      ...BASE().tooltip,
      formatter: (ps) => `<div style="font-weight:700;margin-bottom:5px">${ps[0].axisValue}</div>` +
        ps.filter((p) => p.data !== '-')
          .map((p) => `<div style="display:flex;gap:14px;justify-content:space-between">
              <span>${p.marker} ${p.seriesName}</span>
              <b style="font-variant-numeric:tabular-nums">${fmt(p.data, 0)}${unit}</b></div>`).join(''),
    },
    series: series.map((sr) => ({
      name: sr.name, type: 'line', smooth: 0.25,
      symbol: 'circle', symbolSize: 7,
      itemStyle: { color: sr.color, borderColor: '#fff', borderWidth: 1.5 },
      lineStyle: { color: sr.color, width: 2.5 },
      connectNulls: false,
      data: sr.data,
    })),
  };
}

export { colorFor, CAT };
