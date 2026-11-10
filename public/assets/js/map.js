// ===========================================================================
// Mapa interativo
// ===========================================================================

import { loadGeo, fmt, groupBy } from './data.js';
import { siteValues, areaValues, colorScale, domainOf, radiusOf } from './metrics.js';
import { DS_COLOR, RAMP, DATASETS, NATIONAL_DATASETS, t, varLabel } from './config.js';
import { tituloUC } from './national.js';

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
  L.control.zoom({ position: "topright" }).addTo(map);

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

  // O Leaflet guarda o tamanho do container e so o remede quando mandam. Como
  // o #mapkit nasce escondido e depois MIGRA de slot entre os eixos, a medida
  // ficava velha: o mapa se achava de 0 px e pedia um unico tile para uma area
  // de 959x337. Um invalidateSize() solto depois do reflow nao resolve, porque
  // nao se sabe em que quadro o layout assenta. O observador remede sempre que
  // o tamanho muda de fato, inclusive ao trocar de aba e ao girar a tela.
  if (typeof ResizeObserver === 'function') {
    let w0 = 0, h0 = 0;
    new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;                 // slot escondido: nada a medir
      if (w === w0 && h === h0) return;     // evita laco com o proprio resize
      w0 = w; h0 = h;
      map.invalidateSize({ animate: false });
    }).observe(el);
  }

  // Qualquer mudanca de filtro, modo ou variavel redesenha. No Shiny isso era
  // um observe() por entrada; aqui e uma assinatura so, porque o redesenho
  // completo custa alguns milissegundos sobre no maximo 30 marcadores.
  store.on(['mode', 'variable', 'activeDatasets', 'level', 'zone', 'uf', 'uc', 'site',
            'layer', 'layerMode', 'drawnSites', 'lang', 'scope'], render);
  // Separado do render: so o RECORTE move a camera. Ligar ou desligar um
  // conjunto, ou trocar de variavel, nao deve arrastar o mapa debaixo de
  // quem acabou de posicionar a vista.
  store.on(['level', 'zone', 'uf', 'uc', 'site'], fitToSelection);

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

  // O conjunto desenhado substitui a hierarquia: quem circulou pontos na tela
  // quer aqueles pontos, nao a intersecao deles com um nivel administrativo.
  const desenhados = store.get('drawnSites');
  if (desenhados?.length) {
    const dentro = new Set(desenhados);
    return rows.filter((r) => dentro.has(r.Site))
      .filter((r) => activeDatasets.some((ds) => r[`has_${ds}`]));
  }

  const uf = store.get('uf');
  if (level === 'zone' && zone) rows = rows.filter((r) => r.zone === zone);
  if (level === 'uf'   && uf)   rows = rows.filter((r) => r.uf === uf);
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
  // So a GENERALIZACAO esconde os pontos, e so fora de uma comparacao.
  // Em contorno o poligono e contexto -- mostra onde a area esta, com os
  // sitios dentro dela visiveis. Era o mesmo controle fazendo as duas coisas:
  // ligar "unidade de conservacao" para ver as UCs apagava os pontos junto.
  const generalizando = store.get('layer') !== 'none'
    && store.get('layerMode') === 'geral';
  const onlyLegend = generalizando && !corDeGrupo;
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
  // Em comparacao o ponto toma a cor do GRUPO; fora dela, a do conjunto de
  // dados. Sitio que nao entra em nenhum grupo fica cinza, em vez de manter
  // a cor do conjunto e parecer que participa da comparacao.
  const cor = corDeGrupo ? (corDeGrupo(site) ?? '#B9C2D4') : color;
  L.circleMarker([lat, lon], {
    radius,
    fillColor: cor,
    color: '#fff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.86,
    className: 'site-marker',
  })
    .bindTooltip(tooltip, { direction: 'top', offset: [0, -4], className: 'map-tip' })
    .on('click', () => selecionarSitio(site, dataset))
    .addTo(markerLayer);
}

