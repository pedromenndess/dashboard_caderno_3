"""Construção das bases canônicas que pertencem ao dashboard."""

from __future__ import annotations

import re
import shutil
import tomllib
from pathlib import Path
from typing import Any

import pandas as pd

from dashboard_caderno_3.config import RAIZ_PROJETO, carregar_configuracao, versao_dados
from dashboard_caderno_3.util import (
    escrever_json,
    garantir_destino_interno,
    normalizar_codigo_ibge,
    registros_json,
)


def _arquivo_importado(relativo: str) -> Path:
    arquivo = RAIZ_PROJETO / "dados" / "origem" / relativo
    if not arquivo.is_file():
        raise FileNotFoundError(f"Execute a importação antes da transformação: {arquivo}")
    return arquivo


def _salvar_tabela(
    dataframe: pd.DataFrame,
    nome: str,
) -> None:
    canonico = garantir_destino_interno(
        RAIZ_PROJETO / "dados" / "preparados" / f"{nome}.csv",
        RAIZ_PROJETO,
    )
    publico = RAIZ_PROJETO / "site" / "dados" / f"{nome}.json"
    canonico.parent.mkdir(parents=True, exist_ok=True)
    dataframe.to_csv(canonico, index=False, encoding="utf-8-sig")
    escrever_json(publico, registros_json(dataframe), RAIZ_PROJETO)


def _ler_ivel() -> pd.DataFrame:
    arquivo = _arquivo_importado("produtos/ivel/ivel_municipal_2025.xlsx")
    dados = pd.read_excel(
        arquivo,
        sheet_name="IVEL 2025",
        dtype={"Código do município": "string"},
    )
    dados["Código do município"] = normalizar_codigo_ibge(dados["Código do município"])
    dados = dados[dados["Código do município"].str.fullmatch(r"\d{7}", na=False)].copy()
    dados = dados.rename(
        columns={
            "Código do município": "codigo_ibge",
            "Município": "municipio",
            "D1 — Qualidade do serviço": "qualidade_servico",
            "D2 — Insuficiência de renda": "insuficiencia_renda",
            "D3 — Dependência tarifária": "dependencia_tarifaria_ivel",
            "IVEL 2025": "ivel_2025",
            "Classificação": "classificacao_ivel",
        }
    )

    rendimento = pd.read_excel(
        _arquivo_importado("intermediarios/rendimento_domiciliar_municipal.xlsx"),
        sheet_name="Rendimento municipal",
        dtype={"codigo_municipio": "string"},
    )
    rendimento["codigo_municipio"] = normalizar_codigo_ibge(
        rendimento["codigo_municipio"]
    )
    rendimento = rendimento[
        rendimento["codigo_municipio"].str.fullmatch(r"\d{7}", na=False)
    ].copy()
    rendimento = rendimento.rename(columns={"codigo_municipio": "codigo_ibge"})
    dados = dados.merge(
        rendimento[
            [
                "codigo_ibge",
                "rendimento_domiciliar_medio",
                "rendimento_domiciliar_mediana",
            ]
        ],
        on="codigo_ibge",
        how="left",
        validate="one_to_one",
    )
    colunas = [
        "codigo_ibge",
        "municipio",
        "qualidade_servico",
        "insuficiencia_renda",
        "rendimento_domiciliar_medio",
        "rendimento_domiciliar_mediana",
        "dependencia_tarifaria_ivel",
        "ivel_2025",
        "classificacao_ivel",
    ]
    return dados[colunas].sort_values("codigo_ibge").reset_index(drop=True)


