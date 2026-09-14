'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Wrench, Loader2, ShieldAlert, MoreVertical, UserCheck,
  PenLine, ClipboardList, BookOpen, BookMarked, Database, BarChart3, Trophy, GraduationCap, Users, Layers, Plug, CalendarRange,
} from 'lucide-react'
import { toast } from 'sonner'
import { AlertBox } from '@/components/ui/alert-box'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { SeletorLiberadosDialog, type PessoaItem } from '@/components/admin/seletor-liberados-dialog'
import type { AreaManutencao } from '@/lib/sistema/manutencao-areas'
import { salvarManutencaoAreas, salvarManutencaoAluno } from '@/app/admin/sistema/actions'

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  discursiva: PenLine, simulados: ClipboardList, questoes: BookOpen, banco: Database,
  relatorios: BarChart3, gamificacao: Trophy, matriculas: GraduationCap, grupos: Layers,
  integracoes: Plug, estudantes: Users, leitura: BookMarked, cronograma: CalendarRange,
}

/**
 * Form de "páginas em manutenção" reutilizado nas duas sub-abas:
 *  - tipo='admin'  → áreas do painel; allowlist = ADMINISTRADORES liberados.
 *  - tipo='aluno'  → áreas do portal do aluno; allowlist = ALUNOS liberados.
 * Cada linha tem o liga/desliga + um menu de 3 pontos com "Quem pode visualizar" (allowlist).
 */
export function ManutencaoPaginasForm({ tipo, areas, ativosIniciais, liberadosIniciais, nomesIniciais }: {
  tipo: 'admin' | 'aluno'
  areas: AreaManutencao[]
  ativosIniciais: Record<string, boolean>
  liberadosIniciais: Record<string, string[]>
  nomesIniciais: PessoaItem[]
}) {
  const router = useRouter()
  const [ativos, setAtivos] = useState<Record<string, boolean>>(ativosIniciais)
  const [liberados, setLiberados] = useState<Record<string, string[]>>(liberadosIniciais)
  const [nomes, setNomes] = useState<PessoaItem[]>(nomesIniciais)
  const [pending, start] = useTransition()
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null)
  const [dialogKey, setDialogKey] = useState<string | null>(null)

  const modoAllowlist = tipo === 'admin' ? 'admin' : 'estudante'
  const bloqueadas = areas.filter((a) => ativos[a.key]).length

  async function persistir(novoAtivos: Record<string, boolean>, novoLiberados: Record<string, string[]>) {
    return tipo === 'admin'
      ? salvarManutencaoAreas(novoAtivos, novoLiberados)
      : salvarManutencaoAluno(novoAtivos, novoLiberados)
  }

  function toggle(key: string, valor: boolean) {
    const antAtivos = ativos
    const novo = { ...ativos, [key]: valor }
    setAtivos(novo)
    setSalvandoKey(key)
    start(async () => {
      const r = await persistir(novo, liberados)
      setSalvandoKey(null)
      if (r?.error) { setAtivos(antAtivos); toast.error(r.error); return }
      toast.success(valor ? 'Área colocada em manutenção' : 'Área reativada')
      router.refresh()
    })
  }

  function confirmarLiberados(key: string, ids: string[], itens: PessoaItem[]) {
    const antLiberados = liberados
    const novo = { ...liberados, [key]: ids }
    setLiberados(novo)
    // Atualiza o cache de nomes p/ os chips/contagens.
    setNomes((prev) => {
      const m = new Map(prev.map((p) => [p.id, p]))
      for (const it of itens) m.set(it.id, it)
      return [...m.values()]
    })
    setSalvandoKey(key)
    start(async () => {
      const r = await persistir(ativos, novo)
      setSalvandoKey(null)
      if (r?.error) { setLiberados(antLiberados); toast.error(r.error); return }
      toast.success(ids.length ? `${ids.length} liberado(s) para ver a área` : 'Ninguém liberado nesta área')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <AlertBox variante="info" icon={Wrench} titulo={tipo === 'admin' ? 'Manutenção por área (painel)' : 'Manutenção por área (portal do aluno)'}>
        {tipo === 'admin' ? (
          <>Ligue o botão de uma área para colocá-la <b>em manutenção</b>: ela some do menu e fica inacessível
            (mostra “em manutenção” a quem abrir). Use os <b>3 pontos</b> → <b>Quem pode visualizar</b> para liberar
            administradores específicos mesmo com a área em manutenção.</>
        ) : (
          <>Ligue o botão para colocar a área do <b>aluno</b> em manutenção: ela some do menu do portal e fica
            inacessível para os alunos. Use os <b>3 pontos</b> → <b>Quem pode visualizar</b> para liberar apenas
            <b> alguns alunos</b> (ex.: testadores) enquanto os demais ficam bloqueados.</>
        )}
      </AlertBox>

      {bloqueadas > 0 && (
        <AlertBox variante="aviso" icon={ShieldAlert}>
          {bloqueadas === 1 ? '1 área está' : `${bloqueadas} áreas estão`} em manutenção agora.
        </AlertBox>
      )}

      <div className="space-y-2">
        {areas.map((a) => {
          const Icon = ICONES[a.key] ?? Wrench
          const on = !!ativos[a.key]
          const salvando = salvandoKey === a.key && pending
          const liberadosArea = liberados[a.key] ?? []
          const nomesArea = liberadosArea.map((id) => nomes.find((n) => n.id === id)).filter(Boolean) as PessoaItem[]
          return (
            <div key={a.key} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{a.label}</p>
                  {on && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">Em manutenção</span>}
                  {a.discursiva && <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Bloqueio completo</span>}
                  {liberadosArea.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" title={nomesArea.map((n) => n.nome).join(', ')}>
                      <UserCheck className="h-3 w-3" /> {liberadosArea.length} liberado{liberadosArea.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.descricao}</p>
              </div>

              {/* 3 pontos — "Quem pode visualizar" (allowlist) */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted"
                  title="Quem pode visualizar" aria-label={`Configurar quem pode visualizar: ${a.label}`}>
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setDialogKey(a.key)}>
                    <UserCheck className="mr-2 h-4 w-4" />
                    Quem pode visualizar{liberadosArea.length > 0 ? ` (${liberadosArea.length})` : ''}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button" role="switch" aria-checked={on} aria-label={`Manutenção: ${a.label}`}
                disabled={salvando}
                onClick={() => toggle(a.key, !on)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-amber-500' : 'bg-muted-foreground/30'}`}
              >
                {salvando
                  ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-white" />
                  : <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />}
              </button>

              <SeletorLiberadosDialog
                open={dialogKey === a.key}
                onOpenChange={(o) => setDialogKey(o ? a.key : null)}
                modo={modoAllowlist}
                titulo={`Quem pode visualizar — ${a.label}`}
                descricao={tipo === 'admin'
                  ? 'Administradores escolhidos continuam acessando esta área mesmo em manutenção.'
                  : 'Alunos escolhidos continuam vendo esta área mesmo em manutenção (o restante fica bloqueado).'}
                selecionadosIniciais={liberadosArea}
                nomesIniciais={nomesArea}
                onConfirmar={(ids, itens) => confirmarLiberados(a.key, ids, itens)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
