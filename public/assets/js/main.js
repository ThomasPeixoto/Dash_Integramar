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
import { buildNational, REGION_LABEL, REGION_ORDER, tituloUC } from './national.js';

/** geobr devolve "Rio Grande Do Norte"; as partículas vão em minúscula. */
const tituloUF = (s) => tituloUC(s ?? '');
import { initMap, resizeMap, redrawMap, fitToData, setLegendSlot } from './map.js';
import {
  groupSeries, taxonSeries, trendOption, taxonOption, heatmapOption,
  barOption, groupedBarOption, zoneLineOption, CAT,
} from './charts.js';
import {
  readE1Map, readE1Time, readE1Nacional, readE1Corais, readE1Comunidade, readE2, readE3Rodolitos, readE3Pesca,
  readE4Fish, readE4Pollution, readE4Absent, zoneFish, zonePollution,
} from './narrative.js';
import {
  DATASETS, NATIONAL_DATASETS, BENTHOS_SOURCES, DS_COLOR, RAMP, MODE_VARS,
  SPATIAL_LAYERS, NATIONAL_LAYERS, EIXOS, eixoById,
  t, setLang, getLang, optLabel, varLabel, CREDITS,
} from './config.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let core, store;
const charts = {};
let msgNacional = '';

// Mapa e séries só existem em alguns eixos; esta tabela diz o que cada um
// reivindica, e é o que o roteador consulta ao trocar de página.
// `datasets` vem de EIXOS, nunca repetido aqui: as duas listas já divergiram
// uma vez (o eixo declarava um conjunto que havia sido renomeado, e a ficha do
// responsável parou de renderizar sem erro nenhum no console).
const EIXO_MAP = {
  eixo1: { slot: 'slot-eixo1', scope: 'national', modes: ['datasets', 'fish'] },
  eixo2: { slot: 'slot-eixo2', scope: 'noronha',  modes: ['pollution'] },
};
for (const [id, cfg] of Object.entries(EIXO_MAP)) cfg.datasets = eixoById(id).datasets;

// Estado de mapa lembrado por eixo, para que voltar a um eixo não perca o
// modo e a variável que estavam escolhidos lá.
const eixoState = {
  eixo1: { mode: 'datasets', variable: null, layer: 'none' },
  eixo2: { mode: 'pollution', variable: 'Salinity', layer: 'none' },
};

