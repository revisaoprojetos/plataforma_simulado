import { FlaskConical } from 'lucide-react'
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
      <BancoCadernoMontagem bancoId={bancoId} cor={cor} entregaInicial={montagem.entrega} grupos={montagem.grupos} discursivo={montagem.discursivo} />

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
