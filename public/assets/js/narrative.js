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
import { siteValues, areaValues } from './metrics.js';
import { t, getLang, varLabel } from './config.js';
import { tituloUC } from './national.js';

const b = (x) => `<strong>${x}</strong>`;

/** Plural simples: plural(1,'ano') -> "1 ano"; plural(3,'ano') -> "3 anos". */
const plural = (n, sing, plur) => `${fmtInt(n)} ${n === 1 ? sing : (plur ?? sing + 's')}`;
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
  // Área desenhada: descreve o que foi circulado, e de que conjuntos ele é
  // feito. Vem antes do ramo de generalização porque, ao circular pontos, os
  // polígonos no mapa viram contexto -- quem lê quer saber do conjunto.
  if (state.drawnSites?.length) return readE1Desenho(core, sites);

  // Modo de generalização: o valor vive no polígono, então a leitura tem que
  // falar de áreas. Descrever o intervalo entre SÍTIOS enquanto o mapa pinta
  // ESTADOS seria descrever outra figura.
  // So em GENERALIZACAO a leitura fala de areas: e ai que o valor vive no
  // poligono. Em contorno os pontos continuam na tela, e descrever estados
  // enquanto a pessoa ve sitios seria descrever outra figura.
  if (state.scope === 'national' && state.layer && state.layer !== 'none'
      && state.layerMode === 'geral') {
    return readE1Area(core, state);
  }

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
 * Lê a série nacional por nível de proteção, sem agregá-la numa linha só. A frase
 * diz quantos censos há em cada nível e que anos cada um cobre -- é o que mostra
 * que as linhas não descrevem os mesmos lugares nem os mesmos anos -- e nunca
 * afirma uma tendência "do Brasil".
 */
export function readE1Nacional(rows, rotulo = (g) => g, { abundancia = true } = {}) {
  if (!rows.length) {
    return pt() ? 'Sem série de peixe para o recorte atual.'
                : 'No fish series for the current selection.';
  }

  const anos = uniq(rows.map((r) => r.Year)).sort((a, b) => a - b);
  const grupos = uniq(rows.map((r) => r.group));
  const censos = sum(rows.map((r) => r.n_events));

  // Cobertura de cada nível: censos, sítios e faixa de anos.
  const cobertura = grupos.map((g) => {
    const rs = rows.filter((r) => r.group === g);
    const a = uniq(rs.map((r) => r.Year)).sort((x, y) => x - y);
    return { g, n: sum(rs.map((r) => r.n_events)), sitios: uniq(rs.map((r) => r.Site)).length,
             ini: a[0], fim: a[a.length - 1], anos: a.length };
  }).sort((a, b) => b.n - a.n);

  const maior = cobertura[0];
  const parteMaior = Math.round(100 * maior.n / censos);

  if (grupos.length === 1) {
    const m = cobertura[0];
    const porCenso = sum(rows.map((r) => r.total)) / Math.max(1, m.n);
    // A frase "média de N indivíduos por censo" só vale para a abundância; com
    // biomassa, tamanho ou nível trófico ela diria uma métrica que não é a do gráfico.
    if (!abundancia) {
      return pt()
        ? `${b(rotulo(m.g))}: ${b(plural(m.n, 'censo'))} em ${b(plural(m.sitios, 'sítio'))}, ${b(plural(m.anos, 'ano'))}${m.anos > 1 ? ` (${m.ini}–${m.fim})` : ` (${m.ini})`}.`
        : `${b(rotulo(m.g))}: ${b(plural(m.n, 'census', 'censuses'))} at ${b(plural(m.sitios, 'site'))}, ${b(plural(m.anos, 'year'))}${m.anos > 1 ? ` (${m.ini}–${m.fim})` : ` (${m.ini})`}.`;
    }
    return pt()
      ? `${b(rotulo(m.g))}: ${b(plural(m.n, 'censo'))} em ${b(plural(m.sitios, 'sítio'))}, ${b(plural(m.anos, 'ano'))}${m.anos > 1 ? ` (${m.ini}–${m.fim})` : ` (${m.ini})`}, com média de ${b(fmtInt(porCenso))} indivíduos por censo.`
      : `${b(rotulo(m.g))}: ${b(plural(m.n, 'census', 'censuses'))} at ${b(plural(m.sitios, 'site'))}, ${b(plural(m.anos, 'year'))}${m.anos > 1 ? ` (${m.ini}–${m.fim})` : ` (${m.ini})`}, averaging ${b(fmtInt(porCenso))} individuals per census.`;
  }

  // Os níveis só são comparáveis ano a ano onde cobrem os mesmos anos; quando as
  // faixas diferem, isso é dito, não escondido.
  const faixasIguais = cobertura.every((c) => c.ini === cobertura[0].ini && c.fim === cobertura[0].fim);
  const lista = cobertura.map((c) => `${b(rotulo(c.g))} ${b(fmtInt(c.n))}`).join(' · ');
  return pt()
    ? `${b(fmtInt(censos))} censos de ${b(anos[0])} a ${b(anos[anos.length - 1])}, por nível de proteção: ${lista}. ${b(rotulo(maior.g))} responde por ${b(parteMaior + '%')} deles. ${faixasIguais ? 'Os níveis cobrem os mesmos anos, mas' : 'Os níveis cobrem anos diferentes e'} os sítios amostrados em cada um mudam de ano para ano — uma linha não descreve sempre os mesmos lugares.`
    : `${b(fmtInt(censos))} censuses from ${b(anos[0])} to ${b(anos[anos.length - 1])}, by protection level: ${lista}. ${b(rotulo(maior.g))} accounts for ${b(parteMaior + '%')} of them. ${faixasIguais ? 'The levels cover the same years, but' : 'The levels cover different years and'} the sites sampled in each change from year to year — a line does not always describe the same places.`;
}

