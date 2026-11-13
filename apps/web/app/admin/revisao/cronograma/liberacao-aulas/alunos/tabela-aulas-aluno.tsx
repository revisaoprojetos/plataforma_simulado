'use client'

import { useState, type ReactNode } from 'react'
import { Lock, LockOpen, ShieldPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Pilula } from '../../../_comp/lista'
import type { ExplicacaoAula } from '@/lib/produtos/liberacao-consulta-aluno'
import { ExcecaoDialogoControlado } from './excecao-dialogo'
import { dataBrIso, type AlunoOpcao, type AulaOpt, type GrupoOpcao, type ModuloOpcao } from './tipos-alunos'

// Tabela do painel do aluno: aulas já explicadas pelo SERVIDOR (explicarLiberacaoAluno). Aqui só há o botão de exceção.

const TIPO_ORIGEM = { excecao: 'vio', meta: 'ok', plano: 'vio', trilha: 'vio', planilha: 'mut', 'sem-regra': 'mut', desligado: 'mut' } as const

export function TabelaAulasAluno({ produtoId, aluno, linhas, head, podeEditar, aulas, modulos, grupos }: {
  produtoId: string; aluno: AlunoOpcao; linhas: ExplicacaoAula[]; head: ReactNode; podeEditar: boolean
  aulas: AulaOpt[]; modulos: ModuloOpcao[]; grupos: GrupoOpcao[]
}) {
  const [alvo, setAlvo] = useState<{ id: string; acao: 'liberar' | 'bloquear' } | null>(null)
  return (
    <>
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b bg-muted/40"><tr>{head}</tr></thead>
            <tbody className="divide-y">
              {linhas.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nenhuma aula encontrada.</td></tr>}
              {linhas.map((l) => (
                <tr key={l.aulaId} className="align-top hover:bg-muted/30">
                  <td className="px-3 py-2"><span className="block font-medium">{l.titulo}</span><span className="text-xs text-muted-foreground">{l.disciplina}</span></td>
                  <td className="px-3 py-2 tabular-nums">{l.dataEfetiva ? dataBrIso(l.dataEfetiva) : '—'}</td>
                  <td className="px-3 py-2"><Pilula tipo={TIPO_ORIGEM[l.origem]}>{l.origemRotulo}</Pilula></td>
                  <td className="px-3 py-2">
                    {l.liberada
                      ? <Pilula tipo="ok"><LockOpen className="h-3 w-3" />Liberada</Pilula>
                      : <Pilula tipo="bad"><Lock className="h-3 w-3" />Bloqueada</Pilula>}
                  </td>
                  <td className="max-w-[28rem] px-3 py-2 text-muted-foreground">{l.porque}</td>
                  {podeEditar && (
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setAlvo({ id: l.aulaId, acao: l.liberada ? 'bloquear' : 'liberar' })}>
                        <ShieldPlus />{l.liberada ? 'Bloquear' : 'Liberar'}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {alvo && (
        <ExcecaoDialogoControlado key={alvo.id + alvo.acao} produtoId={produtoId} aulas={aulas} modulos={modulos} grupos={grupos} fixoAluno={aluno}
          inicial={{ tipo: 'aula', id: alvo.id, acao: alvo.acao }} titulo={`Exceção para ${aluno.nome}`} onFechar={() => setAlvo(null)} />
      )}
    </>
  )
}

/** Botão do cabeçalho do painel: nova exceção (aulas ou módulos) para este aluno. */
export function BotaoExcecaoAluno({ produtoId, aluno, aulas, modulos, grupos }: { produtoId: string; aluno: AlunoOpcao; aulas: AulaOpt[]; modulos: ModuloOpcao[]; grupos: GrupoOpcao[] }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}><ShieldPlus />Criar exceção</Button>
      {aberto && <ExcecaoDialogoControlado produtoId={produtoId} aulas={aulas} modulos={modulos} grupos={grupos} fixoAluno={aluno} titulo={`Exceção para ${aluno.nome}`} onFechar={() => setAberto(false)} />}
    </>
  )
}
