'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { History, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { RevisaoCard } from '@/components/admin/revisao/ui'
import { Nota, Pilula } from '../_comp/lista'
import {
  CR_ALLF, CR_ARR, CR_SCHEMA, CR_TIPOS_MATERIAL, crAlteradas, crDef, crFmt, crHm, crMin, crMudou,
  type CampoRegra, type ValoresRegras,
} from '@/lib/revisao/cronograma-schema'
import { restaurarRegrasCronograma, salvarRegrasCronograma, salvarTiposBloqueadosCronograma } from './actions'

// Aba "Regras do cronograma": formulário por seção (porte fiel do protótipo), simulador rápido e "O que muda em relação ao 2.0".
// O estado é local até "Salvar regras" (grava de uma vez, com auditoria do que mudou).

function Campo({ f, v, onChange, motor }: { f: CampoRegra; v: number | boolean | string; onChange: (x: number | boolean | string) => void; motor?: number }) {
  const doMotor = motor !== undefined // regra com equivalente no motor: valor REAL vigente, edição em Metas & inteligência
  const mudou = JSON.stringify(v) !== JSON.stringify(f.d)
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-xl border p-3', mudou && 'border-amber-300/70 bg-amber-50/40 dark:bg-amber-950/10')}>
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={`cr-${f.k}`} className="text-sm font-medium leading-snug">{f.l}</label>
        {f.p ? <Pilula tipo="vio">Proposta</Pilula> : f.c ? <Pilula tipo="warn">Confirmar</Pilula> : null}
      </div>
      {f.t === 'bool' ? (
        <div className="flex items-center gap-2">
          <Switch id={`cr-${f.k}`} checked={!!v} onCheckedChange={(c) => onChange(!!c)} aria-label={f.l} />
          <span className="text-sm">{v ? 'Ligado' : 'Desligado'}</span>
        </div>
      ) : f.t === 'sel' ? (
        <select id={`cr-${f.k}`} value={String(v)} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">
          {f.o?.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
        </select>
      ) : f.t === 'txt' ? (
        <input id={`cr-${f.k}`} value={String(v)} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border bg-background px-2.5 text-sm" />
      ) : (
        <div className="flex items-center gap-2">
          <input id={`cr-${f.k}`} type="number" disabled={doMotor} value={Number(v)} min={f.min} max={f.max} step={f.step ?? 1}
            onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
            className="h-9 w-28 rounded-lg border bg-background px-2.5 text-sm tabular-nums" />
          <span className="text-xs text-muted-foreground">{f.u}</span>
        </div>
      )}
      {f.h && <small className="text-xs text-muted-foreground">{f.h}</small>}
      <span className="text-xs text-muted-foreground">
        {f.p ? 'Sugestão inicial' : 'Padrão 2.0'}: {crFmt(f, f.d)}
        {mudou && !doMotor && <> · <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => onChange(f.d)}>voltar {f.p ? 'à sugestão' : 'ao padrão'}</button></>}
      </span>
      {doMotor && <span className="text-xs text-muted-foreground">Valor vigente no motor de hoje (somente leitura aqui). Para mudar: <Link href="/admin/cronogramas/adaptativo/metas" className="text-primary underline-offset-2 hover:underline">Metas &amp; inteligência</Link>.</span>}
    </div>
  )
}

