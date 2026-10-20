## Baixa a malha estadual do geobr uma vez e grava em
## data/estados_costeiros.gpkg. Os scripts de extracao leem desse arquivo:
## chamar geobr::read_state() em cada um corrompia o cache dele quando dois
## rodavam perto um do outro ("File cached locally seems to be corrupted").
suppressMessages({ library(sf); library(geobr) })
COSTEIROS <- c("AP","PA","MA","PI","CE","RN","PB","PE","AL","SE",
               "BA","ES","RJ","SP","PR","SC","RS")
uf <- st_transform(read_state(year = 2020, showProgress = FALSE), 4326)
uf <- uf[uf$abbrev_state %in% COSTEIROS, c("abbrev_state", "name_state")]
names(uf)[1:2] <- c("uf", "uf_nome")
dir.create("data", showWarnings = FALSE)
st_write(uf, "data/estados_costeiros.gpkg", delete_dsn = TRUE, quiet = TRUE)
cat(sprintf("gravado: %d estados, %.0f KB\n", nrow(uf),
            file.size("data/estados_costeiros.gpkg") / 1024))
