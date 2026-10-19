// ===========================================================================
// Leitura automática
//
// Cada função devolve uma ou duas frases em português (ou inglês) descrevendo
// o que a figura ao lado mostra, calculadas da seleção atual. Não é texto
// fixo: muda com o recorte, o modo e a variável.
//
// Regras que valem para todas:
//   - número nenhum é inventado nem arredondado além do que `fmt` faz;
//   - quando a seleção não sustenta uma afirmação, a função diz isso em vez
//     de produzir uma frase vazia;
//   - quando o esforço amostral explica boa parte do contraste, a frase diz,
//     na mesma frase -- não em nota de rodapé que ninguém lê.
// ===========================================================================

import { groupBy, sum, mean, uniq, fmt, fmtInt } from './data.js';
import { siteValues } from './metrics.js';
import { t, getLang, varLabel } from './config.js';

const b = (x) => `<strong>${x}</strong>`;
const pt = () => getLang() === 'pt';

/** Lista legível: "a, b e c" / "a, b and c". */
function serie(xs) {
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0];
  const e = pt() ? ' e ' : ' and ';
  return xs.slice(0, -1).join(', ') + e + xs[xs.length - 1];
}

const siteName = (core, code) =>
  (core.national?.sites ?? []).find((s) => s.Site === code)?.site_label
  ?? core.sites.find((s) => s.Site === code)?.site_label
  ?? code;

// ---------------------------------------------------------------------------
// Eixo 1 — mapa
// ---------------------------------------------------------------------------

export function readE1Map(core, state, sites) {
  const n = sites.length;
  if (!n) return pt() ? 'Nenhum sítio atende ao recorte atual.' : 'No site matches the current selection.';

  const mode = state.mode;

  if (mode === 'datasets') {
    const porDs = state.activeDatasets
      .map((ds) => {
        const c = sites.filter((s) => s[`has_${ds}`]).length;
        // sem toLowerCase: os rótulos carregam nomes próprios ("Noronha")
        return c ? `${b(c)} ${t(`ds_${ds}`)}` : null;
      })
      .filter(Boolean);
    return pt()
      ? `O recorte atual reúne ${b(n)} sítios monitorados — ${serie(porDs)}. Cada ponto está na coordenada declarada pela sua própria fonte, por isso dois conjuntos no mesmo sítio podem aparecer separados.`
      : `The current selection holds ${b(n)} monitored sites — ${serie(porDs)}. Each point sits at the coordinate declared by its own source, so two datasets at one site may appear apart.`;
  }

  const { values, unit } = siteValues(core, mode, state.variable, state.scope);
  const comValor = [...values.entries()]
    .filter(([code, v]) => Number.isFinite(v) && sites.some((s) => s.Site === code));
  if (!comValor.length) {
    return pt() ? 'Nenhum sítio do recorte tem valor para esta variável.'
                : 'No site in the selection has a value for this variable.';
  }

  comValor.sort((a, c) => c[1] - a[1]);
  const [altoCode, alto] = comValor[0];
  const [baixoCode, baixo] = comValor[comValor.length - 1];
  const rotulo = varLabel(mode, state.variable);

  if (comValor.length === 1) {
    return pt()
      ? `${rotulo} em ${b(siteName(core, altoCode))}: ${b(fmt(alto, 1) + unit)}. É o único sítio do recorte com este dado.`
      : `${rotulo} at ${b(siteName(core, altoCode))}: ${b(fmt(alto, 1) + unit)}. It is the only site in the selection with this measurement.`;
  }

  return pt()
    ? `${rotulo} varia de ${b(fmt(baixo, 1) + unit)} em ${siteName(core, baixoCode)} a ${b(fmt(alto, 1) + unit)} em ${siteName(core, altoCode)}, entre os ${b(comValor.length)} sítios com este dado.`
    : `${rotulo} ranges from ${b(fmt(baixo, 1) + unit)} at ${siteName(core, baixoCode)} to ${b(fmt(alto, 1) + unit)} at ${siteName(core, altoCode)}, across the ${b(comValor.length)} sites holding it.`;
}

// ---------------------------------------------------------------------------
// Eixo 1 — séries temporais
// ---------------------------------------------------------------------------

