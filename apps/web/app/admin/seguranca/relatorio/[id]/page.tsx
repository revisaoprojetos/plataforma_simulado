import { notFound } from 'next/navigation'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { BotaoImprimir, DiffVarredura } from '@/components/admin/seguranca/seguranca-ui'
import { detalheVarredura } from '@/lib/seguranca/leitura'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'

/** Versão imprimível do relatório de uma varredura (Ctrl+P / "Imprimir / salvar PDF"). */
export default async function RelatorioImprimivel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getCurrentAccess()
  if (!access.userId || !accessCan(access, 'seguranca:view')) return <SemPermissao>Sem permissão para ver a área de Segurança.</SemPermissao>
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const det = await detalheVarredura(id)
  if (!det) notFound()
  const v = det.varredura
  return (
    <div className="space-y-4">
      {/* Na impressão, esconde a navegação do admin. */}
      <style>{'@media print{aside,nav,header{display:none!important}main{padding:0!important}}'}</style>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Relatório de segurança</h1>
        <BotaoImprimir />
      </div>
      <p className="text-sm text-muted-foreground">
        Varredura de {formatBrt(v.iniciado_em) ?? '—'} · origem {v.origem} · {v.total_achados} achado(s): {v.criticos} crítico(s), {v.altos} alto(s), {v.medios} médio(s), {v.baixos} baixo(s)
      </p>
      <DiffVarredura det={det} />
    </div>
  )
}
