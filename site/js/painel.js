"use strict";

const VERSAO_FRONTEND = "20261116-03";

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
  displayModeBar: false,
  displaylogo: false,
  showSendToCloud: false,
  scrollZoom: false,
  doubleClick: false,
  editable: false,
};

const estado = {
  ano: 2025,
  codigoMunicipio: null,
  aba: "geral",
  indicadorTarifa: "cobertura",
  detalheRendaAberto: false,
  comparacaoAtiva: false,
  municipiosComparacao: [],
  territoriosAtivos: false,
  avisoComparacao: "",
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
      territorios,
      gerais,
      pacote,
    ] = await Promise.all([
      carregarJson("dados/municipios.json"),
      carregarJson("dados/ivel/ivel_municipal_2025.json"),
      carregarJson("dados/qualidade/continuidade_municipal.json"),
      carregarJson("dados/tarifa/inclusao_tarifaria_municipal.json"),
      carregarJson("dados/tarifa/dependencia_tarifaria_municipal.json"),
      carregarJson("dados/geografia/municipios_pi.geojson"),
      carregarJson("dados/geografia/territorios_desenvolvimento_pi.geojson"),
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
      territorios,
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

  if (parametros.get("territorios") === "1") estado.territoriosAtivos = true;
  const comparar = (parametros.get("comparar") || "")
    .split(",")
    .map((nome) => normalizarBusca(nome))
    .filter(Boolean)
    .slice(0, 3);
  if (comparar.length) {
    estado.comparacaoAtiva = true;
    estado.municipiosComparacao = comparar
      .map((nome) => dados.municipiosOrdenados.find(
        (item) => normalizarBusca(item.municipio) === nome,
      )?.codigo_ibge)
      .filter(Boolean);
    estado.codigoMunicipio = estado.municipiosComparacao.at(-1) ?? estado.codigoMunicipio;
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

  const gatilhoMunicipios = document.getElementById("abrir-municipios");
  const campo = document.getElementById("filtro-municipio");
  gatilhoMunicipios.addEventListener("click", () => {
    const aberto = document.getElementById("menu-municipios").classList.contains("aberto");
    if (aberto) {
      fecharSugestoes();
      return;
    }
    campo.value = "";
    mostrarSugestoes("");
    campo.focus();
  });
  campo.addEventListener("input", () => mostrarSugestoes(campo.value));
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      const primeira = normalizarBusca(campo.value)
        ? document.querySelector(".sugestao:not(.sugestao--todos)")
        : document.querySelector(".sugestao");
      if (primeira) {
        evento.preventDefault();
        selecionarMunicipio(primeira.dataset.codigo);
      }
    }
    if (evento.key === "Escape") {
      fecharSugestoes();
      gatilhoMunicipios.focus();
    }
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

  document.getElementById("mostrar-renda").addEventListener("click", () => {
    estado.detalheRendaAberto = !estado.detalheRendaAberto;
    atualizarDetalheRenda();
  });

  document.getElementById("alternar-comparacao").addEventListener("click", () => {
    estado.comparacaoAtiva = !estado.comparacaoAtiva;
    estado.avisoComparacao = "";
    if (estado.comparacaoAtiva && estado.codigoMunicipio) {
      estado.municipiosComparacao = [estado.codigoMunicipio];
    }
    if (!estado.comparacaoAtiva) {
      estado.municipiosComparacao = [];
    }
    atualizarControlesIvel();
    renderizarIvel();
  });

  document.getElementById("alternar-territorios").addEventListener("click", () => {
    estado.territoriosAtivos = !estado.territoriosAtivos;
    atualizarControlesIvel();
    renderizarIvel();
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
    });

  const lista = document.getElementById("sugestoes-municipio");
  lista.replaceChildren();

  const todos = document.createElement("button");
  todos.type = "button";
  todos.className = "sugestao sugestao--todos";
  todos.dataset.codigo = "";
  todos.setAttribute("role", "option");
  todos.setAttribute("aria-selected", String(!estado.codigoMunicipio));
  const marcadorTodos = document.createElement("span");
  marcadorTodos.className = "sugestao__marcador";
  const nomeTodos = document.createElement("strong");
  nomeTodos.textContent = "Todos os municípios";
  todos.append(marcadorTodos, nomeTodos);
  todos.addEventListener("click", () => selecionarMunicipio(null));
  lista.appendChild(todos);

  correspondencias.forEach((item) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "sugestao";
    botao.dataset.codigo = item.codigo_ibge;
    botao.setAttribute("role", "option");
    botao.setAttribute("aria-selected", String(item.codigo_ibge === estado.codigoMunicipio));

    const marcador = document.createElement("span");
    marcador.className = "sugestao__marcador";
    const nome = document.createElement("strong");
    nome.textContent = item.municipio;
    botao.append(marcador, nome);
    botao.addEventListener("click", () => selecionarMunicipio(item.codigo_ibge));
    lista.appendChild(botao);
  });

  if (!correspondencias.length && alvo) {
    const vazio = document.createElement("p");
    vazio.className = "sugestoes__vazio";
    vazio.textContent = "Nenhum município encontrado.";
    lista.appendChild(vazio);
  }

  document.getElementById("menu-municipios").classList.add("aberto");
  document.getElementById("abrir-municipios").setAttribute("aria-expanded", "true");
}

