'use client'

import { useState } from 'react'
import { X, GraduationCap, MessageSquare, Award } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CorrecaoFolha, type Marca } from '@/components/admin/correcao-folha'

const nfmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const COR_NOME: Record<string, string> = {
  '#e11d48': 'Vermelho', '#2563eb': 'Azul', '#16a34a': 'Verde', '#d97706': 'Âmbar',
  '#7c3aed': 'Roxo', '#0891b2': 'Ciano', '#db2777': 'Rosa', '#65a30d': 'Lima', '#64748b': 'Cinza',
}
const corNome = (c?: string | null) => COR_NOME[(c || '').toLowerCase()] ?? 'Marca'

export interface QuesitoDev { codigo: string; qi: number; respostaId: string; nome: string; nota: number | null; pontos: number; conceito: string; mensagem: string }
export interface QuestaoDev { numero: number; respostaId: string; paginas: { arquivoId: string; url: string }[] }

/** Devolutiva do ALUNO (somente leitura): folha com as marcas + comentários + nota + mensagem. */
export function DevolutivaAluno({ aluno, tentativa, simuladoTitulo, questoes, quesitos, marcasPorResp, notaTotal, maxTotal, onFechar }: {
  aluno: string; tentativa: number | null; simuladoTitulo: string
  questoes: QuestaoDev[]; quesitos: QuesitoDev[]
  marcasPorResp: Record<string, Marca[]>
  notaTotal: number; maxTotal: number; onFechar: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background">
      {/* barra superior */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card px-4 py-3 shadow-sm">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">Devolutiva — {aluno}{tentativa != null && ` · Tentativa ${tentativa}`}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{simuladoTitulo} · como o aluno vê no portal</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-baseline gap-1 rounded-lg border bg-emerald-50/60 px-3 py-1 dark:bg-emerald-900/15">
            <Award className="mr-1 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{nfmt(notaTotal)}</span>
            <span className="text-xs text-muted-foreground">/ {nfmt(maxTotal)}</span>
          </div>
          <button type="button" onClick={onFechar} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"><X className="h-4 w-4" /> Fechar</button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6">
        {questoes.map((q) => {
          const qs = quesitos.filter((x) => x.respostaId === q.respostaId)
          const marcas = marcasPorResp[q.respostaId] ?? []
          return (
            <section key={q.respostaId} className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">Questão {q.numero}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{qs.reduce((s, x) => s + (Number(x.nota) || 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} / {qs.reduce((s, x) => s + x.pontos, 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pts</span>
              </h2>

              {q.paginas.length ? (
                <FolhaAluno paginas={q.paginas} marcas={marcas} />
              ) : (
                <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">Sem imagem enviada nesta questão.</p>
              )}

              {/* nota + mensagem por quesito */}
              <div className="space-y-2">
                {qs.map((x) => (
                  <div key={x.codigo} className="rounded-xl border bg-card p-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{x.nome}</span>
                      {x.conceito && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{x.conceito}</span>}
                      <span className="ml-auto text-sm font-bold tabular-nums">{nfmt(Number(x.nota) || 0)} <span className="text-xs font-normal text-muted-foreground">/ {nfmt(x.pontos)}</span></span>
                    </div>
                    {x.mensagem?.trim() && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/40 p-2.5 text-sm leading-relaxed"><MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {x.mensagem}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
        {questoes.length === 0 && <p className="text-center text-sm text-muted-foreground">Nada a exibir.</p>}
      </div>
    </div>
  )
}

/** Folha somente leitura + lista de comentários das marcas (clicar centraliza a marca). */
function FolhaAluno({ paginas, marcas }: { paginas: { arquivoId: string; url: string }[]; marcas: Marca[] }) {
  const [pg, setPg] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [focoId, setFocoId] = useState<string | null>(null)
  const [focoKey, setFocoKey] = useState(0)
  const foca = (id: string | null) => { setSel(id); if (id) { setFocoId(id); setFocoKey((k) => k + 1) } }
  const comentadas = marcas.filter((m) => m.comentario?.trim())
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
      <div className="h-[62vh] overflow-hidden rounded-xl border bg-muted/20 p-2">
        <CorrecaoFolha paginas={paginas} marcas={marcas} paginaIndex={pg} onPagina={setPg}
          ferramenta="selecionar" corAtiva="#64748b" iconeAtivo="check" selecionadaId={sel} onSelecionar={foca}
          onCriar={() => {}} onAtualizar={() => {}} focoId={focoId} focoKey={focoKey} somenteLeitura />
      </div>
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" /> Comentários do corretor</p>
        {comentadas.length === 0 && <p className="rounded-lg border border-dashed bg-muted/20 p-2 text-[11px] text-muted-foreground">Sem comentários nas marcações.</p>}
        {comentadas.map((m) => (
          <button key={m.id} type="button" onClick={() => foca(m.id)}
            className={cn('block w-full rounded-lg border p-2 text-left transition-colors', m.id === sel ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50')}>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-full border border-white shadow" style={{ background: m.cor || '#64748b' }} />
              <span className="text-xs font-medium">{corNome(m.cor)} {m.ordem}</span>
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-foreground/90">{m.comentario}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
