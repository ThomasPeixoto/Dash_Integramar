// ===========================================================================
// Montagem da aplicação
//
// A navegação é pelos quatro eixos temáticos da Rede IntegraMAR, não pelas
// ferramentas: cada eixo é uma página de leitura em que as perguntas da
// linha de pesquisa vêm primeiro e a figura responde. Mapa e séries são
// componentes dentro dos eixos.
// ===========================================================================

import { loadCore, fmtInt, fmt, uniq, sum, mean, groupBy, topN } from './data.js';
import { createStore } from './store.js';
import { initMap, resizeMap, redrawMap, fitToData, setLegendSlot } from './map.js';
import {
  groupSeries, taxonSeries, trendOption, taxonOption, heatmapOption,
  barOption, groupedBarOption, zoneLineOption, CAT,
} from './charts.js';
import {
  readE1Map, readE1Time, readE2, readE3Rodolitos, readE3Pesca,
  readE4Fish, readE4Pollution, readE4Absent, zoneFish, zonePollution,
} from './narrative.js';
import {
  DATASETS, DS_COLOR, RAMP, MODE_VARS, SPATIAL_LAYERS, EIXOS, eixoById,
  t, setLang, getLang, optLabel, varLabel, CREDITS,
} from './config.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let core, store;
const charts = {};

// Mapa e séries só existem em alguns eixos; esta tabela diz o que cada um
// reivindica, e é o que o roteador consulta ao trocar de página.
const EIXO_MAP = {
  eixo1: { slot: 'slot-eixo1', modes: ['datasets', 'benthos', 'fish'], datasets: ['benthos', 'fish'] },
  eixo2: { slot: 'slot-eixo2', modes: ['pollution'], datasets: ['pollution'] },
};

// Estado de mapa lembrado por eixo, para que voltar a um eixo não perca o
// modo e a variável que estavam escolhidos lá.
const eixoState = {
  eixo1: { mode: 'datasets', variable: null, layer: 'none' },
  eixo2: { mode: 'pollution', variable: 'Salinity', layer: 'none' },
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

(async function boot() {
  try {
    core = await loadCore();
  } catch (err) {
    $('#boot-msg').textContent = 'Falha ao carregar os dados: ' + err.message;
    return;
  }

  store = createStore({
    eixo: 'eixo1',
    lang: 'pt',
    level: 'archipelago', zone: null, site: null,
    mode: 'datasets', variable: null, layer: 'none',
    activeDatasets: ['benthos', 'fish'],
    selectedSite: null,
    tDataset: 'benthos', tType: 'lines', tTaxa: [],
    e2Param: 'Salinity', e4Param: 'DIN',
  });

  buildNav();
  applyLabels();
  renderEixoHeads();
  buildTemporalControls();
  wireProfile();
  wireLang();

  initMap($('#map'), store, core);

  store.on(['mode', 'variable', 'level', 'zone', 'site', 'activeDatasets', 'layer'], () => {
    renderReadings();
  });
  store.on('selectedSite', renderProfile);
  store.on(['tDataset', 'tType'], renderTemporal);

  showEixo('eixo1');
  $('#boot').setAttribute('data-done', '');
})();

// ---------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------

function buildNav() {
  $('#nav').innerHTML = EIXOS.map((e, i) => `
    <button role="tab" data-eixo="${e.id}" aria-selected="${i === 0}">
      <span class="nav-n">${e.n}</span>${e.short[getLang()] ?? e.short.pt}
    </button>`).join('');
  $('#nav').onclick = (ev) => {
    const b = ev.target.closest('button[data-eixo]');
    if (b) showEixo(b.dataset.eixo);
  };
}

function showEixo(id) {
  const prev = store.get('eixo');
  if (EIXO_MAP[prev]) {
    eixoState[prev] = {
      mode: store.get('mode'), variable: store.get('variable'), layer: store.get('layer'),
    };
  }

  store.set('eixo', id);
  $$('#nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.eixo === id));
  $$('.view').forEach((v) => v.toggleAttribute('data-active', v.id === `view-${id}`));
  document.documentElement.style.setProperty('--eixo', eixoById(id).color);

  const cfg = EIXO_MAP[id];
  const kit = $('#mapkit');
  if (cfg) {
    const saved = eixoState[id];
    store.set({
      ...saved,
      activeDatasets: cfg.datasets,
      selectedSite: null,
    });
    buildMapBar(id, cfg);
    $(`#${cfg.slot}`).appendChild(kit);
    kit.hidden = false;
    // O Leaflet mede o container no momento em que desenha. Como o mapa nasce
    // dentro de um #mapkit escondido e depois migra de slot, essa medida sai
    // zerada e nenhum tile e pedido. Remedimos depois do reflow -- dois
    // quadros, porque o primeiro ainda nao aplicou o novo layout -- e so
    // entao reenquadramos.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resizeMap();
      redrawMap();
      fitToData();
    }));
  } else {
    kit.hidden = true;
  }

  renderEixo(id);
  window.scrollTo?.({ top: 0 });
  $(`#view-${id}`)?.scrollTo?.({ top: 0 });
}

