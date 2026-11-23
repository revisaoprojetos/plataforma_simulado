/* GERADO por scripts/build-motor28.mjs a partir de lib/cronograma/adaptativo/motor30.ts (+ motor28.ts legado) — NÃO editar à mão. */
(function () {
  var defs = {}, cache = {};
  function req(n) { n = String(n).split('/').pop(); if (cache[n]) return cache[n].exports; var m = { exports: {} }; cache[n] = m; defs[n](m, m.exports, req); return m.exports; }
  defs['tipos-meta'] = function (module, exports, require) {
"use strict";
/**
 * REGISTRO ÚNICO DOS TIPOS DE META do Cronograma Adaptativo (A3).
 *
 * Antes, o catálogo de tipos vivia duplicado em motor28.ts (DUR/DUR_REVISAO/offsets), params.ts (defaults), plano-metas.ts
 * (TIPO_NOME/ORDEM_TIPO), meta-ids.ts (rótulos de variantes) e no `TIPOS` literal do iframe. Agora há UMA fonte:
 * slug, rótulo, família, duração padrão, deslocamento padrão, prioridade padrão e ordem de exibição.
 *
 * Módulo PURO (sem imports, sem 'server-only'): é compilado junto do motor para o iframe (window.Motor28).
 * Os VALORES CONFIGURÁVEIS por tenant continuam em params.ts / regras.ts — aqui ficam só os padrões e o vocabulário.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ehSlugMeta = exports.SUFIXO_VARIANTE = exports.ROTULO_VARIANTE = exports.SLUGS_META = exports.TIPOS_META = void 0;
exports.rotuloTipo = rotuloTipo;
exports.ordemTipo = ordemTipo;
exports.familiaDoTipo = familiaDoTipo;
exports.duracaoPadrao = duracaoPadrao;
exports.prioridadesPadrao = prioridadesPadrao;
exports.nomesAlunoPorSlug = nomesAlunoPorSlug;
exports.rotulosPorSlug = rotulosPorSlug;
exports.TIPOS_META = {
    pf: { slug: 'pf', rotulo: 'PDFull', nomeAluno: 'PDFULL', familia: 'pf', duracaoPadraoMin: null, paramDuracao: null, deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 0, ordem: 0 },
    pp: { slug: 'pp', rotulo: 'PDFull (parte)', nomeAluno: 'PDFULL', familia: 'pf', duracaoPadraoMin: null, paramDuracao: null, deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 0, ordem: 0 },
    fl: { slug: 'fl', rotulo: 'PDFlash', nomeAluno: 'Revisão', familia: 'fl', duracaoPadraoMin: 60, paramDuracao: 'durFl', deslocamentoPadraoSem: 1, paramDeslocamento: 'offsetRevisao', prioridade: 1, ordem: 1 },
    qu: { slug: 'qu', rotulo: 'Questões', nomeAluno: 'Questões', familia: 'qu', duracaoPadraoMin: 30, paramDuracao: 'durQu', deslocamentoPadraoSem: 2, paramDeslocamento: 'offsetQuestoes', prioridade: 2, ordem: 2 },
    lp: { slug: 'lp', rotulo: 'LegProc', nomeAluno: 'LegProc', familia: 'lp', duracaoPadraoMin: 30, paramDuracao: 'durLp', deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 6, ordem: 3 },
    rf: { slug: 'rf', rotulo: 'Revisão PDFlash', nomeAluno: 'Revisão', familia: 'fl', duracaoPadraoMin: 60, paramDuracao: 'durRf', deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 1, ordem: 4 },
    rq: { slug: 'rq', rotulo: 'Revisão Questões', nomeAluno: 'Questões', familia: 'qu', duracaoPadraoMin: 30, paramDuracao: 'durRq', deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 2, ordem: 4 },
    jp: { slug: 'jp', rotulo: 'Jurisprudência', nomeAluno: 'Jurisprudência', familia: 'jp', duracaoPadraoMin: 60, paramDuracao: 'jurisprudenciaMin', deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 6, ordem: 4 },
};
exports.SLUGS_META = Object.keys(exports.TIPOS_META);
exports.ROTULO_VARIANTE = {
    revisao: (s) => `Revisão adaptativa (${s === 'pf' ? exports.TIPOS_META.pf.rotulo : exports.TIPOS_META.fl.rotulo})`,
    reforco: (s) => `Reforço (${s === 'pf' ? exports.TIPOS_META.pf.rotulo : exports.TIPOS_META.fl.rotulo})`,
    historico: () => 'Questões (diagnóstico)',
};
/** Sufixos de variante, na forma que aparecem no id. */
exports.SUFIXO_VARIANTE = { revisao: 'revisao', reforco: 'reforco', historico: 'hist' };
const ehSlugMeta = (s) => Object.prototype.hasOwnProperty.call(exports.TIPOS_META, s);
exports.ehSlugMeta = ehSlugMeta;
/** Rótulo do tipo a partir do slug (ou null). */
function rotuloTipo(slug) { return (0, exports.ehSlugMeta)(slug) ? exports.TIPOS_META[slug].rotulo : null; }
/** Ordem de exibição do tipo no dia (9 = desconhecido). */
function ordemTipo(slug) { return (0, exports.ehSlugMeta)(slug) ? exports.TIPOS_META[slug].ordem : 9; }
/** Família do tipo (pp→pf, rf→fl, rq→qu); desconhecido → o próprio slug. */
function familiaDoTipo(slug) { return (0, exports.ehSlugMeta)(slug) ? exports.TIPOS_META[slug].familia : slug; }
/** Duração padrão (min) do tipo; `fallback` quando calculada/desconhecida. */
function duracaoPadrao(slug, fallback = 0) { var _a; return (_a = exports.TIPOS_META[slug].duracaoPadraoMin) !== null && _a !== void 0 ? _a : fallback; }
/** Mapa slug → prioridade padrão (para o dominó). */
function prioridadesPadrao() {
    const o = {};
    for (const s of exports.SLUGS_META)
        o[s] = exports.TIPOS_META[s].prioridade;
    return o;
}
/** Nomes exibidos ao aluno por slug — vão em `conteudo.tiposMeta` do GET; o iframe mantém o literal atual como fallback. */
function nomesAlunoPorSlug() {
    const o = {};
    for (const s of exports.SLUGS_META)
        o[s] = exports.TIPOS_META[s].nomeAluno;
    return o;
}
/** Rótulos por slug — é o que o GET do iframe recebe em `conteudo.tiposMeta`. */
function rotulosPorSlug() {
    const o = {};
    for (const s of exports.SLUGS_META)
        o[s] = exports.TIPOS_META[s].rotulo;
    return o;
}

  };
  defs['regras'] = function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HASH_REGRAS_PADRAO = exports.revisaoEmCiclo = exports.resolverIndiceFaixa = exports.resolverFaixaCarga = exports.REGRAS_PADRAO = exports.ADAPTACAO_PADRAO = exports.CONSTANTES_PADRAO = exports.FAMILIAS_RESTRICAO = exports.TIPOS_RESTRICAO = exports.VERSAO_SCHEMA_REGRAS = void 0;
exports.normalizarRestricoes = normalizarRestricoes;
exports.normalizarOverrides = normalizarOverrides;
exports.normalizarFaixas = normalizarFaixas;
exports.normalizarConstantes = normalizarConstantes;
exports.resolverFaixa = resolverFaixa;
exports.resolverTetoPdf = resolverTetoPdf;
exports.normalizarRegras = normalizarRegras;
exports.resolverRegras = resolverRegras;
exports.hashRegras = hashRegras;
exports.deltaDoPadrao = deltaDoPadrao;
/**
 * REGRAS DO MOTOR DO CRONOGRAMA ADAPTATIVO COMO DADOS (`RegrasMotor`).
 *
 * Reúne as constantes de DECISÃO que até a 3.2.0 estavam hard-coded em motor30.ts/motor28.ts (faixas de carga, tetos de PDFull,
 * periodicidade/modo da revisão, limites por dia, limiares de desempenho, reta final, Jurisprudência, prioridades…).
 * `REGRAS_PADRAO` reproduz EXATAMENTE o comportamento atual (provado pelo golden: `node scripts/_golden-motor.mjs --conferir`).
 *
 * Complementa `params.ts` (ParamsAdaptativo: durações, offsets, ritmo, limites do 2.8). Aqui ficam as regras estruturais do 3.x.
 *
 * Módulo PURO — sem 'server-only', sem zod (é compilado junto do motor p/ o iframe). A validação com zod fica em
 * `regras-validacao.ts` (só servidor/testes). Sem Date.now/Math.random.
 */
const tipos_meta_1 = require("./tipos-meta");
const faixas_carga_1 = require("./faixas-carga");
exports.VERSAO_SCHEMA_REGRAS = 1;
exports.TIPOS_RESTRICAO = ['max_por_dia', 'nao_mesmo_dia', 'nao_dias_seguidos', 'so_na_sobra', 'depois_de'];
exports.FAMILIAS_RESTRICAO = ['pf', 'fl', 'qu', 'lp', 'jp'];
exports.CONSTANTES_PADRAO = {
    blocoMin: 30, questoesBaseDia: 1, reservaCicloDivisor: 3, prioridadesDomino: { revisaoDia: 1, revisaoRepetida: 2, rebaixada: 4 }, cotaPdflashDuracaoMin: 60, cargaMinimaMin: 0,
};
exports.ADAPTACAO_PADRAO = { dominoAtivo: true, reforcoAtivo: true, semanaEspecialAtiva: true, antecipaRetornoAtivo: true };
exports.REGRAS_PADRAO = {
    versaoSchema: exports.VERSAO_SCHEMA_REGRAS,
    horizonte: { maxSemanas: 600 },
    faixas: faixas_carga_1.FAIXAS_PADRAO,
    revisao: {
        cicloSemanas: 4,
        opcoesNovas: [4, 6, 8],
        opcoesLegado: [10, 12],
        padrao: 8,
        antecipaMinSemanas: { fl: 1, qu: 2 },
        giroExternas: 3,
    },
    limitesDia: { pdfDistintos: 2, revisoes: 2, questoes: 2, pdfNovosBase: 1, pdfNovosAposConclusao: 2 },
    divisao: { maxDatas: 3, sobraMinAvancarMin: 60, janelaLeituraInteiraSemanas: 3 },
    legproc: { metasDiaMax: 4, metasDiaBase: 2, mesmaLei: 2, leisDistintas: 2 },
    desempenho: { historicoOkMin: 70, historicoFlashMin: 50, especialPdfAbaixo: 50, especialFlashAte: 70, acertoFracoPct: 60, rankingBonusFraco: 2, rankingPesoDistancia: 8, rankingPenalidadeRevisado: 4 },
    retaFinal: { semanaMinima: 1, limiarTetos: 2, limiarTetosApos: 4, semanaCorteLimiar: 4, semanaEncaixeExtra: 4 },
    juris: { minSemanalMin: 870, diasPreferidos: [4, 5], exigeOptIn: true, reservaCapacidadeRevisaoMin: 60 },
    historico: { metaSemanalBase: 2, metaSemanalAlta: 3, corteAltaMin: 1440 },
    rotina: { fimSemanaFracao: 0.4, fimSemanaDiferencaHoras: 2, diasPdfAteDow: 4, diasRevisao: [4, 5], aquecimentoComQuestoes: 2, aquecimentoSoRevisao: 1 },
    rodizio: { atrasoLimiar: 0.15 },
    equilibrio: { retornosDiaMax: 2, questoesDia: 2, flashesDia: 2 },
    prioridades: { porTipo: (0, tipos_meta_1.prioridadesPadrao)(), outros: 6, faixa3: { fl: 0, qu: 1, pdf: 2 } },
    restricoes: [],
    adaptacao: { ...exports.ADAPTACAO_PADRAO },
    constantes: exports.CONSTANTES_PADRAO,
};
// ── normalização (merge com o padrão + clamp) ────────────────────────────────────────────────────────
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const int = (v, def, min, max) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : def;
};
const real = (v, def, min, max) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const listaInt = (v, def, min, max) => {
    if (!Array.isArray(v))
        return [...def];
    const out = [...new Set(v.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= min && x <= max))].sort((a, b) => a - b);
    return out.length ? out : [...def];
};
/** múltiplo de 30 (os blocos do motor têm 30 min). */
const bloco30 = (v, def, min, max) => Math.round(int(v, def, min, max) / 30) * 30;
const RELACIONAIS = ['nao_mesmo_dia', 'depois_de'];
/** Sanitiza a lista de restrições (descarta entradas inválidas; ids únicos; no máximo 40). */
function normalizarRestricoes(raw) {
    var _a;
    if (!Array.isArray(raw))
        return [];
    const out = [], ids = new Set();
    for (const x of raw) {
        const o = obj(x);
        const tipo = exports.TIPOS_RESTRICAO.find((t) => t === o.tipo);
        const a = exports.FAMILIAS_RESTRICAO.find((f) => f === o.tipoA);
        if (!tipo || !a)
            continue;
        const rel = RELACIONAIS.includes(tipo);
        const b = rel ? ((_a = exports.FAMILIAS_RESTRICAO.find((f) => f === o.tipoB)) !== null && _a !== void 0 ? _a : null) : null;
        if (rel && !b)
            continue;
        let id = typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 40) : `${tipo}:${a}:${b !== null && b !== void 0 ? b : ''}`;
        if (ids.has(id)) {
            let n = 2;
            while (ids.has(`${id}#${n}`))
                n++;
            id = `${id}#${n}`;
        }
        ids.add(id);
        out.push({
            id, tipo, ativa: bool(o.ativa, true), rotulo: (typeof o.rotulo === 'string' ? o.rotulo : '').slice(0, 80), tipoA: a, tipoB: b,
            valor: tipo === 'max_por_dia' ? int(o.valor, 1, 1, 6) : tipo === 'depois_de' ? int(o.valor, 1, 0, 60) : 0,
            faixas: listaInt(o.faixas, [], 1, 3),
        });
        if (out.length >= 40)
            break;
    }
    return out;
}
// ── faixas de carga (dinâmicas) ──────────────────────────────────────────────────────────────────────
const inteiroOuNull = (v, min, max) => {
    if (v == null || v === '')
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : null;
};
const MODO_REV = (v, def) => { var _a; return (_a = faixas_carga_1.MODOS_REVISAO.find((m) => m === v)) !== null && _a !== void 0 ? _a : def; };
const MODO_QU = (v, def) => { var _a; return (_a = faixas_carga_1.MODOS_QUESTOES.find((m) => m === v)) !== null && _a !== void 0 ? _a : def; };
/** Overrides de faixa: reutiliza o clamp da normalização global por seção e mantém SÓ as chaves informadas. */
function normalizarOverrides(raw) {
    const o = obj(raw), out = {};
    for (const sec of faixas_carga_1.SECOES_OVERRIDE) {
        const parcial = obj(o[sec]);
        const chaves = Object.keys(parcial).filter((k) => parcial[k] !== undefined);
        if (!chaves.length)
            continue;
        const completo = normalizarRegras({ [sec]: parcial })[sec];
        const sub = {};
        for (const k of chaves)
            if (k in completo)
                sub[k] = completo[k];
        if (Object.keys(sub).length)
            out[sec] = sub;
    }
    return out;
}
/** Converte o formato legado (faixas{faixa1.., faixa2..} + tetosPdf[4] + revisao.cicloAteMin) em lista de faixas equivalente. */
function faixasDeLegado(r) {
    var _a;
    const fx = obj(r.faixas), rv = obj(r.revisao), D = faixas_carga_1.FAIXAS_PADRAO;
    const f1 = int(fx.faixa1AteMinExclusivo, 900, 300, 3000), f2 = Math.max(f1, int(fx.faixa2AteMinInclusivo, 1470, 300, 5000)), ciclo = int(rv.cicloAteMin, 1470, 0, 6000);
    const linhas = Array.isArray(r.tetosPdf) ? r.tetosPdf : [];
    let anterior = 0;
    const out = D.map((d, k) => {
        const l = obj(linhas[k]), ultima = k === D.length - 1;
        let ate = null;
        if (!ultima) {
            ate = Math.max(anterior, int(l.ateMin, d.maxMin, 0, 6000));
            anterior = ate;
        }
        const rep = ate !== null && ate !== void 0 ? ate : anterior + 1;
        const classe = rep < f1 ? 1 : rep <= f2 ? 2 : 3;
        return {
            ...d, maxMin: ate, tetoPdf: int(l.teto, d.tetoPdf, 1, 12), soRegra23: bool(l.soRegra23, d.soRegra23), equilibra: bool(l.equilibra, d.equilibra),
            revisaoModo: rep <= ciclo ? 'ciclo' : 'desempenho', modoQuestoes: classe === 1 ? 'revisao' : classe === 2 ? 'revisao_pdf' : 'livre', overrides: {},
        };
    });
    let ant = -1;
    for (const f of out) {
        f.minMin = ant + 1;
        ant = (_a = f.maxMin) !== null && _a !== void 0 ? _a : f.minMin;
    }
    return out;
}
/**
 * Sanitiza a lista de faixas: campos com clamp, ordem por limite, contiguidade (min = máx anterior + 1), 1ª em 0 e última sem limite.
 * Aceita também o formato legado (converte). Entrada ausente/vazia = faixas padrão.
 */
function normalizarFaixas(raw) {
    const r = obj(raw);
    const lista = Array.isArray(r.faixas) ? r.faixas : null;
    const legado = !lista && (Array.isArray(r.tetosPdf) || Object.keys(obj(r.faixas)).length > 0 || obj(r.revisao).cicloAteMin !== undefined);
    if (legado)
        return faixasDeLegado(r);
    if (!lista || !lista.length)
        return faixas_carga_1.FAIXAS_PADRAO.map((f) => ({ ...f, overrides: {} }));
    const D = faixas_carga_1.FAIXAS_PADRAO;
    const itens = lista.slice(0, faixas_carga_1.MAX_FAIXAS).map((x, k) => {
        var _a;
        const o = obj(x), d = D[Math.min(k, D.length - 1)];
        const opcoes = Array.isArray(o.opcoesNovas) ? listaInt(o.opcoesNovas, [], 2, 24) : [];
        const opcoesOk = opcoes.length ? opcoes : null;
        const padrao = inteiroOuNull(o.padrao, 2, 24);
        return {
            id: (typeof o.id === 'string' && o.id.trim() ? o.id.trim() : 'f' + (k + 1)).slice(0, 20),
            nome: (typeof o.nome === 'string' && o.nome.trim() ? o.nome.trim() : 'Faixa ' + (k + 1)).slice(0, 40),
            minMin: 0,
            maxMin: o.maxMin == null || o.maxMin === '' ? null : int(o.maxMin, (_a = d.maxMin) !== null && _a !== void 0 ? _a : faixas_carga_1.MAX_MINUTOS_SEMANA, 0, faixas_carga_1.MAX_MINUTOS_SEMANA),
            tetoPdf: int(o.tetoPdf, d.tetoPdf, 1, 12), soRegra23: bool(o.soRegra23, false), equilibra: bool(o.equilibra, false),
            revisaoModo: MODO_REV(o.revisaoModo, d.revisaoModo),
            cicloSemanas: inteiroOuNull(o.cicloSemanas, 2, 12),
            opcoesNovas: opcoesOk,
            padrao: padrao != null && (!opcoesOk || opcoesOk.includes(padrao)) ? padrao : null,
            modoQuestoes: MODO_QU(o.modoQuestoes, d.modoQuestoes),
            overrides: normalizarOverrides(o.overrides),
        };
    });
    // ordena por limite superior (sem limite = por último), garante ids únicos e contiguidade
    itens.sort((a, b) => { var _a, _b; return ((_a = a.maxMin) !== null && _a !== void 0 ? _a : Infinity) - ((_b = b.maxMin) !== null && _b !== void 0 ? _b : Infinity); });
    const ids = new Set();
    let ant = -1;
    itens.forEach((f, k) => {
        var _a, _b;
        let id = f.id;
        if (ids.has(id)) {
            let n = 2;
            while (ids.has(id + '_' + n))
                n++;
            id = id + '_' + n;
        }
        ids.add(id);
        f.id = id;
        f.minMin = ant + 1;
        const ultima = k === itens.length - 1;
        f.maxMin = ultima ? null : Math.max(f.minMin, (_a = f.maxMin) !== null && _a !== void 0 ? _a : f.minMin);
        ant = (_b = f.maxMin) !== null && _b !== void 0 ? _b : f.minMin;
    });
    return itens;
}
/** Constantes estruturais (com clamp). */
function normalizarConstantes(raw) {
    const c = obj(raw), D = exports.CONSTANTES_PADRAO, pd = obj(c.prioridadesDomino);
    return {
        blocoMin: int(c.blocoMin, D.blocoMin, 10, 120),
        questoesBaseDia: int(c.questoesBaseDia, D.questoesBaseDia, 1, 6),
        reservaCicloDivisor: int(c.reservaCicloDivisor, D.reservaCicloDivisor, 1, 12),
        prioridadesDomino: {
            revisaoDia: int(pd.revisaoDia, D.prioridadesDomino.revisaoDia, 0, 20),
            revisaoRepetida: int(pd.revisaoRepetida, D.prioridadesDomino.revisaoRepetida, 0, 20),
            rebaixada: int(pd.rebaixada, D.prioridadesDomino.rebaixada, 0, 20),
        },
        cotaPdflashDuracaoMin: int(c.cotaPdflashDuracaoMin, D.cotaPdflashDuracaoMin, 15, 240),
        cargaMinimaMin: int(c.cargaMinimaMin, D.cargaMinimaMin, 0, 6000),
    };
}
/** Faixa de carga (objeto) para a carga semanal em minutos. */
const resolverFaixaCarga = (minutosSemana, regras = exports.REGRAS_PADRAO) => (0, faixas_carga_1.faixaPorMinutos)(regras.faixas, minutosSemana);
exports.resolverFaixaCarga = resolverFaixaCarga;
/** Índice (0-based) da faixa para a carga semanal. */
const resolverIndiceFaixa = (minutosSemana, regras = exports.REGRAS_PADRAO) => (0, faixas_carga_1.indiceDaFaixa)(regras.faixas, minutosSemana);
exports.resolverIndiceFaixa = resolverIndiceFaixa;
/** Classe legada da faixa de carga (1/2/3) — define onde as questões caem no dia. Padrão: ≤14h30 → 1 · ≤24h30 → 2 · acima → 3. */
function resolverFaixa(minutosSemana, regras = exports.REGRAS_PADRAO) {
    return (0, faixas_carga_1.classeDaFaixa)((0, exports.resolverFaixaCarga)(minutosSemana, regras));
}
/** Teto de PDFulls novos para a carga semanal (min). `regra23=false` pula as faixas `soRegra23` (planos 3.1). */
function resolverTetoPdf(minutosSemana, regra23, regras = exports.REGRAS_PADRAO) {
    const f = (0, faixas_carga_1.faixaDoTeto)(regras.faixas, minutosSemana, regra23);
    return { teto: f.tetoPdf, equilibra: f.equilibra, ateMin: f.maxMin, faixa: f };
}
/** Rotina na revisão em CICLO (obrigatória)? Carga semanal em minutos. */
const revisaoEmCiclo = (minutosSemana, regras = exports.REGRAS_PADRAO) => (0, exports.resolverFaixaCarga)(minutosSemana, regras).revisaoModo === 'ciclo';
exports.revisaoEmCiclo = revisaoEmCiclo;
/**
 * Merge profundo com `REGRAS_PADRAO` + clamp em limites seguros. Entrada qualquer → `RegrasMotor` completo e consistente.
 * `normalizarRegras(undefined)` ≡ `REGRAS_PADRAO` (mesmo conteúdo).
 */
function normalizarRegras(raw) {
    const r = obj(raw), D = exports.REGRAS_PADRAO;
    const hz = obj(r.horizonte), rv = obj(r.revisao), ld = obj(r.limitesDia), dv = obj(r.divisao), lp = obj(r.legproc);
    const ds = obj(r.desempenho), rf = obj(r.retaFinal), jr = obj(r.juris), hs = obj(r.historico), rt = obj(r.rotina), ro = obj(r.rodizio), eq = obj(r.equilibrio), pr = obj(r.prioridades);
    const faixas = normalizarFaixas(r);
    const okMin = int(ds.historicoOkMin, D.desempenho.historicoOkMin, 0, 100);
    const flMin = Math.min(okMin, int(ds.historicoFlashMin, D.desempenho.historicoFlashMin, 0, 100));
    const espFl = int(ds.especialFlashAte, D.desempenho.especialFlashAte, 0, 100);
    const espPf = Math.min(espFl, int(ds.especialPdfAbaixo, D.desempenho.especialPdfAbaixo, 0, 100));
    const opcoesNovas = listaInt(rv.opcoesNovas, D.revisao.opcoesNovas, 2, 24);
    const padrao = int(rv.padrao, D.revisao.padrao, 2, 24);
    const porTipo = { ...D.prioridades.porTipo };
    const pt = obj(pr.porTipo);
    for (const k of Object.keys(porTipo))
        porTipo[k] = int(pt[k], porTipo[k], 0, 20);
    const f3 = obj(pr.faixa3);
    return {
        versaoSchema: exports.VERSAO_SCHEMA_REGRAS,
        horizonte: { maxSemanas: int(hz.maxSemanas, D.horizonte.maxSemanas, 20, 600) },
        faixas,
        revisao: {
            cicloSemanas: int(rv.cicloSemanas, D.revisao.cicloSemanas, 2, 12),
            opcoesNovas,
            opcoesLegado: listaInt(rv.opcoesLegado, D.revisao.opcoesLegado, 2, 24),
            padrao: opcoesNovas.includes(padrao) ? padrao : (opcoesNovas.includes(D.revisao.padrao) ? D.revisao.padrao : opcoesNovas[opcoesNovas.length - 1]),
            antecipaMinSemanas: { fl: int(obj(rv.antecipaMinSemanas).fl, D.revisao.antecipaMinSemanas.fl, 0, 12), qu: int(obj(rv.antecipaMinSemanas).qu, D.revisao.antecipaMinSemanas.qu, 0, 12) },
            giroExternas: int(rv.giroExternas, D.revisao.giroExternas, 0, 20),
        },
        limitesDia: {
            pdfDistintos: int(ld.pdfDistintos, D.limitesDia.pdfDistintos, 1, 6),
            revisoes: int(ld.revisoes, D.limitesDia.revisoes, 1, 6),
            questoes: int(ld.questoes, D.limitesDia.questoes, 1, 6),
            pdfNovosBase: int(ld.pdfNovosBase, D.limitesDia.pdfNovosBase, 1, 6),
            pdfNovosAposConclusao: int(ld.pdfNovosAposConclusao, D.limitesDia.pdfNovosAposConclusao, 1, 6),
        },
        divisao: {
            maxDatas: int(dv.maxDatas, D.divisao.maxDatas, 1, 5),
            sobraMinAvancarMin: bloco30(dv.sobraMinAvancarMin, D.divisao.sobraMinAvancarMin, 30, 240),
            janelaLeituraInteiraSemanas: int(dv.janelaLeituraInteiraSemanas, D.divisao.janelaLeituraInteiraSemanas, 0, 12),
        },
        legproc: {
            metasDiaMax: int(lp.metasDiaMax, D.legproc.metasDiaMax, 1, 12),
            metasDiaBase: int(lp.metasDiaBase, D.legproc.metasDiaBase, 1, 12),
            mesmaLei: int(lp.mesmaLei, D.legproc.mesmaLei, 1, 12),
            leisDistintas: int(lp.leisDistintas, D.legproc.leisDistintas, 1, 6),
        },
        desempenho: {
            historicoOkMin: okMin,
            historicoFlashMin: flMin,
            especialPdfAbaixo: espPf,
            especialFlashAte: espFl,
            acertoFracoPct: int(ds.acertoFracoPct, D.desempenho.acertoFracoPct, 0, 100),
            rankingBonusFraco: real(ds.rankingBonusFraco, D.desempenho.rankingBonusFraco, 0, 20),
            rankingPesoDistancia: real(ds.rankingPesoDistancia, D.desempenho.rankingPesoDistancia, 0, 50),
            rankingPenalidadeRevisado: real(ds.rankingPenalidadeRevisado, D.desempenho.rankingPenalidadeRevisado, 0, 50),
        },
        retaFinal: {
            semanaMinima: int(rf.semanaMinima, D.retaFinal.semanaMinima, 0, 52),
            limiarTetos: int(rf.limiarTetos, D.retaFinal.limiarTetos, 0, 12),
            limiarTetosApos: int(rf.limiarTetosApos, D.retaFinal.limiarTetosApos, 0, 12),
            semanaCorteLimiar: int(rf.semanaCorteLimiar, D.retaFinal.semanaCorteLimiar, 0, 52),
            semanaEncaixeExtra: int(rf.semanaEncaixeExtra, D.retaFinal.semanaEncaixeExtra, 0, 52),
        },
        juris: {
            minSemanalMin: int(jr.minSemanalMin, D.juris.minSemanalMin, 0, 3000),
            diasPreferidos: listaInt(jr.diasPreferidos, D.juris.diasPreferidos, 0, 6),
            exigeOptIn: bool(jr.exigeOptIn, D.juris.exigeOptIn),
            reservaCapacidadeRevisaoMin: int(jr.reservaCapacidadeRevisaoMin, D.juris.reservaCapacidadeRevisaoMin, 0, 240),
        },
        historico: {
            metaSemanalBase: int(hs.metaSemanalBase, D.historico.metaSemanalBase, 0, 7),
            metaSemanalAlta: int(hs.metaSemanalAlta, D.historico.metaSemanalAlta, 0, 7),
            corteAltaMin: int(hs.corteAltaMin, D.historico.corteAltaMin, 0, 6000),
        },
        rotina: {
            fimSemanaFracao: real(rt.fimSemanaFracao, D.rotina.fimSemanaFracao, 0, 1),
            fimSemanaDiferencaHoras: real(rt.fimSemanaDiferencaHoras, D.rotina.fimSemanaDiferencaHoras, 0, 24),
            diasPdfAteDow: int(rt.diasPdfAteDow, D.rotina.diasPdfAteDow, 1, 7),
            diasRevisao: listaInt(rt.diasRevisao, D.rotina.diasRevisao, 0, 6),
            aquecimentoComQuestoes: int(rt.aquecimentoComQuestoes, D.rotina.aquecimentoComQuestoes, 0, 12),
            aquecimentoSoRevisao: int(rt.aquecimentoSoRevisao, D.rotina.aquecimentoSoRevisao, 0, 12),
        },
        rodizio: { atrasoLimiar: real(ro.atrasoLimiar, D.rodizio.atrasoLimiar, 0, 1) },
        equilibrio: {
            retornosDiaMax: int(eq.retornosDiaMax, D.equilibrio.retornosDiaMax, 1, 6),
            questoesDia: int(eq.questoesDia, D.equilibrio.questoesDia, 1, 6),
            flashesDia: int(eq.flashesDia, D.equilibrio.flashesDia, 1, 6),
        },
        prioridades: {
            porTipo,
            outros: int(pr.outros, D.prioridades.outros, 0, 20),
            faixa3: { fl: int(f3.fl, D.prioridades.faixa3.fl, 0, 20), qu: int(f3.qu, D.prioridades.faixa3.qu, 0, 20), pdf: int(f3.pdf, D.prioridades.faixa3.pdf, 0, 20) },
        },
        restricoes: normalizarRestricoes(r.restricoes),
        constantes: normalizarConstantes(r.constantes),
        adaptacao: (() => { const a = obj(r.adaptacao), A = exports.ADAPTACAO_PADRAO; return { dominoAtivo: bool(a.dominoAtivo, A.dominoAtivo), reforcoAtivo: bool(a.reforcoAtivo, A.reforcoAtivo), semanaEspecialAtiva: bool(a.semanaEspecialAtiva, A.semanaEspecialAtiva), antecipaRetornoAtivo: bool(a.antecipaRetornoAtivo, A.antecipaRetornoAtivo) }; })(),
    };
}
/** Resolve as regras de UMA chamada do motor: `ctx.regras` (parcial) normalizado, ou o padrão (mesma referência). */
function resolverRegras(ctx) {
    const r = ctx === null || ctx === void 0 ? void 0 : ctx.regras;
    return r && typeof r === 'object' ? normalizarRegras(r) : exports.REGRAS_PADRAO;
}
// ── hash estável ─────────────────────────────────────────────────────────────────────────────────────
function jsonEstavel(v) {
    var _a;
    if (Array.isArray(v))
        return '[' + v.map(jsonEstavel).join(',') + ']';
    if (v && typeof v === 'object') {
        const o = v;
        return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + jsonEstavel(o[k])).join(',') + '}';
    }
    return (_a = JSON.stringify(v)) !== null && _a !== void 0 ? _a : 'null';
}
/** Hash curto (hex, 53 bits — cyrb53) das regras NORMALIZADAS; estável entre execuções e ordem das chaves. */
function hashRegras(regras) {
    const n = normalizarRegras(regras);
    // Compat: campos introduzidos depois não entram no hash enquanto estiverem no padrão — preserva o hash dos planos gravados antes deles existirem.
    const semRestr = Array.isArray(n.restricoes) && n.restricoes.length === 0, semAdapt = jsonEstavel(n.adaptacao) === jsonEstavel(exports.ADAPTACAO_PADRAO);
    const semConst = jsonEstavel(n.constantes) === jsonEstavel(exports.CONSTANTES_PADRAO);
    const faixasPadrao = jsonEstavel(n.faixas) === jsonEstavel(faixas_carga_1.FAIXAS_PADRAO);
    const base = Object.fromEntries(Object.entries(n).filter(([k]) => !(k === 'restricoes' && semRestr) && !(k === 'adaptacao' && semAdapt) && !(k === 'constantes' && semConst)));
    if (faixasPadrao) {
        // faixas no padrão ≡ formato legado (faixas{} + tetosPdf[] + revisao.cicloAteMin) → mesmo hash de antes das faixas dinâmicas
        base.faixas = { faixa1AteMinExclusivo: 900, faixa2AteMinInclusivo: 1470 };
        base.tetosPdf = [
            { ateMin: 870, teto: 3, soRegra23: true, equilibra: false }, { ateMin: 1470, teto: 4, soRegra23: false, equilibra: false },
            { ateMin: 2100, teto: 5, soRegra23: false, equilibra: true }, { ateMin: null, teto: 6, soRegra23: false, equilibra: false },
        ];
        base.revisao = { ...n.revisao, cicloAteMin: 1470 };
    }
    const s = jsonEstavel(base);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
/** Hash das regras padrão. Plano sem `cfg.regrasHash` = regras padrão. */
exports.HASH_REGRAS_PADRAO = hashRegras(exports.REGRAS_PADRAO);
// ── delta contra o padrão (persistência enxuta: só o que difere do padrão) ───────────────────────────
function difere(a, b) {
    if (Array.isArray(a) || Array.isArray(b) || a === null || b === null || typeof a !== 'object' || typeof b !== 'object')
        return jsonEstavel(a) === jsonEstavel(b) ? undefined : a;
    const o = {};
    for (const k of Object.keys(a)) {
        const d = difere(a[k], b[k]);
        if (d !== undefined)
            o[k] = d;
    }
    return Object.keys(o).length ? o : undefined;
}
/** Só os campos de `regras` (normalizadas) que diferem de `REGRAS_PADRAO`; `{}` = padrão. Arrays vão inteiros. */
function deltaDoPadrao(regras) {
    const n = normalizarRegras(regras);
    const d = difere(n, exports.REGRAS_PADRAO);
    if (!d)
        return {};
    const { versaoSchema: _v, ...resto } = d;
    return resto;
}

  };
  defs['faixas-carga'] = function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseDeRegras = exports.temOverrides = exports.opcoesDaFaixa = exports.cicloDaFaixa = exports.classeDaFaixa = exports.faixaPorMinutos = exports.MAX_MINUTOS_SEMANA = exports.MAX_FAIXAS = exports.FAIXAS_PADRAO = exports.ROTULO_SECAO = exports.SECOES_OVERRIDE = exports.ROTULO_MODO_QUESTOES = exports.ROTULO_MODO_REVISAO = exports.MODOS_QUESTOES = exports.MODOS_REVISAO = void 0;
