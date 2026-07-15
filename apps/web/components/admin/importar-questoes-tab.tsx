'use client'

import { Fragment, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FileUp, Download, Loader2, Check, AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { analisarQuestoesImport, confirmarImportQuestoes } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'

// Colunas do modelo de importação (a ordem é a do modelo baixado).
const COLUNAS = [
  'Número', 'Enunciado', 'Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D', 'Alternativa E',
  'Alternativa Correta', 'Alternativas Incorretas', 'Grupo', 'Disciplina', 'Categoria', 'Assunto Principal',
  'Assunto Detalhe', 'Nível', 'Tipo', 'Pilar 1', 'Pilar 2',
  'Lei A', 'Comentário A', 'Lei B', 'Comentário B', 'Lei C', 'Comentário C', 'Lei D', 'Comentário D', 'Lei E', 'Comentário E',
  'Ano', 'Banca', 'Órgão', 'Cargo',
] as const

const EXEMPLO: Record<string, string> = {
  'Número': '1', 'Enunciado': 'Qual é a capital do Brasil?',
  'Alternativa A': 'São Paulo', 'Alternativa B': 'Rio de Janeiro', 'Alternativa C': 'Brasília', 'Alternativa D': 'Salvador', 'Alternativa E': 'Recife',
  'Alternativa Correta': 'C', 'Alternativas Incorretas': 'A, B, D, E',
  'Grupo': 'Conhecimentos Gerais', 'Disciplina': 'Geografia', 'Categoria': 'Geografia do Brasil',
  'Assunto Principal': 'Capitais', 'Assunto Detalhe': 'Capital federal', 'Nível': 'facil', 'Tipo': 'objetiva',
  'Pilar 1': 'Território', 'Pilar 2': 'Federação',
  'Lei C': 'CF, art. 18', 'Comentário C': 'Brasília é a capital federal.',
  'Ano': '2024', 'Banca': 'CESPE', 'Órgão': 'INSS', 'Cargo': 'Analista',
}

// Breve explicação de cada coluna (aba "Instruções" do modelo).
const INSTRUCOES: [string, string][] = [
  ['Número', 'Número/ordem da questão (opcional).'],
  ['Enunciado', 'O texto da pergunta. Obrigatório.'],
  ['Alternativa A–E', 'As opções de resposta. Deixe em branco as que não usar.'],
  ['Alternativa Correta', 'A letra da resposta certa (A, B, C, D ou E) — ou "Certo"/"Errado" nas questões Certo/Errado.'],
  ['Alternativas Incorretas', 'Letras das erradas (opcional; apenas informativo — a correta já define as demais).'],
  ['Grupo · Categoria · Assunto Detalhe · Pilar 1 · Pilar 2', 'Classificações livres da questão.'],
  ['Disciplina · Assunto Principal · Banca · Órgão · Cargo', 'São criados automaticamente no sistema se ainda não existirem.'],
  ['Nível', 'facil, medio ou dificil.'],
  ['Tipo', 'objetiva (múltipla escolha) ou Certo/Errado.'],
  ['Questões Certo/Errado', 'Ponha Tipo = Certo/Errado. Opção (a): A = Certo, B = Errado e marque a correta. Opção (b): deixe A–E em branco e informe só a Alternativa Correta como "Certo" ou "Errado" — o sistema cria as 2 opções.'],
  ['Ano', 'Ano da prova/questão (ex.: 2024). Usado nos filtros e relatórios.'],
  ['Lei A–E · Comentário A–E', 'Fundamentação legal e comentário de cada alternativa (opcional).'],
]

const COR_HEADER = 'FF5B21B6'
const BORDA = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } }
const bordas = { top: BORDA, left: BORDA, bottom: BORDA, right: BORDA }

function baixarBlob(blob: Blob, nome: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(a.href)
}

/** Gera um .xlsx formatado (cabeçalho estilizado, larguras, filtro, listas e aba de instruções). */
async function baixarModelo() {
  try {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()

    const ws = wb.addWorksheet('Questões', { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.addRow([...COLUNAS])
    ws.addRow(COLUNAS.map((c) => EXEMPLO[c] ?? ''))

    const head = ws.getRow(1)
    head.height = 30
    head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER } }; c.border = bordas })

    const ex = ws.getRow(2)
    ex.font = { italic: true, color: { argb: 'FF6B7280' } }
    ex.alignment = { vertical: 'top', wrapText: true }
    ex.eachCell((c) => { c.border = bordas })

    ws.columns.forEach((col, i) => {
      const c = COLUNAS[i]
      const exLen = (EXEMPLO[c] ?? '').length
      col.width = c === 'Enunciado' ? 42 : Math.min(Math.max(c.length + 3, exLen + 2, 12), 30)
    })
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } }

    // Listas suspensas úteis (linhas 2–300).
    const idx = (n: string) => COLUNAS.indexOf(n as (typeof COLUNAS)[number]) + 1
    const lista = (nome: string, opcoes: string) => {
      const ci = idx(nome); if (ci < 1) return
      for (let r = 2; r <= 300; r++) ws.getCell(r, ci).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${opcoes}"`] }
    }
    lista('Nível', 'facil,medio,dificil')
    lista('Alternativa Correta', 'A,B,C,D,E,Certo,Errado')
    lista('Tipo', 'objetiva,Certo/Errado')

    // Aba de instruções.
    const wi = wb.addWorksheet('Instruções')
    wi.columns = [{ width: 42 }, { width: 90 }]
    const h = wi.addRow(['Coluna', 'O que preencher'])
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER } }; c.border = bordas })
    for (const [a, b] of INSTRUCOES) {
      const row = wi.addRow([a, b])
      row.getCell(1).font = { bold: true }
      row.alignment = { vertical: 'top', wrapText: true }
      row.eachCell((c) => { c.border = bordas })
    }

    const buf = await wb.xlsx.writeBuffer()
    baixarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'modelo-importacao-questoes.xlsx')
  } catch (e) {
    console.error(e)
    toast.error('Não foi possível gerar o modelo.')
  }
}

