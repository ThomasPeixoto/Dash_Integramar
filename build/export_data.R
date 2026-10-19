# ============================================================================
# IntegraMAR — exportador de dados do RDS para o site estatico
# ============================================================================
#
# Le data/noronha_integrated.rds do projeto Shiny (fonte unica da verdade,
# continua sendo gerada por data/prepare_all_data.R) e escreve JSON para o
# site estatico.  NAO altera nenhum valor: as medidas saem com precisao
# maxima (digits = NA).  A unica coisa arredondada sao as coordenadas, para
# 7 casas decimais (~1 cm no equador), o que e lossless na pratica.
#
# Tres camadas, carregadas em momentos diferentes pelo front-end:
#
#   core.json       agregados + metadados de sitio. Carregado sempre, no boot.
#   geo/*.geojson   poligonos (setores costeiros, regioes recifais, ilha).
#                   Carregado quando a camada espacial e ligada.
#   tables/*.json   tabelas linha-a-linha (bruto). Carregado sob demanda,
#                   no explorador / download.
#
# Compactacao: cada tabela vira COLUNAR (struct-of-arrays) em vez de
# linha-a-linha.  JSON linha-a-linha repete o nome de cada coluna em cada
# linha -- em fish_raw isso seria 11.013 x 15 chaves repetidas.  Alem disso,
# colunas de texto com baixa cardinalidade viram dicionario (o equivalente
# exato de um factor do R): um vetor de niveis + um vetor de indices.
#
# Uso:
#   Rscript build/export_data.R [caminho/do/dashboard] [destino]
# ============================================================================

suppressPackageStartupMessages({
  library(jsonlite)
  library(sf)
  library(dplyr)
  library(tidyr)
})

args      <- commandArgs(trailingOnly = TRUE)
DASH_DIR  <- if (length(args) >= 1) args[1] else "../dashboard"
OUT_DIR   <- if (length(args) >= 2) args[2] else "public/data"
REEF_IN   <- if (length(args) >= 3) args[3] else "data"

stopifnot(dir.exists(DASH_DIR))
dir.create(file.path(OUT_DIR, "geo"),    recursive = TRUE, showWarnings = FALSE)
dir.create(file.path(OUT_DIR, "tables"), recursive = TRUE, showWarnings = FALSE)

msg <- function(...) cat(sprintf(...), "\n", sep = "")

d <- readRDS(file.path(DASH_DIR, "data", "noronha_integrated.rds"))
msg("RDS lido: %d tabelas", length(d))

# ---------------------------------------------------------------------------
# Codificacao colunar
# ---------------------------------------------------------------------------

# Uma coluna de texto vale a pena dicionarizar quando os niveis unicos sao
# bem menos que as linhas.  O limiar 0.5 e arbitrario mas seguro: abaixo dele
# o dicionario sempre ganha, acima dele o overhead do vetor de niveis come o
# ganho.  Colunas com menos de 20 linhas nao compensam o overhead de forma
# alguma.
dict_worth_it <- function(x) {
  is.character(x) && length(x) >= 20 && (length(unique(x)) / length(x)) < 0.5
}

encode_column <- function(x) {
  if (inherits(x, c("Date", "POSIXct", "POSIXt"))) x <- as.character(x)
  if (is.factor(x)) x <- as.character(x)

  if (dict_worth_it(x)) {
    # NA vira indice -1 em vez de virar um nivel: assim o dicionario so tem
    # valores reais e o front-end distingue ausencia de qualquer string.
    lv <- sort(unique(x[!is.na(x)]))
    iv <- match(x, lv) - 1L
    iv[is.na(x)] <- -1L
    list(d = lv, v = iv)
  } else {
    x
  }
}

encode_table <- function(df) {
  df <- as.data.frame(df, stringsAsFactors = FALSE)
  list(
    n    = nrow(df),
    cols = lapply(stats::setNames(names(df), names(df)), function(nm) encode_column(df[[nm]]))
  )
}

# auto_unbox = FALSE em todo lugar: uma coluna de 1 linha (ou um dicionario de
# 1 nivel) precisa continuar sendo array no JSON, senao o decodificador do
# front-end recebe escalar onde espera vetor.
write_json_file <- function(x, path) {
  json <- jsonlite::toJSON(x, dataframe = "columns", na = "null",
                           digits = NA, auto_unbox = FALSE, null = "null")
  writeLines(json, path, useBytes = TRUE)
  invisible(file.size(path))
}

