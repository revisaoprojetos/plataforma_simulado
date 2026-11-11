'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { PaginacaoBib } from '../biblioteca/paginacao-bib'
import {
  alterarDisciplinasLoteCronograma, carregarVersaoCronograma, excluirSprintsLoteCronograma, removerDisciplinasLoteCronograma, statusSprintsLoteCronograma,
} from './actions'
import type { CampoDisc } from '@/lib/revisao/cronograma-schema'

// Tabela das abas do Cronograma: MESMO casco, densidade, seleção, barra de ações em massa e rodapé de paginação (PaginacaoBib) da Biblioteca.
// A página (server) entrega linhas/cabeçalhos prontos; busca, filtro, ordenação e página continuam por query string (resolvidos no servidor).

export type TipoTabelaCron = 'cobertura' | 'disciplinas' | 'sprints' | 'versoes' | 'leitura'
export interface LinhaCron { id: string; /** valor usado pela ação em massa (ex.: nome da disciplina da aula) */ valor?: string; cells: ReactNode[]; fraca?: boolean }

const PP = [10, 14, 25, 50, 100]

export function TabelaCron({ tipo, head, rows, total, page, pp, podeEditar, colunas, vazio }: {
  tipo: TipoTabelaCron; head: ReactNode; rows: LinhaCron[]; total: number; page: number; pp: number; podeEditar: boolean; colunas: number; vazio: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [navegando, nav] = useTransition()
  const [executando, executar] = useTransition()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const selecionavel = tipo !== 'leitura'
  const todos = rows.length > 0 && rows.every((r) => sel.has(r.id))
  // Ao paginar a seleção continua: guardamos também os valores das linhas já marcadas.
  const [memo, setMemo] = useState<Map<string, string>>(new Map())
  const alvo = [...new Set([...sel].map((id) => memo.get(id) ?? id))]

  function ir(mudar: Record<string, string | undefined>) {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(mudar)) { if (v) q.set(k, v); else q.delete(k) }
    nav(() => { router.push(`${pathname}?${q.toString()}`) })
  }
  function marcar(r: LinhaCron, v: boolean) {
    setSel((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n })
    setMemo((m) => { const n = new Map(m); if (v) n.set(r.id, r.valor ?? r.id); else n.delete(r.id); return n })
  }
  function marcarPagina(v: boolean) {
    setSel((s) => { const n = new Set(s); for (const r of rows) { if (v) n.add(r.id); else n.delete(r.id) } return n })
    setMemo((m) => { const n = new Map(m); for (const r of rows) { if (v) n.set(r.id, r.valor ?? r.id); else n.delete(r.id) } return n })
  }
  const limpar = () => { setSel(new Set()); setMemo(new Map()) }
  function rodar(fn: () => Promise<{ ok: boolean; error?: string; n?: number }>, ok: (n?: number) => string) {
    executar(async () => {
      const r = await fn()
      if (r.ok) { toast.success(ok(r.n)); limpar(); router.refresh() } else toast.error(r.error ?? 'Falha ao executar.')
    })
  }
  const disc = (campo: CampoDisc, v: boolean, rot: string) => () =>
    rodar(() => alterarDisciplinasLoteCronograma(alvo, campo, v), (n) => `${rot} em ${n ?? alvo.length} disciplina(s)`)

  return (
    <>
      <section className={cn('rounded-2xl border bg-card p-2 shadow-sm transition-opacity', (navegando || executando) && 'opacity-70')} aria-busy={navegando}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {selecionavel && (
                  <th className="w-9 px-3 py-2.5">
                    <input type="checkbox" aria-label="Selecionar todos desta página" checked={todos} onChange={(e) => marcarPagina(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" />
                  </th>
                )}
                {head}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={colunas + (selecionavel ? 1 : 0)} className="px-3 py-10 text-center text-muted-foreground">{vazio}</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className={cn('border-b last:border-0 hover:bg-muted/40', sel.has(r.id) && 'bg-primary/5', r.fraca && 'opacity-60')}>
                  {selecionavel && (
                    <td className="px-3 py-1.5"><input type="checkbox" aria-label="Selecionar linha" checked={sel.has(r.id)} onChange={(e) => marcar(r, e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></td>
                  )}
                  {r.cells.map((c, i) => <td key={i} className="px-3 py-1.5 align-middle">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PaginacaoBib total={total} page={page} pp={pp} opcoesPP={PP} selecionados={sel.size} carregando={navegando}
        onPage={(p) => ir({ pag: p > 1 ? String(p) : undefined })} onPP={(n) => ir({ pps: String(n), pag: undefined })} />

      {podeEditar && selecionavel && sel.size > 0 && createPortal(
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em massa">
          <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionado' : 'selecionados'}</b>

          {tipo === 'cobertura' && (
            <>
              <span className="text-xs text-muted-foreground">{alvo.length} disciplina(s)</span>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdflash', true, 'PDFlash ligado')}><Eye />PDFlash: exigir</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdflash', false, 'PDFlash desligado')}><EyeOff />PDFlash: dispensar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdfight', true, 'PDFight ligado')}><Eye />PDFight: exigir</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdfight', false, 'PDFight desligado')}><EyeOff />PDFight: dispensar</Button>
              <Button size="sm" variant="destructive" disabled={executando} onClick={async () => {
                if (await confirmar({ titulo: 'Tirar do cronograma', mensagem: `Tirar ${alvo.length} disciplina(s) do cronograma? As aulas ficam guardadas e voltam ao ligar “No cronograma” na aba Disciplinas.`, confirmar: 'Tirar', destrutivo: true })) disc('ativa', false, 'Retiradas do cronograma')()
              }}><Trash2 />Tirar do cronograma</Button>
            </>
          )}

          {tipo === 'disciplinas' && (
            <>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('ativa', true, 'Incluídas no cronograma')}><Eye />No cronograma: ligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('ativa', false, 'Retiradas do cronograma')}><EyeOff />No cronograma: desligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdflash', true, 'PDFlash ligado')}>PDFlash: ligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdflash', false, 'PDFlash desligado')}>PDFlash: desligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdfight', true, 'PDFight ligado')}>PDFight: ligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdfight', false, 'PDFight desligado')}>PDFight: desligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdfull', true, 'PDFull ligado')}>PDFull: ligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('pdfull', false, 'PDFull desligado')}>PDFull: desligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('juris', true, 'Juris ligado')}>Juris: ligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('juris', false, 'Juris desligado')}>Juris: desligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('legproc', true, 'LegProc ligado')}>LegProc: ligar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={disc('legproc', false, 'LegProc desligado')}>LegProc: desligar</Button>
              <Button size="sm" variant="destructive" disabled={executando} onClick={async () => {
                if (await confirmar({ titulo: 'Remover disciplinas', mensagem: `Remover as disciplinas criadas aqui entre as ${alvo.length} selecionadas? As do catálogo não são removidas.`, confirmar: 'Remover', destrutivo: true }))
                  rodar(() => removerDisciplinasLoteCronograma(alvo), (n) => `${n ?? 0} disciplina(s) removida(s)`)
              }}><Trash2 />Remover</Button>
            </>
          )}

          {tipo === 'sprints' && (
            <>
              <Button size="sm" variant="outline" disabled={executando} onClick={() => rodar(() => statusSprintsLoteCronograma(alvo, 'ativo'), (n) => `${n ?? 0} sprint(s) ativado(s)`)}>Ativar</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={() => rodar(() => statusSprintsLoteCronograma(alvo, 'rascunho'), (n) => `${n ?? 0} sprint(s) em rascunho`)}>Voltar a rascunho</Button>
              <Button size="sm" variant="outline" disabled={executando} onClick={() => rodar(() => statusSprintsLoteCronograma(alvo, 'encerrado'), (n) => `${n ?? 0} sprint(s) encerrado(s)`)}>Encerrar</Button>
              <Button size="sm" variant="destructive" disabled={executando} onClick={async () => {
                if (await confirmar({ titulo: 'Excluir sprints', mensagem: `Excluir ${alvo.length} sprint(s)?`, confirmar: 'Excluir', destrutivo: true }))
                  rodar(() => excluirSprintsLoteCronograma(alvo), (n) => `${n ?? 0} sprint(s) excluído(s)`)
              }}><Trash2 />Excluir</Button>
            </>
          )}

          {tipo === 'versoes' && (
            <Button size="sm" variant="outline" disabled={executando || sel.size !== 1} title={sel.size !== 1 ? 'Selecione uma única versão' : undefined} onClick={async () => {
              const id = [...sel][0]
              if (await confirmar({ titulo: 'Carregar versão', mensagem: 'Carregar a versão selecionada? As regras e disciplinas atuais serão substituídas (fica registrado na auditoria).' })) rodar(() => carregarVersaoCronograma(id), () => 'Versão carregada')
            }}><Upload />Carregar versão</Button>
          )}

          <Button size="sm" variant="ghost" className="ml-auto" onClick={limpar}><X />Limpar seleção</Button>
          {executando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>, document.body,
      )}
    </>
  )
}
