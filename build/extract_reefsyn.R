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

## Traços funcionais (peso, nível trófico): ver build/traits_quimbayo.R.
## Rodar SEMPRE da raiz do projeto: o caminho do banco é relativo a ela.
source("build/traits_quimbayo.R")

## Raiz da fonte ReefSYN (DwC_output/ e _gis/). Padrao: a maquina local do
## Thomas. No cluster, a copia certa fica em source/ReefSYN dentro do projeto:
##   REEF_DIR=$PWD/source/ReefSYN Rscript build/extract_reefsyn.R
## NAO aponte para ~/reefsyn_run/DwC_output do cluster: e uma versao ANTIGA e
## diferente (sem I/DF_occ.csv, sem III/v2_2026) e produziria, sem erro algum,
## um conjunto de dados errado.
REEF_DIR <- path.expand(Sys.getenv("REEF_DIR", "~/Área de trabalho/ReefSYN"))
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

## Comprimento total (cm). I, III, IV, VI, X e XI trazem o valor medido; VII e
## VIII trazem CLASSES de 5 ou 10 cm ("10-20"), e o comprimento vira o ponto
## médio da classe. Isso não é o tamanho de cada peixe: é o melhor que a fonte
## permite, e `ct_classe` marca essas linhas para o painel dizer quanto do
## resultado depende dele. Valores corrompidos (VIII tem "X46" e "X47") viram NA
## e ficam fora do comprimento e do peso, sem imputação.
ct_numerico <- function(x) {
  x <- trimws(gsub("[\u2013\u2014]", "-", x))
  x <- gsub(",", ".", x, fixed = TRUE)
  out <- suppressWarnings(as.numeric(x))
  faixa <- !is.na(x) & grepl("^[0-9.]+-[0-9.]+$", x)
  if (any(faixa)) {
    lim <- tstrsplit(x[faixa], "-", fixed = TRUE)
    out[faixa] <- (as.numeric(lim[[1]]) + as.numeric(lim[[2]])) / 2
  }
  out
}
ct_e_classe <- function(x) !is.na(x) & grepl("^[0-9.]+\\s*[-\u2013\u2014]\\s*[0-9.]+$", trimws(x))

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

  # CT: uma medida por ocorrencia (conferido nos 8 datasets: nenhuma duplicada).
  ct <- unique(emof[mt == "total length", .(eventID, occurrenceID, ct_bruto = measurementValue)],
               by = c("eventID", "occurrenceID"))

  occ <- merge(occ, ab, by = c("eventID", "occurrenceID"), all.x = TRUE)
  occ <- merge(occ, ct, by = c("eventID", "occurrenceID"), all.x = TRUE)
  occ[, `:=`(ct = ct_numerico(ct_bruto), ct_classe = ct_e_classe(ct_bruto), ds = ds)]

  msg("%-4s censos=%5d  ocorrencias=%6d  sem abundancia=%d  sem CT=%d",
      ds, nrow(ev), nrow(occ), sum(is.na(occ$ab)), sum(is.na(occ$ct)))
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

## ---- 3b. Estado (UF) de cada sitio ------------------------------------------
## Os sitios sao marinhos, entao nenhum cai DENTRO de um poligono estadual:
## usamos o estado mais proximo. Para as ilhas oceanicas isso reproduz a
## filiacao administrativa (Noronha/SPSP em PE, Rocas em RN, Trindade no ES),
## mas elas sao ecologicamente distintas do litoral do mesmo estado -- o
## painel marca isso.

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

ufs <- le_estados()
pts_uf <- st_as_sf(sitios, coords = c("lon", "lat"), crs = 4326, remove = FALSE)
idx <- sf::st_nearest_feature(pts_uf, ufs)
sitios[, `:=`(uf = ufs$uf[idx], uf_nome = ufs$uf_nome[idx])]
# Distancia ate a costa: so para saber quao longe a atribuicao foi feita.
sitios[, dist_uf_km := round(as.numeric(
  sf::st_distance(pts_uf, ufs[idx, ], by_element = TRUE)) / 1000, 1)]
msg("estados: %d UFs atribuidas (mediana %.1f km da costa, max %.0f km)",
    uniqueN(sitios$uf), median(sitios$dist_uf_km), max(sitios$dist_uf_km))

