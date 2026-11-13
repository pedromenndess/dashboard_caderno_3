"use strict";

const VERSAO_FRONTEND = "20261113-02";

const CORES = {
  azul: "#366091",
  azulEscuro: "#124f82",
  azulClaro: "#8fb9d8",
  vermelho: "#c91824",
  verde: "#069b06",
  amarelo: "#f6b900",
  cinza: "#6d7d8c",
  linha: "#d8e1e9",
  texto: "#17324a",
};

const CONFIG_PLOTLY = {
  responsive: true,
  displaylogo: false,
  showSendToCloud: false,
  scrollZoom: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines"],
};

const estado = {
  ano: 2025,
  codigoMunicipio: null,
  aba: "geral",
  indicadorTarifa: "cobertura",
};

const dados = {};

document.addEventListener("DOMContentLoaded", iniciar);

async function iniciar() {
  try {
    const [
      municipios,
      ivel,
      continuidade,
      inclusao,
      dependencia,
      geografia,
      gerais,
      pacote,
    ] = await Promise.all([
      carregarJson("dados/municipios.json"),
      carregarJson("dados/ivel/ivel_municipal_2025.json"),
      carregarJson("dados/qualidade/continuidade_municipal.json"),
      carregarJson("dados/tarifa/inclusao_tarifaria_municipal.json"),
      carregarJson("dados/tarifa/dependencia_tarifaria_municipal.json"),
      carregarJson("dados/geografia/municipios_pi.geojson"),
      carregarJson("dados/indicadores_gerais.json"),
      carregarJson("dados/metadados/pacote_dados.json"),
    ]);

    Object.assign(dados, {
      municipios,
      ivel,
      continuidade,
      inclusao,
      dependencia,
      geografia,
      gerais,
      pacote,
    });

    dados.municipiosPorCodigo = new Map(municipios.map((item) => [item.codigo_ibge, item]));
    dados.ivelPorCodigo = new Map(ivel.map((item) => [item.codigo_ibge, item]));
    dados.municipiosOrdenados = [...municipios].sort((a, b) =>
      a.municipio.localeCompare(b.municipio, "pt-BR"),
    );

    aplicarParametrosUrl();

    configurarEventos();
    document.getElementById("filtro-ano").value = String(estado.ano);
    atualizarCampoMunicipio();
    document.getElementById("versao-dados").textContent = `Base ${pacote.versao}`;
    ativarAba(estado.aba);
  } catch (erro) {
    console.error(erro);
    const mensagem = document.getElementById("mensagem-erro");
    mensagem.hidden = false;
    mensagem.textContent = `Não foi possível carregar o painel: ${erro.message}`;
  } finally {
    document.getElementById("carregamento").classList.add("oculto");
  }
}

function aplicarParametrosUrl() {
  const parametros = new URLSearchParams(window.location.search);
  const ano = Number(parametros.get("ano"));
  if ([2023, 2024, 2025].includes(ano)) estado.ano = ano;

  const aba = parametros.get("aba");
  if (["geral", "qualidade", "tarifa", "ivel"].includes(aba)) estado.aba = aba;

  const nomeMunicipio = normalizarBusca(parametros.get("municipio") || "");
  if (nomeMunicipio && !["todos", "todos os municipios"].includes(nomeMunicipio)) {
    const encontrado = dados.municipiosOrdenados.find(
      (item) => normalizarBusca(item.municipio) === nomeMunicipio,
    );
    if (encontrado) estado.codigoMunicipio = encontrado.codigo_ibge;
  }
}

async function carregarJson(caminho) {
  const separador = caminho.includes("?") ? "&" : "?";
  const resposta = await fetch(`${caminho}${separador}v=${VERSAO_FRONTEND}`, {
    cache: "no-store",
  });
  if (!resposta.ok) {
    throw new Error(`${caminho} (${resposta.status})`);
  }
  return resposta.json();
}

function configurarEventos() {
  document.getElementById("filtro-ano").addEventListener("change", (evento) => {
    estado.ano = Number(evento.target.value);
    atualizarResumoSelecao();
    renderizarAbaAtual();
  });

  document.querySelectorAll(".aba-botao").forEach((botao) => {
    botao.addEventListener("click", () => ativarAba(botao.dataset.aba));
  });

  const campo = document.getElementById("filtro-municipio");
  campo.addEventListener("input", () => mostrarSugestoes(campo.value));
  campo.addEventListener("focus", () => mostrarSugestoes(campo.value));
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      const primeira = normalizarBusca(campo.value) && normalizarBusca(campo.value) !== "todos os municipios"
        ? document.querySelector(".sugestao:not(.sugestao--todos)")
        : document.querySelector(".sugestao");
      if (primeira) {
        evento.preventDefault();
        selecionarMunicipio(primeira.dataset.codigo);
      }
    }
    if (evento.key === "Escape") {
      fecharSugestoes();
    }
  });

  document.getElementById("limpar-municipio").addEventListener("click", () => {
    selecionarMunicipio(null);
  });

  document.addEventListener("click", (evento) => {
    if (!evento.target.closest(".campo--municipio")) {
      fecharSugestoes();
    }
  });

  document.getElementById("indicador-tarifa").addEventListener("change", (evento) => {
    estado.indicadorTarifa = evento.target.value;
    renderizarTarifa();
  });
}