exports.indiceDaFaixa = indiceDaFaixa;
exports.faixaDoTeto = faixaDoTeto;
exports.textoHoras = textoHoras;
exports.textoIntervalo = textoIntervalo;
exports.validarFaixas = validarFaixas;
exports.padraoDaFaixa = padraoDaFaixa;
exports.aplicarFaixaEmRegras = aplicarFaixaEmRegras;
exports.regrasDaFaixa = regrasDaFaixa;
exports.criarRegrasVivas = criarRegrasVivas;
exports.MODOS_REVISAO = ['ciclo', 'desempenho'];
exports.MODOS_QUESTOES = ['revisao', 'revisao_pdf', 'livre'];
exports.ROTULO_MODO_REVISAO = { ciclo: 'Ciclo obrigatório', desempenho: 'Semana especial por desempenho' };
exports.ROTULO_MODO_QUESTOES = { revisao: 'Só nos dias de revisão', revisao_pdf: 'Dias de revisão e de PDFull', livre: 'Qualquer dia' };
/** Seções de `RegrasMotor` que uma faixa pode sobrescrever (resolução: padrão global → override da faixa). */
exports.SECOES_OVERRIDE = ['limitesDia', 'legproc', 'divisao', 'desempenho', 'juris', 'retaFinal', 'rotina', 'equilibrio', 'adaptacao'];
exports.ROTULO_SECAO = {
    limitesDia: 'Limites por dia', legproc: 'LegProc por dia', divisao: 'Divisão das leituras', desempenho: 'Limiares de desempenho',
    juris: 'Jurisprudência', retaFinal: 'Reta final', rotina: 'Rotina da semana', equilibrio: 'Faixa equilibrada', adaptacao: 'Adaptação (interruptores)',
};
exports.FAIXAS_PADRAO = [
    { id: 'f1', nome: '10h–14h30', minMin: 0, maxMin: 870, tetoPdf: 3, soRegra23: true, equilibra: false, revisaoModo: 'ciclo', cicloSemanas: null, opcoesNovas: null, padrao: null, modoQuestoes: 'revisao', overrides: {} },
    { id: 'f2', nome: '15h–24h30', minMin: 871, maxMin: 1470, tetoPdf: 4, soRegra23: false, equilibra: false, revisaoModo: 'ciclo', cicloSemanas: null, opcoesNovas: null, padrao: null, modoQuestoes: 'revisao_pdf', overrides: {} },
    { id: 'f3', nome: '25h–35h', minMin: 1471, maxMin: 2100, tetoPdf: 5, soRegra23: false, equilibra: true, revisaoModo: 'desempenho', cicloSemanas: null, opcoesNovas: null, padrao: null, modoQuestoes: 'livre', overrides: {} },
    { id: 'f4', nome: 'Acima de 35h', minMin: 2101, maxMin: null, tetoPdf: 6, soRegra23: false, equilibra: false, revisaoModo: 'desempenho', cicloSemanas: null, opcoesNovas: null, padrao: null, modoQuestoes: 'livre', overrides: {} },
];
exports.MAX_FAIXAS = 8;
exports.MAX_MINUTOS_SEMANA = 10080;
/** Índice da faixa que contém a carga semanal (min). Cargas entre faixas (fracionárias) caem na faixa seguinte ao último `maxMin` coberto. */
function indiceDaFaixa(faixas, minutos) {
    for (let k = 0; k < faixas.length; k++) {
        const m = faixas[k].maxMin;
        if (m == null || minutos <= m)
            return k;
    }
    return Math.max(0, faixas.length - 1);
}
const faixaPorMinutos = (faixas, minutos) => faixas[indiceDaFaixa(faixas, minutos)];
exports.faixaPorMinutos = faixaPorMinutos;
/** Classe legada (1/2/3) usada no fluxo diário do motor e nas restrições. */
const classeDaFaixa = (f) => (f.modoQuestoes === 'revisao' ? 1 : f.modoQuestoes === 'revisao_pdf' ? 2 : 3);
exports.classeDaFaixa = classeDaFaixa;
/** Faixa que vale para o TETO: planos sem a regra 23 pulam as faixas `soRegra23`. */
function faixaDoTeto(faixas, minutos, regra23) {
    for (const f of faixas) {
        if (f.soRegra23 && !regra23)
            continue;
        if (f.maxMin == null || minutos <= f.maxMin)
            return f;
    }
    return faixas[faixas.length - 1];
}
/** Texto curto de uma carga em minutos ("14h30", "25h"). */
function textoHoras(min) {
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
/** Descrição do intervalo: "até 14h30", "de 15h a 24h30", "acima de 35h". */
function textoIntervalo(f, k, todas) {
    var _a;
    const ini = k === 0 ? 0 : ((_a = todas[k - 1].maxMin) !== null && _a !== void 0 ? _a : 0);
    if (f.maxMin == null)
        return `acima de ${textoHoras(ini)}`;
    if (k === 0)
        return `até ${textoHoras(f.maxMin)}`;
    return `de ${textoHoras(f.minMin)} a ${textoHoras(f.maxMin)}`;
}
/** Valida a lista de faixas (mensagens pt-BR, vazio = ok). Usada pela UI (ao vivo) e pelo zod do servidor. */
function validarFaixas(faixas) {
    const e = [];
    if (!faixas.length)
        return ['Informe ao menos uma faixa de carga.'];
    if (faixas.length > exports.MAX_FAIXAS)
        e.push(`No máximo ${exports.MAX_FAIXAS} faixas.`);
    const ids = new Set();
    faixas.forEach((f, k) => {
        var _a, _b;
        const nome = ((_a = f.nome) === null || _a === void 0 ? void 0 : _a.trim()) || `Faixa ${k + 1}`;
        if (!((_b = f.nome) === null || _b === void 0 ? void 0 : _b.trim()))
            e.push(`Faixa ${k + 1}: informe o nome.`);
        if (!f.id || ids.has(f.id))
            e.push(`${nome}: identificador repetido ou vazio.`);
        ids.add(f.id);
        const ultima = k === faixas.length - 1;
        if (k === 0 && f.minMin !== 0)
            e.push(`${nome}: a primeira faixa precisa começar em 0 min.`);
        if (k > 0) {
            const ant = faixas[k - 1].maxMin;
            if (ant == null)
                e.push(`${faixas[k - 1].nome}: só a última faixa pode ficar sem limite superior.`);
            else if (f.minMin < ant + 1)
                e.push(`${nome}: sobreposição com a faixa anterior (começa em ${f.minMin} min, a anterior vai até ${ant} min).`);
            else if (f.minMin > ant + 1)
                e.push(`${nome}: lacuna entre a faixa anterior (até ${ant} min) e esta (a partir de ${f.minMin} min).`);
        }
        if (ultima && f.maxMin != null)
            e.push(`${nome}: a última faixa precisa ficar sem limite superior (acima de ${f.minMin} min).`);
        if (!ultima && f.maxMin == null)
            e.push(`${nome}: faixa intermediária precisa de um limite superior.`);
        if (f.maxMin != null && f.maxMin < f.minMin)
            e.push(`${nome}: o máximo (${f.maxMin} min) é menor que o mínimo (${f.minMin} min).`);
        if (!Number.isInteger(f.tetoPdf) || f.tetoPdf < 1 || f.tetoPdf > 12)
            e.push(`${nome}: o teto de PDFull deve ser de 1 a 12.`);
        if (f.cicloSemanas != null && (f.cicloSemanas < 2 || f.cicloSemanas > 12))
            e.push(`${nome}: periodicidade do ciclo deve ser de 2 a 12 semanas.`);
        if (f.opcoesNovas && !f.opcoesNovas.length)
            e.push(`${nome}: informe ao menos uma opção de periodicidade (ou herde a global).`);
        if (f.padrao != null && f.opcoesNovas && !f.opcoesNovas.includes(f.padrao))
            e.push(`${nome}: a periodicidade padrão (${f.padrao}) não está entre as opções da faixa.`);
    });
    return e;
}
/** Faixa efetiva do ciclo/opções/padrão (herda o global quando `null`). */
const cicloDaFaixa = (f, R) => { var _a; return (_a = f.cicloSemanas) !== null && _a !== void 0 ? _a : R.revisao.cicloSemanas; };
exports.cicloDaFaixa = cicloDaFaixa;
const opcoesDaFaixa = (f, R) => { var _a; return (_a = f.opcoesNovas) !== null && _a !== void 0 ? _a : R.revisao.opcoesNovas; };
exports.opcoesDaFaixa = opcoesDaFaixa;
function padraoDaFaixa(f, R) {
    var _a;
    const op = (0, exports.opcoesDaFaixa)(f, R);
    const p = (_a = f.padrao) !== null && _a !== void 0 ? _a : R.revisao.padrao;
    return op.includes(p) ? p : (op.includes(R.revisao.padrao) ? R.revisao.padrao : op[op.length - 1]);
}
/**
 * Aplica EM LUGAR (mutando `vivo`) as seções da faixa sobre a base: `vivo[sec] = { ...base[sec], ...faixa.overrides[sec] }`.
 * Sem override numa seção, `vivo[sec]` volta a ser `base[sec]`. O motor usa um `vivo` próprio (clone) para que as closures vejam a faixa da semana corrente.
 */
function aplicarFaixaEmRegras(vivo, base, faixa) {
    var _a;
    const v = vivo, b = base;
    for (const s of exports.SECOES_OVERRIDE) {
        const o = (_a = faixa === null || faixa === void 0 ? void 0 : faixa.overrides) === null || _a === void 0 ? void 0 : _a[s];
        v[s] = o && Object.keys(o).length ? { ...b[s], ...o } : b[s];
    }
}
/** Alguma faixa tem override? (o motor só clona/alterna regras quando há.) */
const temOverrides = (faixas) => faixas.some((f) => exports.SECOES_OVERRIDE.some((s) => { var _a; return ((_a = f.overrides) === null || _a === void 0 ? void 0 : _a[s]) && Object.keys(f.overrides[s]).length; }));
exports.temOverrides = temOverrides;
/** Regras efetivas de uma faixa (cópia rasa): base + overrides da faixa. */
function regrasDaFaixa(base, faixa) {
    const c = { ...base };
    aplicarFaixaEmRegras(c, base, faixa);
    return c;
}
/** Cópia "viva" das regras para o motor alternar as seções por faixa/semana (a base fica guardada em `__base`, não enumerável). */
function criarRegrasVivas(base) {
    const vivo = { ...base };
    Object.defineProperty(vivo, '__base', { value: base, enumerable: false });
    return vivo;
}
/** Regras-base de um objeto vivo (ou o próprio objeto, se não for vivo). */
const baseDeRegras = (R) => { var _a; return ((_a = R.__base) !== null && _a !== void 0 ? _a : R); };
exports.baseDeRegras = baseDeRegras;

  };
  defs['restricoes'] = function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXEMPLOS_RESTRICOES = exports.restricaoBloqueia = exports.ROTULO_TIPO_RESTRICAO = exports.ROTULO_FAMILIA = void 0;
exports.somaDiasISO = somaDiasISO;
exports.restricaoQueBloqueia = restricaoQueBloqueia;
exports.detectarConflitosRestricoes = detectarConflitosRestricoes;
exports.descreverRestricao = descreverRestricao;
/**
 * RESTRIÇÕES DECLARATIVAS POR PERSONAGEM (tipo de meta) — vocabulário, aplicação no motor, conflitos e exemplos.
 *
 * Módulo PURO (sem zod, sem 'server-only'): é compilado junto do motor para o iframe. Sem restrições ativas, `restricaoBloqueia`
 * devolve `false` na 1ª linha — a saída do motor é idêntica à de antes (provado pelo golden 125/125).
 * A validação (zod) fica em `regras-validacao.ts`; as invariantes da saída ficam em `invariantes.ts`.
 */
