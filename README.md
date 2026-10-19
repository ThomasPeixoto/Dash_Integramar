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
│   └── serve.sh           servidor estático local/rede
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

- Aba de dados / Darwin Core (porte de `R/mod_explorador.R`)
- Separar coral branqueado de coral vivo: 48% das linhas de "Hard coral" são
  colônias branqueadas, e hoje a cobertura de coral vivo está inflada
- Separar algas calcárias incrustantes das macroalgas carnosas
- `turf` é 1.695 de 1.835 linhas do grupo "Other" no bentos — domina a série
  temporal e provavelmente merece grupo próprio
- Basemap vetorial (MapLibre GL) no lugar do raster, se quiser mais acabamento