function ativarAba(nome) {
  estado.aba = nome;
  document.querySelectorAll(".aba-botao").forEach((botao) => {
    botao.classList.toggle("ativo", botao.dataset.aba === nome);
  });
  document.querySelectorAll(".painel-aba").forEach((secao) => {
    const ativa = secao.id === `aba-${nome}`;
    secao.hidden = !ativa;
    secao.classList.toggle("ativo", ativa);
  });
  atualizarVisibilidadeFiltros();
  atualizarResumoSelecao();
  renderizarAbaAtual();
}

function atualizarVisibilidadeFiltros() {
  const visaoGeral = estado.aba === "geral";
  document.getElementById("campo-municipio").hidden = visaoGeral;
  document.querySelector(".filtros").classList.toggle("filtros--geral", visaoGeral);
}

function renderizarAbaAtual() {
  if (!dados.municipios) return;
  const renderizadores = {
    geral: renderizarGeral,
    qualidade: renderizarQualidade,
    tarifa: renderizarTarifa,
    ivel: renderizarIvel,
  };
  renderizadores[estado.aba]();
}

function normalizarBusca(valor) {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function mostrarSugestoes(termo) {
  const alvo = normalizarBusca(termo);
  const correspondencias = dados.municipiosOrdenados
    .filter((item) => normalizarBusca(item.municipio).includes(alvo))
    .sort((a, b) => {
      const aComeca = normalizarBusca(a.municipio).startsWith(alvo) ? 0 : 1;
      const bComeca = normalizarBusca(b.municipio).startsWith(alvo) ? 0 : 1;
      return aComeca - bComeca || a.municipio.localeCompare(b.municipio, "pt-BR");
    })
    .slice(0, 10);

  const lista = document.getElementById("sugestoes-municipio");
  lista.replaceChildren();

  const todos = document.createElement("button");
  todos.type = "button";
  todos.className = "sugestao sugestao--todos";
  todos.dataset.codigo = "";
  todos.setAttribute("role", "option");
  const nomeTodos = document.createElement("strong");
  nomeTodos.textContent = "Todos os municípios";
  const detalheTodos = document.createElement("small");
  detalheTodos.textContent = "Síntese estadual do Piauí";
  todos.append(nomeTodos, detalheTodos);
  todos.addEventListener("click", () => selecionarMunicipio(null));
  lista.appendChild(todos);

  correspondencias.forEach((item) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "sugestao";
    botao.dataset.codigo = item.codigo_ibge;
    botao.setAttribute("role", "option");

    const nome = document.createElement("strong");
    nome.textContent = item.municipio;
    const territorio = document.createElement("small");
    territorio.textContent = item.territorio_desenvolvimento;
    botao.append(nome, territorio);
    botao.addEventListener("click", () => selecionarMunicipio(item.codigo_ibge));
    lista.appendChild(botao);
  });

  lista.classList.add("aberto");
  document.getElementById("filtro-municipio").setAttribute(
    "aria-expanded",
    "true",
  );
}

function fecharSugestoes() {
  document.getElementById("sugestoes-municipio").classList.remove("aberto");
  document.getElementById("filtro-municipio").setAttribute("aria-expanded", "false");
}

function selecionarMunicipio(codigo) {
  if (codigo && !dados.municipiosPorCodigo.has(codigo)) return;
  estado.codigoMunicipio = codigo || null;
  atualizarCampoMunicipio();
  atualizarResumoSelecao();
  fecharSugestoes();
  renderizarAbaAtual();
}

function atualizarCampoMunicipio() {
  const municipio = dados.municipiosPorCodigo.get(estado.codigoMunicipio);
  document.getElementById("filtro-municipio").value = municipio?.municipio ?? "Todos os municípios";
}

function atualizarResumoSelecao() {
  const municipio = dados.municipiosPorCodigo.get(estado.codigoMunicipio);
  const recorte = estado.aba === "geral" ? "Piauí" : (municipio?.municipio ?? "Todos os municípios");
  document.getElementById("resumo-selecao").textContent = `${recorte} · ${estado.ano}`;
}

function numero(valor, casas = 0) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(Number(valor));
}

function percentual(valor, casas = 1) {
  return valor === null || valor === undefined ? "—" : `${numero(valor, casas)}%`;
}

