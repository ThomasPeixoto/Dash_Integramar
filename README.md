# IntegraMAR — Noronha (site estático)

Versão em HTML/CSS/JS do painel de monitoramento de Fernando de Noronha.
Projeto **paralelo** ao `../dashboard` (R Shiny), que continua intacto e é a
fonte dos dados.

A navegação é pelos **quatro eixos temáticos** da Rede IntegraMAR, espelhando
<https://integramar.org/o-projeto/>. Mapa e séries são componentes dentro dos
eixos, não abas irmãs: o público-alvo são gestores de UC e tomadores de
decisão, que chegam por pergunta, não por ferramenta.

| eixo | conjunto | escala | linha de pesquisa no site |
|---|---|---|---|
| 1 Biodiversidade | peixes, bentos | **nacional** | Dinâmica temporal de comunidades |
| 2 Impactos | poluição | Noronha | Poluição Química e Plástica |
| 3 Serviços | produtividade, pescadores | Noronha | Rodolitos e Carbono Azul · Pesca e Nutrição |
| 4 Gestão | peixes, poluição | Noronha | Efetividade das ações de conservação |

### Escala nacional (ReefSYN)

O Eixo 1 cobre a costa brasileira em **três camadas separadas**, porque são
três perguntas distintas com três níveis de comparabilidade distintos:

| camada | fonte | sítios | período | comparável entre fontes? |
|---|---|---|---|---|
| **Peixes** | ReefSYN, 8 datasets de transecto 40 m² | 232 | 2001–2023 | sim — mesmo protocolo |
| **Corais** | Scleractinia a espécie, 5 datasets | 90 | 2006–2019 | sim — vocabulário comum |
| **Bentos** | comunidade: XIV, XV, XVI e Noronha | 103 | 2010–2024 | **não** — uma camada por dataset |

Hierarquia: **Brasil → Região → Unidade de Conservação → Sítio**. 134 dos 232
sítios de peixe caem em 24 UCs marinhas do CNUC.

#### Por que três camadas, e não uma

A exportação Darwin Core do ReefSYN **remove o denominador** do bentos:
substrato, sedimento e turf saem dos arquivos *"because they do not represent
taxonomical entities"* (`eventRemarks`). Só o XV manteve esses registros no
eMOF, sem identidade — é o único em que a cobertura fecha em 100%.

Pior: **XII e XIII não amostram a comunidade.** São levantamentos de coral,
com 33 e 24 táxons quase todos Scleractinia. Compor "algas calcárias" entre os
cinco daria 0% no XII e 65% no XIV — artefato de protocolo, não de recife.

O que os cinco compartilham é o **coral escleractíneo a espécie**: 13 das 14
espécies aparecem em 2+ datasets, 2 nos cinco. E a composição *relativa dentro
da assembleia de coral* é válida mesmo sem o denominador, porque a fração
removida é a mesma para todos os táxons do evento e some na razão.

Daí: corais viram camada nacional comparável; a comunidade bentônica fica uma
camada por dataset, nunca somada; peixes seguem comparáveis pelo protocolo.

#### Estratificação obrigatória

**A série de peixe é por região, nunca agregada.** O Rio de Janeiro é 44% dos
censos e a única região presente de 2001 a 2005; as demais entram e saem. Uma
linha nacional única mostraria geografia disfarçada de tendência, e o painel
diz isso na tela.

#### Função da assembleia: biomassa, tamanho e nível trófico

Um painel do Eixo 1 (só peixes) mostra **biomassa**, **tamanho médio** e
**nível trófico** ao longo do tempo, em linha ou em boxplot, agrupados por
proteção, estado, região ou UC.

As quatro variáveis (biomassa, tamanho médio, nível trófico ponderado pela
abundância e pela biomassa) aparecem **nos gráficos que já existiam**, além do
cartão próprio:

- **Tendência principal** (chips de métrica ao lado de "Indivíduos por censo"):
  na vista nacional por região e na comparação por proteção, estado, região ou
  UC; o mapa de calor acompanha. Biomassa, tamanho e nível trófico são sempre
  linhas ("área 100%" só faz sentido para a abundância). Ficam **fora** da vista
  "Parâmetros" de um recorte, que põe quatro parâmetros num eixo só: kg, cm e
  nível trófico (2–4,5) não cabem na escala de indivíduos por censo.
- **Painel de táxons**, para as espécies ou famílias escolhidas: biomassa e
  tamanho médio em espécie e família, e nível trófico médio só em família (o de
  uma espécie é um traço fixo, e a "série" seria uma reta).
- **Cartão "Biomassa, tamanho e nível trófico"**, com boxplot e agrupamento.

