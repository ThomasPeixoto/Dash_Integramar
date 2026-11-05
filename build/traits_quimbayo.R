## =============================================================================
## Traços funcionais de peixes recifais (Quimbayo et al. 2021, Ecology e03298)
## =============================================================================
##
## Liga os nomes do ReefSYN ao banco de traços e devolve, para cada ocorrência,
## o que o painel precisa: coeficientes de peso-comprimento (a, b), nível
## trófico e tamanho máximo da espécie.
##
## Nada aqui altera o banco nem o ReefSYN: as decisões são de COMO LIGAR um nome
## ao outro, cada uma registrada em `via_*` para que o painel diga de onde veio
## cada número.
##
## Ordem de resolução do nome (a primeira que casar):
##   especie     o nome casa exatamente com `Name` do banco
##   subespecie  trinômio sem correspondência -> binômio nominal
##   sinonimo    tabela SINONIMOS abaixo (revisada à mão)
##   genero      só o gênero existe no banco -> mediana dos congêneres
##   nenhum      sem ligação: fica fora do peso e do nível trófico
##
## "Casar o nome exato primeiro" não é detalhe: o próprio banco tem trinômios
## (Chilomycterus spinosus spinosus, Stegastes fuscus trindadensis). Colapsar
## subespécies ANTES de casar perde justamente esses.
## =============================================================================

suppressMessages(library(data.table))

TRAITS_CSV <- "data/traits/quimbayo2021_fish_traits.csv"

## Sinônimos entre o nome aceito no ReefSYN e o nome usado no banco (que segue o
## Catalog of Fishes de 2020). Critério de entrada: mesmo epíteto E mesma
## família. Casar só pelo epíteto gera ruído demais (Haemulon atlanticus não é
## Megalops atlanticus). Cada linha foi conferida individualmente.
SINONIMOS <- data.table(
  nome_reefsyn = c("Azurina multilineata", "Caranx bartholomaei",
                   "Brachygenys chrysargyreum", "Paradiplogrammus bairdi",
                   "Haemulon atlanticus"),
  nome_traits  = c("Chromis multilineata", "Carangoides bartholomaei",
                   "Haemulon chrysargyreum", "Callionymus bairdi",
                   "Emmelichthyops atlanticus"),
  motivo       = c("Azurina foi revalidado; mesmo epíteto, Pomacentridae",
                   "Carangoides bartholomaei é sinônimo de Caranx bartholomaei",
                   "Brachygenys é a combinação recente de Haemulon chrysargyreum",
                   "Paradiplogrammus bairdi = Callionymus bairdi (Callionymidae)",
                   "CONFIRMAR: mesmo epíteto e família (Haemulidae); único atlanticus da família no banco")
)

## Razão acima da qual um comprimento medido é tratado como erro de registro.
## Medido no ReefSYN: 3,2% dos indivíduos passam do tamanho máximo da espécie
## (erro de estimativa visual, normal); só 0,026% passam de 2x. Esses são
## impossíveis -- um Stegastes fuscus (máx. 12,6 cm) com CT = 120 cm pesava 788
## kg sozinho, numa série cujo censo típico pesa poucos kg. Como o peso cresce
## com o cubo do comprimento, um único erro assim domina o sítio-ano inteiro.
CT_MAX_RAZAO <- 2

ler_traits <- function(caminho = TRAITS_CSV) {
  q <- fread(caminho, sep = ";", dec = ",", na.strings = c("NA", ""),
             encoding = "Latin-1")
  q[, .(nome    = trimws(Name),
        genero  = sub(" .*", "", trimws(Name)),
        a       = Allometric_a,
        b       = Allometric_b,
        nivel_ab = Level_length_weight,
        tl      = Trophic_level,
        tmax    = Body_size_max)]
}

## Resolve nomes do ReefSYN para nomes do banco.
## Devolve uma linha por nome DISTINTO de entrada.
resolver_nomes <- function(nomes, tr) {
  u <- unique(nomes)
  r <- data.table(entrada = u, nome_res = NA_character_, via_nome = "nenhum",
                  genero = NA_character_)

  ## 1. nome exato
  r[entrada %in% tr$nome, `:=`(nome_res = entrada, via_nome = "especie")]

  ## 2. trinômio -> binômio nominal (só quando o trinômio não existe no banco)
  falta <- r[via_nome == "nenhum" & !is.na(entrada) &
             grepl("^\\S+ \\S+ \\S+", entrada)]
  if (nrow(falta)) {
    bin <- sub("^(\\S+ \\S+) .*$", "\\1", falta$entrada)
    ok  <- bin %in% tr$nome
    r[entrada %in% falta$entrada[ok], `:=`(
      nome_res = bin[ok][match(entrada, falta$entrada[ok])], via_nome = "subespecie")]
  }

  ## 3. sinônimo revisado
  s <- SINONIMOS[nome_traits %in% tr$nome]
  r[via_nome == "nenhum" & entrada %in% s$nome_reefsyn,
    c("nome_res", "via_nome") := .(s$nome_traits[match(entrada, s$nome_reefsyn)], "sinonimo")]

  ## 4. gênero: nome de uma palavra, ou binômio ausente cujo gênero existe
  r[via_nome == "nenhum" & !is.na(entrada), genero := sub(" .*", "", entrada)]
  r[via_nome == "nenhum" & !(genero %in% tr$genero), genero := NA_character_]
  r[via_nome == "nenhum" & !is.na(genero), via_nome := "genero"]
  r[via_nome %in% c("especie", "subespecie", "sinonimo"),
    genero := sub(" .*", "", nome_res)]
  r
}

