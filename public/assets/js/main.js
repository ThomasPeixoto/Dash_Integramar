// ===========================================================================
// Montagem da aplicação
//
// A navegação é pelos quatro eixos temáticos da Rede IntegraMAR, não pelas
// ferramentas: cada eixo é uma página de leitura em que as perguntas da
// linha de pesquisa vêm primeiro e a figura responde. Mapa e séries são
// componentes dentro dos eixos.
// ===========================================================================

import { loadCore, loadTable, fmtInt, fmt, uniq, sum, mean, groupBy, topN } from './data.js';
import { createStore } from './store.js';
import { buildNational, REGION_LABEL, REGION_ORDER, tituloUC, nivelProtecao, PROTECAO } from './national.js';

/** geobr devolve "Rio Grande Do Norte"; as partículas vão em minúscula. */
const tituloUF = (s) => tituloUC(s ?? '');
import { initMap, resizeMap, redrawMap, fitToData, setLegendSlot, setCoresComparacao,
         setModoDesenho, limparDesenho } from './map.js';
import {
  groupSeries, taxonSeries, trendOption, taxonOption, heatmapOption,
  multiParamOption, boxTaxaOption, foraDaCerca, donutOption, dayNightOption, barOption,
  CAT,
} from './charts.js';
import {
  readE1Map, readE1Time, readE1Nacional, readE1Corais, readE1Comunidade,
  readE2, readE2Param, readE3Rodolitos, readE3Pesca,
} from './narrative.js';
import {
  DATASETS, NATIONAL_DATASETS, BENTHOS_SOURCES, DS_COLOR, RAMP, MODE_VARS,
  SPATIAL_LAYERS, NATIONAL_LAYERS, EIXOS, eixoById,
  POLLUTION_GROUPS, polUnit, polFamilia, BLOCO_FOTOS,
  CMP_CRITERIOS, CMP_CORES, CMP_METRICAS,
  TX_NIVEIS, TX_METRICAS, TX_MAX, FN_METRICAS,
  t, setLang, getLang, optLabel, varLabel, CREDITS,
} from './config.js';

/** Nome de taxon vai para dentro de atributo HTML; aspas quebrariam o chip. */
const esc = (v) => String(v).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
// Guarda tambem o RECORTE (nivel, regiao, UF, UC, sitio). Antes so guardava
// modo/variavel/camada, e trocar de aba zerava a selecao: escolher uma UC no
// eixo 1, dar uma olhada no eixo 2 e voltar devolvia o mapa ao Brasil inteiro,
// sem aviso. Quem navega entre eixos esta comparando o MESMO lugar.
const RECORTE = ['level', 'zone', 'uf', 'uc', 'site', 'selectedSite'];
const VISUAL  = ['mode', 'variable', 'layer'];