# Regiao: macrorregiao do IBGE a partir do estado, mais uma categoria propria
# para as ilhas oceanicas. As faixas de latitude que eu usava antes produziam
# "regioes" como "Sao Paulo" e "Bahia", que nao sao regioes de nada -- eram
# recortes arbitrarios com nome de estado.
#
# As ilhas oceanicas saem separadas porque administrativamente pertencem a PE,
# RN e ES mas estao a centenas de quilometros da costa e tem comunidades
# distintas: some-las ao litoral do mesmo estado misturaria coisas diferentes.
# O corte e por distancia ate a costa, nao por latitude.
IBGE <- c(AP="Norte", PA="Norte",
          MA="Nordeste", PI="Nordeste", CE="Nordeste", RN="Nordeste",
          PB="Nordeste", PE="Nordeste", AL="Nordeste", SE="Nordeste", BA="Nordeste",
          ES="Sudeste", RJ="Sudeste", SP="Sudeste",
          PR="Sul", SC="Sul", RS="Sul")
## As ilhas oceanicas sao identificadas por COORDENADA, nao por distancia ate
## o estado. A regra anterior -- dist_uf_km > 100 -- falhava em silencio: o
## geobr trata Trindade/Martim Vaz como territorio do ES e Fernando de Noronha
## como territorio de PE, entao a distancia ate "o estado" desses sitios e de
## 0,1 km e eles entravam como litoral. Eram 17 sitios de Trindade somados ao
## Sudeste e 9 de Noronha somados ao Nordeste -- comunidades insulares,
## a ~1.100 km e ~350 km da costa, diluidas na serie do continente.
##
## Os quatro arquipelagos oceanicos brasileiros sao uma lista curta e estavel;
## uma caixa por arquipelago e auditavel e nao depende da geometria de
## terceiros. Limites folgados o bastante para os sitios de cada um.
ILHAS_OCEANICAS <- list(
  list(nome = "Fernando de Noronha",   lon = c(-32.50, -32.30), lat = c( -3.92,  -3.78)),
  list(nome = "Atol das Rocas",        lon = c(-33.90, -33.70), lat = c( -3.92,  -3.78)),
  list(nome = "São Pedro e São Paulo", lon = c(-29.40, -29.30), lat = c(  0.85,   1.05)),
  list(nome = "Trindade e Martim Vaz", lon = c(-29.40, -28.80), lat = c(-20.65, -20.40))
)

arquipelago <- function(lon, lat) {
  out <- rep(NA_character_, length(lon))
  for (i in ILHAS_OCEANICAS) {
    dentro <- lon >= i$lon[1] & lon <= i$lon[2] & lat >= i$lat[1] & lat <= i$lat[2]
    out[dentro & is.na(out)] <- i$nome
  }
  out
}

sitios[, ilha := arquipelago(lon, lat)]
sitios[, region := fifelse(!is.na(ilha), "Ilhas oceânicas", unname(IBGE[uf]))]
msg("ilhas oceanicas: %s",
    paste(sprintf("%s=%d", names(table(sitios$ilha)),
                  as.integer(table(sitios$ilha))), collapse = "  "))
msg("regioes: %s", paste(sprintf("%s=%d", names(table(sitios$region)),
                                 as.integer(table(sitios$region))), collapse = "  "))


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

## ---- 4c. Funcao: tamanho, biomassa e nivel trofico --------------------------
## Tudo usa o comprimento MEDIDO em campo (CT do eMOF), nao o tamanho maximo da
## especie. Peso individual = a * CT^b (g), com a e b do banco de Quimbayo et al.
## 2021; nivel trofico tambem de la. Ver build/traits_quimbayo.R.
tr <- ler_traits()
testar_resolucao(tr)

fx <- aplicar_traits(
  occ[, .(ds, eventID, occurrenceID, site_id, year, entrada = sp, fam, ab, ct, ct_classe)], tr)
stopifnot("aplicar_traits mudou a abundancia" = sum(fx$ab) == sum(occ$ab),
          "aplicar_traits mudou o numero de ocorrencias" = nrow(fx) == nrow(occ))

# Comprimento incompativel com a especie e erro de registro, nao peixe grande.
# Nao se mexe na fonte: o registro sai SO do comprimento e do peso, e entra na
# abundancia e no nivel trofico como sempre (a identificacao nao esta em duvida).
fx[, excl := !is.na(ct) & !is.na(tmax_ref) & ct > CT_MAX_RAZAO * tmax_ref]
fx[, ct_ok := !is.na(ct) & !excl]
fx[!(ct_ok), w_g := NA_real_]
fx[, tem_w := ct_ok & !is.na(w_g)]
msg("CT: %d ocorrencias (%d ind.) acima de %gx o tamanho maximo da especie, fora do comprimento e do peso",
    sum(fx$excl), sum(fx$ab[fx$excl]), CT_MAX_RAZAO)

