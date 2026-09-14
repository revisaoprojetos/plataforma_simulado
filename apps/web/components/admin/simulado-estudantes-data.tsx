import { listarEstudantesSimulado } from '@/app/admin/simulados/actions'
import { SimuladoEstudantes } from '@/components/admin/simulado-estudantes'

/**
 * Wrapper SERVER da aba Estudantes: carrega a lista no servidor (1 query JOIN via SQL/API — rápido) e
 * a entrega pronta ao componente client. Assim o prefetch da aba pré-carrega os dados e não há spinner
 * no 1º acesso. Renderizar dentro de <Suspense> para o shell aparecer na hora e a lista streamar.
 */
export async function SimuladoEstudantesData({ simuladoId, acessoGratuitoInicial, bancoBaseId }: { simuladoId: string; acessoGratuitoInicial: boolean; bancoBaseId: string | null }) {
  const r = await listarEstudantesSimulado(simuladoId)
  return (
    <SimuladoEstudantes
      simuladoId={simuladoId}
      acessoGratuitoInicial={acessoGratuitoInicial}
      bancoBaseId={bancoBaseId}
      estudantesIniciais={r.estudantes ?? []}
      erroInicial={r.error ?? null}
    />
  )
}