// ---------------------------------------------------------------------------
// Eixo 1 — corais e comunidade bentônica
// ---------------------------------------------------------------------------

/**
 * Corais: a composição relativa dentro da assembleia é válida mesmo sem o
 * denominador, porque a fração removida pela exportação Darwin Core (substrato,
 * sedimento, turf) é a mesma para todos os táxons do evento e some na razão.
 * A frase diz quantos estados a seleção cobre, porque a composição muda entre
 * eles e uma leitura "do Brasil" seria geografia disfarçada.
 */
export function readE1Corais(core, rows, alvo) {
  if (!rows.length) {
    return pt() ? 'Sem registro de coral identificado a espécie no recorte atual.'
                : 'No coral identified to species in the current selection.';
  }

  const anos = uniq(rows.map((r) => r.Year)).sort((a, b) => a - b);
  const sitios = uniq(rows.map((r) => r.Site));
  const estados = uniq(sitios
    .map((c) => { const x = (core.national?.sites ?? []).find((s) => s.Site === c);
                  return x ? tituloUC(x.uf_nome ?? x.uf) : null; })
    .filter(Boolean));

  // Espécie dominante no último ano com registro.
  const ultimo = anos[anos.length - 1];
  const porSp = [...groupBy(rows.filter((r) => r.Year === ultimo), 'group')]
    .map(([sp, g]) => [sp, mean(g.map((r) => r.value))])
    .sort((a, b) => b[1] - a[1]);
  const esp = uniq(rows.map((r) => r.group)).length;

  const alcance = estados.length > 1
    ? (pt() ? `${b(estados.length)} estados` : `${b(estados.length)} states`)
    : (pt() ? `o estado ${b(estados[0] ?? '—')}` : `the state of ${b(estados[0] ?? '—')}`);

  const base = pt()
    ? `${b(esp)} espécies de coral em ${b(sitios.length)} sítios, cobrindo ${alcance}, de ${b(anos[0])} a ${b(ultimo)}. Em ${ultimo}, ${b(porSp[0][0])} responde por ${b(fmt(porSp[0][1], 1) + '%')} da assembleia.`
    : `${b(esp)} coral species at ${b(sitios.length)} sites, spanning ${alcance}, from ${b(anos[0])} to ${b(ultimo)}. In ${ultimo}, ${b(porSp[0][0])} accounts for ${b(fmt(porSp[0][1], 1) + '%')} of the assemblage.`;

  // A ressalva só aparece quando de fato se aplica.
  const ressalva = estados.length > 1
    ? (pt() ? ' São percentuais DENTRO da assembleia de coral, não cobertura do fundo — a exportação Darwin Core não traz substrato nem turf. E a composição difere entre estados: escolha um para ler tendência.'
            : ' These are percentages WITHIN the coral assemblage, not cover of the substrate — the Darwin Core export carries neither substrate nor turf. Composition also differs among states: pick one to read a trend.')
    : (pt() ? ' São percentuais dentro da assembleia de coral, não cobertura do fundo.'
            : ' These are percentages within the coral assemblage, not cover of the substrate.');

  return base + ressalva;
}

/**
 * Comunidade bentônica: cada dataset mede um universo diferente de organismos,
 * e a composição é relativa ao que AQUELE dataset enxerga. Comparar entre
 * datasets produziria contraste de protocolo com cara de contraste ecológico.
 */
