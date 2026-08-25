import { FlaskConical, PackageCheck } from 'lucide-react'
import { listarCadernosTesteDoBanco, carregarMontagem } from '@/app/admin/cadernos-teste/actions'
import { BancoCadernoTesteClient } from '@/components/admin/banco-caderno-teste-client'
import { BancoCadernoMontagem } from '@/components/admin/banco-caderno-montagem'
import { ConstrutorColapsavel } from '@/components/admin/banco-caderno-construtor-colapsavel'

/** Aba "Caderno" do banco: ENTREGA (cada card cria/edita/importa direto) + construtor colapsado. */
export async function BancoCadernoTeste({ bancoId, cor = '#6d28d9' }: { bancoId: string; cor?: string }) {
  const [cadernos, montagem] = await Promise.all([listarCadernosTesteDoBanco(bancoId), carregarMontagem(bancoId)])

  return (
    <div className="space-y-4">
      {/* ENTREGA — o que o aluno recebe. Cada card cria/edita/importa direto (sem selecionar de lista). */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><PackageCheck className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Entrega do aluno</h3>
            <p className="text-xs text-muted-foreground">Clique em cada card para criar/editar. Gabarito e Enunciado também aceitam PDF importado — sem precisar montar caderno antes.</p>
          </div>
        </div>
        <div className="p-4">
          <BancoCadernoMontagem bancoId={bancoId} cor={cor} entregaInicial={montagem.entrega} grupos={montagem.grupos} discursivo={montagem.discursivo} />
        </div>
      </div>

      {/* CONSTRUTOR — escondido atrás de um botão e INTACTO: não apaga nem mexe nos cadernos já criados
          aqui (que outros simulados podem usar). A criação do dia a dia acontece nos cards acima. */}
      <ConstrutorColapsavel bancoId={bancoId} cor={cor} count={cadernos.length}>
        {cadernos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <FlaskConical className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhum caderno avançado para este banco.</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Normalmente você não precisa vir aqui — crie tudo pelos cards da <strong>Entrega do aluno</strong> acima. Esta área é só para gerenciar cadernos existentes.</p>
          </div>
        ) : (
          <BancoCadernoTesteClient bancoId={bancoId} cor={cor} cadernos={cadernos} />
        )}
      </ConstrutorColapsavel>
    </div>
  )
}
