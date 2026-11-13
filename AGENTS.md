# AGENTS.md — Dashboard do Caderno 3

## Finalidade

Este projeto produz um dashboard interativo e independente a partir de resultados selecionados do Caderno 3 do PEEPI.

## Isolamento obrigatório

- Tratar `H:/Meu Drive/SUMER/Caderno_3` exclusivamente como origem de leitura.
- Nunca salvar, mover, renomear ou excluir arquivos dentro do Caderno 3.
- Nunca executar scripts do Caderno 3 a partir deste projeto.
- Toda saída deve permanecer dentro de `dashboard_caderno_3`.
- Importações devem ser explícitas, seletivas, versionadas e acompanhadas de hash SHA-256.

## Dados

- Priorizar resultados aprovados em `05_resultados`.
- Usar `02_dados_intermediarios` apenas quando o produto final não contiver granularidade suficiente para a interação.
- Não copiar pastas inteiras nem bases sem uso definido.
- Preservar códigos IBGE como texto com sete caracteres.
- Validar granularidade, duplicidades, ausências e cobertura dos 224 municípios.
- Não recalcular indicadores analíticos aprovados, especialmente o IVEL, salvo solicitação expressa.

## Código

- Usar português do Brasil nos nomes apresentados ao leitor.
- Organizar o Python como pacote em `codigo/dashboard_caderno_3`.
- Usar `pathlib`, tipagem, logging e funções com responsabilidade única.
- Manter caminhos e seleção de fontes em `configuracao/fontes.toml`.
- Manter o ambiente virtual em `.venv`, fora do Git.
- Executar testes e compilação antes de concluir alterações.

## Publicação

- Dados internos e arquivos importados não devem ser publicados automaticamente.
- O navegador deve consumir apenas arquivos preparados em `site/dados`.
- A pasta `site` deve reunir o HTML e os dados efetivamente publicáveis.
- Mapas interativos usarão GeoJSON simplificado; gráficos interativos usarão dados JSON.
