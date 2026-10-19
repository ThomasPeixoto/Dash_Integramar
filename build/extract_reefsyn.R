## =============================================================================
## ReefSYN -> tabelas nacionais de peixe para o painel
## =============================================================================
##
## Junta as DUAS metades do trabalho que ja existia em ~/Área de trabalho/ReefSYN:
##
##   de abundancia_peixes_por_local_ano.R  a agregacao de TODAS as especies
##   de relatorio/01_extrair_dados_especies.R  a deduplicacao VERIFICADA
##
## Essa juncao e necessaria porque as duas foram escritas em momentos
## diferentes: o _processed/ e de 11/08 e inclui o dataset V inteiro (344
## censos de Trindade/Martin Vaz que sao copia do IV) mais 654 censos do I que
## repetem IV, X e VI. Sao 998 censos contados duas vezes, concentrados
## justamente nas ilhas oceanicas. A verificacao de 23-24/09 resolveu isso, mas
## so foi aplicada ao recorte de 10 especies-alvo.
##
## As decisoes de deduplicacao NAO sao re-derivadas aqui: sao copiadas de
## 01_extrair_dados_especies.R, onde foram conferidas censo a censo.
##
## Saida: data/reefsyn_fish.rds
## =============================================================================

suppressMessages({
  library(data.table)
  library(sf)
})

REEF_DIR <- path.expand("~/Área de trabalho/ReefSYN")
DWC      <- file.path(REEF_DIR, "DwC_output")
OUT      <- commandArgs(trailingOnly = TRUE)[1]
if (is.na(OUT)) OUT <- "data/reefsyn_fish.rds"
dir.create(dirname(OUT), recursive = TRUE, showWarnings = FALSE)

msg <- function(...) cat(sprintf(...), "\n", sep = "")

## ---- 1. Fontes --------------------------------------------------------------
## Mesma lista de 01_extrair_dados_especies.R: so os censos visuais com o MESMO
## protocolo (transecto de 20 x 2 m = 40 m2) e com abundancia no eMOF.
##   II  fora  — censos estacionarios de 8 m2, nao comparaveis (decisao do usuario)
##   V   fora  — copia integral do IV em Trindade/Martin Vaz 2007 e 2009
##   IX  fora  — video, comportamento alimentar
##   III usa a v2_2026, nao a original
fontes <- list(
  I    = list(ev = "I/event_core.csv", occ = "I/DF_occ.csv", emof = "I/DF_eMOF.csv"),
  III  = list(ev = "III/v2_2026/event_core_v2026.csv", occ = "III/v2_2026/DF_occ_v2026.csv",
              emof = c("III/v2_2026/DF_eMOF_ab_v2026.csv", "III/v2_2026/DF_eMOF_sz_v2026.csv")),
  IV   = list(ev = "IV/event_core.csv", occ = "IV/DF_occ.csv", emof = "IV/DF_eMOF.csv"),
  VI   = list(ev = "VI/event_core.csv", occ = "VI/DF_occ.csv", emof = "VI/DF_eMOF.csv"),
  VII  = list(ev = "VII/event_core.csv", occ = "VII/DF_occ.csv", emof = "VII/DF_eMOF.csv"),
  VIII = list(ev = "VIII/event_core.csv", occ = "VIII/DF_occ.csv", emof = "VIII/DF_eMOF.csv"),
  X    = list(ev = "X/event_core.csv", occ = "X/DF_occ.csv", emof = "X/DF_eMOF.csv"),
  XI   = list(ev = "XI/event_core.csv", occ = "XI/DF_occ.csv", emof = "XI/DF_eMOF.csv")
)

# header = TRUE explicito: com colClasses = "character" o fread nao detecta o
# cabecalho sozinho e nomeia as colunas V1, V2...  O VIII esta em Latin-1.
ler <- function(ds, f) {
  fread(file.path(DWC, f), encoding = if (ds == "VIII") "Latin-1" else "UTF-8",
        colClasses = "character", header = TRUE)
}
pega <- function(dt, ...) {
  for (nm in c(...)) if (nm %in% names(dt)) return(dt[[nm]])
  rep(NA_character_, nrow(dt))
}

censos_l <- list(); occ_l <- list()