# ---------------------------------------------------------------------------
# Coordenadas: unico arredondamento do pipeline
# ---------------------------------------------------------------------------
round_coords <- function(df) {
  for (nm in intersect(names(df), c("decimalLatitude", "decimalLongitude",
                                    "centroid_lat", "centroid_lon"))) {
    df[[nm]] <- round(df[[nm]], 7)
  }
  df
}

# As colunas de sitio (rotulo, coordenada, ilha) se repetem linha a linha em
# quase toda tabela.  No site elas ficam so em `sites` / `site_coords` e o
# front-end faz o join pela chave `Site`.  Nao e perda de informacao -- e
# normalizacao.
SITE_DERIVED <- c("site_label", "island", "zone_label")

drop_derived <- function(df, keep = character()) {
  drop <- setdiff(SITE_DERIVED, keep)
  df[, setdiff(names(df), drop), drop = FALSE]
}

prep <- function(tbl, keep = character()) {
  round_coords(drop_derived(as.data.frame(tbl, stringsAsFactors = FALSE), keep))
}

# ---------------------------------------------------------------------------
# Camada 1 — core.json
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Classificacao derivada do bentos
# ---------------------------------------------------------------------------
#
# A coluna `functional_group` vem pronta do CSV de origem
# (BRislands_2014_2024_cover.csv) com cinco niveis, e CONTINUA INTACTA: nada
# aqui a modifica, e o ETL em R do painel Shiny nao e tocado.
#
# O problema e que "Other" reunia 1.835 das 5.261 linhas (35% do conjunto)
# misturando coisas sem relacao ecologica entre si -- e o turf, que e a
# categoria mais abundante de todo o levantamento, nao existia como categoria.
#
#   Turf filamentous   1.155    TFL
#   Calcareous Turf      540    TCC
#   Unknown              107    Unk
#   Cyanobacteria         29    CIAN
#   other disease          4    OD
#
# Esta derivacao desmonta apenas o "Other". Os outros quatro niveis da fonte
# (Algae, Hard coral, Soft Substrate, Other Invertebrates) passam intocados.
BENTHOS_SPLIT <- c(
  "TFL"  = "Turf filamentous",
  "TCC"  = "Turf calcareous",
  "CIAN" = "Cyanobacteria",
  "Unk"  = "Unclassified",
  "OD"   = "Unclassified"
)

benthos_fine <- d$benthos_raw %>%
  mutate(fg = ifelse(label_code %in% names(BENTHOS_SPLIT),
                     unname(BENTHOS_SPLIT[label_code]),
                     functional_group))

# Se a fonte ganhar um label_code novo dentro de "Other", ele cairia em
# "Other" de novo e passaria despercebido. Aqui nao passa.
orfaos <- benthos_fine %>% filter(fg == "Other") %>% distinct(label_code, name)
if (nrow(orfaos) > 0) {
  stop("label_code em 'Other' sem destino na classificacao derivada: ",
       paste(orfaos$label_code, collapse = ", "))
}

fg_fine_levels <- sort(unique(benthos_fine$fg))
msg("bentos: %d grupos derivados (%s)", length(fg_fine_levels),
    paste(fg_fine_levels, collapse = ", "))

# --- Nivel 1: cobertura por fotoquadrante -----------------------------------
# Mesma logica do ETL original. Varios label_code caem no mesmo grupo dentro
# de um fotoquadrante, por isso somamos; e preenchemos com zero os grupos
# ausentes, porque tirar media so onde o grupo aparece superestima a cobertura.
benthos_quad <- benthos_fine %>%
  group_by(island, Site, site_label, Year, stratum, stratum_label, uniqueID,
           decimalLatitude, decimalLongitude, fg) %>%
  summarise(cover = sum(cover, na.rm = TRUE), .groups = "drop") %>%
  group_by(island, Site, site_label, Year, stratum, stratum_label, uniqueID,
           decimalLatitude, decimalLongitude) %>%
  tidyr::complete(fg = fg_fine_levels, fill = list(cover = 0)) %>%
  ungroup()