/** Controle global (por tenant) dos tipos de material que o gerador adaptativo pode entregar ao aluno. Grava na config do motor (não depende de migração). */
function TiposMaterial({ bloqueados, podeEditar }: { bloqueados: string[]; podeEditar: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [bloq, setBloq] = useState<Set<string>>(new Set(bloqueados))
  const sujo = bloq.size !== bloqueados.length || bloqueados.some((t) => !bloq.has(t))
  const alternar = (chave: string, disponivel: boolean) => setBloq((p) => { const n = new Set(p); if (disponivel) n.delete(chave); else n.add(chave); return n })
  function salvar() {
    start(async () => {
      const r = await salvarTiposBloqueadosCronograma([...bloq])
      if (r.ok) { toast.success('Tipos de material salvos.'); router.refresh() } else toast.error(r.error ?? 'Falha ao salvar.')
    })
  }
  return (
    <RevisaoCard>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Tipos de material no cronograma do aluno</h2>
          <p className="text-sm text-muted-foreground">Desligue um tipo para que o gerador adaptativo deixe de entregá-lo a qualquer aluno da plataforma. Vale nas próximas gerações e nos recálculos; metas já concluídas continuam no histórico.</p>
        </div>
        {bloq.size > 0 && <Pilula tipo="warn">{bloq.size} bloqueado{bloq.size > 1 ? 's' : ''}</Pilula>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CR_TIPOS_MATERIAL.map((t) => {
          const disponivel = !bloq.has(t.chave)
          return (
            <div key={t.chave} className={cn('flex flex-col gap-1.5 rounded-xl border p-3', !disponivel && 'border-amber-300/70 bg-amber-50/40 dark:bg-amber-950/10')}>
              <label htmlFor={`cr-tipo-${t.chave}`} className="text-sm font-medium leading-snug">{t.rotulo}</label>
              <div className="flex items-center gap-2">
                <Switch id={`cr-tipo-${t.chave}`} checked={disponivel} disabled={!podeEditar || pend} onCheckedChange={(c) => alternar(t.chave, !!c)} aria-label={`${t.rotulo} disponível ao aluno`} />
                <span className="text-sm">{disponivel ? 'Disponível ao aluno' : 'Bloqueado'}</span>
              </div>
              <small className="text-xs text-muted-foreground">{t.descricao}</small>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Ordem de prevalência: tipo bloqueado aqui &gt; disciplina desligada na aba Disciplinas &gt; ligado. PDFight não é uma meta do gerador (é material de apoio); ele continua sendo controlado por disciplina.</p>
      {podeEditar && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={salvar} disabled={pend || !sujo}><Save className="h-4 w-4" />{pend ? 'Salvando…' : 'Salvar tipos de material'}</Button>
          {sujo && <span className="text-xs text-amber-700 dark:text-amber-400">Há alterações não salvas.</span>}
        </div>
      )}
    </RevisaoCard>
  )
}

export function RegrasClient({ inicial, motor, migrado, podeEditar, tiposBloqueados }: { inicial: ValoresRegras; motor: Record<string, number>; migrado: boolean; podeEditar: boolean; tiposBloqueados: string[] }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [v, setV] = useState<ValoresRegras>(inicial)
  const [pag, setPag] = useState(60)
  const [rit, setRit] = useState<number>(Number(inicial.ritmoPadrao) || 17)
  const sujo = useMemo(() => JSON.stringify(v) !== JSON.stringify(inicial), [v, inicial])
  const alteradas = useMemo(() => crAlteradas(v), [v])
  const set = (k: string) => (x: number | boolean | string) => setV((p) => ({ ...p, [k]: x }))
  const ligadas = CR_ALLF.filter((f) => motor[f.k] !== undefined)
  const bloco = Number(v.blocoArred) || 30
  const m = crMin(pag, rit, bloco)

  function salvar() {
    start(async () => {
      const r = await salvarRegrasCronograma(v)
      if (r.ok) { toast.success('Regras salvas.'); router.refresh() } else toast.error(r.error ?? 'Falha ao salvar.')
    })
  }
  async function restaurar() {
    if (!(await confirmar({ titulo: 'Restaurar regras', mensagem: 'Restaurar todas as regras do 2.0? Os materiais ficam como estão.', destrutivo: true }))) return
    start(async () => {
      const r = await restaurarRegrasCronograma()
      if (r.ok) { setV(crDef()); toast.success('Regras restauradas para o 2.0.'); router.refresh() } else toast.error(r.error ?? 'Falha ao restaurar.')
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Pilula tipo="vio">Proposta</Pilula><span>regra nova, não existe no 2.0 e começa desligada</span>
        <Pilula tipo="warn">Confirmar</Pilula><span>valor que precisa ser conferido no código do 2.0</span>
      </div>
      <Nota tipo="info">
        <b>{ligadas.length} regras têm equivalente no motor</b> e mostram o valor real em vigor (somente leitura): {ligadas.map((f) => f.l).join('; ')}.{' '}
        As outras <b>{CR_ALLF.length - ligadas.length} regras não têm equivalente no motor</b> hoje: ficam salvas aqui como contrato para o time de tecnologia e ainda não alteram os planos dos alunos.
      </Nota>

      <TiposMaterial bloqueados={tiposBloqueados} podeEditar={podeEditar} />

      {!migrado && <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Para salvar as regras, aplique a migração 20261112050000_revisao_cronograma_duvidas.sql.</div>}

      <RevisaoCard className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2 xl:col-span-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Simulador rápido</div>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Páginas do PDFull</span>
          <input type="number" min={1} value={pag} onChange={(e) => setPag(Number(e.target.value) || 0)} className="h-9 w-full rounded-lg border bg-background px-2.5 tabular-nums" /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Ritmo do aluno (páginas/hora)</span>
          <input type="number" min={1} value={rit} onChange={(e) => setRit(Number(e.target.value) || 0)} className="h-9 w-full rounded-lg border bg-background px-2.5 tabular-nums" /></label>
        <div><b className="block text-2xl tabular-nums">{crHm(m)}</b><small className="text-muted-foreground">tempo reservado ao PDFull</small></div>
        <div><b className="block text-2xl tabular-nums">{crHm(m + (Number(v.tPdflash) || 0) + (Number(v.tQuestoes) || 0))}</b><small className="text-muted-foreground">com PDFlash e questões</small></div>
      </RevisaoCard>

      {CR_SCHEMA.map((s) => {
        const todos = s.arr ? [...s.fields, ...CR_ARR.flatMap((a) => a.f)] : s.fields
        const n = todos.filter((f) => crMudou(v, f)).length
        return (
          <RevisaoCard key={s.id}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div><h2 className="text-base font-semibold">{s.title}</h2><p className="text-sm text-muted-foreground">{s.desc}</p></div>
              {n > 0 && <Pilula tipo="warn">{n} alterada{n > 1 ? 's' : ''}</Pilula>}
            </div>
            {s.arr && (
              <>
                <div className="mb-4 grid gap-4 lg:grid-cols-3">
                  {CR_ARR.map((a) => (
                    <div key={a.n} className="space-y-2">
                      <h3 className="text-sm font-semibold">{a.n}</h3>
                      <p className="text-xs text-muted-foreground">{a.txt}</p>
                      {a.f.map((f) => <Campo key={f.k} f={f} v={v[f.k]} onChange={set(f.k)} motor={motor[f.k]} />)}
                    </div>
                  ))}
                </div>
                <h3 className="mb-2 text-sm font-semibold">Regras para todos os arranjos</h3>
              </>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {s.fields.map((f) => <Campo key={f.k} f={f} v={v[f.k]} onChange={set(f.k)} motor={motor[f.k]} />)}
            </div>
          </RevisaoCard>
        )
      })}

      <RevisaoCard>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">O que muda em relação ao 2.0</h2><p className="text-sm text-muted-foreground">Revise antes de salvar a versão</p></div>
          <Pilula tipo={alteradas.length ? 'warn' : 'ok'}>{alteradas.length} regras alteradas</Pilula>
        </div>
        {alteradas.length ? (
          <ul className="divide-y rounded-xl border">
            {alteradas.map((f) => (
              <li key={f.k} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0"><b className="block text-sm">{f.l}</b><small className="text-muted-foreground">{crFmt(f, f.d)} → {crFmt(f, v[f.k])}</small></span>
                <Button variant="outline" size="sm" onClick={() => set(f.k)(f.d)}>Voltar ao padrão</Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nenhuma regra diferente do Cronograma Adaptativo 2.0.</p>}
        {podeEditar && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={salvar} disabled={pend || !sujo}><Save className="h-4 w-4" />{pend ? 'Salvando…' : 'Salvar regras'}</Button>
            <Button variant="outline" onClick={restaurar} disabled={pend}><History className="h-4 w-4" />Restaurar todas as regras do 2.0</Button>
            {sujo && <span className="text-xs text-amber-700 dark:text-amber-400">Há alterações não salvas.</span>}
          </div>
        )}
      </RevisaoCard>
    </div>
  )
}