// ---------------------------------------------------------------------------
// Camadas espaciais (recife mapeado / faixa costeira)
// ---------------------------------------------------------------------------

let geoCache = {};
// Geração do desenho de polígonos: o carregamento do GeoJSON é assíncrono, e
// sem este token um segundo render iniciado durante o await adicionaria suas
// camadas por cima das do primeiro.
let geracaoPoly = 0;

async function renderPolygons(geracao = ++geracaoPoly) {
  polyLayer.clearLayers();
  const layer = store.get('layer');
  if (layer === 'none') return;

  // Na escala nacional os recortes sao administrativos (estado, UC) e o modo
  // e de GENERALIZACAO: o valor deixa de viver no ponto e passa a viver no
  // poligono que o contem. Os setores costeiros e as regioes recifais de
  // Noronha nao tem equivalente aqui.
  if (store.get('scope') === 'national') return renderAreas(layer, geracao);

  const name = layer === 'reef' ? 'reef_regions' : 'coastal_sectors';
  if (!geoCache[name]) geoCache[name] = await loadGeo(name);
  // Entre o await e aqui o usuario pode ter trocado de camada, ou outro
  // render pode ter comecado.
  if (store.get('layer') !== layer || geracao !== geracaoPoly) return;

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
      lyr.on('click', () => selecionarSitio(p.Site, p.dataset ?? mode));
      lyr.on('mouseover', () => lyr.setStyle({ weight: 2.6, fillOpacity: 0.42 }));
      lyr.on('mouseout',  () => lyr.setStyle({ weight: 1.4, fillOpacity: 0.3 }));
    },
  }).addTo(polyLayer);
}

/**
 * Choropleth por area. Cada poligono recebe a cor do agregado daquela area,
 * e o clique filtra o painel inteiro para ela.
 */
