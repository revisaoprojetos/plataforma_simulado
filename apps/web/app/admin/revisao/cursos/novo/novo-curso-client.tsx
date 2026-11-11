'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { CFG_PADRAO, TIPOS_NOVO, nomeModelo, type CursoCfg, type ModeloId } from '@/lib/revisao/cursos-defs'
import type { DadosPreview } from '@/lib/revisao/cursos'
import { criarCursoAction } from '../actions'
import { ModeloGaleria, ModeloOpcoes, ModeloPreview } from '../modelo-ui'
import { Campo, inputCls } from '../ui-cursos'

// Criar curso: nome + tipo + modelo (+ ajustes) com pré-visualização. Ao criar: pasta própria + produto principal.
export function NovoCursoClient({ c1, c2, dados }: { c1: string; c2: string; dados: DadosPreview }) {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<string>('Curso')
  const [modelo, setModelo] = useState<ModeloId>('trilha')
  const [cfg, setCfg] = useState<CursoCfg>(CFG_PADRAO)
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!nome.trim()) { toast.error('Dê um nome ao curso.'); return }
    setSalvando(true)
    const r = await criarCursoAction({ nome, tipo, modelo, cfg })
    if ('error' in r) { setSalvando(false); toast.error(r.error); return }
    toast.success(`Pasta “${nome.trim()}” criada. Siga o passo a passo para publicar o curso`)
    router.push(`/admin/revisao/cursos/${r.id}?aba=etapas`)
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome do curso"><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do curso" maxLength={160} /></Campo>
          <Campo rotulo="Tipo">
            <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS_NOVO.map((t) => <option key={t}>{t}</option>)}</select>
          </Campo>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <ModeloGaleria atual={modelo} onPick={setModelo} />
          <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Ajustes do modelo {nomeModelo(modelo)}</h2>
            <ModeloOpcoes modelo={modelo} cfg={cfg} onCfg={(p) => setCfg((c) => ({ ...c, ...p }))} />
          </section>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={criar} disabled={salvando}><Check className="size-4" />Criar curso com este modelo</Button>
            <Link href="/admin/revisao/cursos" className={buttonVariants({ variant: 'outline', size: 'lg' })}>Cancelar</Link>
          </div>
        </div>
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Como o aluno vê</div>
          <ModeloPreview modelo={modelo} cfg={cfg} nome={nome} tipo={tipo} c1={c1} c2={c2} dados={dados} />
        </aside>
      </div>
    </div>
  )
}
