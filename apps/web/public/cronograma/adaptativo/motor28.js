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
exports.DUR_REVISAO = exports.DUR = exports.VEL_PADRAO = exports.MAX_SEM = exports.SEM_FLASH = exports.VERSAO_MOTOR = void 0;
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
exports.gerarPlano = gerarPlano;
exports.saudePlano = saudePlano;
exports.VERSAO_MOTOR = '2.8.1';
exports.SEM_FLASH = new Set(['Direito Eleitoral', 'Direito Internacional', 'Direito Internacional Privado', 'Legislação de Ensino', 'Legislação da AGU']);
exports.MAX_SEM = 200;
exports.VEL_PADRAO = 17;
exports.DUR = { fl: 60, qu: 30, lp: 30 };
exports.DUR_REVISAO = { rf: 60, rq: 30 };
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
function minPdf(p, vel) { const v = vel && vel > 0 ? vel : exports.VEL_PADRAO; return Math.max(30, Math.ceil((p || 60) / v * 2 - 1e-9) * 30); }
const proximoEstudo = (cfg, aPartir) => {
    for (let n = 0, d = aPartir; n < 1400; n++, d = dAdd(d, 1))
        if (d >= cfg.start && horasDia(cfg, d) > 0)
            return d;
    return null;
};
/** Perfil da semana: horas da rotina e o dia que concentra as questões (≤18 h e mais de 1 dia disponível). */
function perfilSemana(cfg, sem) {
    const ini = semInicio(cfg.start, sem), datas = Array.from({ length: 7 }, (_, i) => dAdd(ini, i));
    const horas = datas.reduce((n, d) => n + (+(horasEm(cfg, d)[dDow(d)] || 0)), 0);
    const disponiveis = datas.filter((d) => d >= cfg.start && horasDia(cfg, d) > 0);
    return { horas, concentrado: horas <= 18 && disponiveis.length > 1 ? disponiveis[disponiveis.length - 1] : null };
}
/** Semana de revisão: por tema, Revisão (60) + Questões (30), preenchendo cada dia; dia concentrado só recebe questões. */
function planoRevisao(capDias, temas, apenasQuestoes = []) {
    if (apenasQuestoes.some(Boolean))
        return planoRevisaoConcentrada(capDias, temas, apenasQuestoes);
    const fila = [];
    for (let n = 0; n < temas; n++)
        fila.push({ t: 'rf', n }, { t: 'rq', n });
    let q = 0;
    return capDias.map((c) => {
        const itens = [];
        let usado = 0;
        while (q < fila.length && usado + exports.DUR_REVISAO[fila[q].t] <= c) {
            itens.push(fila[q]);
            usado += exports.DUR_REVISAO[fila[q].t];
            q++;
        }
        return { itens, usado };
    });
}
function planoRevisaoConcentrada(capDias, temas, apenasQuestoes) {
    const out = capDias.map(() => ({ itens: [], usado: 0 })), livre = capDias.map((c) => Math.max(0, c));
    for (let n = 0; n < temas; n++) {
        let colocou = false;
        for (let r = 0; r < livre.length; r++) {
            if (apenasQuestoes[r] || livre[r] < 60)
                continue;
            livre[r] -= 60;
            const pref = livre.map((_, k) => k).filter((k) => k >= r).sort((a, b) => Number(!!apenasQuestoes[b]) - Number(!!apenasQuestoes[a]) || a - b);
            const q = pref.find((k) => livre[k] >= 30);
            if (q == null) {
                livre[r] += 60;
                continue;
            }
            out[r].itens.push({ t: 'rf', n });
            out[r].usado += 60;
            out[q].itens.push({ t: 'rq', n });
            out[q].usado += 30;
            livre[q] -= 30;
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
function permitirLegproc25(id, idsDia, metaDe) {
    const m = metaDe(id);
    if (!(m === null || m === void 0 ? void 0 : m.disc) || idsDia.length >= 4)
        return false;
    const existentes = idsDia.map((x) => ({ id: x, m: metaDe(x) })).filter((x) => { var _a; return (_a = x.m) === null || _a === void 0 ? void 0 : _a.disc; });
    const disciplinas = new Set(existentes.map((x) => x.m.disc)), daDisc = existentes.filter((x) => x.m.disc === m.disc);
    if (daDisc.length >= 2)
        return false;
    if (!daDisc.length)
        return disciplinas.size < 2;
    const lei = chaveLei(m);
    return !!lei && daDisc.every((x) => chaveLei(x.m) === lei);
}
/** Rodízio de disciplinas do LegProc: janela das 6 primeiras com metas pendentes, girando após a última usada. */
function criarRodizioLP25(disciplinas, ultima = null) {
    const ordem = [...new Set(disciplinas)], estado = { ultima };
    return {
        ordenar(pendentes) {
            const disponiveis = new Set(pendentes), ativas = ordem.filter((d) => disponiveis.has(d)).slice(0, 6);
            const pos = ordem.indexOf(estado.ultima);
            return [...ativas.filter((d) => ordem.indexOf(d) > pos), ...ativas.filter((d) => ordem.indexOf(d) <= pos)];
        },
        avancar(disciplina) { estado.ultima = disciplina !== null && disciplina !== void 0 ? disciplina : null; },
    };
}
function limitePDF27(cfg) { return cfg.maisPDFull === false ? 1 : 2; }
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
const ehPdf = (t) => t === 'pf' || t === 'pp';
const indiceAula = (id) => { const p = id.split(':'); return +p[/^r[fq]$/.test(p[0]) ? 2 : 1]; };
const copiar = (x) => JSON.parse(JSON.stringify(x !== null && x !== void 0 ? x : {}));
/**
 * gerarPlanoBase do modelo. cfg.ordemAulas = fila de aulas; legprocs = metas na ordem do catálogo (id = id no plano).
 * fixos = {id: [data, horas]} — metas que não se movem. ancora = data a partir da qual o resto é distribuído.
 */
function gerarPlanoBase(cfg, AS, ordemAulas, legprocs, fixos, ancora) {
    var _a;
    const start = cfg.start;
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
    const restante = (i) => { var _a; return Math.max(30, minPdf(AS[i][3], cfg.vel) - (feitoParte[i] || 0) - (((_a = cfg.partesLidas) === null || _a === void 0 ? void 0 : _a[i]) || 0)); };
    let ultimaLeitura = start;
    let emCurso = null;
    const devidos = [];
    let ord = 0;
    const registrar = (i, dataPdf) => {
        const disc = AS[i][0];
        if (metas.fl && !exports.SEM_FLASH.has(disc) && !fixo('fl:' + i))
            devidos.push({ id: 'fl:' + i, due: proxSemConteudo(cfg, dataPdf, 1), tipo: 'fl', ord: ord++ });
        if (metas.qu && !fixo('qu:' + i))
            devidos.push({ id: 'qu:' + i, due: proxSemConteudo(cfg, dataPdf, 2), tipo: 'qu', ord: ord++ });
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
    const rodizioLP25 = criarRodizioLP25(cfg.discs, ultimaLP25);
    const porData = (a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.ord - b.ord);
    const lpMetas = mapaLP25;
    let fim = semA;
    for (let sem = semA; sem <= exports.MAX_SEM; sem++) {
        const ini = semInicio(start, sem), fimSem = dAdd(ini, 6);
        const diasSem = [0, 1, 2, 3, 4, 5, 6].map((d) => dAdd(ini, d)).filter((dt) => dt >= A && horasDia(cfg, dt) > 0);
        const semRev = ehRev(cfg, sem);
        const perfil = perfilSemana(cfg, sem);
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
            const m = exports.DUR[x.tipo];
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
                if (tipo === 'qu' && concentrado && dias.includes(concentrado) && livre(concentrado) >= exports.DUR.qu) {
                    por(concentrado, x.id, exports.DUR.qu);
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
                while (livre(dt) >= exports.DUR.lp) {
                    let k = -1;
                    const rodizio = rodizioLP25.ordenar(lpCarry.map((id) => { var _a; return (_a = meta(id)) === null || _a === void 0 ? void 0 : _a.disc; }));
                    for (const disc of rodizio) {
                        const primeiro = lpCarry.findIndex((id) => { var _a; return ((_a = meta(id)) === null || _a === void 0 ? void 0 : _a.disc) === disc; });
                        if (primeiro >= 0 && permitirLegproc25(lpCarry[primeiro], idsDia(), meta)) {
                            k = primeiro;
                            break;
                        }
                    }
                    if (k < 0)
                        break;
                    const id = lpCarry.splice(k, 1)[0], m = meta(id);
                    por(dt, id, exports.DUR.lp);
                    rodizioLP25.avancar(m.disc);
                    // Completa o primeiro bloco antes de procurar uma segunda disciplina.
                    const j = lpCarry.findIndex((x) => { var _a; return ((_a = meta(x)) === null || _a === void 0 ? void 0 : _a.disc) === m.disc; });
                    if (j >= 0 && livre(dt) >= exports.DUR.lp && permitirLegproc25(lpCarry[j], idsDia(), meta))
                        por(dt, lpCarry.splice(j, 1)[0], exports.DUR.lp);
                }
            }
        };
        /** Lê PDFULL em um dia: termina o que estiver em curso ou começa o próximo; o que não couber vira parte e continua depois. */
        const pdfsEm = (dt) => new Set(Object.entries(plano).filter(([id, [d]]) => d === dt && /^p[fp]:/.test(id)).map(([id]) => +id.split(':')[1]));
        const lerPdf = (dt, limite) => {
            var _a, _b, _c;
            if (dt < ultimaLeitura)
                return false;
            const candidato = (_a = emCurso === null || emCurso === void 0 ? void 0 : emCurso.i) !== null && _a !== void 0 ? _a : pdfQ[qi];
            if (candidato == null)
                return false;
            const datas = Object.entries(plano).filter(([id]) => /^p[fp]:/.test(id) && +id.split(':')[1] === candidato).map(([, v]) => v[0]);
            const resto = ((emCurso === null || emCurso === void 0 ? void 0 : emCurso.ultima) && emCurso.ultima < dt) || datas.some((d) => d < dt) || (((_b = cfg.paginasLidas) === null || _b === void 0 ? void 0 : _b[candidato]) || 0) > 0 || (((_c = cfg.partesLidas) === null || _c === void 0 ? void 0 : _c[candidato]) || 0) > 0;
            if (!resto && !pdfsEm(dt).has(candidato) && novosPDFDia27(plano, cfg, dt).size >= limitePDF27(cfg))
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
                        const dt = permitidos.find((d) => livre(d) >= exports.DUR[tipo]);
                        if (dt) {
                            por(dt, x.id, exports.DUR[tipo]);
                            tirar(x);
                        }
                    }
            }
        };
        if (semRev) {
            // Semana de revisão: sem aulas novas. Reserva Revisão + questões (1h30) por tema já estudado;
            // o tempo que sobrar recebe pendências e LegProc.
            const temas = Object.entries(plano).filter(([id, [d]]) => id.startsWith('pf:') && d < ini).length;
            const reserva = planoRevisao(diasSem.map((dt) => livre(dt)), temas, diasSem.map((dt) => dt === concentrado));
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
                    if (!lerPdf(dt, livre(dt)))
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
    const rodizioDomino25 = criarRodizioLP25(cfg.discs, anteriores.length ? ((_a = disciplinaMeta(anteriores[anteriores.length - 1][0])) !== null && _a !== void 0 ? _a : null) : null);
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
            if (!resto && !ix.pdfsHoje.has(i) && ix.novosHoje >= limitePDF27(cfg))
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
                const ideal = proxSemConteudo(cfg, plano[pai][0], x.t === 'fl' ? 1 : 2);
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
            if (!permitirLegproc25(x.id, ix.lpsHoje, lpDe))
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
        const ultimo = perfilSemana(cfg, semDe(cfg.start, d)).concentrado;
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
function remanejadasEfetivas(cfg, AS, fixos, base) {
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
        out[id] = { desde, minutos: minPdf(pags - +lida, cfg.vel), detalhe: { continuacao: true, pai: id, origem: id, paginaInicio: +lida + 1, paginaFim: pags, totalPaginas: pags } };
    }
    return out;
}
/**
 * Gera o plano (gerarPlano → gerarPlanoCatalogo → gerarPlanoBase [→ calcularDomino] do modelo).
 * AS = aulas; LP = metas de LegProc na ordem do catálogo; fixos = metas que não se movem; ancora = início da
 * redistribuição; ctx.ordem = ordem de distribuição das aulas; ctx.feitas = metas concluídas.
 */
function gerarPlano(cfg, AS, LP, fixos, ancora, ctx = {}) {
    var _a, _b;
    fixos = fixos || {};
    const feitas = new Set(ctx.feitas || []);
    const base = ancora && ancora > cfg.start ? ancora : cfg.start;
    const remanejadas = remanejadasEfetivas(cfg, AS, fixos, base);
    const c = { ...cfg, remanejadas };
    const lista = (LP || []).filter((x) => x && x.id);
    const ctxI = {
        AS, LP: lista, lpMap: new Map(lista.map((x) => [x.id, x])), lpPos: new Map(lista.map((x, k) => [x.id, k])),
        ordem: ctx.ordem && ctx.ordem.length ? ctx.ordem.filter((i) => AS[i]) : AS.map((_, i) => i), feitas, usados: new Set(ctx.usados || []),
    };
    // gerarPlanoCatalogo: fila de aulas sem o histórico prévio; metas remanejadas ficam presas na data pedida
    const anteriores = indicesAnteriores(c, AS);
    const ehAnterior = (id) => /^(pf|pp|fl|qu|rf|rq):/.test(id) && anteriores.has(indiceAula(id));
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
    const g = gerarPlanoBase(c, AS, ctxI.ordem.filter((i) => !anteriores.has(i)), lista, presos, ancora);
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