def _ler_municipios() -> tuple[pd.DataFrame, pd.DataFrame]:
    territorios = pd.read_excel(
        _arquivo_importado("brutos/territorios_municipios_pi.xlsx"),
        dtype={"Cógido IBGE": "string"},
    ).rename(
        columns={
            "Cógido IBGE": "codigo_ibge",
            "Município": "municipio",
            "Território de Desenvolvimento": "territorio_desenvolvimento",
        }
    )
    territorios["codigo_ibge"] = normalizar_codigo_ibge(territorios["codigo_ibge"])
    territorios = territorios[
        territorios["codigo_ibge"].str.fullmatch(r"\d{7}", na=False)
    ].copy()
    municipios = territorios[
        ["codigo_ibge", "municipio", "territorio_desenvolvimento"]
    ].drop_duplicates()

    luz = pd.read_excel(
        _arquivo_importado("produtos/acesso/luz_para_todos_municipal.xlsx"),
        dtype={"Código do município": "string"},
    ).rename(
        columns={
            "Código do município": "codigo_ibge",
            "Domicílios beneficiados (2023-2025)": "domicilios_beneficiados_2023_2025",
        }
    )
    luz["codigo_ibge"] = normalizar_codigo_ibge(luz["codigo_ibge"])
    luz = luz[luz["codigo_ibge"].str.fullmatch(r"\d{7}", na=False)].copy()
    luz = municipios[["codigo_ibge", "municipio"]].merge(
        luz[["codigo_ibge", "domicilios_beneficiados_2023_2025"]],
        on="codigo_ibge",
        how="left",
        validate="one_to_one",
    )
    return (
        municipios.sort_values("codigo_ibge").reset_index(drop=True),
        luz.sort_values("codigo_ibge").reset_index(drop=True),
    )


def _ler_continuidade() -> pd.DataFrame:
    arquivo = _arquivo_importado("produtos/qualidade/continuidade_municipal.xlsx")
    dados = pd.read_excel(arquivo, sheet_name="D2_anual", dtype={"cod_ibge": "string"})
    dados["cod_ibge"] = normalizar_codigo_ibge(dados["cod_ibge"])
    dados = dados[dados["cod_ibge"].str.fullmatch(r"\d{7}", na=False)].copy()
    dados = dados.rename(
        columns={
            "cod_ibge": "codigo_ibge",
            "nome_municipio": "municipio",
            "td": "territorio_origem",
            "DEC_comparavel": "dec_comparavel",
            "FEC_comparavel": "fec_comparavel",
            "D2_anual": "continuidade_d2",
            "Classe_D2_2025_quartil": "classificacao_continuidade_2025",
        }
    )

    referencia = pd.read_excel(
        arquivo,
        sheet_name="D2_referencia",
        dtype={"cod_ibge": "string"},
    )
    referencia["cod_ibge"] = normalizar_codigo_ibge(referencia["cod_ibge"])
    referencia = referencia[
        referencia["cod_ibge"].str.fullmatch(r"\d{7}", na=False)
    ].copy()
    referencia = referencia.rename(
        columns={
            "cod_ibge": "codigo_ibge",
            "DEC_referencia": "dec_referencia",
            "FEC_referencia": "fec_referencia",
            "D2_referencia": "continuidade_d2_referencia",
            "Classe_D2": "classificacao_continuidade_referencia",
        }
    )
    referencia = referencia[
        [
            "codigo_ibge",
            "dec_referencia",
            "fec_referencia",
            "continuidade_d2_referencia",
            "classificacao_continuidade_referencia",
        ]
    ]
    dados = dados.merge(
        referencia,
        on="codigo_ibge",
        how="left",
        validate="many_to_one",
    )
    colunas = [
        "codigo_ibge",
        "municipio",
        "territorio_origem",
        "ano",
        "dec_comparavel",
        "fec_comparavel",
        "continuidade_d2",
        "classificacao_continuidade_2025",
        "confiabilidade",
        "dec_referencia",
        "fec_referencia",
        "continuidade_d2_referencia",
        "classificacao_continuidade_referencia",
    ]
    return dados[colunas].sort_values(["codigo_ibge", "ano"]).reset_index(drop=True)


