# Traços funcionais de peixes recifais

`quimbayo2021_fish_traits.csv` é o arquivo `Fish_aspects_EasternPacific_Atlantic_Realms.csv`
do material suplementar de:

> Quimbayo, J. P., F. C. Silva, T. C. Mendes, D. S. Ferrari, S. L. Danielski,
> M. G. Bender, V. Parravicini, M. Kulbicki e S. R. Floeter. 2021.
> Life-history traits, geographical range, and conservation aspects of reef
> fishes from the Atlantic and Eastern Pacific. *Ecology* 102(5): e03298.
> https://doi.org/10.1002/ecy.3298 · dados: https://doi.org/10.5281/zenodo.4455016

O arquivo está **como baixado, sem nenhuma alteração** (separador `;`, decimal `,`,
`NA` para ausente). Segundo o artigo, os dados não têm restrição de direitos
autorais para pesquisa ou ensino.

## O que o painel usa

| coluna | uso |
|---|---|
| `Name` | chave de ligação com `scientificNameAccepted` do ReefSYN |
| `Allometric_a`, `Allometric_b` | peso (g) = a · CT(cm)^b |
| `Level_length_weight` | nível taxonômico em que a e b foram compilados (espécie, gênero ou família) |
| `Trophic_level` | nível trófico |
| `Body_size_max` | comprimento total máximo (cm), só para conferir os CT medidos |

## O que o artigo NÃO diz

O suplemento não declara a unidade do peso nem o tipo de comprimento (total, padrão)
a que `a` e `b` se referem. Conferi contra as estimativas do FishBase para as 10
espécies-alvo do relatório de espécies: o peso de um peixe de 30 cm fica entre 0,53× e
1,54× o do FishBase, ou seja, mesma ordem de grandeza — a unidade é g para cm. A
diferença de até ~50% entre as duas fontes é a incerteza que o painel herda.

## Cobertura sobre o ReefSYN

Medida no export (`fish_func_meta` no `core.json`), não fixa neste texto.
