'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Globe, Lock, Loader2, Users2, X } from 'lucide-react'
import { AdicionarGrupoModuloDialog } from '@/components/admin/adicionar-grupo-modulo-dialog'
import { AdicionarEstudantesDialog, type AlunoSel } from '@/components/admin/adicionar-estudantes-dialog'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { carregarAtribuicaoDoc, definirGruposDoc, definirEstudantesDoc, type EstudanteAcessoLinha, type GrupoAtribuido } from '@/app/admin/biblioteca/actions'

// Acesso de UM documento da Biblioteca: grupos + alunos individuais. SEM nenhum = liberado a todos.
// Grupos ficam VINCULADOS (conexão viva — novos alunos no grupo passam a ter acesso automaticamente).
export function DocumentoAcesso({ documentoId }: { documentoId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [grupos, setGrupos] = useState<GrupoAtribuido[]>([])
  const [estudantes, setEstudantes] = useState<EstudanteAcessoLinha[]>([])
  const atribuidos = grupos.filter((g) => g.atribuido)
  const liberadoTodos = atribuidos.length === 0 && estudantes.length === 0

  async function carregar() {
    const r = await carregarAtribuicaoDoc(documentoId)
    if (r.ok) { setGrupos(r.grupos ?? []); setEstudantes(r.estudantes ?? []) }
    else toast.error(r.error || 'Falha ao carregar o acesso.')
    setCarregando(false)
  }
  useEffect(() => { carregar() /* eslint-disable-next-line */ }, [documentoId])

  async function salvarGrupos(novosIds: string[]): Promise<boolean> {
    setSalvando(true)
    const r = await definirGruposDoc(documentoId, novosIds)
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar.'); return false }
    setGrupos((gs) => gs.map((g) => ({ ...g, atribuido: novosIds.includes(g.id) })))
    return true
  }
  async function salvarEstudantes(lista: EstudanteAcessoLinha[]): Promise<boolean> {
    setSalvando(true)
    const r = await definirEstudantesDoc(documentoId, lista.map((e) => e.id))
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar.'); return false }
    setEstudantes(lista)
    return true
  }
  async function liberarParaTodos() {
    const a = await salvarGrupos([])
    const b = await salvarEstudantes([])
    if (a && b) toast.success('Documento liberado para todos.')
  }

  if (carregando) return <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 p-3">
        <span className="flex items-center gap-2 text-sm">
          {liberadoTodos
            ? <><Globe className="h-4 w-4 text-emerald-600" /> Liberado para <strong>todos</strong> os alunos</>
            : <><Lock className="h-4 w-4 text-amber-600" /> Restrito aos grupos/alunos selecionados</>}
        </span>
        {!liberadoTodos && (
          <button onClick={liberarParaTodos} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}Liberar para todos
          </button>
        )}
      </div>

      {/* Grupos vinculados */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Users2 className="h-4 w-4" /> Grupos com acesso <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{atribuidos.length}</span></span>
          <AdicionarGrupoModuloDialog grupos={grupos} jaMarcados={new Set(atribuidos.map((g) => g.id))} onSelecionar={(ids) => salvarGrupos([...new Set([...atribuidos.map((g) => g.id), ...ids])])} />
        </div>
        {atribuidos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum grupo — liberado a todos (a menos que haja alunos individuais).</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {atribuidos.map((g) => (
              <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.cor || 'var(--primary)' }} />{g.nome}
                <button onClick={() => salvarGrupos(atribuidos.filter((x) => x.id !== g.id).map((x) => x.id))} className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Alunos individuais */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Alunos individuais <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{estudantes.length}</span></span>
          <AdicionarEstudantesDialog
            jaIds={new Set(estudantes.map((e) => e.id))}
            onSelecionar={(novos: AlunoSel[]) => {
              const map = new Map(estudantes.map((e) => [e.id, e]))
              for (const nv of novos) if (!map.has(nv.id)) map.set(nv.id, { id: nv.id, nome: nv.nome, email: nv.email, cpf: nv.cpf, classificacao: nv.classificacao, avatar: nv.avatar, perfil_avatar_cor: nv.perfil_avatar_cor })
              salvarEstudantes([...map.values()])
            }}
          />
        </div>
        {estudantes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum aluno individual.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {estudantes.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs">
                <AvatarEstudante nome={e.nome} avatar={e.avatar} cor={e.perfil_avatar_cor} className="h-[18px] w-[18px] text-[9px]" />{e.nome}
                <button onClick={() => salvarEstudantes(estudantes.filter((x) => x.id !== e.id))} className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
