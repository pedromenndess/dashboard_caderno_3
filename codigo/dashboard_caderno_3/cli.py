"""Interface de linha de comando do pipeline."""

from __future__ import annotations

import argparse
import json
import logging
from collections.abc import Callable
from typing import Any

from dashboard_caderno_3.geografia import preparar_geografia
from dashboard_caderno_3.importacao import importar_fontes
from dashboard_caderno_3.transformacao import transformar_dados
from dashboard_caderno_3.validacao import validar_pacote


def _imprimir(resultado: dict[str, Any]) -> None:
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Pipeline do Dashboard do Caderno 3")
    parser.add_argument("--verbose", action="store_true", help="Exibe mensagens detalhadas.")
    subcomandos = parser.add_subparsers(dest="comando", required=True)

    importar = subcomandos.add_parser("importar", help="Copia as fontes selecionadas.")
    importar.add_argument("--sobrescrever", action="store_true")
    subcomandos.add_parser("transformar", help="Gera as bases canônicas e JSON.")
    subcomandos.add_parser("geografia", help="Gera o GeoJSON municipal simplificado.")
    subcomandos.add_parser("validar", help="Valida o pacote de dados.")
    preparar = subcomandos.add_parser("preparar", help="Executa todo o pipeline.")
    preparar.add_argument("--sobrescrever", action="store_true")
    return parser


def main() -> int:
    argumentos = construir_parser().parse_args()
    logging.basicConfig(
        level=logging.INFO if argumentos.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )

    comandos: dict[str, Callable[[], dict[str, Any]]] = {
        "importar": lambda: importar_fontes(sobrescrever=argumentos.sobrescrever),
        "transformar": transformar_dados,
        "geografia": preparar_geografia,
        "validar": validar_pacote,
    }
    if argumentos.comando == "preparar":
        resultado = {
            "importacao": importar_fontes(sobrescrever=argumentos.sobrescrever),
            "transformacao": transformar_dados(),
            "geografia": preparar_geografia(),
            "validacao": validar_pacote(),
        }
    else:
        resultado = comandos[argumentos.comando]()
    _imprimir(resultado)
    return 0