async function renderAreas(layer, geracao) {
  const nome = layer === 'estados' ? 'estados' : 'ucs';
  if (!geoCache[nome]) geoCache[nome] = await loadGeo(nome);
  // Troca de camada ou outro render durante o await: este resultado e velho.
  if (store.get('layer') !== layer || geracao !== geracaoPoly) return;

  const mode = store.get('mode');
  const varName = store.get('variable');
  const { values, unit, campo } = areaValues(core, nome, mode, varName);
  const domain = domainOf(values);
  const scale = colorScale(RAMP[mode] ?? RAMP.datasets, domain);
  const chave = nome === 'estados' ? 'uf' : 'cd_cnuc';
  const rotuloDe = (p) => nome === 'estados' ? tituloUC(p.uf_nome ?? p.uf) : tituloUC(p.nome_uc);

  const camada = L.geoJSON(geoCache[nome], {
    style: (f) => {
      const v = values.get(f.properties[chave]);
      const temDado = Number.isFinite(v);
      // Contorno (ou comparacao): o poligono e CONTEXTO, sem pintar valor.
      // Um coropletico cheio competiria com as cores dos pontos e as duas
      // leituras se anulariam.
      if (corDeGrupo || store.get('layerMode') !== 'geral') {
        return { color: '#6B7FC7', weight: 1, opacity: 0.75,
                 fillColor: '#6B7FC7', fillOpacity: 0.07 };
      }
      return {
        color: temDado ? '#ffffff' : '#B9C2D4',
        weight: temDado ? 1.2 : 0.8,
        opacity: temDado ? 0.9 : 0.5,
        fillColor: temDado ? scale(v) : '#E8ECF4',
        // Area sem dado fica quase transparente: o mapa mostra que ela
        // existe, sem sugerir valor zero.
        fillOpacity: temDado ? 0.78 : 0.25,
      };
    },
    onEachFeature: (f, lyr) => {
      const p = f.properties;
      const k = p[chave];
      const v = values.get(k);
      const label = rotuloDe(p);
      lyr.bindTooltip(
        Number.isFinite(v)
          ? `<b>${label}</b><span>${varLabel(mode, campo)}: <i>${fmt(v, 1)}${unit}</i></span>`
          : `<b>${label}</b><span>${t('no_data')}</span>`,
        { sticky: true, className: 'map-tip' }
      );
      lyr.on('click', () => {
        if (!Number.isFinite(v)) return;
        store.set(nome === 'estados'
          ? { level: 'uf', uf: k, zone: null, uc: null, site: null }
          : { level: 'uc', uc: tituloUC(p.nome_uc), zone: null, uf: null, site: null });
      });
      // O realce do hover tem de respeitar o MODO. Em contorno/comparacao o
      // poligono e so contexto (preenchimento 0,07); subir para 0,9 o pintava de
      // azul solido, e o mouseout "restaurava" para 0,78 -- o valor do modo
      // coropletico --, entao o estado ficava azul para sempre. O mouseout agora
      // devolve o estilo que a propria camada calculou, seja qual for o modo.
      const contexto = corDeGrupo || store.get('layerMode') !== 'geral';
      lyr.on('mouseover', () => lyr.setStyle(
        contexto ? { weight: 2.2, fillOpacity: 0.2 } : { weight: 2.4, fillOpacity: 0.9 }));
      lyr.on('mouseout', () => camada.resetStyle(lyr));
    },
  });
  camada.addTo(polyLayer);

  if (!corDeGrupo && store.get('layerMode') === 'geral') {
    addLegendContinuous(varLabel(mode, campo), domain, RAMP[mode] ?? RAMP.datasets, unit);
  }
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

// ---------------------------------------------------------------------------
// Desenho livre: seleciona um conjunto de sitios pela mao
//
// Sem plugin. O leaflet-draw resolveria, mas traz um vetor de funcionalidades
// que nao usamos e o projeto nao carrega nada de CDN -- seriam ~40 KB
// vendorizados para um laco e um teste de ponto em poligono, que cabem aqui.
// ---------------------------------------------------------------------------

let camadaDesenho = null;   // o poligono fechado, enquanto existir
let tracado = null;         // a linha sendo arrastada
let pontosTracado = [];
let aoFecharDesenho = null;
let modoDesenho = false;

/** Ponto em poligono por lancamento de raio. Coordenadas em [lat, lon]. */
function dentroDoPoligono(lat, lon, poly) {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    // A aresta cruza a horizontal do ponto, e o cruzamento fica a direita?
    if ((yi > lat) !== (yj > lat)
        && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      dentro = !dentro;
    }
  }
  return dentro;
}

const ESTILO_DESENHO = {
  color: '#982263', weight: 2, opacity: 0.95,
  fillColor: '#982263', fillOpacity: 0.08, dashArray: '5,4',
};

function iniciarTracado(e) {
  // So botao esquerdo; o direito e do menu de contexto do navegador.
  if (e.originalEvent?.button && e.originalEvent.button !== 0) return;
  pontosTracado = [e.latlng];
  tracado?.remove();
  tracado = L.polyline(pontosTracado, { ...ESTILO_DESENHO, fill: false }).addTo(map);
  map.on('mousemove', moverTracado);
  map.on('mouseup', fecharTracado);
}

function moverTracado(e) {
  pontosTracado.push(e.latlng);
  tracado.setLatLngs(pontosTracado);
}

/** Area do poligono em graus^2; serve so para detectar tracado degenerado. */
function areaAprox(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].lng + pts[i].lng) * (pts[j].lat - pts[i].lat);
  }
  return Math.abs(a / 2);
}

/** Retangulo que cobre o tracado, no sentido anti-horario. */
function caixaDe(pts) {
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const s = Math.min(...lats), n = Math.max(...lats);
  const o = Math.min(...lngs), l = Math.max(...lngs);
  return [[s, o], [s, l], [n, l], [n, o]];
}