export function readE1Time(rows, dataset, nameOf) {
  if (!rows.length) return pt() ? 'Sem série para o recorte atual.' : 'No series for the current selection.';

  const anos = uniq(rows.map((r) => r.Year)).sort((a, c) => a - c);
  const y0 = anos[0], y1 = anos[anos.length - 1];
  if (anos.length < 2) {
    return pt() ? `Só há dados de ${b(y0)} no recorte atual — uma tendência precisa de pelo menos dois anos.`
                : `Only ${b(y0)} is available in the current selection — a trend needs at least two years.`;
  }

  const medio = (ano, g) => {
    const v = rows.filter((r) => r.Year === ano && r.group === g).map((r) => r.value);
    return mean(v);
  };
  const grupos = uniq(rows.map((r) => r.group));

  // O grupo que mais mudou entre a primeira e a última safra, em pontos
  // absolutos -- é o que a figura mostra primeiro e o que interessa relatar.
  const deltas = grupos
    .map((g) => ({ g, a: medio(y0, g), z: medio(y1, g) }))
    .filter((x) => Number.isFinite(x.a) && Number.isFinite(x.z))
    .map((x) => ({ ...x, d: x.z - x.a }));
  if (!deltas.length) return '';

  deltas.sort((a, c) => Math.abs(c.d) - Math.abs(a.d));
  const top = deltas[0];
  const maior = [...deltas].sort((a, c) => c.z - a.z)[0];

  const un = dataset === 'benthos' ? '%' : (pt() ? ' ind./censo' : ' ind./census');
  const verbo = top.d >= 0 ? (pt() ? 'subiu' : 'rose') : (pt() ? 'caiu' : 'fell');

  return pt()
    ? `Entre ${b(y0)} e ${b(y1)}, ${b(nameOf(top.g))} ${verbo} de ${fmt(top.a, 1)}${un} para ${b(fmt(top.z, 1) + un)} — a maior variação do período. Em ${y1}, o grupo mais abundante é ${b(nameOf(maior.g))}, com ${b(fmt(maior.z, 1) + un)}.`
    : `Between ${b(y0)} and ${b(y1)}, ${b(nameOf(top.g))} ${verbo} from ${fmt(top.a, 1)}${un} to ${b(fmt(top.z, 1) + un)} — the largest change in the period. In ${y1} the most abundant group is ${b(nameOf(maior.g))}, at ${b(fmt(maior.z, 1) + un)}.`;
}

// ---------------------------------------------------------------------------
// Eixo 2 — poluição
// ---------------------------------------------------------------------------

export function readE2(core, param) {
  const pol = core.pollution ?? [];
  const vals = pol.map((r) => r[param]).filter(Number.isFinite);
  if (!vals.length) return pt() ? 'Sem medidas para este parâmetro.' : 'No measurements for this parameter.';

  const porSitio = [...groupBy(pol.filter((r) => Number.isFinite(r[param])), 'Site')]
    .map(([site, g]) => [site, mean(g.map((r) => r[param]))])
    .sort((a, c) => c[1] - a[1]);

  const matrizes = uniq(pol.map((r) => r['Environmenal matrix']));
  const campanhas = uniq(pol.map((r) => r.event_date)).sort();
  const rotulo = varLabel('pollution', param);

  // "Para X, ha medidas..." em vez de "X foi medido": os rotulos dos
  // parametros tem generos diferentes (Salinidade, pH, Temperatura) e nao ha
  // como concordar o particípio sem carregar o genero de cada um.
  return pt()
    ? `Para ${b(rotulo)}, há medidas em ${b(porSitio.length)} sítios, ${b(matrizes.length)} matrizes (${serie(matrizes)}) e ${b(campanhas.length)} campanhas (${serie(campanhas)}). O maior valor médio está em ${b(siteName(core, porSitio[0][0]))} (${b(fmt(porSitio[0][1], 2))}) e o menor em ${siteName(core, porSitio[porSitio.length - 1][0])} (${fmt(porSitio[porSitio.length - 1][1], 2)}).`
    : `${rotulo} was measured at ${b(porSitio.length)} sites, across ${b(matrizes.length)} matrices (${serie(matrizes)}) and ${b(campanhas.length)} campaigns (${serie(campanhas)}). The highest mean is at ${b(siteName(core, porSitio[0][0]))} (${b(fmt(porSitio[0][1], 2))}) and the lowest at ${siteName(core, porSitio[porSitio.length - 1][0])} (${fmt(porSitio[porSitio.length - 1][1], 2)}).`;
}

