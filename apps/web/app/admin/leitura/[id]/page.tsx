import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { GitCompare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { buttonVariants } from '@/components/ui/button'
import { LeituraEditor } from '@/components/admin/leitura-editor'
import { listarMaterias, type Documento } from '../actions'

export const dynamic = 'force-dynamic'

export default async function LeituraEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await checkPermission('leitura:view'))) redirect('/admin')
  const access = await getCurrentAccess()
  if (!access.tenantId) redirect('/admin')

  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_documentos').select('*').eq('id', id).eq('tenant_id', access.tenantId).eq('deletado', false).maybeSingle()
  if (!doc) notFound()
  const versao = (doc as any).versao ?? 1
  const publicadaVersao = (doc as any).versao_publicada ?? versao
  const rascunhoVersao = (doc as any).versao_rascunho ?? versao
  // O admin edita/pré-visualiza o RASCUNHO (A2); genéricos usam a versão única.
  const { data: cont } = await svc.from('simulado_documento_conteudos').select('html, artigos').eq('documento_id', id).eq('versao', rascunhoVersao).maybeSingle()

  const d = doc as any
  const documento: Documento = {
    id: d.id, titulo: d.titulo, descricao: d.descricao ?? null,
    cor: d.cor ?? null, icone: d.icone ?? null, capa_url: d.capa_url ?? null,
    pasta_id: d.pasta_id ?? null, versao, publicado: !!d.publicado,
    desafio_ativo: !!d.desafio_ativo, desafio_exige_fim: !!d.desafio_exige_fim,
    desafio_tempo_min: d.desafio_tempo_min ?? null, artigos: (cont as any)?.artigos ?? 0,
    // metadados de lei (podem ser null se a migração A1 ainda não rodou)
    materia_id: d.materia_id ?? null, tipo_norma: d.tipo_norma ?? null, numero: d.numero ?? null, ano: d.ano ?? null,
    titulo_oficial: d.titulo_oficial ?? null, ementa: d.ementa ?? null, slug: d.slug ?? null, esfera: d.esfera ?? null,
    fonte_oficial: d.fonte_oficial ?? null, ultima_verificacao: d.ultima_verificacao ?? null, ordem: d.ordem ?? null,
    situacao_editorial: d.situacao_editorial ?? 'em_preparacao',
  }
  const materias = (await listarMaterias()).itens ?? []
  const temRascunhoPendente = rascunhoVersao > publicadaVersao
  // Só oferece o antes/depois quando há o que comparar (rascunho pendente ou 2+ versões publicadas).
  const podeComparar = temRascunhoPendente || publicadaVersao > 1

  return (
    <div className="space-y-3">
      {podeComparar && (
        <div className="flex justify-end">
          <Link href={`/admin/leitura/${id}/alteracoes`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <GitCompare className="mr-1.5 h-4 w-4" /> Alterações (antes/depois)
          </Link>
        </div>
      )}
      <LeituraEditor
        documento={documento}
        htmlAtual={(cont as any)?.html ?? ''}
        podeEditar={await checkPermission('leitura:update')}
        podePublicar={await checkPermission('leitura:publicar')}
        materias={materias}
        publicadaVersao={publicadaVersao}
        temRascunhoPendente={temRascunhoPendente}
        versaoEdicao={rascunhoVersao}
      />
    </div>
  )
}
