# Dashboard do Caderno 3

Projeto independente para publicação interativa dos principais resultados do Caderno 3 do PEEPI.

Dashboard publicado: <https://pedromenndess.github.io/dashboard_caderno_3/>

O Caderno 3 é utilizado somente como origem de leitura durante importações explícitas e versionadas. Depois da importação, o dashboard opera exclusivamente com seus próprios dados.

## Organização

```text
dashboard_caderno_3/
├── codigo/          rotinas Python
├── configuracao/    fontes e descrição dos indicadores
├── dados/
│   ├── origem/      cópias selecionadas do Caderno 3
│   └── preparados/  tabelas próprias do dashboard
├── site/            arquivos utilizados pelo navegador
├── testes/          verificações automatizadas
├── .venv/           ambiente virtual local
├── executar.py      comando principal
└── requirements.txt dependências Python
```

O pipeline não importa nem executa scripts do Caderno 3 e nunca grava na pasta de origem.

A versão e a data da importação ficam registradas em `dados/controle_importacao.json`, sem criar uma nova camada de pastas.

## Preparação do ambiente

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Preparação dos dados

```powershell
python executar.py preparar
```

Etapas isoladas:

```powershell
python executar.py importar
python executar.py transformar
python executar.py geografia
python executar.py validar
```

## Validação

```powershell
python -m pytest
python -m compileall -q codigo
```

## Abrir o dashboard

O painel usa arquivos JSON locais e deve ser aberto por um servidor HTTP local:

```powershell
.\.venv\Scripts\python.exe -m http.server 8765 --bind 127.0.0.1 --directory site
```

Depois, acesse `http://127.0.0.1:8765` no navegador. O arquivo HTML não deve ser
aberto diretamente por `file://`, pois o navegador pode bloquear a leitura dos dados.

É possível abrir uma seleção específica pela URL, por exemplo:

```text
http://127.0.0.1:8765/?aba=ivel&municipio=sao%20raimundo%20nonato&ano=2025
```

A busca municipal ignora diferenças de acentuação e de letras maiúsculas e minúsculas.

## Publicação no GitHub Pages

A publicação usa o workflow `.github/workflows/pages.yml`. Cada envio para a
branch `main` publica somente o conteúdo da pasta `site` no GitHub Pages.

As fontes importadas, as bases de trabalho e os controles internos em `dados/`
permanecem fora do Git. Os JSON e GeoJSON efetivamente publicáveis ficam em
`site/dados`.