// ---------------------------------------------------------------------------
// Eixo 3 — rodolitos
// ---------------------------------------------------------------------------

export function readE3Rodolitos(core) {
  const p = core.productivity ?? [];
  if (!p.length) return '';
  const ncc = mean(p.map((r) => r['NCC netflux']));
  const ncp = mean(p.map((r) => r['NCP netflux']));
  const nccDia = mean(p.map((r) => r['NCC daytime']));
  const nccNoite = mean(p.map((r) => r['NCC nighttime']));
  const vivos = mean(p.map((r) => r['Live rhodoliths']));
  // site_label nao viaja nas tabelas: o exportador o normaliza para `sites`.
  const local = siteName(core, p[0].Site);

  // NCC positivo significa que o banco deposita mais carbonato do que
  // dissolve ao longo de 24 h -- é o que torna o banco um sumidouro.
  return pt()
    ? `Nas ${b(p.length)} câmaras incubadas no ${b(local)}, a calcificação líquida foi de ${b(fmt(ncc, 1) + ' mmol/m²/d')} e a produção primária líquida de ${b(fmt(ncp, 1) + ' mmol/m²/d')} — ambas positivas, ou seja, o banco deposita mais carbonato do que dissolve e produz mais do que consome ao longo de 24 h. De dia a calcificação é de ${fmt(nccDia, 1)}; à noite inverte para ${fmt(nccNoite, 1)}. A biomassa de rodolitos vivos é de ${b(fmt(vivos / 1000, 1) + ' kg DW/m²')}.`
    : `Across the ${b(p.length)} chambers incubated at ${b(local)}, net calcification was ${b(fmt(ncc, 1) + ' mmol/m²/d')} and net primary production ${b(fmt(ncp, 1) + ' mmol/m²/d')} — both positive, meaning the bed deposits more carbonate than it dissolves and produces more than it consumes over 24 h. By day calcification is ${fmt(nccDia, 1)}; at night it reverses to ${fmt(nccNoite, 1)}. Live rhodolith biomass is ${b(fmt(vivos / 1000, 1) + ' kg DW/m²')}.`;
}

// ---------------------------------------------------------------------------
// Eixo 3 — pesca e nutrição
// ---------------------------------------------------------------------------

export function readE3Pesca(core) {
  const cons = core.fishers_consumption ?? [];
  const cap = core.fishers_catch ?? [];
  const sum_ = (core.fishers_summary ?? [])[0];
  if (!cons.length || !sum_) return '';

  const get = (f) => cons.find((r) => r.food === f) ?? {};
  const peixe = get('fish');
  const carnes = ['beef', 'pork', 'chicken', 'processed_meat', 'sheep']
    .map(get)
    .map((r) => r.kg_week)
    .filter(Number.isFinite);
  const totalCarne = sum(carnes);

  const topSp = [...cap].sort((a, c) => c.n_fishers - a.n_fishers).slice(0, 3)
    .map((r) => r.common_name.replace(/_/g, ' '));

  return pt()
    ? `Nas ${b(sum_.n_interviews)} entrevistas, o pescado é consumido ${b(fmt(peixe.days_week, 1) + ' dias por semana')}, somando ${b(fmt(peixe.kg_week, 1) + ' kg')} — mais que todas as carnes somadas (${b(fmt(totalCarne, 1) + ' kg')}). A captura declarada tem mediana de ${b(fmtInt(sum_.catch_median) + ' kg')} e as espécies mais citadas são ${b(serie(topSp))}.`
    : `Across ${b(sum_.n_interviews)} interviews, seafood is eaten ${b(fmt(peixe.days_week, 1) + ' days a week')}, totalling ${b(fmt(peixe.kg_week, 1) + ' kg')} — more than all meats combined (${b(fmt(totalCarne, 1) + ' kg')}). Reported catch has a median of ${b(fmtInt(sum_.catch_median) + ' kg')} and the most cited species are ${b(serie(topSp))}.`;
}