# --- Nivel 2: media por sitio/ano, balanceada entre estratos ----------------
# Primeiro a media dos fotoquadrantes dentro de cada estrato, depois a media
# entre estratos: sem isso o estrato com mais fotos domina (em Cagarras 2023
# sao 51 fotos no fundo contra 28 no raso).
benthos_year_fine <- benthos_quad %>%
  group_by(island, Site, site_label, Year, stratum, fg,
           decimalLatitude, decimalLongitude) %>%
  summarise(cover_stratum = mean(cover), n_quads = n(), .groups = "drop") %>%
  group_by(island, Site, site_label, Year, fg,
           decimalLatitude, decimalLongitude) %>%
  summarise(mean_cover = mean(cover_stratum),
            n_strata   = n(),
            n_quads    = sum(n_quads),
            .groups = "drop") %>%
  left_join(
    benthos_quad %>%
      group_by(Site, Year, fg) %>%
      summarise(sd_cover = sd(cover), .groups = "drop"),
    by = c("Site", "Year", "fg")
  ) %>%
  mutate(n_records = n_quads) %>%
  rename(functional_group = fg)

# --- Verificacao ------------------------------------------------------------
# Somar os grupos derivados de volta aos cinco da fonte tem que reproduzir,
# numero a numero, a tabela que o ETL do painel Shiny produz. E o que garante
# que a derivacao so reparticionou -- nao mexeu em nenhum valor.
reagrupado <- benthos_year_fine %>%
  mutate(coarse = ifelse(functional_group %in% unname(BENTHOS_SPLIT),
                         "Other", functional_group)) %>%
  group_by(Site, Year, coarse) %>%
  summarise(derivado = sum(mean_cover), .groups = "drop")

referencia <- d$benthos_site_year_fg %>%
  transmute(Site, Year, coarse = functional_group, original = mean_cover)

conf <- full_join(reagrupado, referencia, by = c("Site", "Year", "coarse"))
desvio <- max(abs(conf$derivado - conf$original), na.rm = TRUE)
stopifnot(
  "a classificacao derivada nao reproduz a original ao ser reagrupada" =
    nrow(conf) == nrow(referencia) && !anyNA(conf$derivado) && desvio < 1e-9
)
msg("bentos: reagrupamento confere com o ETL original (desvio max %.2e)", desvio)

# A cobertura continua somando 100% por sitio/ano, como na fonte.
soma100 <- benthos_year_fine %>%
  group_by(Site, Year) %>%
  summarise(total = sum(mean_cover), .groups = "drop")
stopifnot("a cobertura deixou de somar 100% por sitio/ano" =
            max(abs(soma100$total - 100)) < 1e-9)

benthos_comp_fine <- benthos_year_fine %>%
  transmute(island, Site, site_label, Year, functional_group,
            decimalLatitude, decimalLongitude,
            total_cover = mean_cover,
            proportion  = mean_cover)

# ---------------------------------------------------------------------------
# Eixo 3 — agregados das entrevistas com pescadores
# ---------------------------------------------------------------------------
#
# A tabela linha-a-linha traz idade, genero, renda e composicao domiciliar de
# pessoas identificaveis, e por isso NAO vai para o site. O que vai sao
# agregados sobre as 63 entrevistas: composicao da captura, consumo por tipo
# de alimento e esforco. Nenhum atributo pessoal entra aqui.
fsh <- d$fishers

consumo <- local({
  tipos <- c("fish", "mollusk", "crustaceans", "cephalopods", "beef",
             "pork", "chicken", "processed_meat", "sheep", "game")
  num <- function(x) suppressWarnings(as.numeric(x))
  do.call(rbind, lapply(tipos, function(tp) {
    kg   <- num(fsh[[paste0(tp, "_consumption_kg")]])
    dias <- num(fsh[[paste0("freq_", tp, "_consumption_days/week")]])
    # `game` e inteiramente ausente; mean() devolveria NaN, que vira null no
    # JSON e o front-end le como "sem dado" -- distinto de zero.
    data.frame(
      food      = tp,
      kg_week   = if (all(is.na(kg)))   NA_real_ else mean(kg, na.rm = TRUE),
      days_week = if (all(is.na(dias))) NA_real_ else mean(dias, na.rm = TRUE),
      n         = sum(!is.na(kg)),
      stringsAsFactors = FALSE
    )
  }))
})

captura <- fsh %>%
  filter(!is.na(common_name)) %>%
  count(common_name, name = "n_fishers") %>%
  arrange(desc(n_fishers))

fishers_summary <- data.frame(
  n_interviews = nrow(fsh),
  catch_mean   = mean(fsh$catch_kg, na.rm = TRUE),
  catch_median = median(fsh$catch_kg, na.rm = TRUE),
  catch_max    = max(fsh$catch_kg, na.rm = TRUE),
  n_gear_line  = sum(grepl("hook_and_line", fsh$gear)),
  Site         = unique(fsh$Site)[1],
  stringsAsFactors = FALSE
)

