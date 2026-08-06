'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Check, Eye, Trash2, Loader2, Users, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { desvincularEstudantesEmMassa, detalhesVinculadosBanco } from '@/app/admin/banco-questoes/estudantes-actions'
import { AdicionarEstudantesDialog } from '@/components/admin/adicionar-estudantes-dialog'
import { AdicionarGrupoBancoDialog } from '@/components/admin/adicionar-grupo-banco-dialog'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'

interface Aluno { id: string; nome: string; email?: string | null; telefone?: string | null; cpf?: string | null; classificacao?: string | null; ultimo_acesso?: string | null }

function iniciais(n: string) {
  return n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
}

type OrdCampo = 'nome' | 'email' | 'cpf' | 'ultimo_acesso'
function SortHead({ label, campo, ordCampo, ordDir, onSort }: { label: string; campo: OrdCampo; ordCampo: OrdCampo; ordDir: 'asc' | 'desc'; onSort: (c: OrdCampo) => void }) {
  const ativo = ordCampo === campo
  return (
    <TableHead>
      <button type="button" onClick={() => onSort(campo)} className={cn('group -ml-1 flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground', ativo ? 'text-foreground' : 'text-muted-foreground')}>
        <span>{label}</span>
        {ativo ? (
          ordDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-70" />
        )}
      </button>
    </TableHead>
  )
}