function renderEixo(id) {
  renderReadings();
  if (id === 'eixo1') renderTemporal();
  if (id === 'eixo2') renderEixo2();
  if (id === 'eixo3') renderEixo3();
  if (id === 'eixo4') renderEixo4();
}

// ---------------------------------------------------------------------------
// Cabeçalho de cada eixo
// ---------------------------------------------------------------------------

function renderEixoHeads() {
  for (const e of EIXOS) {
    const el = $(`[data-eixo-head="${e.id}"]`);
    if (!el) continue;
    const lg = getLang();
    const title = e.title[lg] ?? e.title.pt;
    const accent = e.accent[lg] ?? e.accent.pt;
    // Destaca uma palavra do título em itálico dourado, como no site.
    const html = accent && title.includes(accent)
      ? title.replace(accent, `<span class="display-accent">${accent}</span>`)
      : title;
    el.style.setProperty('--eixo', e.color);
    el.innerHTML = `
      <p class="eyebrow">${lg === 'pt' ? 'EIXO' : 'AXIS'} ${e.n}</p>
      <h2>${html}</h2>
      <p class="lede">${e.lede[lg] ?? e.lede.pt}</p>
      <div class="counters">${counters(e.id).map((c) =>
        `<div class="counter"><div class="v">${c[0]}</div><div class="k">${c[1]}</div></div>`).join('')}</div>
      ${creditsHTML(e)}`;
  }
}

/**
 * Ficha de quem responde por cada conjunto do eixo. O anel colorido em volta
 * da foto repete o tratamento que o site institucional dá aos avatares da
 * equipe, e carrega a cor do eixo.
 */
function creditsHTML(eixo) {
  const lg = getLang();
  const fichas = eixo.datasets
    .map((ds) => [ds, CREDITS[ds]])
    .filter(([, c]) => c)
    .map(([ds, c]) => {
      const foto = `<img src="assets/img/people/${c.photo}" alt="" loading="lazy" width="52" height="52">`;
      // A foto leva ao perfil quando existe um; senão ao e-mail; senão não
      // é link nenhum, para não haver alvo de clique que não faz nada.
      const destino = c.link ?? (c.email ? `mailto:${c.email}` : null);
      const avatar = destino
        ? `<a class="credit-avatar" href="${destino}"${c.link ? ' target="_blank" rel="noopener"' : ''}
             title="${c.link ? t('credit_profile') : c.email}">${foto}</a>`
        : `<span class="credit-avatar">${foto}</span>`;
      const contato = c.email
        ? `<a class="credit-mail" href="mailto:${c.email}">
             <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
               <path d="M1.5 3.5h13v9h-13z" fill="none" stroke="currentColor" stroke-width="1.3"/>
               <path d="M1.9 4 8 8.6 14.1 4" fill="none" stroke="currentColor" stroke-width="1.3"
                     stroke-linecap="round" stroke-linejoin="round"/>
             </svg>${c.email}</a>`
        : '';
      return `<div class="credit">
          ${avatar}
          <div class="credit-text">
            <span class="credit-ds">${t(`ds_${ds}`)}</span>
            <span class="credit-name">${c.name}</span>
            <span class="credit-inst">${c.inst[lg] ?? c.inst.pt}</span>
            ${contato}
          </div>
        </div>`;
    });
  if (!fichas.length) return '';
  return `<div class="credits">
      <p class="credits-label">${t('credits')}</p>
      <div class="credits-row">${fichas.join('')}</div>
    </div>`;
}

