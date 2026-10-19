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
})

args      <- commandArgs(trailingOnly = TRUE)
DASH_DIR  <- if (length(args) >= 1) args[1] else "../dashboard"
OUT_DIR   <- if (length(args) >= 2) args[2] else "public/data"

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

core <- list(
  meta = list(
    generated = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
    source    = "noronha_integrated.rds",
    datasets  = c("benthos", "fish", "fishers", "pollution", "productivity")
  ),
  # sites_metadata mantem site_label: e a tabela de lookup, o rotulo vive aqui.
  sites            = encode_table(round_coords(as.data.frame(d$sites_metadata))),
  site_coords      = encode_table(prep(d$site_dataset_coords)),

  benthos_summary  = encode_table(prep(d$benthos_site_summary)),
  benthos_year_fg  = encode_table(prep(d$benthos_site_year_fg)),
  benthos_comp     = encode_table(prep(d$benthos_composition)),

  fish_summary     = encode_table(prep(d$fish_site_summary)),
  fish_year        = encode_table(prep(d$fish_site_year)),
  fish_comp        = encode_table(prep(d$fish_composition)),
  fish_top         = encode_table(prep(d$fish_top_species)),

  productivity     = encode_table(prep(d$productivity)),
  pollution        = encode_table(prep(d$pollution)),
  pollution_nd     = encode_table(as.data.frame(d$pollution_nd))
)

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
raw_tables <- list(
  benthos_raw        = list(tbl = d$benthos_raw,         restricted = FALSE),
  benthos_quad_fg    = list(tbl = d$benthos_quad_fg,     restricted = FALSE),
  benthos_year_sp    = list(tbl = d$benthos_site_year_sp,restricted = FALSE),
  fish_raw           = list(tbl = d$fish_raw,            restricted = FALSE),
  fish_year_sp       = list(tbl = d$fish_site_year_sp,   restricted = FALSE),
  fishers            = list(tbl = d$fishers,             restricted = TRUE)
)

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

