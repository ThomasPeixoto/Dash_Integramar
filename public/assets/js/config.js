// ===========================================================================
// Configuracao: conjuntos de dados, modos do mapa, variaveis e textos
//
// Porta direta de R/i18n.R e R/utils.R do painel Shiny. Tudo o que e rotulo
// ou escolha de interface vive aqui; nenhum outro modulo tem string literal
// visivel ao usuario.
// ===========================================================================

export const DATASETS = ['benthos', 'fish', 'fishers', 'pollution', 'productivity'];

// ---------------------------------------------------------------------------
// Eixos tematicos
// ---------------------------------------------------------------------------
//
// Espelham a estrutura de https://integramar.org/o-projeto/. O padrao que o
// site institucional usa -- cada linha de pesquisa apresentada como uma
// PERGUNTA -- e o que organiza este painel: a navegacao e por pergunta, nao
// por ferramenta.
//
// Os nomes dos coordenadores estao no site mas NAO aqui: a atribuicao de
// autoria dos conjuntos ainda esta pendente e sera definida depois.
export const EIXOS = [
  {
    id: 'eixo1', n: 1, color: '#3C9BA5',
    short:  { pt: 'Biodiversidade',  en: 'Biodiversity' },
    title:  { pt: 'Biodiversidade, funcionamento e resiliência dos recifes',
              en: 'Reef biodiversity, functioning and resilience' },
    accent: { pt: 'resiliência',     en: 'resilience' },
    lede: {
      pt: 'Censos visuais de peixes recifais e fotoquadrados da comunidade bentônica em Fernando de Noronha, acompanhando como a composição e a abundância dessas comunidades se transformam ao longo do tempo.',
      en: 'Underwater visual censuses of reef fish and photoquadrats of the benthic community in Fernando de Noronha, tracking how composition and abundance change over time.',
    },
    datasets: ['benthos', 'fish'],
  },
  {
    id: 'eixo2', n: 2, color: '#982263',
    short:  { pt: 'Impactos',  en: 'Impacts' },
    title:  { pt: 'Impactos locais, globais e sinérgicos',
              en: 'Local, global and synergistic impacts' },
    accent: { pt: 'sinérgicos', en: 'synergistic' },
    lede: {
      pt: 'Amostras de água e sedimento dentro e fora de unidades de conservação, avaliando nutrientes, metais, hidrocarbonetos e indicadores de contaminação por esgoto.',
      en: 'Seawater and sediment samples inside and outside protected areas, assessing nutrients, metals, hydrocarbons and sewage contamination indicators.',
    },
    datasets: ['pollution'],
  },
  {
    id: 'eixo3', n: 3, color: '#F76043',
    short:  { pt: 'Serviços',  en: 'Services' },
    title:  { pt: 'Serviços ecossistêmicos',
              en: 'Ecosystem services' },
    accent: { pt: 'ecossistêmicos', en: 'services' },
    lede: {
      pt: 'Como a biodiversidade marinha contribui para o bem-estar da sociedade — do ciclo do carbono nos bancos de rodolitos à alimentação das comunidades pesqueiras.',
      en: 'How marine biodiversity supports human well-being — from the carbon cycle in rhodolith beds to the diet of fishing communities.',
    },
    datasets: ['productivity', 'fishers'],
  },
  {
    id: 'eixo4', n: 4, color: '#353F7C',
    short:  { pt: 'Gestão',  en: 'Management' },
    title:  { pt: 'Subsídios à gestão e ao manejo',
              en: 'Evidence for management' },
    accent: { pt: 'gestão', en: 'management' },
    lede: {
      pt: 'Fernando de Noronha é dividida entre duas categorias de proteção: o Parque Nacional Marinho, de proteção integral, e a Área de Proteção Ambiental, de uso sustentável. Esta seção compara o que os dados mostram de um lado e de outro.',
      en: 'Fernando de Noronha is split between two protection categories: the Marine National Park, fully protected, and the Environmental Protection Area, of sustainable use. This section compares what the data show on each side.',
    },
    datasets: ['fish', 'pollution'],
  },
];

