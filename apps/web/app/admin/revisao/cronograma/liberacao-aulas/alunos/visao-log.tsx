import Link from 'next/link'
import { Search } from 'lucide-react'
import { Nota, PaginaNav, Pilula, ThFixo, ThOrd, hrefCom, ParamsInt } from '../../../_comp/lista'
import { listarLog } from './dados-alunos'
import { AVISO_MIGRACAO, ORIGENS_LOG, PPS_LISTAS, dataHoraBr } from './tipos-alunos'
import { CAMPO, PRESERVAR, type PropsVisao } from './tipos-visao'

const ROTULO_ACAO: Record<string, string> = { excecao_criada: 'Exceção criada', excecao_criada_lote: 'Exceções criadas (lote)', excecao_editada: 'Exceção editada', excecao_ativada: 'Exceção ativada', excecao_desativada: 'Exceção desativada', excecao_excluida: 'Exceção excluída', data_alterada: 'Data alterada', trilha_criada: 'Trilha criada', recalculo: 'Recálculo' }
const TIPO_ORIGEM = { manual: 'vio', automatico: 'mut', importacao: 'warn' } as const

export async function VisaoLog({ svc, tenantId, produtoId, base, qs, pathname }: PropsVisao) {
  const pagina = ParamsInt(qs.pag, 1)
  const titulos = new Map<string, string>([...base.aulas.map((a) => [a.id, a.titulo] as const), ...base.modulos.map((m) => [m.id, m.titulo] as const)])
  const lista = await listarLog(svc, tenantId, produtoId, { origem: qs.origem, acao: qs.acao, de: qs.de, ate: qs.ate, q: qs.q, ord: qs.ord, dir: qs.dir === 'asc' ? 'asc' : 'desc' }, pagina, PPS_LISTAS, titulos)
  if (!lista.migrado) return <Nota tipo="aviso">{AVISO_MIGRACAO}</Nota>
  const limpar = hrefCom(pathname, Object.fromEntries(PRESERVAR.map((k) => [k, qs[k]])))
  const temFiltro = !!(qs.q || qs.origem || qs.acao || qs.de || qs.ate)
  return (
    <>
      <form method="get" action={pathname} className="mb-3 flex flex-wrap items-center gap-2">
        {PRESERVAR.map((k) => qs[k] ? <input key={k} type="hidden" name={k} value={qs[k]} /> : null)}
        <label className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={qs.q ?? ''} placeholder="Buscar aluno (nome, e-mail ou CPF)" autoComplete="off" className={`${CAMPO} w-full pl-8 pr-3`} />
        </label>
        <select name="origem" defaultValue={qs.origem ?? ''} aria-label="Origem" className={CAMPO}>
          <option value="">Todas as origens</option>
          {ORIGENS_LOG.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <select name="acao" defaultValue={qs.acao ?? ''} aria-label="Ação" className={CAMPO}>
          <option value="">Todas as ações</option>
          {lista.acoes.map((a) => <option key={a} value={a}>{ROTULO_ACAO[a] ?? a}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">De<input type="date" name="de" defaultValue={qs.de ?? ''} className={CAMPO} /></label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">até<input type="date" name="ate" defaultValue={qs.ate ?? ''} className={CAMPO} /></label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Filtrar</button>
        {temFiltro && <Link href={limpar} className="h-9 content-center text-sm text-muted-foreground underline-offset-2 hover:underline">Limpar</Link>}
      </form>
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b bg-muted/40"><tr>
              <ThOrd rotulo="Quando" col="criado" base={pathname} qs={qs} />
              <ThOrd rotulo="Origem" col="origem" base={pathname} qs={qs} />
              <ThOrd rotulo="Ação" col="acao" base={pathname} qs={qs} />
              <ThFixo>Alvo</ThFixo><ThFixo>Aluno</ThFixo><ThFixo>Quem</ThFixo><ThFixo>Detalhe</ThFixo>
            </tr></thead>
            <tbody className="divide-y">
              {lista.rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhum registro no log.</td></tr>}
              {lista.rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{dataHoraBr(r.criadoEm)}</td>
                  <td className="px-3 py-2"><Pilula tipo={TIPO_ORIGEM[r.origem as keyof typeof TIPO_ORIGEM] ?? 'mut'}>{r.origem}</Pilula></td>
                  <td className="px-3 py-2">{ROTULO_ACAO[r.acao] ?? r.acao}</td>
                  <td className="px-3 py-2">{r.alvoTitulo ? <><span className="block">{r.alvoTitulo}</span><span className="text-xs text-muted-foreground">{r.alvoTipo}</span></> : '—'}</td>
                  <td className="px-3 py-2">{r.aluno}</td>
                  <td className="px-3 py-2">{r.feitoPor}</td>
                  <td className="px-3 py-2">
                    <details><summary className="cursor-pointer text-xs text-primary">ver</summary>
                      <pre className="mt-1 max-w-[28rem] overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{JSON.stringify(r.detalhe ?? {}, null, 2)}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PaginaNav base={pathname} qs={qs} pagina={pagina} porPagina={PPS_LISTAS} total={lista.total} />
    </>
  )
}