def _ler_inclusao_tarifaria() -> pd.DataFrame:
    arquivo = _arquivo_importado("produtos/tarifa/inclusao_tarifaria.xlsx")
    dados = pd.read_excel(arquivo, dtype={"Código do município": "string"})
    dados["Código do município"] = normalizar_codigo_ibge(dados["Código do município"])
    dados = dados[dados["Código do município"].str.fullmatch(r"\d{7}", na=False)].copy()
    dados = dados.rename(
        columns={
            "Código do município": "codigo_ibge",
            "Município": "municipio",
            "Ano": "ano",
            "ELEG(m)": "familias_elegiveis",
            "BENEF(m)": "unidades_beneficiarias",
            "COBTS(m) (%)": "cobertura_tarifa_social_percentual",
            "LAC(m)": "lacuna_absoluta",
            "LACrel(m) (%)": "lacuna_relativa_percentual",
        }
    )
    colunas = [
        "codigo_ibge",
        "municipio",
        "ano",
        "familias_elegiveis",
        "unidades_beneficiarias",
        "cobertura_tarifa_social_percentual",
        "lacuna_absoluta",
        "lacuna_relativa_percentual",
    ]
    return dados[colunas].sort_values(["codigo_ibge", "ano"]).reset_index(drop=True)


def _ler_dependencia_tarifaria() -> pd.DataFrame:
    arquivo = _arquivo_importado("produtos/tarifa/dependencia_tarifaria.xlsx")
    dados = pd.read_excel(arquivo, dtype={"Código do município": "string"})
    dados["Código do município"] = normalizar_codigo_ibge(dados["Código do município"])
    dados = dados[dados["Código do município"].str.fullmatch(r"\d{7}", na=False)].copy()
    dados = dados.rename(
        columns={
            "Código do município": "codigo_ibge",
            "Município": "municipio",
            "Ano": "ano",
            "UCres(m)": "unidades_residenciais",
            "UCbr(m)": "unidades_beneficiarias",
            "DEP(m) (%)": "dependencia_tarifaria_percentual",
        }
    )
    colunas = [
        "codigo_ibge",
        "municipio",
        "ano",
        "unidades_residenciais",
        "unidades_beneficiarias",
        "dependencia_tarifaria_percentual",
    ]
    return dados[colunas].sort_values(["codigo_ibge", "ano"]).reset_index(drop=True)


