/* GERADO por scripts/build-motor28.mjs a partir de lib/cronograma/adaptativo/motor28.ts — NÃO editar à mão. */
(function () {
  var exports = {}; var module = { exports: exports };
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
exports.ehJuris219 = exports.ehReforco = exports.ehHist = exports.PARAMS_PADRAO_MOTOR = exports.DUR_REVISAO = exports.DUR = exports.VEL_PADRAO = exports.MAX_SEM = exports.SEM_FLASH = exports.VERSAO_MOTOR = void 0;
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
exports.detalhesPdf = detalhesPdf;
exports.calcularDomino = calcularDomino;
exports.metaSemanalHistorico = metaSemanalHistorico;
exports.gerarPlano = gerarPlano;
exports.saudePlano = saudePlano;
exports.VERSAO_MOTOR = '2.8.1';
exports.SEM_FLASH = new Set(['Direito Eleitoral', 'Direito Internacional', 'Direito Internacional Privado', 'Legislação de Ensino', 'Legislação da AGU']);
exports.MAX_SEM = 200;
exports.VEL_PADRAO = 17;
exports.DUR = { fl: 60, qu: 30, lp: 30 };
exports.DUR_REVISAO = { rf: 60, rq: 30 };
function resolverParams(p) {
    const q = p || {};
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    return {
        velPadrao: q.velPadrao && q.velPadrao > 0 ? q.velPadrao : exports.VEL_PADRAO,
        offsetRevisao: num(q.offsetRevisao, 1),
        offsetQuestoes: num(q.offsetQuestoes, 2),
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
            if ((+((_a = n.grau) !== null && _a !== void 0 ? _a : 0)) >= 7)
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
        if (!id.startsWith('pf:') || d >= ateData)
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
function dAdd(s, n) { const d = dParse(s); d.setDate(d.getDate() + n); return dISO(d); }
function dDow(s) { return (dParse(s).getDay() + 6) % 7; }
function dMon(s) { return dAdd(s, -dDow(s)); }
function semDe(start, s) { return Math.round((+dParse(dMon(s)) - +dParse(dMon(start))) / 864e5 / 7) + 1; }
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
function ehRev(cfg, sem) {
    const r = cfg.revisao;
    return !!(r && r.ativa && r.cada && r.cada > 0 && sem > 0 && sem % r.cada === 0);
}
function proxSemConteudo(cfg, s, n) {
    let sem = semDe(cfg.start, s), k = 0;
    while (k < n) {
        sem++;
        if (!ehRev(cfg, sem))
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
/** Chave da lei de uma meta de LegProc (disciplina + lei normalizada). */
function chaveLei(meta) {
    if (!(meta === null || meta === void 0 ? void 0 : meta.lei) || !String(meta.lei).trim())
        return '';
    return meta.disc + '|' + String(meta.lei).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
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
// ── histórico prévio ("Já estuda pelo Revisão?") ──
/** Índices de AS declarados como já estudados (prefixo inclusivo, na ordem de AS, por disciplina selecionada). */
function indicesAnteriores(cfg, AS) {
    const out = new Set();
    if (!cfg.jaEstudaRevisao || !cfg.ultimosTemas)
        return out;
    const ativas = new Set(cfg.discs);
    const pos = {};
    AS.forEach((a, i) => {
        var _a;
        const disc = a[0];
        const k = pos[disc] = ((_a = pos[disc]) !== null && _a !== void 0 ? _a : -1) + 1;
        const lim = cfg.ultimosTemas[disc];
        if (ativas.has(disc) && typeof lim === 'number' && lim >= 0 && k <= lim)
            out.add(i);
    });
    return out;
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
    const blocos = Object.entries(plano).filter(([k]) => ehPdf(tipoEstudo(k)) && indiceAula(k) === i)
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
    const desde = proximoEstudo(cfg, base) || base;
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
    const ctxI = {
        AS, LP: lista, lpMap: new Map(lista.map((x) => [x.id, x])), lpPos: new Map(lista.map((x, k) => [x.id, k])),
        ordem: ctx.ordem && ctx.ordem.length ? ctx.ordem.filter((i) => AS[i]) : AS.map((_, i) => i), feitas, usados: new Set(ctx.usados || []), params: P,
        // inteligência de desempenho: vazio (e ignorado) enquanto a flag estiver desligada → plano idêntico ao 2.8
        fracos: P.desempenho.ativo ? temasFracos(ctx.notas, P.desempenho.acertoMin) : new Set(),
    };
    // gerarPlanoCatalogo: fila de aulas sem o histórico prévio; metas remanejadas ficam presas na data pedida
    const anteriores = indicesAnteriores(c, AS);
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
function metaSemanalHistorico(cfg, sem) {
    const ini = semInicio(cfg.start, sem);
    return Array.from({ length: 7 }, (_, k) => horasDia(cfg, dAdd(ini, k)) * 60).reduce((a, b) => a + b, 0) >= 24 * 60 ? 3 : 2;
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
    const anteriores = indicesAnteriores(cfg, AS);
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

  window.Motor28 = module.exports && Object.keys(module.exports).length ? module.exports : exports;
})();
