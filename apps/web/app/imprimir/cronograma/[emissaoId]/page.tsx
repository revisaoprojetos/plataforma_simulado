import { redirect } from 'next/navigation'
import { PrintButton } from '@/components/aluno/print-button'
import { CronogramaImprimivel } from '@/components/cronograma/cronograma-imprimivel'
import { getSessaoAluno } from '@/lib/aluno-session'
import { verificarRenderToken } from '@/lib/pdf/render-token'
import {
  abrirEmissao,
  abrirEmissaoParaRender,
  checksParaRender,
} from '@/app/aluno/(portal)/cronograma/emissoes-actions'
import { listarChecks } from '@/app/aluno/(portal)/cronograma/checks-actions'
import { registrarDownloadCronograma } from '@/app/aluno/(portal)/cronograma/download-actions'

export const dynamic = 'force-dynamic'

/**
 * O cronograma do aluno em folha A4.
 *
 * Duas entradas, o MESMO HTML:
 *
 * - **Gotenberg** (`?pdftoken=…&embed=1`): o worker manda o Gotenberg buscar esta página e
 *   devolve um PDF de verdade, baixável. O token é HMAC de vida curta assinado pelo web —
 *   é o que deixa o Chromium do Gotenberg abrir a página sem cookie de sessão.
 * - **Aluno direto** (`?print=1`): abre o diálogo de impressão do navegador. É a saída quando
 *   o worker/Gotenberg não está no ar, e o caminho que sempre funciona em dev.
 *
 * Uma implementação só do papel: fosse gerar o PDF por biblioteca, seriam dois lugares para a
 * grade divergir do que o aluno viu.
 *
 * Fica FORA de `(portal)` porque aquele layout traz sidebar, cabeçalho e animações de entrada
 * — nada disso vai para o papel. Por isso a página faz o próprio guard.
 */
export default async function ImprimirCronogramaPage({
  params,
  searchParams,
}: {
  params: Promise<{ emissaoId: string }>
  searchParams: Promise<{ pdftoken?: string; embed?: string }>
}) {
  const { emissaoId } = await params
  const sp = await searchParams

  // Token primeiro: é o caminho do Gotenberg, que não tem sessão nenhuma.
  const tok = verificarRenderToken(sp.pdftoken)
  const porToken = !!tok && tok.r === 'cronograma' && tok.id === emissaoId

  const sessao = porToken ? null : await getSessaoAluno()
  if (!porToken && !sessao) redirect('/aluno/entrar')

  const r = porToken
    ? await abrirEmissaoParaRender(emissaoId, tok!.t)
    : await abrirEmissao(emissaoId)

  if (!r.ok || !r.dados) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <p>{r.error ?? 'Cronograma não encontrado.'}</p>
      </div>
    )
  }

  const { emissao, grade, indisponivel } = r.dados
  if (indisponivel) {
    return (
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <p>Este cronograma saiu do catálogo, então não dá para remontar a grade para impressão.</p>
      </div>
    )
  }

  const checks = porToken
    ? await checksParaRender(emissaoId, tok!.t)
    : ((await listarChecks(emissaoId)).checks ?? {})

  // Só o caminho do aluno registra: o do Gotenberg já foi registrado quando o PDF foi pedido,
  // e contar de novo aqui inflaria o número com o render interno.
  if (!porToken) await registrarDownloadCronograma(emissaoId, 'pdf')

  // `embed=1` (Gotenberg) tira os controles: no PDF, um botão "Salvar como PDF" é lixo impresso.
  const semControles = porToken || sp.embed === '1'

  return (
    <>
      {!semControles && <PrintButton label="Imprimir / Salvar PDF" />}
      <CronogramaImprimivel
        grade={grade}
        paletaSlug={(emissao.formulario?.paleta as string) ?? 'revisao'}
        titulo={emissao.titulo}
        cronogramaNome={emissao.cronograma_nome}
        alunoNome={emissao.estudante_nome ?? sessao?.nome ?? null}
        geradoEm={emissao.criado_em}
        checks={checks}
      />
    </>
  )
}
