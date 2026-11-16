"""Carregamento centralizado da configuração do projeto."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any

RAIZ_PROJETO = Path(__file__).resolve().parents[2]
ARQUIVO_CONFIG_PADRAO = RAIZ_PROJETO / "configuracao" / "fontes.toml"


def carregar_configuracao(caminho: Path | None = None) -> dict[str, Any]:
    """Carrega a configuração TOML sem modificar o arquivo."""
    arquivo = (caminho or ARQUIVO_CONFIG_PADRAO).resolve()
    with arquivo.open("rb") as entrada:
        return tomllib.load(entrada)


def versao_dados(configuracao: dict[str, Any]) -> str:
    """Retorna a versão declarada para o pacote de dados."""
    return str(configuracao["projeto"]["versao_dados"])


def resolver_raiz_caderno_3(configuracao: dict[str, Any]) -> Path:
    """Usa o primeiro mapeamento disponível da origem, sem escrever nele."""
    origem = configuracao["origem"]
    candidatos = [origem["caderno_3"], *origem.get("caderno_3_alternativos", [])]
    caminhos = [Path(candidato).resolve() for candidato in candidatos]
    return next((caminho for caminho in caminhos if caminho.is_dir()), caminhos[0])