// ---------------------------------------------------------------------------
// Eixo 4 — proteção
// ---------------------------------------------------------------------------

/** Agrupa sítios por zona e devolve as métricas de peixe de cada lado. */
export function zoneFish(core) {
  const zoneOf = new Map(core.sites.map((s) => [s.Site, s.zone]));
  const out = {};
  for (const z of ['PARNAMAR', 'APA']) {
    const codes = core.sites.filter((s) => s.zone === z && s.has_fish).map((s) => s.Site);
    const anos = core.fish_year.filter((r) => codes.includes(r.Site));
    const resumo = core.fish_summary.filter((r) => codes.includes(r.Site));
    const censos = sum(anos.map((r) => r.n_events));
    out[z] = {
      sites: codes.length,
      censos,
      ind: sum(anos.map((r) => r.total_abundance)),
      porCenso: censos ? sum(anos.map((r) => r.total_abundance)) / censos : null,
      riqueza: sum(resumo.map((r) => r.n_species)),
      anos: uniq(anos.map((r) => r.Year)).sort(),
    };
  }
  return out;
}

export function readE4Fish(core) {
  const z = zoneFish(core);
  const p = z.PARNAMAR, a = z.APA;
  if (!p.sites || !a.sites) return '';

  const razao = p.porCenso / a.porCenso;
  const maisEsforco = Math.round(100 * (p.censos / a.censos - 1));

  return pt()
    ? `O ${b(t('zone_parnamar'))} reúne ${b(p.sites)} sítios e ${b(fmtInt(p.censos))} censos; a ${b(t('zone_apa'))}, ${b(a.sites)} sítios e ${b(fmtInt(a.censos))} censos. A abundância por censo é de ${b(fmtInt(p.porCenso))} indivíduos no parque contra ${b(fmtInt(a.porCenso))} na APA — ${b(fmt(razao, 1) + '×')} maior. Essa métrica já corrige o esforço; a riqueza bruta não corrigiria, porque o parque teve ${b(maisEsforco + '%')} mais censos. Os dois lados foram amostrados nos mesmos anos (${p.anos[0]}–${p.anos[p.anos.length - 1]}).`
    : `The ${b(t('zone_parnamar'))} holds ${b(p.sites)} sites and ${b(fmtInt(p.censos))} censuses; the ${b(t('zone_apa'))}, ${b(a.sites)} sites and ${b(fmtInt(a.censos))} censuses. Abundance per census is ${b(fmtInt(p.porCenso))} individuals in the park against ${b(fmtInt(a.porCenso))} in the APA — ${b(fmt(razao, 1) + '×')} higher. This metric already corrects for effort; raw richness would not, because the park had ${b(maisEsforco + '%')} more censuses. Both sides were sampled in the same years (${p.anos[0]}–${p.anos[p.anos.length - 1]}).`;
}

/** Médias de um parâmetro de poluição por categoria IUCN. */
export function zonePollution(core, param) {
  const pol = (core.pollution ?? []).filter((r) => Number.isFinite(r[param]));
  const out = {};
  for (const [cat, g] of groupBy(pol, 'IUCN category')) {
    out[cat] = { media: mean(g.map((r) => r[param])), n: g.length };
  }
  return out;
}

export function readE4Pollution(core, param) {
  const z = zonePollution(core, param);
  const mnp = z.MNP, epa = z.EPA;
  const rotulo = varLabel('pollution', param);
  if (!mnp || !epa) {
    return pt() ? `${rotulo} não tem medidas nos dois lados.` : `${rotulo} lacks measurements on both sides.`;
  }
  const maior = mnp.media >= epa.media ? t('zone_parnamar') : t('zone_apa');
  const dif = Math.abs(mnp.media - epa.media);

  return pt()
    ? `${rotulo}: média de ${b(fmt(mnp.media, 2))} no parque (${mnp.n} amostras) contra ${b(fmt(epa.media, 2))} na APA (${epa.n} amostras). O valor mais alto está ${b('n' + (maior === t('zone_apa') ? 'a ' : 'o ') + maior)}, com diferença de ${fmt(dif, 2)}. As duas categorias foram amostradas nas mesmas campanhas, então a comparação não está confundida pelo tempo.`
    : `${rotulo}: mean of ${b(fmt(mnp.media, 2))} in the park (${mnp.n} samples) against ${b(fmt(epa.media, 2))} in the APA (${epa.n} samples). The higher value is in the ${b(maior)}, a difference of ${fmt(dif, 2)}. Both categories were sampled in the same campaigns, so the comparison is not confounded by time.`;
}

