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
