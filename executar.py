"""Ponto de entrada simples para os comandos do dashboard."""

from __future__ import annotations

import sys
from importlib import import_module
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ / "codigo"))
main = import_module("dashboard_caderno_3.cli").main


if __name__ == "__main__":
    raise SystemExit(main())
