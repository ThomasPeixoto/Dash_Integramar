## =============================================================================
## ReefSYN XII-XVI -> duas camadas bentonicas distintas
## =============================================================================
##
## Os cinco datasets bentonicos NAO sao um conjunto so. Medido em 19/10/2026:
##
##   ds   taxons  o que resolve                      soma/evento
##   XII      33  corais a especie, quase nenhuma alga      35%
##   XIII     24  corais a especie, quase nenhuma alga      56%
##   XIV      83  comunidade completa                      100% (p90 432)
##   XV       45  comunidade completa                      100%
##   XVI      59  comunidade completa                      650%
##
## Duas coisas quebram a comparacao direta entre eles:
##
## 1. O DENOMINADOR. A exportacao DwC remove substrato, sedimento, turf e os
##    grupos morfo-anatomicos "because they do not represent taxonomical
##    entities" (eventRemarks). So o XV manteve esses registros no eMOF, sem
##    identidade -- nos outros quatro eles sumiram do arquivo.
##
## 2. O UNIVERSO AMOSTRADO. XII e XIII sao levantamentos de CORAL: a lista de
##    taxons deles e quase toda Scleractinia. Compor "algas calcarias" entre
##    todos daria 0% no XII e 65% no XIV -- artefato de protocolo, nao recife.
##
## Dai as duas camadas:
##
##   CORAIS      nacional, os cinco datasets. Corais escleractineos a especie
##               sao o vocabulario que todos compartilham: 13 das 14 especies
##               aparecem em 2+ datasets, 2 nos cinco. A composicao RELATIVA
##               entre corais e valida mesmo sem o denominador, porque a
##               fracao removida e a mesma para todos os taxons do evento e
##               some na razao.
##
##   COMUNIDADE  XIV, XV e XVI, cada um na sua camada, NUNCA somados. XII e
##               XIII ficam de fora: nao amostram a comunidade.
##
## Saida: data/reefsyn_benthos.rds
## =============================================================================

suppressMessages({
  library(data.table)
  library(sf)
})

REEF_DIR <- path.expand("~/Área de trabalho/ReefSYN")
DWC <- file.path(REEF_DIR, "DwC_output")
OUT <- commandArgs(trailingOnly = TRUE)[1]
if (is.na(OUT)) OUT <- "data/reefsyn_benthos.rds"

msg <- function(...) cat(sprintf(...), "\n", sep = "")
ler <- function(f) fread(file.path(DWC, f), encoding = "Latin-1",
                         colClasses = "character", header = TRUE)

DATASETS   <- c("XII", "XIII", "XIV", "XV", "XVI")
COMUNIDADE <- c("XIV", "XV", "XVI")

## Mesmo criterio de extract_reefsyn.R: macrorregiao do IBGE a partir do
## estado mais proximo, com as ilhas oceanicas em categoria propria. As duas
## extracoes TEM que concordar -- o painel filtra as duas camadas pela mesma
## lista de regioes.
IBGE <- c(AP="Norte", PA="Norte",
          MA="Nordeste", PI="Nordeste", CE="Nordeste", RN="Nordeste",
          PB="Nordeste", PE="Nordeste", AL="Nordeste", SE="Nordeste", BA="Nordeste",
          ES="Sudeste", RJ="Sudeste", SP="Sudeste",
          PR="Sul", SC="Sul", RS="Sul")
LIMITE_OCEANICA_KM <- 100


## Malha estadual: lida de data/estados_costeiros.gpkg, gravado uma vez por
## build/cache_estados.R. Chamar geobr::read_state() em cada script corrompia
## o cache dele quando dois rodavam perto um do outro.
le_estados <- function() {
  caminho <- "data/estados_costeiros.gpkg"
  if (!file.exists(caminho)) {
    stop("falta ", caminho, " — rode: Rscript build/cache_estados.R")
  }
  sf::st_read(caminho, quiet = TRUE)
}

