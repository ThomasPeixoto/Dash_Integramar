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
    id: 'eixo1', icone: '11-icone-eixo-biodiversidade.webp', n: 1, color: '#F76043',
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
    id: 'eixo2', icone: '12-icone-eixo-impactos.webp', n: 2, color: '#982263',
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
    id: 'eixo3', icone: '13-icone-eixo-servicos.webp', n: 3, color: '#353F7C',
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
    id: 'eixo4', icone: '14-icone-eixo-gestao.webp', n: 4, color: '#FDA749',
    short:  { pt: 'Gestão',  en: 'Management' },
    title:  { pt: 'Subsídios à gestão e ao manejo',
              en: 'Evidence for management' },
    lede: { pt: '', en: '' },
    datasets: [],
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
// Duas intencoes diferentes que viviam num controle so:
//
//   contorno  -- mostrar ONDE as areas estao. Os pontos continuam, porque o
//                limite e contexto para eles, nao substituto.
//   geral     -- o valor passa a viver no POLIGONO. Ai os pontos somem mesmo:
//                mante-los pintados sugeriria que cada sitio carrega o numero
//                da area inteira, que e o oposto do que a generalizacao diz.
//
// O `modo` viaja junto com a opcao para que a escolha seja uma so na tela.
export const NATIONAL_LAYERS = [
  { v: 'none', modo: 'contorno',
    pt: 'Nenhum (apenas pontos)', en: 'None (points only)' },
  { v: 'estados', modo: 'contorno',
    pt: 'Limites dos estados', en: 'State boundaries' },
  { v: 'ucs', modo: 'contorno',
    pt: 'Limites das UCs', en: 'MPA boundaries' },
  { v: 'estados', modo: 'geral',
    pt: 'Generalizar por estado (sem os pontos)',
    en: 'Generalise by state (points hidden)' },
  { v: 'ucs', modo: 'geral',
    pt: 'Generalizar por UC (sem os pontos)',
    en: 'Generalise by MPA (points hidden)' },
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
    q_e2_param: 'O que foi medido, e onde há contraste entre sítios?',
    q_e3_rod: 'Qual é o papel dos bancos de rodolitos no ciclo do carbono?',
    q_e3_pesca: 'Que peixes comemos, e quanto o pescado pesa na alimentação?',
    q_e4_fish: 'A proteção integral se reflete nas comunidades de peixes?',
    q_e4_pol: 'A contaminação difere entre o parque e a área de uso sustentável?',
    zone_parnamar: 'Parque Nacional Marinho',
    zone_apa: 'Área de Proteção Ambiental',
    chart_rod: 'Fluxos metabólicos por câmara',
    chart_rod_dn: 'Dia e noite: de onde vem o saldo',
    chart_rod_comp: 'Do que o banco é feito',
    q_e3_quem: 'Quem vive da pesca aqui?',
    chart_ocup: 'De que mais vivem',
    chart_exper: 'Anos de pesca',
    ocup_turism: 'Também no turismo', ocup_no: 'Só da pesca',
    ocup_diver: 'Também mergulho', ocup_sem_resposta: 'Sem resposta',
    cmp_on: 'Comparar conjuntos', draw_on: 'Desenhar área',
    f_ferramentas: 'Ferramentas', cmp_by: 'Comparar por', cmp_pick: 'Grupos',
    prot_integral: 'Proteção integral', prot_sustentavel: 'Uso sustentável',
    prot_fora: 'Fora de UC', prot_outra: 'UC de categoria indefinida',
    cmp_metric: 'Métrica', cmp_sem_grupos: 'Escolha ao menos dois grupos para comparar.',
    cmp_um_grupo: 'só um grupo neste recorte; mostrando a série do conjunto',
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
    f_areas: 'Áreas no mapa',
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
    // Dimensao da serie temporal quando ha um lugar selecionado
    dim_label: 'Ver ao longo do tempo',
    dim_params: 'Parâmetros', dim_family: 'Famílias', dim_species: 'Espécies',
    dim_region: 'Por região',
    recorte_brasil: 'Brasil inteiro',
    limpar_recorte: 'Limpar seleção',
    serie_de: 'Série de',
    p_abundancia: 'Indivíduos por censo', p_riqueza: 'Riqueza (spp. por ano)',
    p_familias: 'Nº de famílias', p_censos: 'Nº de censos',
    p_coral_riqueza: 'Espécies de coral', p_coral_eventos: 'Nº de amostragens',
    cmp_dim_protecao: 'Por proteção', cmp_dim_uc: 'Por UC',
    cmp_dim_uf: 'Por estado', cmp_dim_region: 'Por região',
    dim_geral: 'Visão geral',
    // Painel de taxons
    tx_title: 'Táxons escolhidos',
    tx_nivel_species: 'Espécies', tx_nivel_family: 'Famílias',
    tx_m_abund: 'Ind. por censo', tx_m_share: '% da assembleia',
    tx_m_pres: 'Táxons presentes', tx_m_cover: '% da assembleia de coral',
    tx_tipo_linha: 'Linha', tx_tipo_box: 'Boxplot',
    tx_sem_grupo: 'Sem grupo',
    tx_agrupar: 'Agrupar por',
    tx_m_tl: 'Nível trófico',
    // Painel de funcao da assembleia (biomassa, tamanho, nivel trofico)
    fn_title: 'Biomassa, tamanho e nível trófico',
    fn_m_bio: 'Biomassa', fn_m_len: 'Tamanho médio',
    fn_m_tlab: 'Nível trófico · abundância', fn_m_tlbio: 'Nível trófico · biomassa',
    fn_sem_dado: 'Sem dado de função para a seleção atual.',
    tx_busca: 'filtrar…', tx_limite: 'até 8 por vez',
    tx_vazio: 'Escolha ao menos um táxon na lista acima.',
    tx_nada: 'Nenhum táxon registrado nos sítios desta seleção.',
    tx_selecao: 'Seleção',
    download: 'Baixar CSV', loading: 'Carregando dados',
    table: 'Tabela', rows: 'linhas',
    restricted_note: 'Conjuntos não publicados',
    no_data: 'Sem dados para a seleção atual',
    all_zones: 'Todas as zonas', all_sites: 'Todos os sítios',
    orphan_reef: 'Recife mapeado — sem amostragem em 500 m',
    em_construcao: 'Em construção',
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
    q_e2_param: 'What was measured, and where do sites differ?',
    q_e3_rod: 'What is the role of rhodolith beds in the carbon cycle?',
    q_e3_pesca: 'Which fish are eaten, and how much does seafood weigh in the diet?',
    q_e4_fish: 'Is full protection reflected in the fish communities?',
    q_e4_pol: 'Does contamination differ between the park and the sustainable-use area?',
    zone_parnamar: 'Marine National Park',
    zone_apa: 'Environmental Protection Area',
    chart_rod: 'Metabolic fluxes per chamber',
    chart_rod_dn: 'Day and night: where the balance comes from',
    chart_rod_comp: 'What the bed is made of',
    q_e3_quem: 'Who lives from fishing here?',
    chart_ocup: 'What else they live on',
    chart_exper: 'Years of fishing',
    ocup_turism: 'Also in tourism', ocup_no: 'Fishing only',
    ocup_diver: 'Also diving', ocup_sem_resposta: 'No answer',
    cmp_on: 'Compare sets', draw_on: 'Draw an area',
    f_ferramentas: 'Tools', cmp_by: 'Compare by', cmp_pick: 'Groups',
    prot_integral: 'Full protection', prot_sustentavel: 'Sustainable use',
    prot_fora: 'Outside any MPA', prot_outra: 'MPA, category unclear',
    cmp_metric: 'Metric', cmp_sem_grupos: 'Pick at least two groups to compare.',
    cmp_um_grupo: 'only one group in this selection; showing the set as a whole',
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
    f_areas: 'Areas on the map',
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
    dim_label: 'Over time, show',
    dim_params: 'Parameters', dim_family: 'Families', dim_species: 'Species',
    dim_region: 'By region',
    recorte_brasil: 'All of Brazil',
    limpar_recorte: 'Clear selection',
    serie_de: 'Series for',
    p_abundancia: 'Individuals per census', p_riqueza: 'Richness (spp. per year)',
    p_familias: 'No. of families', p_censos: 'No. of censuses',
    p_coral_riqueza: 'Coral species', p_coral_eventos: 'No. of surveys',
    cmp_dim_protecao: 'By protection', cmp_dim_uc: 'By MPA',
    cmp_dim_uf: 'By state', cmp_dim_region: 'By region',
    dim_geral: 'Overview',
    tx_title: 'Chosen taxa',
    tx_nivel_species: 'Species', tx_nivel_family: 'Families',
    tx_m_abund: 'Ind. per census', tx_m_share: '% of assemblage',
    tx_m_pres: 'Taxa present', tx_m_cover: '% of coral assemblage',
    tx_tipo_linha: 'Line', tx_tipo_box: 'Boxplot',
    tx_sem_grupo: 'No grouping',
    tx_agrupar: 'Group by',
    tx_m_tl: 'Trophic level',
    fn_title: 'Biomass, size and trophic level',
    fn_m_bio: 'Biomass', fn_m_len: 'Mean size',
    fn_m_tlab: 'Trophic level · abundance', fn_m_tlbio: 'Trophic level · biomass',
    fn_sem_dado: 'No functional data for the current selection.',
    tx_busca: 'filter…', tx_limite: 'up to 8 at a time',
    tx_vazio: 'Pick at least one taxon in the list above.',
    tx_nada: 'No taxon recorded at the sites in this selection.',
    tx_selecao: 'Selection',
    download: 'Download CSV', loading: 'Loading data',
    table: 'Table', rows: 'rows',
    restricted_note: 'Unpublished datasets',
    no_data: 'No data for the current selection',
    all_zones: 'All zones', all_sites: 'All sites',
    orphan_reef: 'Mapped reef — no sampling within 500 m',
    em_construcao: 'Under construction',
  },
};

