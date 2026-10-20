## =============================================================================
## Poligonos dos recortes do mapa: estados costeiros e UCs marinhas
## =============================================================================
##
## Gera public/data/geo/estados.geojson e public/data/geo/ucs.geojson, usados
## no modo de generalizacao do mapa: quando um desses recortes esta ligado, os
## pontos somem e o valor passa a viver no poligono.
##
## Simplificacao: st_simplify com dTolerance em METROS. Num CRS geografico o
## sf moderno usa s2, onde a tolerancia nao e em graus -- passar 0.01 achando
## que e ~1 km significa 1 cm e nao simplifica nada (o litoral brasileiro saiu
## com 748.762 vertices e 19 MB antes de eu perceber isso).
##
##   estados  1.000 m -> 8.819 vertices,  54 KB gzip
##   UCs        500 m ->                  10 KB gzip
##
## Uso: Rscript build/build_areas_geo.R [destino]
## =============================================================================

suppressMessages(library(sf))

OUT <- commandArgs(trailingOnly = TRUE)[1]
if (is.na(OUT)) OUT <- "public/data/geo"
dir.create(OUT, recursive = TRUE, showWarnings = FALSE)
msg <- function(...) cat(sprintf(...), "\n", sep = "")

REEF_DIR <- path.expand("~/Área de trabalho/ReefSYN")

grava <- function(x, nome, tol) {
  x <- st_simplify(st_transform(x, 4326), dTolerance = tol, preserveTopology = TRUE)
  x <- x[!st_is_empty(st_geometry(x)), ]
  caminho <- file.path(OUT, paste0(nome, ".geojson"))
  st_write(x, caminho, driver = "GeoJSON", delete_dsn = TRUE, quiet = TRUE,
           layer_options = c("COORDINATE_PRECISION=4", "WRITE_BBOX=YES"))
  system2("gzip", c("-9", "-k", "-f", shQuote(caminho)))
  msg("%-14s %3d feicoes · %6.0f KB · %4.0f KB gzip",
      paste0(nome, ".geojson"), nrow(x), file.size(caminho) / 1024,
      file.size(paste0(caminho, ".gz")) / 1024)
}

## ---- Estados costeiros -------------------------------------------------------
COSTEIROS <- c("AP","PA","MA","PI","CE","RN","PB","PE","AL","SE",
               "BA","ES","RJ","SP","PR","SC","RS")
uf <- st_read("data/estados_costeiros.gpkg", quiet = TRUE)
grava(uf, "estados", 1000)

## ---- UCs marinhas com sitio --------------------------------------------------
## So as que contem pelo menos um sitio: o CNUC tem 237 UCs marinhas e desenhar
## todas poluiria o mapa com areas onde nao ha o que mostrar.
uc <- st_read(file.path(REEF_DIR, "_gis", "shp_cnuc_2025_08", "cnuc_2025_08.shp"),
              quiet = TRUE)
uc <- uc[!is.na(uc$marinho) & uc$marinho > 0, ]
uc <- st_transform(st_make_valid(uc), 4326)

fish <- readRDS("data/reefsyn_fish.rds")
com_sitio <- unique(fish$site_uc$cd_cnuc)
uc <- uc[uc$cd_cnuc %in% com_sitio, c("cd_cnuc", "nome_uc", "categoria", "uf")]
msg("UCs marinhas no CNUC: %d · com sitio: %d",
    sum(!is.na(st_drop_geometry(uc)$cd_cnuc)), nrow(uc))
grava(uc, "ucs", 500)