atribui_uf <- function(dt) {
  ufs <- le_estados()
  pts <- sf::st_as_sf(dt, coords = c("lon", "lat"), crs = 4326, remove = FALSE)
  i <- sf::st_nearest_feature(pts, ufs)
  dt[, `:=`(
    uf = ufs$uf[i],
    uf_nome = ufs$uf_nome[i],
    dist_uf_km = round(as.numeric(
      sf::st_distance(pts, ufs[i, ], by_element = TRUE)) / 1000, 1)
  )]
  dt[, region := fifelse(dist_uf_km > LIMITE_OCEANICA_KM,
                         "Ilhas oceânicas", unname(IBGE[uf]))]
  dt[]
}

## ---- Leitura ----------------------------------------------------------------
tudo <- rbindlist(lapply(DATASETS, function(d) {
  ev <- ler(file.path(d, "event_core.csv"))
  ev <- unique(data.table(
    eventID = ev$eventID,
    year = as.integer(if ("year" %in% names(ev)) ev$year else substr(ev$eventDate, 1, 4)),
    lon = as.numeric(ev$decimalLongitude), lat = as.numeric(ev$decimalLatitude),
    locality = if ("locality" %in% names(ev)) ev$locality else NA_character_
  ), by = "eventID")
  ev <- ev[!is.na(year) & !is.na(lon) & !is.na(lat)]

  occ <- ler(file.path(d, "DF_occ.csv"))
  occ <- unique(occ[, .(occurrenceID,
                        sp = scientificNameAccepted,
                        phylum, class, order)], by = "occurrenceID")

  emof <- ler(file.path(d, "DF_eMOF.csv"))
  # eventID vem do eMOF: e a tabela que tem TODAS as medidas, inclusive as que
  # perderam a linha de ocorrencia na exportacao (caso do XV).
  cov <- unique(emof[tolower(measurementType) == "percentage cover",
                     .(eventID, occurrenceID, cover = as.numeric(measurementValue))],
                by = "occurrenceID")

  x <- merge(cov, occ, by = "occurrenceID", all.x = TRUE)
  x <- merge(x, ev, by = "eventID")
  x[!is.na(cover) & cover > 0][, ds := d][]
}), fill = TRUE)

msg("lidos %d registros de cobertura em %d datasets", nrow(tudo), uniqueN(tudo$ds))

## ---- Sitios (unificados entre datasets) --------------------------------------
tudo[, `:=`(lon = round(lon, 5), lat = round(lat, 5))]
sitios <- tudo[, .(
  locality = na.omit(locality)[1],
  datasets = paste(sort(unique(ds)), collapse = "; "),
  n_eventos = uniqueN(eventID), ano_min = min(year), ano_max = max(year)
), by = .(lon, lat)]
setorder(sitios, -lat, lon)
sitios[, site_id := sprintf("B%03d", .I)]
sitios <- atribui_uf(sitios)
tudo <- merge(tudo, sitios[, .(lon, lat, site_id)], by = c("lon", "lat"))

## =============================================================================
## CAMADA 1 — CORAIS (nacional)
## =============================================================================
## So Scleractinia identificado a ESPECIE (nome com dois termos): e o nivel em
## que os cinco datasets concordam. Generos e "Scleractinia" solto ficam de
## fora porque significam coisas diferentes em cada protocolo.
coral <- tudo[order == "Scleractinia" & !is.na(sp) & grepl(" ", sp)]
msg("corais: %d registros, %d especies, %d sitios, %d-%d",
    nrow(coral), uniqueN(coral$sp), uniqueN(coral$site_id),
    min(coral$year), max(coral$year))

# Composicao RELATIVA dentro da assembleia de coral. Somamos por sitio/ano e so
# entao dividimos -- a media de razoes por evento daria peso igual a um
# fotoquadrante com um coral e a outro com vinte.
coral_sy_sp <- coral[, .(cover = sum(cover), n_eventos = uniqueN(eventID)),
                     by = .(site_id, year, species = sp)]
coral_sy_sp[, pct := 100 * cover / sum(cover), by = .(site_id, year)]

coral_sy <- coral[, .(n_species = uniqueN(sp), n_eventos = uniqueN(eventID),
                      cover_total = sum(cover)), by = .(site_id, year)]