function counters(id) {
  const S = core.sites;
  if (id === 'eixo1') {
    const anos = uniq([...core.fish_year.map((r) => r.Year), ...core.benthos_year_fg.map((r) => r.Year)]);
    return [
      [fmtInt(S.filter((s) => s.has_benthos || s.has_fish).length), t('m_sites')],
      [fmtInt(sum(core.fish_summary.map((r) => r.n_events))), t('censuses')],
      [fmtInt(sum(core.benthos_summary.map((r) => r.n_quadrats))), t('quadrats')],
      [fmtInt(Math.max(...anos) - Math.min(...anos) + 1), t('m_years')],
    ];
  }
  if (id === 'eixo2') {
    const pol = core.pollution ?? [];
    return [
      [fmtInt(uniq(pol.map((r) => r.Site)).length), t('m_sites')],
      [fmtInt(pol.length), getLang() === 'pt' ? 'Amostras' : 'Samples'],
      [fmtInt(MODE_VARS.pollution.options.length), getLang() === 'pt' ? 'Parâmetros' : 'Parameters'],
      [fmtInt(uniq(pol.map((r) => r.event_date)).length), getLang() === 'pt' ? 'Campanhas' : 'Campaigns'],
    ];
  }
  if (id === 'eixo3') {
    const sum_ = (core.fishers_summary ?? [])[0] ?? {};
    return [
      [fmtInt((core.productivity ?? []).length), t('chambers')],
      [fmtInt(sum_.n_interviews), t('interviews')],
      [fmtInt((core.fishers_catch ?? []).length), t('m_species')],
    ];
  }
  const z = zoneFish(core);
  return [
    [fmtInt(z.PARNAMAR.sites), t('zone_parnamar')],
    [fmtInt(z.APA.sites), t('zone_apa')],
    [fmtInt(z.PARNAMAR.censos + z.APA.censos), t('censuses')],
  ];
}

// ---------------------------------------------------------------------------
// Faixa de controles do mapa
// ---------------------------------------------------------------------------