msg("pescadores: %d entrevistas agregadas (%d tipos de alimento, %d especies)",
    nrow(fsh), nrow(consumo), nrow(captura))

core <- list(
  meta = list(
    generated = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
    source    = "noronha_integrated.rds",
    datasets  = c("benthos", "fish", "fishers", "pollution", "productivity"),
    benthos_groups = fg_fine_levels
  ),
  # sites_metadata mantem site_label: e a tabela de lookup, o rotulo vive aqui.
  sites            = encode_table(round_coords(as.data.frame(d$sites_metadata))),
  site_coords      = encode_table(prep(d$site_dataset_coords)),

  benthos_summary  = encode_table(prep(d$benthos_site_summary)),
  benthos_year_fg  = encode_table(prep(benthos_year_fine)),
  benthos_comp     = encode_table(prep(benthos_comp_fine)),

  fish_summary     = encode_table(prep(d$fish_site_summary)),
  fish_year        = encode_table(prep(d$fish_site_year)),
  fish_comp        = encode_table(prep(d$fish_composition)),
  fish_top         = encode_table(prep(d$fish_top_species)),

  productivity     = encode_table(prep(d$productivity)),
  fishers_consumption = encode_table(consumo),
  fishers_catch       = encode_table(captura),
  fishers_summary     = encode_table(fishers_summary),
  pollution        = encode_table(prep(d$pollution)),
  pollution_nd     = encode_table(as.data.frame(d$pollution_nd))
)

# ---------------------------------------------------------------------------
# ReefSYN — cobertura nacional
# ---------------------------------------------------------------------------
#
# Gerados por build/extract_reefsyn.R e build/extract_reefsyn_benthos.R, que
# moram neste projeto porque a fonte (~/Área de trabalho/ReefSYN) nao esta no
# cluster. Se os arquivos nao existirem, o site sai so com Noronha -- o painel
# degrada, nao quebra.
#
# As tres fontes NAO sao intercambiaveis e o site as trata como camadas
# distintas, cada uma com sua cobertura:
#   fish             ReefSYN nacional   232 sitios   2001-2023
#   benthos_islands  ReefSYN XV          12 sitios   2013-2019  cobertura absoluta
#   benthos          PELD-ILOC Noronha    4 sitios   2021-2024  cobertura absoluta
# As duas de bentos usam categorias diferentes (ver extract_reefsyn_benthos.R)
# e por isso nunca sao concatenadas numa serie so.
reef_path <- file.path(DASH_DIR, "..", "site", "data")
rf <- file.path(REEF_IN, "reefsyn_fish.rds")
rb <- file.path(REEF_IN, "reefsyn_benthos.rds")

if (file.exists(rf)) {
  R <- readRDS(rf)
  core$reef_sites      <- encode_table(round_coords(as.data.frame(R$sites)))
  core$reef_site_uc    <- encode_table(as.data.frame(R$site_uc))
  core$reef_fish_year  <- encode_table(as.data.frame(R$fish_site_year))
  core$reef_fish_summary <- encode_table(as.data.frame(R$fish_summary))
  # fish_comp tem 10 mil linhas e so a aba temporal precisa dela. No core ela
  # levava o boot de 17 para 123 KB gzip; na camada sob demanda, o mapa abre
  # na mesma velocidade de antes.
  reef_lazy <- list(reef_fish_comp = R$fish_comp)
  msg("ReefSYN peixes: %d sitios, %d linhas sitio/ano, %d de composicao (sob demanda)",
      nrow(R$sites), nrow(R$fish_site_year), nrow(R$fish_comp))
} else {
  msg("ReefSYN peixes ausente (%s) — site sai so com Noronha", rf)
}

if (file.exists(rb)) {
  B <- readRDS(rb)
  core$reef_benthos_sites   <- encode_table(round_coords(as.data.frame(B$sites)))
  core$reef_benthos_year    <- encode_table(as.data.frame(B$site_year))
  core$reef_benthos_summary <- encode_table(as.data.frame(B$summary))
  msg("ReefSYN bentos: %d sitios, %d linhas sitio/ano/grupo",
      nrow(B$sites), nrow(B$site_year))
} else {
  msg("ReefSYN bentos ausente (%s)", rb)
}

