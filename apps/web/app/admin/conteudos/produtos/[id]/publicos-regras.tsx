'use client'

// Sub-aba "Públicos" da aba Regras: quem recebe este produto e quem pode ter regra própria.
//  · GRUPOS vinculados ao produto (adicionar/remover — select multi com busca no servidor) e "liberar para todos";
//  · SEGMENTOS (públicos por condição): criar um novo reaproveitando o editor de segmentos da aba Visibilidade;
//  · ao vincular um grupo, oferece aplicar a regra já (abre a matriz com a coluna selecionada e o painel de edição).
// Escrita: vincularGruposProdutoAction / definirLiberarParaTodosAction (-> salvarGruposAction / definirAcessoGratuitoProdutoAction).

import { useCallback, useEffect, useState } from 'react'
import { Globe, Loader2, Plus, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Pilula, Nota } from '@/app/admin/revisao/_comp/lista'
import { cn } from '@/lib/utils'
import type { Segmento } from '@/lib/segmentos/tipos'
import { carregarPublicosProdutoAction, definirLiberarParaTodosAction, invalidarMapaRegrasAction, vincularGruposProdutoAction } from './regras-edicao-actions'
import { listarGruposSelecaoAction } from './segmento-regras-actions'
import { SegmentoEditor } from './segmento-editor'
import type { PublicosProduto } from './regras-edicao-tipos'