function fecharSugestoes() {
  document.getElementById("menu-municipios").classList.remove("aberto");
  document.getElementById("abrir-municipios").setAttribute("aria-expanded", "false");
}

function selecionarMunicipio(codigo) {
  if (codigo && !dados.municipiosPorCodigo.has(codigo)) return;
  if (estado.aba === "ivel" && estado.comparacaoAtiva) {
    if (!codigo) {
      estado.municipiosComparacao = [];
      estado.avisoComparacao = "";
    } else if (!estado.municipiosComparacao.includes(codigo)) {
      if (estado.municipiosComparacao.length >= 3) {
        estado.avisoComparacao = "O limite de três municípios foi atingido. Remova um para incluir outro.";
        atualizarControlesIvel();
        fecharSugestoes();
        return;
      }
      estado.municipiosComparacao.push(codigo);
      estado.avisoComparacao = "";
    }
  }
  estado.codigoMunicipio = codigo || null;
  atualizarCampoMunicipio();
  atualizarResumoSelecao();
  fecharSugestoes();
  renderizarAbaAtual();
}

function removerMunicipioComparacao(codigo) {
  estado.municipiosComparacao = estado.municipiosComparacao.filter(
    (item) => item !== codigo,
  );
  estado.avisoComparacao = "";
  if (estado.codigoMunicipio === codigo) {
    estado.codigoMunicipio = estado.municipiosComparacao.at(-1) ?? null;
  }
  atualizarCampoMunicipio();
  atualizarResumoSelecao();
  renderizarIvel();
}

function atualizarControlesIvel() {
  const botaoComparacao = document.getElementById("alternar-comparacao");
  const botaoTerritorios = document.getElementById("alternar-territorios");
  const painel = document.getElementById("painel-comparacao");
  const lista = document.getElementById("municipios-comparacao");
  const cores = [CORES.azul, CORES.vermelho, CORES.verde];

  botaoComparacao.setAttribute("aria-pressed", String(estado.comparacaoAtiva));
  botaoTerritorios.setAttribute("aria-pressed", String(estado.territoriosAtivos));
  document.getElementById("estado-limites-ivel").textContent = estado.territoriosAtivos
    ? "Limites dos 12 territórios destacados"
    : "Limites municipais";
  document.getElementById("ivel-mapa-instrucao").textContent = estado.comparacaoAtiva
    ? "Selecione até três municípios"
    : "Selecione um município";

  painel.hidden = !estado.comparacaoAtiva;
  const instrucao = document.getElementById("instrucao-comparacao");
  instrucao.textContent = estado.avisoComparacao
    || "Selecione até três municípios no mapa, no ranking ou no campo Município.";
  instrucao.classList.toggle("aviso", Boolean(estado.avisoComparacao));
  lista.replaceChildren();

  estado.municipiosComparacao.forEach((codigo, indice) => {
    const municipio = dados.municipiosPorCodigo.get(codigo);
    if (!municipio) return;
    const item = document.createElement("span");
    item.className = "municipio-comparacao";
    item.style.color = cores[indice];
    item.append(document.createTextNode(municipio.municipio));
    const remover = document.createElement("button");
    remover.type = "button";
    remover.textContent = "×";
    remover.setAttribute("aria-label", `Remover ${municipio.municipio} da comparação`);
    remover.addEventListener("click", () => removerMunicipioComparacao(codigo));
    item.appendChild(remover);
    lista.appendChild(item);
  });
}