function media(registros, campo) {
  const valores = registros
    .map((item) => Number(item[campo]))
    .filter((valor) => Number.isFinite(valor));
  return valores.length ? valores.reduce((total, valor) => total + valor, 0) / valores.length : null;
}

function soma(registros, campo) {
  return registros.reduce((total, item) => total + (Number(item[campo]) || 0), 0);
}

function layoutBase(extra = {}) {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Arial, sans-serif", color: CORES.texto, size: 12 },
    margin: { l: 50, r: 20, t: 22, b: 48 },
    hoverlabel: { bgcolor: "#ffffff", bordercolor: CORES.linha, font: { color: CORES.texto } },
    ...extra,
  };
}

function eixoBasico(titulo = "") {
  return {
    title: { text: titulo, font: { size: 11 } },
    gridcolor: "#e9eff4",
    zeroline: false,
    tickfont: { size: 11 },
    automargin: true,
  };
}

function renderizarGeral() {
  const populacao = dados.gerais.populacao_2022.find((item) =>
    normalizarBusca(item.categoria).includes("total"),
  );
  const unidadesAno = dados.gerais.unidades_consumidoras.find((item) => item.ano === estado.ano)
    ?? dados.gerais.unidades_consumidoras.at(-1);
  const acessoPiaui = dados.gerais.acesso_energia.find(
    (item) => normalizarBusca(item.recorte) === "piaui" && item.ano === estado.ano,
  );

  document.getElementById("geral-populacao").textContent = numero(populacao.quantidade);
  document.getElementById("geral-unidades").textContent = numero(unidadesAno.unidades_residenciais);
  document.getElementById("geral-unidades-ano").textContent = String(unidadesAno.ano);
  document.getElementById("geral-acesso").textContent = percentual(acessoPiaui.percentual, 1);
  document.getElementById("geral-acesso-ano").textContent = String(estado.ano);
  document.getElementById("geral-baixa-renda").textContent = numero(
    unidadesAno.unidades_baixa_renda,
  );
  document.getElementById("geral-baixa-renda-ano").textContent = String(unidadesAno.ano);

  Plotly.react(
    "grafico-unidades",
    [
      {
        x: dados.gerais.unidades_consumidoras.map((item) => String(item.ano)),
        y: dados.gerais.unidades_consumidoras.map((item) => item.unidades_residenciais),
        text: dados.gerais.unidades_consumidoras.map((item) => numero(item.unidades_residenciais)),
        name: "Residenciais",
        type: "bar",
        marker: { color: CORES.azul },
        hovertemplate: "%{x}<br><b>%{text}</b><extra>Residenciais</extra>",
      },
      {
        x: dados.gerais.unidades_consumidoras.map((item) => String(item.ano)),
        y: dados.gerais.unidades_consumidoras.map((item) => item.unidades_baixa_renda),
        text: dados.gerais.unidades_consumidoras.map((item) => numero(item.unidades_baixa_renda)),
        name: "Baixa renda",
        type: "bar",
        marker: { color: CORES.amarelo },
        hovertemplate: "%{x}<br><b>%{text}</b><extra>Baixa renda</extra>",
      },
    ],
    layoutBase({
      barmode: "group",
      legend: { orientation: "h", y: 1.14, x: 0 },
      xaxis: { ...eixoBasico(), type: "category" },
      yaxis: { ...eixoBasico(), tickformat: ".2s" },
    }),
    CONFIG_PLOTLY,
  );

  const recortes = ["Brasil", "Nordeste", "Piauí"];
  Plotly.react(
    "grafico-acesso",
    recortes.map((recorte, indice) => {
      const serie = dados.gerais.acesso_energia.filter(
        (item) => normalizarBusca(item.recorte) === normalizarBusca(recorte),
      );
      const cores = [CORES.verde, CORES.azulEscuro, CORES.vermelho];
      return {
        x: serie.map((item) => String(item.ano)),
        y: serie.map((item) => item.percentual),
        text: serie.map((item) => percentual(item.percentual, 1)),
        name: recorte,
        type: "scatter",
        mode: "lines+markers",
        line: { color: cores[indice], width: recorte === "Piauí" ? 4 : 2 },
        marker: { size: recorte === "Piauí" ? 9 : 7 },
        hovertemplate: "%{x}<br><b>%{text}</b><extra>%{fullData.name}</extra>",
      };
    }),
    layoutBase({
      legend: { orientation: "h", y: 1.14, x: 0 },
      xaxis: { ...eixoBasico(), type: "category" },
      yaxis: { ...eixoBasico("%"), range: [99.2, 100] },
    }),
    CONFIG_PLOTLY,
  );

  const disponibilidade = dados.gerais.disponibilidade_2025.filter(
    (item) => normalizarBusca(item.indicador) === "disponibilidade parcial ou irregular",
  );
  Plotly.react(
    "grafico-disponibilidade",
    [{
      x: disponibilidade.map((item) => item.percentual),
      y: disponibilidade.map((item) => item.recorte),
      text: disponibilidade.map((item) => percentual(item.percentual, 1)),
      type: "bar",
      orientation: "h",
      marker: { color: [CORES.vermelho, CORES.azulClaro, CORES.cinza] },
      textposition: "outside",
      cliponaxis: false,
      hovertemplate: "%{y}<br><b>%{text}</b><extra></extra>",
    }],
    layoutBase({
      showlegend: false,
      margin: { l: 85, r: 45, t: 18, b: 44 },
      xaxis: { ...eixoBasico("%"), range: [0, 3], tickvals: [0, 1, 2, 3] },
      yaxis: eixoBasico(),
    }),
    CONFIG_PLOTLY,
  );

  const fruicaoPiaui = dados.gerais.fruicao_2025.filter(
    (item) => normalizarBusca(item.recorte) === "piaui",
  );
  const equipamentos = [
    ["microcomputador", "Sem microcomputador"],
    ["maquina de lavar", "Sem máquina de lavar"],
    ["televisao", "Sem televisão"],
    ["geladeira", "Sem geladeira"],
  ];
  const fruicao = equipamentos.map(([chave, rotulo]) => {
    const registro = fruicaoPiaui.find((item) =>
      normalizarBusca(item.indicador).includes(chave),
    );
    return { ...registro, rotulo };
  });
  Plotly.react(
    "grafico-fruicao",
    [{
      x: fruicao.map((item) => item.rotulo),
      y: fruicao.map((item) => item.percentual),
      text: fruicao.map((item) => percentual(item.percentual, 1)),
      type: "bar",
      marker: { color: CORES.azul },
      textposition: "outside",
      cliponaxis: false,
      hovertemplate: "%{x}<br><b>%{text}</b><extra></extra>",
    }],
    layoutBase({
      showlegend: false,
      margin: { l: 50, r: 20, t: 18, b: 72 },
      xaxis: { ...eixoBasico(), type: "category", tickfont: { size: 10 } },
      yaxis: { ...eixoBasico("%"), range: [0, 85] },
    }),
    CONFIG_PLOTLY,
  );
}