func <- fx[, .(
  ind       = sum(ab),
  i_len     = sum(ab[ct_ok]),
  len_soma  = sum(ab[ct_ok] * ct[ct_ok]),
  i_w       = sum(ab[tem_w]),
  bio_g     = sum(ab[tem_w] * w_g[tem_w]),
  i_tl      = sum(ab[!is.na(tl)]),
  tl_soma   = sum(ab[!is.na(tl)] * tl[!is.na(tl)]),
  i_cls     = sum(ab[ct_ok & ct_classe]),
  i_gen     = sum(ab[tem_w & via_ab == "genero"]),
  excl      = sum(ab[excl]),
  # media do nivel trofico PONDERADA pela biomassa: so onde ha peso E nivel
  bw_soma   = sum(ab[tem_w & !is.na(tl)] * w_g[tem_w & !is.na(tl)] * tl[tem_w & !is.na(tl)]),
  bw_peso   = sum(ab[tem_w & !is.na(tl)] * w_g[tem_w & !is.na(tl)])
), by = .(site_id, year)]
func <- merge(esforco, func, by = c("site_id", "year"), all.x = TRUE)
num0 <- c("ind", "i_len", "len_soma", "i_w", "bio_g", "i_tl", "tl_soma", "i_cls",
          "i_gen", "excl", "bw_soma", "bw_peso")
for (v in num0) set(func, which(is.na(func[[v]])), v, 0)

# Zero e NA sao coisas diferentes. Sitio-ano sem NENHUM peixe contado tem
# biomassa 0 (medido); sitio-ano com peixe mas sem peso estimavel nao tem
# biomassa nenhuma, e dizer 0 seria falso.
fish_func_year <- func[, .(
  site_id, year, n_events,
  ind,
  cob_len    = round(fifelse(ind > 0, i_len / ind, NA_real_), 4),
  len_mean   = round(fifelse(i_len > 0, len_soma / i_len, NA_real_), 2),
  cob_w      = round(fifelse(ind > 0, i_w / ind, NA_real_), 4),
  bio_census = round(fifelse(ind == 0, 0, fifelse(i_w > 0, bio_g / 1000 / n_events, NA_real_)), 4),
  cob_tl     = round(fifelse(ind > 0, i_tl / ind, NA_real_), 4),
  tl_ab      = round(fifelse(i_tl > 0, tl_soma / i_tl, NA_real_), 3),
  tl_bio     = round(fifelse(bw_peso > 0, bw_soma / bw_peso, NA_real_), 3),
  f_classe   = round(fifelse(i_len > 0, i_cls / i_len, NA_real_), 4),
  f_genero   = round(fifelse(i_w > 0, i_gen / i_w, NA_real_), 4),
  excl
)]
setorder(fish_func_year, site_id, year)

# Cobertura e procedencia, medidas sobre TODOS os individuos -- o painel as cita
# em vez de repetir numeros fixos.
ind_t  <- sum(fx$ab)
pct    <- function(x) round(100 * x / ind_t, 3)
via_ab <- fx[, .(p = sum(ab)), by = via_ab]
via_tl <- fx[, .(p = sum(ab)), by = via_tl]
via_nm <- fx[, .(p = sum(ab)), by = via_nome]
niv_db <- fx[via_ab == "especie", .(p = sum(ab)), by = nivel_ab]
pv <- function(t, k, col) { v <- t[t[[col]] == k, p]; if (length(v)) v else 0 }
fish_func_meta <- data.table(
  chave = c("ind_total",
            "ab_especie", "ab_genero", "ab_nenhum",
            "tl_especie", "tl_genero", "tl_nenhum",
            "nome_sinonimo", "nome_subespecie",
            "db_especie", "db_genero", "db_familia",
            "ct_classe", "ct_invalido",
            "excl_ocorr", "excl_ind", "excl_razao"),
  valor = c(ind_t,
            pct(pv(via_ab, "especie", "via_ab")), pct(pv(via_ab, "genero", "via_ab")),
            pct(pv(via_ab, "nenhum", "via_ab")),
            pct(pv(via_tl, "especie", "via_tl")), pct(pv(via_tl, "genero", "via_tl")),
            pct(pv(via_tl, "nenhum", "via_tl")),
            pct(pv(via_nm, "sinonimo", "via_nome")), pct(pv(via_nm, "subespecie", "via_nome")),
            # nivel DENTRO do banco, em % dos individuos com a,b de especie
            round(100 * pv(niv_db, "species", "nivel_ab") / sum(niv_db$p), 2),
            round(100 * pv(niv_db, "genus",   "nivel_ab") / sum(niv_db$p), 2),
            round(100 * pv(niv_db, "family",  "nivel_ab") / sum(niv_db$p), 2),
            round(100 * sum(fx$ab[fx$ct_ok & fx$ct_classe]) / sum(fx$ab[fx$ct_ok]), 3),
            pct(sum(fx$ab[is.na(fx$ct)])),
            sum(fx$excl), sum(fx$ab[fx$excl]), CT_MAX_RAZAO)
)

