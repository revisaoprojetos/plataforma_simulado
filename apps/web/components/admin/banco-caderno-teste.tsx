import { FlaskConical, PackageCheck } from 'lucide-react'
import { listarCadernosTesteDoBanco, carregarMontagem } from '@/app/admin/cadernos-teste/actions'
import { NovoCadernoTesteBtn } from '@/components/admin/caderno-teste-novo-btn'
import { BancoCadernoTesteClient } from '@/components/admin/banco-caderno-teste-client'
import { BancoCadernoMontagem } from '@/components/admin/banco-caderno-montagem'

/** Aba "Caderno teste" do banco: MONTAGEM (slots do aluno) + lista dos cadernos criados no construtor. */
export async function BancoCadernoTeste({ bancoId, cor = '#6d28d9' }: { bancoId: string; cor?: string }) {
  const [cadernos, montagem] = await Promise.all([listarCadernosTesteDoBanco(bancoId), carregarMontagem(bancoId)])

  return (
    <div className="space-y-4">
      {/* MONTAGEM — o que o aluno recebe em cada slot (feito nos cadernos do construtor abaixo). */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><PackageCheck className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Entrega do aluno</h3>
            <p className="text-xs text-muted-foreground">Selecione o caderno (feito no construtor) ou PDF de cada slot</p>
          </div>
        </div>
        <div className="p-4">
          {montagem.grupos.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhuma peça criada ainda. Crie um caderno no construtor abaixo para poder selecionar aqui.
            </div>
          ) : (
            <BancoCadernoMontagem bancoId={bancoId} cor={cor} entregaInicial={montagem.entrega} grupos={montagem.grupos} pdfs={montagem.pdfs} />
          )}
        </div>
      </div>

      {/* CONSTRUTOR — cadernos deste banco (montar/editar/apagar as peças). */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><FlaskConical className="h-5 w-5" /></span>
            <div>
              <h3 className="text-sm font-semibold leading-tight">Cadernos do construtor</h3>
              <p className="text-xs text-muted-foreground">Monte “modelo + ajustes” — {cadernos.length} caderno(s)</p>
            </div>
          </div>
          <NovoCadernoTesteBtn bancoId={bancoId} />
        </div>

        <div className="p-4">
          {cadernos.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <FlaskConical className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nenhum caderno de teste para este banco.</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Crie um para montar o material no construtor (escolha um modelo, ajuste os blocos e a prévia usa os dados reais deste banco).</p>
            </div>
          ) : (
            <BancoCadernoTesteClient bancoId={bancoId} cor={cor} cadernos={cadernos} />
          )}
        </div>
      </div>
    </div>
  )
}
