"""Validações técnicas do pacote próprio do dashboard."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

from dashboard_caderno_3.config import RAIZ_PROJETO, carregar_configuracao, versao_dados
from dashboard_caderno_3.util import escrever_json, sha256_arquivo


def _ler_csv(relativo: str) -> pd.DataFrame:
    arquivo = RAIZ_PROJETO / "dados" / "preparados" / relativo
    return pd.read_csv(arquivo, dtype={"codigo_ibge": "string"})


def _validar_universo(
    dados: pd.DataFrame,
    esperado: int,
    nome: str,
    *,
    chaves: list[str],
) -> None:
    if dados.duplicated(chaves).any():
        raise ValueError(f"Duplicidades em {nome} para as chaves {chaves}.")
    municipios = dados["codigo_ibge"].nunique()
    if municipios != esperado:
        raise ValueError(f"{nome}: esperados {esperado} municípios; encontrados {municipios}.")


def validar_pacote(caminho_config: Path | None = None) -> dict[str, Any]:
    """Confere cobertura, chaves, períodos, escalas e vínculo geográfico."""
    configuracao = carregar_configuracao(caminho_config)
    versao = versao_dados(configuracao)
    esperado = int(configuracao["projeto"]["municipios_esperados"])

    municipios = _ler_csv("municipios.csv")
    ivel = _ler_csv("ivel/ivel_municipal_2025.csv")
    continuidade = _ler_csv("qualidade/continuidade_municipal.csv")
    inclusao = _ler_csv("tarifa/inclusao_tarifaria_municipal.csv")
    dependencia = _ler_csv("tarifa/dependencia_tarifaria_municipal.csv")
    indicadores = _ler_csv("indicadores_municipais.csv")
    geografia = gpd.read_file(
        RAIZ_PROJETO
        / "dados"
        / "preparados"
        / "geografia"
        / "municipios_pi.geojson"
    )

    manifesto_importacao = RAIZ_PROJETO / "dados" / "controle_importacao.json"
    manifesto = json.loads(manifesto_importacao.read_text(encoding="utf-8"))
    raiz_origem = Path(configuracao["origem"]["caderno_3"]).resolve()
    fonte_externa_disponivel = raiz_origem.is_dir()
    for item in manifesto["arquivos"]:
        origem = raiz_origem / item["origem_relativa"]
        copia = RAIZ_PROJETO / item["destino_relativo"]
        hash_esperado = item["sha256"]
        if fonte_externa_disponivel and sha256_arquivo(origem) != hash_esperado:
            raise ValueError(f"A fonte mudou após a importação: {origem}")
        if sha256_arquivo(copia) != hash_esperado:
            raise ValueError(f"A cópia importada perdeu integridade: {copia}")

    _validar_universo(municipios, esperado, "municípios", chaves=["codigo_ibge"])
    _validar_universo(ivel, esperado, "IVEL", chaves=["codigo_ibge"])
    _validar_universo(
        continuidade,
        esperado,
        "continuidade",
        chaves=["codigo_ibge", "ano"],
    )
    _validar_universo(
        inclusao,
        esperado,
        "inclusão tarifária",
        chaves=["codigo_ibge", "ano"],
    )
    _validar_universo(
        dependencia,
        esperado,
        "dependência tarifária",
        chaves=["codigo_ibge", "ano"],
    )
    _validar_universo(
        indicadores,
        esperado,
        "indicadores municipais",
        chaves=["codigo_ibge", "indicador_id", "periodo"],
    )

    if len(geografia) != esperado or geografia["codigo_ibge"].nunique() != esperado:
        raise ValueError("A geografia não contém exatamente os 224 municípios esperados.")
    if set(geografia["codigo_ibge"]) != set(municipios["codigo_ibge"]):
        raise ValueError("Os códigos da geografia diferem do cadastro municipal.")

    colunas_escala_ivel = [
        "qualidade_servico",
        "insuficiencia_renda",
        "dependencia_tarifaria_ivel",
        "ivel_2025",
    ]
    for coluna in colunas_escala_ivel:
        if not ivel[coluna].between(0, 100, inclusive="both").all():
            raise ValueError(f"Valores fora da escala 0–100 em {coluna}.")

    referencia_continuidade = continuidade.drop_duplicates("codigo_ibge")
    if referencia_continuidade["continuidade_d2_referencia"].isna().any():
        raise ValueError("Há municípios sem D2 de referência.")
    if not referencia_continuidade["continuidade_d2_referencia"].between(
        0,
        100,
        inclusive="both",
    ).all():
        raise ValueError("Valores fora da escala 0–100 no D2 de referência.")

    anos_esperados = {2023, 2024, 2025}
    for nome, dados in {
        "continuidade": continuidade,
        "inclusão tarifária": inclusao,
        "dependência tarifária": dependencia,
    }.items():
        if set(dados["ano"].astype(int)) != anos_esperados:
            raise ValueError(f"Períodos inesperados em {nome}.")

    relatorio = {
        "versao": versao,
        "status": "aprovado",
        "fonte_externa_disponivel": fonte_externa_disponivel,
        "municipios": esperado,
        "linhas": {
            "ivel": len(ivel),
            "continuidade": len(continuidade),
            "inclusao_tarifaria": len(inclusao),
            "dependencia_tarifaria": len(dependencia),
            "indicadores_municipais": len(indicadores),
            "geografia": len(geografia),
        },
        "periodos_municipais": [2023, 2024, 2025],
        "checagens": [
            "chaves únicas",
            "224 municípios",
            "códigos IBGE com sete caracteres",
            "períodos esperados",
            "escala do IVEL entre 0 e 100",
            "D2 de referência completo e entre 0 e 100",
            "correspondência integral com a geografia",
            (
                "hashes idênticos entre fontes e cópias importadas"
                if fonte_externa_disponivel
                else "hashes das cópias importadas idênticos ao manifesto"
            ),
        ],
    }
    escrever_json(
        RAIZ_PROJETO / "dados" / "controle_validacao.json",
        relatorio,
        RAIZ_PROJETO,
    )
    escrever_json(
        RAIZ_PROJETO / "site" / "dados" / "metadados" / "validacao.json",
        relatorio,
        RAIZ_PROJETO,
    )
    return relatorio
