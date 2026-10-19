// ===========================================================================
// Configuracao: conjuntos de dados, modos do mapa, variaveis e textos
//
// Porta direta de R/i18n.R e R/utils.R do painel Shiny. Tudo o que e rotulo
// ou escolha de interface vive aqui; nenhum outro modulo tem string literal
// visivel ao usuario.
// ===========================================================================

export const DATASETS = ['benthos', 'fish', 'fishers', 'pollution', 'productivity'];

export const DS_COLOR = {
  benthos:      '#3C9BA5',
  fish:         '#353F7C',
  fishers:      '#FDA749',
  pollution:    '#982263',
  productivity: '#F76043',
};

// Rampas sequenciais do mapa. Cada uma parte do azul claro institucional,
// passa pela cor do conjunto e termina numa versao escurecida dela -- assim a
// escala de cor e legivel e ao mesmo tempo identifica o conjunto.
export const RAMP = {
  datasets:     ['#E1EAF9', '#353F7C', '#20264B'],
  benthos:      ['#E1EAF9', '#3C9BA5', '#1E5A61'],
  fish:         ['#E1EAF9', '#353F7C', '#1B2048'],
  pollution:    ['#F7E4EE', '#982263', '#561137'],
  productivity: ['#FDEEE9', '#F76043', '#8E2C18'],
};

export const MAP_MODES = ['datasets', 'benthos', 'fish', 'pollution', 'productivity'];

// Variavel exibida em cada modo. `src` diz de qual tabela do core vem o valor,
// `field` qual coluna, e `filter` um recorte adicional (grupo funcional).
export const MODE_VARS = {
  benthos: {
    src: 'benthos_comp', field: 'proportion', filterField: 'functional_group',
    unit: '%',
    options: [
      { v: 'Algae',               pt: 'Macroalgas',           en: 'Macroalgae' },
      { v: 'Hard coral',          pt: 'Coral Construtor',     en: 'Hard Coral' },
      { v: 'Other Invertebrates', pt: 'Outros Invertebrados', en: 'Other Invertebrates' },
      { v: 'Soft Substrate',      pt: 'Substrato Friável',    en: 'Soft Substrate' },
      { v: 'Other',               pt: 'Outro',                en: 'Other' },
    ],
  },
  fish: {
    src: 'fish_year', unit: '',
    options: [
      { v: 'richness',        pt: 'Riqueza de Espécies',        en: 'Species Richness' },
      { v: 'mean_abundance',  pt: 'Abundância Média por Censo', en: 'Mean Abundance per Census' },
      { v: 'total_abundance', pt: 'Abundância Total',           en: 'Total Abundance' },
      { v: 'n_events',        pt: 'Número de Censos (esforço)', en: 'Number of Censuses (effort)' },
      { v: 'n_families',      pt: 'Número de Famílias',         en: 'Number of Families' },
    ],
  },
  pollution: {
    src: 'pollution', unit: '',
    options: [
      { v: 'Salinity',       pt: 'Salinidade',            en: 'Salinity' },
      { v: 'Temperature',    pt: 'Temperatura',           en: 'Temperature' },
      { v: 'pH Total Scale', pt: 'pH (Escala Total)',     en: 'pH (Total Scale)' },
      { v: 'DIN',            pt: 'Nitrogênio (DIN)',      en: 'Nitrogen (DIN)' },
      { v: 'Ortophosphate',  pt: 'Fosfato (Ortofosfato)', en: 'Phosphate (Orthophosphate)' },
      { v: 'Total PAHs',     pt: 'HPAs Totais',           en: 'Total PAHs' },
      { v: 'Total Sterols',  pt: 'Esteróis Totais',       en: 'Total Sterols' },
      { v: 'Aluminum (Al)',  pt: 'Alumínio (Al)',         en: 'Aluminium (Al)' },
      { v: 'Iron (Fe)',      pt: 'Ferro (Fe)',            en: 'Iron (Fe)' },
      { v: 'Zinc (Zn)',      pt: 'Zinco (Zn)',            en: 'Zinc (Zn)' },
    ],
  },
  productivity: {
    src: 'productivity', unit: '',
    options: [
      { v: 'Live rhodoliths', pt: 'Biomassa de Rodolitos Vivos',     en: 'Live Rhodolith Biomass' },
      { v: 'Dead rhodoliths', pt: 'Biomassa de Rodolitos Mortos',    en: 'Dead Rhodolith Biomass' },
      { v: 'NCC netflux',     pt: 'Calcificação Líquida (NCC)',      en: 'Net Calcification (NCC)' },
      { v: 'NCP netflux',     pt: 'Produção Primária Líquida (NCP)', en: 'Net Production (NCP)' },
    ],
  },
};

