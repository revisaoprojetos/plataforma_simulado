'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Diag = {
  conexao: { host: string | null; ref: string | null; banco: string | null }
  erro: string | null
  geral: { tamanhoBytes: number; maxConexoes: number; hitRatio: number | null } | null
  conexoes: { ativas: number; idle: number; total: number; maisLongaSeg: number } | null
  tabelas: { tabela: string; totalBytes: number; dadosBytes: number; toastBytes: number; indicesBytes: number; vivas: number; mortas: number; pctMortas: number; ultimoAutovacuum: string | null; ultimoAnalyze: string | null; bloat: boolean; comando: string | null }[]
  candidatos: { id: string; rotulo: string; tabela: string; funcao: string | null; contagem: number | null; maisDe: boolean; tamanhoBytes: number | null; erro: string | null }[]
  migracoes: { migracao: string; descricao: string; status: 'OK' | 'FALTA' | 'DESCONHECIDO' }[]
  consultas: { consulta: string; chamadas: number; mediaMs: number; totalS: number }[] | null
  consultasErro: string | null
}

const tam = (b: number | null) => (b == null ? '—' : b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
const num = (v: number) => v.toLocaleString('pt-BR')
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

function Cartao({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <Card><CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">{titulo}</CardTitle></CardHeader>
      <CardContent><div className="text-2xl font-semibold tabular-nums">{valor}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</CardContent></Card>
  )
}

/** Segmento "Banco" (super-admin): diagnóstico do Postgres + lotes de retenção. A API devolve tudo pronto. */
export function BancoSistema() {
  const [d, setD] = useState<Diag | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async (fresco = false) => {
    setCarregando(true); setErro(null)
    try {
      const r = await fetch(`/api/admin/cache?secao=banco${fresco ? '&fresh=1' : ''}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.message ?? `Erro ${r.status}`)
      setD(j)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  async function purgar(funcao: string, rotulo: string) {
    const ok = await confirmar({ titulo: 'Limpar lote', destrutivo: true, confirmar: 'Limpar lote', mensagem: `Apagar 1 lote (até 2.000 linhas) de "${rotulo}"? A ação é irreversível; prefira fora do pico.` })
    if (!ok) return
    setOcupado(funcao)
    try {
      const r = await fetch('/api/admin/cache', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'purgar', funcao }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.message ?? `Erro ${r.status}`)
      toast.success(`${j.removidas} linhas removidas.`)
      await carregar(true)
    } catch (e) { toast.error((e as Error).message) } finally { setOcupado(null) }
  }

  async function copiar(txt: string) {
    try { await navigator.clipboard.writeText(txt); toast.success('Comando copiado.') } catch { toast.error('Não foi possível copiar.') }
  }

  if (carregando && !d) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Consultando o banco…</div>
  if (erro && !d) return <AlertBox>{erro}</AlertBox>
  if (!d) return <AlertBox>Sem dados do banco.</AlertBox>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => void carregar(true)} disabled={carregando}><RefreshCw className="size-4" /> Atualizar</Button>
        <span className="text-sm text-muted-foreground">
          Conectado em <b>{d.conexao.host ?? '—'}</b> · projeto <b>{d.conexao.ref ?? '—'}</b> · banco <b>{d.conexao.banco ?? '—'}</b>
        </span>
      </div>
      {d.erro && <AlertBox>Banco indisponível para diagnóstico: {d.erro}</AlertBox>}

      {d.geral && d.conexoes && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Cartao titulo="Tamanho do banco" valor={tam(d.geral.tamanhoBytes)} />
          <Cartao titulo="Conexões" valor={`${d.conexoes.total} / ${d.geral.maxConexoes}`} sub={`${d.conexoes.ativas} ativas · ${d.conexoes.idle} idle`} />
          <Cartao titulo="Query mais longa em andamento" valor={`${d.conexoes.maisLongaSeg}s`} />
          <Cartao titulo="Cache hit ratio" valor={d.geral.hitRatio != null ? `${d.geral.hitRatio}%` : '—'} />
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Maiores tabelas</h3>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Tabela</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Dados</TableHead>
            <TableHead className="text-right">TOAST</TableHead><TableHead className="text-right">Índices</TableHead><TableHead className="text-right">Vivas</TableHead>
            <TableHead className="text-right">Mortas</TableHead><TableHead className="text-right">% mortas</TableHead><TableHead>Autovacuum</TableHead><TableHead>Analyze</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {d.tabelas.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Sem dados.</TableCell></TableRow>}
            {d.tabelas.map((t) => (
              <TableRow key={t.tabela}>
                <TableCell className="font-mono text-xs">
                  {t.tabela}{' '}
                  {t.bloat && <Badge variant="destructive" className="ml-1">BLOAT</Badge>}
                  {t.comando && (
                    <button type="button" onClick={() => void copiar(t.comando!)} title="Copiar comando (rode via psql, fora do pico)" className="ml-2 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <Copy className="size-3" /> <span className="text-[10px]">{t.comando}</span>
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{tam(t.totalBytes)}</TableCell>
                <TableCell className="text-right tabular-nums">{tam(t.dadosBytes)}</TableCell>
                <TableCell className="text-right tabular-nums">{tam(t.toastBytes)}</TableCell>
                <TableCell className="text-right tabular-nums">{tam(t.indicesBytes)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(t.vivas)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(t.mortas)}</TableCell>
                <TableCell className="text-right tabular-nums">{t.pctMortas}%</TableCell>
                <TableCell className="text-xs">{data(t.ultimoAutovacuum)}</TableCell>
                <TableCell className="text-xs">{data(t.ultimoAnalyze)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">O app nunca executa VACUUM. Para recuperar espaço, rode o comando indicado via psql/CLI, fora do pico.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Candidatos à limpeza / retenção</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Linhas</TableHead><TableHead className="text-right">Tamanho da tabela</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
          <TableBody>
            {d.candidatos.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.rotulo} <span className="font-mono text-xs text-muted-foreground">({c.tabela})</span></TableCell>
                <TableCell className="text-right tabular-nums">{c.contagem == null ? <span className="text-muted-foreground">indisponível</span> : `${c.maisDe ? '> ' : ''}${num(c.maisDe ? 100000 : c.contagem)}`}</TableCell>
                <TableCell className="text-right tabular-nums">{tam(c.tamanhoBytes)}</TableCell>
                <TableCell className="text-right">
                  {c.funcao
                    ? <Button variant="outline" size="sm" disabled={!!ocupado || !c.contagem} onClick={() => void purgar(c.funcao!, c.rotulo)}>{ocupado === c.funcao ? 'Limpando…' : 'Limpar lote'}</Button>
                    : <span className="text-xs text-muted-foreground">sem rotina de purga</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Verificação de migrações</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Migração</TableHead><TableHead>Objeto</TableHead><TableHead className="w-32">Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {d.migracoes.map((m, i) => (
              <TableRow key={`${m.migracao}-${i}`}>
                <TableCell className="font-mono text-xs">{m.migracao}</TableCell>
                <TableCell>{m.descricao}</TableCell>
                <TableCell><Badge variant={m.status === 'OK' ? 'secondary' : 'destructive'}>{m.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Consultas mais pesadas</h3>
        {d.consultas == null ? <p className="text-sm text-muted-foreground">{d.consultasErro}</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Consulta</TableHead><TableHead className="text-right">Chamadas</TableHead><TableHead className="text-right">Média (ms)</TableHead><TableHead className="text-right">Total (s)</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.consultas.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Sem estatísticas.</TableCell></TableRow>}
              {d.consultas.map((q, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{q.consulta}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(q.chamadas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.mediaMs}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.totalS}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}
