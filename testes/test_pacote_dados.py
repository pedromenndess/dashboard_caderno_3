from dashboard_caderno_3.validacao import validar_pacote


def test_pacote_de_dados_validado() -> None:
    resultado = validar_pacote()
    assert resultado["status"] == "aprovado"
    assert resultado["municipios"] == 224
