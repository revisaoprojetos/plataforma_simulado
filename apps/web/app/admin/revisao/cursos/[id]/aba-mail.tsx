'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Mail, Pencil, Users } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { MAIL_AUTO, type AutomacaoRow } from '@/lib/revisao/cursos-defs'
import { salvarAutomacaoAction } from '../actions'
import { Campo, inputCls, textareaCls, useAcao } from '../ui-cursos'

const sub = (t: string, curso: string, nome: string) => t.replace(/\{nome\}/g, nome).replace(/\{curso\}/g, curso)

export function AbaMail({ cursoId, cursoNome, automacoes, podeEditar, tenantNome, nomeExemplo }: { tenantNome: string; nomeExemplo: string; cursoId: string; cursoNome: string; automacoes: AutomacaoRow[]; podeEditar: boolean }) {
  const [pendente, executar] = useAcao()
  const [sel, setSel] = useState('boas')
  const linha = (k: string) => automacoes.find((a) => a.canal === 'email' && a.chave === k)
  const padrao = MAIL_AUTO.find((a) => a[0] === sel)!
  const [assuntos, setAssuntos] = useState<Record<string, string>>({})
  const [textos, setTextos] = useState<Record<string, string>>({})
  const assunto = assuntos[sel] ?? linha(sel)?.assunto ?? padrao[2]
  const texto = textos[sel] ?? linha(sel)?.texto ?? padrao[3]
  const lock = !podeEditar || pendente

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-2xl border bg-card shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="size-4" /></span>
              <div><h2 className="text-sm font-semibold">E-mails automáticos deste curso</h2><p className="text-xs text-muted-foreground">Saem sozinhos para quem está nos grupos do curso</p></div>
            </div>
            <Link href="/admin/revisao/campanhas" className={buttonVariants({ variant: 'outline', size: 'sm' })}><Mail className="size-3.5" />Enviar um e-mail avulso</Link>
          </div>
          <div className="flex flex-col px-4">
            {MAIL_AUTO.map(([k, rotulo, , , ligado]) => {
              const on = linha(k)?.ativo ?? ligado
              return (
                <div key={k} className="flex items-center gap-3 border-b py-2.5 text-sm last:border-0">
                  <Switch checked={on} disabled={lock} aria-label={rotulo} onCheckedChange={(v) => executar(() => salvarAutomacaoAction(cursoId, 'email', k, { ativo: v }))} />
                  <span className="flex-1">{rotulo}</span>
                  <Button variant={sel === k ? 'default' : 'outline'} size="sm" onClick={() => setSel(k)}><Pencil className="size-3.5" />Texto</Button>
                </div>
              )
            })}
          </div>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Texto: {padrao[1]}</h2>
          <Campo rotulo="Assunto"><input className={inputCls} value={assunto} disabled={lock} onChange={(e) => setAssuntos((a) => ({ ...a, [sel]: e.target.value }))} maxLength={200} /></Campo>
          <Campo rotulo="Mensagem" dica="{nome} vira o primeiro nome do aluno e {curso} o nome do curso."><textarea className={textareaCls} rows={7} value={texto} disabled={lock} onChange={(e) => setTextos((a) => ({ ...a, [sel]: e.target.value }))} maxLength={4000} /></Campo>
          <div><Button size="lg" disabled={lock} onClick={() => executar(() => salvarAutomacaoAction(cursoId, 'email', sel, { assunto, texto }), 'Texto salvo')}><Check className="size-4" />Salvar texto</Button></div>
        </section>
      </div>
      <aside className="xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">Como o aluno recebe</div>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="bg-primary px-5 py-5 text-center text-lg font-extrabold uppercase tracking-wide text-primary-foreground">{tenantNome}</div>
          <div className="p-5 text-sm">
            <h3 className="mb-3 text-lg font-bold">{sub(assunto, cursoNome, nomeExemplo)}</h3>
            <div className="whitespace-pre-line">{sub(texto, cursoNome, nomeExemplo)}</div>
            <span className="mt-4 inline-block rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-black">Abrir a plataforma</span>
          </div>
          <div className="border-t px-5 py-3 text-xs text-muted-foreground">Você recebe este e-mail porque é aluno do {cursoNome}.</div>
        </div>
      </aside>
    </div>
  )
}
