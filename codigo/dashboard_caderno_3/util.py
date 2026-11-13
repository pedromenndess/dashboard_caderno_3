"""Utilitários seguros para caminhos, hashes e serialização."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import pandas as pd


def garantir_destino_interno(caminho: Path, raiz_projeto: Path) -> Path:
    """Impede qualquer gravação fora da raiz do dashboard."""
    destino = caminho.resolve()
    raiz = raiz_projeto.resolve()
    if not destino.is_relative_to(raiz):
        raise ValueError(f"Saída fora do dashboard bloqueada: {destino}")
    return destino


def garantir_origem_interna(caminho: Path, raiz_origem: Path) -> Path:
    """Impede que um caminho de origem escape da raiz configurada."""
    origem = caminho.resolve()
    raiz = raiz_origem.resolve()
    if not origem.is_relative_to(raiz):
        raise ValueError(f"Origem fora do Caderno 3 bloqueada: {origem}")
    return origem


def sha256_arquivo(caminho: Path, bloco: int = 1024 * 1024) -> str:
    """Calcula SHA-256 de um arquivo sem carregá-lo integralmente na memória."""
    resumo = hashlib.sha256()
    with caminho.open("rb") as entrada:
        for trecho in iter(lambda: entrada.read(bloco), b""):
            resumo.update(trecho)
    return resumo.hexdigest()


def normalizar_codigo_ibge(serie: pd.Series) -> pd.Series:
    """Preserva códigos municipais como texto de sete caracteres."""
    return (
        serie.astype("string")
        .str.strip()
        .str.replace(r"\.0$", "", regex=True)
        .str.zfill(7)
    )


def nome_tecnico(valor: Any) -> str:
    """Converte um rótulo editorial em nome técnico estável."""
    texto = unicodedata.normalize("NFKD", str(valor))
    texto = "".join(caractere for caractere in texto if not unicodedata.combining(caractere))
    texto = re.sub(r"[^a-zA-Z0-9]+", "_", texto).strip("_").lower()
    return texto


def escrever_json(caminho: Path, conteudo: Any, raiz_projeto: Path) -> None:
    """Escreve JSON UTF-8 somente dentro do dashboard."""
    destino = garantir_destino_interno(caminho, raiz_projeto)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps(conteudo, ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf-8",
    )


def registros_json(dataframe: pd.DataFrame) -> list[dict[str, Any]]:
    """Converte DataFrame em registros JSON válidos, substituindo ausências por null."""
    seguro = dataframe.astype(object).where(pd.notna(dataframe), None)
    return seguro.to_dict(orient="records")