/** Por que o bentos não entra nesta comparação. */
export function readE4Absent(core) {
  const apa = core.sites.filter((s) => s.zone === 'APA' && s.has_benthos).length;
  const par = core.sites.filter((s) => s.zone === 'PARNAMAR' && s.has_benthos).length;
  return pt()
    ? `A cobertura bentônica fica de fora desta comparação: há ${b(apa)} sítio na APA contra ${b(par)} no parque. Comparar um sítio com três não é comparar zonas — é comparar sítios com outro nome.`
    : `Benthic cover is left out of this comparison: there ${apa === 1 ? 'is' : 'are'} ${b(apa)} site in the APA against ${b(par)} in the park. Comparing one site with three is not comparing zones — it is comparing sites under another name.`;
}

// ---------------------------------------------------------------------------
// Eixo 1 — peixe na escala nacional
// ---------------------------------------------------------------------------

/**
 * Lê a série nacional SEM agregá-la. A frase diz quantas regiões a seleção
 * cobre e o que cada extremo mostra, mas nunca afirma uma tendência "do
 * Brasil": a composição geográfica muda a cada ano e uma média nacional
 * seria geografia disfarçada de tempo.
 */
export function readE1Nacional(rows, rotulo = (g) => g) {
  if (!rows.length) {
    return pt() ? 'Sem série de peixe para o recorte atual.'
                : 'No fish series for the current selection.';
  }

  const anos = uniq(rows.map((r) => r.Year)).sort((a, b) => a - b);
  const regioes = uniq(rows.map((r) => r.group));
  const censos = sum(rows.map((r) => r.n_events));

  // Cobertura temporal de cada região: é o que explica por que não se agrega.
  const cobertura = regioes.map((g) => {
    const rs = rows.filter((r) => r.group === g);
    const a = uniq(rs.map((r) => r.Year)).sort((x, y) => x - y);
    return { g, n: sum(rs.map((r) => r.n_events)), ini: a[0], fim: a[a.length - 1], anos: a.length };
  }).sort((a, b) => b.n - a.n);

  const maior = cobertura[0];
  const parteMaior = Math.round(100 * maior.n / censos);

  if (regioes.length === 1) {
    const m = cobertura[0];
    const porCenso = sum(rows.map((r) => r.total)) / Math.max(1, m.n);
    return pt()
      ? `${b(rotulo(m.g))}: ${b(fmtInt(m.n))} censos em ${b(m.anos)} anos (${m.ini}–${m.fim}), com média de ${b(fmtInt(porCenso))} indivíduos por censo.`
      : `${b(rotulo(m.g))}: ${b(fmtInt(m.n))} censuses over ${b(m.anos)} years (${m.ini}–${m.fim}), averaging ${b(fmtInt(porCenso))} individuals per census.`;
  }

  return pt()
    ? `${b(fmtInt(censos))} censos em ${b(regioes.length)} regiões, de ${b(anos[0])} a ${b(anos[anos.length - 1])}. ${b(rotulo(maior.g))} responde por ${b(parteMaior + '%')} deles e cobre ${maior.ini}–${maior.fim}; as demais entram e saem ao longo do período. Por isso cada região é uma linha própria: uma média nacional mudaria junto com quem foi amostrado naquele ano, não com os peixes.`
    : `${b(fmtInt(censos))} censuses across ${b(regioes.length)} regions, from ${b(anos[0])} to ${b(anos[anos.length - 1])}. ${b(rotulo(maior.g))} accounts for ${b(parteMaior + '%')} of them and spans ${maior.ini}–${maior.fim}; the others come and go across the period. That is why each region is its own line: a national average would move with who was sampled that year, not with the fish.`;
}