A ausência pesa de formas diferentes, e o painel diz qual vale: biomassa de um
táxon num sítio-ano amostrado sem ele é **zero** (medido, como a abundância);
mas o **tamanho** e o nível trófico de quem não foi visto não existem, então
esses sítio-anos ficam **fora** — contá-los como 0 cm puxaria a mediana para
baixo. A nota mostra em quantos sítios cada táxon foi visto.

Tudo parte do **comprimento medido em campo** — o CT de cada registro do eMOF
(uma medida por ocorrência, 0,001% faltando) — e não do tamanho máximo da
espécie. O peso individual é `a · CT^b` (g), e o nível trófico vem do banco de
Quimbayo et al. (2021, *Ecology* 102:e03298), guardado sem alteração em
`data/traits/` com a citação e a licença. A biomassa é em **kg por censo de
40 m²** (×250 para kg/ha), só de peixes ósseos recifais: tubarões e raias não
têm coeficiente no banco e ficam fora.

Como o nome do ReefSYN vira o do banco (`build/traits_quimbayo.R`), em ordem:
nome exato → subespécie → sinônimo revisado à mão → mediana do gênero. O nome
exato vem primeiro porque o próprio banco tem trinômios
(*Chilomycterus spinosus spinosus*) que colapsar antes de casar perderia.
Cobertura medida sobre 1,15 milhão de indivíduos: **96,4%** com `a` e `b` de
espécie, 3,0% pela mediana dos congêneres do gênero, 0,6% sem nada (nomes
ausentes, a família Clupeidae, elasmobrânquios). Nível trófico: 94,7% de espécie,
4,7% de gênero. Esses números saem em `reef_func_meta` e o painel os cita.

**O que o painel herda e diz na tela:**

- **58% dos indivíduos usam, dentro do próprio banco, coeficientes compilados
  em nível de gênero ou família**, não de espécie. Os de espécie são 42%.
- Comparado com as estimativas do FishBase (10 espécies), o peso de um peixe de
  30 cm difere entre 0,53× e 1,54×. O artigo não declara a unidade nem o tipo
  de comprimento; a de g para cm foi conferida contra o FishBase, não é dado
  do banco.
- **8,7% dos comprimentos são classes de tamanho** (datasets VII e VIII), e
  valem pelo ponto médio. O peso cresce com o cubo do comprimento, então o
  ponto médio subestima a biomassa dentro da classe.
- O peso cresce com o cubo do comprimento, e erros de registro o amplificam: um
  *Stegastes fuscus* (máx. 12,6 cm) com CT = 120 cm pesava 788 kg sozinho. Os
  registros com CT **acima de 2× o máximo da espécie** (160 ocorrências, 299
  indivíduos) saem do comprimento e do peso, e **só deles**: continuam na
  abundância e no nível trófico. A fonte não é alterada. A razão 2 é uma
  decisão (`CT_MAX_RAZAO`): 3,2% dos indivíduos passam do máximo, o que é erro
  normal de estimativa visual, e só 0,026% passam de 2×.
- **Proteção integral tem 48% dos sítios nas ilhas oceânicas, contra 7% de fora
  de UC**, e as ilhas têm biomassa alta (cardumes de *Melichthys niger*, 18% da
  biomassa nacional, com 4% dos indivíduos). Agrupar por proteção no país inteiro mistura geografia
  com proteção, e o painel avisa com esses números medidos. Sem recorte, o
  agrupamento padrão é por região, não por proteção.

**Noronha entra por um caminho só.** Os 9 sítios de Noronha já estão entre os
232 do ReefSYN: conferido censo a censo, os 705 censos e a abundância de cada
um dos 9 anos são **idênticos** nas tabelas nativas de Noronha e nas do ReefSYN.
Somar as duas contava Noronha em dobro (~7% dos censos). Com o ReefSYN
carregado, as tabelas nativas de peixe não são lidas.

**Custo dos dados:** as variáveis por táxon vão em tabelas próprias
(`reef_fish_func_fam`, `reef_fish_func_sp`: 58 e 71 KB gzip), carregadas só
quando alguém escolhe uma métrica funcional. Gravá-las como colunas de
`reef_fish_comp` e `reef_fish_year_sp`, que carregam ao abrir o Eixo 1, somaria
~94 KB a toda visita; essas duas tabelas ficaram byte a byte idênticas ao que
eram.

Verificação: biomassa, comprimento e nível trófico de 3 sítio-anos foram
recalculados à mão a partir dos CSVs crus do DwC e do banco, e batem com o
extrator (diferença de 4×10⁻⁵ kg, arredondamento); os 62 pontos plotados por
região e ano batem com a mediana calculada de forma independente em R. O mesmo
vale por táxon: biomassa e tamanho de 3 espécies e 3 famílias de um censo batem
com o cálculo à mão, e as séries de 4 espécies (biomassa com zeros em 22 anos,
tamanho só onde foram vistas) batem com o R. O nível trófico de família difere do
cálculo "só com valor de espécie" exatamente pelo preenchimento por gênero
(ex.: *Stegastes sanctipauli*, sem nível trófico no banco, recebe 2,5).