let LANG = 'pt';
export const setLang = (l) => { LANG = l; };
export const getLang = () => LANG;
export const t = (k) => STRINGS[LANG][k] ?? STRINGS.pt[k] ?? k;

// ---------------------------------------------------------------------------
// Poluicao: parametros agrupados por MATRIZ e por familia
//
// A matriz vem primeiro porque os dois conjuntos sao DISJUNTOS: nenhum dos 48
// parametros e medido em agua e em sedimento. Sao 8 so em agua (23 registros) e
// 40 so em sedimento (21). Numa lista unica, trocar de parametro trocava em
// silencio a matriz e o conjunto de sitios sob os pes de quem le.
//
// `total` marca a familia que soma a um total declarado -- e so nessas que uma
// rosca de composicao significa alguma coisa. Metais nao tem total: somar Fe
// (61.135) com Cd (0,65) numa rosca mostraria apenas o ferro.
//
// Unidades: as documentadas no projeto Shiny (mod_mapa.R). Os metais caem la
// no `switch` padrao e recebem "uM", que nao e unidade de metal em sedimento;
// aqui ficam SEM unidade ate que a fonte confirme, em vez de carregar o erro.
// ---------------------------------------------------------------------------
export const POLLUTION_GROUPS = [
  {
    matriz: 'Seawater', matrizPt: 'Água', matrizEn: 'Seawater',
    familias: [
      { id: 'fisquim', pt: 'Físico-químico', en: 'Physico-chemical', params: [
        { v: 'Salinity',       pt: 'Salinidade',        en: 'Salinity',    unit: 'g/kg' },
        { v: 'Temperature',    pt: 'Temperatura',       en: 'Temperature', unit: '°C' },
        { v: 'pH Total Scale', pt: 'pH (escala total)', en: 'pH (total scale)', unit: '' },
      ] },
      // O DIN soma APENAS as tres especies de nitrogenio -- confirmado no dado,
      // desvio 0,000 em 22 de 22 registros. O ortofosfato e fosforo e fica em
      // familia propria: deixa-lo sob um cabecalho "Σ DIN" dizia que ele
      // entrava na soma, e ele nao entra.
      { id: 'nitro', pt: 'Nitrogênio inorgânico', en: 'Inorganic nitrogen', total: 'DIN', params: [
        { v: 'Nitrite',       pt: 'Nitrito',       en: 'Nitrite',       unit: 'µM', parte: true },
        { v: 'Nitrate',       pt: 'Nitrato',       en: 'Nitrate',       unit: 'µM', parte: true },
        { v: 'N-Ammoniacal',  pt: 'N-amoniacal',   en: 'Ammonia-N',     unit: 'µM', parte: true },
        { v: 'DIN',           pt: 'DIN',           en: 'DIN',           unit: 'µM' },
      ] },
      { id: 'fosforo', pt: 'Fósforo', en: 'Phosphorus', params: [
        { v: 'Ortophosphate', pt: 'Ortofosfato',   en: 'Orthophosphate', unit: 'µM' },
      ] },
    ],
  },
  {
    matriz: 'Sediment', matrizPt: 'Sedimento', matrizEn: 'Sediment',
    familias: [
      { id: 'metais', pt: 'Metais', en: 'Metals', params: [
        { v: 'Aluminum (Al)', pt: 'Alumínio (Al)', en: 'Aluminium (Al)', unit: '' },
        { v: 'Iron (Fe)',     pt: 'Ferro (Fe)',    en: 'Iron (Fe)',      unit: '' },
        { v: 'Zinc (Zn)',     pt: 'Zinco (Zn)',    en: 'Zinc (Zn)',      unit: '' },
        { v: 'Chromium (Cr)', pt: 'Cromo (Cr)',    en: 'Chromium (Cr)',  unit: '' },
        { v: 'Copper (Cu)',   pt: 'Cobre (Cu)',    en: 'Copper (Cu)',    unit: '' },
        { v: 'Nickel (Ni)',   pt: 'Níquel (Ni)',   en: 'Nickel (Ni)',    unit: '' },
        { v: 'Lead (Pb)',     pt: 'Chumbo (Pb)',   en: 'Lead (Pb)',      unit: '' },
        { v: 'Arsenic (As)',  pt: 'Arsênio (As)',  en: 'Arsenic (As)',   unit: '' },
        { v: 'Cadmium (Cd)',  pt: 'Cádmio (Cd)',   en: 'Cadmium (Cd)',   unit: '' },
      ] },
      { id: 'hpa', pt: 'HPAs', en: 'PAHs', total: 'Total PAHs', params: [
        { v: 'Total PAHs',             pt: 'HPAs totais',        en: 'Total PAHs' },
        { v: 'Naphthalene',            pt: 'Naftaleno',          en: 'Naphthalene',            parte: true },
        { v: 'Acenaphthylene',         pt: 'Acenaftileno',       en: 'Acenaphthylene',         parte: true },
        { v: 'Acenaphthene',           pt: 'Acenafteno',         en: 'Acenaphthene',           parte: true },
        { v: 'Fluorene',               pt: 'Fluoreno',           en: 'Fluorene',               parte: true },
        { v: 'Phenanthrene',           pt: 'Fenantreno',         en: 'Phenanthrene',           parte: true },
        { v: 'Anthracene',             pt: 'Antraceno',          en: 'Anthracene',             parte: true },
        { v: 'Fluoranthene',           pt: 'Fluoranteno',        en: 'Fluoranthene',           parte: true },
        { v: 'Pyrene',                 pt: 'Pireno',             en: 'Pyrene',                 parte: true },
        { v: 'Benzo(a)anthracene',     pt: 'Benzo(a)antraceno',  en: 'Benzo(a)anthracene',     parte: true },
        { v: 'Chrysene',               pt: 'Criseno',            en: 'Chrysene',               parte: true },
        { v: 'Benzo(b)fluoranthene',   pt: 'Benzo(b)fluoranteno', en: 'Benzo(b)fluoranthene',  parte: true },
        { v: 'Benzo(k)fluoranthene',   pt: 'Benzo(k)fluoranteno', en: 'Benzo(k)fluoranthene',  parte: true },
        { v: 'Benzo(a)pyrene',         pt: 'Benzo(a)pireno',     en: 'Benzo(a)pyrene',         parte: true },
        { v: 'Indeno(1,2,3-cd)pyrene', pt: 'Indeno(1,2,3-cd)pireno', en: 'Indeno(1,2,3-cd)pyrene', parte: true },
        { v: 'Dibenzo(a,h)anthracene', pt: 'Dibenzo(a,h)antraceno', en: 'Dibenzo(a,h)anthracene', parte: true },
        { v: 'Benzo(g,h,i)perylene',   pt: 'Benzo(g,h,i)perileno', en: 'Benzo(g,h,i)perylene', parte: true },
      ].map((o) => ({ unit: 'ng/g', ...o })) },
      { id: 'esterois', pt: 'Esteróis', en: 'Sterols', total: 'Total Sterols', params: [
        { v: 'Total Sterols',  pt: 'Esteróis totais', en: 'Total sterols' },
        { v: 'Coprostanol',    pt: 'Coprostanol',     en: 'Coprostanol',    parte: true },
        { v: 'Epicoprostanol', pt: 'Epicoprostanol',  en: 'Epicoprostanol', parte: true },
        { v: 'Cholesterol',    pt: 'Colesterol',      en: 'Cholesterol',    parte: true },
        { v: 'Cholestanol',    pt: 'Colestanol',      en: 'Cholestanol',    parte: true },
        { v: 'Coprostanone',   pt: 'Coprostanona',    en: 'Coprostanone',   parte: true },
        { v: 'Ergosterol',     pt: 'Ergosterol',      en: 'Ergosterol',     parte: true },
        { v: 'Campesterol',    pt: 'Campesterol',     en: 'Campesterol',    parte: true },
        { v: 'Stigmasterol',   pt: 'Estigmasterol',   en: 'Stigmasterol',   parte: true },
        { v: 'β-sitosterol',   pt: 'β-sitosterol',    en: 'β-sitosterol',   parte: true },
        { v: 'Lanosterol',     pt: 'Lanosterol',      en: 'Lanosterol',     parte: true },
        { v: 'Taraxerol',      pt: 'Taraxerol',       en: 'Taraxerol',      parte: true },
        { v: 'Stigmastanol',   pt: 'Estigmastanol',   en: 'Stigmastanol',   parte: true },
        { v: 'β-Amyrin',       pt: 'β-amirina',       en: 'β-Amyrin',       parte: true },
      ].map((o) => ({ unit: 'µg/g', ...o })) },
    ],
  },
];