const tipos_meta_1 = require("./tipos-meta");
exports.ROTULO_FAMILIA = { pf: 'PDFull', fl: 'PDFlash', qu: 'Questões', lp: 'LegProc', jp: 'Jurisprudência' };
exports.ROTULO_TIPO_RESTRICAO = {
    max_por_dia: 'Máximo por dia',
    nao_mesmo_dia: 'Não no mesmo dia que',
    nao_dias_seguidos: 'Não em dias seguidos',
    so_na_sobra: 'Só na sobra do dia',
    depois_de: 'Depois de',
};
const famDe = (id) => (0, tipos_meta_1.familiaDoTipo)(id.split(':')[0]);
const ehVariante = (id) => /:(revisao|reforco|hist):/.test(id);
function somaDiasISO(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/**
 * A meta `id` NÃO pode ser alocada em `d` por alguma restrição ativa? (consulta pura; não altera nada)
 * `restricoes` vazio → `false` imediatamente.
 */
function restricaoQueBloqueia(restricoes, id, d, ctx) {
    if (!restricoes.length)
        return null;
    const F = famDe(id);
    const minha = F === 'pf' ? ctx.pai(id) : id;
    const chave = (k) => (famDe(k) === 'pf' ? ctx.pai(k) : k);
    for (const r of restricoes) {
        if (!r.ativa)
            continue;
        if (r.faixas.length && !r.faixas.includes(ctx.faixa))
            continue;
        switch (r.tipo) {
            case 'max_por_dia': {
                if (F !== r.tipoA)
                    break;
                const n = new Set(ctx.idsDoDia(d).filter((k) => famDe(k) === F).map(chave));
                n.delete(minha);
                if (n.size >= r.valor)
                    return r;
                break;
            }
            case 'nao_mesmo_dia': {
                const outro = F === r.tipoA ? r.tipoB : F === r.tipoB ? r.tipoA : null;
                if (!outro || outro === F)
                    break;
                if (ctx.idsDoDia(d).some((k) => famDe(k) === outro))
                    return r;
                break;
            }
            case 'nao_dias_seguidos': {
                if (F !== r.tipoA)
                    break;
                for (const v of [somaDiasISO(d, -1), somaDiasISO(d, 1)])
                    if (ctx.idsDoDia(v).some((k) => famDe(k) === F && chave(k) !== minha))
                        return r;
                break;
            }
            case 'so_na_sobra': {
                if (F !== r.tipoA)
                    break;
                if (!ctx.idsDoDia(d).some((k) => famDe(k) !== F) && ctx.haOutrosPendentes(r.tipoA))
                    return r;
                break;
            }
            case 'depois_de': {
                if (F !== r.tipoA || !r.tipoB || ehVariante(id))
                    break;
                if (r.tipoB === 'lp' || r.tipoB === 'jp' || r.tipoA === 'lp' || r.tipoA === 'jp')
                    break;
                const i = id.split(':')[1];
                const dataB = ctx.dataDe(`${r.tipoB}:${i}`);
                if (dataB && d < somaDiasISO(dataB, r.valor))
                    return r;
                break;
            }
        }
    }
    return null;
}
/** Booleano (a consulta usada pelo motor). */
const restricaoBloqueia = (restricoes, id, d, ctx) => restricaoQueBloqueia(restricoes, id, d, ctx) !== null;
exports.restricaoBloqueia = restricaoBloqueia;
const nome = (f) => { var _a; return (_a = exports.ROTULO_FAMILIA[f]) !== null && _a !== void 0 ? _a : f; };
/** Conflitos ENTRE restrições ativas (e de cada uma com o motor). `erros` bloqueiam o salvamento; `avisos` apenas informam. */
function detectarConflitosRestricoes(restricoes) {
    const erros = [], avisos = [];
    const at = restricoes.filter((r) => r.ativa);
    const cobre = (a, b) => !a.faixas.length || !b.faixas.length || a.faixas.some((f) => b.faixas.includes(f));
    for (const r of at) {
        if (r.tipo === 'nao_mesmo_dia' && r.tipoA === r.tipoB)
            erros.push(`${nome(r.tipoA)} não pode ser "não no mesmo dia" dele mesmo (use "Máximo por dia").`);
        if (r.tipo === 'depois_de' && r.tipoA === r.tipoB)
            erros.push(`${nome(r.tipoA)} não pode vir "depois de" ele mesmo.`);
        if (r.tipo === 'depois_de' && [r.tipoA, r.tipoB].some((f) => f === 'lp' || f === 'jp'))
            erros.push('"Depois de" só vale entre PDFull, PDFlash e Questões (LegProc e Jurisprudência não têm ordem por conteúdo).');
        if (r.tipo === 'so_na_sobra' && r.tipoA === 'pf')
            erros.push('PDFull não pode ser "só na sobra do dia": a leitura é o que abre o dia e o plano não fecharia.');
        if (r.tipo === 'nao_dias_seguidos' && r.tipoA === 'pf')
            avisos.push('PDFull "não em dias seguidos" pode impedir que a leitura caiba na semana (o motor então não gera o plano).');
        if (r.tipo === 'max_por_dia' && r.tipoA === 'jp')
            avisos.push('Jurisprudência já é no máximo 1 por semana; o limite por dia não muda o plano.');
    }
    for (let x = 0; x < at.length; x++)
        for (let y = x + 1; y < at.length; y++) {
            const a = at[x], b = at[y];
            if (!cobre(a, b))
                continue;
            // "A não com B" × "B depois de A (0 dia)": um não pode coexistir no mesmo dia, o outro admite o mesmo dia — redundância ambígua.
            for (const [n, d] of [[a, b], [b, a]]) {
                if (n.tipo === 'nao_mesmo_dia' && d.tipo === 'depois_de' && d.valor === 0 && ((n.tipoA === d.tipoA && n.tipoB === d.tipoB) || (n.tipoA === d.tipoB && n.tipoB === d.tipoA)))
                    avisos.push(`"${nome(n.tipoA)} não no mesmo dia que ${nome(n.tipoB)}" e "${nome(d.tipoA)} depois de ${nome(d.tipoB)} (0 dia)" juntas obrigam o dia seguinte: use "depois de" com 1 dia ou remova uma.`);
            }
            // ciclo de dependência: A depois de B e B depois de A.
            if (a.tipo === 'depois_de' && b.tipo === 'depois_de' && a.tipoA === b.tipoB && a.tipoB === b.tipoA)
                erros.push(`Dependência circular: ${nome(a.tipoA)} depois de ${nome(a.tipoB)} e ${nome(b.tipoA)} depois de ${nome(b.tipoB)}.`);
            // "A não com B" + "B só na sobra" + nada mais além de A e B: o dia de B nunca terá outro tipo senão A.
            if (a.tipo === 'nao_mesmo_dia' && b.tipo === 'so_na_sobra' && (b.tipoA === a.tipoA || b.tipoA === a.tipoB)) {
                const outro = b.tipoA === a.tipoA ? a.tipoB : a.tipoA;
                avisos.push(`${nome(b.tipoA)} "só na sobra" depende de outra meta no dia, mas está proibido de dividir o dia com ${nome(outro)}; ele só entrará em dias com os demais tipos.`);
            }
            if (b.tipo === 'nao_mesmo_dia' && a.tipo === 'so_na_sobra' && (a.tipoA === b.tipoA || a.tipoA === b.tipoB)) {
                const outro = a.tipoA === b.tipoA ? b.tipoB : b.tipoA;
                avisos.push(`${nome(a.tipoA)} "só na sobra" depende de outra meta no dia, mas está proibido de dividir o dia com ${nome(outro)}; ele só entrará em dias com os demais tipos.`);
            }
            // duplicadas
            if (a.tipo === b.tipo && a.tipoA === b.tipoA && a.tipoB === b.tipoB && a.valor === b.valor)
                avisos.push(`Há duas restrições iguais ("${exports.ROTULO_TIPO_RESTRICAO[a.tipo]}" — ${nome(a.tipoA)}); remova uma.`);
        }
    return { erros: [...new Set(erros)], avisos: [...new Set(avisos)] };
}
// ── exemplos prontos (DESLIGADOS; o admin ativa na UI) ───────────────────────────────────────────────
exports.EXEMPLOS_RESTRICOES = [
    { id: 'ex-pdfull-sem-questoes', tipo: 'nao_mesmo_dia', ativa: false, rotulo: 'PDFull não no mesmo dia que as Questões', tipoA: 'pf', tipoB: 'qu', valor: 0, faixas: [] },
    { id: 'ex-pdfull-sem-flash', tipo: 'nao_mesmo_dia', ativa: false, rotulo: 'PDFull não no mesmo dia que o PDFlash', tipoA: 'pf', tipoB: 'fl', valor: 0, faixas: [] },
    { id: 'ex-pdflash-sem-seguidos', tipo: 'nao_dias_seguidos', ativa: false, rotulo: 'Sem 2 dias seguidos de PDFlash', tipoA: 'fl', tipoB: null, valor: 0, faixas: [] },
    { id: 'ex-questoes-1-dia', tipo: 'max_por_dia', ativa: false, rotulo: 'No máximo 1 meta de Questões por dia', tipoA: 'qu', tipoB: null, valor: 1, faixas: [] },
    { id: 'ex-legproc-sobra', tipo: 'so_na_sobra', ativa: false, rotulo: 'LegProc só na sobra do dia', tipoA: 'lp', tipoB: null, valor: 0, faixas: [] },
    { id: 'ex-questoes-depois-flash', tipo: 'depois_de', ativa: false, rotulo: 'Questões ao menos 1 dia depois do PDFlash', tipoA: 'qu', tipoB: 'fl', valor: 1, faixas: [] },
];
/** Descrição legível de uma restrição (UI, avisos, relatórios). */
function descreverRestricao(r) {
    const esc = r.faixas.length ? ` (faixa ${r.faixas.join(', ')})` : '';
    const A = nome(r.tipoA), B = r.tipoB ? nome(r.tipoB) : '';
    switch (r.tipo) {
        case 'max_por_dia': return `${A}: no máximo ${r.valor} por dia${esc}`;
        case 'nao_mesmo_dia': return `${A} não no mesmo dia que ${B}${esc}`;
        case 'nao_dias_seguidos': return `${A} não em dias seguidos${esc}`;
        case 'so_na_sobra': return `${A} só na sobra do dia${esc}`;
        case 'depois_de': return `${A} ao menos ${r.valor} dia(s) depois de ${B}${esc}`;
    }
}

  };
  defs['rastro'] = function (module, exports, require) {
"use strict";
/**
 * RASTRO DE DECISÃO do motor (D2) — coletor PURO e barato: registra, por meta, o MOTIVO pelo qual o motor adiou/barrou/encaixou
 * (restrição ativa, teto semanal de PDFull, limite diário, adaptação desligada…). Só existe quando o chamador pede (`ctx.rastro`):
 * sem coletor, o motor não executa nenhuma linha daqui (a saída do plano é idêntica). NUNCA entra no plano gravado nem no payload do aluno.
 *
 * Agrega por (meta × código): guarda a 1ª e a última data em que o motivo valeu e quantas vezes (n) — assim cabe em poucos KB
 * mesmo com milhares de consultas. Teto de `LIMITE_EVENTOS` chaves; o excedente só incrementa `descartados`.
 * Módulo puro (sem zod/server-only): compilado junto do motor.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultadoRastro = exports.ColetorRastro = exports.LIMITE_EVENTOS = void 0;
exports.rotuloMeta = rotuloMeta;
exports.LIMITE_EVENTOS = 1500;
class ColetorRastro {
    constructor(limite = exports.LIMITE_EVENTOS) {
        this.limite = limite;
        this.mapa = new Map();
        this.descartados = 0;
    }
    reg(id, cod, texto, dia) {
        const k = id + '|' + cod;
        const e = this.mapa.get(k);
        if (e) {
            e.n++;
            if (dia < e.de)
                e.de = dia;
            if (dia > e.ate)
                e.ate = dia;
            return;
        }
        if (this.mapa.size >= this.limite) {
            this.descartados++;
            return;
        }
        this.mapa.set(k, { id, cod, texto: typeof texto === 'function' ? texto() : texto, de: dia, ate: dia, n: 1 });
    }
    eventos() { return [...this.mapa.values()].sort((a, b) => a.de.localeCompare(b.de) || a.id.localeCompare(b.id) || a.cod.localeCompare(b.cod)); }
}
exports.ColetorRastro = ColetorRastro;
const resultadoRastro = (c) => (c ? { eventos: c.eventos(), descartados: c.descartados } : undefined);
exports.resultadoRastro = resultadoRastro;
/** Rótulo curto de uma meta para as mensagens (ex.: `pf:12` → "PDFull #12"). */
function rotuloMeta(id) {
    var _a;
    const [t, i, ...r] = id.split(':');
    const nome = { pf: 'PDFull', pp: 'PDFull (parte)', fl: 'PDFlash', qu: 'Questões', lp: 'LegProc', jp: 'Jurisprudência', rf: 'PDFlash (revisão)', rq: 'Questões (revisão)' };
    return `${(_a = nome[t]) !== null && _a !== void 0 ? _a : t}${i ? ' ' + i : ''}${r.length ? ' (' + r.join(':') + ')' : ''}`;
}

  };
  defs['motor28'] = function (module, exports, require) {
"use strict";
/**
 * MOTOR DO CRONOGRAMA ADAPTATIVO — lógica de distribuição do modelo "Cronograma_Adaptativo_2.8.html".
 *
 * FONTE ÚNICA: este arquivo é usado no SERVIDOR (engine.ts → gerarPlano) e, compilado por
 * `pnpm --filter web cronograma:motor` (scripts/build-motor28.mjs), no IFRAME do aluno
 * (public/cronograma/adaptativo/motor28.js → window.Motor28). Sem imports: puro, determinístico.
 *
 * PORTE das funções do modelo (mesmos nomes, mesma ordem de decisões — só sem os globais `S`/`AS`):
 *  · gerarPlanoBase          — distribuição semana a semana;
 *  · gerarPlanoCatalogo      — ordem das aulas (catálogo) sem o histórico prévio + metas remanejadas presas;
 *  · gerarPlano              — com metas remanejadas, refaz o fluxo pelo efeito dominó (calcularDomino);
 *  · perfilSemana, planoRevisao(+Concentrada), criarRodizioLP25, permitirLegproc25, chaveLei,
 *    limitePDF27, novosPDFDia27, detalhesPdf.
 *
 * Regras resultantes (modelo 2.8):
 *  · PDFull = max(30, teto(páginas ÷ ritmo × 2) × 30) min (60 págs se não informado); o que não cabe vira
 *    partes (pp:i:k … pf:i) e a continuação vem depois. Até 2 PDFulls NOVOS por dia (1 se maisPDFull=false);
 *    a continuação não conta. 1º PDFull depois das revisões; o 2º só depois das questões e do LegProc.
 *  · Revisão 1 semana de conteúdo depois (60 min); Questões 2 semanas depois (30 min) — nunca descartadas.
 *  · Semana com até 18 h e +1 dia disponível: o último dia concentra as Questões (sem PDFull/Revisão novos).
 *  · LegProc (30 min) por disciplina selecionada, na ordem do catálogo; por dia até 4 metas, no máx. 2
 *    disciplinas, no máx. 2 metas da mesma disciplina e — quando 2 — da MESMA lei; rodízio com janela de 6.
 *  · Semanas de revisão (cfg.revisao): sem aula nova; reservam Revisão + Questões; sobra p/ pendências/LegProc.
 *  · Disponibilidade: horas pontuais da data > recesso (zera) > rotina vigente.
 *
 * Interrupções (formato da plataforma → mecanismo do modelo, `cfg.remanejadas`):
 *  · cfg.sobras[id] = minutos restantes (Revisão/Questões/LegProc) → remanejada {desde: âncora, minutos};
 *  · cfg.paginasLidas[i] = última página lida do PDFull → remanejada pf:i com as páginas que faltam.
 *  · "Já estuda pelo Revisão?": cfg.ultimosTemas[disc] = posição (0-based) da última aula estudada
 *    daquela disciplina → ela e as anteriores ficam fora da nova programação.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ehJuris219 = exports.ehReforco = exports.ehHist = exports.proximoEstudo = exports.faixaDaSemana = exports.motorRevObrigatoria = exports.PARAMS_PADRAO_MOTOR = exports.DUR_REVISAO = exports.DUR = exports.VEL_PADRAO = exports.MAX_SEM = exports.SEM_FLASH = exports.VERSAO_MOTOR = void 0;
exports.resolverParams = resolverParams;
exports.temasFracos = temasFracos;
exports.classificarResultado218 = classificarResultado218;
exports.resultadoTema218 = resultadoTema218;
exports.rankingRevisao218 = rankingRevisao218;
exports.idealRev = idealRev;
exports.dParse = dParse;
exports.dISO = dISO;
exports.dAdd = dAdd;
exports.dDow = dDow;
exports.dMon = dMon;
exports.semDe = semDe;
exports.semInicio = semInicio;
exports.horasEm = horasEm;
exports.recessoEm = recessoEm;
exports.horasDia = horasDia;
exports.cargaSemanaMin = cargaSemanaMin;
exports.revisaoObrigatoria300 = revisaoObrigatoria300;
exports.capacidadeRevisao300 = capacidadeRevisao300;
exports.cicloRevisao300 = cicloRevisao300;
exports.ehRev = ehRev;
exports.proxSemConteudo = proxSemConteudo;
exports.minPdf = minPdf;
exports.perfilSemana = perfilSemana;
exports.planoRevisao = planoRevisao;
exports.planoRevisaoConcentrada = planoRevisaoConcentrada;
exports.chaveLei = chaveLei;
exports.permitirLegproc25 = permitirLegproc25;
exports.criarRodizioLP25 = criarRodizioLP25;
exports.limitePDF27 = limitePDF27;
exports.novosPDFDia27 = novosPDFDia27;
exports.indicesAnteriores = indicesAnteriores;
exports.ordemParalela = ordemParalela;
exports.detalhesPdf = detalhesPdf;
exports.calcularDomino = calcularDomino;
exports.remanejadasEfetivas = remanejadasEfetivas;
exports.metaSemanalHistorico = metaSemanalHistorico;
exports.gerarPlano = gerarPlano;
exports.saudePlano = saudePlano;
const regras_1 = require("./regras");
const faixas_carga_1 = require("./faixas-carga");
const tipos_meta_1 = require("./tipos-meta");
exports.VERSAO_MOTOR = '2.8.1';
exports.SEM_FLASH = new Set(['Direito Eleitoral', 'Direito Internacional', 'Direito Internacional Privado', 'Legislação de Ensino', 'Legislação da AGU']);
exports.MAX_SEM = 200;
exports.VEL_PADRAO = 17;
// durações padrão vêm do REGISTRO ÚNICO de tipos de meta (tipos-meta.ts)
exports.DUR = { fl: (0, tipos_meta_1.duracaoPadrao)('fl'), qu: (0, tipos_meta_1.duracaoPadrao)('qu'), lp: (0, tipos_meta_1.duracaoPadrao)('lp') };
exports.DUR_REVISAO = { rf: (0, tipos_meta_1.duracaoPadrao)('rf'), rq: (0, tipos_meta_1.duracaoPadrao)('rq') };
function resolverParams(p) {
    const q = p || {};
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    return {
        velPadrao: q.velPadrao && q.velPadrao > 0 ? q.velPadrao : exports.VEL_PADRAO,
        offsetRevisao: num(q.offsetRevisao, tipos_meta_1.TIPOS_META.fl.deslocamentoPadraoSem),
        offsetQuestoes: num(q.offsetQuestoes, tipos_meta_1.TIPOS_META.qu.deslocamentoPadraoSem),
        semFlash: Array.isArray(q.semFlash) ? new Set(q.semFlash) : exports.SEM_FLASH,
        tetoPdfDia: num(q.tetoPdfDia, 2),
        lpJanelaRodizio: num(q.lpJanelaRodizio, 6),
        concentracaoAteH: num(q.concentracaoAteH, 18),
        maxSemanas: num(q.maxSemanas, exports.MAX_SEM),
        dur: { fl: num(q.durFl, exports.DUR.fl), qu: num(q.durQu, exports.DUR.qu), lp: num(q.durLp, exports.DUR.lp) },
        durRevisao: { rf: num(q.durRf, exports.DUR_REVISAO.rf), rq: num(q.durRq, exports.DUR_REVISAO.rq) },
        legproc: { metasDia: num(q.lpMetasDia, 4), discDia: num(q.lpDiscDia, 2), mesmaDisc: num(q.lpMesmaDisc, 2) },
        desempenho: { ativo: q.usarDesempenhoNoPlano === true, peso: Math.max(0, num(q.pesoDesempenho, 1)), acertoMin: num(q.acertoMin, 60) },
        regras218: { pdfInteiro: q.pdfInteiro218 === true, revisaoPorResultado: q.revisaoPorResultado218 === true },
        historico: { ativo: q.historicoDiagnostico219 === true },
        juris: { ativo: q.jurisprudencia219 === true, min: Math.min(180, Math.max(15, Math.round(num(q.jurisprudenciaMin, 60)))) },
    };
}
exports.PARAMS_PADRAO_MOTOR = resolverParams();
/** Temas (índice em AS) "fracos": grau de dificuldade ≥ 7 OU acerto (questões da aula + das semanas de revisão) < acertoMin. */
function temasFracos(notas, acertoMin) {
    var _a;
    const fracos = new Set(), res = {}, err = {};
    for (const [id, n] of Object.entries(notas || {})) {
        if (!n)
            continue;
        const p = id.split(':');
        if (p[0] === 'pf') {
            if (p.length === 2 && (+((_a = n.grau) !== null && _a !== void 0 ? _a : 0)) >= 7)
                fracos.add(+p[1]);
        }
        else if (p[0] === 'qu' || p[0] === 'rq') {
            const i = +p[p[0] === 'rq' ? 2 : 1];
            res[i] = (res[i] || 0) + +(n.res || 0);
            err[i] = (err[i] || 0) + +(n.err || 0);
        }
    }
    for (const k of Object.keys(res)) {
        const i = +k;
        if (res[i] > 0 && Math.max(0, (res[i] - (err[i] || 0)) / res[i] * 100) < acertoMin)
            fracos.add(i);
    }
    return fracos;
}
// ── Regras da versão 2.18 (puras, testáveis) ─────────────────────────────────────────────────────
/** Reforço/revisão pelo percentual EXATO, sem arredondar: <50 → 'pf' (releitura) · 50 até <70 → 'fl' (PDFlash) · ≥70 → 'ok' (nada). */
function classificarResultado218(pct) { return pct < 50 ? 'pf' : pct < 70 ? 'fl' : 'ok'; }
/** Resultado de um tema: questões da aula (qu:i) + das semanas de revisão (rq:*:i). Válido só com total inteiro > 0 e 0 ≤ acertos ≤ total. */
function resultadoTema218(notas, i) {
    let total = 0, err = 0;
    for (const [id, n] of Object.entries(notas || {})) {
        if (!n)
            continue;
        const p = id.split(':');
        if ((p[0] === 'qu' && +p[1] === i) || (p[0] === 'rq' && +p[2] === i)) {
            const t = +(n.res || 0), e = +(n.err || 0);
            if (Number.isInteger(t) && Number.isInteger(e) && t > 0 && e >= 0 && e <= t) {
                total += t;
                err += e;
            }
        }
    }
    return total > 0 ? { pct: (total - err) / total * 100, total } : null;
}
/**
 * Fila da semana de revisão pelo resultado recente (2.18): <50% primeiro, depois 50–70%, depois temas sem resultado;
 * ≥70% fica de fora. Dentro do grupo: menor acerto, depois PDFull mais antigo, depois índice. Temas já revisados vão ao fim do grupo.
 */
function rankingRevisao218(plano, notas, ateData, jaRevisados) {
    var _a, _b;
    const cand = [];
    for (const [id, [d]] of Object.entries(plano)) {
        if (!/^pf:[0-9]+$/.test(id) || d >= ateData)
            continue;
        const i = +id.split(':')[1], r = resultadoTema218(notas, i);
        const cls = r ? classificarResultado218(r.pct) : null;
        if (cls === 'ok')
            continue;
        const grupo = cls === 'pf' ? 0 : cls === 'fl' ? 1 : 2;
        cand.push({ i, d, grau: (_b = (_a = (notas || {})['pf:' + i]) === null || _a === void 0 ? void 0 : _a.grau) !== null && _b !== void 0 ? _b : null, acerto: r ? r.pct : null, prioritario: grupo < 2, pontos: -(grupo * 1000) + (r ? 100 - r.pct : 0) - (jaRevisados.has(i) ? 4 : 0) });
    }
    return cand.sort((a, b) => (b.pontos - a.pontos) || (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i));
}
/**
 * Data ideal da revisão ('fl') ou das questões ('qu') de uma aula. Sem desempenho ligado, ou para tema não fraco,
 * é exatamente a do modelo 2.8 (mesmo dia da semana, N semanas de conteúdo depois). Tema FRACO: antecipa
 * round(peso × 2) dias, nunca antes de 1 dia após o PDFull.
 */
function idealRev(cfg, P, fracos, i, dataPdf, tipo) {
    const due = proxSemConteudo(cfg, dataPdf, tipo === 'fl' ? P.offsetRevisao : P.offsetQuestoes);
    if (!P.desempenho.ativo || !fracos.has(i))
        return due;
    const adiantado = dAdd(due, -Math.round(P.desempenho.peso * 2)), minimo = dAdd(dataPdf, 1);
    return adiantado > minimo ? adiantado : (due < minimo ? due : minimo);
}
// ── datas (ISO local, sem fuso) ──
function dParse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function dISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
// funções de data memoizadas (puras sobre strings; dParse devolve Date mutável, então só os resultados string/number são cacheados)
const memoStr = (f) => { const c = new Map(); return (k) => { let v = c.get(k); if (v === undefined) {
    if (c.size > 80000)
        c.clear();
    v = f(k);
    c.set(k, v);
} return v; }; };
const dAddMemo = memoStr((k) => { const i = k.indexOf('|'); const d = dParse(k.slice(0, i)); d.setDate(d.getDate() + Number(k.slice(i + 1))); return dISO(d); });
function dAdd(s, n) { return typeof s === 'string' && typeof n === 'number' ? dAddMemo(s + '|' + n) : (() => { const d = dParse(s); d.setDate(d.getDate() + n); return dISO(d); })(); }
const dDowMemo = memoStr((s) => (dParse(s).getDay() + 6) % 7);
function dDow(s) { return typeof s === 'string' ? dDowMemo(s) : (dParse(s).getDay() + 6) % 7; }
function dMon(s) { return dAdd(s, -dDow(s)); }
const semDeMemo = memoStr((k) => { const i = k.indexOf('|'); return Math.round((+dParse(dMon(k.slice(i + 1))) - +dParse(dMon(k.slice(0, i)))) / 864e5 / 7) + 1; });
function semDe(start, s) { return typeof s === 'string' && typeof start === 'string' ? semDeMemo(start + '|' + s) : Math.round((+dParse(dMon(s)) - +dParse(dMon(start))) / 864e5 / 7) + 1; }
function semInicio(start, sem) { return dAdd(dMon(start), (sem - 1) * 7); }
// ── disponibilidade ──
function horasEm(cfg, d) {
    let h = cfg.horas;
    for (const r of [...(cfg.rotinas || [])].sort((a, b) => (a.desde < b.desde ? -1 : 1)))
        if (r.desde <= d)
            h = r.horas;
    return h;
}
function recessoEm(cfg, d) { return (cfg.recessos || []).find((r) => r.ini <= d && d <= r.fim) || null; }
/** Horas do dia: pontual da data > recesso (0) > rotina vigente. */
function horasDia(cfg, d) {
    const p = cfg.horasPontuais && cfg.horasPontuais[d];
    if (p != null && Number.isFinite(+p))
        return Math.max(0, Math.min(24, +p));
    return recessoEm(cfg, d) ? 0 : (+(horasEm(cfg, d)[dDow(d)] || 0));
}
// ── semana de revisão OBRIGATÓRIA (modelo 3.0, regraRotina300 = 15) ─────────────────────────────────
// Só vale para planos do motor 3.x (cfg.motor = '3.…'); o legado 2.8.1 mantém a regra antiga (revisao.ativa/cada).
const motorRevObrigatoria = (cfg) => typeof cfg.motor === 'string' && cfg.motor.startsWith('3.');
exports.motorRevObrigatoria = motorRevObrigatoria;
/** Carga semanal (min) da ROTINA vigente na semana `sem` (soma das horas de cada dia da semana). */
function cargaSemanaMin(cfg, sem) {
    const inicio = semInicio(cfg.start, sem);
    let horas = 0;
    for (let k = 0; k < 7; k++)
        horas += +(horasEm(cfg, dAdd(inicio, k))[k] || 0);
    return horas * 60;
}
/** Faixa de carga da semana `sem` (pela rotina vigente). */
const faixaDaSemana = (cfg, sem, R = regras_1.REGRAS_PADRAO) => (0, faixas_carga_1.faixaPorMinutos)(R.faixas, cargaSemanaMin(cfg, sem));
exports.faixaDaSemana = faixaDaSemana;
/** Faixa com revisão em CICLO (padrão: rotina até 24h30 semanais): revisão obrigatória a cada N semanas (N da faixa). */
function revisaoObrigatoria300(cfg, sem, R = regras_1.REGRAS_PADRAO) {
    return (0, exports.faixaDaSemana)(cfg, sem, R).revisaoModo === 'ciclo';
}
/** Capacidade (min) de uma semana de revisão obrigatória, descontada a reserva semanal de Jurisprudência (só se marcada e ≥14h30). */
function capacidadeRevisao300(cfg, sem, R = regras_1.REGRAS_PADRAO) {
    var _a;
    const inicio = semInicio(cfg.start, sem);
    let horas = 0;
    for (let k = 0; k < 7; k++)
        horas += horasDia(cfg, dAdd(inicio, k));
    return Math.round(horas * 60) - ((((_a = cfg.metas) === null || _a === void 0 ? void 0 : _a.jp) ? horas >= R.juris.minSemanalMin / 60 : false) ? R.juris.reservaCapacidadeRevisaoMin : 0);
}
/** Semana (nº) do próximo ciclo de revisão obrigatória com capacidade para a data; 0 quando a data não está sujeita ao ciclo. */
function cicloRevisao300(cfg, data, R = regras_1.REGRAS_PADRAO) {
    const sem = semDe(cfg.start, data), C = (0, faixas_carga_1.cicloDaFaixa)((0, exports.faixaDaSemana)(cfg, semDe(cfg.start, data), R), R);
    if (!revisaoObrigatoria300(cfg, sem, R))
        return 0;
    const proxima = (Math.floor(sem / C) + 1) * C;
    for (let ciclo = proxima; ciclo < proxima + 600; ciclo += C) {
        if (!revisaoObrigatoria300(cfg, ciclo, R))
            return 0;
        if (capacidadeRevisao300(cfg, ciclo, R) > 0)
            return ciclo;
    }
    return proxima;
}
function ehRev(cfg, sem, R = regras_1.REGRAS_PADRAO) {
    const r = cfg.revisao;
    if ((0, exports.motorRevObrigatoria)(cfg)) {
        const fx = (0, exports.faixaDaSemana)(cfg, sem, R);
        if (fx.revisaoModo === 'ciclo')
            return sem > 0 && sem % (0, faixas_carga_1.cicloDaFaixa)(fx, R) === 0;
        const c = Number(r === null || r === void 0 ? void 0 : r.cada); // 10/12: só planos legados que já os tinham (a interface nova oferece 4/6/8)
        return sem > 0 && sem % ([...(0, faixas_carga_1.opcoesDaFaixa)(fx, R), ...R.revisao.opcoesLegado].includes(c) ? c : (0, faixas_carga_1.padraoDaFaixa)(fx, R)) === 0;
    }
    return !!(r && r.ativa && r.cada && r.cada > 0 && sem > 0 && sem % r.cada === 0);
}
function proxSemConteudo(cfg, s, n, R = regras_1.REGRAS_PADRAO) {
    if ((0, exports.motorRevObrigatoria)(cfg)) {
        const ciclo = cicloRevisao300(cfg, s, R);
        if (ciclo)
            return semInicio(cfg.start, ciclo);
    }
    let sem = semDe(cfg.start, s), k = 0;
    while (k < n) {
        sem++;
        if (!ehRev(cfg, sem, R))
            k++;
    }
    return dAdd(semInicio(cfg.start, sem), dDow(s));
}
function minPdf(p, vel, velPadrao = exports.VEL_PADRAO) { const v = vel && vel > 0 ? vel : (velPadrao > 0 ? velPadrao : exports.VEL_PADRAO); return Math.max(30, Math.ceil((p || 60) / v * 2 - 1e-9) * 30); }
const proximoEstudo = (cfg, aPartir) => {
    for (let n = 0, d = aPartir; n < 1400; n++, d = dAdd(d, 1))
        if (d >= cfg.start && horasDia(cfg, d) > 0)
            return d;
    return null;
};
exports.proximoEstudo = proximoEstudo;
/** Perfil da semana: horas da rotina e o dia que concentra as questões (≤18 h e mais de 1 dia disponível). */
function perfilSemana(cfg, sem, ateH = 18) {
    const ini = semInicio(cfg.start, sem), datas = Array.from({ length: 7 }, (_, i) => dAdd(ini, i));
    const horas = datas.reduce((n, d) => n + (+(horasEm(cfg, d)[dDow(d)] || 0)), 0);
    const disponiveis = datas.filter((d) => d >= cfg.start && horasDia(cfg, d) > 0);
    return { horas, concentrado: horas <= ateH && disponiveis.length > 1 ? disponiveis[disponiveis.length - 1] : null };
}
/** Semana de revisão: por tema, Revisão (60) + Questões (30), preenchendo cada dia; dia concentrado só recebe questões. */
function planoRevisao(capDias, temas, apenasQuestoes = [], dur = exports.DUR_REVISAO) {
    if (apenasQuestoes.some(Boolean))
        return planoRevisaoConcentrada(capDias, temas, apenasQuestoes, dur);
    const fila = [];
    for (let n = 0; n < temas; n++)
        fila.push({ t: 'rf', n }, { t: 'rq', n });
    let q = 0;
    return capDias.map((c) => {
        const itens = [];
        let usado = 0;
        while (q < fila.length && usado + dur[fila[q].t] <= c) {
            itens.push(fila[q]);
            usado += dur[fila[q].t];
            q++;
        }
        return { itens, usado };
    });
}
function planoRevisaoConcentrada(capDias, temas, apenasQuestoes, dur = exports.DUR_REVISAO) {
    const out = capDias.map(() => ({ itens: [], usado: 0 })), livre = capDias.map((c) => Math.max(0, c));
    for (let n = 0; n < temas; n++) {
        let colocou = false;
        for (let r = 0; r < livre.length; r++) {
            if (apenasQuestoes[r] || livre[r] < dur.rf)
                continue;
            livre[r] -= dur.rf;
            const pref = livre.map((_, k) => k).filter((k) => k >= r).sort((a, b) => Number(!!apenasQuestoes[b]) - Number(!!apenasQuestoes[a]) || a - b);
            const q = pref.find((k) => livre[k] >= dur.rq);
            if (q == null) {
                livre[r] += dur.rf;
                continue;
            }
            out[r].itens.push({ t: 'rf', n });
            out[r].usado += dur.rf;
            out[q].itens.push({ t: 'rq', n });
            out[q].usado += dur.rq;
            livre[q] -= dur.rq;
            colocou = true;
            break;
        }
        if (!colocou)
            break;
    }
    return out;
}
const chaveLeiCache = new Map();
/** Chave da lei de uma meta de LegProc (disciplina + lei normalizada). */
function chaveLei(meta) {
    if (!(meta === null || meta === void 0 ? void 0 : meta.lei) || !String(meta.lei).trim())
        return '';
    const k = meta.disc + ' ' + meta.lei;
    let v = chaveLeiCache.get(k);
    if (v !== undefined)
        return v;
    v = meta.disc + '|' + String(meta.lei).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    if (chaveLeiCache.size > 20000)
        chaveLeiCache.clear();
    chaveLeiCache.set(k, v);
    return v;
}
/** Pode entrar mais esta meta de LegProc no dia? ≤4 metas; ≤2 disciplinas; ≤2 por disciplina, e da mesma lei. */
function permitirLegproc25(id, idsDia, metaDe, lim = { metasDia: 4, discDia: 2, mesmaDisc: 2 }) {
    const m = metaDe(id);
    if (!(m === null || m === void 0 ? void 0 : m.disc) || idsDia.length >= lim.metasDia)
        return false;
    const existentes = idsDia.map((x) => ({ id: x, m: metaDe(x) })).filter((x) => { var _a; return (_a = x.m) === null || _a === void 0 ? void 0 : _a.disc; });
    const disciplinas = new Set(existentes.map((x) => x.m.disc)), daDisc = existentes.filter((x) => x.m.disc === m.disc);
    if (daDisc.length >= lim.mesmaDisc)
        return false;
    if (!daDisc.length)
        return disciplinas.size < lim.discDia;
    const lei = chaveLei(m);
    return !!lei && daDisc.every((x) => chaveLei(x.m) === lei);
}
/** Rodízio de disciplinas do LegProc: janela das 6 primeiras com metas pendentes, girando após a última usada. */
function criarRodizioLP25(disciplinas, ultima = null, janela = 6) {
    const ordem = [...new Set(disciplinas)], estado = { ultima };
    return {
        ordenar(pendentes) {
            const disponiveis = new Set(pendentes), ativas = ordem.filter((d) => disponiveis.has(d)).slice(0, janela);
            const pos = ordem.indexOf(estado.ultima);
            return [...ativas.filter((d) => ordem.indexOf(d) > pos), ...ativas.filter((d) => ordem.indexOf(d) <= pos)];
        },
        avancar(disciplina) { estado.ultima = disciplina !== null && disciplina !== void 0 ? disciplina : null; },
    };
}
function limitePDF27(cfg, teto = 2) { return cfg.maisPDFull === false ? 1 : teto; }
/** Aulas cujo PDFull COMEÇA no dia d (continuações não contam). */
function novosPDFDia27(plano, cfg, d, detalhes = {}) {
    var _a, _b, _c;
    const primeiros = new Map(), restos = new Set();
    for (const [id, [dia]] of Object.entries(plano)) {
        if (!/^p[fp]:[0-9]+(:[0-9]+)?$/.test(id))
            continue;
        const i = +id.split(':')[1];
        if (!primeiros.has(i) || dia < primeiros.get(i))
            primeiros.set(i, dia);
        if (((_a = detalhes[id]) === null || _a === void 0 ? void 0 : _a.continuacao) || (((_b = cfg.paginasLidas) === null || _b === void 0 ? void 0 : _b[i]) || 0) > 0 || (((_c = cfg.partesLidas) === null || _c === void 0 ? void 0 : _c[i]) || 0) > 0)
            restos.add(i);
    }
    return new Set([...primeiros].filter(([i, dia]) => dia === d && !restos.has(i)).map(([i]) => i));
}
// ── histórico prévio ("Já estuda pelo Revisão?") ──
/** Índices de AS declarados como já estudados (prefixo inclusivo, na ordem de AS, por disciplina selecionada). */
function indicesAnteriores(cfg, AS, ordem) {
    const out = new Set();
    if (!cfg.jaEstudaRevisao || !cfg.ultimosTemas)
        return out;
    const ativas = new Set(cfg.discs);
    const pos = {};
    const escolhida = {}; // disciplina → índice (em AS) da aula que o aluno marcou como a última estudada
    AS.forEach((a, i) => {
        var _a;
        const disc = a[0];
        const k = pos[disc] = ((_a = pos[disc]) !== null && _a !== void 0 ? _a : -1) + 1;
        const lim = cfg.ultimosTemas[disc];
        if (ativas.has(disc) && typeof lim === 'number' && lim >= 0 && k <= lim)
            out.add(i);
        if (ativas.has(disc) && typeof lim === 'number' && lim >= 0 && k === lim)
            escolhida[disc] = i;
    });
    // O prefixo "já estudado" vale na ORDEM DO CURSO (a de estudo), não na ordem de AS (títulos da Biblioteca, que pode ser
    // alfabética: marcava "Parte 3" sem as partes 1 e 2 e repetia conteúdo já visto). A aula escolhida continua sendo a mesma.
    if (ordem && ordem.length) {
        const rank = new Map(ordem.map((i, k) => [i, k]));
        for (const [disc, i] of Object.entries(escolhida)) {
            const r = rank.get(i);
            if (r == null)
                continue; // aula fora da ordem (inativa): mantém o prefixo antigo da disciplina
            AS.forEach((a, j) => { if (a[0] === disc) {
                const rj = rank.get(j);
                if (rj != null) {
                    if (rj <= r)
                        out.add(j);
                    else
                        out.delete(j);
                }
            } });
        }
    }
    return out;
}
/**
 * Matérias em PARALELO. O catálogo traz as aulas em "ondas" (as 4 primeiras matérias consomem muitas semanas antes de as
 * outras começarem). Aqui a fila é reequilibrada entre as disciplinas SELECIONADAS: mantém a ordem das aulas dentro de cada
 * disciplina (Parte 1 → 2 → 3…) e, a cada passo, escolhe a disciplina com MENOR fração do conteúdo já consumida (em páginas),
 * dentro de uma janela de `paralelo` disciplinas (ao terminar uma, entra a próxima da fila).
 *  · paralelo > 0  → janela fixa escolhida pelo aluno (limitada ao nº de disciplinas);
 *  · paralelo null/0 → automático: até 4 disciplinas mantém o catálogo; acima de 4 equilibra todas (evita "4 matérias por 19 semanas").
 * Não mexe nas aulas fora da seleção / já estudadas (ficam ao fim, na ordem original).
 */
function ordemParalela(ordem, AS, ativas, anteriores, paralelo) {
    const uteis = ordem.filter((i) => AS[i] && ativas.has(AS[i][0]) && !anteriores.has(i));
    const resto = ordem.filter((i) => !(AS[i] && ativas.has(AS[i][0]) && !anteriores.has(i)));
    const discs = [];
    const fila = new Map();
    for (const i of uteis) {
        const d = AS[i][0];
        if (!fila.has(d)) {
            fila.set(d, []);
            discs.push(d);
        }
        fila.get(d).push(i);
    }
    const n = discs.length;
    const janela = paralelo && paralelo > 0 ? Math.min(Math.floor(paralelo), n) : (n > 4 ? n : 0);
    if (!janela || n <= 1)
        return ordem;
    const pag = (i) => Math.max(1, +AS[i][3] || 60);
    const total = new Map(discs.map((d) => [d, fila.get(d).reduce((s, i) => s + pag(i), 0)]));
    const lido = new Map(), pos = new Map();
    const ativasJanela = discs.slice(0, janela);
    let proxima = janela;
    ativasJanela.forEach((d) => { lido.set(d, 0); pos.set(d, 0); });
    const fr = (d) => lido.get(d) / total.get(d);
    const saida = [];
    while (ativasJanela.length) {
        let melhor = ativasJanela[0];
        for (const d of ativasJanela)
            if (fr(d) < fr(melhor) - 1e-9)
                melhor = d;
        const q = fila.get(melhor), k = pos.get(melhor);
        saida.push(q[k]);
        pos.set(melhor, k + 1);
        lido.set(melhor, lido.get(melhor) + pag(q[k]));
        if (k + 1 >= q.length) {
            const idx = ativasJanela.indexOf(melhor);
            ativasJanela.splice(idx, 1);
            if (proxima < discs.length) { // a próxima disciplina entra no nível das que seguem em andamento (não "recupera" tudo de uma vez)
                const nova = discs[proxima++];
                lido.set(nova, ativasJanela.length ? Math.min(...ativasJanela.map(fr)) * total.get(nova) : 0);
                pos.set(nova, 0);
                ativasJanela.push(nova);
            }
        }
    }
    return [...saida, ...resto];
}
const tipoEstudo = (id) => id.split(':')[0];
/** 2.13: diagnóstico de tema anterior (`qu:<aula>:hist:<semana>`) e reforço do diagnóstico (`pf|fl:<aula>:reforco:<semana>`). */
const ehHist = (id) => /^qu:\d+:hist:\d+$/.test(id);
exports.ehHist = ehHist;
const ehReforco = (id) => /^(pf|fl):\d+:reforco:\d+$/.test(id);
exports.ehReforco = ehReforco;
const ehPdf = (t) => t === 'pf' || t === 'pp';
const indiceAula = (id) => { const p = id.split(':'); return +p[/^r[fq]$/.test(p[0]) ? 2 : 1]; };
const copiar = (x) => JSON.parse(JSON.stringify(x !== null && x !== void 0 ? x : {}));
/**
 * gerarPlanoBase do modelo. cfg.ordemAulas = fila de aulas; legprocs = metas na ordem do catálogo (id = id no plano).
 * fixos = {id: [data, horas]} — metas que não se movem. ancora = data a partir da qual o resto é distribuído.
 */
function gerarPlanoBase(cfg, AS, ordemAulas, legprocs, fixos, ancora, P, fracos) {
    var _a;
    const start = cfg.start;
    // v3: parâmetros configuráveis sombreiam as constantes 2.8 — sem params = valores idênticos aos de hoje.
    const DUR = P.dur, SEM_FLASH = P.semFlash, MAX_SEM = P.maxSemanas;
    const A = ancora && ancora > start ? ancora : start;
    const ativas = new Set(cfg.discs);
    const metas = cfg.metas || {};
    const plano = {};
    const carga = {}; // data -> minutos ocupados
    for (const [id, v] of Object.entries(fixos)) {
        if (/^r[fqv]:/.test(id) && !((_a = cfg.remanejadas) === null || _a === void 0 ? void 0 : _a[id]))
            continue;
        plano[id] = v;
        if (v[0] >= A)
            carga[v[0]] = (carga[v[0]] || 0) + Math.round(v[1] * 60);
    }
    const fixo = (id) => !!fixos[id];
    const algumDia = [cfg.horas, ...(cfg.rotinas || []).map((r) => r.horas), Object.values(cfg.horasPontuais || {})].some((h) => (h || []).some((x) => +x > 0));
    if (!algumDia)
        return { plano, fim: semDe(start, A) };
    const pdfQ = [];
    (ordemAulas || AS.map((_, i) => i)).forEach((i) => { const a = AS[i]; if (a && ativas.has(a[0]) && !fixo('pf:' + i))
        pdfQ.push(i); });
    let qi = 0;
    // PDFULL dividido em partes ('pp:i:k'): partes já concluídas descontam do tempo que falta ler
    const feitoParte = {}, maxParte = {};
    for (const [id, v] of Object.entries(fixos))
        if (id.startsWith('pp:')) {
            const [, i, k] = id.split(':');
            feitoParte[i] = (feitoParte[i] || 0) + Math.round(v[1] * 60);
            maxParte[i] = Math.max(maxParte[i] || 0, +k);
        }
    const restante = (i) => { var _a; return Math.max(30, minPdf(AS[i][3], cfg.vel, P.velPadrao) - (feitoParte[i] || 0) - (((_a = cfg.partesLidas) === null || _a === void 0 ? void 0 : _a[i]) || 0)); };
    let ultimaLeitura = start;
    let emCurso = null;
    const devidos = [];
    let ord = 0;
    const registrar = (i, dataPdf) => {
        const disc = AS[i][0];
        if (metas.fl && !SEM_FLASH.has(disc) && !fixo('fl:' + i))
            devidos.push({ id: 'fl:' + i, due: idealRev(cfg, P, fracos, i, dataPdf, 'fl'), tipo: 'fl', ord: ord++ });
        if (metas.qu && !fixo('qu:' + i))
            devidos.push({ id: 'qu:' + i, due: idealRev(cfg, P, fracos, i, dataPdf, 'qu'), tipo: 'qu', ord: ord++ });
    };
    // dívidas: PDFs já concluídos cujas revisões/questões ainda não foram feitas
    AS.forEach((a, i) => { if (ativas.has(a[0]) && (!ordemAulas || ordemAulas.includes(i)) && fixos['pf:' + i])
        registrar(i, fixos['pf:' + i][0]); });
    const semA = semDe(start, A);
    // O catálogo fornece uma fila estável e vinculada às disciplinas selecionadas.
    const ignorar = new Set(cfg.lpIgnorar || []);
    const lpCarry = metas.lp ? legprocs.filter((x) => ativas.has(x.disc) && !fixo(x.id) && !ignorar.has(x.id)).map((x) => x.id) : [];
    const mapaLP25 = new Map(legprocs.map((m, k) => [m.id, { ...m, ordem: k }]));
    const historicoLP25 = Object.entries(fixos).filter(([id, [d]]) => id.startsWith('lp:') && d <= A && mapaLP25.has(id))
        .sort((a, b) => a[1][0].localeCompare(b[1][0]) || mapaLP25.get(a[0]).ordem - mapaLP25.get(b[0]).ordem);
    const ultimaLP25 = historicoLP25.length ? mapaLP25.get(historicoLP25[historicoLP25.length - 1][0]).disc : null;
    const rodizioLP25 = criarRodizioLP25(cfg.discs, ultimaLP25, P.lpJanelaRodizio);
    const porData = (a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.ord - b.ord);
    const lpMetas = mapaLP25;
    let fim = semA;
    for (let sem = semA; sem <= MAX_SEM; sem++) {
        const ini = semInicio(start, sem), fimSem = dAdd(ini, 6);
        const diasSem = [0, 1, 2, 3, 4, 5, 6].map((d) => dAdd(ini, d)).filter((dt) => dt >= A && horasDia(cfg, dt) > 0);
        const semRev = ehRev(cfg, sem);
        const perfil = perfilSemana(cfg, sem, P.concentracaoAteH);
        const concentrado = perfil.concentrado && diasSem.includes(perfil.concentrado) ? perfil.concentrado : null;
        const diasConteudo = diasSem.filter((d) => d !== concentrado);
        const diasQuestoes = concentrado ? [concentrado, ...diasConteudo] : diasSem;
        const cap = (dt) => horasDia(cfg, dt) * 60;
        const livre = (dt) => cap(dt) - (carga[dt] || 0);
        const por = (dt, id, m) => { plano[id] = [dt, m / 60]; carga[dt] = (carga[dt] || 0) + m; };
        const maisLivre = (lista, m) => { let b = null, r = -1; for (const dt of lista) {
            const x = livre(dt);
            if (x >= m && x > r) {
                r = x;
                b = dt;
            }
        } return b; };
        const vencidos = (tipo) => devidos.filter((x) => x.due <= fimSem && (!tipo || x.tipo === tipo)).sort(porData);
        const tirar = (x) => devidos.splice(devidos.indexOf(x), 1);
        /** Coloca uma meta no dia do vencimento; se não couber, no dia mais livre a partir dele; depois, no mais livre da semana. */
        const encaixar = (x, dias, soNoDia) => {
            const m = DUR[x.tipo];
            let dt = dias.includes(x.due) && livre(x.due) >= m ? x.due : null;
            if (!dt && !soNoDia)
                dt = maisLivre(dias.filter((d) => d >= x.due), m) || maisLivre(dias, m);
            if (dt) {
                por(dt, x.id, m);
                tirar(x);
                return true;
            }
            return false; // sem espaço: passa para a semana seguinte, nunca é descartada
        };
        const encaixarTipo = (tipo, dias, soNoDia) => {
            for (const x of vencidos(tipo)) {
                if (tipo === 'qu' && concentrado && dias.includes(concentrado) && livre(concentrado) >= DUR.qu) {
                    por(concentrado, x.id, DUR.qu);
                    tirar(x);
                }
                else
                    encaixar(x, dias, soNoDia);
            }
        };
        /** Até duas metas da mesma lei; um segundo bloco deve ser de outra disciplina. */
        const encaixarLP = (dias) => {
            const meta = (id) => lpMetas.get(id);
            for (const dt of [...dias].sort()) {
                const idsDia = () => Object.keys(plano).filter((id) => id.startsWith('lp:') && plano[id][0] === dt);
                while (livre(dt) >= DUR.lp) {
                    let k = -1;
                    const rodizio = rodizioLP25.ordenar(lpCarry.map((id) => { var _a; return (_a = meta(id)) === null || _a === void 0 ? void 0 : _a.disc; }));
                    for (const disc of rodizio) {
                        const primeiro = lpCarry.findIndex((id) => { var _a; return ((_a = meta(id)) === null || _a === void 0 ? void 0 : _a.disc) === disc; });
                        if (primeiro >= 0 && permitirLegproc25(lpCarry[primeiro], idsDia(), meta, P.legproc)) {
                            k = primeiro;
                            break;
                        }
                    }
                    if (k < 0)
                        break;
                    const id = lpCarry.splice(k, 1)[0], m = meta(id);
                    por(dt, id, DUR.lp);
                    rodizioLP25.avancar(m.disc);
                    // Completa o primeiro bloco antes de procurar uma segunda disciplina.
                    const j = lpCarry.findIndex((x) => { var _a; return ((_a = meta(x)) === null || _a === void 0 ? void 0 : _a.disc) === m.disc; });
                    if (j >= 0 && livre(dt) >= DUR.lp && permitirLegproc25(lpCarry[j], idsDia(), meta, P.legproc))
                        por(dt, lpCarry.splice(j, 1)[0], DUR.lp);
                }
            }
        };
        /** Lê PDFULL em um dia: termina o que estiver em curso ou começa o próximo; o que não couber vira parte e continua depois. */
        const pdfsEm = (dt) => new Set(Object.entries(plano).filter(([id, [d]]) => d === dt && /^p[fp]:/.test(id)).map(([id]) => +id.split(':')[1]));
        const lerPdf = (dt, limite, soInteiro = false) => {
            var _a, _b, _c;
            if (dt < ultimaLeitura)
                return false;
            const candidato = (_a = emCurso === null || emCurso === void 0 ? void 0 : emCurso.i) !== null && _a !== void 0 ? _a : pdfQ[qi];
            if (candidato == null)
                return false;
            if (soInteiro && !emCurso && restante(candidato) > limite)
                return false; // 2.18 (CT-06): não abre PDFull que não cabe inteiro na sobra
            const datas = Object.entries(plano).filter(([id]) => /^p[fp]:/.test(id) && +id.split(':')[1] === candidato).map(([, v]) => v[0]);
            const resto = ((emCurso === null || emCurso === void 0 ? void 0 : emCurso.ultima) && emCurso.ultima < dt) || datas.some((d) => d < dt) || (((_b = cfg.paginasLidas) === null || _b === void 0 ? void 0 : _b[candidato]) || 0) > 0 || (((_c = cfg.partesLidas) === null || _c === void 0 ? void 0 : _c[candidato]) || 0) > 0;
            if (!resto && !pdfsEm(dt).has(candidato) && novosPDFDia27(plano, cfg, dt).size >= limitePDF27(cfg, P.tetoPdfDia))
                return false;
            if (!emCurso) {
                if (qi >= pdfQ.length)
                    return false;
                const i = pdfQ[qi++];
                emCurso = { i, resta: restante(i), k: maxParte[i] || 0, ultima: Object.entries(fixos).filter(([id]) => id.startsWith('pp:' + i + ':')).reduce((d, [, v]) => (v[0] > d ? v[0] : d), '') };
            }
            if (emCurso.ultima && dt < emCurso.ultima)
                return false; // a continuação nunca vem antes da parte já marcada
            const m = Math.min(emCurso.resta, Math.floor(limite / 30) * 30);
            if (m < 30)
                return false;
            ultimaLeitura = dt;
            const { i } = emCurso;
            if (m >= emCurso.resta) {
                if (metas.pf)
                    por(dt, 'pf:' + i, m);
                registrar(i, dt);
                emCurso = null;
            }
            else {
                if (metas.pf)
                    por(dt, `pp:${i}:${++emCurso.k}`, m);
                emCurso.resta -= m;
                emCurso.ultima = dt;
            }
            return true;
        };
        /** Sobras são usadas somente depois das quatro prioridades do dia. */
        const preencher = (dias) => {
            var _a;
            encaixarTipo('fl', dias.filter((d) => d !== concentrado));
            encaixarTipo('qu', dias);
            encaixarLP(dias);
            if (qi >= pdfQ.length && !emCurso) {
                // Na reta final, mantém a precedência da aula e da revisão de cada tema.
                for (const tipo of ['fl', 'qu'])
                    for (const x of [...devidos].filter((y) => y.tipo === tipo).sort(porData)) {
                        const i = x.id.split(':')[1], antes = tipo === 'qu' && plano['fl:' + i] ? plano['fl:' + i][0] : (_a = plano['pf:' + i]) === null || _a === void 0 ? void 0 : _a[0];
                        const permitidos = (tipo === 'fl' ? dias.filter((d) => d !== concentrado) : diasQuestoes).filter((d) => !antes || d > antes);
                        const dt = permitidos.find((d) => livre(d) >= DUR[tipo]);
                        if (dt) {
                            por(dt, x.id, DUR[tipo]);
                            tirar(x);
                        }
                    }
            }
        };
        if (semRev) {
            // Semana de revisão: sem aulas novas. Reserva Revisão + questões (1h30) por tema já estudado;
            // o tempo que sobrar recebe pendências e LegProc.
            const temas = Object.entries(plano).filter(([id, [d]]) => id.startsWith('pf:') && d < ini).length;
            const reserva = planoRevisao(diasSem.map((dt) => livre(dt)), temas, diasSem.map((dt) => dt === concentrado), P.durRevisao);
            diasSem.forEach((dt, k) => { if (reserva[k].usado)
                carga[dt] = (carga[dt] || 0) + reserva[k].usado; });
            preencher(diasSem);
            fim = sem;
            continue;
        }
        // Primeiro PDF depois das revisões; segundo PDF somente depois das questões e dos dois blocos de LegProc.
        encaixarTipo('fl', diasConteudo);
        const diasPdf = diasConteudo.filter((d) => cap(d) >= 30);
        if (concentrado)
            encaixarTipo('qu', [concentrado]);
        for (const dt of [...diasSem].sort()) {
            const permitePdf = diasPdf.includes(dt);
            if (permitePdf && pdfsEm(dt).size === 0)
                lerPdf(dt, livre(dt));
            encaixarTipo('qu', [dt]);
            encaixarLP([dt]);
            if (permitePdf)
                for (let tentativa = 0; tentativa < 2 && livre(dt) >= 30; tentativa++)
                    if (!lerPdf(dt, livre(dt), P.regras218.pdfInteiro))
                        break;
        }
        preencher(diasSem);
        if (diasSem.some((dt) => carga[dt]))
            fim = sem;
        const acabou = qi >= pdfQ.length && !emCurso && !devidos.length && !lpCarry.length;
        if (acabou)
            break;
    }
    return { plano, fim };
}
/** Páginas (início/fim) de uma parte de PDFull, proporcionais aos minutos das partes da aula no plano. */
function detalhesPdf(id, plano, detalhes, AS) {
    var _a, _b;
    if (((_a = detalhes[id]) === null || _a === void 0 ? void 0 : _a.paginaInicio) != null)
        return { ...detalhes[id] };
    const i = indiceAula(id), total = ((_b = AS[i]) === null || _b === void 0 ? void 0 : _b[3]) || 0;
    const blocos = Object.entries(plano).filter(([k]) => /^p[fp]:[0-9]+(:[0-9]+)?$/.test(k) && indiceAula(k) === i)
        .sort((a, b) => a[1][0].localeCompare(b[1][0]) || (Number(tipoEstudo(a[0]) === 'pf') - Number(tipoEstudo(b[0]) === 'pf')) || a[0].localeCompare(b[0], 'en', { numeric: true }));
    const minutos = blocos.reduce((s, [, [, h]]) => s + h * 60, 0);
    let antes = 0;
    for (const [k, [, h]] of blocos) {
        const ini = minutos ? Math.floor(total * antes / minutos) + 1 : 1;
        antes += h * 60;
        if (k === id)
            return { paginaInicio: ini, paginaFim: minutos ? Math.floor(total * antes / minutos) : total, totalPaginas: total };
    }
    return { paginaInicio: 1, paginaFim: total, totalPaginas: total };
}
/**
 * calcularDomino do modelo: redistribui `fonte` a partir de `desde`, dia a dia, respeitando continuidade
 * (metas remanejadas primeiro), Revisão → PDFull → Questões → LegProc, a ordem das aulas, o limite de PDFull
 * novos e as regras do LegProc. Lança erro se não houver disponibilidade (o chamador decide o que fazer).
 */
function calcularDomino(fonte, cfg, desde, opcoes, c) {
    var _a;
    const plano = {}, detalhes = copiar(opcoes.detalhes || {});
    const fila = [];
    const ordem = new Map((c.ordem || []).map((i, k) => [i, k]));
    const contadores = {};
    for (const id of new Set([...Object.keys(fonte), ...c.usados, ...Object.keys(detalhes)]))
        if (id.startsWith('pp:')) {
            const [, i, k] = id.split(':');
            contadores[i] = Math.max(contadores[i] || 0, +k || 0);
        }
    const lpDe = (id) => c.lpMap.get(id);
    const disciplinaMeta = (id) => { var _a, _b; return (tipoEstudo(id) === 'lp' ? (_a = lpDe(id)) === null || _a === void 0 ? void 0 : _a.disc : (_b = c.AS[indiceAula(id)]) === null || _b === void 0 ? void 0 : _b[0]); };
    const leiMeta = (id) => { var _a; return chaveLei(lpDe(id)) || (((_a = lpDe(id)) === null || _a === void 0 ? void 0 : _a.disc) + '|meta:' + id); };
    let sequencia = 0;
    for (const [id, [data, h]] of Object.entries(fonte)) {
        const t = tipoEstudo(id), minutos = Math.round(h * 60);
        if (c.feitas.has(id) || data < desde) {
            plano[id] = [data, h];
            continue;
        }
        const disc = disciplinaMeta(id), meta = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t;
        if (!cfg.discs.includes(disc) || !cfg.metas[meta])
            continue;
        if (minutos <= 0)
            continue;
        const detalhe = ehPdf(t) ? detalhesPdf(id, fonte, detalhes, c.AS) : { ...(detalhes[id] || {}) };
        fila.push({ id, t, data, minutos, detalhe, seq: sequencia++ });
    }
    const capacidade = (d) => Math.round(horasDia(cfg, d) * 60);
    // Índices incrementais do plano (mesmo resultado das varreduras do modelo; cada id entra uma única vez).
    const ocupadoDia = {}, idsDoDia = new Map();
    const primeiroPdf = new Map(), restos = new Set();
    const indexarMeta = (id) => {
        var _a, _b, _c;
        const [d, h] = plano[id];
        ocupadoDia[d] = (ocupadoDia[d] || 0) + Math.round(h * 60);
        const l = idsDoDia.get(d);
        if (l)
            l.push(id);
        else
            idsDoDia.set(d, [id]);
        if (ehPdf(tipoEstudo(id))) {
            const i = indiceAula(id), p = primeiroPdf.get(i);
            if (p == null || d < p)
                primeiroPdf.set(i, d);
            if (((_a = detalhes[id]) === null || _a === void 0 ? void 0 : _a.continuacao) || (((_b = cfg.paginasLidas) === null || _b === void 0 ? void 0 : _b[i]) || 0) > 0 || (((_c = cfg.partesLidas) === null || _c === void 0 ? void 0 : _c[i]) || 0) > 0)
                restos.add(i);
        }
    };
    for (const id of Object.keys(plano))
        indexarMeta(id);
    const ocupado = (d) => ocupadoDia[d] || 0;
    if (ocupado(desde) > capacidade(desde))
        throw Error('Esse dia já tem metas concluídas além das horas informadas.');
    const pdfsDia = (d) => new Set((idsDoDia.get(d) || []).filter((id) => ehPdf(tipoEstudo(id))).map(indiceAula));
    const lpsDia = (d) => (idsDoDia.get(d) || []).filter((k) => k.startsWith('lp:'));
    const novosNoDia = (d) => { let n = 0; for (const [i, p] of primeiroPdf)
        if (p === d && !restos.has(i))
            n++; return n; };
    const anteriores = Object.entries(plano).filter(([id]) => id.startsWith('lp:')).sort((a, b) => a[1][0].localeCompare(b[1][0]));
    const rodizioDomino25 = criarRodizioLP25(cfg.discs, anteriores.length ? ((_a = disciplinaMeta(anteriores[anteriores.length - 1][0])) !== null && _a !== void 0 ? _a : null) : null, c.params.lpJanelaRodizio);
    const ordemRodizio25 = () => rodizioDomino25.ordenar(fila.filter((x) => x.t === 'lp').map((x) => disciplinaMeta(x.id)));
    const rankRodizio25 = (x, d, ordemRod) => {
        const ids = lpsDia(d);
        const ultima = ids[ids.length - 1], disc = disciplinaMeta(x.id);
        if (ultima && disciplinaMeta(ultima) === disc && ids.filter((id) => disciplinaMeta(id) === disc).length === 1 && leiMeta(ultima) === leiMeta(x.id))
            return -1;
        return ordemRod.indexOf(disc);
    };
    const prioridade = (x, d, pdfsHoje) => {
        var _a, _b;
        if (x.detalhe.continuacao || ((_a = cfg.remanejadas) === null || _a === void 0 ? void 0 : _a[x.id]))
            return -1;
        if (ehPdf(x.t) && ((x.data > d) || (pdfsHoje.size > 0 && !pdfsHoje.has(indiceAula(x.id)))))
            return 4;
        return (_b = { fl: 0, rf: 0, pf: 1, pp: 1, qu: 2, rq: 2, lp: 3 }[x.t]) !== null && _b !== void 0 ? _b : 4;
    };
    // Índices da fila (equivalentes às buscas `fila.some(...)` do modelo, recalculados a cada colocação).
    const ordAula = (i) => { var _a; return (_a = ordem.get(i)) !== null && _a !== void 0 ? _a : 1e9; };
    const lpRank = (id) => { var _a; return (_a = c.lpPos.get(id)) !== null && _a !== void 0 ? _a : -1; };
    const liberar = (x, d, ix) => {
        var _a, _b;
        const adiantar = d === desde && ((opcoes.adiantarLP && x.t === 'lp') || (opcoes.adiantarPDF && ehPdf(x.t)));
        if (x.data > d && !adiantar)
            return false;
        const i = indiceAula(x.id);
        if (ehPdf(x.t)) {
            const resto = x.detalhe.continuacao || (((_a = cfg.paginasLidas) === null || _a === void 0 ? void 0 : _a[i]) || 0) > 0 || (((_b = cfg.partesLidas) === null || _b === void 0 ? void 0 : _b[i]) || 0) > 0 || ix.pdfAntes.has(i);
            if (!resto && !ix.pdfsHoje.has(i) && ix.novosHoje >= limitePDF27(cfg, c.params.tetoPdfDia))
                return false;
            const antes = ix.pdfs.some((y) => y !== x && ((!x.detalhe.continuacao && ordAula(indiceAula(y.id)) < ordAula(i)) || (indiceAula(y.id) === i && (y.data < x.data || (y.data === x.data && y.seq < x.seq)))));
            if (antes)
                return false;
        }
        if (x.t === 'fl' || x.t === 'qu') {
            const pai = 'pf:' + i;
            if (ix.idsNaFila.has(pai))
                return false;
            if (plano[pai]) {
                const ideal = idealRev(cfg, c.params, c.fracos, i, plano[pai][0], x.t === 'fl' ? 'fl' : 'qu');
                if (d < ideal)
                    return false;
            }
            if (x.t === 'qu' && ix.idsNaFila.has('fl:' + i))
                return false;
            if (x.t === 'qu' && plano['fl:' + i] && d < plano['fl:' + i][0])
                return false;
        }
        if (x.t === 'rq') {
            const rev = x.id.replace(/^rq:/, 'rf:');
            if (ix.idsNaFila.has(rev))
                return false;
            if (plano[rev] && d < plano[rev][0])
                return false;
        }
        if (x.t === 'lp') {
            if (!permitirLegproc25(x.id, ix.lpsHoje, lpDe, c.params.legproc))
                return false;
            const disc = disciplinaMeta(x.id);
            if (!x.detalhe.continuacao && !ix.ordemRod.includes(disc))
                return false;
            const rank = lpRank(x.id), min = ix.lpMinDisc.get(disc);
            if (min != null && min < rank)
                return false; // outra meta da mesma disciplina, anterior no catálogo, ainda na fila
        }
        // Continuidade e tarefas que transbordaram têm preferência no próximo dia de estudo.
        if (d === ix.ultimo && (ehPdf(x.t) || x.t === 'fl' || x.t === 'rf') && !x.detalhe.continuacao && x.data >= d)
            return false;
        return true;
    };
    let fim = Math.max(1, semDe(cfg.start, desde));
    for (let k = 0, d = desde; k < 1400 && fila.length; k++, d = dAdd(d, 1)) {
        let livre = capacidade(d) - ocupado(d);
        if (livre <= 0)
            continue;
        const ultimo = perfilSemana(cfg, semDe(cfg.start, d), c.params.concentracaoAteH).concentrado;
        while (livre > 0) {
            const idsNaFila = new Set(fila.map((x) => x.id));
            const pdfs = fila.filter((x) => ehPdf(x.t));
            const lpMinDisc = new Map();
            for (const y of fila)
                if (y.t === 'lp') {
                    const ds = disciplinaMeta(y.id), r = lpRank(y.id);
                    if (!lpMinDisc.has(ds) || r < lpMinDisc.get(ds))
                        lpMinDisc.set(ds, r);
                }
            const ordemRod = ordemRodizio25(), pdfsHoje = pdfsDia(d), lpsHoje = lpsDia(d);
            const pdfAntes = new Set(); // aulas com alguma parte de PDFull já posta antes de d
            for (const [i, p] of primeiroPdf)
                if (p < d)
                    pdfAntes.add(i);
            const ix = { idsNaFila, pdfs, lpMinDisc, ordemRod, pdfsHoje, pdfAntes, novosHoje: novosNoDia(d), ultimo, lpsHoje };
            // lpMinDisc inclui a própria meta: só bloqueia se houver OUTRA com rank menor (equivalente ao modelo).
            const disponiveis = fila.filter((x) => liberar(x, d, ix) && (ehPdf(x.t) || x.minutos <= livre))
                .sort((a, b) => prioridade(a, d, pdfsHoje) - prioridade(b, d, pdfsHoje) || (a.t === 'lp' && b.t === 'lp' ? rankRodizio25(a, d, ordemRod) - rankRodizio25(b, d, ordemRod) : 0) || a.data.localeCompare(b.data) || a.seq - b.seq);
            const x = disponiveis[0];
            if (!x)
                break;
            const m = Math.min(x.minutos, livre);
            if (x.t === 'lp')
                rodizioDomino25.avancar(disciplinaMeta(x.id));
            if (ehPdf(x.t) && m < x.minutos) {
                const i = indiceAula(x.id), id = 'pp:' + i + ':' + (contadores[i] = (contadores[i] || 0) + 1);
                const md = { ...x.detalhe, origem: x.detalhe.origem || x.id, pai: x.detalhe.pai || 'pf:' + i };
                const pags = Math.max(0, (md.paginaFim || 0) - (md.paginaInicio || 1) + 1), lidas = Math.floor(pags * m / x.minutos);
                md.paginaFim = (md.paginaInicio || 1) + lidas - 1;
                plano[id] = [d, m / 60];
                detalhes[id] = md;
                indexarMeta(id);
                x.detalhe = { ...x.detalhe, paginaInicio: md.paginaFim + 1 };
                x.minutos -= m;
                x.data = dAdd(d, 1);
                x.detalhe.deslocada = true;
            }
            else {
                plano[x.id] = [d, m / 60];
                detalhes[x.id] = { ...x.detalhe, deslocada: d !== x.data || x.detalhe.deslocada };
                indexarMeta(x.id);
                fila.splice(fila.indexOf(x), 1);
            }
            livre -= m;
            fim = Math.max(fim, semDe(cfg.start, d));
        }
    }
    if (fila.length)
        throw Error('Não há disponibilidade suficiente para redistribuir todas as metas.');
    for (const [d] of Object.values(plano))
        fim = Math.max(fim, semDe(cfg.start, d));
    return { plano, detalhes, fim };
}
/** Interrupções no formato da plataforma (sobras/paginasLidas) → metas remanejadas do modelo. */
function remanejadasEfetivas(cfg, AS, fixos, base, P) {
    var _a;
    const out = { ...(cfg.remanejadas || {}) };
    const desde = (0, exports.proximoEstudo)(cfg, base) || base;
    for (const [id, m] of Object.entries(cfg.sobras || {})) {
        const t = id.split(':')[0];
        if (out[id] || fixos[id] || !(+m > 0) || (t !== 'fl' && t !== 'qu' && t !== 'lp'))
            continue;
        out[id] = { desde, minutos: Math.max(10, Math.round(+m)), detalhe: { continuacao: true, pai: id, origem: id } };
    }
    for (const [k, lida] of Object.entries(cfg.paginasLidas || {})) {
        const i = +k, id = 'pf:' + i, pags = +(((_a = AS[i]) === null || _a === void 0 ? void 0 : _a[3]) || 0);
        if (out[id] || fixos[id] || !AS[i] || !(+lida > 0) || !(pags > +lida))
            continue;
        out[id] = { desde, minutos: minPdf(pags - +lida, cfg.vel, P.velPadrao), detalhe: { continuacao: true, pai: id, origem: id, paginaInicio: +lida + 1, paginaFim: pags, totalPaginas: pags } };
    }
    return out;
}
/**
 * Gera o plano (gerarPlano → gerarPlanoCatalogo → gerarPlanoBase [→ calcularDomino] do modelo).
 * AS = aulas; LP = metas de LegProc na ordem do catálogo; fixos = metas que não se movem; ancora = início da
 * redistribuição; ctx.ordem = ordem de distribuição das aulas; ctx.feitas = metas concluídas.
 */
function gerarPlanoNucleo(cfg, AS, LP, fixos, ancora, ctx = {}) {
    var _a, _b;
    fixos = fixos || {};
    const P = resolverParams(ctx.params);
    const feitas = new Set(ctx.feitas || []);
    const base = ancora && ancora > cfg.start ? ancora : cfg.start;
    const remanejadas = remanejadasEfetivas(cfg, AS, fixos, base, P);
    const c = { ...cfg, remanejadas };
    const lista = (LP || []).filter((x) => x && x.id);
    const ordemCat = ctx.ordem && ctx.ordem.length ? ctx.ordem.filter((i) => AS[i]) : AS.map((_, i) => i);
    const anteriores0 = indicesAnteriores(c, AS, ordemCat);
    const ctxI = {
        AS, LP: lista, lpMap: new Map(lista.map((x) => [x.id, x])), lpPos: new Map(lista.map((x, k) => [x.id, k])),
        // matérias em paralelo (cfg.paralelo): reequilibra a fila entre as disciplinas selecionadas (mantém a ordem dentro de cada uma)
        ordem: ordemParalela(ordemCat, AS, new Set(c.discs), anteriores0, typeof c.paralelo === 'number' ? c.paralelo : null), feitas, usados: new Set(ctx.usados || []), params: P,
        // inteligência de desempenho: vazio (e ignorado) enquanto a flag estiver desligada → plano idêntico ao 2.8
        fracos: P.desempenho.ativo ? temasFracos(ctx.notas, P.desempenho.acertoMin) : new Set(),
    };
    // gerarPlanoCatalogo: fila de aulas sem o histórico prévio; metas remanejadas ficam presas na data pedida
    const anteriores = anteriores0;
    const ehAnterior = (id) => !(0, exports.ehHist)(id) && !(0, exports.ehReforco)(id) && /^(pf|pp|fl|qu|rf|rq):/.test(id) && anteriores.has(indiceAula(id));
    const presos = Object.fromEntries(Object.entries(fixos).filter(([id]) => !ehAnterior(id) || feitas.has(id)));
    for (const [id, r] of Object.entries(remanejadas)) {
        if (presos[id] || ehAnterior(id))
            continue;
        const t = id.split(':')[0], i = indiceAula(id);
        const disc = t === 'lp' ? (_a = ctxI.lpMap.get(id)) === null || _a === void 0 ? void 0 : _a.disc : (_b = AS[i]) === null || _b === void 0 ? void 0 : _b[0];
        const tipo = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t;
        if (!disc || !c.discs.includes(disc) || !c.metas[tipo])
            continue;
        presos[id] = [r.desde < base ? base : r.desde, r.minutos / 60];
    }
    const g = gerarPlanoBase(c, AS, ctxI.ordem.filter((i) => !anteriores.has(i)), lista, presos, ancora, P, ctxI.fracos);
    for (const id of Object.keys(remanejadas))
        if (g.plano[id])
            g.fim = Math.max(g.fim, semDe(c.start, g.plano[id][0]));
    if (!Object.keys(remanejadas).length)
        return { ...g, detalhes: copiar(ctx.detalhes || {}) };
    const detalhes = copiar(ctx.detalhes || {});
    for (const [id, r] of Object.entries(remanejadas))
        if (g.plano[id] && !feitas.has(id)) {
            detalhes[id] = { ...(detalhes[id] || {}), ...(r.detalhe || {}), continuacao: true, pai: id, geracao: r.geracao || null };
        }
    try {
        return calcularDomino(g.plano, c, base, { detalhes }, ctxI);
    }
    catch {
        return { ...g, detalhes };
    } // sem disponibilidade p/ o dominó: fica a distribuição base
}
// ── Reservas por semana (fora do núcleo): Jurisprudência semanal (2.19) + diagnóstico do histórico (2.13) ─────────
// O plano é gerado com o tempo reservado JÁ descontado da capacidade dos dias escolhidos (horasPontuais) e as reservas
// são reunidas ao plano no fim (como o dominó da 2.19). Ambas desligadas por padrão: sem elas o plano é idêntico.
const ehJuris219 = (id) => id.startsWith('jp:');
exports.ehJuris219 = ehJuris219;
function reservarJuris219(cfg, sem, desde, fonte, feitas, minPadrao, usados) {
    const ini = semInicio(cfg.start, sem), fimSem = dAdd(ini, 6);
    const ids = Object.keys(fonte).filter((id) => (0, exports.ehJuris219)(id) && fonte[id][0] >= ini && fonte[id][0] <= fimSem);
    const concluida = ids.find((id) => feitas.has(id));
    if (concluida)
        return { id: concluida, valor: fonte[concluida] };
    const rems = Object.entries(cfg.remanejadas || {}).filter(([id]) => (0, exports.ehJuris219)(id));
    const rem = rems.find(([, r]) => semDe(cfg.start, r.desde) === sem);
    // a meta desta semana foi levada para outra semana: não recria a de origem
    if (!ids.length && !rem && rems.some(([id, r]) => +id.split(':')[1] === sem && semDe(cfg.start, r.desde) !== sem))
        return null;
    const id = (rem === null || rem === void 0 ? void 0 : rem[0]) || ids[0] || 'jp:' + sem;
    const minutos = Math.min(minPadrao, Math.max(1, Math.round((rem === null || rem === void 0 ? void 0 : rem[1].minutos) || minPadrao)));
    const ocupada = (d) => Object.entries(fonte).filter(([k, v]) => !(0, exports.ehJuris219)(k) && feitas.has(k) && v[0] === d).reduce((s, [, v]) => s + v[1] * 60, 0);
    const datas = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).filter((d) => d >= cfg.start && d >= desde);
    if (!datas.some((d) => horasDia(cfg, d) > 0))
        return null; // semana sem estudo não recebe a reserva
    const livre = (d) => horasDia(cfg, d) * 60 - ocupada(d) - (usados[d] || 0);
    const dias = datas.filter((d) => livre(d) >= minutos);
    let escolhido;
    if (rem) {
        if (!dias.includes(rem[1].desde))
            throw Error('Não há tempo disponível para a meta de Jurisprudência na data escolhida.');
        escolhido = rem[1].desde;
    }
    else {
        const ordenar = (a, b) => livre(b) - livre(a) || a.localeCompare(b);
        const preferidos = dias.filter((d) => [4, 5].includes(dDow(d))).sort(ordenar); // sexta e sábado
        escolhido = preferidos[0] || [...dias].sort(ordenar)[0];
        // semana já em andamento (dias anteriores a `desde` ficaram para trás): sem dia que caiba, não trava a reorganização
        if (!escolhido && ini < desde)
            return null;
        if (!escolhido)
            throw Error('A semana ' + sem + ' precisa de um dia com ' + minutos + ' min disponíveis para Jurisprudência. Ajuste a rotina ou as horas dessa semana.');
    }
    usados[escolhido] = (usados[escolhido] || 0) + minutos;
    return { id, valor: [escolhido, minutos / 60] };
}
/** Alvo global semanal de diagnósticos do histórico: 2 metas abaixo de 24h na semana, 3 a partir de 24h. */
function metaSemanalHistorico(cfg, sem, R = regras_1.REGRAS_PADRAO) {
    const ini = semInicio(cfg.start, sem);
    return Array.from({ length: 7 }, (_, k) => horasDia(cfg, dAdd(ini, k)) * 60).reduce((a, b) => a + b, 0) >= R.historico.corteAltaMin ? R.historico.metaSemanalAlta : R.historico.metaSemanalBase;
}
function reservarDiagnostico(cfg, sem, desde, fonte, feitas, fila, usados) {
    const out = [];
    if (ehRev(cfg, sem))
        return out; // semana de revisão não recebe diagnóstico
    const ini = semInicio(cfg.start, sem);
    const datas = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).filter((d) => d >= cfg.start && d >= desde);
    const existentes = Object.keys(fonte).filter((id) => (0, exports.ehHist)(id) && feitas.has(id) && semDe(cfg.start, fonte[id][0]) === sem).length;
    const ocupada = (d) => Object.entries(fonte).filter(([k, v]) => !(0, exports.ehJuris219)(k) && feitas.has(k) && v[0] === d).reduce((s, [, v]) => s + v[1] * 60, 0);
    const livre = (d) => horasDia(cfg, d) * 60 - ocupada(d) - (usados[d] || 0);
    const concentrado = perfilSemana(cfg, sem).concentrado;
    for (let n = existentes; n < metaSemanalHistorico(cfg, sem) && fila.length; n++) {
        // não tira o tempo do PDFull da semana: precisa sobrar ao menos 30 min além do diagnóstico
        if (datas.reduce((t, d) => t + Math.max(0, livre(d)), 0) < 30 + (cfg.metas.pf ? 30 : 0))
            break;
        const d = datas.filter((x) => livre(x) >= 30)
            .sort((a, b) => (+(b === concentrado)) - (+(a === concentrado)) || horasDia(cfg, b) - horasDia(cfg, a) || a.localeCompare(b))[0];
        if (!d)
            break;
        const i = fila.shift();
        usados[d] = (usados[d] || 0) + 30;
        out.push({ id: `qu:${i}:hist:${sem}`, valor: [d, 0.5] });
    }
    return out;
}
/**
 * Reforço pelo RESULTADO do diagnóstico (2.13 §7.4), derivado das anotações (res/err) a cada geração — sem estado extra:
 * <50% → PDFull da aula inteira · 50% até <70% → PDFlash · ≥70% nada. Começa na PRÓXIMA semana civil da conclusão
 * e entra como meta remanejada (continuidade primeiro no dia; o dominó divide o PDFull em partes se não couber).
 */