function fmtAcesso(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

type GrupoVinc = { id: string; nome: string; cor: string | null }
const POR_PAGINA = 50
// `alunos`, `grupos` e os detalhes (último acesso/grupos) NÃO chegam por prop — os diálogos buscam
// sob demanda e a lista é PAGINADA (50/página): o servidor manda só os campos de exibição dos
// vinculados; último acesso + grupos carregam por página (detalhesVinculadosBanco). Antes buscava
// sessões/filiações de TODOS (~4,9k) e renderizava tudo → aba lentíssima.
export function BancoEstudantesClient({ bancoId, vinculados, cor = '#6d28d9' }: { bancoId: string; vinculados: Aluno[]; cor?: string }) {
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [ordCampo, setOrdCampo] = useState<'nome' | 'email' | 'cpf' | 'ultimo_acesso'>('nome')
  const [ordDir, setOrdDir] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(0)
  const [detUltimo, setDetUltimo] = useState<Record<string, string>>({})
  const [detGrupos, setDetGrupos] = useState<Record<string, GrupoVinc[]>>({})
  const [carregandoDet, setCarregandoDet] = useState(false)
  const [carregadosSet, setCarregadosSet] = useState<Set<string>>(new Set())
  const router = useRouter()

  function ordenar(campo: 'nome' | 'email' | 'cpf' | 'ultimo_acesso') {
    if (ordCampo === campo) setOrdDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setOrdCampo(campo); setOrdDir('asc') }
  }

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    const base = q ? vinculados.filter((a) => a.nome.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q)) : vinculados
    const dir = ordDir === 'asc' ? 1 : -1
    const val = (a: Aluno) => {
      if (ordCampo === 'ultimo_acesso') { const d = detUltimo[a.id]; return d ? new Date(d).getTime() : -1 }
      return (a[ordCampo] ?? '').toString().toLowerCase()
    }
    return [...base].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'pt-BR') * dir
    })
  }, [busca, vinculados, ordCampo, ordDir, detUltimo])

  const totalPag = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaItens = useMemo(() => filtrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA), [filtrados, pagina])
  // Volta à 1ª página quando muda busca/ordenação; e não deixa a página passar do total.
  useEffect(() => { setPagina(0) }, [busca, ordCampo, ordDir])
  useEffect(() => { if (pagina > totalPag - 1) setPagina(0) }, [totalPag, pagina])

  // Carrega detalhes (último acesso + grupos) SÓ dos itens visíveis ainda não buscados.
  useEffect(() => {
    const ids = paginaItens.map((a) => a.id).filter((id) => !carregadosSet.has(id))
    if (!ids.length) return
    let vivo = true
    setCarregandoDet(true)
    detalhesVinculadosBanco(bancoId, ids).then((r) => {
      if (!vivo) return
      setCarregadosSet((p) => { const n = new Set(p); ids.forEach((id) => n.add(id)); return n })
      if (r.ok) {
        if (r.ultimo) setDetUltimo((p) => ({ ...p, ...r.ultimo }))
        if (r.grupos) setDetGrupos((p) => ({ ...p, ...r.grupos }))
      }
      setCarregandoDet(false)
    })
    return () => { vivo = false }
  }, [paginaItens, bancoId, carregadosSet])

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSel((p) => p.size === filtrados.length ? new Set() : new Set(filtrados.map((a) => a.id)))
  }
  function desvincular() {
    if (sel.size === 0) return
    start(async () => {
      // Uma única chamada em lote (chunks paralelos no servidor) — antes era 1 await por aluno,
      // o que travava a UI com milhares de selecionados.
      const r = await desvincularEstudantesEmMassa(bancoId, [...sel])
      if (!r.ok) { toast.error(r.error ?? 'Erro ao desvincular'); return }
      toast.success(`${r.removidos ?? sel.size} aluno(s) desvinculado(s)`)
      setSel(new Set())
      router.refresh()
    })
  }

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      {/* Cabeçalho da seção */}
      <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><Users className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold leading-tight">Estudantes vinculados</h3>
          <p className="text-xs text-muted-foreground">{vinculados.length} aluno(s) neste banco</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 pb-3 pt-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail…" className="pl-8" />
        </div>
        {sel.size > 0 && (
          <Button variant="destructive" size="sm" onClick={desvincular} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Desvincular {sel.size}
          </Button>
        )}
        <AdicionarGrupoBancoDialog bancoId={bancoId} />
        <AdicionarEstudantesDialog bancoId={bancoId} />
      </div>

      <CardContent className="p-0">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10">
                  <button type="button" onClick={toggleAll} className={cn('flex h-4 w-4 items-center justify-center rounded border',
                    filtrados.length > 0 && sel.size === filtrados.length ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {filtrados.length > 0 && sel.size === filtrados.length && <Check className="h-3 w-3" />}
                  </button>
                </TableHead>
                <SortHead label="Nome" campo="nome" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} />
                <SortHead label="E-mail" campo="email" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} />
                <SortHead label="Documento" campo="cpf" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} />
                <TableHead>Grupo</TableHead>
                <SortHead label="Último acesso" campo="ultimo_acesso" ordCampo={ordCampo} ordDir={ordDir} onSort={ordenar} />
                <TableHead className="w-16 text-center">Perfil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhum aluno vinculado. Clique em “Adicionar estudantes”.</TableCell></TableRow>
              ) : (
                paginaItens.map((a) => {
                  const on = sel.has(a.id)
                  const detCarregado = carregadosSet.has(a.id)
                  return (
                    <TableRow key={a.id} className={cn(on && 'bg-primary/5')}>
                      <TableCell onClick={() => toggle(a.id)} className="cursor-pointer">
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: `${cor}1a`, color: cor }}>{iniciais(a.nome)}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{a.nome}</span>
                              <ClassificacaoBadge classificacao={a.classificacao} />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.email ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{a.cpf ?? '—'}</TableCell>
                      <TableCell>
                        {!detCarregado ? (
                          <span className="text-xs text-muted-foreground/60">…</span>
                        ) : (detGrupos[a.id] ?? []).length ? (
                          <div className="flex flex-wrap gap-1">
                            {(detGrupos[a.id] ?? []).map((g) => (
                              <Link key={g.id} href={`/admin/grupos/${g.id}`} title={g.nome}
                                className="inline-flex max-w-[160px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:border-primary hover:bg-primary/5">
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.cor ?? 'var(--muted-foreground)' }} />
                                <span className="truncate">{g.nome}</span>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground" title="Adicionado diretamente ao banco (sem grupo)">Direto</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{detCarregado ? fmtAcesso(detUltimo[a.id]) : <span className="text-muted-foreground/60">…</span>}</TableCell>
                      <TableCell className="text-center">
                        <Link href={`/admin/estudantes/${a.id}`} className="inline-flex text-muted-foreground hover:text-primary" title="Ver perfil">
                          <Eye className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>
            {filtrados.length.toLocaleString('pt-BR')} de {vinculados.length.toLocaleString('pt-BR')} membro(s)
            {carregandoDet && <span className="ml-1 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> detalhes…</span>}
          </span>
          {totalPag > 1 && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}
                className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Anterior</button>
              <span className="px-1 tabular-nums">Pág. {pagina + 1}/{totalPag}</span>
              <button type="button" onClick={() => setPagina((p) => Math.min(totalPag - 1, p + 1))} disabled={pagina >= totalPag - 1}
                className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Próxima</button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