function fecharTracado() {
  map.off('mousemove', moverTracado);
  map.off('mouseup', fecharTracado);
  tracado?.remove();
  tracado = null;

  const pts = pontosTracado;
  pontosTracado = [];

  // Um clique sem arrasto nao e desenho.
  if (pts.length < 2) return;

  // O navegador AGRUPA mousemove: um arrasto real entrega poucos pontos, e a
  // versao anterior exigia tres vertices e descartava o resto em silencio --
  // arrastar o mouse no mapa simplesmente nao fazia nada. Quando o tracado
  // nao tem vertices suficientes para um laco, ou tem area desprezivel (um
  // arrasto em linha reta), vale o RETANGULO que o cobre: e o que a pessoa
  // delimitou com o gesto, e e o resultado previsivel de arrastar.
  const laco = pts.length >= 6 && areaAprox(pts) > 1e-6;
  const poly = laco ? pts.map((p) => [p.lat, p.lng]) : caixaDe(pts);

  // Retangulo de poucos pixels: foi um clique tremido, nao uma selecao.
  if (!laco) {
    const a = map.latLngToContainerPoint(L.latLng(poly[0][0], poly[0][1]));
    const b = map.latLngToContainerPoint(L.latLng(poly[2][0], poly[2][1]));
    if (Math.abs(a.x - b.x) < 8 || Math.abs(a.y - b.y) < 8) return;
  }

  camadaDesenho?.remove();
  camadaDesenho = L.polygon(poly, ESTILO_DESENHO).addTo(map);

  // Quais sitios caem dentro. Usa as coordenadas reais de cada conjunto, nao
  // o centroide do sitio: um sitio cujo ponto de coral esta dentro e o de
  // peixe fora conta como dentro -- e o que a pessoa circulou na tela.
  const codes = new Set();
  for (const c of scopeCoords()) {
    if (Number.isFinite(c.decimalLatitude) && Number.isFinite(c.decimalLongitude)
        && dentroDoPoligono(c.decimalLatitude, c.decimalLongitude, poly)) {
      codes.add(c.Site);
    }
  }
  aoFecharDesenho?.([...codes]);
}

/** Liga ou desliga o modo de desenho. `onDone` recebe os codigos de sitio. */
export function setModoDesenho(on, onDone) {
  if (!map) return;
  modoDesenho = on;
  aoFecharDesenho = onDone;
  map.getContainer().style.cursor = on ? 'crosshair' : '';
  if (on) {
    // Arrastar o mapa e arrastar o laco sao o mesmo gesto: um dos dois tem
    // de sair enquanto o outro vale.
    map.dragging.disable();
    map.on('mousedown', iniciarTracado);
  } else {
    map.dragging.enable();
    map.off('mousedown', iniciarTracado);
    map.off('mousemove', moverTracado);
    map.off('mouseup', fecharTracado);
    tracado?.remove(); tracado = null;
    pontosTracado = [];
  }
}

/** Apaga o poligano desenhado, sem sair do modo. */
export function limparDesenho() {
  camadaDesenho?.remove();
  camadaDesenho = null;
}

/**
 * Clique num ponto do mapa. Alem de abrir o perfil, RECORTA o painel naquele
 * sitio: `selectedSite` so alimentava o painel lateral, enquanto os graficos
 * leem `level`/`site` pelo siteFilter(). Clicar num ponto abria a ficha e
 * deixava as series mostrando a costa inteira -- duas leituras do mesmo clique
 * discordando entre si na mesma tela.
 */
let semEnquadrar = false;

/**
 * Cor por grupo de comparacao, injetada pelo main. O mapa nao sabe calcular
 * grupos -- isso vive num lugar so -- mas precisa pintar o ponto da cor do
 * grupo dele, senao a comparacao existe no grafico e nao no mapa.
 */
let corDeGrupo = null;
export function setCoresComparacao(fn) { corDeGrupo = fn; render(); }