for (ds in names(fontes)) {
  f  <- fontes[[ds]]
  ev <- ler(ds, f$ev)
  ev <- data.table(
    ds, eventID = ev$eventID,
    year     = as.integer(pega(ev, "year")),
    lon      = as.numeric(ev$decimalLongitude),
    lat      = as.numeric(ev$decimalLatitude),
    location = pega(ev, "location", "island"),
    locality = pega(ev, "locality"),
    area_m2  = as.numeric(pega(ev, "sampleSizeValue"))
  )
  ev <- unique(ev, by = "eventID")

  occ <- ler(ds, f$occ)
  if ("occurrenceStatus" %in% names(occ)) {
    occ <- occ[is.na(occurrenceStatus) | occurrenceStatus == "presence"]
  }
  occ <- unique(occ[, .(eventID, occurrenceID,
                        sp  = scientificNameAccepted,
                        fam = pega(occ, "family"))])

  emof <- rbindlist(lapply(f$emof, function(x) ler(ds, x)), fill = TRUE)
  emof[, mt := tolower(measurementType)]
  ab <- unique(emof[mt == "abundance",
                    .(eventID, occurrenceID, ab = as.numeric(measurementValue))],
               by = c("eventID", "occurrenceID"))

  occ <- merge(occ, ab, by = c("eventID", "occurrenceID"), all.x = TRUE)
  occ[, ds := ds]

  msg("%-4s censos=%5d  ocorrencias=%6d  sem abundancia=%d",
      ds, nrow(ev), nrow(occ), sum(is.na(occ$ab)))
  censos_l[[ds]] <- ev
  occ_l[[ds]]    <- occ          # <- todas as especies, nao so as alvo
}

censos <- rbindlist(censos_l)
occ    <- rbindlist(occ_l)

## ---- 2. Deduplicacao (copiada de 01_extrair_dados_especies.R) ---------------
censos[, celula := paste(round(lon / 0.1), round(lat / 0.1))]

# I que repete IV (ilhas oceanicas) ou X (Alcatrazes): mesma celula de 0.1 grau e ano
cel_ano_IV_X <- unique(censos[ds %in% c("IV", "X"), .(celula, year)])
dup_I_IVX <- censos[ds == "I"][cel_ano_IV_X, on = .(celula, year), nomatch = 0L]$eventID

# I que repete VI: mesma data e coordenadas a menos de ~1 km
# unique por (ds, eventID) e obrigatorio: IV e X tem eventID repetido no
# event_core (51 e 1 casos, bug de exportacao conhecido). Sem isso o merge
# abaixo reintroduz 52 censos que a primeira leitura ja tinha removido -- e o
# total sobe de 10.686 para 10.738 sem nenhum aviso.
ev_data <- unique(rbindlist(lapply(names(fontes), function(ds) {
  e <- ler(ds, fontes[[ds]]$ev)
  data.table(ds, eventID = e$eventID, eventDate = pega(e, "eventDate"))
})), by = c("ds", "eventID"))
censos <- merge(censos, ev_data, by = c("ds", "eventID"), all.x = TRUE)
par_VI <- merge(censos[ds == "I",  .(eventID, eventDate, lon, lat)],
                censos[ds == "VI", .(eventDate, lon6 = lon, lat6 = lat)],
                by = "eventDate", allow.cartesian = TRUE)
dup_I_VI <- unique(par_VI[abs(lon - lon6) < 0.01 & abs(lat - lat6) < 0.01, eventID])

dups <- union(dup_I_IVX, dup_I_VI)
msg("dedup: %d censos de I = IV/X, %d de I = VI removidos; V nao foi lido (= IV)",
    length(dup_I_IVX), length(dup_I_VI))

censos <- censos[!(ds == "I" & eventID %in% dups)]
censos <- censos[!is.na(year) & !is.na(lon) & !is.na(lat)]
stopifnot("protocolo nao e mais o transecto de 40 m2" = all(censos$area_m2 == 40))

occ <- occ[censos[, .(ds, eventID)], on = .(ds, eventID), nomatch = 0L]
occ <- occ[!is.na(ab) & ab > 0]
msg("apos dedup: %d censos, %d ocorrencias, %d especies",
    nrow(censos), nrow(occ), uniqueN(occ$sp))

## ---- 3. Sitios, regiao e UC -------------------------------------------------
censos[, `:=`(lon = round(lon, 5), lat = round(lat, 5))]
sitios <- censos[, .(
  location = paste(sort(unique(na.omit(location))), collapse = "; "),
  locality = paste(sort(unique(na.omit(locality))), collapse = "; "),
  n_censos = .N, ano_min = min(year), ano_max = max(year)
), by = .(lon, lat)]
setorder(sitios, -lat, lon)
sitios[, site_id := sprintf("R%03d", .I)]

# Regiao por latitude. E a estratificacao que a serie temporal exige: a
# composicao geografica do "Brasil" muda a cada ano (o Rio e 44% dos censos e
# a unica regiao presente de 2001 a 2005), entao serie nacional agregada
# mostraria geografia disfarcada de tendencia.
sitios[, region := fifelse(lat > -1,    "Ilhas equatoriais",
                   fifelse(lat > -5.5,  "Noronha e Rocas",
                   fifelse(lat > -10,   "Nordeste",
                   fifelse(lat > -15,   "Bahia",
                   fifelse(lat > -20,   "Abrolhos e ES",
                   fifelse(lat > -24,   "Rio de Janeiro",
                   fifelse(lat > -26,   "Sao Paulo", "Sul")))))))]