def _montar_indicadores_longos(
    ivel: pd.DataFrame,
    continuidade: pd.DataFrame,
    inclusao: pd.DataFrame,
    dependencia: pd.DataFrame,
    luz: pd.DataFrame,
) -> pd.DataFrame:
    blocos: list[pd.DataFrame] = []

    definicoes_ivel = {
        "ivel_2025": ("ivel", "Índice de Vulnerabilidade Elétrica", "pontos"),
        "qualidade_servico": ("qualidade_servico", "Qualidade do serviço", "pontos"),
        "insuficiencia_renda": ("insuficiencia_renda", "Insuficiência de renda", "pontos"),
        "dependencia_tarifaria_ivel": (
            "dependencia_tarifaria_ivel",
            "Dependência tarifária — dimensão do IVEL",
            "pontos",
        ),
    }
    for coluna, (indicador_id, rotulo, unidade) in definicoes_ivel.items():
        bloco = ivel[["codigo_ibge", "municipio", coluna, "classificacao_ivel"]].copy()
        bloco = bloco.rename(columns={coluna: "valor", "classificacao_ivel": "classificacao"})
        bloco["indicador_id"] = indicador_id
        bloco["indicador"] = rotulo
        bloco["periodo"] = "2025"
        bloco["unidade"] = unidade
        blocos.append(bloco)

    bloco = continuidade[
        [
            "codigo_ibge",
            "municipio",
            "ano",
            "continuidade_d2",
            "classificacao_continuidade_2025",
        ]
    ].copy()
    bloco = bloco.rename(
        columns={
            "continuidade_d2": "valor",
            "classificacao_continuidade_2025": "classificacao",
        }
    )
    bloco["indicador_id"] = "continuidade_d2"
    bloco["indicador"] = "Continuidade do fornecimento"
    bloco["periodo"] = bloco["ano"].astype("Int64").astype("string")
    bloco["unidade"] = "pontos"
    blocos.append(bloco.drop(columns="ano"))

    bloco = continuidade[
        [
            "codigo_ibge",
            "municipio",
            "continuidade_d2_referencia",
            "classificacao_continuidade_referencia",
        ]
    ].drop_duplicates("codigo_ibge").copy()
    bloco = bloco.rename(
        columns={
            "continuidade_d2_referencia": "valor",
            "classificacao_continuidade_referencia": "classificacao",
        }
    )
    bloco["indicador_id"] = "continuidade_d2_referencia"
    bloco["indicador"] = "Continuidade do fornecimento — referência consolidada"
    bloco["periodo"] = "2023-2025"
    bloco["unidade"] = "pontos"
    blocos.append(bloco)

    bloco = inclusao[
        ["codigo_ibge", "municipio", "ano", "cobertura_tarifa_social_percentual"]
    ].copy()
    bloco = bloco.rename(columns={"cobertura_tarifa_social_percentual": "valor"})
    bloco["indicador_id"] = "cobertura_tarifa_social"
    bloco["indicador"] = "Cobertura estimada da Tarifa Social"
    bloco["periodo"] = bloco["ano"].astype("Int64").astype("string")
    bloco["unidade"] = "%"
    bloco["classificacao"] = pd.NA
    blocos.append(bloco.drop(columns="ano"))

    bloco = dependencia[
        ["codigo_ibge", "municipio", "ano", "dependencia_tarifaria_percentual"]
    ].copy()
    bloco = bloco.rename(columns={"dependencia_tarifaria_percentual": "valor"})
    bloco["indicador_id"] = "dependencia_tarifaria"
    bloco["indicador"] = "Dependência tarifária"
    bloco["periodo"] = bloco["ano"].astype("Int64").astype("string")
    bloco["unidade"] = "%"
    bloco["classificacao"] = pd.NA
    blocos.append(bloco.drop(columns="ano"))

    bloco = luz.rename(columns={"domicilios_beneficiados_2023_2025": "valor"}).copy()
    bloco["indicador_id"] = "luz_para_todos_domicilios"
    bloco["indicador"] = "Domicílios beneficiados pelo Luz para Todos"
    bloco["periodo"] = "2023-2025"
    bloco["unidade"] = "domicílios"
    bloco["classificacao"] = pd.NA
    blocos.append(bloco)

    colunas = [
        "codigo_ibge",
        "municipio",
        "indicador_id",
        "indicador",
        "periodo",
        "valor",
        "unidade",
        "classificacao",
    ]
    return pd.concat(blocos, ignore_index=True)[colunas].sort_values(
        ["indicador_id", "periodo", "codigo_ibge"]
    ).reset_index(drop=True)


def _percentual_apresentacao(serie: pd.Series) -> pd.Series:
    """Converte proporções entre 0 e 1 para percentuais de apresentação."""
    numerica = pd.to_numeric(serie, errors="coerce")
    return numerica.where(numerica.abs() > 1, numerica * 100)