function atualizarCampoMunicipio() {
  const municipio = dados.municipiosPorCodigo.get(estado.codigoMunicipio);
  document.getElementById("municipio-selecionado").textContent =
    municipio?.municipio ?? "Todos os municípios";
  document.getElementById("filtro-municipio").value = "";
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

function moeda(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor));
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
    font: { family: "Arial, Helvetica, sans-serif", color: CORES.texto, size: 12 },
    margin: { l: 50, r: 20, t: 22, b: 48 },
    hoverlabel: {
      bgcolor: "#ffffff",
      bordercolor: CORES.linha,
      font: { family: "Arial, Helvetica, sans-serif", color: CORES.texto },
    },
    dragmode: false,
    ...extra,
  };
}

function eixoBasico(titulo = "") {
  return {
    title: { text: titulo, font: { size: 11 } },
    showgrid: false,
    zeroline: false,
    fixedrange: true,
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
  document.getElementById("geral-acesso-absoluto").textContent =
    `(${numero(acessoPiaui.estimativa_moradores)})`;
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
        name: "Residenciais totais",
        type: "bar",
        marker: { color: CORES.azul },
        hovertemplate: "%{x}<br><b>%{text}</b><extra>Residenciais totais</extra>",
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
      xaxis: {
        ...eixoBasico(),
        type: "category",
        categoryorder: "array",
        categoryarray: ["2023", "2024", "2025"],
      },
      yaxis: { ...eixoBasico(), tickformat: ".2s" },
    }),
    CONFIG_PLOTLY,
  );

  const recortes = ["Brasil", "Nordeste", "Piauí"];
  const seriePiaui = dados.gerais.acesso_energia.filter(
    (item) => normalizarBusca(item.recorte) === "piaui",
  );
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
        customdata: serie.map((item) => numero(item.estimativa_moradores)),
        name: recorte,
        type: "scatter",
        mode: "lines+markers",
        line: { color: cores[indice], width: recorte === "Piauí" ? 4 : 2 },
        marker: { size: recorte === "Piauí" ? 9 : 7 },
        hovertemplate: [
          "%{x}",
          "<br><b>%{y:.1f}%</b>",
          "<br>Estimativa: %{customdata} moradores",
          "<extra>%{fullData.name}</extra>",
        ].join(""),
      };
    }),
    layoutBase({
      legend: { orientation: "h", y: 1.14, x: 0 },
      xaxis: {
        ...eixoBasico(),
        type: "category",
        categoryorder: "array",
        categoryarray: ["2023", "2024", "2025"],
      },
      yaxis: { ...eixoBasico("%"), range: [99.2, 100] },
      annotations: seriePiaui.map((item, indice) => ({
        x: indice,
        y: item.percentual,
        text: percentual(item.percentual, 1),
        showarrow: false,
        yshift: -22,
        bgcolor: "#e5e5e5",
        bordercolor: "#e5e5e5",
        borderpad: 4,
        font: { family: "Arial, Helvetica, sans-serif", color: "#555555", size: 11 },
      })),
    }),
    CONFIG_PLOTLY,
  );

  const disponibilidade = dados.gerais.disponibilidade_2025
    .filter(
      (item) => normalizarBusca(item.indicador) === "disponibilidade parcial ou irregular",
    )
    .sort((a, b) => b.percentual - a.percentual);
  const corDisponibilidade = {
    piaui: CORES.vermelho,
    nordeste: CORES.azulEscuro,
    brasil: CORES.verde,
  };
  Plotly.react(
    "grafico-disponibilidade",
    [{
      x: disponibilidade.map((item) => item.percentual),
      y: disponibilidade.map((item) => item.recorte),
      text: disponibilidade.map(
        (item) => `${percentual(item.percentual, 1)} · ${numero(item.estimativa_domicilios)}`,
      ),
      customdata: disponibilidade.map((item) => numero(item.estimativa_domicilios)),
      type: "bar",
      orientation: "h",
      marker: {
        color: disponibilidade.map((item) => corDisponibilidade[normalizarBusca(item.recorte)]),
      },
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 12 },
      cliponaxis: false,
      hovertemplate: "%{y}<br><b>%{x:.1f}%</b><br>Estimativa: %{customdata} domicílios<extra></extra>",
    }],
    layoutBase({
      showlegend: false,
      margin: { l: 85, r: 18, t: 18, b: 20 },
      xaxis: { ...eixoBasico(), range: [0, 2.45], visible: false },
      yaxis: {
        ...eixoBasico(),
        autorange: "reversed",
        categoryorder: "array",
        categoryarray: disponibilidade.map((item) => item.recorte),
        tickfont: { size: 12 },
      },
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
      text: fruicao.map((item) => numero(item.estimativa_domicilios)),
      customdata: fruicao.map((item) => [
        percentual(item.percentual, 1),
        numero(item.estimativa_domicilios),
      ]),
      type: "bar",
      marker: { color: CORES.azul },
      textposition: "inside",
      insidetextanchor: "middle",
      textfont: { color: "#ffffff", size: 12 },
      cliponaxis: false,
      hovertemplate: "%{x}<br><b>%{customdata[1]} domicílios</b><br>%{customdata[0]}<extra></extra>",
    }],
    layoutBase({
      showlegend: false,
      uniformtext: { minsize: 10, mode: "show" },
      margin: { l: 50, r: 20, t: 18, b: 86 },
      xaxis: { ...eixoBasico(), type: "category", tickfont: { size: 12 } },
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
  const rotuloMunicipio = todos ? "Todos os municípios" : municipio.municipio;
  document.getElementById("tarifa-municipio-cobertura").textContent = rotuloMunicipio;
  document.getElementById("tarifa-municipio-dependencia").textContent = rotuloMunicipio;
  const recorte = todos ? "total estadual" : "município selecionado";
  document.getElementById("tarifa-cobertura-recorte").textContent = recorte;
  document.getElementById("tarifa-dependencia-recorte").textContent = recorte;

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
    "grafico-serie-cobertura",
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
    ],
    layoutBase({
      showlegend: false,
      margin: { l: 48, r: 18, t: 12, b: 38 },
      xaxis: { ...eixoBasico(), type: "category" },
      yaxis: { ...eixoBasico("%"), rangemode: "tozero" },
    }),
    CONFIG_PLOTLY,
  );

  Plotly.react(
    "grafico-serie-dependencia",
    [
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
      showlegend: false,
      margin: { l: 48, r: 18, t: 12, b: 38 },
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
    fonteMunicipios: 13,
    ocultarEixoX: true,
  });
}