function buildMapBar(id, cfg) {
  const bar = $('#mapkit-bar');
  const mode = store.get('mode');
  const spec = MODE_VARS[mode];
  const multiMode = cfg.modes.length > 1;

  bar.innerHTML = `
    <div class="field">
      <label for="f-level">${t('f_level')}</label>
      <select class="input" id="f-level"></select>
    </div>
    <div class="field" id="f-zone-wrap" hidden>
      <label for="f-zone">${t('lvl_zone')}</label>
      <select class="input" id="f-zone"></select>
    </div>
    <div class="field field--wide" id="f-site-wrap" hidden>
      <label for="f-site">${t('lvl_site')}</label>
      <select class="input" id="f-site"></select>
    </div>
    ${multiMode ? `<div class="field field--wide">
      <label for="f-mode">${t('f_mode')}</label>
      <select class="input" id="f-mode"></select>
    </div>` : ''}
    <div class="field field--wide" id="f-var-wrap"${spec ? '' : ' hidden'}>
      <label for="f-var" id="f-var-label">${spec ? t(`f_var_${mode}`) : ''}</label>
      <select class="input" id="f-var"></select>
    </div>
    <div class="field field--wide">
      <label for="f-layer">${t('f_layer')}</label>
      <select class="input" id="f-layer"></select>
    </div>
    ${cfg.datasets.length > 1 ? `<div class="field field--chips">
      <label>${t('f_datasets')}</label>
      <div class="chips" id="f-datasets"></div>
    </div>` : ''}
    <div class="map-legend legend-inline" id="legend"></div>`;

  fillSelect($('#f-level'), [
    { v: 'archipelago', label: t('lvl_archipelago') },
    { v: 'zone',        label: t('lvl_zone') },
    { v: 'site',        label: t('lvl_site') },
  ], store.get('level'));
  $('#f-level').onchange = (e) => {
    store.set({ level: e.target.value, zone: null, site: null });
    syncHierarchy();
  };

  const zones = uniq(core.sites.map((s) => s.zone)).sort()
    .map((z) => ({ v: z, label: core.sites.find((s) => s.zone === z)?.zone_label ?? z }));
  fillSelect($('#f-zone'), [{ v: '', label: t('all_zones') }, ...zones], store.get('zone') ?? '');
  $('#f-zone').onchange = (e) => store.set('zone', e.target.value || null);

  // Só oferecemos sítios que têm algum dos conjuntos deste eixo; listar os 21
  // num eixo que cobre 4 produziria seleções vazias sem explicação.
  const sites = core.sites
    .filter((s) => cfg.datasets.some((ds) => s[`has_${ds}`]))
    .sort((a, b) => a.site_label.localeCompare(b.site_label))
    .map((s) => ({ v: s.Site, label: s.site_label }));
  fillSelect($('#f-site'), [{ v: '', label: t('all_sites') }, ...sites], store.get('site') ?? '');
  $('#f-site').onchange = (e) => store.set('site', e.target.value || null);

  if (multiMode) {
    fillSelect($('#f-mode'), cfg.modes.map((m) => ({ v: m, label: t(`mode_${m}`) })), mode);
    $('#f-mode').onchange = (e) => {
      const m = e.target.value;
      const sp = MODE_VARS[m];
      store.set({ mode: m, variable: sp ? sp.options[0].v : null });
      buildMapBar(id, cfg);
    };
  }

  syncVariable();

  fillSelect($('#f-layer'), SPATIAL_LAYERS.map((o) => ({ v: o.v, label: optLabel(o) })), store.get('layer'));
  $('#f-layer').onchange = (e) => store.set('layer', e.target.value);

  if (cfg.datasets.length > 1) {
    makeChips(
      $('#f-datasets'),
      cfg.datasets.map((ds) => ({ v: ds, label: t(`ds_${ds}`), color: DS_COLOR[ds] })),
      (v) => store.get('activeDatasets').includes(v),
      (v) => {
        const cur = store.get('activeDatasets');
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        if (!next.length) return;   // desligar o último deixaria o mapa vazio
        store.set('activeDatasets', next);
        $(`#f-datasets .chip[data-v="${v}"]`).setAttribute('aria-pressed', next.includes(v));
      }
    );
  }

  setLegendSlot('#legend');
  syncHierarchy();
}

function syncHierarchy() {
  const lvl = store.get('level');
  const z = $('#f-zone-wrap'), s = $('#f-site-wrap');
  if (z) z.hidden = lvl !== 'zone';
  if (s) s.hidden = lvl !== 'site';
}

function syncVariable() {
  const mode = store.get('mode');
  const spec = MODE_VARS[mode];
  const wrap = $('#f-var-wrap');
  if (!wrap) return;
  wrap.hidden = !spec;
  if (!spec) return;
  $('#f-var-label').textContent = t(`f_var_${mode}`);
  let v = store.get('variable');
  if (!spec.options.some((o) => o.v === v)) {
    v = spec.options[0].v;
    store.set('variable', v);
  }
  fillSelect($('#f-var'), spec.options.map((o) => ({ v: o.v, label: optLabel(o) })), v);
  $('#f-var').onchange = (e) => store.set('variable', e.target.value);
}