const regionLabel = (r) => REGION_LABEL[r]?.[getLang()] ?? r;

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

  core.national = buildNational(core);
  if (core.national) {
    msgNacional = `${core.national.sites.length} sítios · ${core.national.regions.length} regiões`;
  }

  store = createStore({
    eixo: 'eixo1',
    scope: 'national', uc: null, uf: null,
    lang: 'pt',
    level: 'archipelago', zone: null, site: null,
    mode: 'datasets', variable: null, layer: 'none',
    activeDatasets: ['benthos', 'fish'],
    selectedSite: null,
    tDataset: core.national ? 'fish' : 'benthos', tType: 'lines', tTaxa: [],
    tBenthosDs: 'XV',
    e2Param: 'Salinity', e4Param: 'DIN',
  });

  buildNav();
  applyLabels();
  renderEixoHeads();
  buildTemporalControls();
  wireProfile();
  wireLang();

  initMap($('#map'), store, core);

  store.on(['mode', 'variable', 'level', 'zone', 'uf', 'uc', 'site', 'activeDatasets', 'layer'], () => {
    renderReadings();
  });
  store.on(['level', 'zone', 'uf', 'uc', 'site', 'layer'], syncControlValues);
  store.on(['selectedSite', 'level', 'zone', 'uf', 'uc'], renderProfile);
  store.on(['tDataset', 'tType', 'tBenthosDs', 'level', 'zone', 'uf', 'uc', 'site'], renderTemporal);

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
      scope: cfg.scope ?? 'noronha',
      activeDatasets: cfg.datasets.filter((ds) => ds !== 'benthos_islands' || core.national),
      selectedSite: null,
      level: 'archipelago', zone: null, uc: null, uf: null, site: null,
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
    el.style.setProperty('--eixo', e.color);
    el.innerHTML = `
      <p class="eyebrow">${lg === 'pt' ? 'EIXO' : 'AXIS'} ${e.n}</p>
      <h2>${title}</h2>
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
    if (core.national) {
      const fy = core.reef_fish_year ?? [];
      const anos = uniq(fy.map((r) => r.year));
      return [
        [fmtInt(core.national.sites.length), t('m_sites')],
        [fmtInt(core.national.regions.length), t('lvl_region') === 'Região' ? 'Regiões' : 'Regions'],
        [fmtInt(sum(fy.map((r) => r.n_events))), t('censuses')],
        [`${Math.min(...anos)}–${Math.max(...anos)}`, t('year_range')],
      ];
    }
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

  const nac = cfg.scope === 'national' && core.national;

  bar.innerHTML = `
    <div class="field">
      <label for="f-level">${t('f_level')}</label>
      <select class="input" id="f-level"></select>
    </div>
    <div class="field field--wide" id="f-zone-wrap" hidden>
      <label for="f-zone">${nac ? t('lvl_region') : t('lvl_zone')}</label>
      <select class="input" id="f-zone"></select>
    </div>
    ${nac ? `<div class="field" id="f-uf-wrap" hidden>
      <label for="f-uf">${t('lvl_uf')}</label>
      <select class="input" id="f-uf"></select>
    </div>
    <div class="field field--wide" id="f-uc-wrap" hidden>
      <label for="f-uc">${t('lvl_uc')}</label>
      <select class="input" id="f-uc"></select>
    </div>` : ''}
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
      <label for="f-layer">${nac ? t('f_generalize') : t('f_layer')}</label>
      <select class="input" id="f-layer"></select>
    </div>
    ${cfg.datasets.length > 1 ? `<div class="field field--chips">
      <label>${t('f_datasets')}</label>
      <div class="chips" id="f-datasets"></div>
    </div>` : ''}
    <div class="map-legend legend-inline" id="legend"></div>`;

  const niveis = nac
    ? [{ v: 'archipelago', label: t('lvl_brasil') },
       { v: 'zone',        label: t('lvl_region') },
       { v: 'uf',          label: t('lvl_uf') },
       { v: 'uc',          label: t('lvl_uc') },
       { v: 'site',        label: t('lvl_site') }]
    : [{ v: 'archipelago', label: t('lvl_archipelago') },
       { v: 'zone',        label: t('lvl_zone') },
       { v: 'site',        label: t('lvl_site') }];
  fillSelect($('#f-level'), niveis, store.get('level'));
  $('#f-level').onchange = (e) => {
    const lvl = e.target.value;
    // Escolher "Estado" ou "Unidade de Conservação" liga o recorte
    // correspondente no mapa: pedir o nível e depois ter que achar o seletor
    // de generalização para ver o polígono era um passo a mais sem motivo.
    const camada = nac ? ({ uf: 'estados', uc: 'ucs' }[lvl] ?? 'none') : store.get('layer');
    store.set({ level: lvl, zone: null, uf: null, uc: null, site: null, layer: camada });
    syncHierarchy();
  };

  const fonte = nac ? core.national.sites : core.sites;

  const zones = nac
    // Norte -> sul, não alfabética: a ordem geográfica é a leitura natural
    // de uma costa, e é a mesma do gráfico estratificado por região.
    ? REGION_ORDER.filter((r) => core.national.regions.includes(r))
        .map((r) => ({ v: r, label: regionLabel(r) }))
    : uniq(core.sites.map((s) => s.zone)).sort()
        .map((z) => ({ v: z, label: core.sites.find((s) => s.zone === z)?.zone_label ?? z }));
  fillSelect($('#f-zone'), [{ v: '', label: nac ? t('all_regions') : t('all_zones') }, ...zones],
             store.get('zone') ?? '');
  $('#f-zone').onchange = (e) => store.set('zone', e.target.value || null);

  if (nac) {
    const ufs = uniq(core.national.sites.map((x) => x.uf).filter(Boolean)).sort()
      .map((u) => ({ v: u, label: tituloUF(core.national.sites.find((x) => x.uf === u)?.uf_nome ?? u) }));
    fillSelect($('#f-uf'), [{ v: '', label: t('all_ufs') }, ...ufs], store.get('uf') ?? '');
    $('#f-uf').onchange = (e) => store.set('uf', e.target.value || null);

    const ucs = core.national.ucs.map((u) => ({ v: u, label: u }));
    fillSelect($('#f-uc'), [{ v: '', label: t('all_ucs') }, ...ucs], store.get('uc') ?? '');
    $('#f-uc').onchange = (e) => store.set('uc', e.target.value || null);
  }

  // Só oferecemos sítios que têm algum dos conjuntos deste eixo; listar os 21
  // num eixo que cobre 4 produziria seleções vazias sem explicação.
  const sites = fonte
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

  // Os recortes diferem por escala: em Noronha são feições do recife (setores
  // costeiros, regiões recifais); nacionalmente são administrativos.
  const camadas = nac ? NATIONAL_LAYERS : SPATIAL_LAYERS;
  const atual = camadas.some((o) => o.v === store.get('layer')) ? store.get('layer') : 'none';
  if (atual !== store.get('layer')) store.set('layer', atual);
  fillSelect($('#f-layer'), camadas.map((o) => ({ v: o.v, label: optLabel(o) })), atual);
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

/**
 * Reflete nos seletores um recorte que veio de fora deles — do clique num
 * polígono do mapa, por exemplo. Sem isso o painel filtra mas os controles
 * seguem mostrando "Brasil", e o usuário não sabe por que o mapa mudou.
 */
function syncControlValues() {
  const set = (sel, v) => { const el = $(sel); if (el) el.value = v ?? ''; };
  set('#f-level', store.get('level'));
  set('#f-zone', store.get('zone'));
  set('#f-uf', store.get('uf'));
  set('#f-uc', store.get('uc'));
  set('#f-site', store.get('site'));
  set('#f-layer', store.get('layer'));
  syncHierarchy();
}

function syncHierarchy() {
  const lvl = store.get('level');
  const pares = [['#f-zone-wrap', 'zone'], ['#f-uf-wrap', 'uf'],
                 ['#f-uc-wrap', 'uc'], ['#f-site-wrap', 'site']];
  for (const [sel, nivel] of pares) {
    const el = $(sel);
    if (el) el.hidden = lvl !== nivel;
  }
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
  const { level, zone, uf, uc, site, activeDatasets, scope } = store.state;
  let rows = (scope === 'national' && core.national) ? core.national.sites : core.sites;
  if (level === 'zone' && zone) rows = rows.filter((r) => r.zone === zone);
  if (level === 'uf'   && uf)   rows = rows.filter((r) => r.uf === uf);
  if (level === 'uc'   && uc)   rows = rows.filter((r) => (r.ucs ?? []).some((x) => x.nome === uc));
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
  const fontes = core.national
    ? NATIONAL_DATASETS.map((v) => ({ v, label: t(`ds_${v}`), color: DS_COLOR[v] }))
    : [{ v: 'benthos', label: t('ds_benthos'), color: DS_COLOR.benthos },
       { v: 'fish',    label: t('ds_fish'),    color: DS_COLOR.fish }];
  makeChips($('#t-dataset'), fontes,
    (v) => store.get('tDataset') === v,
    (v) => {
      // Trocar de conjunto invalida os táxons escolhidos: os nomes não se
      // sobrepõem entre bentos e peixes.
      store.set({ tDataset: v, tTaxa: [] });
      $$('#t-dataset .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
      syncBenthosSources();
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

/**
 * A camada de comunidade bentônica é uma camada POR DATASET. XIV, XV, XVI e a
 * série de Noronha medem universos diferentes e nunca são somados, então a
 * escolha do dataset é explícita em vez de implícita numa média.
 */
function syncBenthosSources() {
  const el = $('#t-benthos-ds');
  if (!el) return;
  const mostrar = store.get('tDataset') === 'benthos' && core.national;
  el.hidden = !mostrar;
  if (!mostrar) return;
  makeChips(el,
    BENTHOS_SOURCES.map((o) => ({ v: o.v, label: optLabel(o), color: DS_COLOR.benthos })),
    (v) => store.get('tBenthosDs') === v,
    (v) => {
      store.set('tBenthosDs', v);
      $$('#t-benthos-ds .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
      renderTemporal();
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

/** Códigos de sítio que o recorte atual alcança; vazio = sem recorte. */
function siteFilter() {
  const { level, zone, uf, uc, site, scope } = store.state;
  const fonte = (scope === 'national' && core.national) ? core.national.sites : core.sites;
  if (level === 'site' && site) return [site];
  if (level === 'uf'   && uf)   return fonte.filter((s) => s.uf === uf).map((s) => s.Site);
  if (level === 'uc'   && uc)
    return fonte.filter((s) => (s.ucs ?? []).some((x) => x.nome === uc)).map((s) => s.Site);
  if (level === 'zone' && zone) return fonte.filter((s) => s.zone === zone).map((s) => s.Site);
  return [];
}

async function renderTemporal() {
  if (store.get('eixo') !== 'eixo1') return;
  const ds = store.get('tDataset');

  // O peixe nacional é estratificado por REGIÃO, nunca agregado. A composição
  // geográfica do "Brasil" muda a cada ano — o Rio é 44% dos censos e a única
  // região presente de 2001 a 2005 — então uma linha nacional única mostraria
  // geografia disfarçada de tendência.
  if (core.national) {
    if (ds === 'fish')  return renderTemporalNacional();
    if (ds === 'coral') return renderTemporalCorais();
    if (ds === 'benthos' && store.get('tBenthosDs') !== 'Noronha') return renderTemporalComunidade();
  }

  const nomes = ds === 'benthos' ? (g) => varLabel('benthos', g) : (g) => g;
  const unit = ds === 'fish' ? '' : '%';
  const rows = groupSeries(core, ds, []);

  setHTML('#read-e1-time', readE1Time(rows, ds, nomes));
  const sub = ds === 'benthos_islands'
    ? (getLang() === 'pt' ? 'Cobertura média por grupo, ilhas oceânicas (%)'
                          : 'Mean cover by group, oceanic islands (%)')
    : (getLang() === 'pt' ? 'Cobertura média por grupo funcional (%)'
                          : 'Mean cover by functional group (%)');
  $('#trend-sub').textContent = sub;
  $('#heat-sub').textContent = sub;
  showTaxonCard(ds !== 'benthos_islands');

  if (!rows.length) return;
  chart('chart-trend')?.setOption(
    trendOption(rows, { type: store.get('tType'), unit, nameOf: nomes }), true);
  chart('chart-heat')?.setOption(
    heatmapOption(rows, RAMP[ds === 'fish' ? 'fish' : 'benthos'] ?? RAMP.datasets, unit, nomes), true);

  if (ds === 'benthos_islands') return;
  await renderTaxonCard(ds, unit);
}

/** Corais: composição relativa dentro da assembleia, por espécie. */
function renderTemporalCorais() {
  const alvo = siteFilter();
  const rows = (core.coral_sy_sp ?? [])
    .filter((r) => !alvo.length || alvo.includes(r.site_id))
    .map((r) => ({ Site: r.site_id, Year: r.year, group: r.species,
                   value: r.pct, n_events: r.n_eventos }));

  setHTML('#read-e1-time', readE1Corais(core, rows, siteFilter()));
  const sub = getLang() === 'pt'
    ? 'Participação de cada espécie na assembleia de coral (%)'
    : 'Share of each species within the coral assemblage (%)';
  $('#trend-sub').textContent = sub;
  $('#heat-sub').textContent = sub;
  showTaxonCard(false);

  if (!rows.length) { chart('chart-trend')?.clear(); chart('chart-heat')?.clear(); return; }
  chart('chart-trend')?.setOption(
    trendOption(rows, { type: store.get('tType'), unit: '%', nameOf: (g) => g }), true);
  chart('chart-heat')?.setOption(heatmapOption(rows, RAMP.productivity, '%'), true);
}

/** Comunidade bentônica de UM dataset, por grupo funcional. */
function renderTemporalComunidade() {
  const dsAtivo = store.get('tBenthosDs');
  const alvo = siteFilter();
  const rows = (core.com_sy ?? [])
    .filter((r) => r.ds === dsAtivo)
    .filter((r) => !alvo.length || alvo.includes(r.site_id))
    .map((r) => ({ Site: r.site_id, Year: r.year, group: r.functional_group,
                   value: r.pct, n_events: r.n_eventos }));

  setHTML('#read-e1-time', readE1Comunidade(core, rows, dsAtivo));
  const sub = getLang() === 'pt'
    ? `Composição relativa ao que o dataset ${dsAtivo} mede (%) — não comparar com outro dataset`
    : `Composition relative to what dataset ${dsAtivo} measures (%) — do not compare across datasets`;
  $('#trend-sub').textContent = sub;
  $('#heat-sub').textContent = sub;
  showTaxonCard(false);

  if (!rows.length) { chart('chart-trend')?.clear(); chart('chart-heat')?.clear(); return; }
  chart('chart-trend')?.setOption(
    trendOption(rows, { type: store.get('tType'), unit: '%', nameOf: (g) => g }), true);
  chart('chart-heat')?.setOption(heatmapOption(rows, RAMP.benthos, '%'), true);
}

/** Peixe nacional: uma série por região, em indivíduos por censo. */
function renderTemporalNacional() {
  const fy = core.reef_fish_year ?? [];
  const regiao = new Map(core.national.sites.map((s) => [s.Site, s.region]));
  const rows = fy.map((r) => ({
    Site: r.site_id, Year: r.year,
    group: regiao.get(r.site_id) ?? '—',
    value: r.n_events ? r.total_abundance / r.n_events : null,
    n_events: r.n_events, total: r.total_abundance,
  })).filter((r) => Number.isFinite(r.value));

  const alvo = siteFilter();
  const rs = alvo.length ? rows.filter((r) => alvo.includes(r.Site)) : rows;

  setHTML('#read-e1-time', readE1Nacional(rs, regionLabel));
  const sub = getLang() === 'pt'
    ? 'Indivíduos por censo, por região — nunca agregado em uma linha só'
    : 'Individuals per census, by region — never pooled into a single line';
  $('#trend-sub').textContent = sub;
  $('#heat-sub').textContent = sub;
  showTaxonCard(false);

  if (!rs.length) return;
  chart('chart-trend')?.setOption(
    trendOption(rs, { type: store.get('tType'), unit: '', nameOf: regionLabel }), true);
  chart('chart-heat')?.setOption(
    heatmapOption(rs, RAMP.fish, '', regionLabel), true);
}

/** O card de táxons só faz sentido onde há tabela de táxon por sítio/ano. */
function showTaxonCard(mostrar) {
  const card = $('#chart-taxon')?.closest('.card');
  if (card) card.hidden = !mostrar;
}

async function renderTaxonCard(ds, unit) {
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

/** Chave da área selecionada, ou null quando o recorte é o país inteiro. */
function areaSelecionada() {
  const { level, zone, uf, uc } = store.state;
  if (store.get('scope') !== 'national') return null;
  if (level === 'uf'   && uf)   return { tipo: 'uf', chave: uf };
  if (level === 'uc'   && uc)   return { tipo: 'uc', chave: uc };
  if (level === 'zone' && zone) return { tipo: 'region', chave: zone };
  return null;
}

/**
 * O painel lateral mostra o que estiver selecionado: um sítio, se houver
 * clique num ponto; senão a área do recorte atual. Pedir um estado e não ver
 * nada sobre ele era o comportamento anterior.
 */
function renderProfile() {
  const panel = $('#profile');
  const code = store.get('selectedSite');
  if (!code) {
    const area = areaSelecionada();
    if (area) return renderAreaProfile(area);
    panel.removeAttribute('data-open');
    return;
  }
  const fonte = (store.get('scope') === 'national' && core.national)
    ? core.national.sites : core.sites;
  const s = fonte.find((x) => x.Site === code);
  if (!s) { panel.removeAttribute('data-open'); return; }

  $('#profile-kind').textContent = t('profile');
  $('#profile-title').textContent = s.site_label;
  const present = DATASETS.filter((ds) => s[`has_${ds}`]);
  let html = `<div class="ds-badges">${present
    .map((ds) => `<span class="ds-badge" style="--c:${DS_COLOR[ds]}">${t(`ds_${ds}`)}</span>`).join('')}</div>`;
  html += row(t('lvl_zone'), s.zone_label ?? s.zone ?? '—');

  // Na escala nacional o sítio é do ReefSYN e as métricas vêm de outra tabela.
  if (store.get('scope') === 'national' && core.national) {
    const rs = (core.reef_fish_summary ?? []).find((r) => r.site_id === code);
    if (rs) {
      html += `<div class="subhead">${t('ds_fish')}</div>`
        + row(t('richness'), `${fmtInt(rs.n_species)} spp.`)
        + row(t('families'), fmtInt(rs.n_families))
        + row(t('censuses'), fmtInt(rs.n_events))
        + row(t('individuals'), fmtInt(rs.total_abundance))
        + row(t('year_range'), rs.year_range ?? '—');
    }
    if (s.uf_nome) html += row(t('lvl_uf'), tituloUF(s.uf_nome));
    if (s.uc_name) html += row(t('lvl_uc'), s.uc_name);
    const sp = (core.fish_sp_by_site ?? []).filter((r) => r.site_id === code).slice(0, 4);
    html += especiesHTML(sp);
    $('#profile-body').innerHTML = html;
    panel.setAttribute('data-open', '');
    return;
  }

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

/** Nome do arquivo de foto a partir do nome científico, se existir. */
const FOTOS = new Set(["abudefduf_saxatilis.jpg", "acanthurus_chirurgus.jpg", "acanthurus_coeruleus.jpg", "aluterus_scriptus.webp", "anisotremus_surinamensis.jpg", "aulostomus_strigosus.webp", "azurina_multilineata.webp", "bothus_lunatus.jpg", "cantherhines_macrocerus.webp", "caranx_latus.webp", "caranx_lugubris.webp", "cephalopholis_fulva.jpg", "chaetodon_ocellatus.webp", "dermatolepis_inermis.jpg", "diodon_hystrix.jpg", "elacatinus_figaro.jpg", "elacatinus_phthirophagus.jpg", "gymnothorax_funebris.webp", "gymnothorax_moringa.jpg", "haemulon_chrysargyreum.jpg", "haemulon_parra.webp", "halichoeres_radiatus.webp", "holacanthus_ciliaris.jpg", "holocentrus_adscensionis.jpg", "kyphosus_sectatrix.webp", "lactophrys_trigonus.webp", "malacoctenus_lianae.jpg", "melichthys_niger.jpg", "mulloidichthys_martinicus.webp", "myripristis_jacobus.jpg", "paranthias_furcifer.jpg", "pempheris_schomburgkii.jpg", "pomacanthus_paru.jpg", "pseudupeneus_maculatus.jpg", "sparisoma_amplum.jpg", "sparisoma_axillare.jpg", "sparisoma_frondosum.jpg", "sparisoma_radians.jpg", "sphyraena_barracuda.jpg", "stegastes_rocasensis.jpg", "thalassoma_noronhanum.jpg"]);
const fotoDe = (sp) => {
  const base = (sp ?? '').toLowerCase().replace(/\s+/g, '_');
  for (const ext of ['jpg', 'webp', 'png']) {
    if (FOTOS.has(`${base}.${ext}`)) return `${base}.${ext}`;
  }
  return null;
};

/**
 * Grade 2x2 das espécies mais abundantes. Só 35-45% das espécies da costa
 * têm foto no acervo (ele veio de Noronha), então quem não tem recebe um
 * bloco neutro com a inicial do gênero -- melhor que um card quebrado.
 */
function especiesHTML(sp) {
  if (!sp?.length) return '';
  return `<div class="subhead">${t('top_species')}</div>
    <div class="species-grid">${sp.map((r) => {
      const nome = r.species ?? r.scientificNameAccepted;
      const foto = r.photo ?? fotoDe(nome);
      const n = r.abundance ?? r.total_abundance;
      return `<div class="species">
        ${foto
          ? `<img src="assets/img/fish_photos/${foto}" alt="" loading="lazy">`
          : `<div class="sp-sem-foto" aria-hidden="true">${(nome ?? '?').charAt(0)}</div>`}
        <div class="sp-body">
          <div class="sp-name">${nome}</div>
          <div class="sp-fam">${r.family ?? r.family_label ?? ''}</div>
          <div class="sp-n">${fmtInt(n)} ${t('individuals').toLowerCase()}</div>
        </div></div>`;
    }).join('')}</div>`;
}

/** Perfil de um estado, UC ou região. */
function renderAreaProfile({ tipo, chave }) {
  const panel = $('#profile');
  let titulo, selo, stats = '', sp = [];

  if (tipo === 'uf') {
    const r = (core.fish_by_uf ?? []).find((x) => x.uf === chave);
    titulo = tituloUF(r?.uf_nome ?? chave);
    selo = t('lvl_uf');
    if (r) stats = statsArea(r);
    sp = (core.fish_sp_by_uf ?? []).filter((x) => x.uf === chave).slice(0, 4);
  } else if (tipo === 'uc') {
    const alvo = (core.national?.sites ?? []).flatMap((x) => x.ucs ?? [])
      .find((u) => u.nome === chave);
    const r = (core.fish_by_uc ?? []).find((x) => x.cd_cnuc === alvo?.cd);
    titulo = chave;
    selo = alvo?.cat ?? t('lvl_uc');
    if (r) stats = statsArea(r);
    sp = (core.fish_sp_by_uc ?? []).filter((x) => x.cd_cnuc === alvo?.cd).slice(0, 4);
  } else {
    const codes = new Set((core.national?.sites ?? [])
      .filter((x) => x.region === chave).map((x) => x.Site));
    const rs = (core.reef_fish_summary ?? []).filter((x) => codes.has(x.site_id));
    const anos = (core.reef_fish_year ?? []).filter((x) => codes.has(x.site_id));
    const censos = sum(anos.map((x) => x.n_events));
    titulo = regionLabel(chave);
    selo = t('lvl_region');
    // Riqueza da região não é somável; sem tabela por região, informamos o
    // que é somável e omitimos o resto em vez de publicar número errado.
    stats = row(t('m_sites'), fmtInt(codes.size))
          + row(t('censuses'), fmtInt(censos))
          + row(t('individuals'), fmtInt(sum(anos.map((x) => x.total_abundance))))
          + row(t('year_range'), anos.length
              ? `${Math.min(...anos.map((x) => x.year))}–${Math.max(...anos.map((x) => x.year))}` : '—');
  }

  $('#profile-kind').textContent = t('profile_area');
  $('#profile-title').textContent = titulo;
  $('#profile-body').innerHTML =
    `<div class="ds-badges"><span class="ds-badge" style="--c:var(--eixo)">${selo}</span></div>`
    + stats + especiesHTML(sp);
  panel.setAttribute('data-open', '');
}

function statsArea(r) {
  return row(t('m_sites'), fmtInt(r.n_sites))
       + row(t('censuses'), fmtInt(r.n_events))
       + row(t('richness'), `${fmtInt(r.richness)} spp.`)
       + row(t('families'), fmtInt(r.n_families))
       + row(t('individuals'), fmtInt(r.total_abundance))
       + row(getLang() === 'pt' ? 'Por censo' : 'Per census', fmtInt(r.mean_abundance));
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
    renderProfile();
  };

  window.addEventListener('resize', () => {
    resizeMap();
    Object.values(charts).forEach((c) => c?.resize());
  });
}