function registroContinuidade(codigo, ano) {
  return dados.continuidade.find(
    (item) => item.codigo_ibge === codigo && Number(item.ano) === Number(ano),
  );
}

function registrosContinuidadeReferencia() {
  const unicos = new Map();
  dados.continuidade.forEach((item) => {
    if (!unicos.has(item.codigo_ibge)) unicos.set(item.codigo_ibge, item);
  });
  return [...unicos.values()];
}

function renderizarQualidade() {
  const registrosReferencia = registrosContinuidadeReferencia();
  const todos = !estado.codigoMunicipio;
  const registro = todos
    ? {
        continuidade_d2_referencia: media(
          registrosReferencia,
          "continuidade_d2_referencia",
        ),
        dec_referencia: media(registrosReferencia, "dec_referencia"),
        fec_referencia: media(registrosReferencia, "fec_referencia"),
        classificacao_continuidade_referencia: null,
      }
    : registrosReferencia.find((item) => item.codigo_ibge === estado.codigoMunicipio);
  const municipio = dados.municipiosPorCodigo.get(estado.codigoMunicipio);
  const ranking = [...registrosReferencia].sort(
    (a, b) => a.continuidade_d2_referencia - b.continuidade_d2_referencia,
  );
  const posicao = todos
    ? null
    : ranking.findIndex((item) => item.codigo_ibge === estado.codigoMunicipio) + 1;

  document.getElementById("qualidade-referencia").textContent = "Referência: 2023–2025";
  document.getElementById("qualidade-ranking-ano").textContent = "2023–2025";
  document.getElementById("qualidade-municipio").textContent = todos
    ? "Média dos 224 municípios"
    : municipio.municipio;
  document.getElementById("qualidade-serie-titulo").textContent = todos
    ? "Série estadual"
    : "Série municipal";
  document.getElementById("qualidade-d2").textContent = numero(
    registro.continuidade_d2_referencia,
    2,
  );
  document.getElementById("qualidade-classe").textContent = todos
    ? "média municipal"
    : registro.classificacao_continuidade_referencia;
  document.getElementById("qualidade-dec").textContent = numero(registro.dec_referencia, 2);
  document.getElementById("qualidade-fec").textContent = numero(registro.fec_referencia, 2);
  document.getElementById("qualidade-posicao").textContent = posicao ? `${posicao}ª` : "—";

  criarMapaCoropletico({
    id: "mapa-qualidade",
    registros: registrosReferencia,
    campoValor: "continuidade_d2_referencia",
    tituloValor: "D2 de referência",
    unidade: "pontos",
    escala: [[0, "#eff3ff"], [0.25, "#bdd7e7"], [0.5, "#6baed6"], [0.75, "#3182bd"], [1, "#08519c"]],
    reversa: false,
    campoClasse: "classificacao_continuidade_referencia",
  });

  const serie = todos
    ? [2023, 2024, 2025].map((anoSerie) => {
        const registrosSerie = dados.continuidade.filter((item) => Number(item.ano) === anoSerie);
        return { ano: anoSerie, continuidade_d2: media(registrosSerie, "continuidade_d2") };
      })
    : dados.continuidade.filter((item) => item.codigo_ibge === estado.codigoMunicipio);
  Plotly.react(
    "grafico-serie-qualidade",
    [
      {
        x: serie.map((item) => String(item.ano)),
        y: serie.map((item) => item.continuidade_d2),
        text: serie.map((item) => numero(item.continuidade_d2, 2)),
        name: "Indicador",
        type: "scatter",
        mode: "lines+markers",
        line: { color: CORES.azul, width: 4 },
        marker: { size: 9 },
        hovertemplate: "%{x}<br><b>%{text}</b><extra></extra>",
      },
    ],
    layoutBase({
      showlegend: false,
      xaxis: { ...eixoBasico(), type: "category" },
      yaxis: { ...eixoBasico("pontos"), range: [0, 100] },
    }),
    CONFIG_PLOTLY,
  );

  criarRanking({
    id: "grafico-ranking-qualidade",
    registros: ranking.slice(0, 15),
    campoValor: "continuidade_d2_referencia",
    cor: CORES.azul,
    unidade: "pontos",
    menoresPrimeiro: true,
  });
}