// O seletor do mapa e o contador do cabecalho liam `MODE_VARS.pollution`, que
// tinha 10 dos 48 parametros: o cabecalho anunciava "10 parametros" enquanto o
// painel listava 48, e escolher no painel um dos outros 38 deixava o seletor em
// branco. Em vez de repetir a lista, MODE_VARS passa a derivar daqui -- uma
// fonte so. Ja houve divergencia igual entre EIXOS e EIXO_MAP neste projeto.
MODE_VARS.pollution.options = POLLUTION_GROUPS
  .flatMap((m) => m.familias.flatMap((f) => f.params));

/** Unidade declarada de um parametro de poluicao, ou '' quando nao ha fonte. */
export const polUnit = (v) => {
  for (const m of POLLUTION_GROUPS) for (const f of m.familias) {
    const p = f.params.find((x) => x.v === v);
    if (p) return p.unit ?? '';
  }
  return '';
};

/** Familia a que um parametro pertence, com a matriz junto. */
export const polFamilia = (v) => {
  for (const m of POLLUTION_GROUPS) for (const f of m.familias) {
    if (f.params.some((x) => x.v === v)) return { ...f, matriz: m };
  }
  return null;
};


// Fotos que ilustram um RESULTADO especifico, e por isso moram dentro do
// bloco dele em vez da faixa do cabecalho: a imagem mostra o metodo que
// produziu os numeros ao lado.
export const BLOCO_FOTOS = {
  'e3-rod-foto': {
    src: 'eixo3-carbono-azul-20260820.webp',
    pt: 'Instalação de câmaras bentônicas em banco de rodolitos',
    en: 'Installing benthic chambers on a rhodolith bed' },
  'e3-pesca-foto': {
    src: 'eixo3-entrevista-pescadores-20260820.webp',
    pt: 'Entrevista com pescador artesanal sobre uso de recursos marinhos',
    en: 'Interview with an artisanal fisher about marine resource use' },
};