function reforcosDerivados(cfg, AS, fixos, feitas, notas, base, P) {
    var _a, _b;
    const out = {};
    for (const id of feitas) {
        if (!(0, exports.ehHist)(id) || !fixos[id])
            continue;
        const n = notas === null || notas === void 0 ? void 0 : notas[id], total = +((n === null || n === void 0 ? void 0 : n.res) || 0), erros = +((n === null || n === void 0 ? void 0 : n.err) || 0);
        if (!n || !Number.isInteger(total) || !Number.isInteger(erros) || total <= 0 || erros < 0 || erros > total)
            continue;
        const nivel = classificarResultado218((total - erros) / total * 100); // percentual exato
        if (nivel === 'ok')
            continue;
        const i = indiceAula(id), disc = (_a = AS[i]) === null || _a === void 0 ? void 0 : _a[0];
        if (!disc)
            continue;
        const tipo = nivel === 'pf' || P.semFlash.has(disc) ? 'pf' : 'fl';
        const rid = `${tipo}:${i}:reforco:${id.split(':')[3]}`;
        if (feitas.has(rid) || fixos[rid] && feitas.has(rid))
            continue;
        const proxima = dAdd(dMon(fixos[id][0]), 7); // próxima semana civil da conclusão
        const desde = proxima < base ? base : proxima;
        const pags = +(((_b = AS[i]) === null || _b === void 0 ? void 0 : _b[3]) || 60);
        out[rid] = tipo === 'pf'
            ? { desde, minutos: minPdf(pags, cfg.vel, P.velPadrao), detalhe: { continuacao: true, pai: rid, origem: id, reforco: true, paginaInicio: 1, paginaFim: pags, totalPaginas: pags } }
            : { desde, minutos: P.dur.fl, detalhe: { continuacao: true, pai: rid, origem: id, reforco: true } };
    }
    return out;
}
function gerarPlano(cfg, AS, LP, fixos, ancora, ctx = {}) {
    const P = resolverParams(ctx.params);
    const anteriores = indicesAnteriores(cfg, AS, ctx.ordem);
    const hist = P.historico.ativo && anteriores.size > 0;
    if (!P.juris.ativo && !hist)
        return gerarPlanoNucleo(cfg, AS, LP, fixos, ancora, ctx); // regras desligadas = plano idêntico
    fixos = fixos || {};
    const feitas = new Set(ctx.feitas || []);
    const base = ancora && ancora > cfg.start ? ancora : cfg.start;
    const normal = {}, passadas = {};
    for (const [id, v] of Object.entries(fixos)) {
        if ((0, exports.ehJuris219)(id)) {
            if (P.juris.ativo && (v[0] < base || feitas.has(id)))
                passadas[id] = v;
            continue;
        }
        if ((0, exports.ehHist)(id) && !feitas.has(id))
            continue; // diagnóstico ainda não feito: volta para a fila e é replanejado
        normal[id] = v;
    }
    const remanejadas = Object.fromEntries(Object.entries(cfg.remanejadas || {}).filter(([id]) => !(0, exports.ehJuris219)(id)));
    if (hist)
        for (const [id, r] of Object.entries(reforcosDerivados(cfg, AS, fixos, feitas, ctx.notas, base, P)))
            if (!remanejadas[id] && !normal[id])
                remanejadas[id] = r;
    const cfgN = { ...cfg, remanejadas };
    const temasFeitos = new Set([...feitas].filter(exports.ehHist).map(indiceAula));
    const ordemAulas = ctx.ordem && ctx.ordem.length ? ctx.ordem : AS.map((_, i) => i);
    const filaBase = hist ? ordemAulas.filter((i) => AS[i] && anteriores.has(i) && cfg.discs.includes(AS[i][0]) && !temasFeitos.has(i)) : [];
    const semIni = Math.max(1, semDe(cfg.start, base));
    let limite = Math.max(semDe(cfg.start, base), gerarPlanoNucleo(cfgN, AS, LP, normal, ancora, ctx).fim);
    for (let tentativa = 0; tentativa < 40; tentativa++) {
        const reservas = { ...passadas }, usados = {}, fila = [...filaBase];
        const detReservas = {};
        // semanas até o fim do plano E, se ainda houver diagnósticos na fila, as semanas seguintes (a fila não some)
        for (let sem = semIni; sem <= limite || (fila.length && sem <= semIni + 520); sem++) {
            if (P.juris.ativo) {
                const r = reservarJuris219(cfg, sem, base, fixos, feitas, P.juris.min, usados);
                if (r) {
                    reservas[r.id] = r.valor;
                    detReservas[r.id] = { jurisprudencia: true };
                }
            }
            if (fila.length)
                for (const r of reservarDiagnostico(cfg, sem, base, fixos, feitas, fila, usados)) {
                    reservas[r.id] = r.valor;
                    detReservas[r.id] = { historico: true };
                }
        }
        const reduzida = { ...cfgN, horasPontuais: { ...(cfgN.horasPontuais || {}) } };
        for (const [d, m] of Object.entries(usados))
            if (d >= base)
                reduzida.horasPontuais[d] = Math.max(0, horasDia(cfg, d) - m / 60);
        const g = gerarPlanoNucleo(reduzida, AS, LP, normal, ancora, ctx);
        if (g.fim > limite) {
            limite = g.fim;
            continue;
        } // o plano avançou: reserva também as novas semanas
        const detalhes = g.detalhes || {};
        for (const [id, d] of Object.entries(detReservas))
            detalhes[id] = { ...(detalhes[id] || {}), ...d };
        return { plano: { ...g.plano, ...reservas }, detalhes, fim: Math.max(g.fim, ...Object.values(reservas).map((v) => semDe(cfg.start, v[0]))) };
    }
    throw Error('Não foi possível encaixar as metas extras (Jurisprudência/diagnóstico) e as demais. Ajuste a disponibilidade.');
}
/** Saúde do plano: atraso das revisões e questões em relação ao ideal (7 e 14 dias). */
function saudePlano(plano, cfg) {
    const out = { fl: { n: 0, atraso: 0, max: 0 }, qu: { n: 0, atraso: 0, max: 0 } };
    for (const [id, [d]] of Object.entries(plano)) {
        const [t, i] = id.split(':');
        if (t !== 'fl' && t !== 'qu')
            continue;
        const pf = plano['pf:' + i];
        if (!pf)
            continue;
        const ideal = proxSemConteudo(cfg, pf[0], t === 'fl' ? 1 : 2);
        if (recessoEm(cfg, ideal))
            continue;
        const atraso = Math.max(0, Math.round((+dParse(d) - +dParse(ideal)) / 864e5));
        out[t].n++;
        out[t].atraso += atraso;
        out[t].max = Math.max(out[t].max, atraso);
    }
    for (const k of Object.keys(out))
        out[k].media = out[k].n ? out[k].atraso / out[k].n : 0;
    return out;
}

  };
  defs['motor30'] = function (module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._interno = exports.pdfRegular = exports.metaRevisao217 = exports.TIPOS_BLOQUEAVEIS = exports.ehJuris219 = exports.revisaoAdaptativa = exports.reforcoHistorico = exports.questoesHistorico = exports.ErroInsuficiencia = exports.AGU = exports.COMPLEMENTARES = exports.ESSENCIAIS = exports.REV_PADRAO = exports.REV_OPCOES_NOVAS = exports.MAX_SEM = exports.regra23 = exports.VERSAO_REGRA23 = exports.VERSAO_MOTOR = exports.hashRegras = exports.resolverTetoPdf = exports.resolverFaixaCarga = exports.resolverFaixa = exports.normalizarRegras = exports.resolverRegras = exports.REGRAS_PADRAO = void 0;
exports.motorAtingiu = motorAtingiu;
exports.criarBloqueios = criarBloqueios;
exports.normalizarCada = normalizarCada;
exports.validarHoras300 = validarHoras300;
exports.rotina300 = rotina300;
exports.tetoInfo300 = tetoInfo300;
exports.tetoPDF300 = tetoPDF300;
exports.cotaPDFlash300 = cotaPDFlash300;
exports.metaBloqueada = metaBloqueada;
exports.ativarFaixa = ativarFaixa;
exports.ativarSemana = ativarSemana;
exports.ehMetaAnterior = ehMetaAnterior;
exports.detalhesPdf = detalhesPdf;
exports.construirRodizioPDF = construirRodizioPDF;
exports.metaSemanalHistorico = metaSemanalHistorico;
exports.resultadoTema217 = resultadoTema217;
exports.semanaRevisao216 = semanaRevisao216;
exports.reservarJuris219 = reservarJuris219;
exports.gerarPlano = gerarPlano;
exports.calcularDomino = calcularDomino;
exports.pendenciasLegproc = pendenciasLegproc;
// ============================================================
// Motor do Cronograma Adaptativo — geração DIA A DIA (faixas de horas, rodízio por vagas, semana especial
// dentro do plano, Jurisprudência semanal obrigatória, dominó). PORTE FIEL do modelo enviado pelo usuário
// (modelo HTML de referência): gerarPlano → gerarPlanoCatalogo → gerarPlanoBase(v2), rotina300,
// semanaRevisao216, reservarJuris219, calcularDomino → calcularDomino219Base, construirRodizioPDF.
//
// · Módulo PURO (sem DOM/fetch): roda igual no servidor e no iframe (bundle em public/.../motor28.js → window.Motor28).
// · O modelo usa o estado global `S`; aqui o que ele lê vem em `Contexto30` (feitas, prog, notas, detalhes, hoje…).
// · O motor 2.8.1 (./motor28.ts) permanece SÓ como legado: planos já gravados não são regenerados; o motor antigo
//   só é usado para migrações de planos antigos (cfg.motor !== VERSAO_MOTOR). Plano novo/recalculado usa este.
// · Identificador de motor é técnico/interno (cfg.motor) — nunca exibir ao usuário.
// ============================================================
const L = require("./motor28");
const regras_1 = require("./regras");
const faixas_carga_1 = require("./faixas-carga");
const faixas_carga_2 = require("./faixas-carga");
const restricoes_1 = require("./restricoes");
const rastro_1 = require("./rastro");
const tipos_meta_1 = require("./tipos-meta");
__exportStar(require("./motor28"), exports);
var regras_2 = require("./regras");
Object.defineProperty(exports, "REGRAS_PADRAO", { enumerable: true, get: function () { return regras_2.REGRAS_PADRAO; } });
Object.defineProperty(exports, "resolverRegras", { enumerable: true, get: function () { return regras_2.resolverRegras; } });
Object.defineProperty(exports, "normalizarRegras", { enumerable: true, get: function () { return regras_2.normalizarRegras; } });
Object.defineProperty(exports, "resolverFaixa", { enumerable: true, get: function () { return regras_2.resolverFaixa; } });
Object.defineProperty(exports, "resolverFaixaCarga", { enumerable: true, get: function () { return regras_2.resolverFaixaCarga; } });
Object.defineProperty(exports, "resolverTetoPdf", { enumerable: true, get: function () { return regras_2.resolverTetoPdf; } });
Object.defineProperty(exports, "hashRegras", { enumerable: true, get: function () { return regras_2.hashRegras; } });
exports.VERSAO_MOTOR = '3.2.0'; // 3.1 = regraRotina300 15 (revisão obrigatória, teto de PDFulls, faixas 24h30) · 3.2 = regraRotina300 23 (ref. rev. 23)
/** Primeira versão do motor com a regra da referência rev. 23 (teto 3 até 14h30, reta final, conclusão na mesma semana em ≤3 datas, 2 PDFulls distintos/dia…). */
exports.VERSAO_REGRA23 = '3.2.0';
const partesVersao = (m) => typeof m === 'string' && /^\d+(\.\d+)*$/.test(m) ? m.split('.').map(Number) : null;
/** cfg.motor >= min (comparação numérica por partes). Sem carimbo válido → false (plano legado mantém a regra vigente dele). */
function motorAtingiu(motor, min) {
    const a = partesVersao(motor), b = partesVersao(min);
    if (!a || !b)
        return false;
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
        const x = a[k] || 0, y = b[k] || 0;
        if (x !== y)
            return x > y;
    }
    return true;
}
/** A regra da ref. rev. 23 só vale para planos carimbados com cfg.motor >= 3.2.0. */
const regra23 = (cfg) => motorAtingiu(cfg === null || cfg === void 0 ? void 0 : cfg.motor, exports.VERSAO_REGRA23);
exports.regra23 = regra23;
exports.MAX_SEM = regras_1.REGRAS_PADRAO.horizonte.maxSemanas;
/** semanas especiais aceitas em planos NOVOS; 10/12 só são preservadas quando já existiam (legado). */
exports.REV_OPCOES_NOVAS = regras_1.REGRAS_PADRAO.revisao.opcoesNovas;
exports.REV_PADRAO = regras_1.REGRAS_PADRAO.revisao.padrao;
exports.ESSENCIAIS = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho'];
exports.COMPLEMENTARES = ['Direito Agrário', 'Direito do Consumidor', 'Direito Econômico', 'Direito Empresarial', 'Direito Penal', 'Processo Penal', 'Legislação Penal Especial', 'Direito Previdenciário', 'Direito Previdenciário Público', 'Direito Urbanístico'];
exports.AGU = [['Direito Eleitoral'], ['Direito Internacional', 'Direito Internacional Privado'], ['Legislação de Ensino'], ['Legislação da AGU']];
const { dAdd, dDow, dMon, semDe, semInicio, horasEm, horasDia, minPdf, chaveLei, criarRodizioLP25, revisaoObrigatoria300, cicloRevisao300, capacidadeRevisao300 } = L;
/** Insuficiência de horizonte: o plano não cabe em MAX_SEM semanas. Nada é gravado (sem plano truncado). */
class ErroInsuficiencia extends Error {
    constructor(msg) {
        super(msg);
        this.codigo = 'insuficiencia';
        this.name = 'ErroInsuficiencia';
    }
}
exports.ErroInsuficiencia = ErroInsuficiencia;
// ── tipos/ids ───────────────────────────────────────────────────────────────────────────────────────
// funções puras de id: memoizadas (são chamadas milhões de vezes no dominó) — resultado idêntico ao cálculo direto
const memoId = (f) => { const c = new Map(); return (id) => { let v = c.get(id); if (v === undefined) {
    if (c.size > 60000)
        c.clear();
    v = f(id);
    c.set(id, v);
} return v; }; };
const tipoEstudo = memoId((id) => id.split(':')[0]);
const ehPdf = (t) => t === 'pf' || t === 'pp';
const indiceAula = memoId((id) => { const p = id.split(':'); return +p[/^r[fq]$/.test(p[0]) ? 2 : 1]; });
const familiaMeta = memoId((id) => { const t = tipoEstudo(id); return ehPdf(t) ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t; });
const questoesHistorico = (id) => /^qu:\d+:hist:\d+$/.test(id);
exports.questoesHistorico = questoesHistorico;
/** reforço do diagnóstico OU releitura/PDFlash adaptativos da semana especial (pf|fl:i:revisao:s) — nunca "PDFull/PDFlash regular". */
const reforcoHistorico = (id) => /^(pf|fl):\d+:(?:reforco|revisao):\d+$/.test(id);
exports.reforcoHistorico = reforcoHistorico;
const revisaoAdaptativa = (id) => /^(pf|fl):\d+:revisao:\d+$/.test(id);
exports.revisaoAdaptativa = revisaoAdaptativa;
const ehJuris219 = (id) => id.startsWith('jp:');
exports.ehJuris219 = ehJuris219;
// ── Bloqueio de tipos de material (admin › Cronograma › Regras do cronograma e Disciplinas) ─────────────────────
// Chega por `ctx.params`: `tiposBloqueados` (global do tenant; chaves do motor pf|fl|qu|lp|jp) e `discSemTipo`
// ({ pf: [disciplinas sem PDFull], lp: [disciplinas sem LegProc] }). Precedência: global bloqueado > disciplina desligada > ligado.
// Sem esses campos, nada muda (plano idêntico ao de antes).
exports.TIPOS_BLOQUEAVEIS = ['pf', 'fl', 'qu', 'lp', 'jp'];
function criarBloqueios(p) {
    const r = (p && typeof p === 'object' ? p : {});
    const tipos = new Set((Array.isArray(r.tiposBloqueados) ? r.tiposBloqueados : []).filter((t) => typeof t === 'string' && exports.TIPOS_BLOQUEAVEIS.includes(t)));
    const d = (r.discSemTipo && typeof r.discSemTipo === 'object' ? r.discSemTipo : {});
    const lista = (k) => new Set(Array.isArray(d[k]) ? d[k].filter((x) => typeof x === 'string') : []);
    return { tipos, discPf: lista('pf'), discLp: lista('lp') };
}
const metaRevisao217 = (id, det = {}) => { var _a; return /^r[fq]:/.test(id) || (0, exports.revisaoAdaptativa)(id) || !!((_a = det[id]) === null || _a === void 0 ? void 0 : _a.semanaRevisao); };
exports.metaRevisao217 = metaRevisao217;
/** PDFull regular de uma aula (pf:i) — exclui pf:i:reforco:s e pf:i:revisao:s. */
const pdfRegular = (id) => /^pf:\d+$/.test(id);
exports.pdfRegular = pdfRegular;
const pfBase = (id) => /^p[fp]:\d+(:\d+)?$/.test(id);
const copiar = (x) => JSON.parse(JSON.stringify(x !== null && x !== void 0 ? x : {}));
/** `cada` da semana especial: 4/6/8; 10/12 só se já estavam no plano (legado); senão 8. */
function normalizarCada(cada, legado = true, R = regras_1.REGRAS_PADRAO, fx) {
    const n = Number(cada);
    const f = fx !== null && fx !== void 0 ? fx : { opcoesNovas: null, padrao: null };
    if ((0, faixas_carga_2.opcoesDaFaixa)(f, R).includes(n))
        return n;
    if (legado && R.revisao.opcoesLegado.includes(n))
        return n;
    return (0, faixas_carga_2.padraoDaFaixa)(f, R);
}
/** Faixa da 1ª semana do plano (define as opções/padrão de periodicidade do plano). */
const faixaInicial = (cfg, R) => L.faixaDaSemana(cfg, 0, R);
// ── validação de horas (rotina) ─────────────────────────────────────────────────────────────────────
function validarHoras300(horas) {
    if (horas.some((h) => h > 0 && (h < 2 || !Number.isInteger(h * 2))))
        return 'Selecione pelo menos 2h em cada dia de estudo, em intervalos de 30min.';
    return horas.reduce((t, h) => t + h, 0) < 10 ? 'Selecione pelo menos 10h de estudo por semana.' : '';
}
/** Faixas de horas (10h–14h30 / 15h–24h30 / ≥25h) e dias de leitura/revisão da semana. */
function rotina300(cfg, sem, ancora = cfg.start, R = regras_1.REGRAS_PADRAO) {
    const inicio = semInicio(cfg.start, sem);
    const datas = Array.from({ length: 7 }, (_, k) => dAdd(inicio, k));
    const horas = datas.reduce((t, d) => t + (+(horasEm(cfg, d)[dDow(d)] || 0)), 0);
    const fx = (0, regras_1.resolverFaixaCarga)(horas * 60, R), faixa = (0, faixas_carga_2.classeDaFaixa)(fx);
    // overrides da faixa na seção `rotina` valem sobre a base (não sobre a seção viva, que pode estar em outra semana)
    const Rb = (0, faixas_carga_2.baseDeRegras)(R), RT = fx.overrides.rotina ? { ...Rb.rotina, ...fx.overrides.rotina } : Rb.rotina;
    const ativos = datas.filter((d) => d >= ancora && d >= cfg.start && horasDia(cfg, d) > 0);
    const uteis = ativos.filter((d) => dDow(d) < 5);
    const weekend = ativos.filter((d) => dDow(d) >= 5);
    const soma = (dias) => dias.reduce((t, d) => t + horasDia(cfg, d), 0);
    const maior = Math.max(0, ...weekend.map((d) => horasDia(cfg, d)));
    const mediaUtil = uteis.length ? soma(uteis) / uteis.length : 0;
    const concentrado = weekend.length > 0 && soma(weekend) >= RT.fimSemanaFracao * soma(ativos) && maior >= mediaUtil + RT.fimSemanaDiferencaHoras;
    const fimDeSemana = new Set(concentrado ? weekend.filter((d) => horasDia(cfg, d) >= mediaUtil + RT.fimSemanaDiferencaHoras) : []);
    const pdf = new Set(ativos.filter((d) => dDow(d) < RT.diasPdfAteDow || fimDeSemana.has(d)));
    const revisao = new Set(ativos.filter((d) => RT.diasRevisao.includes(dDow(d))));
    if (!revisao.size && ativos.length)
        revisao.add(ativos[ativos.length - 1]);
    if (!pdf.size) {
        const candidatos = ativos.filter((d) => !revisao.has(d));
        for (const d of candidatos.length ? candidatos : ativos)
            pdf.add(d);
    }
    return { faixa, fx, pdf, revisao, fimDeSemana, ativos };
}
// ── regraRotina300 = 15: teto de PDFulls novos, encaixe inteiro, cota de PDFlash, antecipação ─────────
/** Teto semanal de PDFulls NOVOS (continuações não contam): ≤24h30 → 4 · 25h–35h → 5 · >35h → 6 (horas da rotina vigente). */
function tetoInfo300(cfg, sem, R = regras_1.REGRAS_PADRAO) {
    const inicio = semInicio(cfg.start, sem);
    let horas = 0;
    for (let k = 0; k < 7; k++)
        horas += +(horasEm(cfg, dAdd(inicio, k))[k] || 0);
    // rev. 23: 10h–14h30 → 3 PDFulls novos por semana (linha soRegra23); demais faixas: 4 / 5 / 6 (padrão)
    return (0, regras_1.resolverTetoPdf)(horas * 60, (0, exports.regra23)(cfg), R);
}
function tetoPDF300(cfg, sem, R = regras_1.REGRAS_PADRAO) { return tetoInfo300(cfg, sem, R).teto; }
/** PDFulls que COMEÇAM na semana (1ª parte de cada aula; continuação e reforço/revisão adaptativa não contam). */
function iniciosPDF300(cfg, plano, detalhes, sem) {
    var _a, _b;
    const primeiros = new Map();
    for (const [id, [data]] of Object.entries(plano)) {
        if (!/^pf:\d+$|^pp:\d+:\d+$/.test(id) || (0, exports.metaRevisao217)(id, detalhes) || (0, exports.reforcoHistorico)(((_a = detalhes[id]) === null || _a === void 0 ? void 0 : _a.pai) || id))
            continue;
        const i = indiceAula(id), p = primeiros.get(i);
        if (!p || data < p[0])
            primeiros.set(i, [data, id]);
    }
    let n = 0;
    for (const [data, id] of primeiros.values())
        if (semDe(cfg.start, data) === sem && !((_b = detalhes[id]) === null || _b === void 0 ? void 0 : _b.continuacao))
            n++;
    return n;
}
/** Existe, nesta ou nas 3 semanas seguintes, um dia de leitura com capacidade para a aula inteira? (cache por função de capacidade) */
const cacheDiaInteiro300 = new WeakMap();
function temDiaInteiro300(cfg, desde, minutos, capacidade, retaFinal = false, R = regras_1.REGRAS_PADRAO) {
    let cache = cacheDiaInteiro300.get(capacidade);
    if (!cache) {
        cache = new Map();
        cacheDiaInteiro300.set(capacidade, cache);
    }
    const nova = (0, exports.regra23)(cfg), chave = desde + (retaFinal ? ':final' : '');
    const c = cache.get(chave);
    if (c !== undefined)
        return c >= minutos;
    const atual = semDe(cfg.start, desde);
    let maior = 0;
    // rev. 23: qualquer dia de estudo; na reta final só a própria semana (dias depois de `desde`); fora dela, sem pular semana de revisão.
    for (let sem = atual; sem <= atual + (retaFinal ? 0 : R.divisao.janelaLeituraInteiraSemanas); sem++) {
        if (!retaFinal && L.ehRev(cfg, sem, R))
            continue;
        const rotina = rotina300(cfg, sem, desde, R);
        const dias = nova || rotina.faixa === 3 ? rotina.ativos : [...rotina.pdf];
        for (const d of dias)
            if (!retaFinal || d > desde)
                maior = Math.max(maior, capacidade(d));
    }
    cache.set(chave, maior);
    return maior >= minutos;
}
/** rev. 23: até 2 metas distintas por dia de PDFull/Revisão/Questões (parcelas da mesma leitura contam como uma). `idsDia` = ids já no dia. */
function cabeTipoNoDia300(idsDia, detalhes, id, pai, R) {
    const tipo = familiaMeta(id);
    if (tipo !== 'pf' && tipo !== 'fl' && tipo !== 'qu')
        return true;
    const chave = (k) => { var _a; return tipo === 'pf' ? (((_a = detalhes[k]) === null || _a === void 0 ? void 0 : _a.pai) || (k.startsWith('pp:') ? 'pf:' + indiceAula(k) : k)) : k; };
    const metas = new Set();
    for (const k of idsDia)
        if (familiaMeta(k) === tipo)
            metas.add(chave(k));
    return metas.size < (tipo === 'pf' ? R.limitesDia.pdfDistintos : tipo === 'fl' ? R.limitesDia.revisoes : R.limitesDia.questoes) || (tipo === 'pf' && metas.has(pai || chave(id)));
}
/** Texto do limite diário (rastro). */
const textoLimiteDia = (id, R) => { const t = familiaMeta(id); const [nome, n] = t === 'pf' ? ['PDFulls distintos', R.limitesDia.pdfDistintos] : t === 'fl' ? ['PDFlashes', R.limitesDia.revisoes] : ['metas de questões', R.limitesDia.questoes]; return `${(0, rastro_1.rotuloMeta)(id)} adiado: limite de ${n} ${nome} por dia já atingido.`; };
/** rev. 23: o saldo da leitura cabe hoje + nos melhores dias seguintes da MESMA semana (≤3 datas no total)? */
function cabeSaldoNaSemana300(total, hoje, partes, dias, livre, R) {
    if (partes >= R.divisao.maxDatas)
        return false;
    const BLK = R.constantes.blocoMin;
    const minutos = (v) => Math.max(0, Math.floor(v / BLK) * BLK);
    const seguintes = dias.map((d) => minutos(livre(d))).sort((a, b) => b - a).slice(0, Math.max(0, R.divisao.maxDatas - 1 - partes));
    return minutos(hoje) >= BLK && minutos(hoje) + seguintes.reduce((a, b) => a + b, 0) >= total;
}
/** rev. 23: reta final — fila de leituras vazia, ou (a partir da semana 2) restam ≤2 tetos (≤4 após a semana 4). */
function faseFinal300(cfg, sem, leiturasRestantes, R) {
    return leiturasRestantes === 0 || (sem > R.retaFinal.semanaMinima && leiturasRestantes <= (sem > R.retaFinal.semanaCorteLimiar ? R.retaFinal.limiarTetosApos : R.retaFinal.limiarTetos) * tetoPDF300(cfg, sem, R));
}
/** Retorno (fl/qu) pode ser ANTECIPADO na revisão obrigatória: ≥1 semana (fl) / ≥2 semanas (qu) após a leitura. */
const podeAnteciparRetorno300 = (cfg, leitura, data, tipo, R) => R.adaptacao.antecipaRetornoAtivo && semDe(cfg.start, data) - semDe(cfg.start, leitura) >= (tipo === 'fl' ? R.revisao.antecipaMinSemanas.fl : R.revisao.antecipaMinSemanas.qu);
/** Cota de PDFlash do dia na semana de revisão obrigatória (distribui as pendências pelos dias com capacidade). */
function cotaPDFlash300(dias, livre, pendentes, duracao = regras_1.REGRAS_PADRAO.constantes.cotaPdflashDuracaoMin) {
    const capacidades = dias.map((d) => Math.max(0, Math.floor(livre(d) / duracao)));
    const ativos = capacidades.filter((n) => n > 0).length;
    const depois = capacidades.slice(1).reduce((a, b) => a + b, 0);
    return Math.min(capacidades[0] || 0, Math.max(Math.ceil(pendentes / Math.max(1, ativos)), pendentes - depois));
}
/** Meta de um tipo/disciplina bloqueado pelo admin (global ou por disciplina)? */
function metaBloqueada(E, id) {
    var _a, _b;
    const f = familiaMeta(id), B = E.bloq;
    if (B.tipos.has(f))
        return true;
    if (f === 'pf' && B.discPf.size)
        return B.discPf.has((_a = E.AS[indiceAula(id)]) === null || _a === void 0 ? void 0 : _a[0]);
    if (f === 'lp' && B.discLp.size)
        return B.discLp.has((_b = E.lpMap.get(id)) === null || _b === void 0 ? void 0 : _b.disc);
    return false;
}
/** Tira do plano as metas bloqueadas AINDA NÃO concluídas e SEM dado (concluídas e com tempo/ponto de parada ficam: histórico do aluno). */
function semBloqueadas(E, plano) {
    if (!E.bloq.tipos.size && !E.bloq.discPf.size && !E.bloq.discLp.size)
        return plano;
    return Object.fromEntries(Object.entries(plano).filter(([id]) => comDado(E, id) || !metaBloqueada(E, id)));
}
/** Desliga em `cfg.metas` os tipos bloqueados globalmente (a cópia do cfg já é do motor). */
function aplicarBloqueioCfg(E, cfg) {
    const m = { ...(cfg.metas || {}) };
    for (const t of ['pf', 'fl', 'qu', 'lp'])
        if (E.bloq.tipos.has(t))
            m[t] = false;
    cfg.metas = m;
}
const feito = (E, id) => { var _a; return E.feitas.has(id) || ((_a = E.prog[id]) === null || _a === void 0 ? void 0 : _a.s) === 'done'; };
const hojeLocal = () => L.dISO(new Date());
/** Meta com progresso registrado (tempo ou ponto de parada), concluída ou não. */
const comDado = (E, id) => { var _a, _b; return feito(E, id) || (((_a = E.prog[id]) === null || _a === void 0 ? void 0 : _a.t) || 0) > 0 || !!((_b = E.prog[id]) === null || _b === void 0 ? void 0 : _b.parou); };
function criarEnv(AS, LP, ctx, P) {
    var _a;
    const lista = (LP || []).filter((x) => x && x.id);
    return {
        AS, LP: lista, lpMap: new Map(lista.map((x) => [x.id, x])), lpPos: new Map(lista.map((x, k) => [x.id, k])),
        ordem: ctx.ordem && ctx.ordem.length ? ctx.ordem.filter((i) => AS[i]) : AS.map((_, i) => i),
        feitas: new Set(ctx.feitas || []), prog: ctx.prog || {}, notas: (ctx.notas || {}),
        det: ctx.detalhes || {}, planoAtual: ctx.planoAtual || {}, hoje: ctx.hoje || hojeLocal(), complementar: !!ctx.complementarLegproc, P, bloq: criarBloqueios(ctx.params), ...criarRegrasEnv((0, regras_1.resolverRegras)(ctx)), rastro: (_a = ctx.rastro) !== null && _a !== void 0 ? _a : null,
    };
}
/** Com overrides por faixa, o motor usa uma cópia viva das regras e alterna as seções conforme a faixa da semana corrente. */
function criarRegrasEnv(R) {
    return (0, faixas_carga_2.temOverrides)(R.faixas) ? { R: (0, faixas_carga_2.criarRegrasVivas)(R), Rbase: R } : { R };
}
/** Ativa em `E.R` os overrides da faixa (sem efeito quando nenhuma faixa tem override). */
function ativarFaixa(E, fx) {
    if (!E.Rbase || E.fxAtiva === fx)
        return;
    (0, faixas_carga_2.aplicarFaixaEmRegras)(E.R, E.Rbase, fx);
    E.fxAtiva = fx !== null && fx !== void 0 ? fx : null;
}
/** Ativa os overrides da faixa da semana `sem` (pela rotina vigente de `cfg`). */
function ativarSemana(E, cfg, sem) { if (E.Rbase)
    ativarFaixa(E, L.faixaDaSemana(cfg, sem, E.Rbase)); }