function registroInclusao(codigo, ano) {
  return dados.inclusao.find(
    (item) => item.codigo_ibge === codigo && Number(item.ano) === Number(ano),
  );
}

function registroDependencia(codigo, ano) {
  return dados.dependencia.find(
    (item) => item.codigo_ibge === codigo && Number(item.ano) === Number(ano),
  );
}

function agregarInclusao(registros, ano) {
  const elegiveis = soma(registros, "familias_elegiveis");
  const beneficiarias = soma(registros, "unidades_beneficiarias");
  return {
    ano,
    familias_elegiveis: elegiveis,
    unidades_beneficiarias: beneficiarias,
    cobertura_tarifa_social_percentual: elegiveis ? (beneficiarias / elegiveis) * 100 : null,
  };
}

function agregarDependencia(registros, ano) {
  const residenciais = soma(registros, "unidades_residenciais");
  const beneficiarias = soma(registros, "unidades_beneficiarias");
  return {
    ano,
    unidades_residenciais: residenciais,
    unidades_beneficiarias: beneficiarias,
    dependencia_tarifaria_percentual: residenciais ? (beneficiarias / residenciais) * 100 : null,
  };
}

function renderizarTarifa() {
  const ano = estado.ano;
  const todos = !estado.codigoMunicipio;
  const municipio = dados.municipiosPorCodigo.get(estado.codigoMunicipio);
  const inclusoesAno = dados.inclusao.filter((item) => Number(item.ano) === ano);
  const dependenciasAno = dados.dependencia.filter((item) => Number(item.ano) === ano);
  const inclusao = todos
    ? agregarInclusao(inclusoesAno, ano)
    : registroInclusao(estado.codigoMunicipio, ano);
  const dependencia = todos
    ? agregarDependencia(dependenciasAno, ano)
    : registroDependencia(estado.codigoMunicipio, ano);
  const geral = dados.gerais.tarifa_social_2025;

  document.getElementById("tarifa-referencia").textContent = `Ano: ${ano}`;
  document.getElementById("tarifa-elegiveis").textContent = numero(inclusao.familias_elegiveis);
  document.getElementById("tarifa-beneficiarias").textContent = numero(inclusao.unidades_beneficiarias);
  document.getElementById("tarifa-cobertura").textContent = percentual(
    inclusao.cobertura_tarifa_social_percentual,
    2,
  );
  document.getElementById("tarifa-dependencia").textContent = percentual(
    dependencia.dependencia_tarifaria_percentual,
    2,
  );
  document.getElementById("tarifa-elegiveis-ano").textContent = String(ano);
  document.getElementById("tarifa-beneficiarias-ano").textContent = String(ano);
  document.getElementById("tarifa-municipio").textContent = todos
    ? "Todos os municípios"
    : municipio.municipio;
  document.getElementById("tarifa-serie-titulo").textContent = todos
    ? "Série estadual"
    : "Série municipal";
  const recorte = todos ? "total estadual" : "município selecionado";
  document.getElementById("tarifa-cobertura-recorte").textContent = recorte;
  document.getElementById("tarifa-dependencia-recorte").textContent = recorte;

  document.getElementById("estado-elegiveis").textContent = numero(geral.familias_elegiveis);
  document.getElementById("estado-beneficiarias").textContent = numero(geral.unidades_beneficiarias);
  document.getElementById("estado-cobertura").textContent = percentual(
    geral.cobertura_estimada_percentual,
    2,
  );
  document.getElementById("estado-dependencia").textContent = percentual(
    geral.dependencia_estadual_percentual,
    2,
  );

  const coberturaAtiva = estado.indicadorTarifa === "cobertura";
  const registrosAno = coberturaAtiva ? inclusoesAno : dependenciasAno;
  const campo = coberturaAtiva
    ? "cobertura_tarifa_social_percentual"
    : "dependencia_tarifaria_percentual";
  const titulo = coberturaAtiva ? "Cobertura estimada da Tarifa Social" : "Dependência tarifária";
  const cor = coberturaAtiva ? CORES.verde : CORES.vermelho;
  const escala = coberturaAtiva
    ? [[0, "#edf8e9"], [0.35, "#bae4b3"], [0.7, "#74c476"], [1, "#238b45"]]
    : [[0, "#fff5f0"], [0.35, "#fcbba1"], [0.7, "#fb6a4a"], [1, "#cb181d"]];

  document.getElementById("tarifa-mapa-titulo").textContent = titulo;
  document.getElementById("tarifa-ranking-subtitulo").textContent = `${
    coberturaAtiva ? "Cobertura" : "Dependência"
  } · ${ano}`;

  criarMapaCoropletico({
    id: "mapa-tarifa",
    registros: registrosAno,
    campoValor: campo,
    tituloValor: titulo,
    unidade: "%",
    escala,
    reversa: false,
  });

  const serieInclusao = todos
    ? [2023, 2024, 2025].map((anoSerie) =>
        agregarInclusao(
          dados.inclusao.filter((item) => Number(item.ano) === anoSerie),
          anoSerie,
        ),
      )
    : dados.inclusao.filter((item) => item.codigo_ibge === estado.codigoMunicipio);
  const serieDependencia = todos
    ? [2023, 2024, 2025].map((anoSerie) =>
        agregarDependencia(
          dados.dependencia.filter((item) => Number(item.ano) === anoSerie),
          anoSerie,
        ),
      )
    : dados.dependencia.filter((item) => item.codigo_ibge === estado.codigoMunicipio);
  Plotly.react(
    "grafico-serie-tarifa",
    [
      {
        x: serieInclusao.map((item) => String(item.ano)),
        y: serieInclusao.map((item) => item.cobertura_tarifa_social_percentual),
        text: serieInclusao.map((item) => percentual(item.cobertura_tarifa_social_percentual, 2)),
        name: "Cobertura",
        type: "scatter",
        mode: "lines+markers",
        line: { color: CORES.verde, width: 3 },
        marker: { size: 8 },
        hovertemplate: "%{x}<br><b>%{text}</b><extra>Cobertura</extra>",
      },
      {
        x: serieDependencia.map((item) => String(item.ano)),
        y: serieDependencia.map((item) => item.dependencia_tarifaria_percentual),
        text: serieDependencia.map((item) => percentual(item.dependencia_tarifaria_percentual, 2)),
        name: "Dependência",
        type: "scatter",
        mode: "lines+markers",
        line: { color: CORES.vermelho, width: 3 },
        marker: { size: 8 },
        hovertemplate: "%{x}<br><b>%{text}</b><extra>Dependência</extra>",
      },
    ],
    layoutBase({
      legend: { orientation: "h", y: 1.13, x: 0 },
      xaxis: { ...eixoBasico(), type: "category" },
      yaxis: { ...eixoBasico("%"), rangemode: "tozero" },
    }),
    CONFIG_PLOTLY,
  );

  const ranking = [...registrosAno].sort((a, b) => b[campo] - a[campo]).slice(0, 15);
  criarRanking({
    id: "grafico-ranking-tarifa",
    registros: ranking,
    campoValor: campo,
    cor,
    unidade: "%",
  });

  const suspensoes = dados.gerais.suspensoes;
  Plotly.react(
    "grafico-suspensoes",
    [
      {
        x: suspensoes.map((item) => item.categoria),
        y: suspensoes.map((item) => item.ano_2024),
        name: "2024",
        type: "bar",
        marker: { color: CORES.azulClaro },
        hovertemplate: "%{x}<br><b>%{y:,.0f}</b><extra>2024</extra>",
      },
      {
        x: suspensoes.map((item) => item.categoria),
        y: suspensoes.map((item) => item.ano_2025),
        name: "2025",
        type: "bar",
        marker: { color: CORES.azulEscuro },
        hovertemplate: "%{x}<br><b>%{y:,.0f}</b><extra>2025</extra>",
      },
    ],
    layoutBase({
      barmode: "group",
      legend: { orientation: "h", y: 1.18, x: 0 },
      margin: { l: 50, r: 10, t: 16, b: 78 },
      xaxis: { ...eixoBasico(), tickfont: { size: 9 } },
      yaxis: { ...eixoBasico("registros"), tickformat: ".2s" },
    }),
    CONFIG_PLOTLY,
  );
}