coral_summary <- coral[, .(n_species = uniqueN(sp), n_eventos = uniqueN(eventID),
                           years_sampled = uniqueN(year),
                           year_range = paste(min(year), max(year), sep = "–"),
                           datasets = paste(sort(unique(ds)), collapse = "; ")),
                       by = site_id]

stopifnot(
  "composicao de coral nao soma 100%" =
    max(abs(coral_sy_sp[, sum(pct), by = .(site_id, year)]$V1 - 100)) < 1e-6
)

## =============================================================================
## CAMADA 2 — COMUNIDADE BENTONICA (por dataset, nunca somada)
## =============================================================================
grupo <- function(ph, cl, od, sp) {
  fifelse(is.na(sp) | sp == "", "Substrato, turf e não identificado",
  fifelse(ph == "Cyanobacteria", "Cianobactérias",
  fifelse(od %in% c("Corallinales", "Hapalidiales"), "Algas calcárias",
  fifelse(ph %in% c("Rhodophyta", "Ochrophyta", "Chlorophyta"), "Macroalgas carnosas",
  fifelse(od == "Scleractinia", "Coral",
  fifelse(od == "Zoantharia", "Zoantídeos",
  fifelse(cl == "Octocorallia", "Octocorais",
  fifelse(ph == "Porifera", "Esponjas",
  fifelse(ph %in% c("Chordata", "Bryozoa", "Echinodermata", "Mollusca",
                    "Annelida", "Arthropoda", "Cnidaria"), "Outros invertebrados",
          "Outros"))))))))) 
}

com <- tudo[ds %in% COMUNIDADE]
com[, fg := grupo(phylum, class, order, sp)]

# Dentro de cada dataset a composicao e relativa ao que AQUELE dataset mede.
# O campo `ds` viaja junto e o front-end nunca cruza datasets.
com_sy <- com[, .(cover = sum(cover), n_eventos = uniqueN(eventID)),
              by = .(ds, site_id, year, functional_group = fg)]
com_sy[, pct := 100 * cover / sum(cover), by = .(ds, site_id, year)]

com_summary <- com[, .(n_taxons = uniqueN(sp[!is.na(sp)]), n_eventos = uniqueN(eventID),
                       years_sampled = uniqueN(year),
                       year_range = paste(min(year), max(year), sep = "–")),
                   by = .(ds, site_id)]

msg("comunidade: %d datasets, %d sitios, %d linhas sitio/ano/grupo",
    uniqueN(com$ds), uniqueN(com$site_id), nrow(com_sy))

stopifnot(
  "composicao da comunidade nao soma 100%" =
    max(abs(com_sy[, sum(pct), by = .(ds, site_id, year)]$V1 - 100)) < 1e-6,
  "cobertura se perdeu entre a leitura e a agregacao" =
    abs(sum(tudo$cover) - sum(tudo[, sum(cover), by = ds]$V1)) < 1e-6
)

saveRDS(list(
  sites         = sitios[, .(site_id, lon, lat, locality, region, uf, uf_nome,
                             dist_uf_km, datasets, n_eventos, ano_min, ano_max)],
  coral_sy_sp   = coral_sy_sp,
  coral_sy      = coral_sy,
  coral_summary = coral_summary,
  com_sy        = com_sy,
  com_summary   = com_summary,
  meta = list(
    coral_note = "composição relativa dentro da assembleia de coral; válida sem o denominador",
    com_note   = "relativa ao que cada dataset mede; NUNCA comparar entre datasets",
    com_datasets = COMUNIDADE
  )
), OUT)

msg("")
msg("gravado %s", OUT)
msg("  corais     %3d sitios · %2d especies · %d regioes",
    uniqueN(coral$site_id), uniqueN(coral$sp), uniqueN(sitios[site_id %in% coral$site_id]$region))
msg("  comunidade %3d sitios · %d datasets", uniqueN(com$site_id), uniqueN(com$ds))
print(sitios[, .(sitios = .N, eventos = sum(n_eventos)), by = region][order(-eventos)])