// ---------------------------------------------------------------------------
// Comparacao entre conjuntos de sitios
//
// A comparacao e SEMPRE dentro de um recorte, nunca sobre o pais inteiro: as
// ilhas oceanicas nao tem nenhum sitio fora de UC, entao um "dentro x fora"
// nacional mediria em parte ilha contra costa. Ver `avisosComparacao`.
// ---------------------------------------------------------------------------
export const CMP_CRITERIOS = [
  { v: 'protecao', pt: 'Nível de proteção', en: 'Protection level' },
  { v: 'uf',       pt: 'Estados',           en: 'States' },
  { v: 'region',   pt: 'Regiões',           en: 'Regions' },
  { v: 'uc',       pt: 'Unidades de conservação', en: 'Protected areas' },
];

/** Cores dos grupos de comparacao, estaveis entre graficos e mapa. */
export const CMP_CORES = ['#353F7C', '#F76043', '#3C9BA5', '#FDA749', '#982263', '#6B7FC7'];

// ---------------------------------------------------------------------------
// Funcao da assembleia: biomassa, tamanho e nivel trofico por sitio-ano.
//
// Todos vem de `reef_fish_func`, calculada em build/extract_reefsyn.R com o
// comprimento MEDIDO em campo (CT do eMOF) e os coeficientes e niveis troficos
// de Quimbayo et al. 2021. `col` e a coluna da tabela; `casas` as decimais.
//   bio   kg por censo de 40 m2 (x250 para kg/ha), so peixes osseos recifais
//   len   comprimento total medio dos individuos, cm
//   tl_*  nivel trofico medio ponderado pela abundancia ou pela biomassa
// ---------------------------------------------------------------------------
export const FN_METRICAS = [
  { v: 'bio',    k: 'fn_m_bio',   col: 'bio_census', unidade: ' kg', casas: 1, escala: false },
  { v: 'len',    k: 'fn_m_len',   col: 'len_mean',   unidade: ' cm', casas: 1, escala: false },
  { v: 'tl_ab',  k: 'fn_m_tlab',  col: 'tl_ab',      unidade: '',    casas: 2, escala: true  },
  { v: 'tl_bio', k: 'fn_m_tlbio', col: 'tl_bio',     unidade: '',    casas: 2, escala: true  },
];

