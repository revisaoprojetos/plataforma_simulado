import { notFound } from 'next/navigation'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { lerRascunhoOuSeed } from '@/lib/produtos/pagina/actions-base'
import { carregarDadosPagina } from '@/lib/produtos/pagina/loader'
import { EditorShell } from '@/components/produtos/pagina/editor/editor-shell'

export const dynamic = 'force-dynamic'

// EDITOR VISUAL da página do extensivo (tela cheia). Só LÊ: rascunho → publicado → seed legado (nada é gravado ao abrir).
export default async function PaginaEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentAccess()
  const podeEditar = access.isAdmin || access.permissions.includes('produtos:manage')
  if (!podeEditar) return <SemAcessoArea mensagem="Editar a página do extensivo exige a permissão de gerenciar produtos." />
  if (!access.tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>
  const { id } = await params
  const voltarHref = `/admin/conteudos/produtos/${id}`

  const r = await lerRascunhoOuSeed(id)
  if ('error' in r) { if (r.error === 'Produto não encontrado.') notFound(); return <SemAcessoArea mensagem={r.error} /> }
  const dados = await carregarDadosPagina(id, r.pagina, { tenantId: access.tenantId, voltar: { href: '#', rotulo: 'Voltar' } })
  if (!dados) notFound()

  const aviso = r.origem === 'legado' ? 'Esta página ainda usa o formato antigo. Ao salvar, ela passa para o editor visual.' : r.semRascunho ? 'Editando a partir da versão publicada. Salve como rascunho para não afetar os alunos.' : null
  return <EditorShell inicial={r.pagina} dadosAmostra={dados} produtoId={id} slug={dados.produto.slug} voltarHref={voltarHref} aviso={aviso} />
}
