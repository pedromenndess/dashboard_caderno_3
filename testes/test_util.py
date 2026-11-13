from pathlib import Path

import pandas as pd
import pytest
from dashboard_caderno_3.config import RAIZ_PROJETO
from dashboard_caderno_3.util import garantir_destino_interno, normalizar_codigo_ibge


def test_normalizar_codigo_ibge_preserva_sete_caracteres() -> None:
    resultado = normalizar_codigo_ibge(pd.Series([2200053, "2200103", 2200202.0]))
    assert resultado.tolist() == ["2200053", "2200103", "2200202"]


def test_bloqueia_saida_fora_do_dashboard() -> None:
    with pytest.raises(ValueError, match="fora do dashboard"):
        garantir_destino_interno(Path("H:/Meu Drive/SUMER/Caderno_3/arquivo.txt"), RAIZ_PROJETO)
