## =============================================================================
## ReefSYN XV -> bentos das ilhas oceanicas (cobertura RELATIVA)
## =============================================================================
##
## Dos cinco datasets bentonicos do ReefSYN (XII-XVI) so o XV tem composicao
## fechada. Soma da cobertura por evento, medida em 19/10/2026:
##
##   XII   mediana  35%            0,6% dos eventos entre 95 e 105
##   XIII  mediana  56%            4,2%
##   XIV   mediana 100%, p90 432%  23,8%
##   XV    mediana 100%, p90 100%  99,9%   <- unico fechado
##   XVI   mediana 650%            0,0%
##
## Todos declaram measurementType = "Percentage cover", mas nao compartilham
## denominador. Os outros quatro ficam de fora ate que o deles seja resolvido.
##
## O XV e o PELD-ILOC das ilhas oceanicas: Noronha, Rocas, Sao Pedro e Sao
## Paulo e Trindade, 2013-2019, mesmo protocolo do BRislands_2014_2024_cover.csv
## que ja alimenta o painel (2021-2024).
##
## SOBRE O QUE FALTA NO XV
##
## A cobertura do eMOF soma 100% por evento, mas 40% dos registros (5.408 de
## 13.671) nao tem linha correspondente em DF_occ. O proprio eventRemarks diz
## por que:
##
##   "Bare substrate, sediment, lost information (shade, quadrat, tape),
##    morpho-anatomical benthic groups and turf were not included in the data
##    because they do not represent taxonomical entities in which DwC
##    standards are based. (...) Please contact the data curator Cesar
##    Cordeiro to have the complete dataset with verbatimIdentification"
##
## Ou seja: substrato, sedimento e TURF estao medidos, mas a exportacao DwC os
## deixou sem identidade. Aqui eles entram como um unico balde rotulado, o que
## preserva o denominador (a cobertura continua somando 100%) sem fingir saber
## o que nao sabemos.
##
## Para desmembrar esse balde -- e so entao comparar com a serie de Noronha
## 2021-2024, onde turf e substrato sao categorias proprias -- e preciso o
## dataset completo com verbatimIdentification, com o Cesar Cordeiro.
##
## Saida: data/reefsyn_benthos.rds
## =============================================================================

suppressMessages(library(data.table))

REEF_DIR <- path.expand("~/Área de trabalho/ReefSYN")
DWC <- file.path(REEF_DIR, "DwC_output")
OUT <- commandArgs(trailingOnly = TRUE)[1]
if (is.na(OUT)) OUT <- "data/reefsyn_benthos.rds"

msg <- function(...) cat(sprintf(...), "\n", sep = "")
ler <- function(f) fread(file.path(DWC, f), encoding = "Latin-1",
                         colClasses = "character", header = TRUE)

ev <- ler("XV/event_core.csv")
ev <- unique(data.table(
  eventID = ev$eventID,
  year    = as.integer(substr(ev$eventDate, 1, 4)),
  lon     = as.numeric(ev$decimalLongitude),
  lat     = as.numeric(ev$decimalLatitude),
  locality = ev$locality
), by = "eventID")
ev <- ev[!is.na(year) & !is.na(lon) & !is.na(lat)]

occ <- ler("XV/DF_occ.csv")
# Sem eventID aqui: ele vem do eMOF, que e a tabela que tem TODAS as medidas.
# Puxa-lo do DF_occ deixaria os 40% sem identidade taxonomica com eventID
# ausente, e o join seguinte os descartaria em silencio.
occ <- unique(occ[, .(occurrenceID, sp = scientificNameAccepted,
                      phylum, class, order)], by = "occurrenceID")

emof <- ler("XV/DF_eMOF.csv")
cov <- unique(emof[tolower(measurementType) == "percentage cover",
                   .(eventID, occurrenceID, cover = as.numeric(measurementValue))],
              by = "occurrenceID")

# Partimos do eMOF (toda a cobertura) e trazemos a taxonomia quando existe.
# Comecar pelo DF_occ perderia os 40% sem identidade taxonomica e o
# denominador cairia de 100% para ~55% sem aviso.
occ <- merge(cov, occ, by = "occurrenceID", all.x = TRUE)
occ <- merge(occ, ev, by = "eventID")
occ <- occ[!is.na(cover) & cover > 0]
msg("eMOF: %d medidas de cobertura, %d sem identidade taxonomica (%.0f%%)",
    nrow(occ), sum(is.na(occ$sp)), 100 * mean(is.na(occ$sp)))

## ---- Grupos funcionais a partir da taxonomia --------------------------------
## O XV nao traz coluna de grupo funcional; derivamos de filo/classe/ordem.
## As algas calcarias ficam separadas das carnosas porque tem sinal ecologico
## oposto e juntas somam metade da cobertura do conjunto.
grupo <- function(ph, cl, od) {
  fifelse(ph == "Cyanobacteria", "Cyanobacteria",
  fifelse(od %in% c("Corallinales", "Hapalidiales"), "Calcareous algae",
  fifelse(ph %in% c("Rhodophyta", "Ochrophyta", "Chlorophyta"), "Fleshy macroalgae",
  fifelse(od == "Scleractinia", "Hard coral",
  fifelse(od == "Zoantharia", "Zoantharia",
  fifelse(ph == "Porifera", "Sponges",
  fifelse(ph %in% c("Chordata", "Bryozoa", "Echinodermata", "Mollusca",
                    "Annelida", "Arthropoda", "Cnidaria"), "Other invertebrates",
          "Unclassified")))))))
}
occ[, fg := fifelse(is.na(sp) | sp == "", "Substrate, turf and unidentified",
                    grupo(phylum, class, order))]