export const SPATIAL_LAYERS = [
  { v: 'none', pt: 'Nenhuma (apenas pontos)',          en: 'None (points only)' },
  { v: 'reef', pt: 'Recife mapeado (Allen Coral Atlas)', en: 'Mapped reef (Allen Coral Atlas)' },
  { v: 'band', pt: 'Faixa costeira (200 m)',           en: 'Coastal band (200 m)' },
];

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const STRINGS = {
  pt: {
    tab_map: 'Mapa', tab_temporal: 'Séries Temporais',
    tab_stats: 'Composição', tab_data: 'Dados',
    brand_sub: 'Fernando de Noronha',
    panel_filters: 'Recorte e camadas',
    f_level: 'Nível da Hierarquia', f_mode: 'Modo de Visualização',
    f_layer: 'Camada Espacial', f_datasets: 'Conjuntos de Dados',
    f_var_benthos: 'Grupo Funcional', f_var_fish: 'Métrica',
    f_var_pollution: 'Parâmetro', f_var_productivity: 'Parâmetro Metabólico',
    lvl_archipelago: 'Arquipélago', lvl_zone: 'Zona', lvl_site: 'Sítio',
    mode_datasets: 'Conjuntos de dados', mode_benthos: 'Cobertura bentônica',
    mode_fish: 'Peixes recifais', mode_pollution: 'Poluição',
    mode_productivity: 'Produtividade',
    ds_benthos: 'Bentos', ds_fish: 'Peixes', ds_fishers: 'Pescadores',
    ds_pollution: 'Poluição', ds_productivity: 'Produtividade',
    m_sites: 'Sítios', m_datasets: 'Conjuntos', m_records: 'Registros',
    m_species: 'Espécies', m_years: 'Anos',
    profile: 'Perfil do sítio', no_site: 'Selecione um ponto no mapa',
    available: 'Dados disponíveis', top_species: 'Espécies mais abundantes',
    individuals: 'Indivíduos', censuses: 'Censos', quadrats: 'Fotoquadrantes',
    families: 'Famílias',
    year_range: 'Período', richness: 'Riqueza', cover: 'Cobertura',
    download: 'Baixar CSV', loading: 'Carregando dados',
    table: 'Tabela', rows: 'linhas',
    restricted_note: 'Conjuntos não publicados',
    no_data: 'Sem dados para a seleção atual',
    all_zones: 'Todas as zonas', all_sites: 'Todos os sítios',
    orphan_reef: 'Recife mapeado — sem amostragem em 500 m',
  },
  en: {
    tab_map: 'Map', tab_temporal: 'Time Series',
    tab_stats: 'Composition', tab_data: 'Data',
    brand_sub: 'Fernando de Noronha',
    panel_filters: 'Recorte e camadas',
    f_level: 'Hierarchy Level', f_mode: 'Display Mode',
    f_layer: 'Spatial Layer', f_datasets: 'Datasets',
    f_var_benthos: 'Functional Group', f_var_fish: 'Metric',
    f_var_pollution: 'Parameter', f_var_productivity: 'Flux Parameter',
    lvl_archipelago: 'Archipelago', lvl_zone: 'Zone', lvl_site: 'Site',
    mode_datasets: 'Datasets', mode_benthos: 'Benthic cover',
    mode_fish: 'Reef fish', mode_pollution: 'Pollution',
    mode_productivity: 'Productivity',
    ds_benthos: 'Benthos', ds_fish: 'Fish', ds_fishers: 'Fishers',
    ds_pollution: 'Pollution', ds_productivity: 'Productivity',
    m_sites: 'Sites', m_datasets: 'Datasets', m_records: 'Records',
    m_species: 'Species', m_years: 'Years',
    profile: 'Site profile', no_site: 'Select a point on the map',
    available: 'Available data', top_species: 'Most abundant species',
    individuals: 'Individuals', censuses: 'Censuses', quadrats: 'Photoquadrats',
    families: 'Families',
    year_range: 'Period', richness: 'Richness', cover: 'Cover',
    download: 'Download CSV', loading: 'Loading data',
    table: 'Table', rows: 'rows',
    restricted_note: 'Unpublished datasets',
    no_data: 'No data for the current selection',
    all_zones: 'All zones', all_sites: 'All sites',
    orphan_reef: 'Mapped reef — no sampling within 500 m',
  },
};

let LANG = 'pt';
export const setLang = (l) => { LANG = l; };
export const getLang = () => LANG;
export const t = (k) => STRINGS[LANG][k] ?? STRINGS.pt[k] ?? k;

/** Rotulo de uma opcao { v, pt, en } no idioma ativo. */
export const optLabel = (o) => o[LANG] ?? o.pt;

export function varLabel(mode, value) {
  const spec = MODE_VARS[mode];
  if (!spec) return value;
  const o = spec.options.find((x) => x.v === value);
  return o ? optLabel(o) : value;
}

export function varFieldLabel(mode) {
  return t(`f_var_${mode}`) ?? t('f_mode');
}
