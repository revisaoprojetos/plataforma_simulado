'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { editarEstudanteAction } from '@/app/admin/estudantes/actions'
import { Loader2, X, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

type Estudante = {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  telefone: string | null
  data_nascimento: string | null
  classificacao: string | null
  matricula_externa: string | null
  created_at: string | null
}

// data_nascimento pode vir como ISO com hora — normaliza para yyyy-MM-dd (input date).
function paraDataInput(d: string | null) {
  if (!d) return ''
  return d.length >= 10 ? d.slice(0, 10) : d
}

const inputCls = 'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'

// Definido fora do componente: se ficar dentro, é recriado a cada tecla e os inputs perdem o foco.
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

export function EditarEstudanteDialog({ estudante, onClose }: { estudante: Estudante; onClose: () => void }) {
  const router = useRouter()
  const [nome, setNome] = useState(estudante.nome ?? '')
  const [email, setEmail] = useState(estudante.email ?? '')
  const [cpf, setCpf] = useState(estudante.cpf ?? '')
  const [telefone, setTelefone] = useState(estudante.telefone ?? '')
  const [nascimento, setNascimento] = useState(paraDataInput(estudante.data_nascimento))
  const [matricula, setMatricula] = useState(estudante.matricula_externa ?? '')
  const [cadastro, setCadastro] = useState(paraDataInput(estudante.created_at))
  const [classificacao, setClassificacao] = useState(estudante.classificacao === 'passaporte' ? 'passaporte' : 'normal')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome.'); return }
    if (!email.trim()) { toast.error('Informe o e-mail.'); return }
    setSalvando(true)
    const r = await editarEstudanteAction(estudante.id, {
      nome, email, cpf, telefone,
      data_nascimento: nascimento || null,
      classificacao,
      matricula_externa: matricula,
      created_at: cadastro || null,
    })
    setSalvando(false)
    if (r?.error) { toast.error(r.error); return }
    toast.success('Estudante atualizado')
    onClose()
    router.refresh()
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Pencil className="h-4 w-4" /> Editar estudante</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Campo label="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus className={inputCls} /></Campo></div>
          <Campo label="E-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Campo>
          <Campo label="Telefone"><input value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputCls} /></Campo>
          <Campo label="CPF"><input value={cpf} onChange={(e) => setCpf(e.target.value)} className={inputCls} /></Campo>
          <Campo label="Nascimento"><input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className={inputCls} /></Campo>
          <Campo label="Matrícula externa"><input value={matricula} onChange={(e) => setMatricula(e.target.value)} className={inputCls} /></Campo>
          <Campo label="Cadastrado em"><input type="date" value={cadastro} onChange={(e) => setCadastro(e.target.value)} className={inputCls} /></Campo>
          <Campo label="Classificação">
            <div className="grid grid-cols-2 gap-2">
              {[{ v: 'normal', l: 'Estudante' }, { v: 'passaporte', l: 'Passaporte' }].map((o) => (
                <button key={o.v} type="button" onClick={() => setClassificacao(o.v)}
                  className={cn('rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    classificacao === o.v
                      ? (o.v === 'passaporte' ? 'border-purple-500 bg-purple-500 text-white' : 'border-slate-400 bg-slate-400 text-white dark:border-slate-500 dark:bg-slate-500')
                      : 'hover:bg-muted')}>
                  {o.l}
                </button>
              ))}
            </div>
          </Campo>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