orfaos <- occ[fg == "Unclassified" & !is.na(sp), .(cob = sum(cover)), by = .(sp, phylum, class, order)]
if (nrow(orfaos)) {
  msg("taxons sem grupo funcional (%.2f%% da cobertura):",
      100 * sum(orfaos$cob) / sum(occ$cover))
  print(orfaos[order(-cob)][1:min(5, .N)])
}

## ---- Regiao e sitio ---------------------------------------------------------
occ[, `:=`(lon = round(lon, 5), lat = round(lat, 5))]
sitios <- occ[, .(locality = na.omit(locality)[1], n_eventos = uniqueN(eventID),
                  ano_min = min(year), ano_max = max(year)), by = .(lon, lat)]
setorder(sitios, -lat, lon)
sitios[, site_id := sprintf("B%03d", .I)]
sitios[, island := fifelse(lat > 0, "São Pedro e São Paulo",
                   fifelse(lat > -4.0 & lon < -33, "Atol das Rocas",
                   fifelse(lat > -4.2, "Fernando de Noronha", "Trindade")))]
occ <- merge(occ, sitios[, .(lon, lat, site_id, island)], by = c("lon", "lat"))

## ---- Agregacao: media por sitio/ano/grupo -----------------------------------
## Primeiro soma dentro de cada evento (varios taxons caem no mesmo grupo),
## preenchendo com zero os grupos ausentes -- sem isso a media sai so onde o
## grupo aparece e superestima a cobertura.
grupos <- sort(unique(occ$fg))
por_evento <- occ[, .(cover = sum(cover)), by = .(site_id, island, year, eventID, fg)]
por_evento <- por_evento[CJ(eventID = unique(eventID), fg = grupos, unique = TRUE),
                         on = .(eventID, fg)]
por_evento[is.na(cover), cover := 0]
chave <- unique(occ[, .(eventID, site_id, island, year)])
por_evento[, c("site_id", "island", "year") := NULL]
por_evento <- merge(por_evento, chave, by = "eventID")

benthos_site_year <- por_evento[, .(mean_cover = mean(cover), n_eventos = uniqueN(eventID)),
                                by = .(site_id, island, year, functional_group = fg)]
benthos_site_year[, proportion := 100 * mean_cover / sum(mean_cover), by = .(site_id, year)]

benthos_summary <- occ[, .(n_eventos = uniqueN(eventID), n_taxons = uniqueN(sp),
                           years_sampled = uniqueN(year),
                           year_range = paste(min(year), max(year), sep = "–")),
                       by = .(site_id, island)]

benthos_taxa <- occ[!is.na(sp), .(cover = sum(cover)), by = .(site_id, island, year, sp, fg)]

## ---- Conferencias ------------------------------------------------------------
tot <- benthos_site_year[, .(s = sum(mean_cover)), by = .(site_id, year)]$s
msg("cobertura media por sitio/ano: min %.1f  mediana %.1f  max %.1f",
    min(tot), median(tot), max(tot))

# A conferencia que importa e de CONSERVACAO: toda medida do eMOF tem que
# chegar na agregacao. Comparar a media com 100 nao serve de trava porque dois
# dos 2.634 eventos somam 40 e 68 na propria fonte (SPSP Enseada 2014 e 2015),
# e num sitio-ano com poucos fotoquadrantes isso puxa a media para 93.
cov_total_fonte <- sum(cov$cover, na.rm = TRUE)
cov_total_final <- sum(occ$cover)
stopifnot(
  "cobertura se perdeu entre o eMOF e a agregacao" =
    abs(cov_total_fonte - cov_total_final) < 1e-6,
  "numero de eventos divergiu do event_core" = uniqueN(occ$eventID) == nrow(ev),
  "composicao nao soma 100%" =
    max(abs(benthos_site_year[, sum(proportion), by = .(site_id, year)]$V1 - 100)) < 1e-6,
  # Folga larga, so para pegar perda grosseira; a trava real e a conservacao
  # acima.
  "cobertura media muito longe de 100%" = abs(median(tot) - 100) < 2
)

saveRDS(list(
  sites   = sitios[, .(site_id, lon, lat, locality, island, n_eventos, ano_min, ano_max)],
  site_year = benthos_site_year,
  summary = benthos_summary,
  taxa    = benthos_taxa,
  meta    = list(source = "ReefSYN XV (PELD-ILOC)", quantity = "Percentage cover",
                 note = "cobertura absoluta; substrato, turf e nao identificados num unico grupo")
), OUT)

msg("")
msg("gravado %s", OUT)
msg("  %d sitios · %d ilhas · %d eventos · %d taxons · %d grupos · %d-%d",
    nrow(sitios), uniqueN(sitios$island), uniqueN(occ$eventID), uniqueN(occ$sp),
    length(grupos), min(occ$year), max(occ$year))
print(benthos_site_year[, .(cobertura = round(sum(mean_cover) / uniqueN(paste(site_id, year)), 1)),
                        by = functional_group][order(-cobertura)])
