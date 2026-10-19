// ===========================================================================
// Montagem da aplicacao
// ===========================================================================

import { loadCore, fmtInt, fmt, uniq, sum, groupBy, topN } from './data.js';
import { createStore } from './store.js';
import { initMap, resizeMap } from './map.js';
import { groupSeries, taxonSeries, trendOption, taxonOption, heatmapOption, CAT } from './charts.js';
import {
  DATASETS, DS_COLOR, RAMP, MAP_MODES, MODE_VARS, SPATIAL_LAYERS,
  t, setLang, getLang, optLabel, varLabel,
} from './config.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let core, store;
let chartTrend, chartTaxon, chartHeat;

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
    view: 'map',
    lang: 'pt',
    level: 'archipelago', zone: null, site: null,
    mode: 'datasets', variable: null, layer: 'none',
    activeDatasets: [...DATASETS],
    selectedSite: null, selectedDataset: null,
    tDataset: 'benthos', tType: 'lines', tTaxa: [],
  });

  buildControls();
  buildTemporalControls();
  wireViews();
  wireProfile();

  initMap($('#map'), store, core);

  store.on(['level', 'zone', 'site', 'activeDatasets'], renderMetrics);
  store.on('selectedSite', renderProfile);
  store.on(['tDataset', 'tType', 'level', 'zone', 'site'], renderTemporal);
  store.on('lang', relabel);

  renderMetrics();
  await renderTemporal();

  $('#boot').setAttribute('data-done', '');
})();

// ---------------------------------------------------------------------------
// Helpers de formulario
// ---------------------------------------------------------------------------

function fillSelect(el, options, selected) {
  el.innerHTML = options
    .map((o) => `<option value="${o.v}"${o.v === selected ? ' selected' : ''}>${o.label}</option>`)
    .join('');
}