export function readE1Comunidade(core, rows, dsAtivo) {
  if (!rows.length) {
    return pt() ? `Sem dados de comunidade bentônica no dataset ${b(dsAtivo)} para o recorte atual.`
                : `No benthic community data in dataset ${b(dsAtivo)} for the current selection.`;
  }

  const anos = uniq(rows.map((r) => r.Year)).sort((a, c) => a - c);
  const sitios = uniq(rows.map((r) => r.Site)).length;
  const ultimo = anos[anos.length - 1];
  const porGrupo = [...groupBy(rows.filter((r) => r.Year === ultimo), 'group')]
    .map(([g, rs]) => [g, mean(rs.map((r) => r.value))])
    .sort((a, c) => c[1] - a[1]);

  const naoId = porGrupo.find(([g]) => /não identificado|unidentified/i.test(g));
  const vivos = porGrupo.filter(([g]) => g !== naoId?.[0]);

  const extra = naoId
    ? (pt() ? ` ${b(fmt(naoId[1], 1) + '%')} do quadrante é substrato, turf ou material sem identidade taxonômica — essa fração só sobreviveu à exportação neste dataset.`
            : ` ${b(fmt(naoId[1], 1) + '%')} of the quadrat is substrate, turf or material without taxonomic identity — that fraction survived the export only in this dataset.`)
    : (pt() ? ' Substrato e turf foram removidos na exportação Darwin Core, então os percentuais são relativos ao que foi identificado, não ao fundo.'
            : ' Substrate and turf were stripped by the Darwin Core export, so percentages are relative to what was identified, not to the substrate.');

  return (pt()
    ? `Dataset ${b(dsAtivo)}: ${b(sitios)} sítios, ${b(anos[0])}–${b(ultimo)}. Em ${ultimo}, o grupo mais abundante é ${b(vivos[0]?.[0] ?? '—')}, com ${b(fmt(vivos[0]?.[1] ?? 0, 1) + '%')}.`
    : `Dataset ${b(dsAtivo)}: ${b(sitios)} sites, ${b(anos[0])}–${b(ultimo)}. In ${ultimo} the most abundant group is ${b(vivos[0]?.[0] ?? '—')}, at ${b(fmt(vivos[0]?.[1] ?? 0, 1) + '%')}.`)
    + extra;
}


/** Leitura do mapa no modo de generalização (choropleth por área). */
function readE1Area(core, state) {
  const porEstado = state.layer === 'estados';
  const { values, unit, campo } = areaValues(core, state.layer, state.mode, state.variable);
  const comDado = [...values.entries()].filter(([, v]) => Number.isFinite(v));
  if (!comDado.length) {
    return pt() ? 'Nenhuma área tem dado para esta métrica.' : 'No area has data for this metric.';
  }

  const tabela = porEstado ? core.fish_by_uf : core.fish_by_uc;
  const nomeDe = (k) => {
    const r = (tabela ?? []).find((x) => (porEstado ? x.uf : x.cd_cnuc) === k);
    return tituloUC((porEstado ? r?.uf_nome : r?.nome_uc) ?? k);
  };

  comDado.sort((a, c) => c[1] - a[1]);
  const [altoK, alto] = comDado[0];
  const [baixoK, baixo] = comDado[comDado.length - 1];
  const rotulo = varLabel(state.mode, campo);
  const tipo = porEstado
    ? (pt() ? 'estados' : 'states')
    : (pt() ? 'unidades de conservação' : 'protected areas');

  // Riqueza por área não é a soma das riquezas dos sítios: é o número de
  // espécies distintas ali. A frase diz isso porque a diferença é grande e
  // não óbvia.
  const nota = campo === 'richness'
    ? (pt() ? ' Riqueza aqui é o número de espécies distintas na área, não a soma das riquezas dos sítios.'
            : ' Richness here is the number of distinct species in the area, not the sum of its sites\u2019 richness.')
    : '';

  return (pt()
    ? `${b(rotulo)} em ${b(comDado.length)} ${tipo}: de ${b(fmt(baixo, 0) + unit)} em ${nomeDe(baixoK)} a ${b(fmt(alto, 0) + unit)} em ${b(nomeDe(altoK))}. Clique numa área para recortar o painel por ela.`
    : `${b(rotulo)} across ${b(comDado.length)} ${tipo}: from ${b(fmt(baixo, 0) + unit)} in ${nomeDe(baixoK)} to ${b(fmt(alto, 0) + unit)} in ${b(nomeDe(altoK))}. Click an area to filter the panel by it.`)
    + nota;
}

/**
 * Leitura do painel de parametros. Diz de saida o que a lista suspensa
 * escondia: agua e sedimento nao compartilham nenhum parametro, e por isso
 * trocar de parametro pode trocar o conjunto de sitios sob os pes.
 */
