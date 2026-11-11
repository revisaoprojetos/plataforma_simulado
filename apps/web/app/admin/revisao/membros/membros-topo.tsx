'use client'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, FileUp, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { CampoCs, FormCs, INPUT_CS, NotaCs, TEXTAREA_CS } from '@/components/admin/revisao/cs-ui'
import type { GrupoOpcao } from '@/lib/admin-revisao/cs-tipos'

async function post(corpo: Record<string, unknown>): Promise<{ ok: boolean; error?: string; criados?: number; jaExistiam?: number; invalidas?: number; ignoradas?: number }> {
  try { const r = await fetch('/api/admin/revisao/membros', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); return await r.json() } catch { return { ok: false, error: 'Falha de rede.' } }
}

/** Cabeçalho (Importar lista / Adicionar membro) + formulários inline, como o protótipo. `children` = KPIs. */
export function MembrosTopo({ grupos, podeCriar, onMudou, children }: { grupos: GrupoOpcao[]; podeCriar: boolean; onMudou: () => void; children: React.ReactNode }) {
  const [modo, setModo] = useState<'' | 'novo' | 'importar'>('')
  const [pend, start] = useTransition()
  const [nome, setNome] = useState(''); const [email, setEmail] = useState(''); const [grupoId, setGrupoId] = useState('')
  const [csv, setCsv] = useState(''); const [grupoImp, setGrupoImp] = useState('')
  const arq = useRef<HTMLInputElement>(null)

  const fechar = () => { setModo(''); setNome(''); setEmail(''); setCsv('') }

  function adicionar() {
    start(async () => {
      const r = await post({ acao: 'adicionar', nome, email, grupoId: grupoId || null })
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível adicionar.'); return }
      toast.success(`${nome.trim()} adicionado. O aluno entra só com o e-mail (sem senha).`)
      fechar(); onMudou()
    })
  }
  function importar() {
    start(async () => {
      const r = await post({ acao: 'importar', texto: csv, grupoId: grupoImp })
      if (!r.ok) { toast.error(r.error ?? 'Falha na importação.'); return }
      const extra = [r.invalidas ? `${r.invalidas} linha(s) inválida(s)` : '', r.ignoradas ? `${r.ignoradas} ficaram de fora (limite de 200 por vez)` : ''].filter(Boolean).join(' · ')
      toast.success(`${r.criados} novo(s), ${r.jaExistiam} já cadastrado(s) — todos no grupo.${extra ? ' ' + extra : ''}`)
      fechar(); onMudou()
    })
  }

  return (
    <>
      <RevisaoHead
        secao="CS"
        titulo="Membros"
        subtitulo="Todos os alunos da plataforma. Adicione, libere cursos, bloqueie ou remova o acesso. A compra no Guru cadastra o aluno sozinha."
        acoes={podeCriar ? (
          <>
            <Button variant="outline" size="lg" onClick={() => setModo(modo === 'importar' ? '' : 'importar')}><Upload /> Importar lista</Button>
            <Button size="lg" onClick={() => setModo(modo === 'novo' ? '' : 'novo')}><Plus /> Adicionar membro</Button>
          </>
        ) : undefined}
      />
      {children}
      {modo === 'novo' && (
        <FormCs titulo="Adicionar membro">
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoCs rotulo="Nome"><input className={INPUT_CS} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" /></CampoCs>
            <CampoCs rotulo="E-mail"><input className={INPUT_CS} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" /></CampoCs>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoCs rotulo="Grupo de acesso" dica="O grupo define os cursos e a validade do acesso.">
              <select className={INPUT_CS} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                <option value="">Sem grupo por enquanto</option>
                {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </CampoCs>
            <NotaCs>O aluno entra só com o e-mail (método de identificação da plataforma). Não há senha nem e-mail de boas-vindas automático.</NotaCs>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" disabled={pend} onClick={adicionar}><Check /> Adicionar membro</Button>
            <Button size="lg" variant="ghost" onClick={fechar}>Cancelar</Button>
          </div>
        </FormCs>
      )}
      {modo === 'importar' && (
        <FormCs titulo="Importar lista de membros">
          <p className="text-sm text-muted-foreground">Uma pessoa por linha, no formato nome;e-mail. Todos entram no grupo escolhido (até 200 por vez).</p>
          <textarea className={TEXTAREA_CS} rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Nome Sobrenome;email@exemplo.com" />
          <CampoCs rotulo="Grupo de acesso" className="max-w-md">
            <select className={INPUT_CS} value={grupoImp} onChange={(e) => setGrupoImp(e.target.value)}>
              <option value="">Escolha o grupo</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </CampoCs>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" disabled={pend || !grupoImp || !csv.trim()} onClick={importar}><Upload /> Importar</Button>
            <Button size="lg" variant="outline" onClick={() => arq.current?.click()}><FileUp /> Escolher arquivo .csv</Button>
            <input ref={arq} type="file" hidden accept=".csv,text/csv,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); e.target.value = '' }} />
            <Button size="lg" variant="ghost" onClick={fechar}>Cancelar</Button>
          </div>
        </FormCs>
      )}
    </>
  )
}
