import { redirect } from 'next/navigation'
import { PrintButton } from '@/components/aluno/print-button'
import { CronogramaImprimivel } from '@/components/cronograma/cronograma-imprimivel'
import { getSessaoAluno } from '@/lib/aluno-session'
import { abrirEmissao } from '@/app/aluno/(portal)/cronograma/emissoes-actions'
import { listarChecks } from '@/app/aluno/(portal)/cronograma/checks-actions'
import { registrarDownloadCronograma } from '@/app/aluno/(portal)/cronograma/download-actions'

export const dynamic = 'force-dynamic'

/**
 * O cronograma do aluno em folha, para salvar como PDF.
 *
 * Usa o caminho de impressão que a plataforma já tem (`/imprimir/...` + PrintButton → "Salvar
 * como PDF" do navegador) em vez de uma biblioteca de PDF. Duas razões:
 *
 * 1. A rota de PDF que existe aqui (caderno-teste) depende de um Chrome/Edge instalado na
 *    máquina e devolve 503 quando não acha nenhum. Para algo que o aluno usa direto, uma
 *    exportação que falha conforme o servidor é pior do que uma que sempre funciona.
 * 2. O PDF sai do MESMO HTML que a tela mostra. Uma segunda implementação — jsPDF, pdf-lib —
 *    seria um segundo lugar para a grade divergir do que o aluno viu.
 *
 * Fica FORA de `(portal)` porque o layout do portal traz sidebar, cabeçalho e as animações de
 * entrada — tudo que não pode ir para o papel. Por isso a página repete o guard de sessão.
 */
export default async function ImprimirCronogramaPage({
  params,
}: {
  params: Promise<{ emissaoId: string }>
}) {
  const { emissaoId } = await params

  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  // `abrirEmissao` já confere que a emissão é DESTE aluno e remonta a grade a partir do
  // formulário salvo — é a mesma função da tela, então o papel não pode divergir dela.
  const r = await abrirEmissao(emissaoId)
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

  const c = await listarChecks(emissaoId)
  // Registro do download: best-effort, nunca bloqueia a impressão.
  await registrarDownloadCronograma(emissaoId, 'pdf')

  return (
    <>
      <PrintButton label="Salvar como PDF" />
      <CronogramaImprimivel
        grade={grade}
        paletaSlug={(emissao.formulario?.paleta as string) ?? 'revisao'}
        titulo={emissao.titulo}
        cronogramaNome={emissao.cronograma_nome}
        alunoNome={sessao.nome ?? null}
        geradoEm={emissao.criado_em}
        checks={c.checks ?? {}}
      />
    </>
  )
}
