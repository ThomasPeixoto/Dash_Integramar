// ===========================================================================
// Mapa interativo
// ===========================================================================

import { loadGeo, fmt, groupBy } from './data.js';
import { siteValues, colorScale, domainOf, radiusOf } from './metrics.js';
import { DS_COLOR, RAMP, t, varLabel } from './config.js';

const CENTER = [-3.855, -32.42];
const ZOOM = 13;

let map, baseLayers;
let markerLayer, polyLayer;
let store, core;

// ---------------------------------------------------------------------------
// Inicializacao
// ---------------------------------------------------------------------------

export function initMap(el, _store, _core) {
  store = _store;
  core = _core;

  map = L.map(el, {
    center: CENTER, zoom: ZOOM,
    // O controle de zoom nasce no canto superior esquerdo, onde fica o painel
    // de filtros; criamos desligado e adicionamos a direita.
    zoomControl: false, attributionControl: true,
    // zoomSnap fracionario deixa o enquadramento do fitBounds mais justo --
    // com snap inteiro sobra muito espaco nas bordas.
    zoomSnap: 0.25,
  });
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Os tiles do CARTO (basemaps.cartocdn.com) passaram a exigir chave de API e
  // devolvem um mosaico de aviso. Os basemaps do ArcGIS Online continuam
  // abertos e o "Light Gray Canvas" tem o mesmo papel visual do Positron.
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const ATTR = 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

  const gray = L.tileLayer(`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    { attribution: ATTR, maxZoom: 16 });
  const ocean = L.tileLayer(`${ESRI}/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}`,
    { attribution: 'Esri, GEBCO, NOAA, National Geographic', maxZoom: 13 });
  const sat = L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    { attribution: 'Esri, Maxar, Earthstar Geographics', maxZoom: 19 });

  gray.addTo(map);
  baseLayers = { Mapa: gray, Oceano: ocean, Satélite: sat };
  L.control.layers(baseLayers, null, { position: 'topright', collapsed: true }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
  polyLayer = L.layerGroup().addTo(map);

  // Qualquer mudanca de filtro, modo ou variavel redesenha. No Shiny isso era
  // um observe() por entrada; aqui e uma assinatura so, porque o redesenho
  // completo custa alguns milissegundos sobre no maximo 30 marcadores.
  store.on(['mode', 'variable', 'activeDatasets', 'level', 'zone', 'uc', 'site', 'layer', 'lang', 'scope'], render);

  render();
  fitToData();
  return map;
}

// ---------------------------------------------------------------------------
// Filtro de sitios (hierarquia)
// ---------------------------------------------------------------------------

// A escala ativa decide de onde vem a lista de sitios. As duas tabelas tem a
// mesma forma (ver national.js), entao daqui para baixo nada mais ramifica.
const scopeSites = () =>
  (store.get('scope') === 'national' && core.national) ? core.national.sites : core.sites;
const scopeCoords = () =>
  (store.get('scope') === 'national' && core.national) ? core.national.coords : core.site_coords;

function filteredSites() {
  const { level, zone, site, uc, activeDatasets } = store.state;
  let rows = scopeSites();

  if (level === 'zone' && zone) rows = rows.filter((r) => r.zone === zone);
  if (level === 'uc'   && uc)   rows = rows.filter((r) => (r.ucs ?? []).some((u) => u.nome === uc));
  if (level === 'site' && site) rows = rows.filter((r) => r.Site === site);

  // Um sitio so entra se tiver pelo menos um dos conjuntos ativos. A clausula
  // has_fish faltava na versao anterior e sumia com os 4 sitios que so o
  // ReefSYN cobre.
  return rows.filter((r) => activeDatasets.some((ds) => r[`has_${ds}`]));
}

const siteLabel = (code) =>
  scopeSites().find((s) => s.Site === code)?.site_label ?? code;

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

function render() {
  markerLayer.clearLayers();
  const mode = store.get('mode');
  // Com uma camada espacial ligada os poligonos ja carregam o valor e o
  // clique; manter os pontos por cima so empilharia dois alvos no mesmo
  // lugar. A legenda continua sendo montada pelos renderers.
  const onlyLegend = store.get('layer') !== 'none';
  if (mode === 'datasets') renderDatasets(onlyLegend);
  else renderVariable(mode, onlyLegend);
  renderPolygons();
}

/** Modo "conjuntos de dados": um marcador por (sitio, conjunto). */
function renderDatasets(onlyLegend = false) {
  const sites = filteredSites();
  const active = store.get('activeDatasets');
  const coords = scopeCoords();

  if (!onlyLegend) for (const s of sites) {
    const here = coords.filter(
      (c) => c.Site === s.Site && active.includes(c.dataset) && s[`has_${c.dataset}`]
    );
    if (!here.length) continue;

    // Cada marcador vai na coordenada ORIGINAL do seu conjunto. So aplicamos
    // deslocamento quando duas fontes declaram EXATAMENTE a mesma coordenada
    // -- caso contrario um marcador cobriria o outro e a divergencia real
    // entre fontes (ate 655 m em Cagarras) ficaria escondida.
    const byPoint = groupBy(here, (c) => `${c.decimalLatitude},${c.decimalLongitude}`);
    for (const [, group] of byPoint) {
      group.forEach((c, i) => {
        let dLat = 0, dLon = 0;
        if (group.length > 1) {
          const a = i * (2 * Math.PI / group.length);
          dLat = Math.sin(a) * 0.00018;
          dLon = Math.cos(a) * 0.00018;
        }
        addMarker({
          lat: c.decimalLatitude + dLat,
          lon: c.decimalLongitude + dLon,
          color: DS_COLOR[c.dataset],
          radius: 8,
          site: s.Site,
          dataset: c.dataset,
          tooltip: tipDataset(s, c.dataset),
        });
      });
    }
  }
  addLegendCategorical();
}

/** Modos de variavel: um marcador por sitio, na coordenada daquele conjunto. */
function renderVariable(mode, onlyLegend = false) {
  const varName = store.get('variable');
  const { values, unit } = siteValues(core, mode, varName, store.get('scope'));
  const domain = domainOf(values);
  const scale = colorScale(RAMP[mode] ?? RAMP.datasets, domain);

  const sites = filteredSites().filter((s) => s[`has_${mode}`]);
  const coords = scopeCoords().filter((c) => c.dataset === mode);

  if (!onlyLegend) for (const s of sites) {
    const c = coords.find((x) => x.Site === s.Site);
    if (!c) continue;
    const v = values.get(s.Site) ?? null;
    addMarker({
      lat: c.decimalLatitude,
      lon: c.decimalLongitude,
      color: scale(v),
      radius: radiusOf(v, domain),
      site: s.Site,
      dataset: mode,
      tooltip: tipValue(s, mode, varName, v, unit),
    });
  }
  addLegendContinuous(varLabel(mode, varName), domain, RAMP[mode] ?? RAMP.datasets, unit);
}

/**
 * O marcador nao abre popup: o painel de perfil ja mostra a mesma informacao
 * com mais espaco, e os dois juntos se sobrepunham na tela. Fica o tooltip de
 * uma linha no hover, para identificar o ponto antes de clicar.
 */
function addMarker({ lat, lon, color, radius, site, dataset, tooltip }) {
  L.circleMarker([lat, lon], {
    radius,
    fillColor: color,
    color: '#fff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.86,
    className: 'site-marker',
  })
    .bindTooltip(tooltip, { direction: 'top', offset: [0, -4], className: 'map-tip' })
    .on('click', () => store.set({ selectedSite: site, selectedDataset: dataset }))
    .addTo(markerLayer);
}

// ---------------------------------------------------------------------------
// Camadas espaciais (recife mapeado / faixa costeira)
// ---------------------------------------------------------------------------

let geoCache = {};

async function renderPolygons() {
  polyLayer.clearLayers();
  const layer = store.get('layer');
  // Setores costeiros e regioes recifais foram construidos so para Noronha;
  // na escala nacional nao ha equivalente e a camada fica indisponivel.
  if (layer === 'none' || store.get('scope') === 'national') return;

  const name = layer === 'reef' ? 'reef_regions' : 'coastal_sectors';
  if (!geoCache[name]) geoCache[name] = await loadGeo(name);
  // Entre o await e aqui o usuario pode ter trocado de camada.
  if (store.get('layer') !== layer) return;

  const mode = store.get('mode');
  const varName = store.get('variable');
  const isVar = mode !== 'datasets';
  const { values, unit } = isVar
    ? siteValues(core, mode, varName, store.get('scope'))
    : { values: new Map(), unit: '' };
  const domain = domainOf(values);
  const scale = colorScale(RAMP[mode] ?? RAMP.datasets, domain);

  const active = store.get('activeDatasets');
  const visible = new Set(filteredSites().map((s) => s.Site));

  L.geoJSON(geoCache[name], {
    filter: (f) => {
      const p = f.properties;
      // Os poligonos vem rotulados por conjunto; so mostramos os do modo
      // ativo (ou dos conjuntos ligados, no modo "conjuntos de dados").
      if (p.dataset) {
        if (isVar && p.dataset !== mode) return false;
        if (!isVar && !active.includes(p.dataset)) return false;
      }
      return !p.Site || visible.has(p.Site) || !p.dataset;
    },
    style: (f) => {
      const p = f.properties;
      // Regiao recifal sem sitio associado: cinza, so para contexto.
      if (!p.Site) {
        return { color: '#8C96AE', weight: 1, opacity: 0.5,
                 fillColor: '#8C96AE', fillOpacity: 0.12, dashArray: '3,4' };
      }
      const v = isVar ? values.get(p.Site) : null;
      const fill = isVar ? scale(v) : (DS_COLOR[p.dataset] ?? '#353F7C');
      return { color: fill, weight: 1.4, opacity: 0.85, fillColor: fill, fillOpacity: 0.3 };
    },
    onEachFeature: (f, lyr) => {
      const p = f.properties;
      if (!p.Site) { lyr.bindTooltip(t('orphan_reef'), { sticky: true }); return; }
      const v = isVar ? values.get(p.Site) : null;
      const label = siteLabel(p.Site);
      lyr.bindTooltip(
        isVar ? tipValue({ site_label: label }, mode, varName, v, unit)
              : tipDataset({ site_label: label }, p.dataset),
        { sticky: true, className: 'map-tip' }
      );
      lyr.on('click', () => store.set({ selectedSite: p.Site, selectedDataset: p.dataset ?? mode }));
      lyr.on('mouseover', () => lyr.setStyle({ weight: 2.6, fillOpacity: 0.42 }));
      lyr.on('mouseout',  () => lyr.setStyle({ weight: 1.4, fillOpacity: 0.3 }));
    },
  }).addTo(polyLayer);
}

// ---------------------------------------------------------------------------
// Popups
// ---------------------------------------------------------------------------

const tipDataset = (s, dataset) =>
  `<b>${s.site_label}</b><span>${t(`ds_${dataset}`)}</span>`;

const tipValue = (s, mode, varName, v, unit) => {
  const val = Number.isFinite(v) ? `${fmt(v, 1)}${unit}` : '—';
  return `<b>${s.site_label}</b><span>${varLabel(mode, varName)}: <i>${val}</i></span>`;
};

// ---------------------------------------------------------------------------
// Legenda
// ---------------------------------------------------------------------------

/**
 * A legenda e escrita num slot da faixa de controles, nao num L.control sobre
 * o mapa: sobre o mapa ela ficava embaixo do painel de perfil.
 *
 * A faixa e reconstruida a cada troca de eixo, entao o slot some e volta. Por
 * isso guardamos o ultimo conteudo: quem reconstroi a faixa chama
 * setLegendSlot e a legenda reaparece sem precisar redesenhar o mapa inteiro.
 */
let legendSel = '#legend';
let legendHTML = '';

export function setLegendSlot(sel) {
  legendSel = sel;
  setLegend(legendHTML);
}

function setLegend(html) {
  legendHTML = html;
  const el = document.querySelector(legendSel);
  if (el) el.innerHTML = html;
}

/**
 * No modo "conjuntos de dados" nao ha legenda propria: os chips de conjunto,
 * logo acima no painel, ja trazem nome e cor de cada um. Uma segunda lista
 * identica so ocupava espaco.
 */
function addLegendCategorical() {
  setLegend('');
}

function addLegendContinuous(label, [lo, hi], ramp, unit) {
  setLegend(`<div class="lg-title">${label}</div>
    <div class="lg-ramp" style="background:linear-gradient(90deg,${ramp.join(',')})"></div>
    <div class="lg-ends"><span>${fmt(lo, 1)}${unit}</span><span>${fmt(hi, 1)}${unit}</span></div>`);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Enquadra a partir das coordenadas reais, nao de um zoom fixo. Sem filtro
 * usa os conjuntos ativos: cada eixo cobre um subconjunto dos sitios, e
 * enquadrar os 30 pontos sempre deixaria sobra em volta nos eixos menores.
 */
export function fitToData() {
  const ativos = store.get('activeDatasets');
  const todas = scopeCoords();
  const pts = todas
    .filter((c) => ativos.includes(c.dataset))
    .map((c) => [c.decimalLatitude, c.decimalLongitude]);
  const base = pts.length ? pts : todas.map((c) => [c.decimalLatitude, c.decimalLongitude]);
  if (base.length) map.fitBounds(L.latLngBounds(base), { padding: [40, 40], maxZoom: 14 });
}

export function resizeMap() { map?.invalidateSize(); }

/**
 * Redesenho forcado. Necessario quando o container muda de lugar (o mapa
 * migra entre os slots dos eixos) ou quando o idioma muda: nesses casos
 * nenhuma chave do estado muda, entao as assinaturas do store nao disparam.
 */
export function redrawMap() { if (map) render(); }

export function flyToSite(code) {
  const c = scopeCoords().find((x) => x.Site === code);
  if (c) map.flyTo([c.decimalLatitude, c.decimalLongitude], 15, { duration: 0.8 });
}