const eixoState = {
  eixo1: { mode: 'datasets', variable: null, layer: 'none',
           level: 'archipelago', zone: null, uf: null, uc: null, site: null,
           selectedSite: null },
  eixo2: { mode: 'pollution', variable: 'Salinity', layer: 'none',
           level: 'archipelago', zone: null, uf: null, uc: null, site: null,
           selectedSite: null },
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
    tDim: 'params',
    cmpOn: false, cmpBy: 'protecao', cmpPick: [], cmpMetrica: 'abundancia',
    txNivel: 'species', txMetrica: 'abund', txTipo: 'linha',
    txSel: null, txBusca: '', txGrupo: null,
    fnMetrica: 'bio', fnTipo: 'linha', fnGrupo: null,
    drawOn: false, drawnSites: null,
    layerMode: 'contorno',
    e2Param: 'Salinity', e4Param: 'DIN',
  });

  buildNav();
  wireTaxaBusca();
  applyLabels();
  renderEixoHeads();
  buildTemporalControls();
  buildDimChips();
  renderCmpBar();
  wireProfile();
  wireLang();

  initMap($('#map'), store, core);

  store.on(['mode', 'variable', 'level', 'zone', 'uf', 'uc', 'site', 'activeDatasets',
            'layer', 'layerMode'], () => {
    renderReadings();
  });
  store.on(['level', 'zone', 'uf', 'uc', 'site', 'layer', 'layerMode'], syncControlValues);
  store.on(['selectedSite', 'level', 'zone', 'uf', 'uc'], renderProfile);
  store.on(['tDataset', 'tType', 'tBenthosDs', 'tDim',
            'cmpOn', 'cmpBy', 'cmpPick', 'cmpMetrica', 'drawnSites',
            'level', 'zone', 'uf', 'uc', 'site'], renderVistaTemporal);
  // Chaves so do painel de taxons: redesenham ele sem refazer a tendencia.
  store.on(['txNivel', 'txMetrica', 'txTipo', 'txSel', 'txBusca', 'txGrupo'],
           renderPainelTaxa);
  store.on(['fnMetrica', 'fnTipo', 'fnGrupo'], renderPainelFuncao);
  store.on(['cmpOn', 'cmpBy', 'cmpPick', 'drawnSites', 'level', 'zone', 'uf', 'uc', 'site'],
           () => { sanearDim(); renderCmpBar(); syncDim(); sincronizarCoresMapa(); });
  store.on(['drawnSites'], () => { renderTrilha(); renderProfile(); renderReadings(); });
  store.on(['level', 'zone', 'uf', 'uc', 'site', 'scope'], () => { syncDim(); renderTrilha(); });
  store.on(['tDataset', 'activeDatasets'], sincronizarDataset);
  // O eixo 2 so se redesenhava ao trocar de aba ou de idioma: mudar o
  // parametro recolorava o mapa (map.js assina `variable`) e deixava o
  // grafico de sitios no parametro anterior, sem aviso. `selectedSite` entra
  // junto porque acende a barra do sitio e recalcula a rosca para ele.
  store.on(['variable', 'selectedSite'], () => {
    if (store.get('eixo') === 'eixo2') renderEixo2();
  });

  showEixo('eixo1');
  syncDim();
  renderTrilha();
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
    const guardar = {};
    for (const k of [...VISUAL, ...RECORTE]) guardar[k] = store.get(k);
    eixoState[prev] = guardar;
  }

  store.set('eixo', id);
  $$('#nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.eixo === id));
  $$('.view').forEach((v) => v.toggleAttribute('data-active', v.id === `view-${id}`));
  document.documentElement.style.setProperty('--eixo', eixoById(id).color);

  const cfg = EIXO_MAP[id];
  const kit = $('#mapkit');
  if (cfg) {
    // O recorte volta como estava; so o que nao faz sentido no novo eixo e
    // descartado. Um sitio de um eixo nao existe necessariamente no outro.
    const saved = { ...eixoState[id] };
    const fonteSitios = (cfg.scope === 'national' && core.national)
      ? core.national.sites : core.sites;
    const existe = (c) => !!c && fonteSitios.some(
      (x) => x.Site === c && cfg.datasets.some((ds) => x[`has_${ds}`]));
    if (!existe(saved.site)) saved.site = null;
    if (!existe(saved.selectedSite)) saved.selectedSite = null;
    if (saved.level === 'site' && !saved.site) saved.level = 'archipelago';

    store.set({
      ...saved,
      scope: cfg.scope ?? 'noronha',
      activeDatasets: cfg.datasets.filter((ds) => ds !== 'benthos_islands' || core.national),
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
  syncDim();
  renderTrilha();
  window.scrollTo?.({ top: 0 });
  $(`#view-${id}`)?.scrollTo?.({ top: 0 });
}

function renderEixo(id) {
  renderReadings();
  if (id === 'eixo1') renderVistaTemporal();
  if (id === 'eixo2') renderEixo2();
  if (id === 'eixo3') renderEixo3();
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
    const lede = e.lede[lg] ?? e.lede.pt;
    const cnts = counters(e.id);
    el.style.setProperty('--eixo', e.color);
    el.innerHTML = `
      <div class="eixo-id">
        ${e.icone ? `<img class="eixo-icone" src="assets/img/eixos/${e.icone}" alt="" width="64" height="64" decoding="async">` : ''}
        <p class="eyebrow">${lg === 'pt' ? 'EIXO' : 'AXIS'} ${e.n}</p>
      </div>
      <h2>${title}</h2>
      ${lede ? `<p class="lede">${lede}</p>` : ''}
      ${cnts.length ? `<div class="counters">${cnts.map((c) =>
        `<div class="counter"><div class="v">${c[0]}</div><div class="k">${c[1]}</div></div>`).join('')}</div>` : ''}
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
  return [];
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
      <label for="f-layer">${nac ? t('f_areas') : t('f_layer')}</label>
      <select class="input" id="f-layer"></select>
    </div>
    ${cfg.datasets.length > 1 ? `<div class="field field--chips">
      <label>${t('f_datasets')}</label>
      <div class="chips" id="f-datasets"></div>
    </div>` : ''}
    ${nac ? `<div class="field field--chips">
      <label>${t('f_ferramentas')}</label>
      <div class="chips">
        <button class="chip chip--toggle" id="f-draw"
          aria-pressed="${store.get('drawOn')}"><span class="dot"></span>${t('draw_on')}</button>
        <button class="chip chip--toggle" id="f-cmp"
          aria-pressed="${store.get('cmpOn')}"><span class="dot"></span>${t('cmp_on')}</button>
      </div>
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
    // Comparando, porem, quem manda na camada e o CRITERIO: trocar de nivel
    // apagava os poligonos de UC no meio de um "dentro x fora".
    const camada = camadaPreferida(lvl, nac);
    const trocou = camada !== store.get('layer');
    store.set({ level: lvl, zone: null, uf: null, uc: null, site: null,
                layer: camada,
                // So volta a contorno se a camada mudou; caso contrario o modo
                // escolhido na mao (generalizar) continua valendo.
                ...(trocou ? { layerMode: 'contorno' } : {}) });
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
  // A chave do <option> e o par camada|modo: uma escolha so na tela, duas
  // informacoes no estado.
  const chaveDe = (o) => `${o.v}|${o.modo ?? 'contorno'}`;
  const atualChave = `${store.get('layer')}|${store.get('layerMode')}`;
  const existe = camadas.some((o) => chaveDe(o) === atualChave);
  if (!existe) store.set({ layer: 'none', layerMode: 'contorno' });
  fillSelect($('#f-layer'),
    camadas.map((o) => ({ v: chaveDe(o), label: optLabel(o) })),
    existe ? atualChave : 'none|contorno');
  $('#f-layer').onchange = (e) => {
    const [camada, modo] = e.target.value.split('|');
    store.set({ layer: camada, layerMode: modo ?? 'contorno' });
  };

  if (cfg.datasets.length > 1) {
    makeChips(
      $('#f-datasets'),
      cfg.datasets.map((ds) => ({ v: ds, label: t(`ds_${ds}`), color: DS_COLOR[ds] })),
      (v) => store.get('activeDatasets').includes(v),
      (v) => {
        const cur = store.get('activeDatasets');
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        if (!next.length) {
          // Desligar o ultimo deixaria o mapa vazio. Antes isso era um return
          // mudo e o chip simplesmente nao reagia; agora o clique vira o
          // oposto util -- isolar esse conjunto -- em vez de nada.
          store.set('activeDatasets', [v]);
          pintarChipsDatasets();
          return;
        }
        store.set('activeDatasets', next);
        // O grafico mostra UM conjunto por vez. Se o que ele mostra acabou de
        // ser desligado no mapa, ele segue para um dos que continuam ligados:
        // ver o mapa sem Peixes e o grafico ainda de peixes era a origem da
        // impressao de que escolher conjunto "nao altera" nada.
        if (!next.includes(store.get('tDataset'))) trocarDatasetDoGrafico(next[0]);
        pintarChipsDatasets();
      }
    );
  }

  const btnCmp = $('#f-cmp');
  if (btnCmp) {
    btnCmp.onclick = () => {
      // Atalho: liga a primeira comparacao que o recorte comporta. A escolha
      // fina do criterio mora nos chips do grafico, onde ela e lida. Ligar a
      // comparacao acende os poligonos: contrastar dentro e fora de UC sem
      // ver onde as UCs estao e pedir um ato de fe.
      const on = !store.get('cmpOn');
      const disp = criteriosDisponiveis();
      const criterio = disp.find((c) => c.v === store.get('cmpBy')) ?? disp[0];
      if (on && !criterio) return;        // nada a comparar neste recorte
      store.set(on
        ? { cmpOn: true, cmpBy: criterio.v, cmpPick: [], tDim: `cmp:${criterio.v}` }
        : { cmpOn: false, tDim: 'params' });
      aplicarCamadaPreferida();
      btnCmp.setAttribute('aria-pressed', on);
      sanearDim();
      renderCmpBar();
      syncDim();
      sincronizarCoresMapa();
    };
  }

  const btnDraw = $('#f-draw');
  if (btnDraw) {
    btnDraw.onclick = () => {
      const on = !store.get('drawOn');
      store.set('drawOn', on);
      btnDraw.setAttribute('aria-pressed', on);
      if (!on) { limparDesenho(); store.set('drawnSites', null); }
      setModoDesenho(on, aplicarDesenho);
    };
  }

  setLegendSlot('#legend');
  syncHierarchy();
}

/**
 * Recebe os sitios circulados e os transforma em recorte.
 *
 * Se o conjunto tem sitios dentro E fora de UC, liga a comparacao por nivel
 * de protecao sozinha: foi para ver esse contraste que a pessoa circulou uma
 * borda de UC, e pedir dois cliques a mais para chegar la seria burocracia.
 */
function aplicarDesenho(codes) {
  if (!codes.length) {
    // Area vazia: o poligano FICA na tela e a leitura explica. Apagar tudo em
    // silencio -- como antes -- deixava a pessoa sem saber se o desenho nao
    // funcionou ou se nao havia sitio ali.
    store.set('drawnSites', null);
    setHTML('#read-e1-map', getLang() === 'pt'
      ? '<strong>Nenhum sítio dentro da área desenhada.</strong> Desenhe em volta dos pontos, ou aproxime o mapa antes.'
      : '<strong>No site inside the drawn area.</strong> Draw around the points, or zoom in first.');
    return;
  }
  // Os niveis sao contados SO entre os sitios que tem peixe -- que e o
  // universo sobre o qual a comparacao opera. Contando todos os desenhados,
  // um conjunto com 7 sitios de peixe (todos em protecao integral) mais
  // sitios so de coral fora de UC parecia misto, a comparacao ligava, e o
  // grafico ficava vazio pedindo "ao menos dois grupos".
  const fonte = core.national?.sites ?? [];
  const comPeixe = codes
    .map((c) => fonte.find((s2) => s2.Site === c))
    .filter((s2) => s2?.has_fish);
  const niveis = new Set(comPeixe.map(nivelProtecao));
  const misto = niveis.size > 1;

  store.set({
    drawnSites: codes,
    // O desenho substitui a hierarquia; deixa-la apontando para um estado
    // enquanto o recorte e outro faria a trilha mentir.
    level: 'archipelago', zone: null, uf: null, uc: null, site: null,
    selectedSite: null,
    ...(misto ? { cmpOn: true, cmpBy: 'protecao', cmpPick: [],
                  tDim: 'cmp:protecao' } : {}),
  });
  if (misto) $('#f-cmp')?.setAttribute('aria-pressed', 'true');
  // Os criterios disponiveis mudam com o conjunto desenhado: duas UCs dentro
  // do poligono fazem aparecer "Por UC" sem que ninguem peca.
  sanearDim();
}

/** Repinta o estado ligado/desligado dos chips de conjunto do mapa. */
function pintarChipsDatasets() {
  const ativos = store.get('activeDatasets');
  $$('#f-datasets .chip').forEach(
    (c) => c.setAttribute('aria-pressed', ativos.includes(c.dataset.v)));
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
  set('#f-layer', `${store.get('layer')}|${store.get('layerMode')}`);
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

  // O desenho tem precedencia, como em siteFilter(). Sem isto a leitura do
  // mapa seguia descrevendo os 363 sitios do pais com a area ja circulada.
  const desenhados = store.get('drawnSites');
  if (desenhados?.length) {
    const dentro = new Set(desenhados);
    return rows.filter((r) => dentro.has(r.Site))
      .filter((r) => activeDatasets.some((ds) => r[`has_${ds}`]));
  }

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
    (v) => trocarDatasetDoGrafico(v, { acenderNoMapa: true }));

  makeChips($('#t-type'),
    [{ v: 'lines', label: getLang() === 'pt' ? 'Linhas' : 'Lines', color: '#5a6a8a' },
     { v: 'area',  label: getLang() === 'pt' ? 'Área 100%' : '100% area', color: '#5a6a8a' }],
    (v) => store.get('tType') === v,
    (v) => {
      store.set('tType', v);
      $$('#t-type .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
    });
}

// ---------------------------------------------------------------------------
// Serie do lugar selecionado
//
// Sem recorte, a serie de peixes e estratificada por REGIAO e nunca agregada
// (a composicao geografica do "Brasil" muda a cada ano). Com um lugar
// escolhido essa estratificacao perde sentido -- sobra uma regiao so -- e o
// que interessa passa a ser o que acontece DENTRO dele: quais familias ou
// especies dominam, e como riqueza e abundancia se movem no tempo.
// ---------------------------------------------------------------------------

const PARAMS = [
  { v: 'abundancia', k: 'p_abundancia' },
  { v: 'riqueza',    k: 'p_riqueza' },
  { v: 'familias',   k: 'p_familias' },
  { v: 'censos',     k: 'p_censos' },
];

/** Ha um lugar escolhido (regiao, estado, UC ou sitio)? */
const temRecorte = () => siteFilter().length > 0;

/** A dimensao so se aplica a peixes; coral e bentos ja respondem ao recorte. */
const dimAplicavel = () => store.get('tDataset') === 'fish' && temRecorte();

/** Metricas do conjunto ativo. */
const metricasDe = (ds = store.get('tDataset')) => CMP_METRICAS[ds] ?? CMP_METRICAS.fish;

/**
 * Chips da vista temporal. Sao reconstruidos a cada mudanca de recorte porque
 * as opcoes de COMPARACAO dependem do que o recorte contem: um poligono sobre
 * duas UCs ganha "Por UC"; sobre uma so, nao. Antes a comparacao exigia achar
 * um botao no mapa -- agora ela e uma das vistas do proprio grafico.
 */
function buildDimChips() {
  const ds = store.get('tDataset');
  const met = metricasDe(ds);
  makeChips($('#t-metrica'),
    met.map((o) => ({ v: o.v, label: t(o.k), color: '#5a6a8a' })),
    (v) => store.get('cmpMetrica') === v,
    (v) => {
      store.set('cmpMetrica', v);
      $$('#t-metrica .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
      syncDim();   // o seletor de tipo depende da metrica escolhida
    });

  // A lista sempre abre com a vista PADRAO daquele conjunto. Sem ela, o
  // saneamento nao achava opcao valida e caia no primeiro chip -- que era uma
  // comparacao -- ligando a comparacao sozinha ao abrir o painel.
  const base = (ds === 'fish' && temRecorte())
    ? [{ v: 'params',  label: t('dim_params') },
       { v: 'family',  label: t('dim_family') },
       { v: 'species', label: t('dim_species') }]
    // Sempre "Visao geral": chamar a vista padrao de peixes de "Por regiao"
    // duplicava o rotulo do criterio `cmp:region`, que esta logo ao lado.
    : [{ v: 'geral', label: t('dim_geral') }];
  const comparacoes = criteriosDisponiveis()
    .map((c) => ({ v: `cmp:${c.v}`, label: t(`cmp_dim_${c.v}`), cmp: true }));

  makeChips($('#t-dim'),
    [...base, ...comparacoes].map((o) => ({
      v: o.v, label: o.label, color: o.cmp ? '#982263' : '#5a6a8a' })),
    (v) => store.get('tDim') === v,
    (v) => {
      const criterio = v.startsWith('cmp:') ? v.slice(4) : null;
      store.set({
        tDim: v,
        // Ligar a comparacao pelo grafico e o mesmo estado de liga-la pelo
        // mapa: uma chave so, para que mapa e grafico nao discordem.
        cmpOn: !!criterio,
        ...(criterio ? { cmpBy: criterio, cmpPick: [] } : {}),
      });
      $$('#t-dim .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
      $('#f-cmp')?.setAttribute('aria-pressed', !!criterio);
      if (criterio) aplicarCamadaPreferida();
      renderCmpBar();
      syncDim();
      sincronizarCoresMapa();
    });
}

/** Mostra/esconde as linhas de chips conforme o recorte e a dimensao. */
function syncDim() {
  const dim = $('#t-dim');
  if (!dim) return;
  // A dimensao fica VISIVEL em comparacao: e por ela que se troca de criterio
  // ou se volta para a vista do conjunto. Esconde-la obrigava a ir ao mapa
  // para desfazer o que foi ligado no grafico.
  dim.hidden = $$('#t-dim .chip').length === 0;

  const comparando = comparandoDeFato();
  // A metrica tambem vale na vista nacional por regiao (peixes sem recorte): e
  // ali que biomassa, tamanho e nivel trofico aparecem pela primeira vez. Nas
  // vistas parametros/familias/especies de um recorte ela nao se aplica.
  const peixeNacional = store.get('tDataset') === 'fish' && !temRecorte() && !comparando;
  const met = $('#t-metrica');
  if (met) met.hidden = !(comparando || peixeNacional);

  // "Linhas / Area 100%" nao se aplica nem a comparacao (uma metrica, varios
  // grupos) nem a vista de parametros (unidades diferentes num eixo so) nem a
  // metricas que nao sao partes de um todo (so a abundancia compoe 100%).
  const tipo = $('#t-type');
  if (tipo) {
    tipo.hidden = comparando || store.get('tDim') === 'params'
      || (peixeNacional && metricaPeixe().v !== 'abundancia');
  }
}

/** Trilha do recorte: o que esta selecionado, e como voltar. */
function renderTrilha() {
  const el = $('#trilha');
  if (!el) return;
  const { level, zone, uf, uc, site, scope } = store.state;
  const nac = scope === 'national' && core.national;
  const fonte = nac ? core.national.sites : core.sites;

  const desenhados = store.get('drawnSites');
  if (desenhados?.length) {
    const pt = getLang() === 'pt';
    el.innerHTML = `<span class="trilha-raiz">${pt ? 'Área desenhada' : 'Drawn area'}</span>`
      + `<span class="trilha-sep">\u203a</span>`
      + `<span class="trilha-passo">${plural(desenhados.length, pt ? 'sítio' : 'site')}</span>`
      + `<button class="trilha-limpar" id="trilha-limpar">${t('limpar_recorte')}</button>`;
    $('#trilha-limpar').onclick = () => {
      limparDesenho();
      store.set({ drawnSites: null, cmpOn: false });
      $('#f-cmp')?.setAttribute('aria-pressed', 'false');
      syncHierarchy();
    };
    return;
  }

  const passos = [];
  if (zone) passos.push(nac ? regionLabel(zone)
    : (fonte.find((s) => s.zone === zone)?.zone_label ?? zone));
  if (uf) passos.push(tituloUF(fonte.find((s) => s.uf === uf)?.uf_nome ?? uf));
  if (uc) passos.push(uc);
  if (site) passos.push(fonte.find((s) => s.Site === site)?.site_label ?? site);

  const raiz = nac ? t('recorte_brasil') : t('lvl_archipelago');
  if (!passos.length) {
    el.innerHTML = `<span class="trilha-raiz">${raiz}</span>`;
    return;
  }
  el.innerHTML = `<span class="trilha-raiz">${raiz}</span>`
    + passos.map((p) => `<span class="trilha-sep">\u203a</span><span class="trilha-passo">${p}</span>`).join('')
    + `<button class="trilha-limpar" id="trilha-limpar">${t('limpar_recorte')}</button>`;
  $('#trilha-limpar').onclick = () => {
    const camada = nac ? 'none' : store.get('layer');
    store.set({ level: 'archipelago', zone: null, uf: null, uc: null,
                site: null, selectedSite: null, layer: camada });
    syncHierarchy();
  };
}

/**
 * Uma linha por GRUPO comparado, para uma metrica so.
 *
 * Com varios grupos o eixo nao comporta mais de uma grandeza -- por isso a
 * metrica e escolhida, e nao todas de uma vez como na vista de parametros.
 * O resumo entre sitios e a MEDIANA, pelo mesmo motivo de la: um sitio
 * atipico levantaria o ano inteiro do grupo.
 */
/**
 * Metrica de PEIXES escolhida no grafico principal (chips `#t-metrica`). Vale
 * para a vista nacional por regiao e para a comparacao; nas vistas
 * parametros/familias/especies de um recorte ela nao se aplica.
 */
function metricaPeixe() {
  const met = metricasDe('fish');
  return met.find((o) => o.v === store.get('cmpMetrica')) ?? met[0];
}

/** Rotulo da metrica de peixes com a unidade que a torna legivel. */
function rotuloMetricaPeixe(spec) {
  const pt = getLang() === 'pt';
  if (spec.v === 'abundancia') return pt ? 'Indivíduos por censo' : 'Individuals per census';
  const un = { bio: pt ? 'kg por censo de 40 m²' : 'kg per 40 m² census',
               len: pt ? 'comprimento total, cm' : 'total length, cm' }[spec.v];
  return un ? `${t(spec.k)} (${un})` : t(spec.k);
}

/**
 * Valor de cada sitio-ano de peixe para a metrica `spec`. As quatro primeiras
 * (abundancia, riqueza, familias, censos) saem de `reef_fish_year`, que ja esta
 * no boot; as funcionais (biomassa, tamanho, nivel trofico) de `reef_fish_func`,
 * sob demanda. Um so ponto de verdade, usado pela vista nacional e pela comparacao.
 */
async function valoresPeixe(spec) {
  if (spec.func) {
    const tab = await loadTable('reef_fish_func');
    return tab.map((r) => ({ site_id: r.site_id, year: r.year, n_events: r.n_events,
                             total: null, value: r[spec.func.col] }));
  }
  return (core.reef_fish_year ?? []).map((r) => {
    const ev = r.n_events;
    const value = spec.v === 'abundancia' ? (ev ? r.total_abundance / ev : null)
                : spec.v === 'riqueza'    ? r.richness
                : spec.v === 'familias'   ? r.n_families
                : ev;
    return { site_id: r.site_id, year: r.year, n_events: ev, total: r.total_abundance, value };
  });
}

async function renderTemporalComparacao() {
  const eu = temporalToken;
  const ds = store.get('tDataset');
  if (!store.get('cmpOn') || !criterioAtivo() || !CMP_DATASETS.includes(ds)) return false;
  const grupos = gruposAtivos();
  // Um grupo so nao e comparacao. Em vez de esvaziar o grafico, devolve o
  // lugar para a vista normal do recorte -- havia dado para mostrar o tempo
  // todo, e apaga-lo era a falha, nao a ausencia de dado.
  if (grupos.length < 2) return false;

  const criterio = criterioAtivo() ?? store.get('cmpBy');
  const alvos = new Map();           // site -> grupo
  for (const s of sitiosDoRecorte(ds)) {
    const k = chaveCmp(s, criterio);
    if (grupos.some((g) => g.v === k)) alvos.set(s.Site, k);
  }

  const met = metricasDe(ds);
  const spec = met.find((o) => o.v === store.get('cmpMetrica')) ?? met[0];

  // Corais e peixes vem de tabelas diferentes, com nomes de coluna proprios.
  let fonte, valor;
  if (ds === 'coral') {
    fonte = core.coral_sy ?? [];
    valor = (r) => (spec.v === 'coral_riqueza' ? r.n_species : r.n_eventos);
  } else {
    fonte = await valoresPeixe(spec);
    valor = (r) => r.value;
  }
  // Uma renderizacao mais nova assumiu enquanto a tabela chegava.
  if (eu !== temporalToken) return true;
  const rows = fonte
    .filter((r) => alvos.has(r.site_id))
    .map((r) => ({ Site: r.site_id, Year: r.year,
                   group: alvos.get(r.site_id), value: valor(r) }))
    .filter((r) => Number.isFinite(r.value));

  const pt = getLang() === 'pt';
  const nomes = (g) => rotuloCmp(g, criterio);
  const sub = `${ds === 'fish' ? rotuloMetricaPeixe(spec) : t(spec.k)} — ${pt ? 'mediana entre sítios de cada grupo' : 'median across sites in each group'}`;
  $('#trend-sub').textContent = sub;
  $('#heat-sub').textContent = sub;
  showTaxonCard(false);

  const avisos = avisosComparacao(grupos);
  const resumo = grupos
    .map((g) => `<strong>${nomes(g.v)}</strong> (${plural(g.sitios, pt ? 'sítio' : 'site')})`)
    .join(pt ? ' contra ' : ' vs ');
  setHTML('#read-e1-time',
    (pt ? `Comparando ${resumo}, em ${t(spec.k).toLowerCase()}.` : `Comparing ${resumo}, by ${t(spec.k).toLowerCase()}.`)
    + avisos.map((a) => `<span class="nota">${a}</span>`).join(''));

  if (!rows.length) { chart('chart-trend')?.clear(); chart('chart-heat')?.clear(); return true; }

  const cores = coresCmp(grupos);
  const fm = spec.func ?? {};
  chart('chart-trend')?.setOption(multiParamOption(rows, {
    ordem: grupos.map((g) => g.v),
    rotulo: { serie: nomes },
    cores: grupos.map((g) => cores.get(g.v)),
    unidade: fm.unidade ?? '', casas: fm.casas ?? 1, escala: !!fm.escala,
  }), true);
  chart('chart-heat')?.setOption(
    heatmapOption(rows, RAMP.fish, fm.unidade ?? '', nomes, { escala: !!fm.escala }), true);
  return true;
}

/**
 * Serie dentro do recorte. Devolve `true` se tratou o caso; `false` deixa o
 * fluxo antigo (estratificacao por regiao) seguir.
 */
async function renderTemporalRecorte() {
  if (!dimAplicavel()) return false;
  const eu = temporalToken;

  const alvoBruto = siteFilter();
  // Os peixes de Noronha so vem das tabelas nativas quando NAO ha ReefSYN
  // (ver `usaPeixesNativos`). Antes se somavam as duas fontes, sob a premissa
  // de que "as do ReefSYN nao os contem" -- e contem: sao os mesmos censos.
  const alvoReef = new Set(alvoBruto.filter((c) => !c.startsWith('N_')));
  const alvoNor  = usaPeixesNativos()
    ? new Set(alvoBruto.filter((c) => c.startsWith('N_')).map((c) => c.slice(2)))
    : new Set();

  // `tDim` pode valer `geral` (a vista padrao de corais e bentos) ou uma
  // comparacao por um instante, ate `sanearDim` corrigir. Qualquer coisa fora
  // das tres vistas do recorte e tratada como a padrao: antes caia no ramo de
  // especies e a leitura automatica imprimia "8 undefined".
  const dim = ['params', 'family', 'species'].includes(store.get('tDim'))
    ? store.get('tDim') : 'params';

  // Especie por ano so existe em Noronha. Na escala nacional a tabela por ano
  // registra FAMILIA; nao ha site x ano x especie. Dizemos isso e caimos em
  // familia, em vez de desenhar um grafico vazio sem explicacao.

  let rows = [], unit = '', sub = '', nomes = (g) => g;

  if (dim === 'params') {
    // Os quatro parametros juntos, uma cor por linha. Cada linha de um sitio
    // vira quatro linhas de dados, uma por parametro.
    const valorDe = (r, v) => {
      const ev = r.n_events;
      if (v === 'abundancia') return ev ? r.total_abundance / ev : null;
      if (v === 'riqueza')    return r.richness;
      if (v === 'familias')   return r.n_families;
      return ev;
    };
    const expandir = (r, Site, Year) => PARAMS.map((o) => ({
      Site, Year, group: o.v, value: valorDe(r, o.v),
    }));
    rows = [
      ...(core.reef_fish_year ?? [])
        .filter((r) => alvoReef.has(r.site_id))
        .flatMap((r) => expandir(r, r.site_id, r.year)),
      ...(core.fish_year ?? [])
        .filter((r) => alvoNor.has(r.Site))
        .flatMap((r) => expandir(r, `N_${r.Site}`, r.Year)),
    ].filter((r) => Number.isFinite(r.value));
    // Conta os sitios que ENTRARAM no grafico, nao os do recorte: um recorte
    // alcanca sitios de coral e de bentos, que nao tem linha de peixe nenhuma
    // aqui. Dizer "186 sitios" com 98 series desenhadas descreve outra coisa.
    const comDado = new Set(rows.map((r) => r.Site)).size;
    sub = comDado > 1
      ? (getLang() === 'pt' ? `Mediana entre ${comDado} sítios, por ano`
                            : `Median across ${comDado} sites, per year`)
      : (getLang() === 'pt' ? 'Valores do sítio, por ano'
                            : 'Site values, per year');
  } else if (dim === 'family') {
    const reef = alvoReef.size ? await loadTable('reef_fish_comp') : [];
    if (eu !== temporalToken) return true;
    rows = [
      ...reef
        .filter((r) => alvoReef.has(r.site_id))
        .map((r) => ({ Site: r.site_id, Year: r.year, group: r.family, value: r.proportion })),
      ...(core.fish_comp ?? [])
        .filter((r) => alvoNor.has(r.Site))
        .map((r) => ({ Site: `N_${r.Site}`, Year: r.Year,
                       group: r.family_label, value: r.proportion })),
    ].filter((r) => Number.isFinite(r.value));
    rows = apenasTopGrupos(rows, 8);
    unit = '%';
    sub = getLang() === 'pt'
      ? 'Participação de cada família na abundância (%) — 8 maiores'
      : 'Each family\u2019s share of abundance (%) — 8 largest';
  } else {
    // As duas fontes cobrem as especies mais abundantes de cada uma (120 no
    // ReefSYN); uma especie rara pode nao aparecer aqui mesmo tendo registro.
    const reef = alvoReef.size ? await loadTable('reef_fish_year_sp') : [];
    const nor  = alvoNor.size  ? await loadTable('fish_year_sp') : [];
    if (eu !== temporalToken) return true;
    rows = [
      ...reef
        .filter((r) => alvoReef.has(r.site_id))
        .map((r) => ({ Site: r.site_id, Year: r.year, group: r.species,
                       value: r.n_events ? r.total_abundance / r.n_events : null })),
      ...nor
        .filter((r) => alvoNor.has(r.Site))
        .map((r) => ({ Site: `N_${r.Site}`, Year: r.Year, group: r.taxon_label,
                       value: r.mean_abundance })),
    ].filter((r) => Number.isFinite(r.value));
    rows = apenasTopGrupos(rows, 8);
    sub = getLang() === 'pt'
      ? 'Indivíduos por censo, por espécie — 8 mais abundantes'
      : 'Individuals per census, by species — 8 most abundant';
  }

  setHTML('#read-e1-time', leituraRecorte(rows, dim));
  $('#trend-sub').textContent = sub;
  $('#heat-sub').textContent = sub;
  showTaxonCard(false);

  if (!rows.length) { chart('chart-trend')?.clear(); chart('chart-heat')?.clear(); return true; }

  if (dim === 'params') {
    const rotuloParam = (v) => t(PARAMS.find((o) => o.v === v)?.k ?? v);
    chart('chart-trend')?.setOption(multiParamOption(rows, {
      ordem: PARAMS.map((o) => o.v),
      rotulo: { serie: rotuloParam },
    }), true);
    // O mapa de calor compara grupos na MESMA unidade; com quatro parametros
    // de escalas diferentes ele coloriria so a abundancia. Fica com a riqueza,
    // que e a leitura que o mapa de calor responde bem.
    chart('chart-heat')?.setOption(heatmapOption(
      rows.filter((r) => r.group === 'riqueza'), RAMP.fish, '', () => t('p_riqueza')), true);
    return true;
  }

  chart('chart-trend')?.setOption(
    trendOption(rows, { type: store.get('tType'), unit, nameOf: nomes }), true);
  chart('chart-heat')?.setOption(
    heatmapOption(rows, RAMP.fish, unit, nomes), true);
  return true;
}

/** Mantem so os N grupos de maior soma; o resto viraria rabo ilegivel. */
function apenasTopGrupos(rows, n) {
  const tot = [...groupBy(rows, 'group')]
    .map(([g, rs]) => [g, sum(rs.map((r) => r.value))])
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
  const manter = new Set(tot);
  return rows.filter((r) => manter.has(r.group));
}

const plural = (n, sing, plur) => `${fmtInt(n)} ${n === 1 ? sing : (plur ?? sing + 's')}`;

/** Uma frase sobre o que a serie do recorte mostra. */
function leituraRecorte(rows, dim) {
  if (!rows.length) {
    return getLang() === 'pt'
      ? 'Sem série temporal para este recorte.'
      : 'No time series for this selection.';
  }
  const anos = uniq(rows.map((r) => r.Year)).sort((a, b) => a - b);
  const grupos = uniq(rows.map((r) => r.group));
  const sitios = uniq(rows.map((r) => r.Site));
  const pt = getLang() === 'pt';
  const o = { params: pt ? 'parâmetros' : 'parameters',
              family: pt ? 'famílias' : 'families',
              species: pt ? 'espécies' : 'species' }[dim];
  return pt
    ? `${anos[0]}\u2013${anos[anos.length - 1]} em ${plural(sitios.length, 'sítio', 'sítios')}, `
      + `${grupos.length} ${o}.`
    : `${anos[0]}\u2013${anos[anos.length - 1]} across ${sitios.length} site(s), `
      + `${grupos.length} ${o}.`;
}

/**
 * Troca o conjunto mostrado no grafico. Com `acenderNoMapa`, garante que esse
 * conjunto tambem esteja visivel no mapa: pedir a serie de Corais e nao ver
 * ponto de coral nenhum era incoerente, porque os dois controles mexiam em
 * chaves separadas (`tDataset` e `activeDatasets`) e nunca se falavam.
 */
/** Garante que a metrica escolhida existe no conjunto ativo. */
function sanearMetrica() {
  const met = metricasDe();
  if (!met.some((o) => o.v === store.get('cmpMetrica'))) {
    store.set('cmpMetrica', met[0].v);
  }
}

function trocarDatasetDoGrafico(v, { acenderNoMapa = false } = {}) {
  // Trocar de conjunto invalida os taxons escolhidos: os nomes nao se
  // sobrepoem entre bentos e peixes.
  const patch = { tDataset: v, tTaxa: [] };
  if (acenderNoMapa) {
    const ativos = store.get('activeDatasets');
    if (!ativos.includes(v)) patch.activeDatasets = [...ativos, v];
  }
  store.set(patch);
  pintarChipsDatasets();
}

/**
 * Repinta os chips do grafico a partir do estado. E uma ASSINATURA, nao uma
 * chamada imperativa dentro do seletor: assim quem trocar `tDataset` acerta a
 * interface sozinho -- inclusive o clique num marcador do mapa, que vive em
 * outro modulo e nao tem como repintar chips daqui.
 */
function sincronizarDataset() {
  const v = store.get('tDataset');
  sanearMetrica();
  sanearDim();
  $$('#t-dataset .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === v));
  pintarChipsDatasets();
  syncBenthosSources();
  syncDim();
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
      renderVistaTemporal();
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
  // O conjunto desenhado manda: e o recorte mais especifico que existe, e
  // cruza-lo com a hierarquia devolveria menos do que a pessoa circulou.
  const desenhados = store.get('drawnSites');
  if (desenhados?.length) return desenhados;
  if (level === 'site' && site) return [site];
  if (level === 'uf'   && uf)   return fonte.filter((s) => s.uf === uf).map((s) => s.Site);
  if (level === 'uc'   && uc)
    return fonte.filter((s) => (s.ucs ?? []).some((x) => x.nome === uc)).map((s) => s.Site);
  if (level === 'zone' && zone) return fonte.filter((s) => s.zone === zone).map((s) => s.Site);
  return [];
}

/**
 * A vista temporal inteira: a tendencia por grupo e o painel de taxons.
 * `renderTemporal` tem varios `return` pelo meio -- chamar o painel no fim
 * dela o deixaria de fora em quase todos os caminhos.
 */
async function renderVistaTemporal() {
  await renderTemporal();
  await renderPainelFuncao();
  await renderPainelTaxa();
}

/**
 * Cada chamada de `renderTemporal` invalida as anteriores. A vista de
 * especies/familias espera uma tabela (`await loadTable`) e termina DEPOIS da
 * de parametros, que nao espera nada -- entao uma renderizacao velha sobrescrevia
 * a nova: o chip dizia "Parametros" e o grafico mostrava especies.
 */
let temporalToken = 0;

async function renderTemporal() {
  if (store.get('eixo') !== 'eixo1') return;
  ++temporalToken;
  const ds = store.get('tDataset');

  // Comparacao vem primeiro: quando ha grupos para contrastar, e isso que a
  // pessoa pediu para ver, e nao a serie agregada do recorte.
  if (await renderTemporalComparacao()) return;

  // Com um lugar escolhido, a serie passa a ser DELE. Isso vem antes da
  // estratificacao por regiao porque, dentro de um recorte, a regiao e
  // constante: a serie "por regiao" de um sitio e uma linha so, inutil.
  if (await renderTemporalRecorte()) return;

  // O peixe nacional é estratificado por REGIÃO, nunca agregado. A composição
  // geográfica do "Brasil" muda a cada ano — o Rio é 44% dos censos e a única
  // região presente de 2001 a 2005 — então uma linha nacional única mostraria
  // geografia disfarçada de tendência.
  if (core.national) {
    if (ds === 'fish')  return await renderTemporalNacional();
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
async function renderTemporalNacional() {
  const eu = temporalToken;
  const spec = metricaPeixe();
  const abund = spec.v === 'abundancia';
  const regiao = new Map(core.national.sites.map((s) => [s.Site, s.region]));
  const linhas = await valoresPeixe(spec);
  if (eu !== temporalToken) return;           // uma renderizacao mais nova assumiu

  const rows = linhas.map((r) => ({
    Site: r.site_id, Year: r.year,
    group: regiao.get(r.site_id) ?? '—',
    value: r.value, n_events: r.n_events, total: r.total,
  })).filter((r) => Number.isFinite(r.value));

  const alvo = siteFilter();
  const rs = alvo.length ? rows.filter((r) => alvo.includes(r.Site)) : rows;

  setHTML('#read-e1-time', readE1Nacional(rs, regionLabel, { abundancia: abund }));
  const fm = spec.func ?? {};
  const rotuloM = rotuloMetricaPeixe(spec);
  const sub = getLang() === 'pt'
    ? `${rotuloM}, por região — nunca agregado em uma linha só`
    : `${rotuloM}, by region — never pooled into a single line`;
  $('#trend-sub').textContent = sub;
  $('#heat-sub').textContent = sub;
  showTaxonCard(false);

  if (!rs.length) { chart('chart-trend')?.clear(); chart('chart-heat')?.clear(); return; }
  chart('chart-trend')?.setOption(
    // "Area 100%" so faz sentido para a abundancia (partes de um todo); biomassa,
    // tamanho e nivel trofico sao sempre linhas.
    trendOption(rs, { type: abund ? store.get('tType') : 'lines', unit: fm.unidade ?? '',
                      nameOf: regionLabel, escala: !!fm.escala }), true);
  chart('chart-heat')?.setOption(
    heatmapOption(rs, RAMP.fish, fm.unidade ?? '', regionLabel, { escala: !!fm.escala }), true);
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
// Painel de táxons
//
// Responde a pergunta que a tendência por grupo não respondia: *dentro destes
// sítios, como vão estas espécies (ou estas famílias)?* Dois modos —
//
//   Linha    série no tempo, mediana entre sítios
//   Boxplot  distribuição ENTRE sítios, uma caixa por (táxon × grupo)
//
// e é o boxplot que compara dentro contra fora de UC: cada caixa é um grupo,
// cada observação é um sítio, e o valor do sítio é a média dele ao longo dos
// anos amostrados.
// ---------------------------------------------------------------------------

/** Conjuntos com tabela de táxon por sítio-ano. */
const TX_DATASETS = ['fish', 'coral'];

// Sentinelas: a seleção inteira como categoria única (métrica `pres`) e o
// grupo único quando não há critério de agrupamento.
//
// Usam \u0002 porque as chaves compostas abaixo são juntadas com \u0000 e
// \u0001 -- sentinela com o mesmo caractere do separador fazia o `split`
// devolver o pedaço errado, e o boxplot chegava ao ECharts com célula nula.
const TX_SEL  = '\u0002sel';
const TX_TUDO = '\u0002tudo';

const txNiveis   = (ds = store.get('tDataset')) => TX_NIVEIS[ds] ?? [];
/**
 * Metricas do painel de taxons. As funcionais saem da lista quando nao se
 * aplicam: sem as tabelas funcionais (site sem ReefSYN) e, no caso do nivel
 * trofico, quando o nivel e ESPECIE -- o de uma especie e um traco fixo e a
 * "serie" seria uma reta.
 */
const txMetricas = (ds = store.get('tDataset'), nivel = store.get('txNivel')) =>
  (TX_METRICAS[ds] ?? []).filter((m) =>
    (!m.func || core.reef_func_meta) && (!m.soNivel || m.soNivel === nivel));

/** Nível válido para o conjunto: corais não têm família. */
function txNivel() {
  const op = txNiveis().map((o) => o.v);
  const atual = store.get('txNivel');
  return op.includes(atual) ? atual : (op[0] ?? 'species');
}

/** Métrica válida: `abund` não existe em coral (ver TX_METRICAS). */
function txMetrica() {
  const op = txMetricas(store.get('tDataset'), txNivel()).map((o) => o.v);
  const atual = store.get('txMetrica');
  return op.includes(atual) ? atual : (op[0] ?? 'abund');
}

/** Rotulo da metrica do painel de taxons, com a unidade das funcionais. */
function rotuloMetricaTx(ds, nivel, metrica) {
  const pt = getLang() === 'pt';
  const m = txMetricas(ds, nivel).find((o) => o.v === metrica);
  const un = { bio: pt ? 'kg por censo de 40 m²' : 'kg per 40 m² census',
               len: pt ? 'comprimento total, cm' : 'total length, cm' }[metrica];
  return un ? `${t(m.k)} (${un})` : t(m.k);
}

/**
 * Critério de agrupamento do painel. Segue o da comparação quando há uma
 * ligada — mapa, tendência e boxplot falando do mesmo corte — e senão cai no
 * nível de proteção, que é o corte que a pergunta "dentro ou fora da UC"
 * pede. `null` quando o recorte não se divide de jeito nenhum.
 */
function grupoAtivo(chave, { regionalSemRecorte = false } = {}) {
  const disp = criteriosDisponiveis().map((c) => c.v);
  if (!disp.length) return null;
  const guardado = store.get(chave);
  if (guardado === 'none') return null;
  if (guardado && disp.includes(guardado)) return guardado;
  const cmp = criterioAtivo();
  if (cmp) return cmp;
  // Sem recorte, o painel mostra o PAIS. Uma mediana nacional unica mistura
  // regioes cuja presenca muda de ano para ano, entao o padrao e uma linha por
  // regiao -- a mesma regra da tendencia por grupo, que nunca agrega.
  if (regionalSemRecorte && !temRecorte() && disp.includes('region')) return 'region';
  return disp.includes('protecao') ? 'protecao' : disp[0];
}
const txGrupoAtivo = () => grupoAtivo('txGrupo');

/** Limites de grupos nos paineis com caixa ou linha por grupo. */
const GRUPOS_MAX = 4;
const GRUPOS_MIN_CAIXA = 3;

/**
 * Quais grupos entram, em que ordem, e quem fica de fora.
 *
 * Medido num poligono sobre o Sudeste: "Por UC" achava OITO unidades, cinco
 * delas com 1 a 3 sitios. Vinte e quatro caixas nao se leem, e um grupo de um
 * sitio nao tem quartil nenhum -- a "caixa" e o proprio ponto. Ficam os quatro
 * maiores, e no boxplot so os que tem tres sitios ou mais; o que sobrou de
 * fora e nomeado na nota, nunca sumido em silencio.
 *
 * `usaGrupos` falso quando o grafico nao mostra grupo nenhum: agrupar FILTRA,
 * e filtrar sem mostrar descartava sitios do recorte em troca de nada.
 */
function resolverGrupos({ ds, criterio, usaGrupos, box }) {
  const grupoDe = new Map();      // sitio -> grupo
  const tamanho = new Map();      // grupo -> n de sitios, decide quem entra
  if (criterio && usaGrupos) {
    for (const s of sitiosDoRecorte(ds)) {
      const k = chaveCmp(s, criterio);
      if (k === null) continue;   // sitio sem UC conhecida, por exemplo
      grupoDe.set(s.Site, k);
      tamanho.set(k, (tamanho.get(k) ?? 0) + 1);
    }
  }
  const descartados = [];
  let ordem = [...tamanho.keys()].sort((a, b) => tamanho.get(b) - tamanho.get(a));
  if (box) {
    for (const g of ordem) if (tamanho.get(g) < GRUPOS_MIN_CAIXA) descartados.push(g);
    ordem = ordem.filter((g) => tamanho.get(g) >= GRUPOS_MIN_CAIXA);
  }
  descartados.push(...ordem.slice(GRUPOS_MAX));
  ordem = ordem.slice(0, GRUPOS_MAX);
  // Um grupo so nao e comparacao: volta a ser o conjunto inteiro.
  if (ordem.length < 2) { ordem = []; descartados.length = 0; }
  // Protecao tem ordem propria (integral -> sustentavel -> fora); os demais
  // ficam em ordem alfabetica do rotulo, nao da chave crua.
  ordem.sort((a, b) => (criterio === 'protecao'
    ? PROTECAO.indexOf(a) - PROTECAO.indexOf(b)
    : String(rotuloCmp(a, criterio)).localeCompare(String(rotuloCmp(b, criterio)), 'pt')));

  const grupos = ordem.length ? ordem : [TX_TUDO];
  // Sitio de grupo descartado sai da conta inteira, nao so do desenho: deixa-lo
  // nas celulas inflaria o "N sitios entraram" com sitios que nao aparecem em
  // caixa nenhuma.
  const mantidos = new Set(ordem);
  const grupoDoSitio = (site) => {
    if (!ordem.length) return TX_TUDO;
    const g = grupoDe.get(site);
    return mantidos.has(g) ? g : null;
  };
  return {
    ordem, grupos, grupoDoSitio, descartados, tamanho,
    nomeGrupo: (g) => (g === TX_TUDO ? t('tx_selecao') : rotuloCmp(g, criterio)),
    cores: grupos.map((_, i) => CMP_CORES[i % CMP_CORES.length]),
  };
}

/**
 * Valores para o boxplot: UMA observacao por sitio, a media dele ao longo dos
 * anos amostrados. A caixa descreve a variacao ENTRE sitios, que e o que
 * sustenta "dentro contra fora"; a variacao entre anos entra como a media.
 * Devolve Map `categoria\0grupo` -> [valor por sitio].
 */
function valoresPorSitio(celulas, categorias, grupoDoSitio, valorFn) {
  const porSitio = new Map();     // categoria|grupo|sitio -> [valores anuais]
  for (const c of celulas) {
    const g = grupoDoSitio(c.Site);
    for (const cat of categorias) {
      const v = valorFn(c, cat);
      if (!Number.isFinite(v)) continue;
      const k = `${cat}\u0001${g}\u0001${c.Site}`;
      if (!porSitio.has(k)) porSitio.set(k, []);
      porSitio.get(k).push(v);
    }
  }
  const valores = new Map();
  for (const [k, vs] of porSitio) {
    const [cat, g] = k.split('\u0001');
    const kk = `${cat}\u0000${g}`;
    if (!valores.has(kk)) valores.set(kk, []);
    valores.get(kk).push(sum(vs) / vs.length);
  }
  return valores;
}

/** Partes da nota sobre grupos: quantos sitios cada um tem, quem saiu, quem e pequeno. */
function notaGrupos({ celulas, grupos, criterio, grupoDoSitio, nomeGrupo, descartados, tamanho }) {
  const pt = getLang() === 'pt';
  const partes = [];
  if (!criterio || grupos.length < 2) return partes;

  const porGrupo = new Map();
  for (const c of celulas) {
    const g = grupoDoSitio(c.Site);
    if (g === null || g === undefined) continue;
    if (!porGrupo.has(g)) porGrupo.set(g, new Set());
    porGrupo.get(g).add(c.Site);
  }
  const resumo = grupos
    .map((g) => `<strong>${nomeGrupo(g)}</strong> ${fmtInt(porGrupo.get(g)?.size ?? 0)}`)
    .join(' · ');
  partes.push(pt ? `Sítios por grupo: ${resumo}.` : `Sites per group: ${resumo}.`);

  if (descartados.length) {
    const fora = descartados
      .map((g) => `${nomeGrupo(g)} (${fmtInt(tamanho.get(g) ?? 0)})`)
      .join(', ');
    partes.push(`<span class="nota">${pt
      ? `Ficaram de fora, por serem pequenos demais ou por não caberem nos quatro maiores: ${fora}.`
      : `Left out, as too small or beyond the four largest: ${fora}.`}</span>`);
  }

  // So a protecao se confunde com a geografia: estado, regiao e UC SAO lugares,
  // e avisar que "parte do contraste e geografia" ali seria tautologia.
  if (criterio === 'protecao') {
    const desenho = !!store.get('drawnSites')?.length;
    const { level, zone } = store.state;
    const nacional = desenho || level === 'archipelago' || (level === 'zone' && !zone);
    const a = nacional ? avisoGeografia('protecao', grupos, { desenho }) : null;
    if (a) partes.push(`<span class="nota">${a}</span>`);
  }

  const menor = Math.min(...grupos.map((g) => porGrupo.get(g)?.size ?? 0));
  if (menor < GRUPOS_MIN_CAIXA) {
    partes.push(`<span class="nota">${pt
      ? `O menor grupo tem ${plural(menor, 'sítio')}: a caixa desenha os quartis de pouquíssimas observações e não sustenta a comparação.`
      : `The smallest group has ${plural(menor, 'site')}: the box draws quartiles over very few observations and does not support the comparison.`}</span>`);
  }
  return partes;
}

/**
 * Observações de táxon por sítio-ano dentro do recorte, COM OS ZEROS.
 *
 * Linha ausente na tabela não é dado ausente. `fish_year_sp` sai de
 * `occ[sp %in% top_sp]` agregado por sítio-ano e `fish_comp` de `occ`
 * inteiro: um sítio-ano que FOI amostrado e não tem linha daquele táxon é um
 * zero medido, não uma lacuna. Contar só os sítios onde o táxon apareceu
 * inverteria exatamente a comparação que o boxplot existe para fazer — uma
 * espécie ausente fora da UC sairia da conta em vez de pesar nela.
 *
 * Por isso a grade de sítio-ano vem do ESFORÇO (`reef_fish_year`, `coral_sy`)
 * e não da tabela de táxons; cada táxon escolhido é preenchido sobre ela.
 */
async function txObservacoes(ds, nivel, metrica) {
  const alvoBruto = siteFilter();
  const todo = !alvoBruto.length;
  const nativos = usaPeixesNativos();
  const alvoReef = new Set(alvoBruto.filter((c) => !c.startsWith('N_')));
  const alvoNor  = nativos
    ? new Set(alvoBruto.filter((c) => c.startsWith('N_')).map((c) => c.slice(2)))
    : new Set();
  const pegaReef = (id) => todo || alvoReef.has(id);
  const pegaNor  = (id) => nativos && (todo || alvoNor.has(id));

  const grade = new Map();     // sítio|ano -> { Site, Year, esforco }
  const total = new Map();     // sítio|ano -> total do sítio-ano, denominador de `share`
  const anotar = (Site, Year, esforco, tot) => {
    grade.set(`${Site}|${Year}`, { Site, Year, esforco });
    total.set(`${Site}|${Year}`, tot);
  };

  const bruto = new Map();     // sítio|ano|táxon -> abundância (ou cobertura) crua
  const ranking = new Map();   // táxon -> soma no recorte
  const soma = (Site, Year, taxon, v) => {
    if (!taxon || !(v > 0)) return;
    const k = `${Site}|${Year}|${taxon}`;
    bruto.set(k, (bruto.get(k) ?? 0) + v);
    ranking.set(taxon, (ranking.get(taxon) ?? 0) + v);
  };

  if (ds === 'coral') {
    // `cover_total` é exatamente a soma das coberturas por espécie
    // (conferido: 144 sítios-ano, divergência máxima 0). Serve de
    // denominador da fração DENTRO da assembleia de coral, que é a leitura
    // comparável entre os cinco datasets.
    for (const r of core.coral_sy ?? []) {
      if (pegaReef(r.site_id)) anotar(r.site_id, r.year, r.n_eventos, r.cover_total);
    }
    for (const r of core.coral_sy_sp ?? []) {
      if (pegaReef(r.site_id)) soma(r.site_id, r.year, r.species, r.cover);
    }
  } else {
    for (const r of core.reef_fish_year ?? []) {
      if (pegaReef(r.site_id)) anotar(r.site_id, r.year, r.n_events, r.total_abundance);
    }
    for (const r of core.fish_year ?? []) {
      if (pegaNor(r.Site)) anotar(`N_${r.Site}`, r.Year, r.n_events, r.total_abundance);
    }
    // Nao carrega o que o recorte nao alcanca: um poligono so em Noronha nao
    // precisa das 10 mil linhas do ReefSYN, e vice-versa.
    const temReef = todo || alvoReef.size > 0;
    const temNor  = nativos && (todo || alvoNor.size > 0);
    if (nivel === 'family') {
      if (temReef) for (const r of await loadTable('reef_fish_comp')) {
        if (pegaReef(r.site_id)) soma(r.site_id, r.year, r.family, r.total_abundance);
      }
      if (temNor) for (const r of core.fish_comp ?? []) {
        if (pegaNor(r.Site)) soma(`N_${r.Site}`, r.Year, r.family_label, r.total_abundance);
      }
    } else {
      if (temReef) for (const r of await loadTable('reef_fish_year_sp')) {
        if (pegaReef(r.site_id)) soma(r.site_id, r.year, r.species, r.total_abundance);
      }
      if (temNor) for (const r of await loadTable('fish_year_sp')) {
        if (pegaNor(r.Site)) soma(`N_${r.Site}`, r.Year, r.taxon_label, r.total_abundance);
      }
    }
  }

  // Variaveis funcionais por taxon, so quando a metrica escolhida e funcional:
  // custam 57-71 KB gzip e a maioria das visitas nunca as pede.
  const spec = (TX_METRICAS[ds] ?? []).find((m) => m.v === metrica);
  const func = new Map();           // sitio|ano|taxon -> { bio, len, tl }
  if (ds === 'fish' && spec?.func && core.national) {
    const tab = await loadTable(nivel === 'family' ? 'reef_fish_func_fam' : 'reef_fish_func_sp');
    for (const r of tab) {
      if (!pegaReef(r.site_id)) continue;
      const taxon = nivel === 'family' ? r.family : r.species;
      func.set(`${r.site_id}|${r.year}|${taxon}`,
               { bio: r.bio_kg ?? null, len: r.len_mean ?? null, tl: r.tl_mean ?? null });
    }
  }

  return {
    grade: [...grade.values()],
    total,
    bruto,
    func,
    ranking: [...ranking.entries()].sort((a, b) => b[1] - a[1]).map(([tx]) => tx),
  };
}

/** Valor de um táxon num sítio-ano, já na métrica pedida. */
function txValor(obs, cell, taxon, metrica) {
  const chave = `${cell.Site}|${cell.Year}|${taxon}`;
  if (metrica === 'bio' || metrica === 'len' || metrica === 'tl') {
    const f = obs.func.get(chave);
    // Ausencia pesa de formas diferentes. Biomassa de um taxon que NAO foi visto
    // num sitio-ano amostrado e ZERO, medido -- como a abundancia. Mas o
    // TAMANHO ou o nivel trofico de quem nao foi visto nao existe: devolver 0
    // diria "peixes de tamanho zero" e puxaria a mediana para baixo. Esses
    // sitio-anos ficam fora (null), e o boxplot mostra quantos sitios sobram.
    if (metrica === 'bio') {
      if (!f) return cell.esforco > 0 ? 0 : null;
      return f.bio !== null && cell.esforco > 0 ? f.bio / cell.esforco : null;
    }
    return f ? (metrica === 'len' ? f.len : f.tl) : null;
  }
  const cru = obs.bruto.get(chave) ?? 0;
  if (metrica === 'share') {
    const tot = obs.total.get(`${cell.Site}|${cell.Year}`) ?? 0;
    return tot > 0 ? (100 * cru) / tot : null;
  }
  // Dividir pelo esforço é obrigatório: somar abundância bruta entre sítios
  // com número diferente de censos compararia coisas distintas.
  return cell.esforco > 0 ? cru / cell.esforco : null;
}

/**
 * Liga o campo de busca e a lista. Sao ligados UMA vez, no boot: repintar a
 * lista troca o innerHTML, e reatribuir o handler a cada pintura perderia o
 * foco do campo no meio da digitacao.
 */
function wireTaxaBusca() {
  const busca = $('#tx-busca');
  if (busca) {
    busca.placeholder = t('tx_busca');
    busca.oninput = () => store.set('txBusca', busca.value);
  }
  const lista = $('#tx-lista');
  if (lista) {
    lista.onclick = (e) => {
      const b = e.target.closest('.chip');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      const tx = b.dataset.v;
      const atual = store.get('txSel');
      // Sem escolha guardada o painel mostra os maiores; o primeiro clique
      // precisa partir DESSES, senao desmarcar um chip aceso nao faz nada.
      const base = Array.isArray(atual) ? atual
        : [...$$('#tx-lista .chip[aria-pressed="true"]')].map((c) => c.dataset.v);
      store.set('txSel', base.includes(tx)
        ? base.filter((x) => x !== tx)
        : [...base, tx].slice(0, TX_MAX));
    };
  }
}

/**
 * Táxons escolhidos que ainda existem no recorte.
 *
 * `null` e `[]` dizem coisas diferentes. `null` é "ainda não escolhi" e vale
 * os quatro maiores; `[]` é "desmarquei tudo" e tem de ficar vazio -- antes
 * os dois eram a mesma coisa, e desmarcar o último chip repreenchia a lista
 * sozinho, como se o clique não tivesse acontecido.
 *
 * Uma lista guardada que o recorte novo não alcança (nomes de outro conjunto,
 * espécies que não ocorrem ali) volta aos maiores: aí a escolha de fato
 * deixou de existir.
 */
function txEscolhidos(ranking) {
  const guardados = store.get('txSel');
  const padrao = ranking.slice(0, Math.min(4, ranking.length));
  if (guardados === null || guardados === undefined) return padrao;
  if (!guardados.length) return [];
  const validos = guardados.filter((x) => ranking.includes(x));
  return validos.length ? validos.slice(0, TX_MAX) : padrao;
}

/** Lista de seleção: os táxons do recorte, filtrados pela busca. */
function txPintarLista(ranking, escolhidos) {
  const el = $('#tx-lista');
  if (!el) return;
  const busca = (store.get('txBusca') ?? '').trim().toLowerCase();
  const sp = txNivel() === 'species';
  // Os escolhidos ficam sempre na lista, mesmo quando a busca não os
  // alcança: filtrar e esconder o que está selecionado faria o chip
  // desaparecer no meio de uma troca, sem jeito de desmarcá-lo.
  const visiveis = ranking.filter((tx) =>
    escolhidos.includes(tx) || !busca || tx.toLowerCase().includes(busca));

  el.innerHTML = visiveis.map((tx) => {
    const i = escolhidos.indexOf(tx);
    const on = i >= 0;
    const cheio = !on && escolhidos.length >= TX_MAX;
    return `<button class="chip${sp ? ' is-sp' : ''}" data-v="${esc(tx)}"
      aria-pressed="${on}" ${cheio ? 'aria-disabled="true"' : ''}
      style="--c:${on ? CAT[i % CAT.length] : 'var(--muted)'}"><span class="dot"></span>${esc(tx)}</button>`;
  }).join('');
}

/** Monta as três linhas de chips do cabeçalho e a linha de grupo. */
function txPintarControles() {
  const ds = store.get('tDataset');

  const niveis = txNiveis(ds);
  const elN = $('#tx-nivel');
  if (elN) {
    // Com um nível só (corais) o chip não oferece escolha nenhuma.
    elN.hidden = niveis.length < 2;
    makeChips(elN, niveis.map((o) => ({ v: o.v, label: t(o.k), color: '#5a6a8a' })),
      (v) => txNivel() === v,
      // Trocar de nível invalida a seleção: nome de espécie não é nome de
      // família, e manter a lista antiga deixaria o gráfico vazio.
      (v) => store.set({ txNivel: v, txSel: null, txBusca: '' }));
  }

  makeChips($('#tx-metrica'),
    txMetricas(ds).map((o) => ({ v: o.v, label: t(o.k), color: '#5a6a8a' })),
    (v) => txMetrica() === v, (v) => store.set('txMetrica', v));

  makeChips($('#tx-tipo'),
    [{ v: 'linha', label: t('tx_tipo_linha'), color: '#5a6a8a' },
     { v: 'box',   label: t('tx_tipo_box'),   color: '#5a6a8a' }],
    (v) => store.get('txTipo') === v, (v) => store.set('txTipo', v));

  pintarChipsGrupo($('#tx-grupo'), 'txGrupo', txGrupoAtivo());
}

/** Linha de chips "Agrupar por": sem grupo, ou um dos critérios que de fato dividem o recorte. */
function pintarChipsGrupo(el, chave, ativo) {
  if (!el) return;
  const crit = criteriosDisponiveis();
  el.hidden = !crit.length;
  if (!crit.length) return;
  const opts = [{ v: 'none', label: t('tx_sem_grupo') },
                ...crit.map((c) => ({ v: c.v, label: t(`cmp_dim_${c.v}`) }))];
  makeChips(el, opts.map((o) => ({ v: o.v, label: o.label, color: '#982263' })),
    (v) => (v === 'none' ? ativo === null : ativo === v),
    (v) => store.set(chave, v));
  el.insertAdjacentHTML('afterbegin', `<span class="tx-grupo__lbl">${t('tx_agrupar')}</span>`);
}

/** Rótulos do boxplot nos dois idiomas, compartilhados pelos painéis com caixa. */
function rotulosBoxplot() {
  const pt = getLang() === 'pt';
  return {
    rotuloN: (k) => plural(k, pt ? 'sítio' : 'site'),
    rotuloEstat: pt
      ? { mediana: 'mediana', quartis: 'quartis', haste: 'hastes (1,5×IQR)',
          fora: (k, m) => `${plural(k, 'sítio')} fora da cerca, até ${m}` }
      : { mediana: 'median', quartis: 'quartiles', haste: 'whiskers (1.5×IQR)',
          fora: (k, m) => `${plural(k, 'site')} beyond the fence, up to ${m}` },
  };
}

/**
 * Desenha o painel. Devolve o texto da nota medida no próprio recorte --
 * quantos sítios entraram, qual o menor grupo -- em vez de uma ressalva fixa.
 */
async function renderPainelTaxa() {
  const card = $('#card-taxa');
  if (!card) return;
  const ds = store.get('tDataset');
  if (!TX_DATASETS.includes(ds)) { card.hidden = true; return; }
  card.hidden = false;

  const pt = getLang() === 'pt';
  const nivel = txNivel();
  const metrica = txMetrica();
  const tipo = store.get('txTipo');
  const specM = txMetricas(ds, nivel).find((o) => o.v === metrica);
  const unidade = specM?.unidade ?? (metrica === 'share' ? '%' : '');
  const casas = specM?.casas ?? 1;
  const escala = specM?.escala ?? false;

  txPintarControles();

  const obs = await txObservacoes(ds, nivel, metrica);
  const escolhidos = txEscolhidos(obs.ranking);
  txPintarLista(obs.ranking, escolhidos);

  const nota = $('#tx-nota');
  const vazio = (msg) => {
    chart('chart-taxa')?.clear();
    $('#tx-sub').textContent = '';
    if (nota) nota.textContent = msg;
  };
  if (!obs.ranking.length)  return vazio(t('tx_nada'));
  if (!escolhidos.length)   return vazio(t('tx_vazio'));

  const criterio = txGrupoAtivo();

  // O gráfico usa os grupos de fato?
  //
  //   boxplot  sempre -- é a razão de ser dele
  //   linha    só com UM táxon (as linhas viram os grupos) ou na métrica
  //            `pres`, que não se divide por táxon
  const porGrupo = metrica === 'pres' || escolhidos.length === 1;
  const usaGrupos = tipo === 'box' || porGrupo;
  const { ordem: ordemGrupos, grupos, grupoDoSitio, descartados, tamanho, nomeGrupo, cores } =
    resolverGrupos({ ds, criterio, usaGrupos, box: tipo === 'box' });

  // Só sítio-ano cujo sítio está em algum grupo considerado.
  const celulas = obs.grade.filter((c) => grupoDoSitio(c.Site) !== null);

  // Tamanho e nivel trofico so existem onde o taxon foi visto. Contar quantos
  // sitios sustentam cada taxon e o que deixa claro quando uma caixa ou linha
  // descreve pouca coisa.
  let presentes = null;
  if (metrica === 'len' || metrica === 'tl') {
    presentes = new Map(escolhidos.map((tx) => [tx, new Set()]));
    for (const c of celulas) {
      for (const tx of escolhidos) {
        if (Number.isFinite(txValor(obs, c, tx, metrica))) presentes.get(tx).add(c.Site);
      }
    }
  }

  if (tipo === 'box') {
    const alvos = metrica === 'pres' ? [TX_SEL] : escolhidos;
    const valores = valoresPorSitio(celulas, alvos, grupoDoSitio, (c, tx) =>
      tx === TX_SEL
        ? escolhidos.filter((x) => (obs.bruto.get(`${c.Site}|${c.Year}|${x}`) ?? 0) > 0).length
        : txValor(obs, c, tx, metrica));

    const categorias = metrica === 'pres' ? [TX_SEL] : escolhidos;
    const rotuloCat = (c) => (c === TX_SEL ? t('tx_selecao') : c);
    chart('chart-taxa')?.setOption(boxTaxaOption({
      categorias: categorias.map(rotuloCat),
      grupos,
      valores: new Map([...valores].map(([k, v]) => {
        const [c, g] = k.split('\u0000');
        return [`${rotuloCat(c)}\u0000${g}`, v];
      })),
      unidade, casas, escala, cores, rotuloGrupo: nomeGrupo,
      italico: nivel === 'species' && metrica !== 'pres',
      ...rotulosBoxplot(),
    }), true);

    $('#tx-sub').textContent = pt
      ? `${rotuloMetricaTx(ds, nivel, metrica)} — cada caixa é um grupo, cada ponto dela é um sítio (média dos anos amostrados)`
      : `${rotuloMetricaTx(ds, nivel, metrica)} — each box is a group, each observation a site (mean of sampled years)`;
    if (nota) nota.innerHTML = txNotaHTML({
      celulas, grupos, criterio, grupoDoSitio, nomeGrupo, nivel, metrica, ds,
      descartados, tamanho, cerca: txResumoCerca(valores, unidade, casas), specM, presentes });
    return;
  }

  // ---- modo linha ---------------------------------------------------------
  // Com UM táxon escolhido as linhas são os GRUPOS: é a leitura "dentro
  // contra fora ao longo do tempo". Com dois ou mais, as linhas são os
  // táxons -- táxon × grupo daria até 8 × 4 séries ilegíveis num eixo só.
  const linhasPorGrupo = porGrupo && ordemGrupos.length > 0;
  const rows = [];
  for (const c of celulas) {
    const g = grupoDoSitio(c.Site);
    if (linhasPorGrupo || metrica === 'pres') {
      const v = metrica === 'pres'
        ? escolhidos.filter((x) => (obs.bruto.get(`${c.Site}|${c.Year}|${x}`) ?? 0) > 0).length
        : txValor(obs, c, escolhidos[0], metrica);
      if (Number.isFinite(v)) rows.push({ Site: c.Site, Year: c.Year, group: g, value: v });
    } else {
      for (const tx of escolhidos) {
        const v = txValor(obs, c, tx, metrica);
        if (Number.isFinite(v)) rows.push({ Site: c.Site, Year: c.Year, group: tx, value: v });
      }
    }
  }

  const ordem = (linhasPorGrupo || metrica === 'pres') ? grupos : escolhidos;
  chart('chart-taxa')?.setOption(multiParamOption(rows, {
    ordem,
    rotulo: { serie: ordem === grupos ? nomeGrupo : ((g) => g) },
    cores: ordem === grupos ? cores : escolhidos.map((_, i) => CAT[i % CAT.length]),
    unidade, casas, escala,
  }), true);

  const mLabel = rotuloMetricaTx(ds, nivel, metrica);
  $('#tx-sub').textContent = linhasPorGrupo
    ? (pt ? `${mLabel} — mediana entre sítios de cada grupo, por ano`
          : `${mLabel} — median across sites in each group, per year`)
    : (pt ? `${mLabel} — mediana entre os sítios da seleção, por ano`
          : `${mLabel} — median across the selected sites, per year`);
  if (nota) nota.innerHTML = txNotaHTML({
    celulas, grupos, criterio, grupoDoSitio, nomeGrupo, nivel, metrica, ds,
    descartados, tamanho, specM, presentes });
}

/**
 * Quantos valores de sítio ficaram fora da cerca de Tukey, e até onde vão.
 * As hastes param em 1,5×IQR para que as caixas sejam legíveis — então o que
 * ficou além delas tem de ser DITO, não apenas omitido do desenho.
 */
function txResumoCerca(valores, unidade, casas = 1) {
  // A haste de comparacao e a do MESMO grupo que tem o valor mais alto fora da
  // cerca: comparar com a haste de outro grupo misturaria duas caixas.
  let fora = 0, extremo = null, haste = 0;
  for (const vs of valores.values()) {
    const r = foraDaCerca(vs);
    fora += r.fora;
    if (r.extremo !== null && (extremo === null || r.extremo > extremo)) {
      extremo = r.extremo;
      haste = r.haste;
    }
  }
  if (!fora) return null;
  const pt = getLang() === 'pt';
  const u = (v) => `${fmt(v, casas)}${unidade}`;
  // "Comprimiria as caixas" so e verdade quando o valor de fora e MUITO maior
  // que a haste: 885 contra 86 na biomassa, sim; 4,5 contra 4,2 no nivel
  // trofico, nao -- e afirmar compressao ali seria falso.
  const comprime = extremo !== null && extremo > 1.5 * haste;
  const sing = fora === 1;
  return `<span class="nota">${pt
    ? `As hastes param em 1,5×IQR, como em <code>boxplot()</code> do R: ${plural(fora, 'valor', 'valores')} de sítio ${sing ? 'fica' : 'ficam'} além delas e não ${sing ? 'é desenhado' : 'são desenhados'}${extremo !== null ? ` — o maior chega a <strong>${u(extremo)}</strong>, contra ${u(haste)} na haste do mesmo grupo` : ''}.${comprime ? ' Desenhá-los comprimiria todas as caixas na base do eixo.' : ''}`
    : `Whiskers stop at 1.5×IQR, as in R\u2019s <code>boxplot()</code>: ${fmtInt(fora)} site ${sing ? 'value falls' : 'values fall'} beyond them and ${sing ? 'is' : 'are'} not drawn${extremo !== null ? ` — the largest reaches <strong>${u(extremo)}</strong>, against ${u(haste)} at the whisker of the same group` : ''}.${comprime ? ' Drawing them would squash every box onto the axis floor.' : ''}`}</span>`;
}

/**
 * Nota do painel: tudo medido no recorte atual, nada de ressalva fixa.
 *
 * As duas primeiras frases não são decoração. A primeira diz que os zeros
 * entraram -- sem isso ninguém sabe se um táxon ausente pesou na conta ou
 * saiu dela, e é essa diferença que decide a leitura "dentro contra fora". A
 * segunda diz quando a caixa é pequena demais para ser lida como caixa.
 */
function txNotaHTML({ celulas, grupos, criterio, grupoDoSitio, nomeGrupo,
                      nivel, metrica, ds, cerca = null,
                      descartados = [], tamanho = new Map(), specM = null, presentes = null }) {
  const pt = getLang() === 'pt';
  const partes = [];

  const sitios = new Set(celulas.map((c) => c.Site)).size;
  const anos = new Set(celulas.map((c) => c.Year));
  // Ausencia pesa de formas diferentes. Abundancia e biomassa: sitio-ano
  // amostrado sem o taxon e ZERO, para a ausencia pesar na comparacao. Tamanho e
  // nivel trofico: quem nao foi visto nao tem tamanho, entao o sitio-ano FICA FORA.
  const soVistos = metrica === 'len' || metrica === 'tl';
  const frase = soVistos
    ? (pt ? 'O tamanho (e o nível trófico) de um táxon só existe onde ele foi visto: sítio-ano amostrado sem registro fica <strong>fora</strong> da conta — não vale tamanho zero.'
          : 'A taxon’s size (and trophic level) only exists where it was seen: a sampled site-year with no record is left <strong>out</strong> — it does not count as size zero.')
    : (pt ? 'Um sítio-ano amostrado sem registro do táxon conta como <strong>zero</strong>, não como lacuna — é o que faz a ausência pesar na comparação em vez de sair dela.'
          : 'A sampled site-year with no record of the taxon counts as a <strong>zero</strong>, not a gap — that is what makes absence weigh on the comparison instead of dropping out of it.');
  partes.push(pt
    ? `${plural(sitios, 'sítio')} e ${plural(anos.size, 'ano')} de amostragem entraram na conta. ${frase}`
    : `${plural(sitios, 'site')} and ${plural(anos.size, 'year')} of sampling went into this. ${frase}`);

  if (presentes) {
    const lista = [...presentes].map(([tx, st]) => `<strong>${tx}</strong> ${fmtInt(st.size)}`).join(' · ');
    partes.push(pt ? `Sítios onde cada táxon foi visto: ${lista}.` : `Sites where each taxon was seen: ${lista}.`);
  }

  partes.push(...notaGrupos({ celulas, grupos, criterio, grupoDoSitio, nomeGrupo,
                              descartados, tamanho }));

  if (cerca) partes.push(cerca);

  if (ds === 'fish' && nivel === 'species') {
    partes.push(`<span class="nota">${pt
      ? 'A tabela por espécie cobre as 120 mais abundantes do país — uma espécie rara pode não estar na lista mesmo tendo registro. No nível de família a cobertura é total.'
      : 'The species-level table covers the 120 most abundant nationwide — a rare species may be missing from the list even though it was recorded. At family level the coverage is complete.'}</span>`);
  }
  if (ds === 'coral') {
    partes.push(`<span class="nota">${pt
      ? 'Fração <em>dentro da assembleia de coral</em>, não cobertura do fundo: a exportação Darwin Core removeu o denominador, então somar cobertura entre datasets não se sustenta.'
      : 'Share <em>within the coral assemblage</em>, not benthic cover: the Darwin Core export stripped the denominator, so summing cover across datasets does not hold.'}</span>`);
  }
  if (metrica === 'bio' || metrica === 'len' || metrica === 'tl') {
    const gc = (fnMeta('db_genero') ?? 0) + (fnMeta('db_familia') ?? 0);
    const quem = metrica === 'bio'
      ? (pt ? 'Biomassa do táxon = soma de <em>a</em>·CT<sup><em>b</em></sup> dos indivíduos, com o comprimento <strong>medido em campo</strong>, em kg por censo de 40 m².'
            : 'Taxon biomass = sum of <em>a</em>·TL<sup><em>b</em></sup> over its individuals, using the length <strong>measured in the field</strong>, in kg per 40 m² census.')
      : metrica === 'len'
        ? (pt ? 'Comprimento total médio dos indivíduos do táxon, <strong>medido em campo</strong>.'
              : 'Mean total length of the taxon’s individuals, <strong>measured in the field</strong>.')
        : (pt ? 'Nível trófico médio da família, ponderado pela abundância, a partir do nível de cada espécie em Quimbayo et al. (2021). O de uma espécie é um traço fixo e por isso não aparece como série.'
              : 'Mean trophic level of the family, abundance-weighted, from each species’ level in Quimbayo et al. (2021). A species’ own level is a fixed trait and so is not shown as a series.');
    partes.push(`<span class="nota">${quem}${metrica === 'bio'
      ? (pt ? ` Dentro do banco, ${fmt(gc, 0)}% dos indivíduos do país usam coeficientes de gênero ou família, não de espécie.`
            : ` Within the database, ${fmt(gc, 0)}% of the country’s individuals use genus- or family-level coefficients, not species.`)
      : ''}</span>`);
  }
  if (metrica === 'pres') {
    partes.push(`<span class="nota">${pt
      ? 'Conta quantos dos táxons escolhidos aparecem — depende da lista acima, não é a riqueza total do sítio.'
      : 'Counts how many of the chosen taxa are present — it depends on the list above and is not the site’s total richness.'}</span>`);
  }

  return partes.join(' ');
}

// ---------------------------------------------------------------------------
// Função da assembleia: biomassa, tamanho e nível trófico
//
// Um valor por sítio-ano, calculado em build/extract_reefsyn.R a partir do
// comprimento MEDIDO em campo -- o CT de cada registro do eMOF, não o tamanho
// máximo da espécie. Peso e nível trófico vêm de Quimbayo et al. 2021. Mesmos
// controles de grupo e de linha/caixa do painel de táxons.
// ---------------------------------------------------------------------------

const FN_CAT = '\u0002fn';
let fnToken = 0;

const fnMetrica = () => FN_METRICAS.find((m) => m.v === store.get('fnMetrica')) ?? FN_METRICAS[0];
const fnGrupoAtivo = () => grupoAtivo('fnGrupo', { regionalSemRecorte: true });

function fnPintarControles() {
  makeChips($('#fn-metrica'),
    FN_METRICAS.map((o) => ({ v: o.v, label: t(o.k), color: '#5a6a8a' })),
    (v) => fnMetrica().v === v, (v) => store.set('fnMetrica', v));
  makeChips($('#fn-tipo'),
    [{ v: 'linha', label: t('tx_tipo_linha'), color: '#5a6a8a' },
     { v: 'box',   label: t('tx_tipo_box'),   color: '#5a6a8a' }],
    (v) => store.get('fnTipo') === v, (v) => store.set('fnTipo', v));
  pintarChipsGrupo($('#fn-grupo'), 'fnGrupo', fnGrupoAtivo());
}

/** Valor do campo `chave` em `reef_func_meta` (procedência medida no export). */
function fnMeta(chave) {
  const m = core.reef_func_meta ?? [];
  return m.find((r) => r.chave === chave)?.valor ?? null;
}

async function renderPainelFuncao() {
  const card = $('#card-func');
  if (!card) return;
  const ds = store.get('tDataset');
  if (ds !== 'fish' || !core.reef_func_meta) { card.hidden = true; return; }
  card.hidden = false;

  const eu = ++fnToken;                         // descarta render velho que volte depois de um novo
  const pt = getLang() === 'pt';
  const m = fnMetrica();
  const tipo = store.get('fnTipo');
  const rotulo = t(m.k);
  fnPintarControles();

  const nota = $('#fn-nota');
  const vazio = (msg) => {
    chart('chart-func')?.clear();
    $('#fn-sub').textContent = '';
    if (nota) nota.textContent = msg;
  };

  const sitios = sitiosDoRecorte('fish');
  const alvo = new Map(sitios.map((s) => [s.Site, s]));
  const tabela = await loadTable('reef_fish_func');
  if (eu !== fnToken) return;

  const criterio = fnGrupoAtivo();
  const G = resolverGrupos({ ds: 'fish', criterio, usaGrupos: true, box: tipo === 'box' });

  // NA e NA: sítio-ano sem valor não entra como zero. Um sítio-ano sem
  // nenhum peixe contado tem biomassa 0 (medido), mas o comprimento e o nível
  // trófico dele não existem -- e dizer 0 seria falso.
  const celulas = [];
  for (const r of tabela) {
    if (!alvo.has(r.site_id)) continue;
    if (G.grupoDoSitio(r.site_id) === null) continue;
    const v = r[m.col];
    if (!Number.isFinite(v)) continue;
    celulas.push({ Site: r.site_id, Year: r.year, v, r });
  }
  if (!celulas.length) return vazio(t('fn_sem_dado'));

  const unidadeSub = {
    bio: pt ? 'kg por censo de 40 m²' : 'kg per 40 m² census',
    len: pt ? 'comprimento total, cm' : 'total length, cm',
    tl_ab: pt ? 'ponderado pela abundância' : 'abundance-weighted',
    tl_bio: pt ? 'ponderado pela biomassa' : 'biomass-weighted',
  }[m.v];

  let cerca = null;
  if (tipo === 'box') {
    const valores = valoresPorSitio(celulas, [rotulo], G.grupoDoSitio, (c) => c.v);
    chart('chart-func')?.setOption(boxTaxaOption({
      categorias: [rotulo], grupos: G.grupos, valores,
      unidade: m.unidade, casas: m.casas, escala: m.escala,
      cores: G.cores, rotuloGrupo: G.nomeGrupo, ...rotulosBoxplot(),
    }), true);
    cerca = txResumoCerca(valores, m.unidade, m.casas);
    $('#fn-sub').textContent = pt
      ? `${rotulo}, ${unidadeSub} — cada caixa é um grupo, cada ponto dela é um sítio (média dos anos amostrados)`
      : `${rotulo}, ${unidadeSub} — each box is a group, each observation a site (mean of sampled years)`;
  } else {
    const rows = celulas.map((c) => ({
      Site: c.Site, Year: c.Year, group: G.grupoDoSitio(c.Site), value: c.v }));
    chart('chart-func')?.setOption(multiParamOption(rows, {
      ordem: G.grupos, rotulo: { serie: G.nomeGrupo }, cores: G.cores,
      unidade: m.unidade, casas: m.casas, escala: m.escala,
    }), true);
    $('#fn-sub').textContent = G.ordem.length
      ? (pt ? `${rotulo}, ${unidadeSub} — mediana entre sítios de cada grupo, por ano`
            : `${rotulo}, ${unidadeSub} — median across sites in each group, per year`)
      : (pt ? `${rotulo}, ${unidadeSub} — mediana entre os sítios da seleção, por ano`
            : `${rotulo}, ${unidadeSub} — median across the selected sites, per year`);
  }

  if (nota) {
    nota.innerHTML = fnNotaHTML({ celulas, G, criterio, m, cerca, alvo, tipo });
  }
}

/**
 * Nota do painel de função. Cada número é medido no RECORTE atual (cobertura,
 * classe de tamanho, registros excluídos); só a procedência do banco -- quanto
 * dos coeficientes é de gênero ou família -- é nacional, porque é uma
 * propriedade do banco e não do recorte.
 */
function fnNotaHTML({ celulas, G, criterio, m, cerca, alvo, tipo }) {
  const pt = getLang() === 'pt';
  const partes = [];
  const pc = (x) => `${fmt(100 * x, x < 0.1 ? 1 : 0)}%`;

  const sitios = new Set(celulas.map((c) => c.Site)).size;
  const anos = new Set(celulas.map((c) => c.Year)).size;
  partes.push(pt
    ? `${plural(sitios, 'sítio')} e ${plural(anos, 'ano')} de amostragem entraram na conta.`
    : `${plural(sitios, 'site')} and ${plural(anos, 'year')} of sampling went into this.`);

  partes.push(...notaGrupos({ celulas, grupos: G.grupos, criterio, grupoDoSitio: G.grupoDoSitio,
                              nomeGrupo: G.nomeGrupo, descartados: G.descartados, tamanho: G.tamanho }));
  if (cerca) partes.push(cerca);

  // Cada ponto da linha é a mediana de um conjunto de sítios que MUDA de ano
  // para ano: no Nordeste, a biomassa cai de ~21 kg em 2013-14 para ~5 em 2015
  // com 8, depois 4 sítios. Dizer quantos sustentam cada ponto é o mínimo para
  // não ler como tendência o que é troca de sítios.
  if (tipo !== 'box') {
    const porGA = new Map();
    for (const c of celulas) {
      const k = `${G.grupoDoSitio(c.Site)}|${c.Year}`;
      if (!porGA.has(k)) porGA.set(k, new Set());
      porGA.get(k).add(c.Site);
    }
    const ns = [...porGA.values()].map((x) => x.size);
    const minN = Math.min(...ns), maxN = Math.max(...ns);
    const poucos = ns.filter((n) => n < GRUPOS_MIN_CAIXA).length;
    if (maxN > minN) {
      partes.push(`<span class="nota">${pt
        ? `Cada ponto é a mediana de ${minN} a ${maxN} sítios, e quais sítios entram muda de ano para ano${poucos ? `; ${poucos} dos ${ns.length} pontos têm menos de ${GRUPOS_MIN_CAIXA} sítios e valem pouco como tendência` : ''}.`
        : `Each point is the median of ${minN} to ${maxN} sites, and which sites enter changes from year to year${poucos ? `; ${poucos} of the ${ns.length} points have fewer than ${GRUPOS_MIN_CAIXA} sites and say little about a trend` : ''}.`}</span>`);
    }
  }

  // Coberturas ponderadas por indivíduos, sobre os sítio-anos do recorte.
  const soma2 = (f) => celulas.reduce((a, c) => a + f(c.r), 0);
  const ind = soma2((r) => r.ind);
  const indW = soma2((r) => r.ind * (r.cob_w ?? 0));
  const indLen = soma2((r) => r.ind * (r.cob_len ?? 0));
  const cobW = ind ? indW / ind : 0;
  const fGen = indW ? soma2((r) => r.ind * (r.cob_w ?? 0) * (r.f_genero ?? 0)) / indW : 0;
  const fCls = indLen ? soma2((r) => r.ind * (r.cob_len ?? 0) * (r.f_classe ?? 0)) / indLen : 0;
  const excl = soma2((r) => r.excl ?? 0);

  // Sem agrupar o país inteiro vira uma mediana só, e a geografia por trás
  // dela muda de ano para ano. Medido aqui, não afirmado.
  if (G.grupos.length === 1 && !temRecorte()) {
    const porAno = new Map();
    for (const c of celulas) {
      if (!porAno.has(c.Year)) porAno.set(c.Year, new Set());
      porAno.get(c.Year).add(alvo.get(c.Site)?.region);
    }
    const anosOrd = [...porAno.keys()].sort((a, b) => a - b);
    const a0 = anosOrd[0], a1 = anosOrd[anosOrd.length - 1];
    const n0 = porAno.get(a0).size, n1 = porAno.get(a1).size;
    if (n0 !== n1) {
      partes.push(`<span class="nota">${pt
        ? `Sem agrupar, a linha é a mediana do país inteiro, e a geografia por trás dela muda: em ${a0} havia dados de ${plural(n0, 'região', 'regiões')}; em ${a1}, de ${n1}. Agrupe por região para comparar o que é comparável.`
        : `Ungrouped, the line is the median of the whole country, and the geography behind it shifts: ${a0} had data from ${plural(n0, 'region')}; ${a1}, from ${n1}. Group by region to compare like with like.`}</span>`);
    }
  }

  const citacao = 'Quimbayo et al. (2021)';
  if (m.v === 'bio') {
    partes.push(`<span class="nota">${pt
      ? `Biomassa = soma, sobre os indivíduos contados, de <em>a</em>·CT<sup><em>b</em></sup>, com o comprimento total <strong>medido em campo</strong> (não o tamanho máximo da espécie) e os coeficientes de ${citacao}. Em kg por censo de 40 m² (×250 para kg/ha). Só peixes ósseos recifais: tubarões e raias não têm coeficiente no banco e ficam fora.`
      : `Biomass = sum, over the individuals counted, of <em>a</em>·TL<sup><em>b</em></sup>, using the total length <strong>measured in the field</strong> (not the species’ maximum size) and the coefficients of ${citacao}. In kg per 40 m² census (×250 for kg/ha). Bony reef fishes only: sharks and rays have no coefficient in the database and are left out.`}</span>`);
    partes.push(`<span class="nota">${pt
      ? `${pc(cobW)} dos indivíduos do recorte têm peso estimado${fGen > 0.005 ? `, ${pc(fGen)} deles por coeficiente do gênero (a espécie não está no banco)` : ''}. Dentro do banco, ${fmt((fnMeta('db_genero') ?? 0) + (fnMeta('db_familia') ?? 0), 0)}% dos indivíduos do país usam coeficientes compilados em nível de gênero ou família, não de espécie — a biomassa herda essa incerteza.`
      : `${pc(cobW)} of the individuals in the selection have an estimated weight${fGen > 0.005 ? `, ${pc(fGen)} of them from the genus coefficient (the species is not in the database)` : ''}. Within the database, ${fmt((fnMeta('db_genero') ?? 0) + (fnMeta('db_familia') ?? 0), 0)}% of the country’s individuals use coefficients compiled at genus or family level, not species — the biomass inherits that uncertainty.`}</span>`);
  } else if (m.v === 'len') {
    partes.push(`<span class="nota">${pt
      ? 'Comprimento total médio de todos os indivíduos contados, ponderado pela abundância, a partir do CT <strong>medido em campo</strong>. Descreve a assembleia como foi vista, não o que as espécies poderiam atingir.'
      : 'Mean total length of all individuals counted, abundance-weighted, from the TL <strong>measured in the field</strong>. It describes the assemblage as it was seen, not what the species could reach.'}</span>`);
  } else {
    const gen = fnMeta('tl_genero') ?? 0;
    partes.push(`<span class="nota">${pt
      ? `Nível trófico da espécie segundo ${citacao}, médio ${m.v === 'tl_bio' ? 'ponderado pela biomassa — pesa mais os grandes predadores' : 'ponderado pela abundância — pesa mais os cardumes de peixes pequenos'}. Quando a espécie não tem valor no banco, vale a mediana do gênero (${fmt(gen, 1)}% dos indivíduos do país).`
      : `Species trophic level from ${citacao}, ${m.v === 'tl_bio' ? 'biomass-weighted — large predators weigh more' : 'abundance-weighted — schools of small fish weigh more'}. Where the species has no value in the database, the genus median is used (${fmt(gen, 1)}% of the country’s individuals).`}</span>`);
  }

  if (m.v !== 'tl_ab' && fCls > 0.005) {
    partes.push(`<span class="nota">${pt
      ? `${pc(fCls)} dos comprimentos do recorte são classes de tamanho (datasets VII e VIII), não medidas individuais: vale o ponto médio da classe.`
      : `${pc(fCls)} of the lengths in the selection are size classes (datasets VII and VIII), not individual measurements: the class midpoint is used.`}</span>`);
  }
  if (m.v !== 'tl_ab' && excl > 0) {
    partes.push(`<span class="nota">${pt
      ? `${plural(excl, 'indivíduo')} ${excl === 1 ? 'tem' : 'têm'} comprimento acima de ${fnMeta('excl_razao') ?? 2}× o máximo da espécie e ${excl === 1 ? 'ficou' : 'ficaram'} fora do tamanho e do peso: é erro de registro, não peixe grande (o peso cresce com o cubo do comprimento e um só erro dominaria o sítio). A fonte não foi alterada.`
      : `${plural(excl, 'individual')} ${excl === 1 ? 'has' : 'have'} a length above ${fnMeta('excl_razao') ?? 2}× the species maximum and ${excl === 1 ? 'was' : 'were'} left out of size and weight: a recording error, not a big fish (weight grows with the cube of length and one error would dominate the site). The source was not altered.`}</span>`);
  }
  return partes.join(' ');
}

// ---------------------------------------------------------------------------
// Eixo 2 — ranking de sítios
// ---------------------------------------------------------------------------

/**
 * Painel de parametros de poluicao.
 *
 * Cada linha mostra a FAIXA do parametro entre sitios, com a mediana marcada.
 * Nao a magnitude absoluta: dentro dos metais o ferro chega a 61.135 e o
 * cadmio a 0,65 -- cinco ordens de grandeza -- e barras proporcionais
 * mostrariam uma barra cheia e oito vazias. A faixa normalizada responde a
 * pergunta que importa na hora de escolher o que mapear: este parametro
 * separa os sitios ou e igual em todos?
 */
function renderPollutionPanel() {
  const el = $('#e2-params');
  if (!el) return;
  const atual = store.get('variable');
  const pol = core.pollution ?? [];

  const estat = (v) => {
    // Media por sitio primeiro: ha mais de uma coleta por sitio, e um sitio
    // com 4 amostras pesaria o quadruplo de um com 1 na faixa.
    const porSitio = [...groupBy(pol.filter((r) => Number.isFinite(r[v])), 'Site')]
      .map(([, g]) => mean(g.map((r) => r[v])));
    if (!porSitio.length) return null;
    const ord = [...porSitio].sort((a, b) => a - b);
    const i = Math.floor(ord.length / 2);
    return {
      n: ord.length,
      min: ord[0],
      max: ord[ord.length - 1],
      med: ord.length % 2 ? ord[i] : (ord[i - 1] + ord[i]) / 2,
    };
  };

  const pt = getLang() === 'pt';
  el.innerHTML = POLLUTION_GROUPS.map((m) => {
    const fams = m.familias.map((f) => {
      const linhas = f.params.map((o) => {
        const e = estat(o.v);
        if (!e) return '';
        const amplitude = e.max - e.min;
        const pos = amplitude > 0 ? ((e.med - e.min) / amplitude) * 100 : 50;
        const uniforme = amplitude === 0;
        return `<button class="param-row" data-v="${o.v}"
            aria-pressed="${o.v === atual}"
            title="${pt ? 'mín' : 'min'} ${fmt(e.min, 2)} · ${pt ? 'máx' : 'max'} ${fmt(e.max, 2)} · ${e.n} ${pt ? 'sítios' : 'sites'}">
          <span class="param-nome">${optLabel(o)}</span>
          <span class="param-faixa"${uniforme ? ' data-uniforme' : ''}>
            <i style="left:${pos.toFixed(1)}%"></i>
          </span>
          <span class="param-val">${fmt(e.med, e.med < 1 ? 3 : 1)}<em>${o.unit ?? ''}</em></span>
        </button>`;
      }).join('');
      if (!linhas) return '';
      return `<div class="param-fam">
        <h4>${pt ? f.pt : f.en}${f.total
          ? `<span class="param-tot">${pt ? 'soma em' : 'sums to'} ${optLabelParam(f.total)}</span>`
          : ''}</h4>
        ${linhas}
      </div>`;
    }).join('');
    if (!fams) return '';
    return `<section class="param-matriz">
      <h3>${pt ? m.matrizPt : m.matrizEn}</h3>
      <div class="param-fams">${fams}</div>
    </section>`;
  }).join('');

  el.onclick = (ev) => {
    const b = ev.target.closest('.param-row');
    if (!b) return;
    store.set({ variable: b.dataset.v, e2Param: b.dataset.v });
    $$('#e2-params .param-row').forEach(
      (x) => x.setAttribute('aria-pressed', x.dataset.v === b.dataset.v));
    const sel = $('#f-var');
    if (sel) sel.value = b.dataset.v;
  };
}

function renderEixo2() {
  const param = store.get('variable') ?? 'Salinity';
  const unidade = polUnit(param);
  const sitioSel = store.get('selectedSite');
  const pol = (core.pollution ?? []).filter((r) => Number.isFinite(r[param]));
  const porSitio = [...groupBy(pol, 'Site')]
    .map(([site, g]) => ({
      site,
      label: core.sites.find((s) => s.Site === site)?.site_label ?? site,
      v: mean(g.map((r) => r[param])),
    }))
    .sort((a, b) => a.v - b.v);

  $('#e2-rank-sub').textContent =
    `${optLabelParam(param)}${unidade ? ` (${unidade})` : ''}`;
  renderPollutionPanel();
  renderDonutE2(param, sitioSel);
  setHTML('#read-e2-param', readE2Param(core, POLLUTION_GROUPS));

  if (!porSitio.length) { chart('chart-e2-rank')?.clear(); return; }

  chart('chart-e2-rank')?.setOption(barOption({
    categories: porSitio.map((r) => r.label),
    values: porSitio.map((r) => r.v),
    // O sitio selecionado no mapa acende aqui: era preciso procurar o nome
    // numa lista de 15 barras para saber onde ele caia.
    colors: porSitio.map((r) => (r.site === sitioSel ? '#561137' : DS_COLOR.pollution)),
    color: DS_COLOR.pollution,
    horizontal: true,
    decimals: 2,
  }), true);
}

/** Rotulo do parametro no idioma ativo, a partir dos grupos. */
function optLabelParam(v) {
  for (const m of POLLUTION_GROUPS) for (const f of m.familias) {
    const o = f.params.find((x) => x.v === v);
    if (o) return optLabel(o);
  }
  return v;
}

/**
 * Rosca de composicao da familia do parametro ativo -- so onde existe um
 * total declarado. O denominador e a SOMA DOS COMPONENTES listados, nao o
 * total reportado: para os HPAs os dois divergem (mediana 4%, ate 15%), e
 * usar o total faria as fatias nao fecharem em 100% sem explicacao.
 */
function renderDonutE2(param, sitioSel) {
  const card = $('#e2-donut-card');
  if (!card) return;
  const fam = polFamilia(param);
  const partes = fam?.params.filter((o) => o.parte) ?? [];
  if (!fam?.total || partes.length < 2) { card.hidden = true; return; }

  const pol = (core.pollution ?? []).filter(
    (r) => !sitioSel || r.Site === sitioSel);
  const fatias = partes.map((o) => ({
    name: optLabel(o),
    value: mean(pol.map((r) => r[o.v]).filter(Number.isFinite)) ?? 0,
  })).filter((x) => Number.isFinite(x.value) && x.value > 0);

  if (fatias.length < 2) { card.hidden = true; return; }
  card.hidden = false;

  const pt = getLang() === 'pt';
  const onde = sitioSel
    ? (core.sites.find((s) => s.Site === sitioSel)?.site_label ?? sitioSel)
    : (pt ? 'todos os sítios' : 'all sites');
  // O titulo nomeia o TOTAL, nao a familia: a rosca e a composicao daquele
  // total especifico, e familia e total nem sempre coincidem -- foi o que
  // fez parecerem faltar nutrientes na rosca do DIN.
  const rotuloTotal = optLabelParam(fam.total);
  $('#e2-donut-title').textContent = pt
    ? `Composição de ${rotuloTotal}` : `Composition of ${rotuloTotal}`;
  $('#e2-donut-sub').textContent = pt
    ? `${plural(fatias.length, 'componente')} que somam ${rotuloTotal} — ${onde}`
    : `${fatias.length} components that add up to ${rotuloTotal} — ${onde}`;

  chart('chart-e2-donut')?.setOption(donutOption(fatias, {
    unidade: polUnit(partes[0].v),
  }), true);
}

// ---------------------------------------------------------------------------
// Eixo 3 — rodolitos e pesca
// ---------------------------------------------------------------------------

/**
 * Numeros-destaque. Cada cartao traz o valor, o rotulo e UMA frase dizendo o
 * que o valor significa. Sem a frase o numero exige que o leitor ja saiba o
 * que e NCC -- e o painel existe justamente para quem nao sabe.
 */
function statCards(sel, itens) {
  const el = $(sel);
  if (!el) return;
  el.innerHTML = itens.map((c) => `
    <div class="stat-card"${c.tom ? ` data-tom="${c.tom}"` : ''}>
      <div class="stat-val">${c.valor}<em>${c.unidade ?? ''}</em></div>
      <div class="stat-lab">${c.rotulo}</div>
      <p class="stat-exp">${c.explica}</p>
    </div>`).join('');
}

/** Foto de um bloco, com a legenda do integramar.org. */
function renderBlocoFoto(id) {
  const f = BLOCO_FOTOS[id];
  const el = $('#' + id);
  if (!f || !el) return;
  const lg = getLang();
  const legenda = f[lg] ?? f.pt;
  el.innerHTML = `<figure>
    <img src="assets/img/fotos/${f.src}" alt="${legenda}" loading="lazy">
    <figcaption>${legenda}</figcaption>
  </figure>`;
}

function renderEixo3() {
  setHTML('#read-e3-rod', readE3Rodolitos(core));
  setHTML('#read-e3-pesca', readE3Pesca(core));
  renderBlocoFoto('e3-rod-foto');
  renderBlocoFoto('e3-pesca-foto');
  renderRodolitos();
  renderQuemPesca();
  renderPesca();
}

// ---------------------------------------------------------------------------
// Eixo 3 — quem vive da pesca
//
// Apenas distribuicoes MARGINAIS, calculadas no R. A tabela linha-a-linha tem
// idade, domicilio e experiencia de 63 pessoas de uma comunidade so; cruzar
// duas dessas variaveis reidentifica gente, e por isso ela fica fora do
// repositorio e o painel so recebe faixas prontas.
// ---------------------------------------------------------------------------

function renderQuemPesca() {
  const stats = core.fishers_stats ?? [];
  const ocup = core.fishers_ocup ?? [];
  const dist = core.fishers_dist ?? [];
  if (!stats.length) return;
  const pt = getLang() === 'pt';
  const st = (v) => stats.find((r) => r.var === v) ?? {};
  const exp = st('experience');
  const idade = st('age');
  const casa = st('household_size');

  // "no" em other_occupation significa NAO ter outra ocupacao -- ou seja,
  // viver so da pesca. Lido ao contrario, o numero inverte de sentido.
  const soPesca = ocup.find((r) => r.ocupacao === 'no')?.n ?? 0;
  const turismo = ocup.find((r) => r.ocupacao === 'turism')?.n ?? 0;
  const semResp = ocup.find((r) => r.ocupacao === 'sem_resposta')?.n ?? 0;
  const responderam = sum(ocup.map((r) => r.n)) - semResp;

  statCards('#e3-quem-stats', [
    { valor: fmtInt(exp.median), unidade: pt ? ' anos' : ' yrs', tom: 'destaque',
      rotulo: pt ? 'de pesca, na mediana' : 'of fishing, median',
      explica: pt
        ? `Metade pesca há <strong>${fmtInt(exp.median)} anos ou mais</strong>, e o mais experiente há ${fmtInt(exp.max)}. É uma frota de gente que viu o recife mudar.`
        : `Half have fished for <strong>${fmtInt(exp.median)} years or more</strong>, the most experienced for ${fmtInt(exp.max)}. This is a fleet that watched the reef change.` },
    { valor: `${fmtInt(soPesca)}/${fmtInt(responderam)}`, tom: 'alerta',
      rotulo: pt ? 'vivem só da pesca' : 'live from fishing alone',
      explica: pt
        ? `Os outros têm segunda ocupação — <strong>${fmtInt(turismo)} no turismo</strong>. A renda da pesca raramente é a única.`
        : `The rest have a second occupation — <strong>${fmtInt(turismo)} in tourism</strong>. Fishing income is rarely the only one.` },
    { valor: fmtInt(idade.median), unidade: pt ? ' anos' : ' yrs',
      rotulo: pt ? 'idade mediana' : 'median age',
      explica: pt
        ? `De ${fmtInt(idade.min)} a ${fmtInt(idade.max)} anos, com domicílios de ${fmtInt(casa.median)} pessoas na mediana.`
        : `From ${fmtInt(idade.min)} to ${fmtInt(idade.max)}, with households of ${fmtInt(casa.median)} people at the median.` },
  ]);

  const rotuloOcup = (o) => t(`ocup_${o}`);
  const ocupOrd = [...ocup].sort((a, b2) => a.n - b2.n);
  $('#e3-ocup-sub').textContent = pt
    ? `${responderam} de ${responderam + semResp} responderam`
    : `${responderam} of ${responderam + semResp} answered`;
  chart('chart-e3-ocup')?.setOption(barOption({
    categories: ocupOrd.map((r) => rotuloOcup(r.ocupacao)),
    values: ocupOrd.map((r) => r.n),
    // "Só da pesca" destacado: é a categoria que a pergunta persegue.
    colors: ocupOrd.map((r) => (r.ocupacao === 'no' ? DS_COLOR.fishers : '#B9C2D4')),
    horizontal: true,
    decimals: 0,
  }), true);

  const expDist = dist.filter((r) => r.var === 'experience')
    .sort((a, b2) => a.ordem - b2.ordem);
  $('#e3-exper-sub').textContent = pt
    ? `Pescadores por faixa de experiência (n = ${exp.n})`
    : `Fishers by experience band (n = ${exp.n})`;
  chart('chart-e3-exper')?.setOption(barOption({
    categories: expDist.map((r) => r.bucket),
    values: expDist.map((r) => r.n),
    color: DS_COLOR.fishers,
    decimals: 0,
  }), true);

  setHTML('#read-e3-quem', pt
    ? `As <strong>${fmtInt(idade.n)} entrevistas</strong> descrevem uma frota de linha e anzol no Porto, em setembro de 2025. `
      + `Os números abaixo são distribuições: idade, experiência e domicílio aparecem <strong>cada um por si</strong>, nunca cruzados — `
      + `numa comunidade deste tamanho, cruzar duas dessas variáveis identificaria pessoas.`
    : `The <strong>${fmtInt(idade.n)} interviews</strong> describe a hook-and-line fleet at Porto, September 2025. `
      + `The figures below are distributions: age, experience and household appear <strong>each on its own</strong>, never crossed — `
      + `in a community this size, crossing two of them would identify people.`);

  setHTML('#read-e3-quem-nota', pt
    ? `Duas ressalvas da amostra: <strong>todos os ${fmtInt(idade.n)} entrevistados são homens</strong>, então o painel não descreve a participação das mulheres na pesca — `
      + `descreve quem foi entrevistado. E <strong>${fmtInt(semResp)} não responderam</strong> sobre outra ocupação, por isso a proporção usa ${responderam} como denominador, não ${fmtInt(idade.n)}.`
    : `Two caveats about the sample: <strong>all ${fmtInt(idade.n)} respondents are men</strong>, so the panel does not describe women's role in fishing — `
      + `it describes who was interviewed. And <strong>${fmtInt(semResp)} did not answer</strong> about other occupations, so the proportion uses ${responderam} as denominator, not ${fmtInt(idade.n)}.`);
}

// ---------------------------------------------------------------------------
// Eixo 3a — rodolitos
// ---------------------------------------------------------------------------

function renderRodolitos() {
  const prod = core.productivity ?? [];
  if (!prod.length) return;
  const pt = getLang() === 'pt';
  const med = (campo) => mean(prod.map((r) => r[campo]));

  const ncc = med('NCC netflux');
  const ncp = med('NCP netflux');
  const vivos = med('Live rhodoliths') / 1000;
  const positivos = prod.filter((r) => r['NCC netflux'] > 0).length;

  statCards('#e3-rod-stats', [
    { valor: fmt(ncc, 1), unidade: ' mmol/m²/d', tom: ncc > 0 ? 'bom' : 'alerta',
      rotulo: pt ? 'Calcificação líquida' : 'Net calcification',
      explica: pt
        ? `Positiva: em 24 h o banco <strong>deposita mais carbonato do que dissolve</strong>. Vale para ${positivos} das ${prod.length} câmaras.`
        : `Positive: over 24 h the bed <strong>deposits more carbonate than it dissolves</strong>. True for ${positivos} of ${prod.length} chambers.` },
    { valor: fmt(ncp, 1), unidade: ' mmol/m²/d', tom: ncp > 0 ? 'bom' : 'alerta',
      rotulo: pt ? 'Produção líquida' : 'Net production',
      explica: pt
        ? 'Positiva: o banco <strong>produz mais matéria orgânica do que consome</strong> — é fonte de energia para o recife, não dreno.'
        : 'Positive: the bed <strong>produces more organic matter than it consumes</strong> — it feeds the reef rather than draining it.' },
    { valor: fmt(vivos, 1), unidade: ' kg DW/m²',
      rotulo: pt ? 'Rodolitos vivos' : 'Live rhodoliths',
      explica: pt
        ? 'A fração viva é a que calcifica. O banco morto segue como estrutura física, mas não acrescenta carbonato.'
        : 'Only the living fraction calcifies. The dead bed still provides structure, but adds no carbonate.' },
  ]);

  $('#e3-dn-sub').textContent = pt
    ? `Média das ${prod.length} câmaras, em mmol/m²/d`
    : `Mean of ${prod.length} chambers, in mmol/m²/d`;
  chart('chart-e3-rod')?.setOption(dayNightOption([
    { nome: pt ? 'Calcificação (NCC)' : 'Calcification (NCC)',
      dia: med('NCC daytime'), noite: med('NCC nighttime'), net: ncc,
      rotuloDia: pt ? 'Dia' : 'Day', rotuloNoite: pt ? 'Noite' : 'Night',
      rotuloNet: pt ? 'Saldo em 24 h' : 'Net over 24 h' },
    { nome: pt ? 'Produção (NCP)' : 'Production (NCP)',
      dia: med('NCP daytime'), noite: med('NCP nighttime'), net: ncp,
      rotuloDia: pt ? 'Dia' : 'Day', rotuloNoite: pt ? 'Noite' : 'Night',
      rotuloNet: pt ? 'Saldo em 24 h' : 'Net over 24 h' },
  ], { unidade: '' }), true);

  // Composicao do banco: os quatro componentes somam Total DW, entao a
  // participacao de cada um e uma leitura valida.
  const comp = [
    { k: 'Live rhodoliths',  pt: 'Rodolitos vivos',  en: 'Live rhodoliths' },
    { k: 'Dead rhodoliths',  pt: 'Rodolitos mortos', en: 'Dead rhodoliths' },
    { k: 'Macroalgae',       pt: 'Macroalgas',       en: 'Macroalgae' },
    { k: 'Invertebrates',    pt: 'Invertebrados',    en: 'Invertebrates' },
  ].map((o) => ({ name: pt ? o.pt : o.en, value: med(o.k) }))
   .filter((x) => Number.isFinite(x.value) && x.value > 0);

  const totalDW = sum(comp.map((x) => x.value));
  // Macroalgas e invertebrados existem, mas pesam ~0,05% do banco: a fatia
  // sai invisivel. Dizer isso evita que a legenda com duas cores sem fatia
  // pareca falha de desenho -- a ausencia E o resultado.
  const vivos2 = comp.find((x) => /vivos|Live/.test(x.name))?.value ?? 0;
  const mortos = comp.find((x) => /mortos|Dead/.test(x.name))?.value ?? 0;
  const pctRod = (100 * (vivos2 + mortos)) / totalDW;
  // Arredondar aqui a 1 casa produzia "rodolitos sao 100,0%; o resto nao
  // chega a 0,0%" -- uma frase sem sentido. Abaixo de 0,1% dizemos o limiar.
  const resto = 100 - pctRod;
  const limiar = (x) => (x < 0.1 ? (pt ? 'menos de 0,1' : 'less than 0.1') : fmt(x, 1));
  $('#e3-comp-sub').textContent = pt
    ? `Massa seca por m², média das ${prod.length} câmaras — ${fmt(totalDW / 1000, 1)} kg/m². `
      + `Macroalgas e invertebrados somam ${limiar(resto)}% da massa: existem no banco, `
      + `mas não têm fatia visível aqui.`
    : `Dry weight per m², mean of ${prod.length} chambers — ${fmt(totalDW / 1000, 1)} kg/m². `
      + `Macroalgae and invertebrates make up ${limiar(resto)}% of the mass: they are present in the bed, `
      + `but have no visible slice here.`;
  chart('chart-e3-comp')?.setOption(donutOption(comp, { unidade: ' g DW/m²' }), true);

  const local = core.sites.find((x) => x.Site === prod[0].Site)?.site_label ?? prod[0].Site;
  setHTML('#read-e3-rod-nota', pt
    ? `Uma ressalva de escala: são <strong>${prod.length} câmaras em um único banco</strong> (${local}), numa única campanha. Os números descrevem bem aquele banco naquele momento; não são uma média do arquipélago nem uma série temporal.`
    : `A note on scale: these are <strong>${prod.length} chambers in a single bed</strong> (${local}), from one campaign. They describe that bed at that moment well; they are not an archipelago average nor a time series.`);
}

// ---------------------------------------------------------------------------
// Eixo 3b — pesca e consumo
// ---------------------------------------------------------------------------

const CARNES = ['beef', 'pork', 'chicken', 'processed_meat', 'sheep'];
const MAR = ['fish', 'mollusk', 'crustaceans', 'cephalopods'];

function renderPesca() {
  const cons = (core.fishers_consumption ?? []).filter((r) => Number.isFinite(r.kg_week));
  const resumo = (core.fishers_summary ?? [])[0];
  if (!cons.length || !resumo) return;
  const pt = getLang() === 'pt';
  const kg = (f) => cons.find((r) => r.food === f)?.kg_week ?? 0;
  const dias = (f) => cons.find((r) => r.food === f)?.days_week ?? 0;

  // `game` vem com n = 0: nao foi medido, e nao e um zero de consumo. Entra
  // como ausente, nunca como zero, para nao baixar o denominador.
  const totalProt = sum(cons.map((r) => r.kg_week));
  const mar = sum(MAR.map(kg));
  const pctMar = totalProt > 0 ? (100 * mar) / totalProt : null;

  statCards('#e3-pesca-stats', [
    { valor: fmt(pctMar, 0), unidade: '%', tom: 'destaque',
      rotulo: pt ? 'do peso da proteína animal vem do mar' : 'of animal protein by weight comes from the sea',
      explica: pt
        ? `Peixe, molusco, crustáceo e cefalópode somam <strong>${fmt(mar, 1)} kg/semana</strong> contra <strong>${fmt(sum(CARNES.map(kg)), 1)} kg</strong> de todas as carnes juntas.`
        : `Fish, molluscs, crustaceans and cephalopods total <strong>${fmt(mar, 1)} kg/week</strong> against <strong>${fmt(sum(CARNES.map(kg)), 1)} kg</strong> for all meats combined.` },
    { valor: fmt(dias('fish'), 1), unidade: pt ? ' dias' : ' days',
      rotulo: pt ? 'por semana com peixe à mesa' : 'a week with fish on the table',
      explica: pt
        ? `Mais dias que frango (${fmt(dias('chicken'), 1)}) e que boi (${fmt(dias('beef'), 1)}). O peixe é a base, não a exceção.`
        : `More days than chicken (${fmt(dias('chicken'), 1)}) or beef (${fmt(dias('beef'), 1)}). Fish is the staple, not the exception.` },
    { valor: fmtInt(resumo.catch_median), unidade: ' kg',
      rotulo: pt ? 'captura declarada (mediana)' : 'reported catch (median)',
      explica: pt
        ? `Metade dos pescadores declara menos que isso. O maior valor relatado foi de ${fmtInt(resumo.catch_max)} kg.`
        : `Half the fishers report less than this. The largest reported was ${fmtInt(resumo.catch_max)} kg.` },
  ]);

  // Ordenado por kg, com o pescado destacado: a comparacao que importa e
  // mar contra terra, e ela so aparece se as cores separarem os dois.
  const ord = [...cons].sort((a, b2) => a.kg_week - b2.kg_week);
  $('#e3-cons-sub').textContent = pt
    ? `Quilos por semana, média de ${resumo.n_interviews} entrevistas`
    : `Kilos per week, mean of ${resumo.n_interviews} interviews`;
  chart('chart-e3-consumo')?.setOption(barOption({
    categories: ord.map((r) => t(`food_${r.food}`)),
    values: ord.map((r) => r.kg_week),
    colors: ord.map((r) => (MAR.includes(r.food) ? DS_COLOR.fishers : '#B9C2D4')),
    horizontal: true,
    unit: ' kg',
    decimals: 2,
  }), true);

  renderCaptura();
}

function renderCaptura() {
  const cap = core.fishers_catch ?? [];
  if (!cap.length) return;
  const pt = getLang() === 'pt';
  const citacoes = sum(cap.map((r) => r.n_fishers));
  const top = topN(cap, 'n_fishers', 12).reverse();

  $('#e3-cap-sub').textContent = pt
    ? `Quantos pescadores citaram cada espécie (${citacoes} citações, ${cap.length} nomes)`
    : `How many fishers cited each species (${citacoes} citations, ${cap.length} names)`;
  chart('chart-e3-captura')?.setOption(barOption({
    categories: top.map((r) => nomePopular(r.common_name)),
    values: top.map((r) => r.n_fishers),
    color: DS_COLOR.productivity,
    horizontal: true,
    decimals: 0,
  }), true);

  // Os nomes vem como declarados na entrevista e NAO sao normalizados aqui:
  // alterar dado bruto no painel esconderia o estado real do conjunto. Mas
  // quem le precisa saber onde as citacoes se repartem.
  //
  // Sao dois problemas distintos, e juntar os dois numa lista so -- como eu
  // fiz primeiro -- apagava a diferenca:
  //   1. erro de digitacao  (vbarracuda / barracuda): mesma coisa, duas linhas
  //   2. generico x especifico (atum / atum amarelo): categorias legitimas,
  //      mas o generico pode conter os especificos
  const nomes = cap.map((r) => r.common_name);
  const erros = [];
  const hierarquia = [];
  for (const n of nomes) {
    for (const o of nomes) {
      if (o >= n) continue;
      const [curto, longo] = n.length < o.length ? [n, o] : [o, n];
      if (longo.length - curto.length === 1 && longo.endsWith(curto)) {
        erros.push([longo, curto]);                      // "v" + barracuda
      } else if (longo.startsWith(curto + '_')) {
        hierarquia.push([curto, longo]);                 // atum / atum_amarelo
      }
    }
  }
  const par = ([a, b2]) => `<strong>${nomePopular(a)}</strong> / <strong>${nomePopular(b2)}</strong>`;
  const partes = [];
  if (erros.length) {
    partes.push(pt
      ? `${erros.map(par).join(', ')} diferem por uma única letra — quase certamente a mesma espécie digitada de dois jeitos.`
      : `${erros.map(par).join(', ')} differ by a single letter — almost certainly the same species typed two ways.`);
  }
  if (hierarquia.length) {
    partes.push(pt
      ? `Em ${hierarquia.map(par).join(', ')} convivem o nome genérico e o específico: quem citou o genérico pode ter se referido a qualquer um dos específicos, então as citações não se somam diretamente.`
      : `In ${hierarquia.map(par).join(', ')} the generic and the specific name coexist: whoever cited the generic may have meant either specific one, so citations do not simply add up.`);
  }
  setHTML('#read-e3-pesca-nota', partes.length
    ? (pt
      ? `Os nomes são os <strong>declarados na entrevista</strong>, sem padronização — é assim que o dado existe, e padronizar aqui esconderia isso. ${partes.join(' ')}`
      : `Names are <strong>as reported in the interview</strong>, unstandardised — that is how the data exists, and standardising here would hide it. ${partes.join(' ')}`)
    : '');
}

/** "xareu_preto" -> "Xareu preto". Apenas apresentacao; o dado nao muda. */
const nomePopular = (s) => {
  const x = s.replace(/_/g, ' ');
  return x.charAt(0).toUpperCase() + x.slice(1);
};


// ---------------------------------------------------------------------------
// Perfil do sítio
// ---------------------------------------------------------------------------

// Dispensa explicita do painel. Sem isto o X so limpava `selectedSite` e o
// renderProfile caia no ramo da area, reabrindo o painel no mesmo quadro: com
// um estado ou uma UC escolhidos o botao de fechar nao fechava nada.
//
// Guardamos QUAL recorte foi dispensado, nao um booleano: assim o painel fica
// fechado para aquela selecao, mas volta sozinho quando se escolhe outro
// lugar -- que e justamente quando ha algo novo para mostrar.
let perfilDispensadoEm = null;

const chaveSelecao = () => {
  const { selectedSite, level, zone, uf, uc } = store.state;
  return JSON.stringify([selectedSite ?? null, level, zone, uf, uc]);
};

function wireProfile() {
  $('#profile-close').onclick = () => {
    if (store.get('selectedSite')) store.set('selectedSite', null);
    perfilDispensadoEm = chaveSelecao();
    $('#profile').removeAttribute('data-open');
  };
}

// ---------------------------------------------------------------------------
// Comparacao entre conjuntos de sitios
// ---------------------------------------------------------------------------

/** Sitios do recorte que tem dado do conjunto ativo (peixes ou corais). */
/**
 * Os peixes de Noronha entram por UM caminho so.
 *
 * Com o ReefSYN carregado, os 9 sitios de Noronha ja estao entre os 232 de
 * peixe: conferido censo a censo, os 705 censos e a abundancia de cada um dos
 * 9 anos (2007 a 2019) sao IDENTICOS nas tabelas nativas (`fish_year`,
 * `fish_comp`, `fish_year_sp`) e nas do ReefSYN. Somar as duas fontes contava
 * Noronha em dobro -- cerca de 7% dos censos -- e inflava o "N sitios" do
 * painel. As tabelas nativas so valem quando NAO ha ReefSYN.
 */
function usaPeixesNativos() { return !core.national; }

function sitiosDoRecorte(ds = store.get('tDataset')) {
  const alvo = new Set(siteFilter());
  const fonte = (store.get('scope') === 'national' && core.national)
    ? core.national.sites : core.sites;
  const campo = `has_${ds}`;
  const base = fonte.filter((s) => s[campo]);
  return alvo.size ? base.filter((s) => alvo.has(s.Site)) : base;
}

/** Conjuntos que a comparacao sabe tratar. */
const CMP_DATASETS = ['fish', 'coral'];

/**
 * Criterios que REALMENTE dividem o recorte atual em dois ou mais grupos.
 *
 * Oferecer "por UC" num recorte com uma UC so, ou "por estado" num estado so,
 * produz o grupo unico que esvaziava o grafico. A lista e medida, nao fixa --
 * e e assim que desenhar um poligono sobre duas UCs faz aparecer a comparacao
 * entre elas sem que ninguem precise pedir.
 */
function criteriosDisponiveis() {
  const ds = store.get('tDataset');
  if (!CMP_DATASETS.includes(ds)) return [];
  const sitios = sitiosDoRecorte(ds);
  return CMP_CRITERIOS.filter((c) => {
    const vals = new Set(sitios.map((s) => chaveCmp(s, c.v)).filter((v) => v !== null));
    return vals.size >= 2;
  });
}

/**
 * Reconstroi os chips e garante que a dimensao escolhida ainda existe. Mudar
 * de recorte pode tirar uma comparacao do cardapio -- sair de um poligono com
 * duas UCs para um com uma so -- e ficar apontando para ela deixava o grafico
 * vazio sem explicacao.
 */
function sanearDim() {
  buildDimChips();
  const atual = store.get('tDim');
  const validos = [...$$('#t-dim .chip')].map((c) => c.dataset.v);
  if (validos.length && !validos.includes(atual)) {
    const fallback = validos.find((v) => !v.startsWith('cmp:')) ?? validos[0];
    const criterio = fallback.startsWith('cmp:') ? fallback.slice(4) : null;
    store.set({ tDim: fallback, cmpOn: !!criterio,
                ...(criterio ? { cmpBy: criterio } : {}) });
    $$('#t-dim .chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === fallback));
    $('#f-cmp')?.setAttribute('aria-pressed', !!criterio);
  }
}

/** Criterio ativo quando a dimensao e uma comparacao, senao null. */
function criterioAtivo() {
  const d = store.get('tDim') ?? '';
  return d.startsWith('cmp:') ? d.slice(4) : null;
}

/** Valor do criterio de comparacao para um sitio, ou null se nao se aplica. */
function chaveCmp(site, criterio) {
  if (criterio === 'protecao') return nivelProtecao(site);
  if (criterio === 'uf')       return site.uf ?? null;
  if (criterio === 'region')   return site.region ?? null;
  if (criterio === 'uc')       return site.ucs?.[0]?.nome ?? null;
  return null;
}

const rotuloCmp = (v, criterio) => {
  if (criterio === 'protecao') return t(`prot_${v}`);
  if (criterio === 'region')   return regionLabel(v);
  if (criterio === 'uf') {
    const s = (core.national?.sites ?? []).find((x) => x.uf === v);
    return tituloUF(s?.uf_nome ?? v);
  }
  return v;
};

/** Grupos disponiveis no recorte, com quantos sitios e censos cada um tem. */
function gruposDisponiveis() {
  const criterio = criterioAtivo() ?? store.get('cmpBy');
  const ds = store.get('tDataset');
  const sitios = sitiosDoRecorte(ds);
  const censos = new Map();
  const fonteEsforco = ds === 'coral'
    ? (core.coral_sy ?? []).map((r) => ({ site_id: r.site_id, n: r.n_eventos }))
    : (core.reef_fish_year ?? []).map((r) => ({ site_id: r.site_id, n: r.n_events }));
  for (const r of fonteEsforco) {
    censos.set(r.site_id, (censos.get(r.site_id) ?? 0) + r.n);
  }
  const m = new Map();
  for (const s of sitios) {
    const k = chaveCmp(s, criterio);
    if (k === null) continue;
    if (!m.has(k)) m.set(k, { v: k, sitios: 0, censos: 0 });
    const g = m.get(k);
    g.sitios += 1;
    g.censos += censos.get(s.Site) ?? 0;
  }
  const ordem = criterio === 'protecao' ? PROTECAO : null;
  const out = [...m.values()];
  return ordem
    ? out.sort((a, b2) => ordem.indexOf(a.v) - ordem.indexOf(b2.v))
    : out.sort((a, b2) => b2.sitios - a.sitios);
}

/** Grupos efetivamente escolhidos; por padrao, os dois maiores. */
function gruposAtivos() {
  const disp = gruposDisponiveis();
  const pick = store.get('cmpPick');
  const validos = disp.filter((g) => pick.includes(g.v));
  return validos.length >= 2 ? validos : disp.slice(0, Math.min(3, disp.length));
}

/**
 * A comparacao esta de fato acontecendo? Ligada nao basta: precisa de dois
 * grupos no recorte atual. Desenhar uma area com um nivel de protecao so
 * deixava os chips de metrica na tela e o grafico vazio.
 */
function comparandoDeFato() {
  return store.get('cmpOn')
    && store.get('tDataset') === 'fish'
    && gruposAtivos().length >= 2;
}

/** Cor estavel de cada grupo, pela ordem em que aparece. */
function coresCmp(grupos) {
  const m = new Map();
  grupos.forEach((g, i) => m.set(g.v, CMP_CORES[i % CMP_CORES.length]));
  return m;
}

/**
 * Os grupos ocupam a mesma geografia? Devolve o aviso, ou null.
 *
 * MEDIDO, nao afirmado. Um texto fixo sobre a composicao envelhece junto com o
 * dado -- este aqui afirmava que as ilhas nao tinham sitio fora de UC, e
 * deixou de ser verdade quando a classificacao de regiao foi corrigida.
 *
 * Importa porque "Protecao integral" tem 48% dos sitios nas ilhas oceanicas e
 * "Fora de UC" 7%, e as ilhas tem biomassa alta (cardumes de Melichthys
 * niger): sem o aviso, um contraste de geografia le-se como efeito da protecao.
 *
 * Mede, para cada regiao, o vao entre o grupo que mais e o que menos a ocupa.
 * So avisa com vao de 30 pontos ou mais.
 */
function avisoGeografia(criterio, chaves, { desenho = false } = {}) {
  const pt = getLang() === 'pt';
  const sit = sitiosDoRecorte();
  const porGrupo = new Map(chaves.map((k) => [k, new Map()]));
  for (const s2 of sit) {
    const m = porGrupo.get(chaveCmp(s2, criterio));
    if (!m) continue;
    m.set(s2.region, (m.get(s2.region) ?? 0) + 1);
  }
  let pior = null;
  for (const reg of uniq(sit.map((s2) => s2.region))) {
    const fracoes = chaves.map((g) => {
      const m = porGrupo.get(g);
      const tot = sum([...m.values()]);
      return { g, f: tot ? (m.get(reg) ?? 0) / tot : 0 };
    });
    const alto = fracoes.reduce((a, b2) => (b2.f > a.f ? b2 : a));
    const baixo = fracoes.reduce((a, b2) => (b2.f < a.f ? b2 : a));
    const vao = alto.f - baixo.f;
    if (vao >= 0.3 && (!pior || vao > pior.vao)) pior = { reg, alto, baixo, vao };
  }
  if (!pior) return null;
  const nm = (x) => rotuloCmp(x.g, criterio);
  return pt
    ? `Os grupos não ocupam a mesma geografia: <strong>${nm(pior.alto)}</strong> tem ${fmt(100 * pior.alto.f, 0)}% dos sítios em ${regionLabel(pior.reg)}, contra ${fmt(100 * pior.baixo.f, 0)}% de <strong>${nm(pior.baixo)}</strong>. Parte do contraste é geografia, não ${criterio === 'protecao' ? 'proteção' : 'o critério escolhido'}. ${desenho ? 'Desenhe uma área menor, dentro de uma região só.' : 'Escolha uma região para separar as duas coisas.'}`
    : `The groups do not share the same geography: <strong>${nm(pior.alto)}</strong> has ${fmt(100 * pior.alto.f, 0)}% of its sites in ${regionLabel(pior.reg)}, against ${fmt(100 * pior.baixo.f, 0)}% for <strong>${nm(pior.baixo)}</strong>. Part of the contrast is geography, not the chosen criterion. ${desenho ? 'Draw a smaller area, within a single region.' : 'Pick a region to separate the two.'}`;
}

/**
 * Avisos sobre a comparacao atual. Sao condicoes medidas no recorte, nao
 * texto fixo: um grupo com 1 sitio ou uma razao de esforco de 6:1 nao
 * sustentam a leitura, e o painel tem de dizer isso onde a pessoa le.
 */
function avisosComparacao(grupos) {
  const pt = getLang() === 'pt';
  const avisos = [];
  const { level, zone } = store.state;
  const desenho = !!store.get('drawnSites')?.length;
  // Num desenho o nivel e sempre 'archipelago', mas o recorte nao e o pais:
  // sem distinguir os dois, o conselho mandava "escolher uma regiao" para
  // quem acabou de circular pontos na tela e nao usa o seletor de regiao.
  const nacional = desenho
    || level === 'archipelago' || (level === 'zone' && !zone);

  // Confundimento geografico: MEDIDO, nao afirmado (ver `avisoGeografia`).
  if (nacional) {
    const a = avisoGeografia(store.get('cmpBy'), grupos.map((g) => g.v), { desenho });
    if (a) avisos.push(a);
  }

  const magros = grupos.filter((g) => g.sitios < 3);
  if (magros.length) {
    avisos.push(pt
      ? `${magros.map((g) => `<strong>${rotuloCmp(g.v, store.get('cmpBy'))}</strong> (${plural(g.sitios, 'sítio')})`).join(', ')} — grupo pequeno demais para sustentar uma média anual.`
      : `${magros.map((g) => `<strong>${rotuloCmp(g.v, store.get('cmpBy'))}</strong> (${g.sitios} site(s))`).join(', ')} — too small to support an annual mean.`);
  }

  const cen = grupos.map((g) => g.censos).filter((x) => x > 0);
  if (cen.length >= 2) {
    const razao = Math.max(...cen) / Math.min(...cen);
    if (razao >= 3) {
      avisos.push(pt
        ? `O esforço é desigual: o grupo mais amostrado tem <strong>${fmt(razao, 1)}×</strong> mais censos que o menos amostrado. A média anual do grupo pequeno oscila muito mais.`
        : `Effort is uneven: the most sampled group has <strong>${fmt(razao, 1)}×</strong> more censuses than the least. The smaller group's annual mean swings far more.`);
    }
  }
  return avisos;
}

/** Barra de controles da comparacao. */
function renderCmpBar() {
  const bar = $('#cmp-bar');
  if (!bar) return;
  const ligado = store.get('cmpOn');
  bar.hidden = !ligado;
  if (!ligado) return;

  const criterio = store.get('cmpBy');
  const disp = gruposDisponiveis();
  const ativos = new Set(gruposAtivos().map((g) => g.v));
  const cores = coresCmp(gruposAtivos());
  const pt = getLang() === 'pt';

  bar.innerHTML = `
    <div class="cmp-campo">
      <label for="cmp-by">${t('cmp_by')}</label>
      <select class="input" id="cmp-by">${CMP_CRITERIOS
        .map((o) => `<option value="${o.v}"${o.v === criterio ? ' selected' : ''}>${optLabel(o)}</option>`)
        .join('')}</select>
    </div>
    <div class="cmp-grupos">
      <label>${t('cmp_pick')}${disp.length < 2
        ? ` — <em class="cmp-nota">${t('cmp_um_grupo')}</em>` : ''}</label>
      <div class="chips" id="cmp-chips">${disp.map((g) => `
        <button class="chip" data-v="${g.v}" aria-pressed="${ativos.has(g.v)}"
          style="--c:${cores.get(g.v) ?? 'var(--muted)'}"
          title="${plural(g.sitios, pt ? 'sítio' : 'site')} · ${fmtInt(g.censos)} ${pt ? 'censos' : 'censuses'}">
          <span class="dot"></span>${rotuloCmp(g.v, criterio)}
          <em>${g.sitios}</em>
        </button>`).join('')}</div>
    </div>`;

  $('#cmp-by').onchange = (e) => {
    const novo = e.target.value;
    // O recorte visual segue o criterio: comparar por UC sem ver as UCs, ou
    // por estado sem ver os estados, obriga a adivinhar onde cada grupo esta.
    store.set({ cmpBy: novo, cmpPick: [] });
    aplicarCamadaPreferida();
    syncControlValues();
  };
  $('#cmp-chips').onclick = (ev) => {
    const b = ev.target.closest('.chip');
    if (!b) return;
    const v = b.dataset.v;
    const atual = gruposAtivos().map((g) => g.v);
    const prox = atual.includes(v) ? atual.filter((x) => x !== v) : [...atual, v];
    // Menos de dois grupos nao e comparacao; o clique que esvaziaria o par
    // simplesmente nao tira o ultimo.
    if (prox.length < 2) return;
    store.set('cmpPick', prox);
  };
}

/**
 * Camada espacial que o estado atual pede. Em comparacao manda o criterio;
 * fora dela, o nivel da hierarquia. Uma funcao so, porque os dois caminhos ja
 * se atropelaram: trocar de nivel desligava os poligonos de UC no meio de uma
 * comparacao dentro x fora.
 */
const CAMADA_DO_CRITERIO = { protecao: 'ucs', uc: 'ucs', uf: 'estados', region: 'none' };

function camadaPreferida(lvl = store.get('level'), nac = store.get('scope') === 'national') {
  if (!nac) return store.get('layer');
  if (store.get('cmpOn')) return CAMADA_DO_CRITERIO[store.get('cmpBy')] ?? 'none';
  // O automatismo ACRESCENTA, nunca remove: se ha uma camada escolhida na
  // mao, ela fica. Antes, escolher "Regiao" apagava os limites de UC que a
  // pessoa tinha acabado de ligar -- conveniencia desfazendo escolha.
  const atual = store.get('layer');
  const sugerida = ({ uf: 'estados', uc: 'ucs' }[lvl]) ?? null;
  if (sugerida) return sugerida;
  return atual;
}

/**
 * Ligar uma camada automaticamente -- por nivel ou por criterio -- sempre
 * entra em CONTORNO. Quem pediu "unidade de conservacao" quer ver as UCs com
 * os sitios dentro; generalizar e um pedido separado, feito no seletor.
 */
function aplicarCamadaPreferida() {
  store.set({ layer: camadaPreferida(), layerMode: 'contorno' });
}

/** Entrega ao mapa a cor de cada sitio, ou desliga o modo quando sai. */
function sincronizarCoresMapa() {
  if (!comparandoDeFato() || store.get('scope') !== 'national') {
    setCoresComparacao(null);
    return;
  }
  const criterio = store.get('cmpBy');
  const grupos = gruposAtivos();
  const cores = coresCmp(grupos);
  const ativos = new Set(grupos.map((g) => g.v));
  const porSitio = new Map();
  for (const s of sitiosDoRecorte()) {
    const k = chaveCmp(s, criterio);
    if (ativos.has(k)) porSitio.set(s.Site, cores.get(k));
  }
  setCoresComparacao((site) => porSitio.get(site) ?? null);
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
  if (perfilDispensadoEm === chaveSelecao()) { panel.removeAttribute('data-open'); return; }
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
    buildDimChips();
    wireTaxaBusca();
    syncDim();
    renderTrilha();
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
