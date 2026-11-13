import type { createAdminClient } from '@/lib/supabase/server'
import { Nota } from '../../../_comp/lista'
import { listarSegmentosLeves, listarTrilhas } from '../dados-trilhas'
import { AVISO_MIGRACAO } from '../tipos-trilhas'
import { RegrasClient } from './regras-client'

// Aba “Regras”: para cada trilha, quais Segmentos do produto dão acesso a ela. Só LÊ dados prontos; a edição e a contagem
// de alunos acontecem pela rota JSON (../cronogramas/api).
export async function AbaRegras({ svc, tenantId, produtoId, podeEditar }: {
  svc: ReturnType<typeof createAdminClient>; tenantId: string; produtoId: string; podeEditar: boolean
}) {
  const { migrado, trilhas } = await listarTrilhas(svc, tenantId, produtoId)
  if (!migrado) return <Nota tipo="aviso">{AVISO_MIGRACAO} Até lá esta aba não funciona e nada é gravado.</Nota>
  const { segmentos, nomes } = await listarSegmentosLeves(svc, tenantId)
  return (
    <>
      <Nota tipo="info">
        <b>Como funciona:</b> o aluno cujos Segmentos casam em um cronograma de referência (antes "trilha") segue as datas dele. Casando em <b>vários cronogramas</b> (ex.: quem tem Passaporte Vitalício casa em todas),
        <b> recebe, por aula, a MENOR data</b>. Quem não casa em nenhuma trilha segue a data-base da planilha.
      </Nota>
      <RegrasClient produtoId={produtoId} trilhas={trilhas} segmentos={segmentos} nomesIniciais={nomes} podeEditar={podeEditar} />
    </>
  )
}