function indicesAnteriores(E, cfg) { return L.indicesAnteriores(cfg, E.AS, E.ordem); }
function ehMetaAnterior(E, id, cfg) {
    if ((0, exports.metaRevisao217)(id, E.det))
        return false;
    if ((0, exports.questoesHistorico)(id) || (0, exports.reforcoHistorico)(id))
        return false;
    if (!/^(pf|pp|fl|qu):/.test(id))
        return false;
    return indicesAnteriores(E, cfg).has(indiceAula(id));
}
// ── helpers de PDF ──────────────────────────────────────────────────────────────────────────────────
function paginasFeitas216(E, i, cfg, fixos) {
    var _a, _b, _c, _d, _e, _f;
    let p = Math.max(0, Number((_a = cfg.paginasLidas) === null || _a === void 0 ? void 0 : _a[i]) || 0);
    for (const [id, r] of Object.entries(E.prog)) {
        if (ehPdf(tipoEstudo(id)) && indiceAula(id) === i && !(0, exports.reforcoHistorico)(((_b = E.det[id]) === null || _b === void 0 ? void 0 : _b.pai) || id) && ((_c = r.parou) === null || _c === void 0 ? void 0 : _c.v) !== '' && Number.isInteger(Number((_d = r.parou) === null || _d === void 0 ? void 0 : _d.v)) && ((_e = r.parou) === null || _e === void 0 ? void 0 : _e.v) != null)
            p = Math.max(p, Number(r.parou.v));
    }
    for (const [id] of Object.entries(fixos)) {
        if (id.startsWith('pp:' + i + ':')) {
            const md = E.det[id] || detalhesPdf(E, id, E.planoAtual, E.det);
            p = Math.max(p, md.paginaFim || 0);
        }
    }
    return Math.min(((_f = E.AS[i]) === null || _f === void 0 ? void 0 : _f[3]) || 60, p);
}
function detalhesPdf(E, id, plano, detalhes) {
    var _a, _b;
    if (((_a = detalhes[id]) === null || _a === void 0 ? void 0 : _a.paginaInicio) != null)
        return { ...detalhes[id] };
    const i = indiceAula(id), total = ((_b = E.AS[i]) === null || _b === void 0 ? void 0 : _b[3]) || 60;
    const blocos = Object.entries(plano).filter(([k]) => pfBase(k) && indiceAula(k) === i)
        .sort((a, b) => a[1][0].localeCompare(b[1][0]) || (Number(tipoEstudo(a[0]) === 'pf') - Number(tipoEstudo(b[0]) === 'pf')) || a[0].localeCompare(b[0], 'en', { numeric: true }));
    const minutos = blocos.reduce((s, [, [, h]]) => s + Math.round(h * 60), 0);
    let antes = 0;
    for (const [k, [, h]] of blocos) {
        const ini = minutos ? Math.floor(total * antes / minutos) + 1 : 1;
        antes += Math.round(h * 60);
        if (k === id)
            return { paginaInicio: ini, paginaFim: minutos ? Math.floor(total * antes / minutos) : total, totalPaginas: total };
    }
    return { paginaInicio: 1, paginaFim: total, totalPaginas: total };
}
/** 2º PDFull no dia só na faixa >24h, no dia corrente e após um PDFull regular CONCLUÍDO hoje. */
function limitePDF27(E, cfg, d, plano) {
    if (rotina300(cfg, semDe(cfg.start, d), cfg.start, E.R).faixa !== 3 || d !== E.hoje)
        return E.R.limitesDia.pdfNovosBase;
    return Object.entries(plano || {}).some(([id, [dia]]) => { var _a, _b; return tipoEstudo(id) === 'pf' && dia === d && ((_a = E.prog[id]) === null || _a === void 0 ? void 0 : _a.s) === 'done' && ((_b = E.prog[id]) === null || _b === void 0 ? void 0 : _b.em) === d && !ehMetaAnterior(E, id, cfg); }) ? E.R.limitesDia.pdfNovosAposConclusao : E.R.limitesDia.pdfNovosBase;
}
/** Aulas cujo PDFull COMEÇA no dia (continuações não contam). */
function novosPDFDia27(plano, cfg, d, detalhes = {}) {
    var _a, _b, _c;
    const primeiros = new Map(), restos = new Set();
    for (const [id, [dia]] of Object.entries(plano)) {
        if (!/^p[fp]:/.test(id))
            continue;
        const i = +id.split(':')[1];
        if (!primeiros.has(i) || dia < primeiros.get(i))
            primeiros.set(i, dia);
        if (((_a = detalhes[id]) === null || _a === void 0 ? void 0 : _a.continuacao) || (((_b = cfg.paginasLidas) === null || _b === void 0 ? void 0 : _b[i]) || 0) > 0 || (((_c = cfg.partesLidas) === null || _c === void 0 ? void 0 : _c[i]) || 0) > 0)
            restos.add(i);
    }
    return new Set([...primeiros].filter(([i, dia]) => dia === d && !restos.has(i)).map(([i]) => i));
}
// ── rodízio de PDFull por vagas ─────────────────────────────────────────────────────────────────────
function construirRodizioPDF(E, cfg, fixos) {
    var _a, _b;
    const escolhidas = new Set(cfg.discs.filter((d) => !E.bloq.discPf.has(d))), anteriores = indicesAnteriores(E, cfg), filas = new Map(), totais = new Map();
    const ordem = [...new Set(E.ordem)];
    for (const i of ordem) {
        const a = E.AS[i];
        if (!a || !escolhidas.has(a[0]))
            continue;
        totais.set(a[0], (totais.get(a[0]) || 0) + 1);
        if (!anteriores.has(i) && !fixos['pf:' + i]) {
            if (!filas.has(a[0]))
                filas.set(a[0], []);
            filas.get(a[0]).push(i);
        }
    }
    const essenciais = exports.ESSENCIAIS.filter((d) => escolhidas.has(d));
    const espera = [...exports.COMPLEMENTARES, ...exports.AGU.flat()].filter((d) => { var _a; return escolhidas.has(d) && ((_a = filas.get(d)) === null || _a === void 0 ? void 0 : _a.length); });
    for (const d of escolhidas)
        if (!exports.ESSENCIAIS.includes(d) && !espera.includes(d) && ((_a = filas.get(d)) === null || _a === void 0 ? void 0 : _a.length))
            espera.push(d);
    const vagas = essenciais.length ? essenciais.map((d) => ({ disc: d, pai: null })) : espera.splice(0).map((d) => ({ disc: d, pai: null }));
    const fila = [], dependencias = {}, trocas = [], rodadas = [], indicesRodada = {};
    const pendentes = (d) => { var _a; return (d && ((_a = filas.get(d)) === null || _a === void 0 ? void 0 : _a.length)) || 0; };
    const progresso = (d) => 1 - pendentes(d) / ((d && totais.get(d)) || 1);
    const preencher = (v) => {
        if (pendentes(v.disc))
            return;
        const anterior = v.disc, nova = espera.shift();
        v.disc = nova || null;
        if (nova)
            trocas.push({ de: anterior, para: nova, apos: v.pai });
    };
    vagas.forEach(preencher);
    let rodada = 0;
    while (vagas.some((v) => v.disc)) {
        rodada++;
        const itens = [], ativas = vagas.filter((v) => v.disc), maximo = Math.max(...ativas.map((v) => progresso(v.disc)));
        // Primeiro, todas as vagas têm uma oportunidade. Só depois entram os bônus.
        const atrasadas = new Set(ativas.filter((v) => maximo - progresso(v.disc) >= E.R.rodizio.atrasoLimiar).map((v) => v.disc));
        const pegar = (v) => {
            var _a;
            const disc = v.disc, i = (_a = filas.get(disc)) === null || _a === void 0 ? void 0 : _a.shift();
            if (i == null)
                return;
            fila.push(i);
            itens.push({ i, disc });
            indicesRodada[i] = rodada;
            if (v.pai != null)
                dependencias[i] = v.pai;
        };
        for (const v of ativas)
            pegar(v);
        for (const v of ativas)
            if (atrasadas.has(v.disc) && pendentes(v.disc))
                pegar(v);
        for (const v of ativas)
            if (!pendentes(v.disc)) {
                const ultimo = (_b = itens.filter((x) => x.disc === v.disc).slice(-1)[0]) === null || _b === void 0 ? void 0 : _b.i;
                if (ultimo != null)
                    v.pai = ultimo;
                preencher(v);
            }
        rodadas.push(itens);
    }
    return { fila, dependencias, trocas, rodadas, indicesRodada };
}
// ── diagnóstico histórico ───────────────────────────────────────────────────────────────────────────
function metaSemanalHistorico(cfg, sem, R = regras_1.REGRAS_PADRAO) {
    const ini = semInicio(cfg.start, sem), minutos = Array.from({ length: 7 }, (_, k) => horasDia(cfg, dAdd(ini, k)) * 60).reduce((a, b) => a + b, 0);
    return minutos >= R.historico.corteAltaMin ? R.historico.metaSemanalAlta : R.historico.metaSemanalBase;
}
function criarFilaDiagnostico(E, cfg, fixos) {
    const anteriores = indicesAnteriores(E, cfg), feitos = new Set(Object.keys(fixos).filter(exports.questoesHistorico).map(indiceAula));
    const fila = E.ordem.filter((i) => anteriores.has(i) && cfg.discs.includes(E.AS[i][0]) && !feitos.has(i));
    return { tem: () => fila.length > 0, proxima: () => fila[0], avancar: () => { fila.shift(); } };
}
/** resultado do diagnóstico concluído: ok ≥70%, flash 50–<70%, pdf <50% (total e acertos inteiros válidos). */
function dadosResultadoHistorico(E, id) {
    const n = E.notas[id];
    if (!n)
        return null;
    const res = Number(n.res);
    const cert = n.cert != null && n.cert !== '' ? Number(n.cert) : (n.err != null && n.res != null ? res - Number(n.err) : NaN);
    if (n.res == null || n.res === '' || !Number.isInteger(res) || res <= 0 || !Number.isInteger(cert) || cert < 0 || cert > res)
        return null;
    return { total: res, acertos: cert, pct: cert / res * 100, nivel: cert / res >= E.R.desempenho.historicoOkMin / 100 ? 'ok' : cert / res >= E.R.desempenho.historicoFlashMin / 100 ? 'flash' : 'pdf' };
}
/** reforço do diagnóstico: <50% PDFull · 50–<70% PDFlash · ≥70% encerra; a partir da próxima semana civil da conclusão. */
function registrarReforcos216(E, cfg) {
    var _a, _b, _c, _d;
    cfg.reforcosHistorico || (cfg.reforcosHistorico = {});
    cfg.remanejadas || (cfg.remanejadas = {});
    if (!E.R.adaptacao.reforcoAtivo) {
        (_a = E.rastro) === null || _a === void 0 ? void 0 : _a.reg('adaptacao:reforco', 'adaptacao_off', 'Reforço do diagnóstico desligado: nenhuma meta :reforco: é criada por desempenho.', E.hoje);
        return;
    }
    const rem = cfg.remanejadas;
    for (const id of [...E.feitas, ...Object.keys(E.prog).filter((k) => { var _a; return ((_a = E.prog[k]) === null || _a === void 0 ? void 0 : _a.s) === 'done'; })].filter((v, k, a) => a.indexOf(v) === k).filter(exports.questoesHistorico)) {
        const r = dadosResultadoHistorico(E, id);
        if (!r)
            continue;
        const i = indiceAula(id);
        if (!cfg.discs.includes((_b = E.AS[i]) === null || _b === void 0 ? void 0 : _b[0]))
            continue;
        const antigo = cfg.reforcosHistorico[id];
        if (r.nivel === 'ok') {
            cfg.reforcosHistorico[id] = { nivel: 'ok', pct: r.pct };
            if ((antigo === null || antigo === void 0 ? void 0 : antigo.id) && !feito(E, antigo.id))
                delete rem[antigo.id];
            continue;
        }
        // disciplinas sem PDFlash (AGU) reforçam por PDFull (a plataforma não gera flash para elas)
        const t = r.nivel === 'pdf' || E.P.semFlash.has(E.AS[i][0]) ? 'pf' : 'fl', alvo = t + ':' + i + ':reforco:' + id.split(':').slice(-1)[0];
        // Ao retirar o histórico, a leitura regular satisfaz a mesma obrigação de PDFull.
        if (t === 'pf' && !indicesAnteriores(E, cfg).has(i)) {
            if (antigo === null || antigo === void 0 ? void 0 : antigo.id)
                delete rem[antigo.id];
            cfg.reforcosHistorico[id] = { nivel: r.nivel, pct: r.pct, id: 'pf:' + i, integrado: true };
            continue;
        }
        const feitoEm = ((_c = E.prog[id]) === null || _c === void 0 ? void 0 : _c.em) || ((_d = E.planoAtual[id]) === null || _d === void 0 ? void 0 : _d[0]) || E.hoje, inicio = dAdd(dMon(feitoEm), 7), desde = L.proximoEstudo(cfg, inicio);
        const pags = E.AS[i][3] || 60;
        const md = { reforco: true, origem: id, pai: alvo, geracao: 'reforco:' + id, ...(t === 'pf' ? { paginaInicio: 1, paginaFim: pags, totalPaginas: pags } : {}) };
        cfg.reforcosHistorico[id] = { nivel: r.nivel, pct: r.pct, id: alvo, desde, pendente: !desde };
        if (desde && !feito(E, alvo))
            rem[alvo] = { desde, minutos: t === 'pf' ? minPdf(E.AS[i][3], cfg.vel, E.P.velPadrao) : E.P.dur.fl, detalhe: md, geracao: md.geracao };
    }
}
// ── semana especial (dentro do plano) ───────────────────────────────────────────────────────────────
function alternarDisciplinas300(metas, disciplina) {
    const fila = [...metas], alternadas = [];
    let anterior = null;
    while (fila.length) {
        const proxima = fila.findIndex((m) => disciplina(m) !== anterior);
        const [meta] = fila.splice(Math.max(0, proxima), 1);
        alternadas.push(meta);
        anterior = disciplina(meta);
    }
    return alternadas;
}
function acertoTema(E, i) {
    let res = 0, err = 0;
    for (const [id, n] of Object.entries(E.notas)) {
        if (id === 'qu:' + i || id.startsWith('qu:' + i + ':hist:') || (id.startsWith('rq:') && +id.split(':')[2] === i)) {
            res += +(n.res || 0);
            err += +(n.err || 0);
        }
    }
    return res ? { res, err, pct: Math.max(0, (res - err) / res * 100) } : null;
}
function estudadas216(E, cfg, plano, ate, projetar = false) {
    var _a, _b;
    const anteriores = indicesAnteriores(E, cfg), base = {};
    for (const [id, v] of Object.entries(plano))
        if ((0, exports.pdfRegular)(id) && v[0] < ate && cfg.discs.includes((_a = E.AS[indiceAula(id)]) === null || _a === void 0 ? void 0 : _a[0]) && (projetar || feito(E, id)))
            base[id] = v;
    for (const i of anteriores)
        if (cfg.discs.includes((_b = E.AS[i]) === null || _b === void 0 ? void 0 : _b[0]))
            base['pf:' + i] = [dAdd(cfg.start, -1), 0];
    return base;
}
/** ranking dos temas estudados (grau de dificuldade + acerto < 60%; já revisados perdem prioridade). */
function rankingRevisaoBase(E, plano, ateData, jaRevisados) {
    var _a, _b;
    const cand = [];
    for (const [id, [d]] of Object.entries(plano)) {
        if (!(0, exports.pdfRegular)(id) || d >= ateData)
            continue;
        const i = +id.split(':')[1];
        const grau = (_b = (_a = E.notas['pf:' + i]) === null || _a === void 0 ? void 0 : _a.grau) !== null && _b !== void 0 ? _b : null;
        const ac = acertoTema(E, i);
        const baixo = !!(ac && ac.pct < E.R.desempenho.acertoFracoPct);
        const prioritario = (grau != null && grau > 0) || baixo;
        let pontos = (grau || 0) + (baixo && ac ? E.R.desempenho.rankingBonusFraco + (E.R.desempenho.acertoFracoPct - ac.pct) / E.R.desempenho.acertoFracoPct * E.R.desempenho.rankingPesoDistancia : 0);
        if (jaRevisados.has(i))
            pontos -= E.R.desempenho.rankingPenalidadeRevisado;
        cand.push({ i, d, grau, acerto: ac ? ac.pct : null, prioritario, pontos });
    }
    return cand.sort((a, b) => (Number(b.prioritario) - Number(a.prioritario)) || (b.pontos - a.pontos) || (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i));
}
/** Último resultado válido do tema concluído ANTES de `ate` (segunda da semana especial). <50 pf · 50–70 INCLUSIVE fl · >70 ok. */
function resultadoTema217(E, i, ate) {
    const data = (id) => { var _a, _b; return ((_a = E.prog[id]) === null || _a === void 0 ? void 0 : _a.em) || ((_b = E.planoAtual[id]) === null || _b === void 0 ? void 0 : _b[0]) || ''; };
    const registros = Object.entries(E.notas).filter(([id, n]) => ['qu', 'rq'].includes(tipoEstudo(id)) && indiceAula(id) === i && feito(E, id) && data(id) < ate && Number(n.res) > 0)
        .sort((a, b) => data(b[0]).localeCompare(data(a[0])) || ((b[1].resultadoAtualizadoEm || 0) - (a[1].resultadoAtualizadoEm || 0)));
    for (const [id, n] of registros) {
        if (n.cert == null && n.err == null)
            continue;
        const total = Number(n.res), acertos = n.cert != null ? Number(n.cert) : total - Number(n.err);
        if (Number.isInteger(total) && Number.isInteger(acertos) && acertos >= 0 && acertos <= total) {
            const pct = 100 * acertos / total;
            return { origem: id, total, acertos, pct, tipo: pct < E.R.desempenho.especialPdfAbaixo ? 'pf' : pct <= E.R.desempenho.especialFlashAte ? 'fl' : 'ok' };
        }
    }
    return null;
}
function semanaRevisao216(E, cfg, plano, sem, projetar = false) {
    var _a;
    if (!E.Rbase)
        return semanaRevisao216Interno(E, cfg, plano, sem, projetar);
    const ant = (_a = E.fxAtiva) !== null && _a !== void 0 ? _a : null;
    ativarSemana(E, cfg, sem); // overrides da faixa da semana valem só durante esta chamada
    try {
        return semanaRevisao216Interno(E, cfg, plano, sem, projetar);
    }
    finally {
        ativarFaixa(E, ant);
    }
}
function semanaRevisao216Interno(E, cfg, plano, sem, projetar = false) {
    var _a;
    if (!E.R.adaptacao.semanaEspecialAtiva) {
        (_a = E.rastro) === null || _a === void 0 ? void 0 : _a.reg('semana:' + sem, 'adaptacao_off', 'Semana especial por desempenho desligada: sem metas de revisão adaptativa nesta semana.', semInicio(cfg.start, sem));
        return { plano: {}, detalhes: {} };
    }
    // Rotina ≤24h30: a semana de revisão é a OBRIGATÓRIA (PDFlashes e questões regulares pendentes, alocados no fluxo diário) — sem metas especiais.
    if (L.motorRevObrigatoria(cfg) && revisaoObrigatoria300(cfg, sem, E.R))
        return { plano: {}, detalhes: {} };
    const g = semanaRevisao216Base(E, cfg, plano, sem, projetar);
    if (!E.bloq.tipos.size && !E.bloq.discPf.size)
        return g;
    const p = {}, d = {};
    for (const [id, v] of Object.entries(g.plano))
        if (!metaBloqueada(E, id)) {
            p[id] = v;
            if (g.detalhes[id])
                d[id] = g.detalhes[id];
        }
    return { plano: p, detalhes: d };
}
function semanaRevisao216Base(E, cfg, plano, sem, projetar = false) {
    var _a, _b, _c, _d;
    const AS = E.AS, P = E.P, R = E.R, BLK = R.constantes.blocoMin, cada = Number((_a = cfg.revisao) === null || _a === void 0 ? void 0 : _a.cada) || R.revisao.padrao;
    const ini = semInicio(cfg.start, sem), base = estudadas216(E, cfg, plano, ini, projetar), ja = new Set();
    const ateResultado = ini;
    const estudadas = rankingRevisaoBase(E, base, ini, ja).map((x) => ({ i: x.i, resultado: resultadoTema217(E, x.i, ateResultado) }))
        .filter((x) => { var _a; return cfg.discs.includes((_a = AS[x.i]) === null || _a === void 0 ? void 0 : _a[0]) && x.resultado && x.resultado.tipo !== 'ok'; });
    const externas = [];
    const disciplinas = exports.ESSENCIAIS.filter((d) => !cfg.discs.includes(d)), porDisc = disciplinas.map((d) => E.ordem.filter((i) => AS[i] && AS[i][0] === d));
    for (let k = 0;; k++) {
        let existe = false;
        for (const ids of porDisc)
            if (ids[k] != null) {
                externas.push(ids[k]);
                existe = true;
            }
        if (!existe)
            break;
    }
    if (externas.length) {
        const giro = ((Math.floor(sem / cada) - 1) * R.revisao.giroExternas) % externas.length;
        externas.push(...externas.splice(0, giro));
    }
    const minimo = !projetar && ini <= E.hoje && dAdd(ini, 6) >= E.hoje ? E.hoje : cfg.start;
    const dias = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).filter((d) => d >= cfg.start && d >= minimo && horasDia(cfg, d) > 0), livre = {};
    for (const d of dias)
        livre[d] = Math.max(0, horasDia(cfg, d) * 60 - Object.values(plano).filter((v) => v[0] === d).reduce((s, v) => s + v[1] * 60, 0));
    const out = {}, detalhes = {}, qs = Object.fromEntries(dias.map((d) => [d, Object.keys(plano).filter((id) => plano[id][0] === d && familiaMeta(id) === 'qu').length]));
    const anterioresDaSemana = Object.keys(plano).filter((id) => semDe(cfg.start, plano[id][0]) === sem && (0, exports.metaRevisao217)(id, E.det));
    const objetivosAnteriores = new Map();
    let ordem = 0, cursor = dias[0];
    for (const id of anterioresDaSemana) {
        const md = E.det[id];
        // colisão rf:s:i: no legado era o flashcard de um tema JÁ ESTUDADO (disciplina selecionada); aqui é essencial EXTERNA (não selecionada)
        objetivosAnteriores.set((md === null || md === void 0 ? void 0 : md.pai) || id, (_b = md === null || md === void 0 ? void 0 : md.essencialNaoSelecionada) !== null && _b !== void 0 ? _b : (id.startsWith('rf:') && !cfg.discs.includes((_c = AS[indiceAula(id)]) === null || _c === void 0 ? void 0 : _c[0])));
        ordem = Math.max(ordem, ((_d = md === null || md === void 0 ? void 0 : md.ordemAlternancia) !== null && _d !== void 0 ? _d : -1) + 1);
    }
    const contadores = {};
    for (const id of [...Object.keys(plano), ...Object.keys(E.prog)])
        if (id.startsWith('pp:'))
            contadores[indiceAula(id)] = Math.max(contadores[indiceAula(id)] || 0, +id.split(':')[2]);
    const colocar = (id, d, m, md) => { out[id] = [d, m / 60]; detalhes[id] = { ...md, semanaRevisao: true, semanaOrigemRevisao: sem, ordemAlternancia: ordem++ }; cursor = d; livre[d] -= m; if (familiaMeta(id) === 'qu')
        qs[d]++; };
    // rev. 23: no máx. 2 PDFlashes (e 2 PDFulls / 2 questões) por data na semana especial
    const R23 = (0, exports.regra23)(cfg);
    const metasNoDia = (d) => [...Object.entries(plano), ...Object.entries(out)].filter(([, [data]]) => data === d);
    const cabeFlash = (d) => !R23 || metasNoDia(d).filter(([id]) => familiaMeta(id) === 'fl').length < R.limitesDia.revisoes;
    const definir = (x) => {
        var _a;
        const tipo = ((_a = x.resultado) === null || _a === void 0 ? void 0 : _a.tipo) || 'rq', id = tipo === 'rq' ? 'rq:' + sem + ':' + x.i : tipo + ':' + x.i + ':revisao:' + sem;
        const min = tipo === 'pf' ? minPdf(AS[x.i][3], cfg.vel, P.velPadrao) : tipo === 'fl' ? P.durRevisao.rf : P.durRevisao.rq;
        return { ...x, tipo, id, min };
    };
    const colocarEstudada = (x) => {
        var _a, _b;
        if (x.tipo !== 'pf') {
            const d = dias.find((d) => d >= cursor && livre[d] >= x.min && (x.tipo !== 'rq' || (R23 ? qs[d] < R.limitesDia.questoes : !qs[d])) && (x.tipo !== 'fl' || cabeFlash(d)));
            if (!d)
                return false;
            colocar(x.id, d, x.min, { essencialNaoSelecionada: false, material: x.tipo === 'rq' ? 'Questões' : 'PDFlash', reforco: x.tipo !== 'rq', pai: x.id, origem: (_a = x.resultado) === null || _a === void 0 ? void 0 : _a.origem, percentualOrigem: (_b = x.resultado) === null || _b === void 0 ? void 0 : _b.pct });
            return true;
        }
        const melhores = dias.filter((d) => d >= cursor && livre[d] >= BLK && (!R23 || metasNoDia(d).filter(([id]) => ehPdf(tipoEstudo(id))).length < R.limitesDia.pdfDistintos)).sort((a, b) => livre[b] - livre[a] || a.localeCompare(b));
        const blocos = [];
        let soma = 0;
        for (const d of melhores.slice(0, R.divisao.maxDatas)) {
            blocos.push(d);
            soma += Math.floor(livre[d] / BLK) * BLK;
            if (soma >= x.min)
                break;
        }
        if (soma < x.min)
            return false;
        blocos.sort();
        const total = AS[x.i][3] || 60;
        let restante = x.min, pagina = 1;
        for (const d of blocos) {
            const m = Math.min(restante, Math.floor(livre[d] / BLK) * BLK);
            if (!m)
                continue;
            const final = m === restante, id = final ? x.id : 'pp:' + x.i + ':' + (contadores[x.i] = (contadores[x.i] || 0) + 1), pags = final ? total - pagina + 1 : Math.max(1, Math.floor((total - pagina + 1) * m / restante));
            colocar(id, d, m, { essencialNaoSelecionada: false, material: 'PDFull', reforco: true, pai: x.id, origem: x.resultado.origem, percentualOrigem: x.resultado.pct, paginaInicio: pagina, paginaFim: pagina + pags - 1, totalPaginas: total, continuacao: pagina > 1 });
            pagina += pags;
            restante -= m;
            if (!restante)
                break;
        }
        return true;
    };
    const fila = alternarDisciplinas300(estudadas.map(definir).filter((x) => !plano[x.id]), (x) => AS[x.i][0]);
    const extras = alternarDisciplinas300(externas.filter((i) => !plano['rf:' + sem + ':' + i]), (i) => AS[i][0]);
    if (estudadas.length && externas.length && objetivosAnteriores.size) {
        let saldo = [...objetivosAnteriores.values()].reduce((n, externa) => n + (externa ? 1 : -1), 0);
        while (saldo > 0 && fila.length) {
            if (!colocarEstudada(fila[0]))
                return { plano: out, detalhes };
            fila.shift();
            saldo--;
        }
        while (saldo < 0 && extras.length) {
            const d = dias.find((d) => d >= cursor && livre[d] >= P.durRevisao.rf && cabeFlash(d));
            if (!d)
                return { plano: out, detalhes };
            colocar('rf:' + sem + ':' + extras.shift(), d, P.durRevisao.rf, { essencialNaoSelecionada: true, material: 'PDFlash' });
            saldo++;
        }
    }
    if (estudadas.length && externas.length && (!fila.length || !extras.length))
        return { plano: out, detalhes };
    if (fila.length && extras.length) {
        while (fila.length && extras.length) {
            const foto = { ...livre }, qfoto = { ...qs }, oAntes = { ...out }, mdAntes = { ...detalhes }, nAntes = ordem, cAntes = { ...contadores }, cursorAntes = cursor, i = extras[0], d = dias.find((d) => d >= cursor && livre[d] >= P.durRevisao.rf && cabeFlash(d));
            if (!d)
                break;
            colocar('rf:' + sem + ':' + i, d, P.durRevisao.rf, { essencialNaoSelecionada: true, material: 'PDFlash' });
            if (!colocarEstudada(fila[0])) {
                Object.assign(livre, foto);
                Object.assign(qs, qfoto);
                for (const k of Object.keys(out))
                    delete out[k];
                Object.assign(out, oAntes);
                for (const k of Object.keys(detalhes))
                    delete detalhes[k];
                Object.assign(detalhes, mdAntes);
                ordem = nAntes;
                cursor = cursorAntes;
                Object.assign(contadores, cAntes);
                break;
            }
            extras.shift();
            fila.shift();
        }
    }
    else if (fila.length) {
        for (const x of fila)
            if (!colocarEstudada(x))
                break;
    }
    else
        for (const i of extras) {
            const d = dias.find((d) => livre[d] >= P.durRevisao.rf && cabeFlash(d));
            if (!d)
                break;
            colocar('rf:' + sem + ':' + i, d, P.durRevisao.rf, { essencialNaoSelecionada: true, material: 'PDFlash' });
        }
    return { plano: out, detalhes };
}
// ── Jurisprudência semanal ──────────────────────────────────────────────────────────────────────────
function reservarJuris219(E, cfg, sem, desde, fonte = {}, opcoes = {}) {
    var _a;
    if (!E.Rbase)
        return reservarJuris219Interno(E, cfg, sem, desde, fonte, opcoes);
    const ant = (_a = E.fxAtiva) !== null && _a !== void 0 ? _a : null;
    ativarSemana(E, cfg, sem);
    try {
        return reservarJuris219Interno(E, cfg, sem, desde, fonte, opcoes);
    }
    finally {
        ativarFaixa(E, ant);
    }
}
function reservarJuris219Interno(E, cfg, sem, desde, fonte = {}, opcoes = {}) {
    var _a, _b, _c;
    if (E.bloq.tipos.has('jp'))
        return null; // Jurisprudência bloqueada pelo admin: nenhuma meta semanal nova
    const ini = semInicio(cfg.start, sem), fim = dAdd(ini, 6), ids = Object.keys(fonte).filter((id) => (0, exports.ehJuris219)(id) && fonte[id][0] >= ini && fonte[id][0] <= fim);
    const concluida = ids.find((id) => feito(E, id));
    const horasSemana = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).reduce((s, d) => s + (d >= cfg.start ? horasDia(cfg, d) : 0), 0);
    // Limiar: semana com ≥14h30 de disponibilidade efetiva (recesso e datas pontuais já contam em horasDia).
    // Só reserva se o aluno MARCOU Jurisprudência em "Metas no cronograma" (cfg.metas.jp === true; padrão desmarcado — ref. 3.0).
    const optInJp = E.R.juris.exigeOptIn ? ((_a = cfg.metas) === null || _a === void 0 ? void 0 : _a.jp) === true : ((_b = cfg.metas) === null || _b === void 0 ? void 0 : _b.jp) !== false;
    if ((!optInJp || horasSemana < E.R.juris.minSemanalMin / 60) && !concluida) {
        if (opcoes.movida && (0, exports.ehJuris219)(opcoes.movida.id) && semDe(cfg.start, opcoes.movida.dia) === sem)
            throw Error(`Ative Jurisprudência e tenha pelo menos ${(0, faixas_carga_1.textoHoras)(E.R.juris.minSemanalMin)} de estudo na semana.`);
        return null;
    }
    const movida = opcoes.movida && (0, exports.ehJuris219)(opcoes.movida.id) && semDe(cfg.start, opcoes.movida.dia) === sem ? opcoes.movida : null;
    if (concluida) {
        if (movida && movida.id !== concluida)
            throw Error('Esta semana já tem uma meta de Jurisprudência concluída. Escolha outra semana.');
        return { id: concluida, valor: fonte[concluida], concluida: true };
    }
    const remanejadas = (cfg.remanejadas || {});
    const rem = Object.entries(remanejadas).find(([id, r]) => (0, exports.ehJuris219)(id) && semDe(cfg.start, r.desde) === sem);
    const origemSaiu = Object.entries(remanejadas).some(([id, r]) => (0, exports.ehJuris219)(id) && +id.split(':')[1] === sem && semDe(cfg.start, r.desde) !== sem);
    if (origemSaiu && !ids.length && !movida && !rem)
        return null;
    if (movida && ids.some((id) => { var _a, _b; return id !== movida.id && ((((_a = E.prog[id]) === null || _a === void 0 ? void 0 : _a.t) || 0) > 0 || ((_b = E.prog[id]) === null || _b === void 0 ? void 0 : _b.parou)); }))
        throw Error('Já existe uma meta de Jurisprudência iniciada nesta semana. Conclua ou reorganize essa meta antes de trazer outra.');
    const id = (movida === null || movida === void 0 ? void 0 : movida.id) || (rem === null || rem === void 0 ? void 0 : rem[0]) || ids.sort((a, b) => { var _a, _b; return (((_a = E.prog[b]) === null || _a === void 0 ? void 0 : _a.t) || 0) - (((_b = E.prog[a]) === null || _b === void 0 ? void 0 : _b.t) || 0); })[0] || 'jp:' + sem;
    const minutos = Math.min(E.P.juris.min, Math.max(1, ((_c = remanejadas[id]) === null || _c === void 0 ? void 0 : _c.minutos) || E.P.juris.min));
    const ocupada = (d) => Object.entries(fonte).filter(([k, v]) => !(0, exports.ehJuris219)(k) && feito(E, k) && v[0] === d).reduce((s, [, v]) => s + v[1] * 60, 0);
    const datas = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).filter((d) => d >= cfg.start && d >= desde);
    if (!datas.some((d) => horasDia(cfg, d) > 0))
        return null;
    const dias = datas.filter((d) => horasDia(cfg, d) * 60 - ocupada(d) >= minutos);
    const forcar = (movida === null || movida === void 0 ? void 0 : movida.dia) || (rem === null || rem === void 0 ? void 0 : rem[1].desde);
    if (forcar) {
        if (!dias.includes(forcar))
            throw Error('Não há tempo disponível para a meta de Jurisprudência na data escolhida.');
        return { id, valor: [forcar, minutos / 60] };
    }
    const ordenar = (a, b) => (horasDia(cfg, b) * 60 - ocupada(b)) - (horasDia(cfg, a) * 60 - ocupada(a)) || a.localeCompare(b);
    const preferidos = dias.filter((d) => E.R.juris.diasPreferidos.includes(dDow(d))).sort(ordenar), d = preferidos[0] || dias.sort(ordenar)[0];
    if (!d)
        throw Error('A semana ' + sem + ' precisa de um dia com 1h disponível para Jurisprudência. Ajuste a rotina ou as horas dessa semana.');
    return { id, valor: [d, minutos / 60] };
}
function gerarPlanoBase30(E, cfg, fixos, ancora) {
    var _a, _b, _c, _d, _e, _f, _g;
    const AS = E.AS, P = E.P, R = E.R, BLK = R.constantes.blocoMin, DUR = P.dur, SEM_FLASH = P.semFlash, MAX = P.maxSemanas;
    const A = ancora && ancora > cfg.start ? ancora : cfg.start;
    const plano = {}, detalhes = {}, carga = {}, ativas = new Set(cfg.discs);
    const metas = (cfg.metas || {});
    let rotina, ultimoTipoRevisao = null, retaFinal = false;
    const R23 = (0, exports.regra23)(cfg); // regra da ref. rev. 23 só vale para planos com cfg.motor >= 3.2.0
    const livre = (d) => Math.max(0, Math.round(horasDia(cfg, d) * 60) - (carga[d] || 0));
    const idsPorDia = new Map(); // índice dia → ids (equivale a varrer Object.keys(plano))
    const idsDoDia = (d) => idsPorDia.get(d) || [];
    const por = (d, id, m, md) => {
        const ant = plano[id];
        if (ant && ant[0] !== d) {
            const l = idsPorDia.get(ant[0]);
            if (l)
                l.splice(l.indexOf(id), 1);
        }
        if (!ant || ant[0] !== d) {
            const l = idsPorDia.get(d);
            if (l)
                l.push(id);
            else
                idsPorDia.set(d, [id]);
        }
        plano[id] = [d, m / 60];
        carga[d] = (carga[d] || 0) + m;
        if (md)
            detalhes[id] = md;
    };
    const especial = (id) => /^r[fq]:/.test(id), feita = (id) => feito(E, id);
    for (const [id, v] of Object.entries(fixos)) {
        if (!feita(id) && especial(id))
            continue;
        por(v[0], id, Math.round(v[1] * 60), E.det[id]);
    }
    const rodizioPDF = construirRodizioPDF(E, cfg, fixos);
    const fila = rodizioPDF.fila.filter((i) => !plano['pf:' + i]);
    const devidos = [], incluidos = new Set(Object.keys(plano));
    const adicionar = (id, due, t, minutos) => { if (!incluidos.has(id)) {
        devidos.push({ id, due, t, minutos });
        incluidos.add(id);
    } };
    const proxSem = (d, n) => L.proxSemConteudo(cfg, d, n, R);
    const registrar = (i, d) => {
        if (metas.fl && !SEM_FLASH.has(AS[i][0]))
            adicionar('fl:' + i, proxSem(d, P.offsetRevisao), 'fl', DUR.fl);
        if (metas.qu)
            adicionar('qu:' + i, proxSem(d, P.offsetQuestoes), 'qu', DUR.qu);
    };
    for (const [id, v] of Object.entries(fixos))
        if (id.startsWith('pf:') && !(0, exports.reforcoHistorico)(id) && ativas.has((_a = AS[indiceAula(id)]) === null || _a === void 0 ? void 0 : _a[0]))
            registrar(indiceAula(id), v[0]);
    if (!metas.pf)
        for (const i of fila)
            registrar(i, cfg.start);
    // PDFull desligado numa disciplina pelo admin: sem leitura, mas revisão/questões dela seguem (mesmo critério de quem desmarca PDFull)
    else if (E.bloq.discPf.size)
        for (const i of E.ordem)
            if (ativas.has((_b = AS[i]) === null || _b === void 0 ? void 0 : _b[0]) && E.bloq.discPf.has(AS[i][0]) && !plano['pf:' + i])
                registrar(i, cfg.start);
    const hist = criarFilaDiagnostico(E, cfg, fixos), histPorSem = {};
    const ignorar = new Set(cfg.lpIgnorar || []);
    const lp = metas.lp ? E.LP.filter((x) => ativas.has(x.disc) && !plano[x.id] && !ignorar.has(x.id) && !metaBloqueada(E, x.id)) : [];
    const metasLP = E.lpMap;
    const rodizio = criarRodizioLP25(cfg.discs, null, P.lpJanelaRodizio);
    const iniciadas = new Set(Object.keys(fixos).filter((id) => id.startsWith('lp:')).map((id) => chaveLei(metasLP.get(id))));
    let fechou = false, leisFinais = new Set(), qi = 0;
    let curso = null;
    let fim = Math.max(1, semDe(cfg.start, A)), semRevPreparada = 0, herancas = 0, semAtual216 = 0;
    const candidatos = (t) => devidos.filter((x) => x.t === t).sort((a, b) => a.due.localeCompare(b.due) || indiceAula(a.id) - indiceAula(b.id));
    // restrições declarativas por personagem (regras.restricoes; vazio = sem efeito)
    const chavePai = (k) => { var _a; return ((_a = detalhes[k]) === null || _a === void 0 ? void 0 : _a.pai) || (k.startsWith('pp:') ? 'pf:' + indiceAula(k) : k); };
    const restrito = (id, d) => {
        if (!R.restricoes.length)
            return false;
        const c = {
            idsDoDia, dataDe: (k) => { var _a; return (_a = plano[k]) === null || _a === void 0 ? void 0 : _a[0]; }, faixa: rotina ? rotina.faixa : 3, pai: chavePai,
            haOutrosPendentes: (fam) => (fam !== 'pf' && !!metas.pf && (qi < fila.length || !!curso)) || devidos.some((x) => (0, tipos_meta_1.familiaDoTipo)(x.t) !== fam && x.t !== 'lp') || (fam !== 'fl' && fam !== 'qu' && hist.tem()),
        };
        if (!E.rastro)
            return (0, restricoes_1.restricaoBloqueia)(R.restricoes, id, d, c);
        const r = (0, restricoes_1.restricaoQueBloqueia)(R.restricoes, id, d, c);
        if (r)
            E.rastro.reg(id, 'restricao', () => `${(0, rastro_1.rotuloMeta)(id)} barrado por restrição: ${r.rotulo || (0, restricoes_1.descreverRestricao)(r)}`, d);
        return r !== null;
    };
    const elegivel = (x, d) => {
        var _a, _b, _c;
        if (restrito(x.id, d))
            return false;
        if (R23) {
            if (!cabeTipoNoDia300(idsDoDia(d), detalhes, x.id, undefined, R)) {
                (_a = E.rastro) === null || _a === void 0 ? void 0 : _a.reg(x.id, 'limite_dia', () => textoLimiteDia(x.id, R), d);
                return false;
            }
            const semana = semDe(cfg.start, d);
            if (x.t === 'qu' && !retaFinal && revisaoObrigatoria300(cfg, semana, R) && !L.ehRev(cfg, semana, R)) {
                (_b = E.rastro) === null || _b === void 0 ? void 0 : _b.reg(x.id, 'revisao_obrigatoria', () => `${(0, rastro_1.rotuloMeta)(x.id)} adiado: questões só na semana de revisão obrigatória (semana ${semana}).`, d);
                return false;
            }
        }
        // Revisão obrigatória: o retorno pode ser ANTECIPADO (≥1 semana do PDFull p/ revisão, ≥2 p/ questões).
        const leitura = (_c = plano['pf:' + indiceAula(x.id)]) === null || _c === void 0 ? void 0 : _c[0];
        const adiantar = !(0, exports.questoesHistorico)(x.id) && L.motorRevObrigatoria(cfg) && revisaoObrigatoria300(cfg, semDe(cfg.start, d), R) && !!leitura && podeAnteciparRetorno300(cfg, leitura, d, x.t, R);
        if (x.due > d && !adiantar && !(R23 && R.adaptacao.antecipaRetornoAtivo && retaFinal && leitura && leitura <= d && !(0, exports.questoesHistorico)(x.id)))
            return false;
        if (x.t === 'qu' && !(0, exports.questoesHistorico)(x.id) && metas.fl && !SEM_FLASH.has(AS[indiceAula(x.id)][0])) {
            const fl = 'fl:' + indiceAula(x.id);
            if (!plano[fl] || plano[fl][0] > d)
                return false;
        }
        return true;
    };
    const alocar = (x, d) => { por(d, x.id, x.minutos); devidos.splice(devidos.indexOf(x), 1); };
    const minutosLeitura = (i) => minPdf(Math.max(1, (AS[i][3] || 60) - paginasFeitas216(E, i, cfg, fixos)), cfg.vel, P.velPadrao);
    const selecionarPDF = (d) => {
        var _a;
        if (curso || qi >= fila.length)
            return;
        const rodada = rodizioPDF.indicesRodada[fila[qi]], disciplinas = new Set(), cands = [];
        // rev. 23: testa a rodada atual E a seguinte; prefere a atual e, entre as que cabem inteiras, a maior duração.
        for (let k = qi; k < fila.length && (R23 ? rodizioPDF.indicesRodada[fila[k]] <= rodada + 1 : rodizioPDF.indicesRodada[fila[k]] === rodada); k++) {
            const i = fila[k], disc = AS[i][0], pai = rodizioPDF.dependencias[i];
            if (disciplinas.has(disc))
                continue;
            disciplinas.add(disc);
            if (pai == null || ((_a = plano['pf:' + pai]) === null || _a === void 0 ? void 0 : _a[0]) <= d)
                cands.push({ k, rodada: rodizioPDF.indicesRodada[i], minutos: minutosLeitura(i) });
        }
        const inteiro = cands.filter((x) => x.minutos <= livre(d)).sort((a, b) => (R23 ? a.rodada - b.rodada : 0) || b.minutos - a.minutos)[0];
        if (inteiro) {
            const [i] = fila.splice(inteiro.k, 1);
            fila.splice(qi, 0, i);
        }
    };
    // capacidade do dia descontada da reserva de Jurisprudência da semana (registrada ou projetada)
    const reservasInteiro = new Map();
    const capacidadeInteiro = (d) => {
        var _a, _b;
        const semana = semDe(cfg.start, d);
        if (!reservasInteiro.has(semana)) {
            const registrada = (_a = Object.entries(plano).find(([id, [data]]) => (0, exports.ehJuris219)(id) && semDe(cfg.start, data) === semana)) === null || _a === void 0 ? void 0 : _a[1];
            const projetada = metas.jp === true ? (_b = reservarJuris219(E, cfg, semana, A, plano)) === null || _b === void 0 ? void 0 : _b.valor : null;
            reservasInteiro.set(semana, registrada || projetada);
        }
        const juris = reservasInteiro.get(semana);
        return Math.round(horasDia(cfg, d) * 60) - ((juris === null || juris === void 0 ? void 0 : juris[0]) === d ? Math.round(juris[1] * 60) : 0);
    };
    // rev. 23: sobra ≥60min na reta final / semana de revisão obrigatória pode iniciar um trecho em vez de esperar o dia inteiro
    const repartirParaAvancar = (d, m) => R23 && m >= R.divisao.sobraMinAvancarMin && (retaFinal || revisaoObrigatoria300(cfg, semDe(cfg.start, d), R));
    const ler = (d, m, encaixeExtra = false) => {
        var _a, _b, _c, _d, _e, _f, _g;
        if (!metas.pf)
            return false;
        const i = (_a = curso === null || curso === void 0 ? void 0 : curso.i) !== null && _a !== void 0 ? _a : fila[qi];
        if (i == null || m < BLK)
            return false;
        if (restrito('pf:' + i, d))
            return false;
        if (R23 && !cabeTipoNoDia300(idsDoDia(d), detalhes, 'pf:' + i, undefined, R)) {
            (_b = E.rastro) === null || _b === void 0 ? void 0 : _b.reg('pf:' + i, 'limite_dia', () => textoLimiteDia('pf:' + i, R), d);
            return false;
        }
        const restantesNovos = novosPDFDia27(plano, cfg, d, detalhes);
        const continuacao = paginasFeitas216(E, i, cfg, fixos) > 0 || (!!(curso === null || curso === void 0 ? void 0 : curso.ultima) && curso.ultima < d);
        if (!(R23 && (encaixeExtra || retaFinal)) && !continuacao && !restantesNovos.has(i) && restantesNovos.size >= limitePDF27(E, cfg, d, plano)) {
            (_c = E.rastro) === null || _c === void 0 ? void 0 : _c.reg('pf:' + i, 'limite_novos_dia', () => `${(0, rastro_1.rotuloMeta)('pf:' + i)} adiado: limite de ${limitePDF27(E, cfg, d, plano)} PDFull(s) novo(s) por dia atingido.`, d);
            return false;
        }
        const partes = (_d = curso === null || curso === void 0 ? void 0 : curso.partes) !== null && _d !== void 0 ? _d : new Set(Object.keys(fixos).filter((id) => id.startsWith('pp:' + i + ':') && feita(id)).map((id) => fixos[id][0])).size;
        if (R23) {
            // Conclusão na mesma semana, em até 3 datas: o saldo precisa caber hoje + nos melhores dias restantes da semana.
            const restantePDF = (_e = curso === null || curso === void 0 ? void 0 : curso.resta) !== null && _e !== void 0 ? _e : minutosLeitura(i);
            if (m < restantePDF && !cabeSaldoNaSemana300(restantePDF, m, partes, rotina.ativos.filter((data) => data > d && cabeTipoNoDia300(idsDoDia(data), detalhes, 'pf:' + i, undefined, R)), livre, R))
                return false;
            // Prefere a leitura inteira (salvo sobra ≥60min na reta final / revisão obrigatória).
            if (!continuacao && !curso && m < minutosLeitura(i) && !repartirParaAvancar(d, m) && temDiaInteiro300(cfg, d, minutosLeitura(i), capacidadeInteiro, retaFinal, R))
                return false;
        }
        else {
            // Parcelamento: no máximo 3 datas — a partir da 3ª só entra o que fecha a leitura.
            if (partes >= R.divisao.maxDatas - 1 && m < ((_f = curso === null || curso === void 0 ? void 0 : curso.resta) !== null && _f !== void 0 ? _f : minutosLeitura(i)))
                return false;
            // Prefere a leitura inteira: se há dia (nesta ou nas 3 semanas seguintes) que comporta a aula toda, não divide.
            if (!continuacao && !curso && m < minutosLeitura(i) && temDiaInteiro300(cfg, d, minutosLeitura(i), capacidadeInteiro, false, R))
                return false;
        }
        // Teto semanal de PDFulls novos (3/4/5/6 pela faixa de horas); continuações pertencem à aula já iniciada.
        const semanaLeitura = semDe(cfg.start, d);
        if (!retaFinal && !(R23 && encaixeExtra && semanaLeitura > R.retaFinal.semanaEncaixeExtra) && !curso && !continuacao && iniciosPDF300(cfg, plano, detalhes, semanaLeitura) >= tetoPDF300(cfg, semanaLeitura, R)) {
            (_g = E.rastro) === null || _g === void 0 ? void 0 : _g.reg('pf:' + i, 'teto_semana', () => `${(0, rastro_1.rotuloMeta)('pf:' + i)} adiado: teto de ${tetoPDF300(cfg, semanaLeitura, R)} PDFull(s) novo(s) por semana (faixa ${rotina.faixa}) atingido na semana ${semanaLeitura}.`, d);
            return false;
        }
        // Antes do ciclo de revisão obrigatória: não abrir PDFull novo se o custo (PDFlash+questões) estoura a capacidade da semana de revisão.
        const ciclo = cicloRevisao300(cfg, d, R);
        if (!retaFinal && !curso && ciclo && L.motorRevObrigatoria(cfg)) {
            const custo = (metas.fl && !SEM_FLASH.has(AS[i][0]) ? DUR.fl : 0) + (metas.qu ? DUR.qu : 0);
            const inicioCiclo = semInicio(cfg.start, ciclo);
            const comprometidos = devidos.filter((x) => x.due <= inicioCiclo).reduce((t, x) => t + x.minutos, 0);
            const capacidade = capacidadeRevisao300(cfg, ciclo, R);
            if (R23) {
                // até 24h30 a capacidade de retornos também é medida em VAGAS DIÁRIAS de questões (2 por dia ativo da semana de revisão)
                const vagasQuestoes = rotina300(cfg, ciclo, cfg.start, R).ativos.length * R.limitesDia.questoes;
                const questoesPendentes = devidos.filter((x) => x.t === 'qu' && x.due <= inicioCiclo).length;
                if (metas.qu && vagasQuestoes > 0 && questoesPendentes >= vagasQuestoes)
                    return false;
                if (encaixeExtra && iniciosPDF300(cfg, plano, detalhes, semanaLeitura) >= tetoPDF300(cfg, semanaLeitura, R)) {
                    // PDFull extra acima do teto: preserva parte da capacidade de retornos para as semanas comuns restantes do ciclo
                    const futuras = Math.max(0, ciclo - semanaLeitura - 1);
                    const margem = metas.qu ? Math.max(0, vagasQuestoes - questoesPendentes - 1) : Infinity;
                    const reservaPorSemana = Math.min(tetoPDF300(cfg, semanaLeitura, R), metas.qu ? Math.floor(vagasQuestoes / R.constantes.reservaCicloDivisor) : tetoPDF300(cfg, semanaLeitura, R));
                    const reserva = futuras * reservaPorSemana;
                    if (margem < reserva || comprometidos + custo + reserva * custo > capacidade)
                        return false;
                }
            }
            if (custo > 0 && capacidade >= custo && comprometidos + custo > capacidade)
                return false;
        }
        if (!curso) {
            qi++;
            const total = AS[i][3] || 60, p = paginasFeitas216(E, i, cfg, fixos);
            curso = { i, total, p, resta: minPdf(Math.max(1, total - p), cfg.vel, P.velPadrao), k: Math.max(0, ...Object.keys(E.prog).filter((k) => k.startsWith('pp:' + i + ':')).map((k) => +k.split(':')[2])), ultima: null };
        }
        const cs = curso;
        m = Math.min(cs.resta, Math.floor(m / BLK) * BLK);
        if (m < BLK)
            return false;
        const final = m === cs.resta, id = final ? 'pf:' + i : 'pp:' + i + ':' + (++cs.k);
        const lidas = final ? cs.total - cs.p : Math.max(1, Math.min(cs.total - cs.p - 1, Math.floor((cs.total - cs.p) * m / cs.resta)));
        por(d, id, m, { paginaInicio: cs.p + 1, paginaFim: cs.p + lidas, totalPaginas: cs.total, continuacao: !!continuacao, pai: 'pf:' + i });
        cs.p += lidas;
        cs.resta -= m;
        cs.ultima = d;
        cs.partes = partes + 1;
        cs.semana = semDe(cfg.start, d);
        if (final) {
            registrar(i, d);
            curso = null;
        }
        return true;
    };
    const blocoLP = (d, extra = false, limite = R.legproc.mesmaLei) => {
        if (!metas.lp)
            return;
        const ids = Object.keys(plano).filter((id) => id.startsWith('lp:') && plano[id][0] === d), chaves = new Set(ids.map((id) => chaveLei(metasLP.get(id))));
        if (ids.length >= R.legproc.metasDiaMax || (!extra && ids.length >= R.legproc.metasDiaBase))
            return;
        const primeiras = new Map();
        for (const x of lp)
            if (!primeiras.has(x.disc))
                primeiras.set(x.disc, chaveLei(x));
        // 1º bloco: continua a lei do dia (se houver); 2º bloco (extra): outra lei.
        const permitidas = lp.filter((x) => primeiras.get(x.disc) === chaveLei(x) && (!fechou || leisFinais.has(chaveLei(x))) && (extra ? !chaves.has(chaveLei(x)) : !chaves.size || chaves.has(chaveLei(x))));
        const ordem = rodizio.ordenar(permitidas.map((x) => x.disc));
        const candidatas = ordem.map((disc) => permitidas.find((x) => x.disc === disc)).filter(Boolean);
        // Com 1h livre para o 2º bloco, prefere uma lei que ainda tenha duas metas consecutivas.
        const par = extra && livre(d) >= 60 && ids.length <= 2 ? candidatas.find((x) => permitidas.filter((y) => chaveLei(y) === chaveLei(x)).length >= 2) : null;
        const primeiro = par || candidatas[0];
        if (!primeiro)
            return;
        const lei = chaveLei(primeiro);
        let n = ids.filter((id) => chaveLei(metasLP.get(id)) === lei).length;
        let totalDia = ids.length;
        while (n < limite && totalDia < (extra ? R.legproc.metasDiaMax : R.legproc.metasDiaBase) && livre(d) >= DUR.lp) {
            const m = lp.find((x) => chaveLei(x) === lei);
            if (!m || restrito(m.id, d))
                break;
            por(d, m.id, DUR.lp);
            iniciadas.add(lei);
            lp.splice(lp.indexOf(m), 1);
            n++;
            totalDia++;
        }
        rodizio.avancar(primeiro.disc);
    };
    let diaAtual = A;
    const temAcademico = () => (metas.pf && (qi < fila.length || curso)) || devidos.length > 0 || hist.tem() || Object.keys(fixos).some((id) => !feita(id) && !id.startsWith('lp:') && !(0, exports.ehJuris219)(id) && fixos[id][0] > diaAtual);
    const fechar = () => { fechou = true; leisFinais = new Set(lp.map(chaveLei).filter((lei) => E.complementar || iniciadas.has(lei))); };
    const horizonte = MAX * 7;
    for (let k = 0, d = A; k < horizonte; k++, d = dAdd(d, 1)) {
        diaAtual = d;
        const sem = semDe(cfg.start, d);
        ativarSemana(E, cfg, sem); // overrides por faixa: a faixa da semana corrente vale em todo o dia
        if (R23) {
            // rev. 23: um PDFull só começa se couber na semana (≤3 datas); se ficou aberto ao virar a semana, a geração falha (nada é gravado).
            if ((curso === null || curso === void 0 ? void 0 : curso.semana) != null && curso.semana !== sem)
                throw Error('Não foi possível concluir o PDFull na semana em que ele começou.');
            retaFinal = retaFinal || faseFinal300(cfg, sem, fila.length - qi + (curso ? 1 : 0), R);
        }
        if (sem !== semAtual216) {
            semAtual216 = sem;
            rotina = rotina300(cfg, sem, A, R);
            histPorSem[sem] = Object.keys(plano).filter((id) => (0, exports.questoesHistorico)(id) && semDe(cfg.start, plano[id][0]) === sem).length;
        }
        if (!temAcademico() && !fechou)
            fechar();
        if (fechou && !lp.some((x) => leisFinais.has(chaveLei(x))))
            break;
        if (!Object.keys(plano).some((id) => (0, exports.ehJuris219)(id) && semDe(cfg.start, plano[id][0]) === sem)) {
            const reservaJ = reservarJuris219(E, cfg, sem, A, plano);
            if (reservaJ)
                por(reservaJ.valor[0], reservaJ.id, Math.round(reservaJ.valor[1] * 60), { jurisprudencia: true });
        }
        if (!livre(d))
            continue;
        if (R23 && curso)
            ler(d, livre(d)); // continuação da leitura aberta tem prioridade nos próximos dias disponíveis
        const rev = L.ehRev(cfg, sem, R);
        if (rev && !fechou) {
            if (semRevPreparada !== sem) {
                const g = semanaRevisao216(E, cfg, plano, sem, semInicio(cfg.start, sem) > E.hoje);
                for (const [id, v] of Object.entries(g.plano))
                    if (v[0] >= A)
                        por(v[0], id, Math.round(v[1] * 60), g.detalhes[id]);
                semRevPreparada = sem;
            }
            // Mantém pendências regulares na sobra, sem abrir PDFull novo durante a revisão.
        }
        else if (!fechou && hist.tem() && (histPorSem[sem] || 0) < metaSemanalHistorico(cfg, sem, R)) {
            const i = hist.proxima();
            adicionar('qu:' + i + ':hist:' + sem, d, 'qu', DUR.qu);
            hist.avancar();
            histPorSem[sem]++;
        }
        if (!retaFinal && rotina.faixa < 3 && !rev) {
            const eDiaPDF = rotina.pdf.has(d);
            const eDiaRevisao = rotina.revisao.has(d);
            const aquecimento = sem <= (metas.qu ? R.rotina.aquecimentoComQuestoes : metas.fl ? R.rotina.aquecimentoSoRevisao : 0);
            const questoes = () => candidatos('qu').filter((x) => elegivel(x, d));
            const revisoes = () => candidatos('fl').filter((x) => elegivel(x, d));
            let fezQuestoes = Object.keys(plano).some((id) => familiaMeta(id) === 'qu' && plano[id][0] === d);
            const distribuirRevisao = () => {
                while (livre(d) >= BLK) {
                    const fl = revisoes().find((x) => x.minutos <= livre(d));
                    const qu = !fezQuestoes && questoes().find((x) => x.minutos <= livre(d));
                    const meta = ultimoTipoRevisao === 'fl' ? qu || fl : fl || qu;
                    if (!meta)
                        break;
                    alocar(meta, d);
                    ultimoTipoRevisao = meta.t;
                    if (meta.t === 'qu')
                        fezQuestoes = true;
                }
            };
            const temLeitura = !fechou && metas.pf && (curso || qi < fila.length);
            if (temLeitura && (R23 || eDiaPDF || (aquecimento && eDiaRevisao && !questoes().length && !revisoes().length))) {
                selecionarPDF(d);
                const i = (_c = curso === null || curso === void 0 ? void 0 : curso.i) !== null && _c !== void 0 ? _c : fila[qi];
                const restante = (_d = curso === null || curso === void 0 ? void 0 : curso.resta) !== null && _d !== void 0 ? _d : minPdf(Math.max(1, (AS[i][3] || 60) - paginasFeitas216(E, i, cfg, fixos)), cfg.vel, P.velPadrao);
                // rev. 23: qualquer dia de estudo recebe PDFull; "outro dia completo" considera todos os dias ativos da semana
                const outroDiaCompleto = !curso && (R23 ? rotina.ativos : [...rotina.pdf]).some((data) => data > d && livre(data) >= restante);
                if (!outroDiaCompleto || livre(d) >= restante || repartirParaAvancar(d, livre(d)))
                    ler(d, livre(d));
            }
            if (!temAcademico() && !fechou)
                fechar();
            distribuirRevisao();
            if (rotina.faixa === 2 && eDiaPDF && !fezQuestoes && livre(d) >= BLK) {
                const qu = questoes()[0];
                if (qu) {
                    alocar(qu, d);
                    ultimoTipoRevisao = 'qu';
                }
            }
            if (R23 && !fechou && metas.pf && !curso && qi < fila.length && livre(d) >= BLK) {
                // PDFull adicional na sobra (antes do LegProc); após a semana 4 pode ultrapassar o teto semanal inicial
                selecionarPDF(d);
                if (minutosLeitura(fila[qi]) <= livre(d) || (sem > R.retaFinal.semanaEncaixeExtra && repartirParaAvancar(d, livre(d))))
                    ler(d, livre(d), true);
            }
            blocoLP(d);
            blocoLP(d, true);
            if (carga[d])
                fim = Math.max(fim, sem);
            continue;
        }
        // Semana de revisão OBRIGATÓRIA (rotina ≤24h30): só PDFlashes (com cota diária) e questões pendentes; LegProc na sobra.
        if (!retaFinal && rev && revisaoObrigatoria300(cfg, sem, R)) {
            const diasRestantes = rotina.ativos.filter((data) => data >= d);
            const pendentes = candidatos('fl').filter((x) => elegivel(x, d)).length;
            const cota = cotaPDFlash300(diasRestantes, livre, pendentes, R.constantes.cotaPdflashDuracaoMin);
            let revisoesHoje = 0, questoesHoje = 0;
            // rev. 23: cota diária também para questões (distribuídas pelos dias) e alternância PDFlash ↔ questões
            const fimSemana = rotina.ativos[rotina.ativos.length - 1];
            const cotaQuestoes = R23 ? cotaPDFlash300(diasRestantes, (data) => livre(data) - (data === d ? R.constantes.cotaPdflashDuracaoMin * cota : 0), candidatos('qu').filter((x) => x.due <= fimSemana).length, 30) : Infinity;
            let anterior = ultimoTipoRevisao;
            while (livre(d) >= BLK) {
                const fl = revisoesHoje < cota && candidatos('fl').find((x) => elegivel(x, d) && x.minutos <= livre(d));
                const qu = (!R23 || questoesHoje < cotaQuestoes) && candidatos('qu').find((x) => elegivel(x, d) && x.minutos <= livre(d));
                const proxima = R23 && anterior === 'fl' ? qu || fl : fl || qu;
                if (!proxima)
                    break;
                alocar(proxima, d);
                if (proxima.t === 'fl')
                    revisoesHoje++;
                else
                    questoesHoje++;
                if (R23)
                    anterior = ultimoTipoRevisao = proxima.t;
            }
            blocoLP(d);
            blocoLP(d, true);
            if (carga[d])
                fim = Math.max(fim, sem);
            continue;
        }
        if (!fechou && !rev && curso && curso.resta <= livre(d))
            ler(d, livre(d));
        if (rotina.faixa === 3 && !fechou && !rev && metas.pf && !curso && qi < fila.length) {
            // Faixa ≥25h: lê a aula inteira hoje se os retornos (revisão/questões) da semana ainda couberem nos demais dias.
            selecionarPDF(d);
            const restante = minutosLeitura(fila[qi]);
            const depois = rotina.ativos.filter((data) => data > d);
            const fimSemana = rotina.ativos[rotina.ativos.length - 1];
            const retornos = devidos.filter((x) => x.due <= fimSemana);
            const questoesRet = retornos.filter((x) => x.t === 'qu').length;
            const sobraHoje = livre(d) - restante;
            const qpd = R23 && tetoInfo300(cfg, sem, R).equilibra ? R.equilibrio.questoesDia : R.constantes.questoesBaseDia; // rev. 23: faixa 25h–35h comporta 2 questões por dia
            const vagasQuestoes = R23
                ? depois.reduce((n, data) => n + Math.min(qpd, Math.floor(livre(data) / BLK)), 0) + Math.min(qpd, Math.floor(sobraHoje / BLK))
                : depois.filter((data) => livre(data) >= BLK).length + (sobraHoje >= BLK ? 1 : 0);
            if (sobraHoje >= 0 && retornos.reduce((t, x) => t + x.minutos, 0) <= sobraHoje + depois.reduce((t, data) => t + livre(data), 0) &&
                questoesRet <= vagasQuestoes)
                ler(d, restante);
        }
        const idsQu = Object.keys(plano).filter((id) => familiaMeta(id) === 'qu' && plano[id][0] === d);
        // rev. 23: faixa 25h–35h equilibra retornos (≤2 revisões e ≤2 questões por dia, pela cota dos dias restantes); reta final libera questões
        const equilibrar = R23 && tetoInfo300(cfg, sem, R).equilibra;
        const diasParaRetorno = rotina.ativos.filter((data) => data >= d);
        const ultData = diasParaRetorno[diasParaRetorno.length - 1];
        const limiteRetorno = (tipo, duracao) => Math.min(R.equilibrio.retornosDiaMax, Math.max(1, cotaPDFlash300(diasParaRetorno, livre, candidatos(tipo).filter((x) => x.due <= ultData).length, duracao)));
        const limQu = equilibrar ? limiteRetorno('qu', 30) : retaFinal ? Infinity : R.constantes.questoesBaseDia + herancas;
        const limFl = equilibrar ? limiteRetorno('fl', 60) : Infinity;
        let revisoesDia = idsDoDia(d).filter((id) => familiaMeta(id) === 'fl').length;
        // O primeiro PDFull tem precedência; protege os compromissos vencidos quando há tempo para ambos.
        for (const x of candidatos('fl'))
            if (revisoesDia < limFl && elegivel(x, d) && livre(d) >= x.minutos) {
                alocar(x, d);
                revisoesDia++;
            }
        let feitasQu = idsQu.length, usouHeranca = 0;
        for (const x of candidatos('qu'))
            if (elegivel(x, d) && feitasQu < limQu && livre(d) >= x.minutos) {
                alocar(x, d);
                feitasQu++;
                if (feitasQu > 1)
                    usouHeranca++;
            }
        const temRetornoPendente = !retaFinal && equilibrar && devidos.some((x) => elegivel(x, d));
        if (!fechou && !rev && metas.pf && (curso || (!temRetornoPendente && qi < fila.length))) {
            selecionarPDF(d);
            const restante = (_e = curso === null || curso === void 0 ? void 0 : curso.resta) !== null && _e !== void 0 ? _e : minutosLeitura(fila[qi]);
            const inteiroDepois = !curso && rotina.ativos.some((data) => data > d && livre(data) >= restante && (livre(d) < 60 || rotina.fimDeSemana.has(data)));
            if (!inteiroDepois || livre(d) >= restante)
                ler(d, livre(d));
        }
        herancas = Math.max(0, herancas - usouHeranca);
        // Só cria herança se havia uma meta elegível e a capacidade realmente impediu o encaixe diário.
        if (feitasQu === 0 && candidatos('qu').some((x) => elegivel(x, d)) && livre(d) < BLK)
            herancas++;
        if (!temAcademico() && !fechou)
            fechar();
        if (!fechou && !rev && (rotina.faixa === 3 || retaFinal) && !temRetornoPendente && livre(d) >= BLK) {
            const i = (_f = curso === null || curso === void 0 ? void 0 : curso.i) !== null && _f !== void 0 ? _f : fila[qi], restante = i == null ? Infinity : ((_g = curso === null || curso === void 0 ? void 0 : curso.resta) !== null && _g !== void 0 ? _g : minutosLeitura(i));
            if (restante <= livre(d))
                ler(d, livre(d));
        }
        if (retaFinal) {
            // rev. 23 — reta final: usa todos os dias; PDFlash/questões entram no mesmo dia da leitura e PDFulls restantes ocupam a sobra
            while (livre(d) >= BLK) {
                const fl = revisoesDia < limFl && candidatos('fl').find((x) => elegivel(x, d) && x.minutos <= livre(d));
                const qu = feitasQu < limQu && candidatos('qu').find((x) => elegivel(x, d) && x.minutos <= livre(d));
                if (fl) {
                    alocar(fl, d);
                    revisoesDia++;
                    continue;
                }
                if (qu) {
                    alocar(qu, d);
                    feitasQu++;
                    continue;
                }
                if (!metas.pf || (!curso && qi >= fila.length))
                    break;
                selecionarPDF(d);
                if (!ler(d, livre(d)))
                    break;
            }
        }
        if (R23 && !retaFinal && !rev && sem > R.retaFinal.semanaEncaixeExtra && metas.pf && !curso && qi < fila.length && livre(d) >= BLK) {
            // após a semana 4: PDFull inteiro na sobra pode ultrapassar o teto semanal inicial (se houver capacidade p/ os retornos do ciclo)
            selecionarPDF(d);
            if (minutosLeitura(fila[qi]) <= livre(d))
                ler(d, livre(d), true);
        }
        blocoLP(d, false);
        blocoLP(d, true);
        if (carga[d])
            fim = Math.max(fim, sem);
    }
    const residuo = temAcademico() || (fechou && lp.some((x) => leisFinais.has(chaveLei(x))));
    if (residuo)
        throw new ErroInsuficiencia('O plano ultrapassa ' + MAX + ' semanas com a disponibilidade atual. Nenhuma alteração foi aplicada. Aumente as horas ou reduza as matérias; ainda há metas sem data.');
    return { plano, detalhes, fim, legprocRestantes: lp.map((x) => x.id) };
}
// ── dominó ──────────────────────────────────────────────────────────────────────────────────────────
/** Limite diário de LegProc do modelo 3.0 (a ÚLTIMA definição do HTML vence): até 4 metas, no máx. 2 da mesma lei e 2 leis distintas por dia. */
const permitirLegproc300 = (id, idsDia, metaDe, R) => {
    const m = metaDe(id);
    if (!m || idsDia.length >= R.legproc.metasDiaMax)
        return false;
    const lei = chaveLei(m), leis = new Set(idsDia.map((k) => chaveLei(metaDe(k))));
    return idsDia.filter((k) => chaveLei(metaDe(k)) === lei).length < R.legproc.mesmaLei && (leis.has(lei) || leis.size < R.legproc.leisDistintas);
};
function continuacaoPDF216(E, cfg, id, d, plano, detalhes, pdfPorAula) {
    var _a, _b, _c;
    if (!ehPdf(tipoEstudo(id)))
        return false;
    const i = indiceAula(id), md = detalhes[id] || {}, pai = md.pai || (tipoEstudo(id) === 'pp' ? 'pf:' + i : id);
    if (md.continuacao || (md.paginaInicio || 0) > 1)
        return true;
    if (!(0, exports.reforcoHistorico)(pai) && ((((_a = cfg.paginasLidas) === null || _a === void 0 ? void 0 : _a[i]) || 0) > 0 || Number((_c = (_b = E.prog[id]) === null || _b === void 0 ? void 0 : _b.parou) === null || _c === void 0 ? void 0 : _c.v) > 0))
        return true;
    if (tipoEstudo(id) === 'pp' && +id.split(':')[2] > 1)
        return true;
    return (pdfPorAula ? pdfPorAula.get(i) || [] : Object.keys(plano)).some((k) => { var _a; return k !== id && ehPdf(tipoEstudo(k)) && indiceAula(k) === i && (((_a = detalhes[k]) === null || _a === void 0 ? void 0 : _a.pai) || (tipoEstudo(k) === 'pp' ? 'pf:' + i : k)) === pai && plano[k][0] < d; });
}
function unificarPDF216(E, cfg, fonte, desde, opcoes) {
    var _a;
    const nova = copiar(fonte), detalhes = copiar(opcoes.detalhes || E.det), grupos = new Map();
    for (const [id, v] of Object.entries(fonte))
        if (ehPdf(tipoEstudo(id)) && !feito(E, id) && v[0] >= desde) {
            const pai = ((_a = detalhes[id]) === null || _a === void 0 ? void 0 : _a.pai) || (tipoEstudo(id) === 'pp' ? 'pf:' + indiceAula(id) : id);
            if (!grupos.has(pai))
                grupos.set(pai, []);
            grupos.get(pai).push(id);
        }
    for (const [pai, ids] of grupos) {
        if (ids.length < 2 || (opcoes.movida && ids.includes(opcoes.movida.id)))
            continue;
        const final = ids.find((id) => tipoEstudo(id) === 'pf');
        if (!final)
            continue;
        ids.sort((a, b) => fonte[a][0].localeCompare(fonte[b][0]) || (Number(tipoEstudo(a) === 'pf') - Number(tipoEstudo(b) === 'pf')) || a.localeCompare(b, 'en', { numeric: true }));
        const primeiro = ids[0], md = detalhesPdf(E, primeiro, fonte, detalhes), ultimo = detalhesPdf(E, final, fonte, detalhes), horas = ids.reduce((s, id) => s + fonte[id][1], 0), d = fonte[primeiro][0];
        for (const id of ids) {
            delete nova[id];
            delete detalhes[id];
        }
        nova[final] = [d, horas];
        detalhes[final] = { ...md, pai, paginaFim: ultimo.paginaFim, continuacao: continuacaoPDF216(E, cfg, primeiro, d, fonte, opcoes.detalhes || E.det) };
    }
    opcoes.detalhes = detalhes;
    return nova;
}
function calcularDomino219Base(E, fonte0, cfg, desde, opcoes = {}) {
    var _a, _b;
    const AS = E.AS, P = E.P, R = E.R, BLK = R.constantes.blocoMin, MAX = P.maxSemanas;
    const fonte = unificarPDF216(E, cfg, fonte0, desde, opcoes);
    const plano = {}, detalhes = copiar(opcoes.detalhes || E.det), fila = [];
    // índices incrementais do plano em construção (só leitura equivalente a varrer Object.keys/entries(plano)): minutos e ids por dia, PDFs por aula
    const minDia = new Map(), idsPorDia = new Map(), pdfPorAula = new Map();
    let verPlano = 0;
    const colocar = (id, v) => {
        const ant = plano[id];
        if (ant) { // reposição de id existente: caminho raro, reconstrói os índices do dia
            plano[id] = v;
            verPlano++;
            const dias = new Set([ant[0], v[0]]);
            for (const dia of dias) {
                let soma = 0;
                const lista = [];
                for (const k of Object.keys(plano))
                    if (plano[k][0] === dia) {
                        lista.push(k);
                        soma += Math.round(plano[k][1] * 60);
                    }
                minDia.set(dia, soma);
                idsPorDia.set(dia, lista);
            }
            return;
        }
        plano[id] = v;
        verPlano++;
        minDia.set(v[0], (minDia.get(v[0]) || 0) + Math.round(v[1] * 60));
        const l = idsPorDia.get(v[0]);
        if (l)
            l.push(id);
        else
            idsPorDia.set(v[0], [id]);
        if (ehPdf(tipoEstudo(id))) {
            const i = indiceAula(id), a = pdfPorAula.get(i);
            if (a)
                a.push(id);
            else
                pdfPorAula.set(i, [id]);
        }
    };
    const idsDoDia = (d) => idsPorDia.get(d) || [];
    const memoDia = (f) => { const c = new Map(); let ver = -1; return (d) => { if (ver !== verPlano) {
        c.clear();
        ver = verPlano;
    } let v = c.get(d); if (v === undefined) {
        v = f(d);
        c.set(d, v);
    } return v; }; };
    const quAdiados = new Set();
    let limiteQuestoes216 = 1;
    const fixosRodizio = Object.fromEntries(Object.entries(fonte).filter(([id]) => feito(E, id)));
    const rodizioPDF = construirRodizioPDF(E, cfg, fixosRodizio);
    const ordem = new Map(rodizioPDF.fila.map((i, k) => [i, k]));
    const contadores = {};
    for (const id of new Set([...Object.keys(fonte), ...Object.keys(E.prog), ...Object.keys(detalhes)]))
        if (id.startsWith('pp:')) {
            const [, i, k] = id.split(':');
            contadores[i] = Math.max(contadores[i] || 0, +k || 0);
        }
    const disciplinaMeta = (id) => { var _a, _b; return tipoEstudo(id) === 'lp' ? (_a = E.lpMap.get(id)) === null || _a === void 0 ? void 0 : _a.disc : (_b = AS[indiceAula(id)]) === null || _b === void 0 ? void 0 : _b[0]; };
    const leiMeta = (id) => { const lp = E.lpMap.get(id); return chaveLei(lp) || ((lp === null || lp === void 0 ? void 0 : lp.disc) + '|meta:' + id); };
    let sequencia = 0;
    for (const [id, [data, h]] of Object.entries(fonte)) {
        const t = tipoEstudo(id), minutos = Math.round(h * 60);
        if (feito(E, id) || data < desde || (opcoes.fixarComDado && comDado(E, id))) {
            colocar(id, [data, h]);
            continue;
        }
        const disc = disciplinaMeta(id), meta = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t;
        const esp = (0, exports.metaRevisao217)(id, detalhes) && ((disc != null && cfg.discs.includes(disc)) || (disc != null && exports.ESSENCIAIS.includes(disc)));
        // Revisão obrigatória: PDFlash de essencial externa (rf) não existe mais — limpa o que sobrou de um plano anterior.
        if (t === 'rf' && !(disc != null && cfg.discs.includes(disc)) && revisaoObrigatoria300(cfg, semDe(cfg.start, data), R))
            continue;
        if ((!disc || !cfg.discs.includes(disc) || !cfg.metas[meta]) && !esp && !(((0, exports.questoesHistorico)(id) || (0, exports.reforcoHistorico)(id)) && disc && cfg.discs.includes(disc)))
            continue;
        if (minutos <= 0)
            continue;
        const detalhe = ehPdf(t) ? detalhesPdf(E, id, fonte, detalhes) : { ...(detalhes[id] || {}) };
        fila.push({ id, t, data, minutos, detalhe, seq: sequencia++ });
    }
    const capacidade = (d) => Math.round(horasDia(cfg, d) * 60);
    const ocupado = (d) => minDia.get(d) || 0;
    if (ocupado(desde) > capacidade(desde))
        throw Error('Esse dia já tem ' + (ocupado(desde) / 60) + 'h de metas concluídas. Informe pelo menos esse tempo para preservar o que já foi feito.');
    const pdfsDia = memoDia((d) => new Set(idsDoDia(d).filter((id) => ehPdf(tipoEstudo(id))).map(indiceAula)));
    const anteriores = Object.entries(plano).filter(([id]) => id.startsWith('lp:')).sort((a, b) => a[1][0].localeCompare(b[1][0]));
    const rodizioDomino25 = criarRodizioLP25(cfg.discs, anteriores.length ? ((_a = disciplinaMeta(anteriores[anteriores.length - 1][0])) !== null && _a !== void 0 ? _a : null) : null, P.lpJanelaRodizio);
    const ordemRodizio25 = () => rodizioDomino25.ordenar(fila.filter((x) => x.t === 'lp').map((x) => disciplinaMeta(x.id)));
    const rankRodizio25 = (x, d) => {
        const ids = idsDoDia(d).filter((id) => id.startsWith('lp:'));
        const ultima = ids[ids.length - 1], disc = disciplinaMeta(x.id);
        if (ultima && disciplinaMeta(ultima) === disc && ids.filter((id) => disciplinaMeta(id) === disc).length === 1 && leiMeta(ultima) === leiMeta(x.id))
            return -1;
        return ordemRodizio25().indexOf(disc);
    };
    let inicioMovida = null, semanaRotina = 0, rotina, ultimoTipoRevisao = null, cotaFlash = Infinity, flashHoje = 0, retaFinal = false;
    const R23 = (0, exports.regra23)(cfg); // regra da ref. rev. 23 só vale para planos com cfg.motor >= 3.2.0
    const semanasIniciadas = new Map(); // pai da leitura → semana em que começou (rev. 23: não pode atravessar semanas)
    const temPDF = (d) => fila.some((x) => ehPdf(x.t) && !(0, exports.metaRevisao217)(x.id, detalhes) && x.data <= d);
    const novosDia = memoDia((d) => novosPDFDia27(plano, cfg, d, detalhes).size);
    const limiteDia = memoDia((d) => limitePDF27(E, cfg, d, plano));
    const cont = (id, d) => continuacaoPDF216(E, cfg, id, d, plano, detalhes, pdfPorAula);
    const prioridade = (x, d) => {
        var _a, _b, _c;
        if (ehPdf(x.t) && cont(x.id, d))
            return -3;
        if (((_a = opcoes.movida) === null || _a === void 0 ? void 0 : _a.id) === x.id && opcoes.movida.dia === d)
            return -2;
        if (ehPdf(x.t) && ((x.data > d) || (pdfsDia(d).size > 0 && !pdfsDia(d).has(indiceAula(x.id)))))
            return R.constantes.prioridadesDomino.rebaixada;
        if (x.t === 'lp')
            return (_b = R.prioridades.porTipo.lp) !== null && _b !== void 0 ? _b : R.prioridades.outros; // LegProc: ÚLTIMA prioridade em todas as faixas
        if (rotina.faixa < 3 && !L.ehRev(cfg, semanaRotina, R)) {
            if (R23 && ehPdf(x.t) && !rotina.pdf.has(d))
                return R.constantes.prioridadesDomino.rebaixada;
            if (rotina.revisao.has(d) && ['fl', 'qu'].includes(x.t))
                return x.t === ultimoTipoRevisao ? R.constantes.prioridadesDomino.revisaoRepetida : R.constantes.prioridadesDomino.revisaoDia;
            if (x.t === 'qu' && rotina.pdf.has(d))
                return R.constantes.prioridadesDomino.rebaixada;
        }
        if (rotina.faixa === 3 && !L.ehRev(cfg, semanaRotina, R)) {
            if (x.t === 'fl')
                return R.prioridades.faixa3.fl;
            if (x.t === 'qu')
                return R.prioridades.faixa3.qu;
            if (ehPdf(x.t))
                return R.prioridades.faixa3.pdf;
        }
        return (_c = R.prioridades.porTipo[x.t]) !== null && _c !== void 0 ? _c : R.prioridades.outros;
    };
    const liberar = (x, d) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        if (R.restricoes.length) {
            const c = {
                idsDoDia, dataDe: (k) => { var _a; return (_a = plano[k]) === null || _a === void 0 ? void 0 : _a[0]; }, faixa: rotina.faixa, pai: (k) => { var _a; return ((_a = detalhes[k]) === null || _a === void 0 ? void 0 : _a.pai) || (k.startsWith('pp:') ? 'pf:' + indiceAula(k) : k); },
                haOutrosPendentes: (fam) => fila.some((y) => y !== x && y.t !== 'lp' && (0, tipos_meta_1.familiaDoTipo)(y.t) !== fam),
            };
            if (!E.rastro) {
                if ((0, restricoes_1.restricaoBloqueia)(R.restricoes, x.id, d, c))
                    return false;
            }
            else {
                const r = (0, restricoes_1.restricaoQueBloqueia)(R.restricoes, x.id, d, c);
                if (r) {
                    E.rastro.reg(x.id, 'restricao', () => `${(0, rastro_1.rotuloMeta)(x.id)} barrado por restrição: ${r.rotulo || (0, restricoes_1.descreverRestricao)(r)}`, d);
                    return false;
                }
            }
        }
        const semana = semDe(cfg.start, d), esp = (0, exports.metaRevisao217)(x.id, detalhes);
        if (R23) {
            // até 2 PDFulls distintos / 2 revisões / 2 questões por dia
            if (!cabeTipoNoDia300(idsDoDia(d), detalhes, x.id, x.detalhe.pai, R)) {
                (_a = E.rastro) === null || _a === void 0 ? void 0 : _a.reg(x.id, 'limite_dia', () => textoLimiteDia(x.id, R), d);
                return false;
            }
            if (ehPdf(x.t)) {
                const pai = x.detalhe.pai || x.id;
                // a leitura não atravessa semanas e só começa se o saldo couber (≤3 datas) hoje + nos melhores dias restantes da semana
                if (semanasIniciadas.has(pai) && semanasIniciadas.get(pai) !== semana)
                    return false;
                const partes = new Set((pdfPorAula.get(indiceAula(x.id)) || []).filter((id) => { var _a; return (((_a = detalhes[id]) === null || _a === void 0 ? void 0 : _a.pai) || id) === pai; }).map((id) => plano[id][0]));
                partes.delete(d);
                const saldo = capacidade(d) - ocupado(d);
                const total = x.minutos + fila.filter((y) => y !== x && ehPdf(y.t) && (y.detalhe.pai || y.id) === pai).reduce((n, y) => n + y.minutos, 0);
                if (!cabeSaldoNaSemana300(total, saldo, partes.size, rotina.ativos.filter((data) => data > d), (data) => capacidade(data) - ocupado(data), R))
                    return false;
            }
        }
        if (esp && !L.ehRev(cfg, semana, R))
            return false;
        if (R23) {
            if (!retaFinal && (x.t === 'qu' || x.t === 'rq') && revisaoObrigatoria300(cfg, semana, R) && !L.ehRev(cfg, semana, R))
                return false;
            if (tetoInfo300(cfg, semana, R).equilibra && (x.t === 'fl' || x.t === 'rf') && idsDoDia(d).filter((k) => familiaMeta(k) === 'fl').length >= R.equilibrio.flashesDia)
                return false;
        }
        if (x.t === 'fl' && !esp && flashHoje >= cotaFlash && ((_b = opcoes.movida) === null || _b === void 0 ? void 0 : _b.id) !== x.id)
            return false; // cota diária de PDFlash (revisão obrigatória)
        if (x.t === 'rf' && !(disciplinaMeta(x.id) != null && cfg.discs.includes(disciplinaMeta(x.id))) && revisaoObrigatoria300(cfg, semana, R))
            return false;
        if (esp && ((_c = opcoes.movida) === null || _c === void 0 ? void 0 : _c.id) !== x.id && Number.isFinite(x.detalhe.ordemAlternancia)) {
            const origem = x.detalhe.semanaOrigemRevisao || semDe(cfg.start, x.data);
            if (fila.some((y) => y !== x && (0, exports.metaRevisao217)(y.id, detalhes) && (y.detalhe.semanaOrigemRevisao || semDe(cfg.start, y.data)) === origem && y.detalhe.ordemAlternancia < x.detalhe.ordemAlternancia))
                return false;
        }
        if (!retaFinal && rotina.faixa < 3 && !L.ehRev(cfg, semana, R) && !(((_d = opcoes.movida) === null || _d === void 0 ? void 0 : _d.id) === x.id && opcoes.movida.dia === d)) {
            const aquecimento = semana <= (cfg.metas.qu ? R.rotina.aquecimentoComQuestoes : cfg.metas.fl ? R.rotina.aquecimentoSoRevisao : 0);
            const diaPDF = rotina.pdf.has(d), diaRevisao = rotina.revisao.has(d);
            if (!R23 && ehPdf(x.t) && !diaPDF && !x.detalhe.continuacao && !(aquecimento && diaRevisao))
                return false; // rev. 23: qualquer dia de estudo recebe PDFull
            if (x.t === 'fl' && !diaRevisao)
                return false;
            if (x.t === 'qu' && !diaRevisao && !(rotina.faixa === 2 && diaPDF))
                return false;
            if (x.t === 'lp' && !diaPDF && !aquecimento && temPDF(d))
                return false;
        }
        if (!retaFinal && ehPdf(x.t) && L.ehRev(cfg, semana, R) && !esp && !x.detalhe.continuacao)
            return false;
        // Leitura inteira: não divide se (nesta ou nas 3 semanas seguintes) há dia de leitura com capacidade para a aula toda.
        if (ehPdf(x.t) && !esp && !L.ehRev(cfg, semana, R) && !x.detalhe.continuacao && !cont(x.id, d) && x.id !== ((_e = opcoes.movida) === null || _e === void 0 ? void 0 : _e.id) &&
            x.minutos > capacidade(d) - ocupado(d) && !(R23 && (retaFinal || revisaoObrigatoria300(cfg, semana, R)) && capacidade(d) - ocupado(d) >= R.divisao.sobraMinAvancarMin) &&
            temDiaInteiro300(cfg, d, x.minutos, capacidade, retaFinal, R))
            return false;
        if (ehPdf(x.t) && !cont(x.id, d) && pdfsDia(d).size > 0 && !pdfsDia(d).has(indiceAula(x.id)) && ((_f = opcoes.movida) === null || _f === void 0 ? void 0 : _f.id) !== x.id && x.minutos > capacidade(d) - ocupado(d))
            return false;
        if (x.t === 'qu' || x.t === 'rq') {
            const nQu = idsDoDia(d).filter((k) => familiaMeta(k) === 'qu').length;
            if (nQu >= limiteQuestoes216)
                return false;
        }
        const adiantar = d === desde && ((opcoes.adiantarLP && x.t === 'lp') || (opcoes.adiantarPDF && ehPdf(x.t)));
        // LegProc regular (sem continuação/remanejo/movida) pode ser ANTECIPADO para a sobra de um dia anterior.
        const legprocDeSobra = x.t === 'lp' && !x.detalhe.continuacao && !((_g = cfg.remanejadas) === null || _g === void 0 ? void 0 : _g[x.id]) && (!opcoes.movida || opcoes.movida.id !== x.id);
        // rev. 23 — reta final: PDFull/PDFlash/questões regulares podem ser ANTECIPADOS para a sobra (exceto remanejados e a meta movida)
        const anteciparFinal = retaFinal && !((_h = cfg.remanejadas) === null || _h === void 0 ? void 0 : _h[x.id]) && ((_j = opcoes.movida) === null || _j === void 0 ? void 0 : _j.id) !== x.id && !esp &&
            (ehPdf(x.t) || (R.adaptacao.antecipaRetornoAtivo && (x.t === 'fl' || x.t === 'qu') && !(0, exports.questoesHistorico)(x.id) && !(0, exports.reforcoHistorico)(x.id)));
        if (x.data > d && !adiantar && !legprocDeSobra && !anteciparFinal)
            return false;
        const i = indiceAula(x.id);
        if (ehPdf(x.t)) {
            const resto = x.detalhe.continuacao || (((_k = cfg.paginasLidas) === null || _k === void 0 ? void 0 : _k[i]) || 0) > 0 || (((_l = cfg.partesLidas) === null || _l === void 0 ? void 0 : _l[i]) || 0) > 0 || (pdfPorAula.get(i) || []).some((id) => plano[id][0] < d);
            if (!retaFinal && !resto && !esp && !(0, exports.reforcoHistorico)(x.id) && iniciosPDF300(cfg, plano, detalhes, semana) >= tetoPDF300(cfg, semana, R)) {
                (_m = E.rastro) === null || _m === void 0 ? void 0 : _m.reg(x.id, 'teto_semana', () => `${(0, rastro_1.rotuloMeta)(x.id)} adiado: teto de ${tetoPDF300(cfg, semana, R)} PDFull(s) novo(s) por semana (faixa ${rotina.faixa}) atingido na semana ${semana}.`, d);
                return false;
            }
            if (!retaFinal && !resto && !pdfsDia(d).has(i) && novosDia(d) >= limiteDia(d)) {
                (_o = E.rastro) === null || _o === void 0 ? void 0 : _o.reg(x.id, 'limite_novos_dia', () => `${(0, rastro_1.rotuloMeta)(x.id)} adiado: limite de ${limiteDia(d)} PDFull(s) novo(s) por dia atingido.`, d);
                return false;
            }
            const antes = fila.some((y) => { var _a, _b; return y !== x && ehPdf(y.t) && ((!x.detalhe.continuacao && !x.detalhe.reforco && disciplinaMeta(y.id) === disciplinaMeta(x.id) && ((_a = ordem.get(indiceAula(y.id))) !== null && _a !== void 0 ? _a : 1e9) < ((_b = ordem.get(i)) !== null && _b !== void 0 ? _b : 1e9)) || (indiceAula(y.id) === i && (y.data < x.data || (y.data === x.data && y.seq < x.seq)))); });
            if (antes)
                return false;
            if (!x.detalhe.reforco) {
                const pai = rodizioPDF.dependencias[i];
                if (pai != null && fila.some((y) => ehPdf(y.t) && !y.detalhe.reforco && indiceAula(y.id) === pai))
                    return false;
                if (pai != null && ((_p = plano['pf:' + pai]) === null || _p === void 0 ? void 0 : _p[0]) > d)
                    return false;
            }
        }
        if (x.t === 'fl' || x.t === 'qu') {
            const pai = 'pf:' + i;
            if (fila.some((y) => y.id === pai))
                return false;
            if (plano[pai]) {
                const ideal = retaFinal ? plano[pai][0] : revisaoObrigatoria300(cfg, semana, R) && podeAnteciparRetorno300(cfg, plano[pai][0], d, x.t, R) ? d : L.proxSemConteudo(cfg, plano[pai][0], x.t === 'fl' ? P.offsetRevisao : P.offsetQuestoes, R);
                if (d < ideal)
                    return false;
            }
            if (x.t === 'qu' && fila.some((y) => y.id === 'fl:' + i))
                return false;
            if (x.t === 'qu' && plano['fl:' + i] && d < plano['fl:' + i][0])
                return false;
        }
        if (x.t === 'rq') {
            const rev = x.id.replace(/^rq:/, 'rf:');
            if (fila.some((y) => y.id === rev))
                return false;
            if (plano[rev] && d < plano[rev][0])
                return false;
        }
        if (x.t === 'lp') {
            const ids = idsDoDia(d).filter((k) => k.startsWith('lp:'));
            if (!permitirLegproc300(x.id, ids, (k) => E.lpMap.get(k), R))
                return false;
            if (!x.detalhe.continuacao && !ordemRodizio25().includes(disciplinaMeta(x.id)))
                return false;
            const rank = (_q = E.lpPos.get(x.id)) !== null && _q !== void 0 ? _q : -1;
            if (fila.some((y) => { var _a; return y !== x && y.t === 'lp' && disciplinaMeta(y.id) === disciplinaMeta(x.id) && ((_a = E.lpPos.get(y.id)) !== null && _a !== void 0 ? _a : -1) < rank; }))
                return false;
        }
        return true;
    };
    let fim = Math.max(1, semDe(cfg.start, desde));
    for (let k = 0, d = desde; k < MAX * 7 && fila.length; k++, d = dAdd(d, 1)) {
        const sem = semDe(cfg.start, d);
        ativarSemana(E, opcoes.rotinaOriginal || cfg, sem);
        if (sem !== semanaRotina) {
            semanaRotina = sem;
            rotina = rotina300(opcoes.rotinaOriginal || cfg, sem, desde, R);
        }
        let livre = capacidade(d) - ocupado(d);
        const revObrig = L.ehRev(cfg, sem, R) && revisaoObrigatoria300(cfg, sem, R);
        limiteQuestoes216 = revObrig ? Infinity : R23 && tetoInfo300(cfg, sem, R).equilibra ? R.equilibrio.questoesDia : R.constantes.questoesBaseDia + (rotina.faixa === 3 || L.ehRev(cfg, sem, R) ? quAdiados.size : 0);
        if (livre <= 0)
            continue;
        if (R23) {
            // reta final do reagendamento: restam ≤2 (≤4 após a semana 4) tetos de PDFull nas leituras pendentes
            const restantes = new Set(fila.filter((x) => ehPdf(x.t) && !(0, exports.metaRevisao217)(x.id, detalhes) && !(0, exports.reforcoHistorico)(x.id)).map((x) => indiceAula(x.id)));
            retaFinal = retaFinal || faseFinal300(cfg, sem, restantes.size, R);
        }
        flashHoje = 0;
        cotaFlash = !retaFinal && revObrig ? cotaPDFlash300(rotina.ativos.filter((data) => data >= d), (data) => capacidade(data) - ocupado(data), fila.filter((x) => x.t === 'fl' && !(0, exports.metaRevisao217)(x.id, detalhes) && semDe(cfg.start, x.data) <= sem).length) : Infinity;
        while (livre > 0) {
            const disponiveis = fila.filter((x) => liberar(x, d) && (ehPdf(x.t) || x.minutos <= livre)).sort((a, b) => { var _a, _b; return prioridade(a, d) - prioridade(b, d) || (ehPdf(a.t) && ehPdf(b.t) && !a.detalhe.continuacao && !b.detalhe.continuacao && !a.detalhe.reforco && !b.detalhe.reforco ? ((_a = ordem.get(indiceAula(a.id))) !== null && _a !== void 0 ? _a : 1e9) - ((_b = ordem.get(indiceAula(b.id))) !== null && _b !== void 0 ? _b : 1e9) : 0) || (a.t === 'lp' && b.t === 'lp' ? rankRodizio25(a, d) - rankRodizio25(b, d) : 0) || a.data.localeCompare(b.data) || a.seq - b.seq; });
            const x = disponiveis[0];
            if (!x)
                break;
            if (((_b = opcoes.movida) === null || _b === void 0 ? void 0 : _b.id) === x.id && !inicioMovida)
                inicioMovida = d;
            let m = Math.min(x.minutos, livre);
            if (ehPdf(x.t)) {
                const outros = fila.filter((y) => y !== x && liberar(y, d) && ['fl', 'rf', 'qu', 'rq'].includes(y.t));
                const rv = outros.find((y) => y.t === 'fl' || y.t === 'rf'), qu = outros.find((y) => y.t === 'qu' || y.t === 'rq');
                let reserva = ((rv === null || rv === void 0 ? void 0 : rv.minutos) || 0) + ((qu === null || qu === void 0 ? void 0 : qu.minutos) || 0);
                if (R23 || !(0, exports.metaRevisao217)(x.id, detalhes))
                    reserva = 0;
                if (livre - reserva >= BLK)
                    m = Math.min(m, Math.floor((livre - reserva) / BLK) * BLK);
                else
                    m = Math.min(m, Math.floor(livre / BLK) * BLK);
                const pai = x.detalhe.pai || x.id;
                const partes = new Set(Object.keys(plano).filter((id) => { var _a; return ehPdf(tipoEstudo(id)) && (((_a = detalhes[id]) === null || _a === void 0 ? void 0 : _a.pai) || id) === pai; }).map((id) => plano[id][0]));
                partes.add(d);
                if (partes.size > R.divisao.maxDatas || (partes.size === R.divisao.maxDatas && m < x.minutos) || m < BLK)
                    break;
            }
            if (x.t === 'fl' && !(0, exports.metaRevisao217)(x.id, detalhes))
                flashHoje++;
            if (x.t === 'fl' || x.t === 'qu')
                ultimoTipoRevisao = x.t;
            if ((x.t === 'qu' || x.t === 'rq') && quAdiados.size)
                quAdiados.delete([...quAdiados][0]);
            if (x.t === 'lp')
                rodizioDomino25.avancar(disciplinaMeta(x.id));
            if (ehPdf(x.t) && m < x.minutos) {
                const i = indiceAula(x.id), id = 'pp:' + i + ':' + (contadores[i] = (contadores[i] || 0) + 1);
                const md = { ...x.detalhe, origem: x.detalhe.origem || x.id, pai: x.detalhe.pai || 'pf:' + i };
                const pags = Math.max(0, (md.paginaFim || 0) - (md.paginaInicio || 1) + 1), lidas = Math.floor(pags * m / x.minutos);
                md.paginaFim = (md.paginaInicio || 1) + lidas - 1;
                colocar(id, [d, m / 60]);
                detalhes[id] = md;
                x.detalhe = { ...x.detalhe, paginaInicio: md.paginaFim + 1, ...(R23 ? { continuacao: true } : {}) };
                x.minutos -= m;
                x.data = dAdd(d, 1);
                x.detalhe.deslocada = true;
            }
            else {
                colocar(x.id, [d, m / 60]);
                detalhes[x.id] = { ...x.detalhe, deslocada: d !== x.data || x.detalhe.deslocada };
                fila.splice(fila.indexOf(x), 1);
            }
            if (R23 && ehPdf(x.t))
                semanasIniciadas.set(x.detalhe.pai || x.id, sem);
            livre -= m;
            fim = Math.max(fim, semDe(cfg.start, d));
        }
        if (capacidade(d) > 0 && !idsDoDia(d).some((id) => familiaMeta(id) === 'qu') && capacidade(d) - ocupado(d) < BLK) {
            const q = fila.find((x) => (x.t === 'qu' || x.t === 'rq') && liberar(x, d));
            if (q)
                quAdiados.add(q.id);
        }
    }
    if (fila.length)
        throw Error('Não há disponibilidade suficiente para redistribuir todas as metas. Ajuste a rotina de estudo e tente novamente.');
    for (const [d] of Object.values(plano))
        fim = Math.max(fim, semDe(cfg.start, d));
    if (opcoes.movida && inicioMovida !== opcoes.movida.dia)
        throw Error('A meta não pode começar nesse dia com as horas disponíveis e a ordem de estudo. Escolha outro dia.');
    return { plano, detalhes, fim };
}
/**
 * Dominó DESLIGADO (regras.adaptacao.dominoAtivo = false): NÃO refluxa o plano. Só adia o que o aluno pediu — a meta movida vai para o dia
 * escolhido e as pendentes (não feitas) de dias anteriores a `desde` passam para o próximo dia de estudo; o resto fica onde estava.
 * Consequência assumida: não há reorganização da fila, teto semanal nem limites diários sobre as metas adiadas (podem sobrecarregar um dia).
 */
