"""Importação seletiva e versionada de fontes do Caderno 3."""

from __future__ import annotations

import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from dashboard_caderno_3.config import RAIZ_PROJETO, carregar_configuracao, versao_dados
from dashboard_caderno_3.util import (
    escrever_json,
    garantir_destino_interno,
    garantir_origem_interna,
    sha256_arquivo,
)

LOGGER = logging.getLogger(__name__)


def importar_fontes(
    caminho_config: Path | None = None,
    *,
    sobrescrever: bool = False,
) -> dict[str, Any]:
    """Copia somente fontes declaradas, sem escrever no Caderno 3."""
    configuracao = carregar_configuracao(caminho_config)
    versao = versao_dados(configuracao)
    raiz_origem = Path(configuracao["origem"]["caderno_3"]).resolve()
    if not raiz_origem.is_dir():
        raise FileNotFoundError(f"Caderno 3 não encontrado: {raiz_origem}")

    raiz_destino = garantir_destino_interno(
        RAIZ_PROJETO / "dados" / "origem",
        RAIZ_PROJETO,
    )
    itens_manifesto: list[dict[str, Any]] = []

    for item in configuracao["arquivos"]:
        origem = garantir_origem_interna(raiz_origem / item["origem"], raiz_origem)
        destino = garantir_destino_interno(raiz_destino / item["destino"], RAIZ_PROJETO)

        if not origem.is_file():
            raise FileNotFoundError(f"Fonte declarada não encontrada: {origem}")

        hash_origem = sha256_arquivo(origem)
        acao = "copiado"
        if destino.exists():
            hash_destino_atual = sha256_arquivo(destino)
            if hash_destino_atual == hash_origem:
                acao = "mantido"
            elif not sobrescrever:
                raise FileExistsError(
                    f"O destino já existe com conteúdo diferente: {destino}. "
                    "Use uma nova versão de dados ou --sobrescrever."
                )

        deve_copiar = acao == "copiado" or (
            sobrescrever and destino.exists() and sha256_arquivo(destino) != hash_origem
        )
        if deve_copiar:
            destino.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(origem, destino)
            if sha256_arquivo(destino) != hash_origem:
                raise OSError(f"Falha de integridade após a cópia: {destino}")
            acao = "copiado"

        LOGGER.info("%s: %s", acao, item["id"])
        itens_manifesto.append(
            {
                "id": item["id"],
                "grupo": item["grupo"],
                "origem_relativa": item["origem"],
                "destino_relativo": str(destino.relative_to(RAIZ_PROJETO)).replace("\\", "/"),
                "tamanho_bytes": origem.stat().st_size,
                "sha256": hash_origem,
                "acao": acao,
            }
        )

    manifesto = {
        "versao": versao,
        "data_importacao": datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(),
        "origem": str(raiz_origem),
        "politica": "somente leitura na origem; cópia seletiva e versionada",
        "quantidade_arquivos": len(itens_manifesto),
        "arquivos": itens_manifesto,
    }
    escrever_json(
        RAIZ_PROJETO / "dados" / "controle_importacao.json",
        manifesto,
        RAIZ_PROJETO,
    )
    return manifesto
