import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { checkPermission } from '@/lib/auth/permissions'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { PartesDasMetasPainel } from '../../partes-das-metas-painel'

export const dynamic = 'force-dynamic'

// Ponto de entrada: criar as PARTES dos documentos a partir das faixas que as metas já usam (LegProc; PDFlash/PDFight sem divisão).
// A prévia e a aplicação são feitas pela rota /api/admin/biblioteca/partes/das-metas (backend-first); aqui só se hospeda o painel.
export default async function PartesDasMetasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await checkPermission('configuracoes:view'))) return <SemAcessoArea />
  const podeEditar = await checkPermission('configuracoes:update')
  const sp = await searchParams
  const tipo = sp.tipo === 'pdflash' || sp.tipo === 'pdfight' ? sp.tipo : 'legproc'
  return (
    <div className="space-y-4 p-4">
      <Link href={sp.doc ? `/admin/biblioteca/conteudo/${sp.doc}/gerenciar` : '/admin/biblioteca'} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {sp.doc ? 'Voltar ao documento' : 'Biblioteca'}
      </Link>
      <PartesDasMetasPainel tipo={tipo} pastaId={sp.pasta || undefined} documentoId={sp.doc || undefined} podeEditar={podeEditar} />
    </div>
  )
}
