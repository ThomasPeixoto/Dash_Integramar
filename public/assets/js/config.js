// ===========================================================================
// Configuracao: conjuntos de dados, modos do mapa, variaveis e textos
//
// Porta direta de R/i18n.R e R/utils.R do painel Shiny. Tudo o que e rotulo
// ou escolha de interface vive aqui; nenhum outro modulo tem string literal
// visivel ao usuario.
// ===========================================================================

export const DATASETS = ['benthos', 'fish', 'fishers', 'pollution', 'productivity'];

// Camadas da escala nacional. São fontes distintas, com coberturas e
// categorias distintas, e por isso nunca viram uma série só:
//   fish             ReefSYN nacional        232 sítios   2001-2023
//   coral            Scleractinia a espécie    90 sítios   2006-2019
//   benthos          PELD-ILOC Noronha         4 sítios   2021-2024
// Três camadas separadas, porque são três perguntas distintas e três níveis
// de comparabilidade distintos:
//   fish     ReefSYN nacional          232 sítios  2001-2023
//   coral    corais a espécie, 5 ds     90 sítios  2006-2019  comparável
//   benthos  comunidade, por dataset   103 sítios  2010-2024  NUNCA somada
export const NATIONAL_DATASETS = ['fish', 'coral', 'benthos'];

/** Datasets de comunidade bentônica. Cada um é sua própria camada. */
export const BENTHOS_SOURCES = [
  { v: 'XIV',     pt: 'Costa (XIV)',          en: 'Coast (XIV)' },
  { v: 'XV',      pt: 'Ilhas oceânicas (XV)', en: 'Oceanic islands (XV)' },
  { v: 'XVI',     pt: 'Rio Grande do Norte (XVI)', en: 'Rio Grande do Norte (XVI)' },
  { v: 'Noronha', pt: 'Noronha (2021-2024)',  en: 'Noronha (2021-2024)' },
];

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
// As cores vem do proprio site: cada cartao da equipe pinta o anel do avatar
// com a cor do eixo da pessoa (--avatar-ring), e e de la que estao lidas.
//   Eixo 1 #F76043 · Eixo 2 #982263 · Eixo 3 #353F7C · Eixo 4 #FDA749
export const EIXOS = [
  {
    id: 'eixo1', n: 1, color: '#F76043',
    short:  { pt: 'Biodiversidade',  en: 'Biodiversity' },
    title:  { pt: 'Biodiversidade, funcionamento e resiliência dos recifes',
              en: 'Reef biodiversity, functioning and resilience' },
    lede: {
      pt: 'Três camadas ao longo da costa brasileira: censos visuais de peixes recifais, a assembleia de corais escleractíneos identificada a espécie, e a comunidade bentônica em fotoquadrados. São metodologias distintas, com coberturas distintas, e o painel as mantém separadas.',
      en: 'Three layers along the Brazilian coast: underwater visual censuses of reef fish, the scleractinian coral assemblage identified to species, and the benthic community in photoquadrats. These are distinct methods with distinct coverage, and the panel keeps them apart.',
    },
    datasets: NATIONAL_DATASETS,
  },
  {
    id: 'eixo2', n: 2, color: '#982263',
    short:  { pt: 'Impactos',  en: 'Impacts' },
    title:  { pt: 'Impactos locais, globais e sinérgicos',
              en: 'Local, global and synergistic impacts' },
    lede: {
      pt: 'Amostras de água e sedimento dentro e fora de unidades de conservação, avaliando nutrientes, metais, hidrocarbonetos e indicadores de contaminação por esgoto.',
      en: 'Seawater and sediment samples inside and outside protected areas, assessing nutrients, metals, hydrocarbons and sewage contamination indicators.',
    },
    datasets: ['pollution'],
  },
  {
    id: 'eixo3', n: 3, color: '#353F7C',
    short:  { pt: 'Serviços',  en: 'Services' },
    title:  { pt: 'Serviços ecossistêmicos',
              en: 'Ecosystem services' },
    lede: {
      pt: 'Como a biodiversidade marinha contribui para o bem-estar da sociedade — do ciclo do carbono nos bancos de rodolitos à alimentação das comunidades pesqueiras.',
      en: 'How marine biodiversity supports human well-being — from the carbon cycle in rhodolith beds to the diet of fishing communities.',
    },
    datasets: ['productivity', 'fishers'],
  },
  {
    id: 'eixo4', n: 4, color: '#FDA749',
    short:  { pt: 'Gestão',  en: 'Management' },
    title:  { pt: 'Subsídios à gestão e ao manejo',
              en: 'Evidence for management' },
    lede: {
      pt: 'Fernando de Noronha é dividida entre duas categorias de proteção: o Parque Nacional Marinho, de proteção integral, e a Área de Proteção Ambiental, de uso sustentável. Esta seção compara o que os dados mostram de um lado e de outro.',
      en: 'Fernando de Noronha is split between two protection categories: the Marine National Park, fully protected, and the Environmental Protection Area, of sustainable use. This section compares what the data show on each side.',
    },
    datasets: ['fish', 'pollution'],
  },
];

export const eixoById = (id) => EIXOS.find((e) => e.id === id);