export const eixoById = (id) => EIXOS.find((e) => e.id === id);

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
    // A ordem segue a leitura ecológica, não o alfabeto: produtores primários
    // primeiro, depois coral e invertebrados, por último substrato e o que
    // não foi identificado.
    options: [
      { v: 'Algae',               pt: 'Macroalgas',           en: 'Macroalgae' },
      { v: 'Turf filamentous',    pt: 'Turf filamentoso',     en: 'Filamentous turf' },
      { v: 'Turf calcareous',     pt: 'Turf calcário',        en: 'Calcareous turf' },
      { v: 'Hard coral',          pt: 'Coral Construtor',     en: 'Hard Coral' },
      { v: 'Other Invertebrates', pt: 'Outros Invertebrados', en: 'Other Invertebrates' },
      { v: 'Soft Substrate',      pt: 'Substrato Friável',    en: 'Soft Substrate' },
      { v: 'Cyanobacteria',       pt: 'Cianobactérias',       en: 'Cyanobacteria' },
      { v: 'Unclassified',        pt: 'Não classificado',     en: 'Unclassified' },
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
    q_e1_map: 'Onde a rede monitora, e o que cada sítio tem?',
    q_e1_time: 'Como as comunidades mudam ao longo do tempo?',
    q_e2_map: 'Onde estão as áreas mais vulneráveis à poluição?',
    q_e2_rank: 'Quais sítios concentram os maiores valores?',
    q_e3_rod: 'Qual é o papel dos bancos de rodolitos no ciclo do carbono?',
    q_e3_pesca: 'Que peixes comemos, e quanto o pescado pesa na alimentação?',
    q_e4_fish: 'A proteção integral se reflete nas comunidades de peixes?',
    q_e4_pol: 'A contaminação difere entre o parque e a área de uso sustentável?',
    zone_parnamar: 'Parque Nacional Marinho',
    zone_apa: 'Área de Proteção Ambiental',
    chart_rod: 'Fluxos metabólicos por câmara',
    chart_consumo: 'Consumo semanal por tipo de alimento',
    chart_captura: 'Espécies citadas na captura',
    chart_rank: 'Valor médio por sítio',
    food_fish: 'Pescado', food_mollusk: 'Moluscos', food_crustaceans: 'Crustáceos',
    food_cephalopods: 'Cefalópodes', food_beef: 'Carne bovina', food_pork: 'Suína',
    food_chicken: 'Frango', food_processed_meat: 'Processados',
    food_sheep: 'Ovina', food_game: 'Caça',
    kg_week: 'kg por semana', days_week: 'dias por semana',
    interviews: 'entrevistas', chambers: 'câmaras',
    temporal_h2_a: 'Como as comunidades',
    temporal_h2_b: 'mudam no tempo',
    temporal_lede: 'Cobertura bentônica e abundância de peixes recifais por ano, agregadas entre os sítios selecionados. A faixa sombreada é o erro padrão entre sítios.',
    trend_title: 'Tendência por grupo',
    taxon_title: 'Comparar táxons',
    taxon_sub: 'Até 6 por vez',
    heat_title: 'Ano × grupo',
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
    panel_filters: 'Scope and layers',
    q_e1_map: 'Where does the network monitor, and what does each site hold?',
    q_e1_time: 'How do communities change over time?',
    q_e2_map: 'Where are the areas most vulnerable to pollution?',
    q_e2_rank: 'Which sites concentrate the highest values?',
    q_e3_rod: 'What is the role of rhodolith beds in the carbon cycle?',
    q_e3_pesca: 'Which fish are eaten, and how much does seafood weigh in the diet?',
    q_e4_fish: 'Is full protection reflected in the fish communities?',
    q_e4_pol: 'Does contamination differ between the park and the sustainable-use area?',
    zone_parnamar: 'Marine National Park',
    zone_apa: 'Environmental Protection Area',
    chart_rod: 'Metabolic fluxes per chamber',
    chart_consumo: 'Weekly consumption by food type',
    chart_captura: 'Species named in the catch',
    chart_rank: 'Mean value per site',
    food_fish: 'Seafood', food_mollusk: 'Molluscs', food_crustaceans: 'Crustaceans',
    food_cephalopods: 'Cephalopods', food_beef: 'Beef', food_pork: 'Pork',
    food_chicken: 'Chicken', food_processed_meat: 'Processed',
    food_sheep: 'Lamb', food_game: 'Game',
    kg_week: 'kg per week', days_week: 'days per week',
    interviews: 'interviews', chambers: 'chambers',
    temporal_h2_a: 'How communities',
    temporal_h2_b: 'change over time',
    temporal_lede: 'Benthic cover and reef fish abundance per year, pooled across the selected sites. The shaded band is the standard error among sites.',
    trend_title: 'Trend by group',
    taxon_title: 'Compare taxa',
    taxon_sub: 'Up to 6 at a time',
    heat_title: 'Year × group',
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
