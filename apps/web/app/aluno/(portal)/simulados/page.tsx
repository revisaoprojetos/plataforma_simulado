import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { ClipboardList } from 'lucide-react'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { resolverGruposCatalogo } from '@/lib/aluno/grupos-catalogo'
import { MeusSimuladosCatalogo } from '@/components/aluno/meus-simulados-catalogo'

export default async function MeusSimuladosPage() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  // Simulados atribuídos: matrícula (liberada) + acesso avulso. O passaporte NÃO enxerga
  // tudo automaticamente — recebe matrícula via grupo "Passaporte" vinculado ao banco.
  const [{ data: mats }, { data: acs }, { data: sessAll }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id').eq('estudante_id', estId),
    // Sessões dela (independem do acesso ATUAL): garantem que os simulados JÁ FEITOS apareçam
    // em "Concluídos" mesmo se a matrícula/acesso mudou depois de concluir (histórico não some).
    svc.from('simulado_sessoes_prova').select('id, simulado_id, status, nota, finalizado_em, tentativa_num').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
  ])
  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
  ].filter(Boolean))]

  let simulados: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  if (ids.length) {
    const { data: sims } = await svc.from('simulado_simulados').select('id, titulo, modo_aplicacao, status, data_inicio, data_fim, embed_token, regras, created_at').in('id', ids).eq('deletado', false)
    simulados = sims ?? []
    for (const s of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(s.simulado_id) ?? []; arr.push(s); sessoesPorSim.set(s.simulado_id, arr) }
  }

  // Classifica cada simulado (o `vis` visual e os grupos vêm DEPOIS, em paralelo — não bloqueiam aqui).
  const itens = simulados.map((s) => {
    const sess = sessoesPorSim.get(s.id) ?? []
    const finalizadas = sess.filter((x) => x.status === 'finalizada')
    const emAndamento = sess.some((x) => x.status !== 'finalizada')
    const notas = finalizadas.map((x) => (x.nota != null ? Number(x.nota) : null)).filter((n): n is number => n != null)
    const melhor = notas.length ? Math.max(...notas) : null
    const concluido = finalizadas.length > 0
    const { notaLiberada } = resolverLiberacoes(s.regras, s)
    return { ...s, concluido, emAndamento, tentativas: finalizadas.length, melhor, notaLiberada }
  })

  const concluidos = itens
    .filter((i) => i.concluido)
    // Mais recente → mais antigo (mesma antiguidade do catálogo).
    .sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())

  if (concluidos.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meus simulados</h1>
          <p className="text-muted-foreground">Seus simulados concluídos — com notas e resultados. Os liberados para fazer estão em <Link href="/aluno/simulado" className="font-medium text-primary hover:underline">Simulados</Link>.</p>
        </div>
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">Você ainda não concluiu nenhum simulado. Veja os disponíveis em <Link href="/aluno/simulado" className="font-medium text-primary hover:underline">Simulado</Link>.</p>
        </div>
      </div>
    )
  }

  // Visual (capa/cor) + grupo (pasta) de cada concluído — leituras independentes, em PARALELO.
  const [visual, { grupoPorSim, grupos }] = await Promise.all([
    resolverVisualSimulados(svc, concluidos.map((s: any) => ({ id: s.id, regras: s.regras }))),
    resolverGruposCatalogo(svc, concluidos.map((s: any) => ({ id: s.id, regras: s.regras }))),
  ])
  const concluidosCat = concluidos.map((s: any) => ({
    id: s.id, titulo: s.titulo, modo_aplicacao: s.modo_aplicacao, tentativas: s.tentativas,
    melhor: s.melhor, notaLiberada: s.notaLiberada, vis: visual.get(s.id) ?? null, grupoId: grupoPorSim.get(s.id) ?? null,
  }))

  return <MeusSimuladosCatalogo itens={concluidosCat} grupos={grupos} />
}
