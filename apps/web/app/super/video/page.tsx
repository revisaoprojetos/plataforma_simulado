import { lerLinhaVideoConfig } from '@/lib/video/config'
import { tentarDescriptografar } from '@/lib/crypto'
import { URL_INTERNA_PADRAO, PREFIXO_PADRAO, type VideoConfigPublica } from '@/lib/video/config-tipos'
import { VideoConfigClient } from './video-config-client'

// Layout /super já garante isSuperAdmin(). Segredos NUNCA vão ao cliente: só "configurado" + 4 últimos da chave.
export const dynamic = 'force-dynamic'

export default async function VideoConfigPage() {
  const l = await lerLinhaVideoConfig()
  const chave = tentarDescriptografar(l?.chave_integracao_enc) ?? ''
  const inicial: VideoConfigPublica = {
    urlInterna: l?.url_interna ?? URL_INTERNA_PADRAO,
    prefixoPublico: l?.prefixo_publico ?? PREFIXO_PADRAO,
    ativo: !!l?.ativo,
    chaveConfigurada: !!l?.chave_integracao_enc,
    chaveFim: chave ? chave.slice(-4) : null,
    adminEmail: l?.admin_email ?? '',
    adminSenhaConfigurada: !!l?.admin_senha_enc,
    atualizadoEm: l?.atualizado_em ?? null,
  }
  return <VideoConfigClient inicial={inicial} tabelaExiste={l !== null} />
}