// Metricas comparaveis por conjunto. Corais NAO tem cobertura aqui: o
// `cover_total` vai de 0,1 a 690 porque o denominador (area amostrada) foi
// removido na exportacao Darwin Core e cada dataset mede um universo -- o XVI
// soma 650%. Contar especies de Scleractinia, que e o vocabulario comum aos
// cinco datasets, se sustenta; somar cobertura entre eles nao.
export const CMP_METRICAS = {
  fish: [
    { v: 'abundancia', k: 'p_abundancia' },
    { v: 'riqueza',    k: 'p_riqueza' },
    { v: 'familias',   k: 'p_familias' },
    { v: 'censos',     k: 'p_censos' },
    // Funcionais: derivadas de FN_METRICAS, para que o cartao de funcao, a
    // tendencia e a comparacao falem das mesmas quatro variaveis com as mesmas
    // unidades. `func` marca as que vem de `reef_fish_func`, nao de `reef_fish_year`.
    ...FN_METRICAS.map((m) => ({ v: m.v, k: m.k, func: m })),
  ],
  coral: [
    { v: 'coral_riqueza', k: 'p_coral_riqueza' },
    { v: 'coral_eventos', k: 'p_coral_eventos' },
  ],
};

// ---------------------------------------------------------------------------
// Painel de taxons
//
// A escolha de taxon muda de nivel por conjunto. Peixes tem familia (de
// `fish_comp`, que cobre TODAS as familias) e especie (de `fish_year_sp`, que
// cobre as 120 mais abundantes do pais). Corais so tem especie -- os cinco
// datasets compartilham justamente o vocabulario de Scleractinia a especie.
// ---------------------------------------------------------------------------
export const TX_NIVEIS = {
  fish:  [{ v: 'species', k: 'tx_nivel_species' }, { v: 'family', k: 'tx_nivel_family' }],
  coral: [{ v: 'species', k: 'tx_nivel_species' }],
};