def _ler_indicadores_gerais(
    ivel: pd.DataFrame,
    inclusao: pd.DataFrame,
    dependencia: pd.DataFrame,
) -> dict[str, Any]:
    populacao = pd.read_excel(_arquivo_importado("produtos/contexto/populacao_residente_piaui.xlsx"))
    populacao = populacao.rename(
        columns={"População": "categoria", "Quantidade": "quantidade", "%": "percentual"}
    )
    populacao["percentual"] = _percentual_apresentacao(populacao["percentual"])

    unidades = pd.read_excel(
        _arquivo_importado("produtos/contexto/unidades_consumidoras_residenciais.xlsx")
    ).rename(
        columns={
            "Ano": "ano",
            "UCs residenciais": "unidades_residenciais",
            "UCs residenciais de baixa renda": "unidades_baixa_renda",
            "Baixa renda entre as UCs residenciais (%)": "percentual_baixa_renda",
        }
    )
    unidades["percentual_baixa_renda"] = _percentual_apresentacao(
        unidades["percentual_baixa_renda"]
    )

    acesso = pd.read_excel(_arquivo_importado("produtos/acesso/moradores_com_energia.xlsx"))
    acesso = acesso.melt(id_vars="Território", var_name="ano", value_name="percentual")
    acesso = acesso.rename(columns={"Território": "recorte"})
    acesso["ano"] = acesso["ano"].astype(str).str.extract(r"(\d{4})").astype(int)

    acesso_absoluto_bruto = pd.read_excel(
        _arquivo_importado("brutos/moradores_em_domicilios_tabela6737.xlsx")
    )
    registros_absolutos: list[dict[str, Any]] = []
    for ano in (2023, 2024, 2025):
        coluna = f"Moradores em domicílios com energia elétrica (Mil pessoas) - {ano}"
        for _, linha in acesso_absoluto_bruto.iterrows():
            registros_absolutos.append(
                {
                    "recorte": linha["Local"],
                    "ano": ano,
                    "estimativa_moradores": int(linha[coluna]) * 1_000,
                }
            )
    acesso_absoluto = pd.DataFrame(registros_absolutos)
    acesso = acesso.merge(
        acesso_absoluto,
        on=["recorte", "ano"],
        how="left",
        validate="one_to_one",
    )
    if acesso["estimativa_moradores"].isna().any():
        raise ValueError("Há valores absolutos ausentes na série de acesso à energia.")

    disponibilidade = pd.read_excel(
        _arquivo_importado("intermediarios/disponibilidade_comparativo.xlsx")
    )[
        [
            "recorte",
            "indicador",
            "estimativa_domicilios",
            "percentual",
            "erro_padrao",
            "ic95_inferior",
            "ic95_superior",
            "observacao_precisao",
        ]
    ]
    fruicao = pd.read_excel(_arquivo_importado("intermediarios/fruicao_comparativo.xlsx"))[
        [
            "recorte",
            "indicador",
            "estimativa_domicilios",
            "percentual",
            "erro_padrao",
            "ic95_inferior",
            "ic95_superior",
            "observacao_precisao",
        ]
    ]

    reclamacoes: list[dict[str, Any]] = []
    arquivo_reclamacoes = _arquivo_importado("produtos/reclamacoes/reclamacoes_anuais.xlsx")
    for canal, aba in {"SAC": "SAC - totais", "Ouvidoria": "Ouvidoria - totais"}.items():
        dados_canal = pd.read_excel(arquivo_reclamacoes, sheet_name=aba).rename(
            columns={
                "Ano": "ano",
                "Manifestações recebidas": "manifestacoes_recebidas",
                "Procedentes": "procedentes",
                "Improcedentes": "improcedentes",
            }
        )
        dados_canal = dados_canal[pd.to_numeric(dados_canal["ano"], errors="coerce").notna()].copy()
        dados_canal["ano"] = dados_canal["ano"].astype(int)
        dados_canal["canal"] = canal
        reclamacoes.extend(registros_json(dados_canal))

    suspensoes = pd.read_excel(_arquivo_importado("produtos/tarifa/suspensoes.xlsx")).rename(
        columns={
            "Registros de suspensão": "categoria",
            2024: "ano_2024",
            2025: "ano_2025",
            "Variação": "variacao_percentual",
        }
    )
    suspensoes = suspensoes[
        suspensoes["ano_2024"].notna() | suspensoes["ano_2025"].notna()
    ].copy()
    suspensoes["variacao_percentual"] = _percentual_apresentacao(
        suspensoes["variacao_percentual"]
    )

    inclusao_2025 = inclusao[inclusao["ano"] == 2025]
    dependencia_2025 = dependencia[dependencia["ano"] == 2025]
    elegiveis = int(inclusao_2025["familias_elegiveis"].sum())
    beneficiarias = int(inclusao_2025["unidades_beneficiarias"].sum())
    unidades_residenciais = int(dependencia_2025["unidades_residenciais"].sum())

    classificacao = pd.read_excel(
        _arquivo_importado("produtos/ivel/classificacao_ivel.xlsx"),
        sheet_name="Classificação do IVEL",
    )
    classificacao = classificacao.rename(
        columns={
            "Classificação": "classificacao",
            "Faixa do IVEL": "faixa",
            "Municípios": "municipios",
        }
    )
    faixa_muito_alta = classificacao.loc[
        classificacao["classificacao"].astype(str).str.casefold() == "muito alta",
        "faixa",
    ].iloc[0]
    numeros_faixa = re.findall(r"\d+[,.]?\d*", str(faixa_muito_alta))
    limite_muito_alta = float(numeros_faixa[0].replace(",", "."))

    dimensoes = pd.read_excel(
        _arquivo_importado("produtos/ivel/dimensoes_ivel.xlsx"),
        sheet_name="Dimensões do IVEL",
    ).rename(
        columns={
            "Dimensão": "dimensao",
            "Indicador": "indicador",
            "Referência": "referencia",
            "Peso": "peso",
        }
    )

    contagem_classes = (
        ivel.groupby("classificacao_ivel", observed=True)
        .size()
        .rename("municipios")
        .reset_index()
        .rename(columns={"classificacao_ivel": "classificacao"})
    )

    return {
        "populacao_2022": registros_json(populacao),
        "unidades_consumidoras": registros_json(unidades),
        "acesso_energia": registros_json(acesso),
        "disponibilidade_2025": registros_json(disponibilidade),
        "fruicao_2025": registros_json(fruicao),
        "reclamacoes": reclamacoes,
        "suspensoes": registros_json(suspensoes),
        "tarifa_social_2025": {
            "familias_elegiveis": elegiveis,
            "unidades_beneficiarias": beneficiarias,
            "cobertura_estimada_percentual": beneficiarias / elegiveis * 100,
            "unidades_residenciais": unidades_residenciais,
            "dependencia_estadual_percentual": beneficiarias / unidades_residenciais * 100,
        },
        "ivel_2025": {
            "media": float(ivel["ivel_2025"].mean()),
            "mediana": float(ivel["ivel_2025"].median()),
            "limite_classe_muito_alta": limite_muito_alta,
            "classificacoes": registros_json(classificacao),
            "contagem_classes": registros_json(contagem_classes),
            "dimensoes": registros_json(dimensoes),
        },
    }