function makeChips(el, options, isOn, onToggle) {
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
// Controles do mapa
// ---------------------------------------------------------------------------

function buildControls() {
  const levels = [
    { v: 'archipelago', label: t('lvl_archipelago') },
    { v: 'zone',        label: t('lvl_zone') },
    { v: 'site',        label: t('lvl_site') },
  ];
  fillSelect($('#f-level'), levels, store.get('level'));
  $('#f-level').onchange = (e) => {
    store.set({ level: e.target.value, zone: null, site: null });
    syncHierarchy();
  };

  const zones = uniq(core.sites.map((s) => s.zone)).sort()
    .map((z) => ({ v: z, label: core.sites.find((s) => s.zone === z)?.zone_label ?? z }));
  fillSelect($('#f-zone'), [{ v: '', label: t('all_zones') }, ...zones], '');
  $('#f-zone').onchange = (e) => store.set('zone', e.target.value || null);

  const sites = [...core.sites].sort((a, b) => a.site_label.localeCompare(b.site_label))
    .map((s) => ({ v: s.Site, label: s.site_label }));
  fillSelect($('#f-site'), [{ v: '', label: t('all_sites') }, ...sites], '');
  $('#f-site').onchange = (e) => store.set('site', e.target.value || null);

  fillSelect($('#f-mode'), MAP_MODES.map((m) => ({ v: m, label: t(`mode_${m}`) })), store.get('mode'));
  $('#f-mode').onchange = (e) => {
    const mode = e.target.value;
    // Cada modo tem o proprio conjunto de variaveis; a primeira e o padrao,
    // igual ao `selected` de cada selectInput do Shiny.
    const spec = MODE_VARS[mode];
    store.set({ mode, variable: spec ? spec.options[0].v : null });
    syncVariable();
  };

  fillSelect($('#f-layer'), SPATIAL_LAYERS.map((o) => ({ v: o.v, label: optLabel(o) })), 'none');
  $('#f-layer').onchange = (e) => store.set('layer', e.target.value);

  makeChips(
    $('#f-datasets'),
    DATASETS.map((ds) => ({ v: ds, label: t(`ds_${ds}`), color: DS_COLOR[ds] })),
    (v) => store.get('activeDatasets').includes(v),
    (v) => {
      const cur = store.get('activeDatasets');
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      // Desligar o ultimo conjunto deixaria o mapa vazio sem explicacao.
      if (!next.length) return;
      store.set('activeDatasets', next);
      $(`#f-datasets .chip[data-v="${v}"]`).setAttribute('aria-pressed', next.includes(v));
    }
  );

  syncHierarchy();
  syncVariable();
}

function syncHierarchy() {
  const lvl = store.get('level');
  $('#f-zone-wrap').hidden = lvl !== 'zone';
  $('#f-site-wrap').hidden = lvl !== 'site';
}

function syncVariable() {
  const mode = store.get('mode');
  const spec = MODE_VARS[mode];
  $('#f-var-wrap').hidden = !spec;
  if (!spec) return;
  $('#f-var-label').textContent = t(`f_var_${mode}`);
  fillSelect($('#f-var'), spec.options.map((o) => ({ v: o.v, label: optLabel(o) })), store.get('variable'));
  $('#f-var').onchange = (e) => store.set('variable', e.target.value);
}

// ---------------------------------------------------------------------------
// Metricas
// ---------------------------------------------------------------------------

function visibleSites() {
  const { level, zone, site, activeDatasets } = store.state;
  let rows = core.sites;
  if (level === 'zone' && zone) rows = rows.filter((r) => r.zone === zone);
  if (level === 'site' && site) rows = rows.filter((r) => r.Site === site);
  return rows.filter((r) => activeDatasets.some((ds) => r[`has_${ds}`]));
}

function renderMetrics() {
  const sites = visibleSites();
  const codes = new Set(sites.map((s) => s.Site));

  const censuses = sum(core.fish_summary.filter((r) => codes.has(r.Site)).map((r) => r.n_events));
  const quads = sum(core.benthos_summary.filter((r) => codes.has(r.Site)).map((r) => r.n_quadrats));

  const items = [
    [fmtInt(sites.length), t('m_sites')],
    [fmtInt(store.get('activeDatasets').length), t('m_datasets')],
    [fmtInt(censuses), t('censuses')],
    [fmtInt(quads), t('quadrats')],
  ];
  $('#metrics').innerHTML = items
    .map(([v, k]) => `<div class="metric"><div class="v">${v}</div><div class="k">${k}</div></div>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Perfil do sitio
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
    .map((ds) => `<span class="ds-badge" style="--c:${DS_COLOR[ds]}">${t(`ds_${ds}`)}</span>`)
    .join('')}</div>`;

  html += `<div class="stat-row"><span class="k">${t('lvl_zone')}</span>
             <span class="v">${s.zone_label ?? s.zone ?? '—'}</span></div>`;

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

  // Quatro especies mais abundantes, em grade 2x2 com foto.
  const sp = topN(core.fish_top.filter((r) => r.Site === code), 'abundance', 4);
  if (sp.length) {
    html += `<div class="subhead">${t('top_species')}</div>
      <div class="species-grid">${sp.map((r) => `
        <div class="species">
          ${r.photo ? `<img src="assets/img/fish_photos/${r.photo}" alt="" loading="lazy">` : ''}
          <div class="sp-body">
            <div class="sp-name">${r.scientificNameAccepted}</div>
            <div class="sp-fam">${r.family_label ?? ''}</div>
            <div class="sp-n">${fmtInt(r.abundance)} ${t('individuals')}</div>
          </div>
        </div>`).join('')}</div>`;
  }

  $('#profile-body').innerHTML = html;
  panel.setAttribute('data-open', '');
}

const row = (k, v) => `<div class="stat-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;

// ---------------------------------------------------------------------------
// Temporal
// ---------------------------------------------------------------------------

function buildTemporalControls() {
  makeChips(
    $('#t-dataset'),
    [
      { v: 'benthos', label: t('ds_benthos'), color: DS_COLOR.benthos },
      { v: 'fish',    label: t('ds_fish'),    color: DS_COLOR.fish },
    ],
    (v) => store.get('tDataset') === v,
    (v) => {
      // Trocar de conjunto invalida os taxons escolhidos: os nomes nao se
      // sobrepoem entre bentos e peixes.
      store.set({ tDataset: v, tTaxa: [] });
      $$('#t-dataset .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
    }
  );

  makeChips(
    $('#t-type'),
    [
      { v: 'lines', label: getLang() === 'pt' ? 'Linhas' : 'Lines', color: '#5a6a8a' },
      { v: 'area',  label: getLang() === 'pt' ? 'Área 100%' : '100% area', color: '#5a6a8a' },
    ],
    (v) => store.get('tType') === v,
    (v) => {
      store.set('tType', v);
      $$('#t-type .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
    }
  );
}

function siteFilter() {
  const { level, zone, site } = store.state;
  if (level === 'site' && site) return [site];
  if (level === 'zone' && zone) return core.sites.filter((s) => s.zone === zone).map((s) => s.Site);
  return [];
}

function ensureCharts() {
  if (!chartTrend) chartTrend = echarts.init($('#chart-trend'), null, { renderer: 'canvas' });
  if (!chartTaxon) chartTaxon = echarts.init($('#chart-taxon'), null, { renderer: 'canvas' });
  if (!chartHeat)  chartHeat  = echarts.init($('#chart-heat'),  null, { renderer: 'canvas' });
}

async function renderTemporal() {
  if (store.get('view') !== 'temporal' && !chartTrend) return;  // so monta quando visivel
  ensureCharts();

  const ds = store.get('tDataset');
  const sites = siteFilter();
  const unit = ds === 'benthos' ? '%' : '';

  const rows = groupSeries(core, ds, sites);
  if (!rows.length) {
    chartTrend.clear(); chartHeat.clear();
    return;
  }

  chartTrend.setOption(trendOption(rows, { type: store.get('tType'), unit }), true);
  chartHeat.setOption(heatmapOption(rows, RAMP[ds] ?? RAMP.datasets, unit), true);

  $('#trend-sub').textContent = ds === 'benthos'
    ? (getLang() === 'pt' ? 'Cobertura média por grupo funcional (%)' : 'Mean cover by functional group (%)')
    : (getLang() === 'pt' ? 'Abundância por censo, por família' : 'Abundance per census, by family');
  $('#heat-sub').textContent = $('#trend-sub').textContent;

  // Camada sob demanda: a tabela de taxon so e buscada quando a aba abre.
  const taxa = await taxonSeries(core, ds, sites);
  const totals = [...groupBy(taxa, 'name')]
    .map(([name, g]) => [name, sum(g.map((r) => r.value))])
    .sort((a, b) => b[1] - a[1]);

  const sel = store.get('tTaxa').length
    ? store.get('tTaxa')
    : totals.slice(0, 4).map((x) => x[0]);

  // Seis series e o limite em que as cores ainda se distinguem umas das
  // outras; acima disso o grafico deixa de ser legivel. A lista mostra os 40
  // taxons mais abundantes -- a cauda nao cabe nem ajuda.
  const MAX_TAXA = 6;
  const choices = totals.slice(0, 40).map(([name]) => name);
  let picked = sel.filter((n) => choices.includes(n));

  const el = $('#t-taxon');
  const paint = () => {
    el.innerHTML = choices
      .map((name) => {
        const i = picked.indexOf(name);
        const on = i >= 0;
        const full = !on && picked.length >= MAX_TAXA;
        return `<button class="chip" data-v="${name}" aria-pressed="${on}"
          ${full ? 'aria-disabled="true"' : ''}
          style="--c:${on ? CAT[i % CAT.length] : 'var(--muted)'}"
          ><span class="dot"></span>${name}</button>`;
      })
      .join('');
  };
  el.onclick = (e) => {
    const b = e.target.closest('.chip');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    const name = b.dataset.v;
    picked = picked.includes(name)
      ? picked.filter((x) => x !== name)
      : [...picked, name];
    store.set('tTaxa', picked);
    paint();
    chartTaxon.setOption(taxonOption(taxa, picked, unit), true);
  };
  paint();

  chartTaxon.setOption(taxonOption(taxa, picked, unit), true);
}

// ---------------------------------------------------------------------------
// Navegacao entre views
// ---------------------------------------------------------------------------

function wireViews() {
  $$('.nav button').forEach((btn) => {
    btn.onclick = () => {
      const view = btn.dataset.view;
      store.set('view', view);
      $$('.nav button').forEach((b) => b.setAttribute('aria-selected', b === btn));
      $$('.view').forEach((v) => v.toggleAttribute('data-active', v.id === `view-${view}`));
      // Leaflet e ECharts medem errado quando o container estava oculto; o
      // reflow precisa acontecer DEPOIS do display:block.
      requestAnimationFrame(() => {
        if (view === 'map') resizeMap();
        else { ensureCharts(); renderTemporal(); [chartTrend, chartTaxon, chartHeat].forEach((c) => c?.resize()); }
      });
    };
  });

  window.addEventListener('resize', () => {
    resizeMap();
    [chartTrend, chartTaxon, chartHeat].forEach((c) => c?.resize());
  });

  $('#lang-btn').onclick = () => {
    const next = getLang() === 'pt' ? 'en' : 'pt';
    setLang(next);
    $('#lang-btn').textContent = next === 'pt' ? 'EN' : 'PT';
    document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en';
    store.set('lang', next);
  };
}

function relabel() {
  $$('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  buildControls();
  buildTemporalControls();
  renderMetrics();
  renderProfile(store.get('selectedSite'));
  renderTemporal();
}
