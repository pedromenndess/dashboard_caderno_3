"""Preparação da geografia municipal para os mapas interativos."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

from dashboard_caderno_3.config import RAIZ_PROJETO, carregar_configuracao, versao_dados
from dashboard_caderno_3.util import garantir_destino_interno, normalizar_codigo_ibge


def preparar_geografia(caminho_config: Path | None = None) -> dict[str, Any]:
    """Converte a malha importada em GeoJSON simplificado e próprio do dashboard."""
    configuracao = carregar_configuracao(caminho_config)
    versao = versao_dados(configuracao)
    arquivo_zip = (
        RAIZ_PROJETO
        / "dados"
        / "origem"
        / "geografia"
        / "PI_Municipios_2022.zip"
    )
    arquivo_municipios = RAIZ_PROJETO / "dados" / "preparados" / "municipios.csv"
    if not arquivo_zip.is_file() or not arquivo_municipios.is_file():
        raise FileNotFoundError("Execute importar e transformar antes de preparar a geografia.")

    geografia = gpd.read_file(arquivo_zip)
    geografia = geografia.rename(
        columns={
            "CD_MUN": "codigo_ibge",
            "NM_MUN": "municipio_geografia",
            "AREA_KM2": "area_km2",
        }
    )
    geografia["codigo_ibge"] = normalizar_codigo_ibge(geografia["codigo_ibge"])
    geografia = geografia[["codigo_ibge", "municipio_geografia", "area_km2", "geometry"]]

    municipios = pd.read_csv(arquivo_municipios, dtype={"codigo_ibge": "string"})
    geografia = geografia.merge(municipios, on="codigo_ibge", how="left", validate="one_to_one")
    if geografia["municipio"].isna().any():
        faltantes = geografia.loc[geografia["municipio"].isna(), "codigo_ibge"].tolist()
        raise ValueError(f"Municípios sem vínculo territorial: {faltantes}")

    geografia = geografia.to_crs("EPSG:31983")
    geografia["geometry"] = geografia.geometry.make_valid().simplify(
        tolerance=150,
        preserve_topology=True,
    )
    geografia = geografia.to_crs("EPSG:4326")
    geografia = geografia[
        [
            "codigo_ibge",
            "municipio",
            "territorio_desenvolvimento",
            "area_km2",
            "geometry",
        ]
    ].sort_values("codigo_ibge")

    canonico = garantir_destino_interno(
        RAIZ_PROJETO
        / "dados"
        / "preparados"
        / "geografia"
        / "municipios_pi.geojson",
        RAIZ_PROJETO,
    )
    publico = garantir_destino_interno(
        RAIZ_PROJETO / "site" / "dados" / "geografia" / "municipios_pi.geojson",
        RAIZ_PROJETO,
    )
    canonico.parent.mkdir(parents=True, exist_ok=True)
    publico.parent.mkdir(parents=True, exist_ok=True)
    canonico.write_text(geografia.to_json(drop_id=True), encoding="utf-8")
    shutil.copy2(canonico, publico)

    return {
        "versao": versao,
        "municipios": len(geografia),
        "crs": "EPSG:4326",
        "tolerancia_simplificacao_metros": 150,
        "arquivo_publico": str(publico.relative_to(RAIZ_PROJETO)).replace("\\", "/"),
        "tamanho_bytes": publico.stat().st_size,
    }