function fillSelect(el, options, selected) {
  if (!el) return;
  el.innerHTML = options
    .map((o) => `<option value="${o.v}"${o.v === selected ? ' selected' : ''}>${o.label}</option>`)
    .join('');
}

function makeChips(el, options, isOn, onToggle) {
  if (!el) return;
  el.innerHTML = options
    .map((o) => `<button class="chip" data-v="${o.v}" style="--c:${o.color ?? 'var(--navy)'}"
        aria-pressed="${isOn(o.v)}"><span class="dot"></span>${o.label}</button>`)
    .join('');
  el.onclick = (e) => {
    const b = e.target.closest('.chip');
    if (b) onToggle(b.dataset.v);
  };
}

// ---------------------------------------------------------------------------
// Leituras automáticas
// ---------------------------------------------------------------------------

function visibleSites() {
  const { level, zone, site, activeDatasets } = store.state;
  let rows = core.sites;
  if (level === 'zone' && zone) rows = rows.filter((r) => r.zone === zone);
  if (level === 'site' && site) rows = rows.filter((r) => r.Site === site);
  return rows.filter((r) => activeDatasets.some((ds) => r[`has_${ds}`]));
}

function renderReadings() {
  const id = store.get('eixo');
  if (id === 'eixo1') {
    setHTML('#read-e1-map', readE1Map(core, store.state, visibleSites()));
  } else if (id === 'eixo2') {
    setHTML('#read-e2-map', readE2(core, store.get('variable') ?? store.get('e2Param')));
  }
}

const setHTML = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };

// ---------------------------------------------------------------------------
// Eixo 1 — séries temporais
// ---------------------------------------------------------------------------