## Coeficientes e traço por ocorrência.
##   ocorr  data.table com `entrada` (nome) e `ct` (cm)
## Devolve as mesmas linhas com: w_g (peso individual, g), tl, tmax_ref, via_ab, via_tl.
##
## Peso: espécie quando o banco tem a e b; senão a MEDIANA, entre os congêneres,
## do peso previsto NAQUELE comprimento. Nunca se faz média de `a` e `b`
## separados: os dois são fortemente correlacionados (a alto vem com b baixo) e
## a média dos pares não descreve nenhum peixe.
aplicar_traits <- function(ocorr, tr) {
  rs <- resolver_nomes(ocorr$entrada, tr)
  x  <- merge(ocorr, rs, by = "entrada", all.x = TRUE, sort = FALSE)
  x  <- merge(x, tr[, .(nome_res = nome, a, b, nivel_ab, tl, tmax)],
              by = "nome_res", all.x = TRUE, sort = FALSE)

  tem_ab <- !is.na(x$a) & !is.na(x$b)
  x[, via_ab := fifelse(tem_ab, "especie", "nenhum")]
  x[, via_tl := fifelse(!is.na(tl), "especie", "nenhum")]
  x[, w_g := fifelse(tem_ab & !is.na(ct), a * ct^b, NA_real_)]
  x[, tmax_ref := tmax]

  ## Fallback de gênero: para toda linha SEM a,b (ou sem tl) cujo gênero existe.
  gen <- unique(x[!is.na(genero) & (via_ab == "nenhum" | via_tl == "nenhum"), genero])
  if (length(gen)) {
    cong_ab <- split(tr[genero %in% gen & !is.na(a) & !is.na(b), .(genero, a, b)],
                     by = "genero", keep.by = FALSE)
    tl_gen  <- tr[genero %in% gen & !is.na(tl), .(tl_g = median(tl)), by = genero]
    tmax_g  <- tr[genero %in% gen & !is.na(tmax), .(tmax_g = max(tmax)), by = genero]

    pend_ab <- x[via_ab == "nenhum" & !is.na(genero) & !is.na(ct), .(genero, ct)]
    if (nrow(pend_ab)) {
      k <- unique(pend_ab)
      k[, w_fb := mapply(function(g, l) {
        cg <- cong_ab[[g]]
        if (is.null(cg)) NA_real_ else median(cg$a * l^cg$b)
      }, genero, ct)]
      x <- merge(x, k, by = c("genero", "ct"), all.x = TRUE, sort = FALSE)
      usa <- x$via_ab == "nenhum" & !is.na(x$w_fb)
      x[usa, `:=`(w_g = w_fb, via_ab = "genero")]
      x[, w_fb := NULL]
    }
    x <- merge(x, tl_gen, by = "genero", all.x = TRUE, sort = FALSE)
    x[via_tl == "nenhum" & !is.na(tl_g), `:=`(tl = tl_g, via_tl = "genero")]
    x[, tl_g := NULL]
    x <- merge(x, tmax_g, by = "genero", all.x = TRUE, sort = FALSE)
    x[is.na(tmax_ref), tmax_ref := tmax_g]
    x[, tmax_g := NULL]
  }
  x
}

## Conferências que travam o build se a resolução mudar de comportamento.
testar_resolucao <- function(tr) {
  r <- resolver_nomes(c("Azurina multilineata", "Diplodus argenteus argenteus",
                        "Chilomycterus spinosus spinosus", "Kyphosus",
                        "Clupeidae", "Haemulon aurolineatum", NA), tr)
  g <- function(n) r[entrada == n, via_nome]
  stopifnot(
    "sinonimo Azurina -> Chromis falhou"  = identical(g("Azurina multilineata"), "sinonimo"),
    "trinomio ausente nao colapsou"       = identical(g("Diplodus argenteus argenteus"), "subespecie"),
    "trinomio PRESENTE foi colapsado"     = identical(g("Chilomycterus spinosus spinosus"), "especie"),
    "genero sem especie nao caiu em gênero" = identical(g("Kyphosus"), "genero"),
    "familia nao deveria ter ligacao"     = identical(g("Clupeidae"), "nenhum"),
    "especie exata falhou"                = identical(g("Haemulon aurolineatum"), "especie")
  )
  invisible(TRUE)
}