function renderizarIvel() {
  const todos = !estado.codigoMunicipio;
  const registro = todos
    ? {
        municipio: "Todos os municípios",
        ivel_2025: media(dados.ivel, "ivel_2025"),
        classificacao_ivel: "Média municipal",
        qualidade_servico: media(dados.ivel, "qualidade_servico"),
        insuficiencia_renda: media(dados.ivel, "insuficiencia_renda"),
        dependencia_tarifaria_ivel: media(dados.ivel, "dependencia_tarifaria_ivel"),
      }
    : dados.ivelPorCodigo.get(estado.codigoMunicipio);
  const municipio = dados.municipiosPorCodigo.get(estado.codigoMunicipio);
  const ranking = [...dados.ivel].sort((a, b) => b.ivel_2025 - a.ivel_2025);
  const posicao = todos
    ? null
    : ranking.findIndex((item) => item.codigo_ibge === estado.codigoMunicipio) + 1;
  const limite = dados.gerais.ivel_2025.limite_classe_muito_alta;

  document.getElementById("ivel-posicao").textContent = posicao
    ? `${posicao}ª posição estadual`
    : "Média dos 224 municípios";
  document.getElementById("ivel-municipio").textContent = registro.municipio;
  document.getElementById("ivel-territorio").textContent = todos
    ? "Piauí"
    : municipio.territorio_desenvolvimento;
  document.getElementById("ivel-valor").textContent = numero(registro.ivel_2025, 2);
  document.getElementById("ivel-classe").textContent = todos
    ? "Média municipal"
    : `Classe ${registro.classificacao_ivel.toLocaleLowerCase("pt-BR")}`;
  document.getElementById("ivel-qualidade").textContent = numero(registro.qualidade_servico, 2);
  document.getElementById("ivel-renda").textContent = numero(registro.insuficiencia_renda, 2);
  document.getElementById("ivel-dependencia").textContent = numero(
    registro.dependencia_tarifaria_ivel,
    2,
  );
  document.getElementById("ivel-perfil").textContent = classificarPerfilIvel(registro, limite);

  const eixos = ["Qualidade", "Renda", "Dependência", "Qualidade"];
  const valores = [
    registro.qualidade_servico,
    registro.insuficiencia_renda,
    registro.dependencia_tarifaria_ivel,
    registro.qualidade_servico,
  ];
  const referencia = [limite, limite, limite, limite];

  Plotly.react(
    "grafico-radar-ivel",
    [
      {
        type: "scatterpolar",
        r: referencia,
        theta: eixos,
        mode: "lines",
        name: `Limite muito alta (${numero(limite, 2)})`,
        line: { color: CORES.cinza, width: 2, dash: "dot" },
        hoverinfo: "skip",
      },
      {
        type: "scatterpolar",
        r: valores,
        theta: eixos,
        mode: "lines+markers",
        fill: "toself",
        fillcolor: "rgba(39, 99, 173, 0.17)",
        name: registro.municipio,
        line: { color: "#2763ad", width: 4 },
        marker: {
          size: 10,
          color: ["#2763ad", CORES.vermelho, CORES.verde, "#2763ad"],
        },
        text: valores.map((valor) => numero(valor, 2)),
        hovertemplate: "%{theta}<br><b>%{text}</b><extra></extra>",
      },
    ],
    layoutBase({
      margin: { l: 45, r: 45, t: 28, b: 42 },
      showlegend: false,
      polar: {
        bgcolor: "rgba(0,0,0,0)",
        radialaxis: {
          visible: true,
          range: [0, 100],
          tickvals: [0, 25, 50, 75, 100],
          tickfont: { size: 9, color: "#7c8a98" },
          gridcolor: "#cbd6df",
          linecolor: "#cbd6df",
        },
        angularaxis: {
          gridcolor: "#d7e0e8",
          linecolor: "#cbd6df",
          tickfont: { size: 12, color: CORES.texto },
        },
      },
    }),
    CONFIG_PLOTLY,
  );

  criarMapaCoropletico({
    id: "mapa-ivel",
    registros: dados.ivel,
    campoValor: "ivel_2025",
    tituloValor: "IVEL",
    unidade: "pontos",
    escala: [
      [0, "#fff7bc"],
      [0.25, "#fec44f"],
      [0.5, "#fe9929"],
      [0.75, "#e34a33"],
      [1, "#8c1d40"],
    ],
    reversa: false,
    campoClasse: "classificacao_ivel",
    coresClasses: {
      "Muito baixa": "#fff7bc",
      Baixa: "#fec44f",
      Média: "#fe9929",
      Alta: "#e34a33",
      "Muito alta": "#8c1d40",
    },
  });

  criarRanking({
    id: "grafico-ranking-ivel",
    registros: ranking.slice(0, 15),
    campoValor: "ivel_2025",
    cor: CORES.vermelho,
    unidade: "pontos",
  });

}