# O core so e gravado depois do bloco do ReefSYN: as tabelas nacionais
# entram nele, e escrever antes as deixaria de fora em silencio.
sz_core <- write_json_file(core, file.path(OUT_DIR, "core.json"))
msg("core.json           %8.1f KB", sz_core / 1024)

# ---------------------------------------------------------------------------
# Camada 2 — geometria
# ---------------------------------------------------------------------------

write_geo <- function(obj, name) {
  if (is.null(obj)) { msg("  (ausente: %s)", name); return(invisible(NULL)) }
  path <- file.path(OUT_DIR, "geo", paste0(name, ".geojson"))
  g <- sf::st_transform(sf::st_as_sf(obj), 4326)
  # 5 casas decimais ~ 1 m. Poligono de recife nao precisa de mais que isso, e
  # a diferenca no tamanho do arquivo e grande.
  sf::st_write(g, path, driver = "GeoJSON", delete_dsn = TRUE, quiet = TRUE,
               layer_options = c("COORDINATE_PRECISION=5", "WRITE_BBOX=YES"))
  msg("geo/%-18s %8.1f KB", paste0(name, ".geojson"), file.size(path) / 1024)
}

write_geo(d$coastal_sectors,  "coastal_sectors")
write_geo(d$reef_regions,     "reef_regions")
write_geo(d$reef_regions_all, "reef_regions_all")

island_path <- file.path(DASH_DIR, "data", "noronha_island.rds")
if (file.exists(island_path)) write_geo(readRDS(island_path), "island")

# ---------------------------------------------------------------------------
# Camada 3 — tabelas brutas, sob demanda
# ---------------------------------------------------------------------------
#
# `restricted` marca o que vem dos tres conjuntos ainda nao publicados
# (poluicao, entrevistas com pescadores, produtividade).  Num site estatico
# nao existe senha que segure: o que esta em public/ esta publico.  Por isso
# eles saem em tables/restricted/ -- e uma decisao de DEPLOY (subir ou nao a
# pasta), nao de codigo.
raw_tables <- c(
  if (exists("reef_lazy")) lapply(reef_lazy, function(x) list(tbl = x, restricted = FALSE)) else list(),
list(
  benthos_raw        = list(tbl = d$benthos_raw,         restricted = FALSE),
  benthos_quad_fg    = list(tbl = d$benthos_quad_fg,     restricted = FALSE),
  benthos_year_sp    = list(tbl = d$benthos_site_year_sp,restricted = FALSE),
  fish_raw           = list(tbl = d$fish_raw,            restricted = FALSE),
  fish_year_sp       = list(tbl = d$fish_site_year_sp,   restricted = FALSE),
  fishers            = list(tbl = d$fishers,             restricted = TRUE)
))

manifest <- list()
for (nm in names(raw_tables)) {
  item <- raw_tables[[nm]]
  if (is.null(item$tbl)) next
  sub  <- if (item$restricted) "tables/restricted" else "tables"
  dir.create(file.path(OUT_DIR, sub), recursive = TRUE, showWarnings = FALSE)
  path <- file.path(OUT_DIR, sub, paste0(nm, ".json"))
  sz   <- write_json_file(encode_table(prep(item$tbl)), path)
  manifest[[nm]] <- list(path = file.path(sub, paste0(nm, ".json")),
                         rows = nrow(item$tbl),
                         restricted = item$restricted,
                         bytes = as.integer(sz))
  msg("%-18s %8.1f KB  (%d linhas%s)", paste0(nm, ".json"), sz / 1024,
      nrow(item$tbl), if (item$restricted) ", restrito" else "")
}

write_json_file(manifest, file.path(OUT_DIR, "tables", "manifest.json"))

# ---------------------------------------------------------------------------
# Pre-compressao: servidor estatico serve .gz quando o browser aceita
# ---------------------------------------------------------------------------
files <- list.files(OUT_DIR, pattern = "\\.(json|geojson)$",
                    recursive = TRUE, full.names = TRUE)
for (f in files) system2("gzip", c("-9", "-k", "-f", shQuote(f)))

tot_raw <- sum(file.size(files))
tot_gz  <- sum(file.size(paste0(files, ".gz")))
msg("")
msg("TOTAL  %.1f KB cru  ->  %.1f KB gzip  (%.0f%% do original)",
    tot_raw / 1024, tot_gz / 1024, 100 * tot_gz / tot_raw)