stopifnot(
  "funcao: abundancia nao fecha com fish_site_year" =
    sum(fish_func_year$ind) == sum(fish_site_year$total_abundance),
  "funcao: sitio-anos divergem de fish_site_year" =
    nrow(fish_func_year) == nrow(fish_site_year),
  "funcao: peso negativo" = all(fish_func_year$bio_census >= 0, na.rm = TRUE),
  "funcao: comprimento com cobertura baixa" = fish_func_meta[chave == "ct_invalido", valor] < 0.1,
  "funcao: a,b com cobertura baixa" = fish_func_meta[chave == "ab_nenhum", valor] < 2,
  "funcao: nivel trofico fora de [1, 5.5]" =
    all(fish_func_year$tl_ab >= 1 & fish_func_year$tl_ab <= 5.5, na.rm = TRUE)
)
msg("funcao: %d sitio-anos | a,b: %.1f%% especie + %.1f%% genero, %.2f%% sem | TL: %.1f%% + %.1f%%, %.2f%% sem",
    nrow(fish_func_year),
    fish_func_meta[chave == "ab_especie", valor], fish_func_meta[chave == "ab_genero", valor],
    fish_func_meta[chave == "ab_nenhum", valor],
    fish_func_meta[chave == "tl_especie", valor], fish_func_meta[chave == "tl_genero", valor],
    fish_func_meta[chave == "tl_nenhum", valor])
msg("         biomassa por censo (kg/40 m2): mediana %.2f, p90 %.2f, max %.1f | tamanho medio: mediana %.1f cm | TL: mediana %.2f",
    median(fish_func_year$bio_census, na.rm = TRUE), quantile(fish_func_year$bio_census, .9, na.rm = TRUE),
    max(fish_func_year$bio_census, na.rm = TRUE), median(fish_func_year$len_mean, na.rm = TRUE),
    median(fish_func_year$tl_ab, na.rm = TRUE))

## ---- 4d. Funcao por TAXON ----------------------------------------------------
## Mesmas regras do bloco 4c (`ct_ok`, `tem_w`), agora por sitio-ano x especie e
## por sitio-ano x familia, para que biomassa, tamanho e nivel trofico possam ser
## vistos nas especies e familias que a pessoa escolhe.
##
##   bio_kg    kg TOTAIS do taxon no sitio-ano (o front divide pelo esforco, como
##             faz com a abundancia). NA quando nenhum individuo tem peso.
##   len_mean  comprimento medio dos individuos do taxon. So existe onde o taxon
##             foi visto: ausencia nao e tamanho zero, e o front trata assim.
##   tl_mean   nivel trofico medio da familia, ponderado pela abundancia. Para uma
##             ESPECIE o nivel trofico e um traco fixo, sem serie no tempo.
agrega_taxon <- function(dt, chave) {
  dt[!is.na(get(chave)) & get(chave) != "", .(
    bio_g    = sum(ab[tem_w] * w_g[tem_w]),
    i_w      = sum(ab[tem_w]),
    len_soma = sum(ab[ct_ok] * ct[ct_ok]),
    i_len    = sum(ab[ct_ok]),
    tl_soma  = sum(ab[!is.na(tl)] * tl[!is.na(tl)]),
    i_tl     = sum(ab[!is.na(tl)])
  ), by = c("site_id", "year", chave)]
}
acabamento <- function(x, com_tl) {
  # Casas decimais no limite do que a medida sustenta: o CT e medido em ~1 cm e o
  # peso e estimado, entao 0,1 g ou 0,01 cm seriam precisao falsa -- e custavam
  # 118 KB gzip a mais nas duas tabelas.
  x[, `:=`(bio_kg   = round(fifelse(i_w > 0, bio_g / 1000, NA_real_), 3),
           len_mean = round(fifelse(i_len > 0, len_soma / i_len, NA_real_), 1))]
  if (com_tl) x[, tl_mean := round(fifelse(i_tl > 0, tl_soma / i_tl, NA_real_), 2)]
  x[, c("bio_g", "i_w", "len_soma", "i_len", "tl_soma", "i_tl") := NULL]
  x
}