function renderizarIvel() {
  atualizarControlesIvel();
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
    ? "Vulnerabilidade elétrica média municipal"
    : `Vulnerabilidade elétrica ${registro.classificacao_ivel.toLocaleLowerCase("pt-BR")}`;
  document.getElementById("ivel-qualidade").textContent = numero(registro.qualidade_servico, 2);
  document.getElementById("ivel-renda").textContent = numero(registro.insuficiencia_renda, 2);
  document.getElementById("ivel-dependencia").textContent = numero(
    registro.dependencia_tarifaria_ivel,
    2,
  );
  document.getElementById("ivel-perfil").textContent = classificarPerfilIvel(registro, limite);
  atualizarDetalheRenda(registro);

  const eixos = ["Qualidade", "Renda", "Dependência", "Qualidade"];
  const referencia = [limite, limite, limite, limite];
  const coresComparacao = [CORES.azul, CORES.vermelho, CORES.verde];
  const registrosRadar = estado.comparacaoAtiva && estado.municipiosComparacao.length
    ? estado.municipiosComparacao
      .map((codigo) => dados.ivelPorCodigo.get(codigo))
      .filter(Boolean)
    : [registro];
  const tracesRadar = [
    {
      type: "scatterpolar",
      r: referencia,
      theta: eixos,
      mode: "lines",
      name: `Limite muito alta (${numero(limite, 2)})`,
      line: { color: CORES.cinza, width: 2, dash: "dot" },
      hoverinfo: "skip",
      showlegend: false,
    },
    ...registrosRadar.map((item, indice) => {
      const valores = [
        item.qualidade_servico,
        item.insuficiencia_renda,
        item.dependencia_tarifaria_ivel,
        item.qualidade_servico,
      ];
      const cor = coresComparacao[indice] ?? CORES.azul;
      return {
        type: "scatterpolar",
        r: valores,
        theta: eixos,
        mode: "lines+markers",
        fill: "toself",
        fillcolor: corComTransparencia(cor, 0.12),
        name: item.municipio,
        line: { color: cor, width: 3 },
        marker: { size: 8, color: cor },
        text: valores.map((valor) => numero(valor, 2)),
        hovertemplate: "%{theta}<br><b>%{text}</b><extra>%{fullData.name}</extra>",
      };
    }),
  ];

  Plotly.react(
    "grafico-radar-ivel",
    tracesRadar,
    layoutBase({
      margin: { l: 45, r: 45, t: 28, b: registrosRadar.length > 1 ? 62 : 42 },
      showlegend: registrosRadar.length > 1,
      legend: { orientation: "h", x: 0, y: -0.12, font: { size: 10 } },
      polar: {
        bgcolor: "rgba(0,0,0,0)",
        radialaxis: {
          visible: true,
          range: [0, 100],
          tickvals: [0, 25, 50, 75, 100],
          tickfont: { size: 9, color: "#7c8a98" },
          showgrid: false,
          linecolor: "#cbd6df",
        },
        angularaxis: {
          showgrid: false,
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
    rotuloClasse: "Vulnerabilidade elétrica",
    exibirTerritorios: estado.territoriosAtivos,
    coresClasses: {
      "Muito baixa": "#fff7bc",
      Baixa: "#fec44f",
      Média: "#fe9929",
      Alta: "#e34a33",
      "Muito alta": "#8c1d40",
    },
  });

  const maiorVulnerabilidade = ranking.filter(
    (item) => normalizarBusca(item.classificacao_ivel) === "muito alta",
  );
  const graficoRanking = document.getElementById("grafico-ranking-ivel");
  graficoRanking.style.height = `${Math.max(360, maiorVulnerabilidade.length * 28)}px`;
  document.getElementById("ivel-ranking-faixa").textContent =
    `Faixa muito alta · ${maiorVulnerabilidade.length} municípios · 2025`;

  criarRanking({
    id: "grafico-ranking-ivel",
    registros: maiorVulnerabilidade,
    campoValor: "ivel_2025",
    cor: CORES.vermelho,
    unidade: "pontos",
    fonteMunicipios: 12,
  });

}

function atualizarDetalheRenda(registroAtual = null) {
  const painel = document.getElementById("detalhe-renda");
  const botao = document.getElementById("mostrar-renda");
  const registro = estado.codigoMunicipio
    ? (registroAtual || dados.ivelPorCodigo.get(estado.codigoMunicipio))
    : null;

  painel.hidden = !estado.detalheRendaAberto;
  botao.setAttribute("aria-expanded", String(estado.detalheRendaAberto));
  botao.classList.toggle("ativo", estado.detalheRendaAberto);
  document.getElementById("ivel-renda-media").textContent = registro
    ? moeda(registro.rendimento_domiciliar_medio)
    : "Selecione um município";
  document.getElementById("ivel-renda-fonte").textContent = registro
    ? "Rendimento domiciliar mensal · Censo 2022 (IBGE)"
    : "Selecione um município para consultar o rendimento domiciliar médio.";
}

function corComTransparencia(cor, alfa) {
  const hexadecimal = cor.replace("#", "");
  const vermelho = Number.parseInt(hexadecimal.slice(0, 2), 16);
  const verde = Number.parseInt(hexadecimal.slice(2, 4), 16);
  const azul = Number.parseInt(hexadecimal.slice(4, 6), 16);
  return `rgba(${vermelho}, ${verde}, ${azul}, ${alfa})`;
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
  rotuloClasse = null,
  exibirTerritorios = false,
}) {
  const classes = coresClasses ? Object.keys(coresClasses) : [];
  const valores = coresClasses
    ? registros.map((item) => classes.indexOf(item[campoClasse]))
    : registros.map((item) => item[campoValor]);
  const escalaMapa = coresClasses
    ? criarEscalaDiscreta(classes.map((classe) => coresClasses[classe]))
    : escala;
  const textos = registros.map((item) => {
    const classe = campoClasse && item[campoClasse]
      ? `<br>${rotuloClasse ? `${rotuloClasse} ` : ""}${
        rotuloClasse
          ? item[campoClasse].toLocaleLowerCase("pt-BR")
          : item[campoClasse]
      }`
      : "";
    const sufixo = unidade === "%" ? "%" : ` ${unidade}`;
    return `<b>${item.municipio}</b><br>${tituloValor}: ${numero(item[campoValor], 2)}${sufixo}${classe}`;
  });

  const traces = [{
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
  }];

  if (exibirTerritorios && dados.territorios) {
    const limites = extrairLinhasGeojson(dados.territorios);
    traces.push({
      type: "scattergeo",
      mode: "lines",
      lon: limites.longitude,
      lat: limites.latitude,
      line: { color: "#102f49", width: 2.3 },
      hoverinfo: "skip",
      showlegend: false,
    });
  }

  Plotly.react(
    id,
    traces,
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
  registrarClique(id, (ponto) => {
    if (ponto.location) selecionarMunicipio(ponto.location);
  });
}

function extrairLinhasGeojson(geojson) {
  const longitude = [];
  const latitude = [];
  const adicionarPoligono = (poligono) => {
    poligono.forEach((anel) => {
      anel.forEach(([lon, lat]) => {
        longitude.push(lon);
        latitude.push(lat);
      });
      longitude.push(null);
      latitude.push(null);
    });
  };

  geojson.features.forEach((feature) => {
    const geometria = feature.geometry;
    if (geometria.type === "Polygon") {
      adicionarPoligono(geometria.coordinates);
    } else if (geometria.type === "MultiPolygon") {
      geometria.coordinates.forEach(adicionarPoligono);
    }
  });
  return { longitude, latitude };
}

function criarEscalaDiscreta(cores) {
  const ultimoIndice = cores.length - 1;
  return cores.flatMap((cor, indice) => {
    const inicio = indice === 0 ? 0 : (indice - 0.5) / ultimoIndice;
    const fim = indice === ultimoIndice ? 1 : (indice + 0.5) / ultimoIndice;
    return [[inicio, cor], [fim, cor]];
  });
}

function criarRanking({
  id,
  registros,
  campoValor,
  cor,
  unidade,
  menoresPrimeiro = false,
  fonteMunicipios = 10,
  ocultarEixoX = false,
}) {
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
      margin: {
        l: ocultarEixoX ? 205 : 155,
        r: ocultarEixoX ? 65 : 55,
        t: 16,
        b: ocultarEixoX ? 18 : 42,
      },
      xaxis: ocultarEixoX
        ? { ...eixoBasico(), visible: false, rangemode: "tozero" }
        : { ...eixoBasico(unidade), rangemode: "tozero" },
      yaxis: { ...eixoBasico(), tickfont: { size: fonteMunicipios } },
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
