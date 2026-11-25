'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Trash2, FlaskConical, AlertTriangle, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import { BancoSistema } from '@/components/admin/banco-sistema'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Resumo = {
  disponivel: boolean
  redis: { disponivel: boolean; usadaBytes: number; maxBytes: number; pct: number | null; evicted: number; chaves: number; politica: string }
  grupos: Grupo[]
  memoria: Grupo[]
  varridas: number
  truncado: boolean
}

type Grupo = { grupo: string; chaves: number; bytes: number; ttlMedioSeg: number | null }
type Origem = 'redis' | 'memoria' | 'banco'
const kb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
const ttlFmt = (s: number | null) => (s == null ? '—' : s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`)
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

/** Aba "Cache" (Sistema): resumo do Redis de cache + limpeza CONTROLADA por grupo/tenant. Dados vêm da API. */
export function CacheSistema({ superAdmin }: { superAdmin: boolean }) {
  const [dados, setDados] = useState<Resumo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [asc, setAsc] = useState(false)
  const [origem, setOrigem] = useState<Origem | null>(null)
  const origemAtiva: Origem = origem ?? (dados?.redis?.disponivel ? 'redis' : 'memoria')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null)
    try {
      const r = await fetch('/api/admin/cache', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.message ?? `Erro ${r.status}`)
      setDados(j)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  async function executar(escopo: 'tenant' | 'todos', prefixo: string | null, dryRun: boolean) {
    const org = origemAtiva
    const alvo = prefixo ? `o grupo "${prefixo}"` : escopo === 'todos' ? 'o cache de TODOS os tenants' : 'o cache deste tenant'
    if (!dryRun) {
      const ok = await confirmar({
        titulo: 'Limpar cache', destrutivo: true, confirmar: 'Limpar',
        mensagem: `Limpar ${alvo}? Limpar muito de uma vez aumenta a carga do banco; prefira fora do pico. A limpeza é feita em lotes pequenos.`,
      })
      if (!ok) return
    }
    setOcupado(`${escopo}:${prefixo ?? ''}:${dryRun}`)
    try {
      const r = await fetch('/api/admin/cache', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ escopo, prefixo, dryRun, origem: org }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.message ?? `Erro ${r.status}`)
      toast.success(dryRun ? `Simulação: ${j.removidas} chaves seriam removidas.` : `${j.removidas} chaves removidas.`)
      if (!dryRun) await carregar()
    } catch (e) { toast.error((e as Error).message) } finally { setOcupado(null) }
  }

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const l = ((origemAtiva === 'memoria' ? dados?.memoria : dados?.grupos) ?? []).filter((g) => !q || g.grupo.toLowerCase().includes(q))
    return [...l].sort((a, b) => (asc ? a.chaves - b.chaves : b.chaves - a.chaves))
  }, [dados, busca, asc, origemAtiva])

  if (carregando && !dados) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando cache…</div>
  if (erro && !dados) return <AlertBox>{erro}</AlertBox>
  if (!dados) return <AlertBox>Sem dados de cache.</AlertBox>
  const r = dados.redis
  const redisOk = !!r?.disponivel

  return (
    <div className="space-y-4">
      <AlertBox>
        <span className="inline-flex items-center gap-2"><AlertTriangle className="size-4" />
          Limpar muito de uma vez aumenta a carga do banco; prefira fora do pico. A limpeza roda em lotes pequenos e só afeta o cache de relatórios (nunca sessão, filas ou locks).</span>
      </AlertBox>

      <div className="flex gap-4 border-b">
        {((superAdmin ? ['redis', 'memoria', 'banco'] : ['redis', 'memoria']) as Origem[]).map((o) => (
          <button key={o} type="button" onClick={() => setOrigem(o)} disabled={o === 'redis' && !redisOk}
            className={`-mb-px border-b-2 px-1 py-2 text-sm disabled:opacity-50 ${origemAtiva === o ? 'border-primary font-medium' : 'border-transparent text-muted-foreground'}`}>
            {o === 'redis' ? 'Redis' : o === 'memoria' ? 'Memória do processo' : 'Banco'}
          </button>
        ))}
      </div>
      {origemAtiva === 'memoria' && <AlertBox>Origem: memória deste processo{redisOk ? '' : ' (sem Redis)'}. Cada réplica tem a sua memória; aqui aparece só a da réplica que respondeu.</AlertBox>}
      {origemAtiva === 'banco' ? <BancoSistema /> : (<>

      {origemAtiva === 'redis' && redisOk && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Memória usada</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{mb(r.usadaBytes)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Limite</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{r.maxBytes ? mb(r.maxBytes) : 'sem limite'}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Uso</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{r.pct != null ? `${r.pct}%` : '—'}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">Removidas por pressão (evicted)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{r.evicted.toLocaleString('pt-BR')}</CardContent></Card>
      </div>}

      <div className="flex flex-wrap items-center gap-2">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar grupo de chaves…" className="w-64" />
        <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}><RefreshCw className="size-4" /> Atualizar</Button>
        <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => void executar('tenant', null, true)}><FlaskConical className="size-4" /> Simular (dry-run)</Button>
        <Button variant="destructive" size="sm" disabled={!!ocupado} onClick={() => void executar('tenant', null, false)}><Trash2 className="size-4" /> Limpar cache deste tenant</Button>
        {superAdmin && <Button variant="destructive" size="sm" disabled={!!ocupado} onClick={() => void executar('todos', null, false)}><Trash2 className="size-4" /> Limpar TODOS os tenants</Button>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Grupo</TableHead>
            <TableHead className="w-40 text-right">
              <button type="button" className="inline-flex items-center gap-1" onClick={() => setAsc((v) => !v)}>Chaves <ArrowUpDown className="size-3" /></button>
            </TableHead>
            <TableHead className="w-32 text-right">Tamanho aprox.</TableHead>
            <TableHead className="w-32 text-right">TTL médio</TableHead>
            <TableHead className="w-48 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma chave em cache nesta origem para este tenant.</TableCell></TableRow>}
          {linhas.map((g) => (
            <TableRow key={g.grupo}>
              <TableCell className="font-mono text-xs">{g.grupo}</TableCell>
              <TableCell className="text-right tabular-nums">{g.chaves.toLocaleString('pt-BR')}</TableCell>
              <TableCell className="text-right tabular-nums">{kb(g.bytes)}</TableCell>
              <TableCell className="text-right tabular-nums">{ttlFmt(g.ttlMedioSeg)}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => void executar('tenant', g.grupo, false)}>Limpar</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {origemAtiva === 'redis' && dados.truncado && <p className="text-xs text-muted-foreground">Contagem parcial: varredura limitada a {dados.varridas.toLocaleString('pt-BR')} chaves.</p>}
      </>)}
    </div>
  )
}