export function readE2Param(core, grupos) {
  const pol = core.pollution ?? [];
  const sitios = new Set(pol.map((r) => r.Site)).size;
  const nAgua = grupos[0].familias.reduce((a, f) => a + f.params.length, 0);
  const nSed  = grupos[1].familias.reduce((a, f) => a + f.params.length, 0);

  // Parametros que nao alcancam todos os sitios -- quase sempre por ficarem
  // abaixo do limite de deteccao, nao por falta de coleta.
  const parciais = grupos.flatMap((m) => m.familias.flatMap((f) => f.params))
    .map((o) => [o, new Set(pol.filter((r) => Number.isFinite(r[o.v])).map((r) => r.Site)).size])
    .filter(([, n]) => n > 0 && n < sitios)
    .sort((a, b2) => a[1] - b2[1]);

  const pt = getLang() === 'pt';
  const nome = (o) => (pt ? o.pt : o.en);
  const ressalva = parciais.length
    ? (pt
      ? ` Dois não alcançam todos: ${parciais.map(([o, n]) => `${b(nome(o))} (${n})`).join(' e ')}, `
        + `por ficarem abaixo do limite de detecção na maioria das amostras.`
      : ` Two fall short: ${parciais.map(([o, n]) => `${b(nome(o))} (${n})`).join(' and ')}, `
        + `because they sit below the detection limit in most samples.`)
    : '';

  return pt
    ? `${b(nAgua + ' parâmetros')} em água e ${b(nSed)} em sedimento — e ${b('nenhum')} medido nas duas matrizes, `
      + `então as duas metades do painel não se comparam entre si. `
      + `Quase todos cobrem os ${b(plural(sitios, 'sítio'))}.${ressalva} `
      + `A faixa de cada linha vai do menor ao maior sítio, com a mediana marcada: `
      + `quanto mais a marca se afasta do centro, mais assimétrica é a distribuição entre sítios.`
    : `${b(nAgua + ' parameters')} in seawater and ${b(nSed)} in sediment — and ${b('none')} measured in both matrices, `
      + `so the two halves of the panel are not comparable with each other. `
      + `Almost all cover the ${b(sitios)} sites.${ressalva} `
      + `Each row's strip runs from the lowest to the highest site, with the median marked: `
      + `the further the mark sits from the centre, the more skewed the distribution across sites.`;
}

/**
 * Leitura da área circulada. Diz de quantos sítios ela é feita E de que
 * conjuntos: circular 74 pontos e ver uma comparação que soma 56 deixa a
 * diferença sem explicação -- são os sítios que não têm peixe.
 */
function readE1Desenho(core, sites) {
  const n = sites.length;
  if (!n) {
    return pt()
      ? 'Nenhum sítio dentro da área desenhada. Desenhe em volta dos pontos.'
      : 'No site inside the drawn area. Draw around the points.';
  }
  const conta = (ds) => sites.filter((s) => s[`has_${ds}`]).length;
  const peixe = conta('fish');
  const coral = conta('coral');
  const bent = conta('benthos');
  const estados = [...new Set(sites.map((s) => tituloUC(s.uf_nome ?? s.uf)).filter(Boolean))];

  const partes = [];
  if (peixe) partes.push(`${b(peixe)} de peixes`);
  if (coral) partes.push(`${b(coral)} de corais`);
  if (bent) partes.push(`${b(bent)} de bentos`);
  const partesEn = [];
  if (peixe) partesEn.push(`${b(peixe)} fish`);
  if (coral) partesEn.push(`${b(coral)} coral`);
  if (bent) partesEn.push(`${b(bent)} benthos`);

  const faltando = [];
  if (!coral) faltando.push(pt() ? 'corais' : 'coral');
  if (!bent) faltando.push(pt() ? 'bentos' : 'benthos');
  const ressalva = faltando.length
    ? (pt()
      ? ` Nenhum sítio de ${serie(faltando)} nesta área — esses conjuntos não entram nas estatísticas abaixo.`
      : ` No ${serie(faltando)} site in this area — those layers are absent from the figures below.`)
    : '';

  const espalhado = estados.length > 1
    ? (pt()
      ? ` A área atravessa ${b(estados.length)} estados (${serie(estados)}).`
      : ` The area spans ${b(estados.length)} states (${serie(estados)}).`)
    : '';

  return pt()
    ? `Área desenhada com ${b(plural(n, 'sítio'))}: ${serie(partes)}.${ressalva}${espalhado}`
    : `Drawn area with ${b(n)} site(s): ${serie(partesEn)}.${ressalva}${espalhado}`;
}
