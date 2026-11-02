import { Lock } from 'lucide-react'

/**
 * "Sem acesso" para rotas NOVAS do Estúdio que ainda não têm entrada no AREA_PERM do layout
 * (grupos, acesso). Não editamos o layout — o gate é feito na própria página (checkPermission) e
 * cai aqui quando o cargo não tem a permissão. Admins (acesso total) nunca veem isto.
 */
export function SemAcessoArea({ mensagem }: { mensagem?: string }) {
  return (
    <div className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/30 p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Lock className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-semibold">Sem acesso a esta área</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {mensagem ?? 'Seu cargo não tem permissão para acessá-la. Fale com um administrador se precisar de acesso.'}
      </p>
    </div>
  )
}
