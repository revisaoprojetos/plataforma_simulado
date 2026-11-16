import Link from 'next/link'
import { AlertTriangle, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DIAS_OPCOES, listarUltimasChamadas, obterUsoResumo } from '@/lib/api-v1/uso-consulta'
import { formatBrt } from '@/lib/brt'
import { UsoUltimas } from './uso-ultimas'

/** Aba "Uso" (SERVIDOR): tudo vem do RPC api_uso_resumo + .range()/count; nada é calculado no render. */
export async function AbaUso({ tenantId, sp }: { tenantId: string; sp: Record<string, string | undefined> }) {
  const dias = DIAS_OPCOES.includes(Number(sp.dias)) ? Number(sp.dias) : 30
  const r = await obterUsoResumo(tenantId, dias)
  if (!r.ok) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>{r.ausente
          ? 'O rastreio de uso da API ainda não está ativo: aplique a migração 20261121110000_api_uso_log.sql no banco.'
          : 'Não foi possível carregar o uso da API agora. Tente novamente em instantes.'}</p>
      </div>
    )
  }
  const { totais: t, porRecurso, porChave, sugestoes } = r.resumo
  const pg = Math.max(1, Number(sp.page) || 1)
  const pp = [10, 25, 50].includes(Number(sp.pp)) ? Number(sp.pp) : 25
  const ultimas = await listarUltimasChamadas(tenantId, {
    page: pg, perPage: pp, q: sp.q ?? '', sort: sp.sort ?? 'criado_em', dir: sp.dir === 'asc' ? 'asc' : 'desc',
    filtro: sp.st ?? '', chaveId: sp.ck ?? '',
  })
  const taxa = t.chamadas ? ((t.erros / t.chamadas) * 100).toFixed(1).replace('.', ',') : '0,0'
  const cards: { rotulo: string; valor: string; sub: string }[] = [
    { rotulo: 'Chamadas', valor: t.chamadas.toLocaleString('pt-BR'), sub: `últimos ${dias} dias` },
    { rotulo: 'Taxa de erro', valor: `${taxa}%`, sub: `${t.erros.toLocaleString('pt-BR')} com erro` },
    { rotulo: 'Tempo p50 / p95', valor: `${t.p50} / ${t.p95} ms`, sub: 'mediana / 95% das chamadas' },
    { rotulo: 'Barradas', valor: t.barradas.toLocaleString('pt-BR'), sub: 'por limite de uso' },
  ]
  const chavesFiltro = porChave.map((k) => ({ id: k.id, nome: `${k.nome ?? 'Chave'}${k.key_prefix ? ` (${k.key_prefix}…)` : ''}` }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Período:</span>
        {DIAS_OPCOES.map((d) => (
          <Link key={d} href={`/admin/api-keys?aba=uso&dias=${d}`}
            className={cn('rounded-md border px-3 py-1 text-sm', d === dias ? 'border-primary bg-primary/10 font-semibold' : 'text-muted-foreground hover:text-foreground')}>
            {d} dias
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.rotulo}><CardContent className="space-y-1 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.rotulo}</p>
            <p className="text-2xl font-extrabold tabular-nums">{c.valor}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </CardContent></Card>
        ))}
      </div>

      {sugestoes.length > 0 && (
        <Card><CardContent className="space-y-2 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Lightbulb className="h-4 w-4 text-primary" />Sugestões de melhoria</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">{sugestoes.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </CardContent></Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden"><CardContent className="p-0">
          <h2 className="px-4 pt-4 text-sm font-bold">Por recurso</h2>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Recurso</TableHead><TableHead className="text-right">Chamadas</TableHead><TableHead className="text-right">Erros</TableHead>
              <TableHead className="text-right">p50</TableHead><TableHead className="text-right">p95</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {porRecurso.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sem chamadas no período.</TableCell></TableRow>
              ) : porRecurso.map((x) => (
                <TableRow key={x.recurso}>
                  <TableCell className="font-mono text-xs">{x.recurso}</TableCell>
                  <TableCell className="text-right tabular-nums">{x.chamadas}</TableCell>
                  <TableCell className="text-right tabular-nums">{x.erros}</TableCell>
                  <TableCell className="text-right tabular-nums">{x.p50} ms</TableCell>
                  <TableCell className="text-right tabular-nums">{x.p95} ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>

        <Card className="overflow-hidden"><CardContent className="p-0">
          <h2 className="px-4 pt-4 text-sm font-bold">Por chave</h2>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Chave</TableHead><TableHead className="text-right">Chamadas</TableHead><TableHead className="text-right">Barradas por limite</TableHead>
              <TableHead className="text-right">Erros</TableHead><TableHead>Último uso</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {porChave.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma chave.</TableCell></TableRow>
              ) : porChave.map((k) => (
                <TableRow key={k.id} className={k.revogada ? 'opacity-60' : ''}>
                  <TableCell>
                    <span className="font-medium">{k.nome ?? 'Chave'}</span>{k.revogada && <span className="text-muted-foreground"> (revogada)</span>}
                    {k.key_prefix && <code className="ml-2 rounded bg-muted px-1 py-0.5 text-xs">{k.key_prefix}…</code>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{k.chamadas}</TableCell>
                  <TableCell className="text-right tabular-nums">{k.barradas > 0 ? <Badge variant="outline">{k.barradas}</Badge> : 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{k.erros}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatBrt(k.ultimo_uso_log ?? k.ultimo_uso) ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Últimas chamadas</h2>
        <UsoUltimas rows={ultimas.rows} total={ultimas.total} chaves={chavesFiltro} />
      </section>
    </div>
  )
}