## Vao em tabelas PROPRIAS, nao em colunas de `fish_comp` e `fish_year_sp`: essas
## duas carregam ao abrir o Eixo 1, e as colunas funcionais engordavam as duas em
## ~94 KB gzip para quem nunca escolhe biomassa, tamanho ou nivel trofico. Assim o
## custo so aparece quando a metrica e escolhida. A chave (sitio, ano, taxon) e a
## mesma, e o front junta no navegador.
fish_func_fam <- acabamento(agrega_taxon(fx, "fam"), TRUE)
setnames(fish_func_fam, "fam", "family")
fish_func_sp  <- acabamento(agrega_taxon(fx[entrada %in% top_sp], "entrada"), FALSE)
setnames(fish_func_sp, "entrada", "species")
setorder(fish_func_fam, site_id, year, family)
setorder(fish_func_sp,  site_id, year, species)

# Conferencia: mesmas chaves das tabelas de abundancia (nenhuma linha a mais ou a
# menos), e a biomassa somada por familia fecha com a das ocorrencias que TEM
# familia. Divergir aqui significa que a agregacao perdeu ou duplicou linhas.
bio_fam_esperada <- fx[tem_w & !is.na(fam) & fam != "", sum(ab * w_g)] / 1000
stopifnot(
  "chaves de familia diferem de fish_comp" =
    nrow(fish_func_fam) == nrow(fish_comp) &&
    nrow(merge(fish_func_fam[, .(site_id, year, family)], fish_comp[, .(site_id, year, family)],
               by = c("site_id", "year", "family"))) == nrow(fish_comp),
  # fish_year_sp guarda tambem as linhas SEM nome de especie (NA); taxon sem nome
  # nao tem biomassa nem tamanho de ninguem, entao fica fora do lado funcional.
  "chaves de especie diferem de fish_year_sp" =
    nrow(fish_func_sp) == nrow(fish_year_sp[!is.na(species) & species != ""]) &&
    nrow(merge(fish_func_sp[, .(site_id, year, species)],
               fish_year_sp[!is.na(species) & species != "", .(site_id, year, species)],
               by = c("site_id", "year", "species"))) == nrow(fish_func_sp),
  "biomassa por familia nao fecha com as ocorrencias" =
    abs(sum(fish_func_fam$bio_kg, na.rm = TRUE) - bio_fam_esperada) < 2,
  "nivel trofico de familia fora de [1, 5.5]" =
    all(fish_func_fam$tl_mean >= 1 & fish_func_fam$tl_mean <= 5.5, na.rm = TRUE),
  "comprimento medio de especie fora de (0, 250]" =
    all(fish_func_sp$len_mean > 0 & fish_func_sp$len_mean <= 250, na.rm = TRUE)
)
msg("por taxon: %d linhas de familia (%d com peso), %d de especie (%d com peso)",
    nrow(fish_func_fam), sum(!is.na(fish_func_fam$bio_kg)),
    nrow(fish_func_sp), sum(!is.na(fish_func_sp$bio_kg)))

## ---- 4b. Agregados por AREA (estado e UC) -----------------------------------
## Riqueza NAO e somavel: a riqueza de um estado e o numero de especies
## DISTINTAS entre os sitios dele, nao a soma das riquezas de cada sitio.
## Por isso estes agregados saem daqui, das ocorrencias, e nao de uma conta
## feita no navegador sobre a tabela por sitio.
occ_area <- merge(occ, sitios[, .(site_id, uf)], by = "site_id")

por_area <- function(dados, chave) {
  esforco <- merge(censos[, .(site_id, eventID)], sitios[, .(site_id, uf)], by = "site_id")
  esforco <- if (chave == "uf") esforco[, .(n_events = .N, n_sites = uniqueN(site_id)), by = uf]
             else NULL
  a <- dados[, .(richness = uniqueN(sp),
                 n_families = uniqueN(fam[!is.na(fam) & fam != ""]),
                 total_abundance = sum(ab)), by = c(chave)]
  if (!is.null(esforco)) a <- merge(a, esforco, by = chave)
  a[, mean_abundance := total_abundance / n_events]
  a[]
}