function selecionarSitio(code, dataset) {
  // Clicar de novo no sitio ja selecionado DESFAZ o recorte e devolve a costa
  // inteira. Antes o segundo clique reescrevia o mesmo estado, nada mudava e
  // nao havia como voltar sem ir ao seletor -- o mapa virava uma via de mao
  // unica. Aqui deixamos o reenquadramento acontecer: voltar a ver todos os
  // sitios faz parte de desfazer.
  if (store.get('site') === code) {
    store.set({
      selectedSite: null, selectedDataset: null,
      level: 'archipelago', site: null, zone: null, uf: null, uc: null,
    });
    return;
  }

  // O grafico segue o conjunto do marcador clicado. Um ponto laranja e de
  // CORAL; manter a serie em peixes mostrava, logo abaixo, dados de um
  // conjunto que nao existe naquele sitio.
  const validos = (store.get('scope') === 'national' && core.national)
    ? NATIONAL_DATASETS : DATASETS;
  const patch = {
    selectedSite: code, selectedDataset: dataset,
    level: 'site', site: code, zone: null, uf: null, uc: null,
  };
  // `dataset` pode ser o MODO (poluicao, produtividade) quando o mapa pinta
  // uma variavel em vez de conjuntos; so trocamos a serie quando o que veio
  // e de fato um conjunto que o grafico sabe desenhar.
  if (validos.includes(dataset) && store.get('tDataset') !== dataset) {
    patch.tDataset = dataset;
    patch.tTaxa = [];
    const ativos = store.get('activeDatasets');
    if (!ativos.includes(dataset)) patch.activeDatasets = [...ativos, dataset];
  }

  // O mapa ja esta no ponto que a pessoa acabou de clicar; reenquadrar aqui
  // daria um salto sem motivo. So o seletor e o clique em poligono movem a
  // camera.
  semEnquadrar = true;
  store.set(patch);
  semEnquadrar = false;
}

/**
 * Enquadra o que o RECORTE alcanca. `fitToData` usa scopeCoords(), que ignora
 * o recorte e portanto sempre devolve a costa inteira: escolher a REBIO do
 * Arvoredo deixava o mapa na America do Sul, e so restava achar Santa
 * Catarina na mao. Escolher um lugar deve levar ate ele.
 */
export function fitToSelection() {
  if (!map || semEnquadrar) return;
  const codes = new Set(filteredSites().map((s) => s.Site));
  // Sem recorte -- ao limpar a selecao, por exemplo -- o quadro volta para
  // tudo o que esta visivel. Antes isto era um `return` e o mapa ficava preso
  // no ultimo lugar visitado, mostrando um estado enquanto o painel ja dizia
  // "Brasil inteiro".
  if (!codes.size) { fitToData(); return; }
  const ativos = store.get('activeDatasets');
  const pts = scopeCoords()
    .filter((c) => codes.has(c.Site) && ativos.includes(c.dataset))
    .map((c) => [c.decimalLatitude, c.decimalLongitude])
    // Nem todo sitio declara coordenada; um par NaN derruba o fitBounds
    // inteiro com "Invalid LatLng object" e o mapa para de responder.
    .filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo));
  if (!pts.length) return;
  // Com o container de tamanho zero -- o que acontece no quadro em que o
  // #mapkit migra de eixo -- a interpolacao do flyTo divide pelo tamanho e
  // devolve NaN, e o Leaflet aborta com "Invalid LatLng object: (NaN, NaN)".
  // Enquadrar sem animacao nao faz essa conta.
  const s = map.getSize();
  if (!s.x || !s.y) return;
  map.fitBounds(L.latLngBounds(pts), {
    padding: [60, 60],
    // Um sitio unico tem bounds de area zero; sem teto o fitBounds iria ao
    // zoom maximo e o basemap vira cinza por falta de tile no oceano.
    maxZoom: codes.size === 1 ? 12 : 11,
    animate: true,
    duration: 0.5,
  });
}

export function resizeMap() { map?.invalidateSize({ animate: false }); }

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