function adiarSemDomino(E, fonte, cfg, desde, opcoes) {
    var _a, _b;
    const plano = {}, detalhes = copiar(opcoes.detalhes || E.det);
    const proximo = L.proximoEstudo(cfg, desde) || desde;
    let fim = semDe(cfg.start, desde);
    for (const [id, v] of Object.entries(fonte)) {
        let alvo = v[0];
        if (((_a = opcoes.movida) === null || _a === void 0 ? void 0 : _a.id) === id)
            alvo = opcoes.movida.dia;
        else if (!feito(E, id) && v[0] < desde && !(0, exports.ehJuris219)(id))
            alvo = proximo;
        plano[id] = [alvo, v[1]];
        if (alvo !== v[0]) {
            detalhes[id] = { ...(detalhes[id] || {}), deslocada: true };
            (_b = E.rastro) === null || _b === void 0 ? void 0 : _b.reg(id, 'adiada_sem_domino', () => `${(0, rastro_1.rotuloMeta)(id)} apenas adiado de ${v[0]} para ${alvo} (dominó desligado: sem refluxo das demais metas).`, alvo);
        }
        fim = Math.max(fim, semDe(cfg.start, alvo));
    }
    return { plano, detalhes, fim };
}
function calcularDominoE(E, fonte, cfg, desde, opcoes = {}) {
    if (!E.R.adaptacao.dominoAtivo)
        return adiarSemDomino(E, fonte, cfg, desde, opcoes);
    const normal = Object.fromEntries(Object.entries(fonte).filter(([id]) => !(0, exports.ehJuris219)(id)));
    const passadas = Object.fromEntries(Object.entries(fonte).filter(([id, v]) => (0, exports.ehJuris219)(id) && (v[0] < desde || feito(E, id) || (!!opcoes.fixarComDado && comDado(E, id)))));
    const semanasFixasJp = new Set(Object.values(passadas).map((v) => semDe(cfg.start, v[0])));
    const ultima = Object.values(fonte).reduce((d, v) => (v[0] > d ? v[0] : d), desde);
    let limite = Math.max(semDe(cfg.start, desde), semDe(cfg.start, ultima));
    const opts = { ...opcoes, rotinaOriginal: cfg };
    if (opts.movida && (0, exports.ehJuris219)(opts.movida.id))
        delete opts.movida;
    for (let tentativa = 0; tentativa < 200; tentativa++) {
        const reduzida = copiar(cfg), reservas = { ...passadas };
        reduzida.horasPontuais = { ...(cfg.horasPontuais || {}) };
        for (let sem = Math.max(1, semDe(cfg.start, desde)); sem <= limite; sem++) {
            if (opcoes.fixarComDado && semanasFixasJp.has(sem))
                continue; // semana já tem jp com dado fixo: não reserva outra
            const r = reservarJuris219(E, cfg, sem, desde, fonte, opcoes);
            if (!r)
                continue;
            reservas[r.id] = r.valor;
            const [d, h] = r.valor;
            if (d >= desde)
                reduzida.horasPontuais[d] = Math.max(0, horasDia(cfg, d) - h);
        }
        const g = calcularDomino219Base(E, normal, reduzida, desde, { ...opts });
        const ultimoNormal = Object.values(g.plano).reduce((d, v) => (v[0] > d ? v[0] : d), desde), fim = semDe(cfg.start, ultimoNormal);
        if (fim > limite) {
            limite = fim;
            continue;
        }
        Object.assign(g.plano, reservas);
        g.detalhes || (g.detalhes = {});
        for (const id of Object.keys(reservas))
            g.detalhes[id] = { ...(E.det[id] || {}), jurisprudencia: true };
        g.fim = Math.max(g.fim, ...Object.values(reservas).map((v) => semDe(cfg.start, v[0])));
        return g;
    }
    throw Error('Não foi possível encaixar a Jurisprudência semanal e as demais metas. Ajuste a disponibilidade.');
}
/**
 * gerarPlano → gerarPlanoCatalogo → gerarPlanoBase (+ dominó quando há metas remanejadas pendentes).
 * Lança ErroInsuficiencia se o plano não couber em MAX_SEM semanas.
 */