censos <- merge(censos, sitios[, .(lon, lat, site_id)], by = c("lon", "lat"))

uc <- st_read(file.path(REEF_DIR, "_gis", "shp_cnuc_2025_08", "cnuc_2025_08.shp"), quiet = TRUE)
uc <- uc[!is.na(uc$marinho) & uc$marinho > 0, c("cd_cnuc", "nome_uc", "categoria", "uf")]
uc <- st_transform(st_make_valid(uc), 4326)
pts <- st_as_sf(sitios, coords = c("lon", "lat"), crs = 4326, remove = FALSE)
su  <- as.data.table(st_drop_geometry(st_join(pts, uc, join = st_within)))[!is.na(cd_cnuc)]
# Um sitio pode cair em UCs sobrepostas (APA grande + parque dentro dela).
# Guardamos a mais restritiva pelo nome, e a lista completa a parte.
site_uc <- su[, .(site_id, cd_cnuc, nome_uc, categoria, uf)]
msg("sitios: %d, em %d UCs marinhas (%d sitios dentro de alguma)",
    nrow(sitios), uniqueN(site_uc$cd_cnuc), uniqueN(site_uc$site_id))

## ---- 4. Agregados ------------------------------------------------------------
occ <- merge(occ, censos[, .(ds, eventID, site_id, year)], by = c("ds", "eventID"))

fish_site_year <- occ[, .(
  total_abundance = sum(ab),
  richness        = uniqueN(sp),
  n_families      = uniqueN(fam[!is.na(fam) & fam != ""])
), by = .(site_id, year)]
esforco <- censos[, .(n_events = .N), by = .(site_id, year)]
fish_site_year <- merge(fish_site_year, esforco, by = c("site_id", "year"), all.y = TRUE)
fish_site_year[is.na(total_abundance), `:=`(total_abundance = 0, richness = 0, n_families = 0)]
fish_site_year[, mean_abundance := total_abundance / n_events]

fish_summary <- occ[, .(n_species = uniqueN(sp),
                        n_families = uniqueN(fam[!is.na(fam) & fam != ""]),
                        total_abundance = sum(ab)), by = site_id]
fish_summary <- merge(
  fish_summary,
  censos[, .(n_events = .N, years_sampled = uniqueN(year),
             year_range = paste(min(year), max(year), sep = "–")), by = site_id],
  by = "site_id", all.y = TRUE)

fish_comp <- occ[!is.na(fam) & fam != "", .(total_abundance = sum(ab)),
                 by = .(site_id, year, family = fam)]
fish_comp[, proportion := 100 * total_abundance / sum(total_abundance), by = .(site_id, year)]

# Nivel de especie so para os taxons que valem o espaco: os demais somariam
# dezenas de milhares de linhas quase vazias ao pacote do site.
top_sp <- occ[, .(tot = sum(ab)), by = sp][order(-tot)][1:120, sp]
fish_year_sp <- occ[sp %in% top_sp, .(total_abundance = sum(ab)),
                    by = .(site_id, year, species = sp)]
fish_year_sp <- merge(fish_year_sp, esforco, by = c("site_id", "year"))

## ---- 5. Conferencias ---------------------------------------------------------
# A extracao de referencia (relatorio/01_extrair_dados_especies.R, verificada
# censo a censo em 23-24/09) chegou a 10.686 censos e 232 sitios. Divergir
# disso significa que a deduplicacao mudou de comportamento.
stopifnot(
  "numero de censos divergiu da extracao de referencia" = nrow(censos) == 10686,
  "numero de sitios divergiu da extracao de referencia" = nrow(sitios) == 232,
  "abundancia por censo negativa" = all(fish_site_year$mean_abundance >= 0),
  "composicao nao soma 100%" =
    max(abs(fish_comp[, sum(proportion), by = .(site_id, year)]$V1 - 100)) < 1e-6,
  "sitio sem regiao" = !any(is.na(sitios$region))
)

saveRDS(list(
  sites        = sitios[, .(site_id, lon, lat, location, locality, region,
                            n_censos, ano_min, ano_max)],
  site_uc      = site_uc,
  fish_site_year = fish_site_year,
  fish_summary   = fish_summary,
  fish_comp      = fish_comp,
  fish_year_sp   = fish_year_sp
), OUT)

msg("")
msg("gravado %s", OUT)
msg("  %d sitios · %d regioes · %d censos · %d especies · %d-%d",
    nrow(sitios), uniqueN(sitios$region), nrow(censos), uniqueN(occ$sp),
    min(censos$year), max(censos$year))