Geração: `build/extract_reefsyn.R` e `build/extract_reefsyn_benthos.R`, que
rodam na máquina local (a fonte, `~/Área de trabalho/ReefSYN`, não está no
cluster). Ambos travam se o resultado divergir da extração de referência.

### Leitura automática

Acima de cada figura, uma ou duas frases calculadas da seleção atual dizem em
português o que ela mostra (`assets/js/narrative.js`). Não é texto fixo: muda
com o recorte, o modo e a variável. Quando o esforço amostral explica parte do
contraste, a frase diz isso na mesma frase — não em nota de rodapé.

### O que o Eixo 4 não compara, e por quê

A comparação entre o Parque Nacional Marinho e a Área de Proteção Ambiental só
é sustentável para **peixes** (4 × 5 sítios, mesmos anos) e **poluição**
(18 × 26 amostras, mesmas campanhas). O bentos tem **um** sítio na APA contra
três no parque; comparar um com três não é comparar zonas. O painel diz isso
na tela em vez de omitir.

---

## Por que existe

O painel não tem computação de servidor: nenhum banco, nenhuma consulta viva,
nenhum modelo ajustado em tempo real, nada persistido do usuário. O Shiny
estava configurando três bibliotecas que já são JavaScript (Leaflet, Plotly,
DataTables) e, no caminho, impondo o visual do Bootstrap/bslib.

Sem servidor, o site:

- é um diretório de arquivos — publica em qualquer lugar (GitHub Pages, S3,
  Netlify, um `nginx`), sem shinyapps.io e sem limite de horas;
- carrega em 17 KB de dados e responde a filtro sem ida ao servidor;
- não tem teto estético: cada pixel é CSS escrito aqui.

---

## Estrutura

```
site/
├── build/
│   ├── export_data.R      RDS -> JSON colunar + GeoJSON
│   ├── extract_reefsyn*.R ReefSYN -> RDS (peixes, bentos); peso e nível trófico
│   ├── traits_quimbayo.R  nome ReefSYN -> banco de traços; coeficientes e fallbacks
│   ├── patches/           trabalho guardado fora do site (ver cada .patch)
│   └── serve.sh           servidor estático local/rede
├── data/
│   ├── reefsyn_*.rds      saída dos extratores
│   └── traits/            Quimbayo et al. 2021, sem alteração, com LEIAME
├── public/                O SITE. É isto que se publica.
│   ├── index.html
│   ├── assets/
│   │   ├── css/           tokens.css (marca) + app.css
│   │   ├── js/            módulos ES, sem bundler
│   │   ├── img/           logos, CNPq, fotos de espécies
│   │   └── vendor/        Leaflet, ECharts (versionados, sem CDN)
│   └── data/              gerado por export_data.R
└── README.md
```

### Módulos JS

| Arquivo | Papel |
|---|---|
| `data.js` | carrega e decodifica o formato colunar; agregações |
| `store.js` | estado reativo (~50 linhas; substitui `reactiveVal`/`observeEvent`) |
| `config.js` | conjuntos, modos, variáveis, textos pt/en |
| `metrics.js` | valor por sítio em cada modo; escala de cor |
| `map.js` | Leaflet: marcadores, polígonos, tooltips, legenda |
| `charts.js` | ECharts: tendência, táxons, mapa de calor |
| `main.js` | montagem, controles, perfil do sítio, navegação |

Sem build. Sem `node_modules`. `public/` abre direto.

---

## Dados

A fonte continua sendo `../dashboard/data/noronha_integrated.rds`, gerado por
`../dashboard/data/prepare_all_data.R`. Este projeto **não recalcula nada** —
só reempacota.

```bash
Rscript build/export_data.R ../dashboard public/data
```

### Compactação

Três camadas, carregadas em momentos diferentes:

| Camada | Arquivo | Quando carrega | gzip |
|---|---|---|---|
| 1 — agregados | `core.json` | sempre, no boot | **17 KB** |
| 2 — geometria | `geo/*.geojson` | ao ligar a camada espacial | 3–53 KB |
| 3 — tabelas | `tables/*.json` | ao abrir a lista de táxons | 3–65 KB |

Quatro técnicas, nesta ordem de ganho:

1. **Colunar** (struct-of-arrays). JSON linha-a-linha repete o nome de cada
   coluna em cada linha — em `fish_raw` seriam 11.013 × 15 chaves repetidas.
