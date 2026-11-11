'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TIPOS_CURSO } from '@/lib/revisao/cursos-defs'
import { alternarAtivoAction, salvarInfoAction } from '../actions'
import { Campo, ToggleRow, inputCls, useAcao } from '../ui-cursos'

export function AbaInfo({ id, c, podeEditar }: {
  id: string; podeEditar: boolean
  c: { nome: string; tipo: string; sub: string | null; abre_em: string | null; fecha_em: string | null; ativo: boolean; cronograma_adaptativo: boolean }
}) {
  const [pendente, executar] = useAcao()
  const [nome, setNome] = useState(c.nome)
  const [tipo, setTipo] = useState(c.tipo)
  const [sub, setSub] = useState(c.sub ?? '')
  const [abre, setAbre] = useState(c.abre_em ?? '')
  const [fecha, setFecha] = useState(c.fecha_em ?? '')
  const [ativo, setAtivo] = useState(c.ativo)
  const [cron, setCron] = useState(c.cronograma_adaptativo)
  const lock = !podeEditar || pendente
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome do curso"><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} disabled={lock} maxLength={160} /></Campo>
        <Campo rotulo="Tipo"><select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={lock}>{TIPOS_CURSO.map((t) => <option key={t}>{t}</option>)}</select></Campo>
      </div>
      <Campo rotulo="Frase de apoio" dica="Aparece embaixo do nome no card e no topo do curso."><input className={inputCls} value={sub} onChange={(e) => setSub(e.target.value)} disabled={lock} maxLength={200} /></Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Abre para os alunos em"><input type="date" className={inputCls} value={abre} onChange={(e) => setAbre(e.target.value)} disabled={lock} /></Campo>
        <Campo rotulo="Fecha em" dica="Depois dessa data o curso sai do menu do aluno."><input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={lock} /></Campo>
      </div>
      <ToggleRow
        checked={ativo} disabled={lock} rotulo="Curso ativo"
        onChange={(v) => { setAtivo(v); executar(() => alternarAtivoAction(id, v), v ? 'Curso visível para os alunos' : 'Curso escondido dos alunos. O progresso fica guardado') }}
      >
        <b>{ativo ? 'Curso ativo: aparece para os alunos' : 'Curso desativado: escondido dos alunos'}</b>
      </ToggleRow>
      <ToggleRow checked={cron} disabled={lock} onChange={setCron} rotulo="Entra no Cronograma Adaptativo">Aulas deste curso entram no Cronograma Adaptativo</ToggleRow>
      <div>
        <Button size="lg" disabled={lock} onClick={() => executar(() => salvarInfoAction(id, { nome, tipo, sub, abre_em: abre, fecha_em: fecha, cronograma_adaptativo: cron }), 'Alterações salvas')}>
          <Check className="size-4" />Salvar alterações
        </Button>
      </div>
    </section>
  )
}