function classificarPerfilIvel(registro, limite) {
  const dimensoes = [
    ["técnico", registro.qualidade_servico],
    ["socioeconômico", registro.insuficiencia_renda],
    ["tarifário", registro.dependencia_tarifaria_ivel],
  ];
  const acima = dimensoes.filter(([, valor]) => valor > limite);
  if (acima.length >= 2) return "Multidimensional";
  const maior = [...dimensoes].sort((a, b) => b[1] - a[1])[0][0];
  return `Predominância ${maior}`;
}

function criarMapaCoropletico({
  id,
  registros,
  campoValor,
  tituloValor,
  unidade,
  escala,
  reversa,
  campoClasse = null,
  coresClasses = null,
}) {
  const classes = coresClasses ? Object.keys(coresClasses) : [];
  const valores = coresClasses
    ? registros.map((item) => classes.indexOf(item[campoClasse]))
    : registros.map((item) => item[campoValor]);
  const escalaMapa = coresClasses
    ? criarEscalaDiscreta(classes.map((classe) => coresClasses[classe]))
    : escala;
  const textos = registros.map((item) => {
    const classe = campoClasse && item[campoClasse] ? `<br>${item[campoClasse]}` : "";
    const sufixo = unidade === "%" ? "%" : ` ${unidade}`;
    return `<b>${item.municipio}</b><br>${tituloValor}: ${numero(item[campoValor], 2)}${sufixo}${classe}`;
  });

  Plotly.react(
    id,
    [{
      type: "choropleth",
      geojson: dados.geografia,
      featureidkey: "properties.codigo_ibge",
      locations: registros.map((item) => item.codigo_ibge),
      z: valores,
      zmin: coresClasses ? 0 : undefined,
      zmax: coresClasses ? classes.length - 1 : undefined,
      text: textos,
      colorscale: escalaMapa,
      reversescale: reversa,
      showscale: !coresClasses,
      marker: { line: { color: "#ffffff", width: 0.55 } },
      colorbar: {
        title: { text: unidade, side: "top" },
        thickness: 12,
        len: 0.72,
        outlinewidth: 0,
        tickfont: { size: 10 },
      },
      hovertemplate: "%{text}<extra></extra>",
    }],
    layoutBase({
      margin: { l: 4, r: 4, t: 4, b: 4 },
      geo: {
        fitbounds: "locations",
        visible: false,
        bgcolor: "rgba(0,0,0,0)",
        projection: { type: "mercator" },
      },
    }),
    CONFIG_PLOTLY,
  );
  registrarClique(id, (ponto) => selecionarMunicipio(ponto.location));
}

