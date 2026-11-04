/* GERADO por scripts/build-motor28.mjs a partir de lib/cronograma/adaptativo/motor28.ts — NÃO editar à mão. */
(function () {
  var exports = {}; var module = { exports: exports };
"use strict";
/**
 * MOTOR DO CRONOGRAMA ADAPTATIVO — regras da versão 2.8 (doc "Cronograma_Adaptativo_2.8_Documentacao_TI").
 *
 * FONTE ÚNICA: este arquivo é usado no SERVIDOR (engine.ts → gerarPlano) e, compilado por
 * `pnpm --filter web cronograma:motor` (scripts/build-motor28.mjs), no IFRAME do aluno
 * (public/cronograma/adaptativo/motor28.js → window.Motor28). Sem imports: puro, determinístico.
 *
 * Regras (§ do documento 2.8):
 *  · Prioridade p/ ocupar as horas do dia: Revisão → continuidade de PDFull → PDFull novo → Questões →
 *    LegProc → 2º PDFull novo (só na sobra). Exibição (PDFull, Revisão, Questões, LegProc) é da UI. (§4)
 *  · Limite de PDFull NOVOS por dia: 1 (maisPDFull=false) ou 2; continuação não conta. (§3)
 *  · Histórico prévio ("Já estuda pelo Revisão?"): último tema inclusivo por disciplina fica FORA da
 *    nova programação (PDFull, partes, revisão e questões) — sem criar conclusões fictícias. (§3)
 *  · PDFull: max(30, teto(páginas ÷ ritmo × 2) × 30) min; 60 págs se não informado; aula longa vira
 *    partes (pp:i:k … pf:i) e a continuação vai ao PRÓXIMO dia disponível. (§4)
 *  · Revisão 1 semana de conteúdo depois (60 min) e Questões 2 semanas depois (30 min). (§6)
 *  · Até 18 h/semana (com +1 dia disponível): o ÚLTIMO dia concentra Questões e LegProc; PDFull e
 *    Revisão ficam preferencialmente nos demais. Atrasos de semanas anteriores podem ir a qualquer dia. (§6)
 *  · LegProc: metas de 30 min vinculadas à DISCIPLINA; por dia até 2 blocos (cada um até 2 metas
 *    consecutivas da MESMA lei/disciplina), de disciplinas diferentes, máx. 4 metas; rodízio com janela
 *    de até 6 disciplinas na ordem de cfg.discs. Disciplina não selecionada não fornece LegProc. (§5)
 *  · Semanas especiais de revisão: sem aula nova; reservam revisão+questões; sobra p/ pendências/LegProc. (§6)
 *  · Disponibilidade: horas pontuais da data > recesso (zera) > rotina vigente. (§8)
 *  · Sobras (meta interrompida não-PDFull: Revisão/Questões/LegProc): cfg.sobras[id] = minutos restantes
 *    → mesma meta (mesmo id: tempo/notas preservados), com prioridade no próximo dia disponível. (§7)
 *  · PDFull interrompido: cfg.paginasLidas[i] = última página concluída → o restante é recalculado. (§7)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIMITE_18H = exports.LP_JANELA = exports.LP_MAX_DIA = exports.DUR_REVISAO = exports.DUR = exports.VEL_PADRAO = exports.MAX_SEM = exports.SEM_FLASH = exports.VERSAO_MOTOR = void 0;
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
exports.planoRevisao = planoRevisao;
exports.indicesAnteriores = indicesAnteriores;
exports.gerarPlano = gerarPlano;
exports.saudePlano = saudePlano;
exports.VERSAO_MOTOR = '2.8';
exports.SEM_FLASH = new Set(['Direito Eleitoral', 'Direito Internacional', 'Direito Internacional Privado', 'Legislação de Ensino', 'Legislação da AGU']);
exports.MAX_SEM = 200;
exports.VEL_PADRAO = 17;
exports.DUR = { fl: 60, qu: 30, lp: 30 };
exports.DUR_REVISAO = { rf: 60, rq: 30 };
exports.LP_MAX_DIA = 4;
exports.LP_JANELA = 6;
exports.LIMITE_18H = 18;
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
    return recessoEm(cfg, d) ? 0 : (horasEm(cfg, d)[dDow(d)] || 0);
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
/** Semana de revisão: PDFlash/Flashcard (60) + questões (30) por tema, preenchendo as horas de cada dia. */
function planoRevisao(capDias, temas) {
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
/** Índices de AS declarados como estudados anteriormente (prefixo inclusivo por disciplina selecionada). */
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
/**
 * Gera o plano 2.8. fixos = {id: [data, horas]} — metas que NÃO se movem (concluídas, passadas, com
 * progresso registrado). ancora = data a partir da qual o resto é (re)distribuído.
 */
function gerarPlano(cfg, AS, LP, fixos, ancora) {
    const start = cfg.start;
    const A = ancora && ancora > start ? ancora : start;
    const ativas = new Set(cfg.discs || []);
    const metas = cfg.metas || {};
    const plano = {};
    const carga = {};
    for (const [id, v] of Object.entries(fixos || {})) {
        if (/^r[fqv]:/.test(id))
            continue;
        plano[id] = v;
        if (v[0] >= A)
            carga[v[0]] = (carga[v[0]] || 0) + Math.round(v[1] * 60);
    }
    const fixo = (id) => !!(fixos && fixos[id]);
    const algumDia = [cfg.horas, ...(cfg.rotinas || []).map((r) => r.horas)].some((h) => (h || []).some((x) => x > 0)) ||
        Object.values(cfg.horasPontuais || {}).some((x) => +x > 0);
    if (!algumDia)
        return { plano, fim: semDe(start, A) };
    const maxNovos = cfg.maisPDFull === false ? 1 : 2;
    const anteriores = indicesAnteriores(cfg, AS);
    const sobras = cfg.sobras || {};
    const lidas = cfg.paginasLidas || {};
    // ── fila de PDFull (ordem ativa do catálogo, só disciplinas selecionadas, fora o histórico prévio) ──
    const pdfQ = [];
    AS.forEach((a, i) => { if (ativas.has(a[0]) && !anteriores.has(i) && !fixo('pf:' + i))
        pdfQ.push(i); });
    let qi = 0;
    const feitoParte = {}, maxParte = {};
    for (const [id, v] of Object.entries(fixos || {}))
        if (id.startsWith('pp:')) {
            const [, i, k] = id.split(':');
            feitoParte[i] = (feitoParte[i] || 0) + Math.round(v[1] * 60);
            maxParte[i] = Math.max(maxParte[i] || 0, +k);
        }
    const restante = (i) => {
        const pags = +AS[i][3] || 0, lida = +lidas[i] || 0;
        if (lida > 0 && pags > lida)
            return Math.max(30, minPdf(pags - lida, cfg.vel));
        return Math.max(30, minPdf(pags, cfg.vel) - (feitoParte[i] || 0));
    };
    let emCurso = null;
    // aula que já tinha partes concluídas antes da âncora → é CONTINUAÇÃO (prioridade, não conta como nova)
    for (let p = 0; p < pdfQ.length && !emCurso; p++) {
        const i = pdfQ[p];
        if ((feitoParte[i] || 0) > 0 || (+lidas[i] || 0) > 0) {
            pdfQ.splice(p, 1);
            emCurso = { i, resta: restante(i), k: maxParte[i] || 0, ultima: dAdd(A, -1) };
        }
    }
    const devidos = [];
    let ord = 0;
    const registrar = (i, dataPdf) => {
        const disc = AS[i][0];
        if (metas.fl && !exports.SEM_FLASH.has(disc) && !fixo('fl:' + i))
            devidos.push({ id: 'fl:' + i, due: proxSemConteudo(cfg, dataPdf, 1), tipo: 'fl', ord: ord++ });
        if (metas.qu && !fixo('qu:' + i))
            devidos.push({ id: 'qu:' + i, due: proxSemConteudo(cfg, dataPdf, 2), tipo: 'qu', ord: ord++ });
    };
    AS.forEach((a, i) => { if (ativas.has(a[0]) && !anteriores.has(i) && fixos && fixos['pf:' + i])
        registrar(i, fixos['pf:' + i][0]); });
    const porData = (a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.ord - b.ord);
    // ── LegProc: fila por disciplina (selecionada) + rodízio com janela de 6 ──
    const ignorar = new Set(cfg.lpIgnorar || []);
    const lpPorDisc = new Map();
    if (metas.lp)
        for (const it of LP || []) {
            if (!it || !it.id || fixo(it.id) || ignorar.has(it.id))
                continue;
            if (it.disc && !ativas.has(it.disc))
                continue;
            const k = it.disc || '';
            const arr = lpPorDisc.get(k) || [];
            arr.push(it);
            lpPorDisc.set(k, arr);
        }
    const ordemDisc = [...(cfg.discs || []).filter((d) => lpPorDisc.has(d)), ...(lpPorDisc.has('') ? [''] : [])];
    const espera = ordemDisc.slice(exports.LP_JANELA);
    const janela = ordemDisc.slice(0, exports.LP_JANELA);
    let rr = 0;
    const lpPendente = () => janela.length > 0;
    const tirarDiscSeVazia = (d) => {
        if ((lpPorDisc.get(d) || []).length)
            return;
        const p = janela.indexOf(d);
        if (p < 0)
            return;
        janela.splice(p, 1);
        if (rr > p)
            rr--;
        const prox = espera.shift();
        if (prox != null)
            janela.push(prox);
        if (rr >= janela.length)
            rr = 0;
    };
    // ── sobras (Revisão/Questões/LegProc interrompidas): mesma meta, minutos restantes, 1º dia disponível ──
    const sobraFila = [];
    for (const [id, m] of Object.entries(sobras)) {
        if (fixo(id) || !(+m > 0))
            continue;
        const t = id.split(':')[0];
        if (t !== 'fl' && t !== 'qu' && t !== 'lp')
            continue;
        sobraFila.push({ id, min: Math.max(10, Math.round(+m)) });
        // tira da fila normal (não duplica)
        for (let k = devidos.length - 1; k >= 0; k--)
            if (devidos[k].id === id)
                devidos.splice(k, 1);
        for (const [d, arr] of lpPorDisc) {
            const p = arr.findIndex((x) => x.id === id);
            if (p >= 0) {
                arr.splice(p, 1);
                tirarDiscSeVazia(d);
            }
        }
    }
    let fim = semDe(start, A);
    const semA = semDe(start, A);
    for (let sem = semA; sem <= exports.MAX_SEM; sem++) {
        const ini = semInicio(start, sem), fimSem = dAdd(ini, 6);
        const diasSem = [0, 1, 2, 3, 4, 5, 6].map((d) => dAdd(ini, d)).filter((dt) => dt >= A && horasDia(cfg, dt) > 0);
        if (!diasSem.length) {
            if (qi >= pdfQ.length && !emCurso && !devidos.length && !lpPendente() && !sobraFila.length)
                break;
            continue;
        }
        const livre = (dt) => horasDia(cfg, dt) * 60 - (carga[dt] || 0);
        const por = (dt, id, m) => { plano[id] = [dt, m / 60]; carga[dt] = (carga[dt] || 0) + m; };
        const semRev = ehRev(cfg, sem);
        // §6: até 18 h na semana (rotina vigente) e +1 dia disponível → último dia concentra Questões + LegProc
        const hSem = horasEm(cfg, ini).reduce((a, b) => a + (+b || 0), 0);
        const diaConc = !semRev && hSem <= exports.LIMITE_18H && diasSem.length > 1 ? diasSem[diasSem.length - 1] : null;
        if (semRev) {
            const temas = Object.entries(plano).filter(([id, [d]]) => id.startsWith('pf:') && d < ini).length;
            const reserva = planoRevisao(diasSem.map((dt) => Math.max(0, livre(dt))), temas);
            diasSem.forEach((dt, k) => { if (reserva[k].usado)
                carga[dt] = (carga[dt] || 0) + reserva[k].usado; });
        }
        const colocarDevidos = (dt, tipo, filtro) => {
            for (const x of devidos.filter((y) => y.tipo === tipo && y.due <= dt && (!filtro || filtro(y))).sort(porData)) {
                const m = exports.DUR[tipo];
                if (livre(dt) < m)
                    break;
                por(dt, x.id, m);
                devidos.splice(devidos.indexOf(x), 1);
            }
        };
        // PDFull: continuação OU aula nova (limite de novas por dia)
        const pdf = (dt, estado, permitirNova) => {
            if (semRev)
                return false;
            if (emCurso) {
                if (emCurso.ultima >= dt)
                    return false; // a continuação nunca no mesmo dia (nem antes) da parte que a originou
                const m = Math.min(emCurso.resta, Math.floor(livre(dt) / 30) * 30);
                if (m < 30)
                    return false;
                const { i } = emCurso;
                if (m >= emCurso.resta) {
                    if (metas.pf !== false)
                        por(dt, 'pf:' + i, m);
                    registrar(i, dt);
                    emCurso = null;
                }
                else {
                    if (metas.pf !== false)
                        por(dt, `pp:${i}:${++emCurso.k}`, m);
                    emCurso.resta -= m;
                    emCurso.ultima = dt;
                }
                return true;
            }
            if (!permitirNova || estado.novos >= maxNovos || qi >= pdfQ.length)
                return false;
            const i = pdfQ[qi], rest = restante(i);
            const m = Math.min(rest, Math.floor(livre(dt) / 30) * 30);
            if (m < 30)
                return false;
            qi++;
            estado.novos++;
            if (m >= rest) {
                if (metas.pf !== false)
                    por(dt, 'pf:' + i, m);
                registrar(i, dt);
            }
            else {
                const k = (maxParte[i] || 0) + 1;
                if (metas.pf !== false)
                    por(dt, `pp:${i}:${k}`, m);
                emCurso = { i, resta: rest - m, k, ultima: dt };
            }
            return true;
        };
        // LegProc do dia: até 2 blocos (≤2 metas da mesma lei cada) de disciplinas diferentes, máx. 4 metas
        const legproc = (dt) => {
            if (!lpPendente())
                return;
            let feitas = 0;
            const usadas = new Set();
            for (let bloco = 0; bloco < 2 && janela.length; bloco++) {
                let disc = null;
                for (let t = 0; t < janela.length; t++) {
                    const d = janela[(rr + t) % janela.length];
                    if (!usadas.has(d)) {
                        disc = d;
                        rr = (rr + t) % janela.length;
                        break;
                    }
                }
                if (disc == null)
                    break;
                const fila = lpPorDisc.get(disc) || [];
                if (!fila.length) {
                    tirarDiscSeVazia(disc);
                    continue;
                }
                const primeira = fila[0];
                let n = 0;
                while (n < 2 && feitas < exports.LP_MAX_DIA && fila.length && fila[0].lei === primeira.lei) {
                    const it = fila[0], m = it.min || exports.DUR.lp;
                    if (livre(dt) < m)
                        break;
                    por(dt, it.id, m);
                    fila.shift();
                    n++;
                    feitas++;
                }
                if (!n)
                    break; // sem espaço p/ o bloco: encerra o LegProc do dia
                usadas.add(disc);
                rr = (rr + 1) % Math.max(1, janela.length);
                tirarDiscSeVazia(disc);
            }
        };
        for (const dt of diasSem) {
            const est = { novos: 0 };
            // 0) sobras de metas interrompidas: prioridade máxima no 1º dia disponível
            for (let k = 0; k < sobraFila.length;) {
                const s = sobraFila[k];
                if (livre(dt) >= s.min) {
                    por(dt, s.id, s.min);
                    sobraFila.splice(k, 1);
                    const t = s.id.split(':')[0];
                    if (t === 'fl' || t === 'qu') { /* revisão/questões remanescentes já não estão em `devidos` */ }
                }
                else
                    k++;
            }
            const atrasoDeAntes = (x) => x.due < ini; // transbordo de semanas anteriores: vai a qualquer dia
            if (semRev) {
                colocarDevidos(dt, 'fl');
                colocarDevidos(dt, 'qu');
                legproc(dt);
                continue;
            }
            if (diaConc && dt === diaConc) {
                // dia de concentração (≤18h): Questões + LegProc; Revisão/PDFull só na sobra
                colocarDevidos(dt, 'qu');
                legproc(dt);
                colocarDevidos(dt, 'fl');
                pdf(dt, est, true);
                pdf(dt, est, true);
                continue;
            }
            const restrito = !!diaConc;
            colocarDevidos(dt, 'fl'); // 1) Revisão
            pdf(dt, est, false); // 2) continuidade de PDFull já assumida
            pdf(dt, est, true); // 3) PDFull novo (1º)
            colocarDevidos(dt, 'qu', restrito ? atrasoDeAntes : undefined); // 4) Questões
            if (!restrito)
                legproc(dt); // 5) LegProc
            if (maxNovos > 1)
                pdf(dt, est, true); // 6) 2º PDFull novo, só na sobra
        }
        if (diasSem.some((dt) => carga[dt]))
            fim = sem;
        if (qi >= pdfQ.length && !emCurso && !devidos.length && !lpPendente() && !sobraFila.length && sem >= semDe(start, A)) {
            // ainda pode haver revisões devidas além do horizonte? já foram todas colocadas (devidos vazio) → fim
            break;
        }
    }
    return { plano, fim };
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