fish_by_uf <- por_area(occ_area, "uf")
fish_by_uf <- merge(fish_by_uf, unique(sitios[, .(uf, uf_nome)]), by = "uf")

# Um sitio pode cair em mais de uma UC (APA grande com parque dentro), entao a
# juncao e intencionalmente de um-para-muitos: o mesmo censo conta para as
# duas UCs que o contem, que e a leitura correta de "o que ha nesta UC".
occ_uc <- merge(occ, site_uc[, .(site_id, cd_cnuc, nome_uc)],
                by = "site_id", allow.cartesian = TRUE)
esf_uc <- merge(censos[, .(site_id, eventID)], site_uc[, .(site_id, cd_cnuc)],
                by = "site_id", allow.cartesian = TRUE)[
                , .(n_events = .N, n_sites = uniqueN(site_id)), by = cd_cnuc]
fish_by_uc <- occ_uc[, .(richness = uniqueN(sp),
                         n_families = uniqueN(fam[!is.na(fam) & fam != ""]),
                         total_abundance = sum(ab)), by = .(cd_cnuc, nome_uc)]
fish_by_uc <- merge(fish_by_uc, esf_uc, by = "cd_cnuc")
fish_by_uc[, mean_abundance := total_abundance / n_events]

# Especies mais abundantes de cada area, para o perfil. 12 por area: o painel
# mostra 4 com foto e lista o resto.
TOP_POR_AREA <- 12
sp_uf <- occ_area[, .(abundance = sum(ab), n_sites = uniqueN(site_id)),
                  by = .(uf, species = sp, family = fam)]
sp_uf[, pct := 100 * abundance / sum(abundance), by = uf]
setorder(sp_uf, uf, -abundance)
fish_sp_by_uf <- sp_uf[, head(.SD, TOP_POR_AREA), by = uf]

sp_uc <- occ_uc[, .(abundance = sum(ab), n_sites = uniqueN(site_id)),
                by = .(cd_cnuc, species = sp, family = fam)]
sp_uc[, pct := 100 * abundance / sum(abundance), by = cd_cnuc]
setorder(sp_uc, cd_cnuc, -abundance)
fish_sp_by_uc <- sp_uc[, head(.SD, TOP_POR_AREA), by = cd_cnuc]

# E por sitio, para o perfil de sitio na escala nacional.
sp_site <- occ[, .(abundance = sum(ab)), by = .(site_id, species = sp, family = fam)]
setorder(sp_site, site_id, -abundance)
fish_sp_by_site <- sp_site[, head(.SD, 6), by = site_id]

msg("por area: %d estados, %d UCs | especies: %d por estado, %d por UC, %d por sitio",
    nrow(fish_by_uf), nrow(fish_by_uc),
    nrow(fish_sp_by_uf), nrow(fish_sp_by_uc), nrow(fish_sp_by_site))

stopifnot(
  "riqueza por estado maior que a riqueza total" =
    max(fish_by_uf$richness) <= uniqueN(occ$sp),
  "esforco por estado nao bate com o total" =
    sum(fish_by_uf$n_events) == nrow(censos)
)

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
                            uf, uf_nome, dist_uf_km, n_censos, ano_min, ano_max)],
  fish_by_uf   = fish_by_uf,
  fish_by_uc   = fish_by_uc,
  fish_sp_by_uf   = fish_sp_by_uf,
  fish_sp_by_uc   = fish_sp_by_uc,
  fish_sp_by_site = fish_sp_by_site,
  site_uc      = site_uc,
  fish_site_year = fish_site_year,
  fish_summary   = fish_summary,
  fish_comp      = fish_comp,
  fish_year_sp   = fish_year_sp,
  fish_func_year = fish_func_year,
  fish_func_meta = fish_func_meta,
  fish_func_fam  = fish_func_fam,
  fish_func_sp   = fish_func_sp
), OUT)

msg("")
msg("gravado %s", OUT)
msg("  %d sitios · %d regioes · %d censos · %d especies · %d-%d",
    nrow(sitios), uniqueN(sitios$region), nrow(censos), uniqueN(occ$sp),
    min(censos$year), max(censos$year))