function criarEscalaDiscreta(cores) {
  const ultimoIndice = cores.length - 1;
  return cores.flatMap((cor, indice) => {
    const inicio = indice === 0 ? 0 : (indice - 0.5) / ultimoIndice;
    const fim = indice === ultimoIndice ? 1 : (indice + 0.5) / ultimoIndice;
    return [[inicio, cor], [fim, cor]];
  });
}

function criarRanking({ id, registros, campoValor, cor, unidade, menoresPrimeiro = false }) {
  const ordenados = [...registros].sort((a, b) =>
    menoresPrimeiro ? b[campoValor] - a[campoValor] : a[campoValor] - b[campoValor],
  );
  Plotly.react(
    id,
    [{
      x: ordenados.map((item) => item[campoValor]),
      y: ordenados.map((item) => item.municipio),
      text: ordenados.map((item) =>
        unidade === "%" ? percentual(item[campoValor], 2) : numero(item[campoValor], 2),
      ),
      customdata: ordenados.map((item) => item.codigo_ibge),
      type: "bar",
      orientation: "h",
      marker: {
        color: ordenados.map((item) =>
          item.codigo_ibge === estado.codigoMunicipio ? CORES.amarelo : cor,
        ),
      },
      textposition: "outside",
      cliponaxis: false,
      hovertemplate: "%{y}<br><b>%{text}</b><extra></extra>",
    }],
    layoutBase({
      showlegend: false,
      margin: { l: 155, r: 55, t: 16, b: 42 },
      xaxis: { ...eixoBasico(unidade), rangemode: "tozero" },
      yaxis: { ...eixoBasico(), tickfont: { size: 10 } },
    }),
    CONFIG_PLOTLY,
  );
  registrarClique(id, (ponto) => selecionarMunicipio(String(ponto.customdata)));
}

function registrarClique(id, callback) {
  const elemento = document.getElementById(id);
  if (typeof elemento.removeAllListeners === "function") {
    elemento.removeAllListeners("plotly_click");
  }
  elemento.on("plotly_click", (evento) => {
    const ponto = evento.points?.[0];
    if (ponto) callback(ponto);
  });
}