2. **Dicionário** nas colunas de texto de baixa cardinalidade: um vetor de
   níveis + um vetor de índices. É o `factor` do R, no arquivo. `NA` vira
   índice `-1`, não um nível, para que ausência continue distinta.
3. **Normalização**: `site_label`, `island` e coordenadas não se repetem em
   cada tabela; vivem em `sites` e `site_coords`, e o front-end faz o join.
4. **gzip -9** pré-computado; o servidor serve `.gz` quando o browser aceita.

Resultado: **2.578 KB → 226 KB** (9% do original).

### Fidelidade

Nenhum valor é alterado. As medidas saem com precisão máxima
(`digits = NA`). O único arredondamento do pipeline são as coordenadas, para
7 casas decimais (~1 cm), e a geometria dos polígonos, para 5 (~1 m).

---

## Conjuntos não publicados

Em um site estático **não existe senha que segure**: o que está em `public/`
está público, porque o navegador precisa poder baixar para desenhar. A senha
do painel Shiny não tem equivalente aqui.

A decisão tomada foi publicar assim mesmo — o link circula entre poucas
pessoas. Poluição e produtividade vão completas em `core.json`.

A exceção é `fishers`: as entrevistas trazem idade, gênero, renda e
composição domiciliar de pessoas identificáveis, o que é uma decisão de outra
natureza. A tabela fica em `public/data/tables/restricted/`, que o
`.gitignore` exclui. O site não a usa — das entrevistas, o mapa só precisa da
coordenada do porto, que está em `core.json`.

Vale lembrar que o histórico do git guarda o que foi commitado mesmo depois
de o arquivo ser removido.

---

## Rodar

```bash
./build/serve.sh          # porta 8899, local e rede
```

Para publicar, copie `public/` para o host. Nenhum passo de build.

### Regenerar os dados

Da raiz do projeto (os caminhos são relativos a ela). A fonte ReefSYN
(`DwC_output/` e `_gis/`) é lida de `REEF_DIR`; sem a variável, usa o caminho da
máquina de desenvolvimento.

```bash
export REEF_DIR=/caminho/para/ReefSYN
Rscript build/extract_reefsyn.R         data/reefsyn_fish.rds
Rscript build/extract_reefsyn_benthos.R data/reefsyn_benthos.rds
Rscript build/build_areas_geo.R                              # polígonos de estados e UCs
Rscript build/export_data.R ../dashboard public/data data    # JSON do site
```

`export_data.R` também lê os RDS do painel Shiny de Noronha (`../dashboard/data/`).
Os dois extratores travam se o resultado divergir da extração de referência
(10.686 censos, 232 sítios, 326 espécies de peixe): isso indica que a
deduplicação mudou de comportamento.

---

## Estética

Os tokens em `assets/css/tokens.css` vêm das custom properties do tema de
<https://integramar.org>, para que painel e site institucional não divirjam:

- navy `#353F7C`, magenta `#982263`, coral `#F76043`, gold `#FDA749`,
  teal `#3C9BA5`, offwhite `#E1EAF9`
- Inter no corpo, Playfair Display (700/900 + itálico) nos títulos
- o itálico dourado do Playfair como ênfase (`.display-accent`)
- rótulo *eyebrow* em caixa alta espaçada, coral, acima de cada título

---

## Pendente

- **Confirmar o sinônimo *Haemulon atlanticus* = *Emmelichthyops atlanticus***
  (4.136 indivíduos): casa por epíteto e família, mas é o único dos cinco
  sinônimos de `SINONIMOS` marcado "CONFIRMAR". Os outros quatro são
  combinações conhecidas (inclusive *Azurina multilineata* = *Chromis
  multilineata*, 157 mil indivíduos)
- Biomassa em kg/ha em vez de kg por censo, se o público preferir (×250, a
  área do transecto é 40 m² em todos os datasets)
- Biomassa e tamanho por espécie, não só da assembleia: `fish_year_sp` só guarda
  a abundância; levar `a·CT^b` e Σ(CT) para essa tabela daria o tamanho das
  espécies-alvo (budiões, pargos) ao longo do tempo

- Aba de dados / Darwin Core (porte de `R/mod_explorador.R`)
- Separar coral branqueado de coral vivo: 48% das linhas de "Hard coral" são
  colônias branqueadas, e hoje a cobertura de coral vivo está inflada
- Separar algas calcárias incrustantes das macroalgas carnosas
- `turf` é 1.695 de 1.835 linhas do grupo "Other" no bentos — domina a série
  temporal e provavelmente merece grupo próprio
- Basemap vetorial (MapLibre GL) no lugar do raster, se quiser mais acabamento
