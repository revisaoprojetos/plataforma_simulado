// Documento LegProc (Biblioteca, leitura em TEXTO): torna os entendimentos do STF e do STJ RECOLHÍVEIS,
// com a MESMA lib da Lei Seca do Desafio (lib/leitura/caixas.ts). Roda no CLIENTE (precisa de DOM) sobre o
// HTML rico antes de entregá-lo ao leitor (iframe). Só STF/STJ (sem a caixa "genérica" nem Atenção/Já cobrado).
// Os nós são apenas MOVIDOS (ordem de texto preservada) e o data-uid vai para a caixa → grifos seguem ancorados.
import { DEFAULT_BLOCOS } from './blocos'
import { prepararCaixasTabela, prepararCaixasParagrafo, prepararTabelasColapsaveis } from './caixas'

// título preto (como no documento original); a cor de fundo vem do próprio documento (corFiel)
const preto = (ids: string[]) => DEFAULT_BLOCOS.filter((b) => ids.includes(b.id)).map((b) => ({ ...b, corTitulo: '#111111' }))
const BLOCOS_LEGPROC = preto(['stf', 'stj'])                 // parágrafos "STF: …" / "STJ: …"
const BLOCOS_TABELA_LEGPROC = preto(['stf', 'stj', 'atencao', 'destaque']) // tabelas com título: STF/STJ, "NÃO ESQUEÇA!", e as demais com faixa de título (bloco genérico)

/** Marca (data-inc) o que o Revisão INCLUIU e some no modo "Inclusos Revisão" desligado: parágrafos "📌 Já cobrado em prova…".
 *  (Tabelas e caixas são escondidas por CSS.) Só atributo — o texto/ordem não mudam, então os grifos seguem ancorados. */
/** Marca (data-leg-doc) a TABELA DE LEGENDA do início do documento ("LEGENDA: AMARELO = núcleo…"): repete a barra de legendas do leitor. */
function marcarLegendaDoc(cont: HTMLElement) {
  const norm = (t: string) => t.replace(/^[\s\p{P}\p{S}]+/u, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  for (const t of Array.from(cont.querySelectorAll<HTMLElement>('table')).slice(0, 4)) { // só nas primeiras tabelas (fica no início)
    const txt = norm(t.textContent || '')
    if (txt.startsWith('legenda') && txt.includes('amarelo') && txt.includes('verde')) {
      let alvo: HTMLElement = t
      for (let up = alvo.parentElement?.closest<HTMLElement>('.caixa-colapsavel'); up; up = alvo.parentElement?.closest<HTMLElement>('.caixa-colapsavel')) alvo = up
      alvo.setAttribute('data-leg-doc', '1')
    }
  }
}

function marcarInclusos(cont: HTMLElement) {
  const norm = (t: string) => t.replace(/^[\s\p{P}\p{S}]+/u, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  for (const el of Array.from(cont.querySelectorAll<HTMLElement>('p, li'))) {
    if (el.closest('table') || el.closest('.caixa-colapsavel')) continue
    if (norm(el.textContent || '').startsWith('ja cobrado em prova')) el.setAttribute('data-inc', '1')
  }
}

export function prepararHtmlLegproc(html: string, opts?: { juris?: boolean }): string {
  if (typeof document === 'undefined' || !html) return html
  try {
    const cont = document.createElement('div')
    // Fora da tela mas CONECTADO ao documento: prepararCaixasParagrafo ignora nós `!isConnected`.
    cont.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;visibility:hidden;pointer-events:none'
    cont.innerHTML = html
    document.body.appendChild(cont)
    try {
      if (opts?.juris) {
        // MODELO DE JURISPRUDÊNCIA: nada de caixa recolhível. Tabelas (termos, entendimento…) ficam NORMAIS, com a cor fiel
        // do documento (o fundo já vem inline); a de transcrição de ARTIGO fica na metade direita (`tabela-artigo`).
        // As seções dos títulos viram áreas expansivas no servidor (titulos-expansivos.ts).
        for (const t of Array.from(cont.querySelectorAll<HTMLTableElement>('table'))) {
          const ini = (t.querySelector('td,th')?.textContent || '').replace(/\s+/g, ' ').trim()
          t.classList.add(/^[\s"“”'‘’]*arts?\b/i.test(ini) ? 'tabela-artigo' : 'tabela-fiel')
        }
        marcarInclusos(cont)
        marcarLegendaDoc(cont)
        return cont.innerHTML
      }
      prepararCaixasTabela(cont, BLOCOS_TABELA_LEGPROC, undefined, { generico: true, exigirFundo: false, corFiel: true })
      prepararCaixasParagrafo(cont, BLOCOS_LEGPROC)
      prepararTabelasColapsaveis(cont, { artigoNormal: !!opts?.juris }) // as tabelas que restarem (sem faixa de título) também recolhem/expandem
      // …e começam RECOLHIDAS (como as demais caixas): na leitura enxuta nada fica como "tabela normal" aberta
      for (const t of Array.from(cont.querySelectorAll<HTMLElement>('.tabela-colapsavel'))) {
        t.removeAttribute('data-aberto')
        t.querySelector('.caixa-cab')?.setAttribute('aria-expanded', 'false')
      }
      marcarInclusos(cont)
      marcarLegendaDoc(cont)
      return cont.innerHTML
    } finally { cont.remove() }
  } catch {
    return html // falhou → mostra o texto normal (nunca deixa o aluno sem leitura)
  }
}