export function PublicosRegras({ produtoId, ativa, podeEditar, onMudou, onAplicarAgora }: {
  produtoId: string; ativa: boolean; podeEditar: boolean; onMudou: () => void
  onAplicarAgora: (colunas: string[]) => void
}) {
  const [dados, setDados] = useState<PublicosProduto | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const carregar = useCallback(() => carregarPublicosProdutoAction(produtoId)
    .then((r) => { if ('ok' in r) { setDados(r.publicos); setErro(null) } else setErro(r.error) })
    .catch(() => setErro('Falha ao carregar os públicos.')), [produtoId])
  useEffect(() => { if (ativa) void carregar() }, [ativa, carregar])

  // adicionar grupos
  const [adicionando, setAdicionando] = useState(false)
  const [qg, setQg] = useState(''); const [pagina, setPagina] = useState(1)
  const [rows, setRows] = useState<Array<{ id: string; nome: string; noProduto: boolean }>>([]); const [totalG, setTotalG] = useState(0); const [buscando, setBuscando] = useState(false)
  const [marcados, setMarcados] = useState<Map<string, string>>(new Map())
  const [oferta, setOferta] = useState<Array<{ id: string; nome: string }> | null>(null)
  useEffect(() => {
    if (!adicionando) return
    setBuscando(true)
    const t = setTimeout(() => {
      listarGruposSelecaoAction(produtoId, qg, pagina)
        .then((r) => { if ('ok' in r) { setRows((cur) => (pagina === 1 ? r.rows : [...cur, ...r.rows])); setTotalG(r.total) } else toast.error(r.error) })
        .catch(() => toast.error('Falha ao buscar grupos.')).finally(() => setBuscando(false))
    }, pagina === 1 ? 300 : 0)
    return () => clearTimeout(t)
  }, [adicionando, qg, pagina, produtoId])

  async function vincular() {
    if (!marcados.size) return
    setBusy(true)
    const r = await vincularGruposProdutoAction(produtoId, { adicionar: [...marcados.keys()] }).catch(() => ({ error: 'Falha de rede.' }) as { error: string })
    setBusy(false)
    if (!('ok' in r)) { toast.error(r.error); return }
    toast.success(`${r.adicionados} grupo(s) vinculado(s) ao produto.`)
    setOferta([...marcados.entries()].map(([id, nome]) => ({ id, nome })))
    setAdicionando(false); setMarcados(new Map()); setQg(''); setPagina(1)
    window.dispatchEvent(new Event('produto-acesso-mudou'))
    void carregar(); onMudou()
  }
  async function desvincular(g: { id: string; nome: string }) {
    if (!(await confirmar({ titulo: 'Desvincular grupo?', mensagem: `Os membros de "${g.nome}" deixam de receber este produto por esse grupo (quem tem outro acesso continua). As regras já criadas para o grupo ficam guardadas.`, confirmar: 'Desvincular', destrutivo: true }))) return
    setBusy(true)
    const r = await vincularGruposProdutoAction(produtoId, { remover: [g.id] }).catch(() => ({ error: 'Falha de rede.' }) as { error: string })
    setBusy(false)
    if (!('ok' in r)) { toast.error(r.error); return }
    toast.success('Grupo desvinculado.'); window.dispatchEvent(new Event('produto-acesso-mudou')); void carregar(); onMudou()
  }
  async function alternarTodos(v: boolean) {
    if (v && !(await confirmar({ titulo: 'Liberar para todos os alunos?', mensagem: 'Todo aluno da plataforma passa a acessar este produto, sem prazo.', confirmar: 'Liberar para todos' }))) return
    setBusy(true)
    const r = await definirLiberarParaTodosAction(produtoId, v).catch(() => ({ error: 'Falha de rede.' }) as { error: string })
    setBusy(false)
    if (!('ok' in r)) { toast.error(r.error); return }
    toast.success(v ? 'Produto liberado para todos.' : 'Liberação para todos desligada.'); void carregar(); onMudou()
  }

  // segmento rápido
  const [novoSeg, setNovoSeg] = useState(false)

  return (
    <div className="space-y-4">
      {erro && <Nota tipo="aviso">{erro}</Nota>}

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4 text-muted-foreground" />Liberar para todos os alunos</h3>
            <p className="text-sm text-muted-foreground">Todo aluno da plataforma acessa o produto, sem prazo e sem precisar de grupo.</p>
          </div>
          <Switch checked={!!dados?.acessoGratuito} disabled={!podeEditar || busy || !dados} onCheckedChange={(v) => void alternarTodos(!!v)} aria-label="Liberar para todos" />
        </div>
      </section>

      <section className="rounded-2xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Grupos vinculados ao produto <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{dados?.grupos.length ?? '…'}</span></h3>
          {podeEditar && <Button size="sm" onClick={() => { setAdicionando(true); setPagina(1); setRows([]) }}><Plus className="h-4 w-4" />Adicionar grupos</Button>}
        </header>
        {!dados ? <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</p>
          : dados.grupos.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum grupo vinculado. Sem grupo, assinatura, segmento de acesso ou “liberar para todos”, ninguém entra no produto.</p>
          : (
            <ul className="divide-y">
              {dados.grupos.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium" title={g.nome}>{g.nome}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{g.membros == null ? '—' : `${g.membros.toLocaleString('pt-BR')} membro(s)`}</span>
                  <Button size="sm" variant="outline" onClick={() => onAplicarAgora([`grupo:${g.id}`])}>Aplicar regra</Button>
                  {podeEditar && <Button size="icon-sm" variant="ghost" aria-label={`Desvincular ${g.nome}`} disabled={busy} onClick={() => void desvincular(g)}><Trash2 className="h-4 w-4" /></Button>}
                </li>
              ))}
            </ul>
          )}
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">A validade de acesso é do membro dentro do grupo (tela do grupo). Este vínculo não tem prazo próprio.</p>
      </section>

      <section className="rounded-2xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Segmentos <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{dados?.segmentos.filter((s) => !s.grupoId).length ?? '…'}</span></h3>
          {podeEditar && <Button size="sm" variant="outline" onClick={() => setNovoSeg(true)}><Plus className="h-4 w-4" />Criar segmento rápido</Button>}
        </header>
        {!dados ? null : dados.segmentos.filter((s) => !s.grupoId).length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum segmento. Segmentos são públicos por condição (ex.: “aluno do grupo X que comprou até junho”) e podem ter regras próprias.</p> : (
          <ul className="divide-y">
            {dados.segmentos.filter((s) => !s.grupoId).map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium" title={s.nome}>{s.nome}</span>
                <Pilula tipo={s.regras ? 'vio' : 'mut'}>{s.regras ? `${s.regras} regra(s) neste produto` : 'sem regra neste produto'}</Pilula>
                <Button size="sm" variant="outline" onClick={() => onAplicarAgora([`segmento:${s.id}`])}>Aplicar regra</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Adicionar grupos */}
      <Dialog open={adicionando} onOpenChange={(o) => { if (!o && !busy) { setAdicionando(false); setMarcados(new Map()) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Adicionar grupos ao produto</DialogTitle><DialogDescription>Marque um ou mais grupos. Os membros deles passam a receber este produto.</DialogDescription></DialogHeader>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={qg} onChange={(e) => { setQg(e.target.value); setPagina(1) }} placeholder="Buscar grupo…" className="h-10 pl-9" /></div>
          <div className="max-h-[50vh] overflow-y-auto rounded-xl border">
            {rows.length === 0 && !buscando && <p className="p-4 text-sm text-muted-foreground">Nenhum grupo encontrado.</p>}
            {rows.map((g) => (
              <label key={g.id} className={cn('flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0', g.noProduto ? 'opacity-60' : 'cursor-pointer hover:bg-muted')}>
                <input type="checkbox" disabled={g.noProduto} checked={g.noProduto || marcados.has(g.id)} onChange={(e) => setMarcados((m) => { const n = new Map(m); e.target.checked ? n.set(g.id, g.nome) : n.delete(g.id); return n })} />
                <span className="min-w-0 flex-1 truncate" title={g.nome}>{g.nome}</span>
                {g.noProduto && <Pilula tipo="ok">já vinculado</Pilula>}
              </label>
            ))}
            {rows.length < totalG && <button type="button" onClick={() => setPagina((p) => p + 1)} disabled={buscando} className="w-full py-2 text-xs font-medium text-primary hover:bg-muted disabled:opacity-50">{buscando ? 'Carregando…' : `Carregar mais (${rows.length} de ${totalG})`}</button>}
            {buscando && rows.length === 0 && <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando…</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAdicionando(false); setMarcados(new Map()) }} disabled={busy}>Cancelar</Button>
            <Button onClick={() => void vincular()} disabled={busy || !marcados.size}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Vincular {marcados.size ? `(${marcados.size})` : ''}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Oferta: aplicar regra agora */}
      <Dialog open={!!oferta} onOpenChange={(o) => { if (!o) setOferta(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Aplicar uma regra agora?</DialogTitle><DialogDescription>{oferta?.length === 1 ? `“${oferta[0].nome}” foi vinculado.` : `${oferta?.length ?? 0} grupos foram vinculados.`} Sem regra própria, eles seguem a disponibilidade padrão de cada módulo/aula.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOferta(null)}>Agora não</Button>
            <Button onClick={() => { const c = (oferta ?? []).map((g) => `grupo:${g.id}`); setOferta(null); onAplicarAgora(c) }}>Abrir a matriz e aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Segmento rápido (mesmo editor da aba Visibilidade) */}
      <Dialog open={novoSeg} onOpenChange={setNovoSeg}>
        <DialogContent showCloseButton={false} className="flex h-[min(90vh,800px)] w-[min(1080px,calc(100vw-2rem))] max-w-[min(1080px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1080px,calc(100vw-2rem))]">
          <DialogTitle className="sr-only">Novo segmento</DialogTitle>
          <div className="min-h-0 flex-1 overflow-hidden">
            <SegmentoEditor seg={null} produtoId={produtoId} podeEditar={podeEditar} nomes={{}} onNomes={() => undefined} onVoltar={() => setNovoSeg(false)}
              onSalvo={async (s: Segmento) => { await invalidarMapaRegrasAction(produtoId).catch(() => undefined); setNovoSeg(false); toast.success('Segmento criado. Ele já pode ser uma coluna da matriz.'); void carregar(); onMudou(); onAplicarAgora([`segmento:${s.id}`]) }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
