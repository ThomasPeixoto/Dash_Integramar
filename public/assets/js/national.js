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

/**
 * Nomes de UC vêm do CNUC em CAIXA ALTA. Em caixa alta num mapa eles gritam e
 * ficam mais largos que o polígono que rotulam.
 */
export function tituloUC(s) {
  if (!s) return '';
  const minusculas = new Set(['de','da','do','das','dos','e','em','a','o','as','os']);
  // Siglas do SNUC continuam em caixa alta: "Apa Marinha" não é nome de nada.
  const siglas = new Set(['APA','RESEX','REBIO','PARNA','ARIE','RDS','RPPN',
                          'MONA','REVIS','FLONA','ESEC','PE','PN']);
  return s.split(/\s+/)
    .map((w, i) => {
      const cru = w.replace(/[^\wÀ-ÿ]/g, '');
      if (siglas.has(cru.toUpperCase()) && cru === cru.toUpperCase()) return w;
      const b = w.toLowerCase();
      return (i > 0 && minusculas.has(b)) ? b : b.charAt(0).toUpperCase() + b.slice(1);
    })
    .join(' ');
}

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
    ucBySite.get(r.site_id).push({ cd: r.cd_cnuc, nome: tituloUC(r.nome_uc),
                                   nome_cru: r.nome_uc, cat: r.categoria, uf: r.uf });
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
      ucs, uc_name: ucs[0]?.nome ?? null, uc_cat: ucs[0]?.cat ?? null,
      // `uf` é o código de duas letras do estado mais próximo, calculado no R.
      // O `uf` que vem da UC é o nome por extenso do estado DELA e não serve
      // de chave — sobrescrever um pelo outro já quebrou o filtro por estado.
      uf: s.uf, uf_nome: s.uf_nome, dist_uf_km: s.dist_uf_km,
      uc_uf: ucs[0]?.uf ?? null,
      has_fish: true, has_coral: false, has_benthos: false,
      n_censos: s.n_censos, ano_min: s.ano_min, ano_max: s.ano_max,
    });
    coords.push({ Site: s.site_id, decimalLatitude: s.lat, decimalLongitude: s.lon, dataset: 'fish' });
  }

  // Um sítio bentônico pode alimentar a camada de corais, a de comunidade, ou
  // as duas: XII e XIII só resolvem coral, XIV/XV/XVI resolvem a comunidade.
  const comCoral = new Set((core.coral_summary ?? []).map((r) => r.site_id));
  const comCom   = new Set((core.com_summary ?? []).map((r) => r.site_id));

  for (const b of core.reef_benthos_sites ?? []) {
    const ucs = ucBySite.get(b.site_id) ?? [];
    const temCoral = comCoral.has(b.site_id);
    const temCom   = comCom.has(b.site_id);
    if (!temCoral && !temCom) continue;
    sites.push({
      Site: b.site_id,
      site_label: humanize(b.locality) || b.site_id,
      location: humanize(b.locality),
      zone: b.region, zone_label: b.region, region: b.region,
      ucs, uc_name: ucs[0]?.nome ?? null, uc_cat: ucs[0]?.cat ?? null,
      uf: b.uf ?? null, uf_nome: b.uf_nome ?? null, uc_uf: ucs[0]?.uf ?? null,
      has_fish: false, has_coral: temCoral, has_benthos: temCom,
      datasets: b.datasets,
      n_censos: b.n_eventos, ano_min: b.ano_min, ano_max: b.ano_max,
    });
    // A mesma coordenada entra uma vez por camada, para que ligar e desligar
    // "Corais" ou "Bentos" acenda e apague o ponto certo.
    if (temCoral) coords.push({ Site: b.site_id, decimalLatitude: b.lat,
                                decimalLongitude: b.lon, dataset: 'coral' });
    if (temCom)   coords.push({ Site: b.site_id, decimalLatitude: b.lat,
                                decimalLongitude: b.lon, dataset: 'benthos' });
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
      // Noronha fica a ~350 km da costa: entra em "Ilhas oceânicas", como
      // os demais sítios insulares, e não no litoral de Pernambuco.
      zone: 'Ilhas oceânicas', zone_label: 'Ilhas oceânicas', region: 'Ilhas oceânicas',
      island: 'Fernando de Noronha', benthos_ds: 'Noronha',
      ucs: [], uc_name: null, uc_cat: null, uf: 'PE', uf_nome: 'Pernambuco',
      has_fish: false, has_coral: false, has_benthos: true,
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

/** Ordem geográfica, norte -> sul, com as ilhas oceânicas por último. */
export const REGION_ORDER = ['Norte', 'Nordeste', 'Sudeste', 'Sul', 'Ilhas oceânicas'];

export const REGION_LABEL = {
  'Norte':           { pt: 'Norte',           en: 'North' },
  'Nordeste':        { pt: 'Nordeste',        en: 'Northeast' },
  'Sudeste':         { pt: 'Sudeste',         en: 'Southeast' },
  'Sul':             { pt: 'Sul',             en: 'South' },
  'Ilhas oceânicas': { pt: 'Ilhas oceânicas', en: 'Oceanic islands' },
};