type Resumo = { total: number; novas: number; jaExistem: number; comErro: number }

export function ImportarQuestoesTab({ bancoId = null, onDone }: { bancoId?: string | null; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [questoes, setQuestoes] = useState<QuestaoImport[] | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [analisando, startAnalise] = useTransition()
  const [salvando, startSalvar] = useTransition()
  const [baixandoModelo, setBaixandoModelo] = useState(false)

  async function onBaixarModelo() {
    if (baixandoModelo) return
    setBaixandoModelo(true)
    try { await baixarModelo() } finally { setBaixandoModelo(false) }
  }

  function onFile(f: File | null) {
    setQuestoes(null); setResumo(null)
    if (!f) { setNomeArquivo(''); return }
    setNomeArquivo(f.name)
    const fd = new FormData(); fd.set('arquivo', f)
    startAnalise(async () => {
      const r = await analisarQuestoesImport(fd)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao ler o arquivo'); setNomeArquivo(''); return }
      setQuestoes(r.questoes ?? []); setResumo(r.resumo ?? null)
    })
  }

  function confirmar() {
    if (!questoes) return
    startSalvar(async () => {
      const r = await confirmarImportQuestoes(bancoId, questoes)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao importar'); return }
      toast.success(bancoId
        ? `${r.criadas ?? 0} questão(ões) criada(s) e ${r.vinculadas ?? 0} vinculada(s) ao banco`
        : `${r.criadas ?? 0} questão(ões) criada(s) no sistema`)
      if (r.jaExistiam) toast.message(`${r.jaExistiam} já existia(m) no sistema — não duplicada(s).`)
      onDone()
      window.location.assign(bancoId ? `/admin/banco-questoes/${bancoId}?tab=questoes` : '/admin/questoes')
    })
  }

  const podeImportar = !!resumo && resumo.novas + resumo.jaExistem > 0
  const LETRAS = ['A', 'B', 'C', 'D', 'E']
  const gabaritoDe = (q: QuestaoImport) => {
    const a = q.alternativas.find((x) => x.correta)
    return a ? (LETRAS[a.ordem] ?? '—') : '—'
  }
  const [aberto, setAberto] = useState<Set<number>>(new Set())
  const toggle = (i: number) => setAberto((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n })
  // Quantidade de alternativas com lei ou comentário (para o badge de "comentários").
  const numComentarios = (q: QuestaoImport) => q.alternativas.filter((a) => a.lei || a.comentario).length + (q.comentario_professor ? 1 : 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input ref={inputRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />

      {!questoes ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={analisando}
            className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60">
            {analisando ? <Loader2 className="h-8 w-8 animate-spin" /> : <FileUp className="h-8 w-8" />}
            <span className="text-sm font-medium">{analisando ? 'Lendo arquivo…' : nomeArquivo || 'Selecionar arquivo (.csv, .txt, .xlsx)'}</span>
            <span className="text-xs">Uma questão por linha, com cabeçalho na 1ª linha.</span>
          </button>
          <button type="button" onClick={onBaixarModelo} disabled={baixandoModelo} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-60">
            {baixandoModelo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar modelo (.xlsx)
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-6 pb-1 pt-3 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> {resumo?.novas ?? 0} nova(s)</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">{resumo?.jaExistem ?? 0} já existe(m)</span>
            {(resumo?.comErro ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-600 dark:text-rose-400"><AlertTriangle className="h-3 w-3" /> {resumo?.comErro} com erro</span>}
            <button type="button" onClick={() => inputRef.current?.click()} className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /> Trocar arquivo</button>
          </div>
          <p className="px-6 pb-1 text-[11px] text-muted-foreground">← arraste para o lado para ver todas as especificações → · clique numa questão para ver as leis e comentários de cada alternativa</p>

          {/* Rolagem horizontal: a coluna "Situação" fica fixa e colada na lateral (sem padding). */}
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-max min-w-full caption-bottom text-sm">
              <thead className="sticky top-0 z-20 bg-background">
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="sticky left-0 z-30 border-r bg-background py-2 pl-6 pr-3 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Nº</th>
                  <th className="px-3 py-2 font-medium">Questão</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Formato</th>
                  <th className="px-3 py-2 text-center font-medium">Gab.</th>
                  <th className="px-3 py-2 text-center font-medium">Coment.</th>
                  <th className="px-3 py-2 font-medium">Disciplina</th>
                  <th className="px-3 py-2 font-medium">Assunto</th>
                  <th className="px-3 py-2 font-medium">Assunto detalhe</th>
                  <th className="px-3 py-2 font-medium">Categoria</th>
                  <th className="px-3 py-2 font-medium">Grupo</th>
                  <th className="px-3 py-2 font-medium">Nível</th>
                  <th className="px-3 py-2 font-medium">Banca</th>
                  <th className="px-3 py-2 font-medium">Órgão</th>
                  <th className="px-3 py-2 font-medium">Cargo</th>
                  <th className="px-3 py-2 font-medium">Ano</th>
                  <th className="px-3 py-2 font-medium">Pilar 1</th>
                  <th className="px-3 py-2 font-medium">Pilar 2</th>
                </tr>
              </thead>
              <tbody>
                {questoes.map((q, i) => {
                  const enun = q.enunciado.length > 130 ? q.enunciado.slice(0, 130) + '…' : q.enunciado
                  const traco = <span className="text-muted-foreground">—</span>
                  const nComent = numComentarios(q)
                  const open = aberto.has(i)
                  return (
                    <Fragment key={i}>
                      <tr onClick={() => toggle(i)} className={cn('cursor-pointer border-b align-top hover:bg-muted/40', q.erro && 'bg-rose-500/5')}>
                        <td className="sticky left-0 z-10 border-r bg-background py-2 pl-6 pr-3">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                            {q.erro ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400" title={q.erro}><AlertTriangle className="h-3 w-3" /> Erro</span>
                            ) : q.jaExiste ? (
                              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Já existe</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" /> Nova</span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{q.numero || traco}</td>
                        <td className="min-w-[260px] max-w-[380px] px-3 py-2 leading-relaxed">
                          {enun || <span className="text-muted-foreground">(sem enunciado)</span>}
                          {q.erro && <span className="mt-0.5 block text-xs text-rose-600 dark:text-rose-400">{q.erro}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs capitalize text-muted-foreground">{q.tipo}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{q.formato === 'certo_errado' ? 'Certo/Errado' : 'Múltipla'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-xs font-semibold">{gabaritoDe(q)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-xs">
                          {nComent > 0
                            ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{nComent}</span>
                            : traco}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          {q.disciplina ? <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase text-primary">{q.disciplina}</span> : traco}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.assunto || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.assunto_detalhe || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.categoria || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.grupo || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs capitalize">{q.nivel_dificuldade || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.banca || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.orgao || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.cargo || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.ano ?? traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.pilar_1 || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.pilar_2 || traco}</td>
                      </tr>
                      {open && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={19} className="p-0">
                            {/* Fica preso à esquerda para permanecer visível ao rolar as colunas. */}
                            <div className="sticky left-0 max-w-[760px] space-y-2 px-6 py-3 text-xs">
                              <p className="font-semibold">
                                Gabarito: <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">{gabaritoDe(q)}</span>
                                <span className="ml-2 font-normal text-muted-foreground">· {q.alternativas.length} alternativa(s)</span>
                              </p>
                              {q.alternativas.length === 0 && <p className="text-muted-foreground">Sem alternativas.</p>}
                              {q.alternativas.map((a) => (
                                <div key={a.ordem} className="rounded-md border bg-background p-2">
                                  <p className={cn('font-semibold', a.correta && 'text-emerald-600 dark:text-emerald-400')}>
                                    {LETRAS[a.ordem] ?? '?'}){a.correta ? ' ✓ correta' : ''} <span className="font-normal text-foreground">{a.texto}</span>
                                  </p>
                                  {a.lei && <p className="mt-1 text-muted-foreground"><span className="font-semibold text-foreground">Lei:</span> {a.lei}</p>}
                                  {a.comentario && <p className="mt-0.5 whitespace-pre-line text-muted-foreground"><span className="font-semibold text-foreground">Comentário:</span> {a.comentario}</p>}
                                </div>
                              ))}
                              {q.comentario_professor && (
                                <div className="rounded-md border bg-background p-2">
                                  <span className="font-semibold">Comentário do professor:</span>{' '}
                                  <span className="whitespace-pre-line text-muted-foreground">{q.comentario_professor}</span>
                                </div>
                              )}
                              {nComent === 0 && <p className="text-muted-foreground">Esta questão não tem leis nem comentários.</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
        <span className="text-sm text-muted-foreground">
          {resumo ? `${resumo.novas} nova(s) · ${resumo.jaExistem} já existe(m) · ${resumo.comErro} com erro (ignorada[s])` : 'Envie um arquivo para ver a relação de questões.'}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!podeImportar || salvando}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Importar
          </Button>
        </div>
      </div>
    </div>
  )
}