def transformar_dados(caminho_config: Path | None = None) -> dict[str, Any]:
    """Gera tabelas canônicas e arquivos JSON próprios do dashboard."""
    configuracao = carregar_configuracao(caminho_config)
    versao = versao_dados(configuracao)

    ivel = _ler_ivel()
    municipios, luz = _ler_municipios()
    continuidade = _ler_continuidade()
    inclusao = _ler_inclusao_tarifaria()
    dependencia = _ler_dependencia_tarifaria()
    indicadores = _montar_indicadores_longos(ivel, continuidade, inclusao, dependencia, luz)
    indicadores_gerais = _ler_indicadores_gerais(ivel, inclusao, dependencia)

    tabelas = {
        "municipios": municipios,
        "ivel/ivel_municipal_2025": ivel,
        "qualidade/continuidade_municipal": continuidade,
        "tarifa/inclusao_tarifaria_municipal": inclusao,
        "tarifa/dependencia_tarifaria_municipal": dependencia,
        "acesso/luz_para_todos_municipal": luz,
        "indicadores_municipais": indicadores,
    }
    for nome, tabela in tabelas.items():
        _salvar_tabela(tabela, nome)

    metadados = {
        "versao": versao,
        "municipios": len(municipios),
        "linhas_ivel": len(ivel),
        "linhas_continuidade": len(continuidade),
        "linhas_inclusao_tarifaria": len(inclusao),
        "linhas_dependencia_tarifaria": len(dependencia),
        "linhas_indicadores_municipais": len(indicadores),
    }
    escrever_json(
        RAIZ_PROJETO / "site" / "dados" / "metadados" / "pacote_dados.json",
        metadados,
        RAIZ_PROJETO,
    )
    with (RAIZ_PROJETO / "configuracao" / "indicadores.toml").open("rb") as entrada:
        indicadores_config = tomllib.load(entrada)
    escrever_json(
        RAIZ_PROJETO / "site" / "dados" / "metadados" / "indicadores.json",
        indicadores_config["indicadores"],
        RAIZ_PROJETO,
    )
    arquivo_geral = RAIZ_PROJETO / "dados" / "preparados" / "indicadores_gerais.json"
    escrever_json(arquivo_geral, indicadores_gerais, RAIZ_PROJETO)
    destino_geral = RAIZ_PROJETO / "site" / "dados" / "indicadores_gerais.json"
    destino_geral.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(arquivo_geral, destino_geral)
    return metadados