// `pres` conta quantos dos taxons ESCOLHIDOS aparecem -- e a unica leitura de
// riqueza que estas tabelas sustentam. Riqueza por especie nao existe, e
// riqueza DENTRO de uma familia exigiria o mapa especie -> familia completo,
// que hoje cobre 106 das 119 especies.
export const TX_METRICAS = {
  fish:  [{ v: 'abund', k: 'tx_m_abund' },
          { v: 'share', k: 'tx_m_share' },
          { v: 'pres',  k: 'tx_m_pres' },
          // Funcionais POR TAXON (tabelas reef_fish_func_fam/_sp, sob demanda).
          // Biomassa e tamanho valem para especie e familia; o nivel trofico so
          // para familia, porque o de uma especie e um traco fixo, sem serie no
          // tempo -- seria uma linha reta.
          { v: 'bio',   k: 'fn_m_bio', func: true, col: 'bio_kg',   unidade: ' kg', casas: 2 },
          { v: 'len',   k: 'fn_m_len', func: true, col: 'len_mean', unidade: ' cm', casas: 1 },
          { v: 'tl',    k: 'tx_m_tl',  func: true, col: 'tl_mean',  unidade: '',    casas: 2,
            escala: true, soNivel: 'family' }],
  // Corais ficam na fracao DENTRO da assembleia de coral: a cobertura
  // absoluta nao e comparavel entre datasets (ver CMP_METRICAS).
  coral: [{ v: 'share', k: 'tx_m_cover' },
          { v: 'pres',  k: 'tx_m_pres' }],
};

/** Quantos taxons a paleta distingue sem repetir cor. */
export const TX_MAX = 8;


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
