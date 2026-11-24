import { createAdminClient } from '@/lib/supabase/server'
import { lerCfgMetas } from '@/lib/cronograma/adaptativo/config-metas'
import { valoresDoMotor } from '@/lib/revisao/cronograma'
import { RegrasClient } from '../../regras-client'
import { AvisoMigracao } from '../aviso-migracao'
import { regrasDaRequisicao, type PropsAbaAdaptativo } from '../comum'

// Sub-aba "Regras do cronograma" do Adaptativo (?aba=adaptativo&sub=regras). Não monta cobertura nem lista disciplinas.
export default async function AdaptativoRegras({ tenantId, podeEditar }: PropsAbaAdaptativo) {
  const svc = createAdminClient()
  const [regras, motor, cfg] = await Promise.all([regrasDaRequisicao(tenantId), valoresDoMotor(svc, tenantId), lerCfgMetas(svc, tenantId)])
  return (
    <>
      {!regras.migrado && <AvisoMigracao />}
      <RegrasClient inicial={regras.valores} motor={motor} migrado={regras.migrado} podeEditar={podeEditar} tiposBloqueados={cfg.tiposBloqueados ?? []} />
    </>
  )
}