// ---------------------------------------------------------------------------
// Responsáveis pelos dados
// ---------------------------------------------------------------------------
//
// Atribuição definida pelo Thomas; foto, instituição e link vêm da página de
// equipe de integramar.org. O cargo que o site mostra não é repetido aqui: o
// que esta ficha declara é a responsabilidade pelo CONJUNTO DE DADOS, que não
// é a mesma coisa que o papel da pessoa na rede.
export const CREDITS = {
  benthos: {
    name: 'Dr. Cesar M. M. Cordeiro',
    inst: { pt: 'Universidade Estadual do Norte Fluminense', en: 'Universidade Estadual do Norte Fluminense' },
    photo: 'cesar-m-m-cordeiro.webp',
    email: 'cammcordeiro@gmail.com',
    link: 'https://lattes.cnpq.br/6383192984652602',
  },
  fish: {
    name: 'Dr. Sergio R. Floeter',
    inst: { pt: 'Universidade Federal de Santa Catarina', en: 'Universidade Federal de Santa Catarina' },
    photo: 'sergio-r-floeter.webp',
    email: 'sergio.floeter@gmail.com',
    link: 'http://lattes.cnpq.br/1643200379939208',
  },
  productivity: {
    name: 'MSc. Tainá L. Gaspar',
    inst: { pt: 'Universidade Federal de Santa Catarina', en: 'Universidade Federal de Santa Catarina' },
    photo: 'taina-l-gaspar.webp',
    email: 'tainalgaspar@gmail.com',
    link: null,
  },
  coral: {
    name: 'Dr. Guilherme O. Longo',
    inst: { pt: 'Universidade Federal do Rio Grande do Norte', en: 'Universidade Federal do Rio Grande do Norte' },
    photo: 'guilherme-o-longo.webp',
    email: 'guilhermeolongo@gmail.com',
    link: 'http://lattes.cnpq.br/3947302863354812',
  },
  pollution: {
    name: 'Drª. Cybelle M. Longhini',
    inst: { pt: 'Universidade Federal do Rio Grande do Norte', en: 'Universidade Federal do Rio Grande do Norte' },
    photo: 'cybelle-m-longhini.webp',
    email: 'belle.longhini@gmail.com',
    link: 'http://lattes.cnpq.br/9860249629296525',
  },
  fishers: {
    name: 'MSc. Maria Luiza Gallina',
    inst: { pt: 'Universidade Federal do Ceará', en: 'Universidade Federal do Ceará' },
    photo: 'maria-luiza-gallina.webp',
    email: 'malugallinaxavier@gmail.com',
    link: null,
  },
};

export const DS_COLOR = {
  benthos:      '#3C9BA5',
  fish:         '#353F7C',
  fishers:      '#FDA749',
  pollution:    '#982263',
  productivity: '#F76043',
  coral: '#F76043',
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

// Recortes do modo de GENERALIZAÇÃO na escala nacional: ao ligar um deles os
// pontos somem e o valor passa a viver no polígono que os contém.
export const NATIONAL_LAYERS = [
  { v: 'none',    pt: 'Nenhum (pontos por sítio)', en: 'None (points per site)' },
  { v: 'estados', pt: 'Por estado',                en: 'By state' },
  { v: 'ucs',     pt: 'Por unidade de conservação', en: 'By protected area' },
];

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
    credits: 'Responsáveis pelos dados',
    credit_profile: 'Abrir perfil',
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
    lvl_brasil: 'Brasil', lvl_region: 'Região', lvl_uc: 'Unidade de Conservação',
    lvl_uf: 'Estado', all_ufs: 'Todos os estados', f_generalize: 'Generalizar por',
    all_ucs: 'Todas as UCs', all_regions: 'Todas as regiões',
    mode_datasets: 'Conjuntos de dados', mode_benthos: 'Cobertura bentônica',
    mode_fish: 'Peixes recifais', mode_pollution: 'Poluição',
    mode_productivity: 'Produtividade',
    ds_benthos: 'Bentos', ds_coral: 'Corais',
    ds_fish: 'Peixes', ds_fishers: 'Pescadores',
    ds_pollution: 'Poluição', ds_productivity: 'Produtividade',
    m_sites: 'Sítios', m_datasets: 'Conjuntos', m_records: 'Registros',
    m_species: 'Espécies', m_years: 'Anos',
    profile: 'Perfil do sítio', profile_area: 'Perfil da área', no_site: 'Selecione um ponto no mapa',
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
    credits: 'Data stewards',
    credit_profile: 'Open profile',
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
    lvl_brasil: 'Brazil', lvl_region: 'Region', lvl_uc: 'Protected area',
    lvl_uf: 'State', all_ufs: 'All states', f_generalize: 'Generalise by',
    all_ucs: 'All protected areas', all_regions: 'All regions',
    mode_datasets: 'Datasets', mode_benthos: 'Benthic cover',
    mode_fish: 'Reef fish', mode_pollution: 'Pollution',
    mode_productivity: 'Productivity',
    ds_benthos: 'Benthos', ds_coral: 'Corals',
    ds_fish: 'Fish', ds_fishers: 'Fishers',
    ds_pollution: 'Pollution', ds_productivity: 'Productivity',
    m_sites: 'Sites', m_datasets: 'Datasets', m_records: 'Records',
    m_species: 'Species', m_years: 'Years',
    profile: 'Site profile', profile_area: 'Area profile', no_site: 'Select a point on the map',
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

// Campos que só existem na visão por área: fora de um modo de variável o
// polígono mostra quantos sítios tem, e esse campo não está em MODE_VARS.
const AREA_FIELDS = {
  n_sites:  { pt: 'Sítios amostrados',  en: 'Sampled sites' },
  n_events: { pt: 'Censos realizados',  en: 'Censuses' },
};

export function varLabel(mode, value) {
  if (AREA_FIELDS[value] && !MODE_VARS[mode]) return optLabel(AREA_FIELDS[value]);
  const spec = MODE_VARS[mode];
  if (!spec) return value;
  const o = spec.options.find((x) => x.v === value);
  return o ? optLabel(o) : value;
}

export function varFieldLabel(mode) {
  return t(`f_var_${mode}`) ?? t('f_mode');
}