function buildTemporalControls() {
  makeChips($('#t-dataset'),
    [{ v: 'benthos', label: t('ds_benthos'), color: DS_COLOR.benthos },
     { v: 'fish',    label: t('ds_fish'),    color: DS_COLOR.fish }],
    (v) => store.get('tDataset') === v,
    (v) => {
      // Trocar de conjunto invalida os táxons escolhidos: os nomes não se
      // sobrepõem entre bentos e peixes.
      store.set({ tDataset: v, tTaxa: [] });
      $$('#t-dataset .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
    });

  makeChips($('#t-type'),
    [{ v: 'lines', label: getLang() === 'pt' ? 'Linhas' : 'Lines', color: '#5a6a8a' },
     { v: 'area',  label: getLang() === 'pt' ? 'Área 100%' : '100% area', color: '#5a6a8a' }],
    (v) => store.get('tType') === v,
    (v) => {
      store.set('tType', v);
      $$('#t-type .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
    });
}

function chart(id) {
  if (!charts[id]) {
    const el = document.getElementById(id);
    if (!el) return null;
    charts[id] = echarts.init(el, null, { renderer: 'canvas' });
  }
  return charts[id];
}

async function renderTemporal() {
  if (store.get('eixo') !== 'eixo1') return;
  const ds = store.get('tDataset');
  const unit = ds === 'benthos' ? '%' : '';
  const nameOf = ds === 'benthos' ? (g) => varLabel('benthos', g) : (g) => g;
  const rows = groupSeries(core, ds, []);

  setHTML('#read-e1-time', readE1Time(rows, ds, nameOf));

  const sub = ds === 'benthos'
    ? (getLang() === 'pt' ? 'Cobertura média por grupo funcional (%)' : 'Mean cover by functional group (%)')
    : (getLang() === 'pt' ? 'Abundância por censo, por família' : 'Abundance per census, by family');
  $('#trend-sub').textContent = sub;
  $('#heat-sub').textContent = sub;

  if (!rows.length) return;
  chart('chart-trend')?.setOption(trendOption(rows, { type: store.get('tType'), unit, nameOf }), true);
  chart('chart-heat')?.setOption(heatmapOption(rows, RAMP[ds] ?? RAMP.datasets, unit, nameOf), true);

  const taxa = await taxonSeries(core, ds, []);
  const totals = [...groupBy(taxa, 'name')]
    .map(([name, g]) => [name, sum(g.map((r) => r.value))])
    .sort((a, b) => b[1] - a[1]);

  const MAX = 6;
  const choices = totals.slice(0, 40).map(([n]) => n);
  let picked = store.get('tTaxa').filter((n) => choices.includes(n));
  if (!picked.length) picked = choices.slice(0, 4);

  const el = $('#t-taxon');
  const paint = () => {
    el.innerHTML = choices.map((name) => {
      const i = picked.indexOf(name);
      const on = i >= 0;
      const full = !on && picked.length >= MAX;
      return `<button class="chip" data-v="${name}" aria-pressed="${on}"
        ${full ? 'aria-disabled="true"' : ''}
        style="--c:${on ? CAT[i % CAT.length] : 'var(--muted)'}"><span class="dot"></span>${name}</button>`;
    }).join('');
  };
  el.onclick = (e) => {
    const b = e.target.closest('.chip');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    const name = b.dataset.v;
    picked = picked.includes(name) ? picked.filter((x) => x !== name) : [...picked, name];
    store.set('tTaxa', picked);
    paint();
    chart('chart-taxon')?.setOption(taxonOption(taxa, picked, unit), true);
  };
  paint();
  chart('chart-taxon')?.setOption(taxonOption(taxa, picked, unit), true);
}

// ---------------------------------------------------------------------------
// Eixo 2 — ranking de sítios
// ---------------------------------------------------------------------------

function renderEixo2() {
  const param = store.get('variable') ?? 'Salinity';
  const pol = (core.pollution ?? []).filter((r) => Number.isFinite(r[param]));
  const porSitio = [...groupBy(pol, 'Site')]
    .map(([site, g]) => ({
      label: core.sites.find((s) => s.Site === site)?.site_label ?? site,
      v: mean(g.map((r) => r[param])),
    }))
    .sort((a, b) => a.v - b.v);

  $('#e2-rank-sub').textContent = varLabel('pollution', param);
  if (!porSitio.length) return;

  chart('chart-e2-rank')?.setOption(barOption({
    categories: porSitio.map((r) => r.label),
    values: porSitio.map((r) => r.v),
    color: DS_COLOR.pollution,
    horizontal: true,
    decimals: 2,
  }), true);
}

// ---------------------------------------------------------------------------
// Eixo 3 — rodolitos e pesca
// ---------------------------------------------------------------------------

function renderEixo3() {
  setHTML('#read-e3-rod', readE3Rodolitos(core));
  setHTML('#read-e3-pesca', readE3Pesca(core));

  const prod = core.productivity ?? [];
  if (prod.length) {
    // Dia e noite separados: a calcificação inverte de sinal à noite, e é
    // justamente esse contraste que explica o saldo líquido.
    chart('chart-e3-rod')?.setOption(groupedBarOption({
      categories: prod.map((r) => `${getLang() === 'pt' ? 'Câmara' : 'Chamber'} ${r.Chamber}`),
      series: [
        { name: 'NCC ' + (getLang() === 'pt' ? 'dia' : 'day'),   data: prod.map((r) => r['NCC daytime']),   color: '#FDA749' },
        { name: 'NCC ' + (getLang() === 'pt' ? 'noite' : 'night'), data: prod.map((r) => r['NCC nighttime']), color: '#353F7C' },
        { name: 'NCC ' + (getLang() === 'pt' ? 'líquido' : 'net'), data: prod.map((r) => r['NCC netflux']),  color: '#F76043' },
      ],
      unit: '',
    }), true);
  }

  const cons = (core.fishers_consumption ?? []).filter((r) => Number.isFinite(r.kg_week));
  if (cons.length) {
    const ord = [...cons].sort((a, b) => a.kg_week - b.kg_week);
    chart('chart-e3-consumo')?.setOption(barOption({
      categories: ord.map((r) => t(`food_${r.food}`)),
      values: ord.map((r) => r.kg_week),
      color: DS_COLOR.fishers,
      horizontal: true,
      unit: ' kg',
      decimals: 2,
    }), true);
  }

  const cap = topN(core.fishers_catch ?? [], 'n_fishers', 12).reverse();
  if (cap.length) {
    chart('chart-e3-captura')?.setOption(barOption({
      categories: cap.map((r) => r.common_name.replace(/_/g, ' ')),
      values: cap.map((r) => r.n_fishers),
      color: DS_COLOR.productivity,
      horizontal: true,
      decimals: 0,
    }), true);
  }
}

// ---------------------------------------------------------------------------
// Eixo 4 — proteção
// ---------------------------------------------------------------------------

const ZC = { PARNAMAR: '#353F7C', APA: '#FDA749' };

function renderEixo4() {
  setHTML('#read-e4-fish', readE4Fish(core));
  setHTML('#read-e4-absent', readE4Absent(core));

  const z = zoneFish(core);
  $('#e4-fish-a').textContent = getLang() === 'pt' ? 'Abundância por censo' : 'Abundance per census';
  $('#e4-fish-b').textContent = getLang() === 'pt' ? 'Ao longo do tempo' : 'Over time';

  chart('chart-e4-fish')?.setOption(groupedBarOption({
    categories: [getLang() === 'pt' ? 'Indivíduos por censo' : 'Individuals per census'],
    series: [
      { name: t('zone_parnamar'), data: [z.PARNAMAR.porCenso], color: ZC.PARNAMAR },
      { name: t('zone_apa'),      data: [z.APA.porCenso],      color: ZC.APA },
    ],
    decimals: 0,
  }), true);

  // Série por zona: abundância total dividida pelo esforço daquele ano, para
  // que anos com mais censos não apareçam como anos com mais peixe.
  const zoneOf = new Map(core.sites.map((s) => [s.Site, s.zone]));
  const anos = uniq(core.fish_year.map((r) => r.Year)).sort((a, b) => a - b);
  const serieZona = (zn) => anos.map((y) => {
    const rs = core.fish_year.filter((r) => r.Year === y && zoneOf.get(r.Site) === zn);
    const ev = sum(rs.map((r) => r.n_events));
    return ev ? +(sum(rs.map((r) => r.total_abundance)) / ev).toFixed(1) : '-';
  });

  chart('chart-e4-fishyear')?.setOption(zoneLineOption({
    years: anos,
    series: [
      { name: t('zone_parnamar'), data: serieZona('PARNAMAR'), color: ZC.PARNAMAR },
      { name: t('zone_apa'),      data: serieZona('APA'),      color: ZC.APA },
    ],
  }), true);

  // Poluição: o seletor de parâmetro é próprio deste bloco.
  const sel = $('#e4-pol-param');
  if (sel && !sel.options.length) {
    fillSelect(sel, MODE_VARS.pollution.options.map((o) => ({ v: o.v, label: optLabel(o) })),
               store.get('e4Param'));
    sel.onchange = (e) => { store.set('e4Param', e.target.value); renderE4Pollution(); };
  }
  renderE4Pollution();
}

function renderE4Pollution() {
  const param = store.get('e4Param');
  setHTML('#read-e4-pol', readE4Pollution(core, param));
  $('#e4-pol-title').textContent = varLabel('pollution', param);

  const z = zonePollution(core, param);
  const mats = uniq((core.pollution ?? []).map((r) => r['Environmenal matrix']));
  const byMat = (cat) => mats.map((m) => {
    const rs = (core.pollution ?? []).filter(
      (r) => r['IUCN category'] === cat && r['Environmenal matrix'] === m && Number.isFinite(r[param]));
    return rs.length ? mean(rs.map((r) => r[param])) : '-';
  });

  chart('chart-e4-pol')?.setOption(groupedBarOption({
    categories: mats,
    series: [
      { name: t('zone_parnamar'), data: byMat('MNP'), color: ZC.PARNAMAR },
      { name: t('zone_apa'),      data: byMat('EPA'), color: ZC.APA },
    ],
    decimals: 2,
  }), true);
}

// ---------------------------------------------------------------------------
// Perfil do sítio
// ---------------------------------------------------------------------------

function wireProfile() {
  $('#profile-close').onclick = () => store.set('selectedSite', null);
}

function renderProfile(code) {
  const panel = $('#profile');
  if (!code) { panel.removeAttribute('data-open'); return; }
  const s = core.sites.find((x) => x.Site === code);
  if (!s) { panel.removeAttribute('data-open'); return; }

  $('#profile-title').textContent = s.site_label;
  const present = DATASETS.filter((ds) => s[`has_${ds}`]);
  let html = `<div class="ds-badges">${present
    .map((ds) => `<span class="ds-badge" style="--c:${DS_COLOR[ds]}">${t(`ds_${ds}`)}</span>`).join('')}</div>`;
  html += row(t('lvl_zone'), s.zone_label ?? s.zone ?? '—');

  const fish = core.fish_summary.find((r) => r.Site === code);
  if (fish) {
    html += `<div class="subhead">${t('ds_fish')}</div>`
      + row(t('richness'), `${fmtInt(fish.n_species)} spp.`)
      + row(t('families'), fmtInt(fish.n_families))
      + row(t('censuses'), fmtInt(fish.n_events))
      + row(t('individuals'), fmtInt(fish.total_abundance))
      + row(t('year_range'), fish.year_range ?? '—');
  }
  const ben = core.benthos_summary.find((r) => r.Site === code);
  if (ben) {
    html += `<div class="subhead">${t('ds_benthos')}</div>`
      + row(t('m_species'), fmtInt(ben.n_species))
      + row(t('quadrats'), fmtInt(ben.n_quadrats))
      + row(t('year_range'), ben.year_range ?? '—');
  }

  const sp = topN(core.fish_top.filter((r) => r.Site === code), 'abundance', 4);
  if (sp.length) {
    html += `<div class="subhead">${t('top_species')}</div>
      <div class="species-grid">${sp.map((r) => `
        <div class="species">
          ${r.photo ? `<img src="assets/img/fish_photos/${r.photo}" alt="" loading="lazy">` : ''}
          <div class="sp-body">
            <div class="sp-name">${r.scientificNameAccepted}</div>
            <div class="sp-fam">${r.family_label ?? ''}</div>
            <div class="sp-n">${fmtInt(r.abundance)} ${t('individuals').toLowerCase()}</div>
          </div>
        </div>`).join('')}</div>`;
  }
  $('#profile-body').innerHTML = html;
  panel.setAttribute('data-open', '');
}

const row = (k, v) => `<div class="stat-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;

// ---------------------------------------------------------------------------
// Idioma e redimensionamento
// ---------------------------------------------------------------------------

function applyLabels() {
  $$('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.title = `IntegraMAR — ${t('brand_sub')}`;
}

function wireLang() {
  $('#lang-btn').onclick = () => {
    const next = getLang() === 'pt' ? 'en' : 'pt';
    setLang(next);
    $('#lang-btn').textContent = next === 'pt' ? 'EN' : 'PT';
    document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en';
    store.set('lang', next);

    buildNav();
    applyLabels();
    renderEixoHeads();
    buildTemporalControls();
    const cfg = EIXO_MAP[store.get('eixo')];
    if (cfg) buildMapBar(store.get('eixo'), cfg);
    redrawMap();
    renderEixo(store.get('eixo'));
    renderProfile(store.get('selectedSite'));
  };

  window.addEventListener('resize', () => {
    resizeMap();
    Object.values(charts).forEach((c) => c?.resize());
  });
}
