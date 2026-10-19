// ===========================================================================
// Escala nacional (ReefSYN)
//
// Normaliza as tabelas do ReefSYN para a MESMA forma que as de Noronha já
// têm — `Site`, `site_label`, `zone`, `has_*` e um par de coordenadas por
// conjunto. Assim o mapa, os filtros e o perfil do sítio funcionam nas duas
// escalas sem ramificar a lógica em todo lugar: o que muda é de onde as
// linhas vêm, não o que elas são.
//
// A região entra no lugar da `zone` de Noronha porque cumpre o mesmo papel —
// o nível intermediário da hierarquia — e porque é a estratificação que a
// série temporal exige: a composição geográfica do "Brasil" muda a cada ano.
// ===========================================================================

import { uniq } from './data.js';

/** "arraial_do_cabo" -> "Arraial do Cabo" */
function humanize(s) {
  if (!s) return '';
  return s.split(/[;,]/)[0].trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Do|Da|Dos|Das|De)\b/g, (w) => w.toLowerCase());
}

/**
 * Monta, a partir do core, as duas tabelas que o mapa consome na escala
 * nacional. Devolve null quando o pacote do ReefSYN não veio junto — o
 * painel então fica só com Noronha em vez de quebrar.
 */
export function buildNational(core) {
  if (!core.reef_sites?.length) return null;

  const ucBySite = new Map();
  for (const r of core.reef_site_uc ?? []) {
    if (!ucBySite.has(r.site_id)) ucBySite.set(r.site_id, []);
    ucBySite.get(r.site_id).push({ cd: r.cd_cnuc, nome: r.nome_uc, cat: r.categoria, uf: r.uf });
  }

  const sites = [];
  const coords = [];

  for (const s of core.reef_sites) {
    const ucs = ucBySite.get(s.site_id) ?? [];
    sites.push({
      Site: s.site_id,
      site_label: humanize(s.locality) || humanize(s.location) || s.site_id,
      location: humanize(s.location),
      zone: s.region, zone_label: s.region, region: s.region,
      ucs, uc_name: ucs[0]?.nome ?? null, uc_cat: ucs[0]?.cat ?? null, uf: ucs[0]?.uf ?? null,
      has_fish: true, has_benthos_islands: false, has_benthos: false,
      n_censos: s.n_censos, ano_min: s.ano_min, ano_max: s.ano_max,
    });
    coords.push({ Site: s.site_id, decimalLatitude: s.lat, decimalLongitude: s.lon, dataset: 'fish' });
  }

  for (const b of core.reef_benthos_sites ?? []) {
    const ucs = ucBySite.get(b.site_id) ?? [];
    sites.push({
      Site: b.site_id,
      site_label: humanize(b.locality) || b.site_id,
      location: b.island,
      // As ilhas oceânicas do XV recebem a região pela latitude, igual aos
      // sítios de peixe, para que o filtro por região alcance as duas camadas.
      zone: regionOfLat(b.lat), zone_label: regionOfLat(b.lat), region: regionOfLat(b.lat),
      island: b.island,
      ucs, uc_name: ucs[0]?.nome ?? null, uc_cat: ucs[0]?.cat ?? null, uf: ucs[0]?.uf ?? null,
      has_fish: false, has_benthos_islands: true, has_benthos: false,
      n_censos: b.n_eventos, ano_min: b.ano_min, ano_max: b.ano_max,
    });
    coords.push({ Site: b.site_id, decimalLatitude: b.lat, decimalLongitude: b.lon,
                  dataset: 'benthos_islands' });
  }

  // A série bentônica de Noronha (2021-2024) não vem do ReefSYN, mas é a mesma
  // escala de leitura e precisa aparecer no mapa nacional. Entra como camada
  // própria porque usa categorias diferentes das do XV e as duas nunca são
  // concatenadas numa série só.
  for (const s of core.sites ?? []) {
    if (!s.has_benthos) continue;
    const c = (core.site_coords ?? []).find((x) => x.Site === s.Site && x.dataset === 'benthos');
    if (!c) continue;
    sites.push({
      Site: `N_${s.Site}`,
      site_label: s.site_label,
      location: 'Fernando de Noronha',
      zone: regionOfLat(c.decimalLatitude), zone_label: regionOfLat(c.decimalLatitude),
      region: regionOfLat(c.decimalLatitude),
      island: 'Fernando de Noronha',
      ucs: [], uc_name: null, uc_cat: null, uf: null,
      has_fish: false, has_benthos_islands: false, has_benthos: true,
      noronha_site: s.Site,
    });
    coords.push({ Site: `N_${s.Site}`, decimalLatitude: c.decimalLatitude,
                  decimalLongitude: c.decimalLongitude, dataset: 'benthos' });
  }

  return {
    sites,
    coords,
    regions: uniq(sites.map((s) => s.region)).sort(),
    ucs: uniq(sites.flatMap((s) => s.ucs.map((u) => u.nome))).sort(),
  };
}

/** Mesma régua de latitude do extract_reefsyn.R — as duas têm que concordar. */
export function regionOfLat(lat) {
  if (lat > -1)    return 'Ilhas equatoriais';
  if (lat > -5.5)  return 'Noronha e Rocas';
  if (lat > -10)   return 'Nordeste';
  if (lat > -15)   return 'Bahia';
  if (lat > -20)   return 'Abrolhos e ES';
  if (lat > -24)   return 'Rio de Janeiro';
  if (lat > -26)   return 'Sao Paulo';
  return 'Sul';
}

/** Rótulos de exibição das regiões, na ordem norte -> sul. */
export const REGION_ORDER = [
  'Ilhas equatoriais', 'Noronha e Rocas', 'Nordeste', 'Bahia',
  'Abrolhos e ES', 'Rio de Janeiro', 'Sao Paulo', 'Sul',
];

export const REGION_LABEL = {
  'Ilhas equatoriais': { pt: 'Ilhas equatoriais', en: 'Equatorial islands' },
  'Noronha e Rocas':   { pt: 'Noronha e Rocas',   en: 'Noronha and Rocas' },
  'Nordeste':          { pt: 'Nordeste',          en: 'Northeast' },
  'Bahia':             { pt: 'Bahia',             en: 'Bahia' },
  'Abrolhos e ES':     { pt: 'Abrolhos e ES',     en: 'Abrolhos and ES' },
  'Rio de Janeiro':    { pt: 'Rio de Janeiro',    en: 'Rio de Janeiro' },
  'Sao Paulo':         { pt: 'São Paulo',         en: 'São Paulo' },
  'Sul':               { pt: 'Sul',               en: 'South' },
};