function gerarPlano(cfg0, AS, LP, fixos, ancora, ctx = {}) {
    var _a, _b, _c, _d, _e;
    fixos = fixos || {};
    const R = (0, regras_1.resolverRegras)(ctx), HZ = R.horizonte.maxSemanas;
    const P = L.resolverParams({ ...(ctx.params || {}), maxSemanas: Math.min(HZ, Math.max(20, ((_b = (_a = ctx.params) === null || _a === void 0 ? void 0 : _a.maxSemanas) !== null && _b !== void 0 ? _b : HZ))) });
    const E = criarEnv(AS, LP, ctx, P);
    const baseData = ancora && ancora > cfg0.start ? ancora : cfg0.start;
    const cfg = copiar(cfg0);
    // Plano gerado/recalculado agora segue a regra vigente (VERSAO_MOTOR). Exceção: migração automática do servidor
    // (ctx.manterMotor) preserva o carimbo 3.x do plano gravado — planos antigos mantêm a regra deles até o aluno recalcular.
    cfg.motor = ctx.manterMotor && typeof cfg0.motor === 'string' && /^3\./.test(cfg0.motor) ? cfg0.motor : exports.VERSAO_MOTOR;
    aplicarBloqueioCfg(E, cfg);
    fixos = semBloqueadas(E, fixos);
    if (R.constantes.cargaMinimaMin > 0 && L.cargaSemanaMin(cfg, 0) < R.constantes.cargaMinimaMin)
        throw Error(`Selecione pelo menos ${(0, faixas_carga_1.textoHoras)(R.constantes.cargaMinimaMin)} de estudo por semana.`);
    cfg.revisao || (cfg.revisao = { ativa: true, cada: (0, faixas_carga_2.padraoDaFaixa)(faixaInicial(cfg, R), R) });
    cfg.revisao.ativa = true; // semana de revisão é OBRIGATÓRIA em todas as faixas (o "Não" foi removido)
    cfg.revisao.cada = normalizarCada(cfg.revisao.cada, true, R, faixaInicial(cfg, R));
    cfg.remanejadas = { ...L.remanejadasEfetivas(cfg, AS, fixos, baseData, P), ...(cfg.remanejadas || {}) };
    registrarReforcos216(E, cfg);
    // gerarPlanoCatalogo: metas "anteriores" (histórico declarado) saem dos fixos, exceto as concluídas; remanejadas ficam presas
    const presos = Object.fromEntries(Object.entries(fixos).filter(([id]) => !ehMetaAnterior(E, id, cfg) || feito(E, id)));
    for (const [id, r] of Object.entries(cfg.remanejadas)) {
        if (presos[id] || (metaBloqueada(E, id) && !feito(E, id)) || ehMetaAnterior(E, id, cfg) || ((0, exports.reforcoHistorico)(id) && tipoEstudo(id) === 'pf' && !indicesAnteriores(E, cfg).has(indiceAula(id))))
            continue;
        const t = tipoEstudo(id), i = indiceAula(id);
        const disc = t === 'lp' ? (_c = E.lpMap.get(id)) === null || _c === void 0 ? void 0 : _c.disc : (_d = AS[i]) === null || _d === void 0 ? void 0 : _d[0];
        const tipo = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t;
        if ((!disc || !cfg.discs.includes(disc) || !cfg.metas[tipo]) && !(((0, exports.questoesHistorico)(id) || (0, exports.reforcoHistorico)(id)) && disc && cfg.discs.includes(disc)))
            continue;
        presos[id] = [r.desde < baseData ? baseData : r.desde, r.minutos / 60];
    }
    const g = gerarPlanoBase30(E, cfg, presos, ancora);
    for (const id of Object.keys(cfg.remanejadas))
        if (g.plano[id])
            g.fim = Math.max(g.fim, semDe(cfg.start, g.plano[id][0]));
    let detalhes = { ...g.detalhes };
    for (const id of Object.keys(fixos))
        if (E.det[id])
            detalhes[id] = copiar(E.det[id]);
    for (const [id, r] of Object.entries(cfg.remanejadas))
        if (g.plano[id] && !feito(E, id))
            detalhes[id] = { ...(r.detalhe || {}), pai: ((_e = r.detalhe) === null || _e === void 0 ? void 0 : _e.pai) || id, geracao: r.geracao || null };
    const cfgAtualizada = { reforcosHistorico: cfg.reforcosHistorico, remanejadas: cfg.remanejadas, revisao: cfg.revisao };
    if (Object.keys(cfg.remanejadas).some((id) => g.plano[id] && !feito(E, id))) {
        const r = calcularDominoE(E, g.plano, cfg, baseData, { detalhes, fixarComDado: true });
        return { plano: r.plano, fim: r.fim, detalhes: r.detalhes, legprocRestantes: g.legprocRestantes, cfgAtualizada };
    }
    return { plano: g.plano, fim: g.fim, detalhes, legprocRestantes: g.legprocRestantes, cfgAtualizada };
}
/** Dominó público: re-fluxa um plano existente a partir de `desde` (não realizada, parcial, organizar atrasadas, ajustar horas, pausa). */
function calcularDomino(fonte, cfg0, desde, opcoes, AS, LP, ctx = {}) {
    const R = (0, regras_1.resolverRegras)(ctx);
    const P = L.resolverParams({ ...(ctx.params || {}), maxSemanas: R.horizonte.maxSemanas });
    const E = criarEnv(AS, LP, ctx, P);
    const cfg = copiar(cfg0);
    // O reagendamento (dominó) segue a regra do CARIMBO do plano: plano 3.1.x mantém a regra 3.1; só 3.2+ usa a ref. rev. 23.
    // Sem carimbo 3.x (cfg legado/sem motor) → regra 3.1 (comportamento anterior à rev. 23).
    cfg.motor = typeof cfg0.motor === 'string' && /^3\./.test(cfg0.motor) ? cfg0.motor : '3.1.0';
    aplicarBloqueioCfg(E, cfg);
    fonte = semBloqueadas(E, fonte);
    cfg.revisao || (cfg.revisao = { ativa: true, cada: (0, faixas_carga_2.padraoDaFaixa)(faixaInicial(cfg, R), R) });
    cfg.revisao.ativa = true;
    cfg.revisao.cada = normalizarCada(cfg.revisao.cada, true, R, faixaInicial(cfg, R));
    return calcularDominoE(E, fonte, cfg, desde, opcoes);
}
/** Metas de LegProc ainda sem data nas disciplinas selecionadas (oferta de cronograma complementar ao fim da fila). */
function pendenciasLegproc(cfg, LP, plano, feitas) {
    if (!cfg.metas.lp)
        return [];
    const f = new Set(feitas), agendadas = new Set(Object.keys(plano).filter((id) => id.startsWith('lp:')));
    return (LP || []).filter((x) => cfg.discs.includes(x.disc) && !agendadas.has(x.id) && !f.has(x.id)).map((x) => x.id);
}
/** Expostos p/ testes/diagnóstico. */
exports._interno = { rankingRevisaoBase, criarEnv, gerarPlanoBase30, calcularDominoE, estudadas216, acertoTema };

  };
  var atual = req('motor30'); atual.legado = req('motor28');
  window.Motor28 = atual;
})();
