import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { verificarRenderToken } from '@/lib/pdf/render-token'
import { normalizarBuilder } from '@/lib/caderno-teste/tipos'
import type { DiscBanco } from '@/lib/caderno-teste/previa'
import type { PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { carregarQuestoesBancoCore, carregarDadosBancoCore } from '@/lib/caderno-teste/dados-banco'
import { PreviewCadernoTeste } from './preview-caderno-teste'

export const dynamic = 'force-dynamic'

const semPermissao = (msg = 'Sem permissão.') => <div className="p-6 text-sm text-muted-foreground">{msg}</div>

/**
 * Prévia (paginada em A4) de um grupo do caderno de teste — usada no iframe do admin E na ENTREGA do
 * aluno (folha "como fez"/correção, diagnóstico e caderno de questões), renderizada em PDF pelo worker.
 * Acesso: cookie do admin OU token de render assinado (Gotenberg, sem cookie) OU o id da sessão do aluno.
 * Sempre escopado ao tenant. Com sessão, o aluno vê APENAS a própria (força estudante = dono da sessão).
 * Renderiza os MESMOS componentes do editor (Previa/PreviaBlocos), então a prévia bate 1:1.
 */
export default async function ImprimirCadernoTestePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ grupo?: string; aluno?: string; embed?: string; gabarito?: string; semgab?: string; sessao?: string; pdftoken?: string }> }) {
  const { id: cadernoId } = await params
  const sp = await searchParams
  const grupoId = sp.grupo ?? ''
  const embed = sp.embed === '1'
  // "como fez" (semgab=1) esconde o gabarito oficial e mostra só as marcações; caso contrário revela a correção.
  const gabaritoLiberado = sp.semgab === '1' ? false : true

  const svc = createAdminClient()

  // ---- Acesso: token de render (Gotenberg) | sessão do aluno | admin ----
  let tenantId: string | null = null
  const tok = verificarRenderToken(sp.pdftoken)
  if (tok && tok.r === 'caderno-teste' && tok.id === cadernoId) {
    tenantId = tok.t
  } else if (sp.sessao) {
    const { data: sess } = await svc.from('simulado_sessoes_prova').select('tenant_id').eq('id', sp.sessao).maybeSingle()
    if (!sess) return semPermissao('Sessão não encontrada.')
    tenantId = (sess as any).tenant_id
  } else {
    const access = await getCurrentAccess()
    if (!access.tenantId || !(access.isAdmin || access.permissions.includes('questoes:view'))) return semPermissao()
    tenantId = access.tenantId
  }
  if (!tenantId) return semPermissao()

  const { data: cad } = await svc.from('simulado_cadernos_teste').select('nome, config').eq('id', cadernoId).eq('tenant_id', tenantId).maybeSingle()
  if (!cad) return semPermissao('Caderno não encontrado.')

  const builder = normalizarBuilder((cad as any).config, (cad as any).nome)
  const item = builder.itens.find((i) => i.id === grupoId) ?? builder.itens.find((i) => i.id === builder.ativo) ?? builder.itens[0]
  if (!item) return semPermissao('Grupo não encontrado.')

  let bancoId = builder.bancoId
  // Com sessão: o aluno é SEMPRE o dono da sessão (não aceita ?aluno de terceiros) e o banco vem do
  // SIMULADO da sessão (banco_base_id) — o mesmo caderno serve a vários simulados/disciplinas.
  let alunoId = sp.aluno
  const sessao = sp.sessao
  if (sessao) {
    const { data: sessB } = await svc.from('simulado_sessoes_prova').select('simulado_id, estudante_id').eq('id', sessao).eq('tenant_id', tenantId).maybeSingle()
    if ((sessB as any)?.estudante_id) alunoId = (sessB as any).estudante_id
    const simIdB = (sessB as any)?.simulado_id
    if (simIdB) {
      const { data: simB } = await svc.from('simulado_simulados').select('regras').eq('id', simIdB).eq('tenant_id', tenantId).maybeSingle()
      const bb = ((simB as any)?.regras as any)?.banco_base_id as string | undefined
      if (bb) bancoId = bb
    }
  }

  let vars: Record<string, string> = {}
  let disciplinas: DiscBanco[] = []
  let questoes: PreviewQuestao[] = []
  let respostas: Record<string, string> = {}
  if (bancoId) {
    if (item.modalidade === 'diagnostico') {
      try {
        const rd = await carregarDadosBancoCore(svc, tenantId, bancoId, { aluno: alunoId, sessao })
        disciplinas = rd.disciplinas.map((d) => ({ nome: d.nome, chave: d.chave, pilar: d.pilar }))
        const reg = alunoId ? rd.registros.find((r) => r.id === alunoId) : rd.registros[0]
        if (reg) vars = reg.vars
      } catch { /* segue com o conteúdo do modelo */ }
    } else {
      try { questoes = await carregarQuestoesBancoCore(svc, tenantId, bancoId) } catch { /* sem questões */ }
      // Folha "como fez" e caderno completo precisam das MARCAÇÕES do aluno (respostas) + suas variáveis.
      if (item.modalidade === 'folha_respostas' || item.modalidade === 'caderno_completo') {
        try {
          const rd = await carregarDadosBancoCore(svc, tenantId, bancoId, { aluno: alunoId, sessao })
          const reg = alunoId ? rd.registros.find((r) => r.id === alunoId) : rd.registros[0]
          if (reg) { vars = { ...vars, ...reg.vars }; respostas = reg.respostas }
        } catch { /* sem sessões/respostas — folha em branco */ }
      }
    }
  }

  return <PreviewCadernoTeste item={item} questoes={questoes} vars={vars} discBanco={disciplinas} standalone={!embed} respostas={respostas} gabaritoLiberado={gabaritoLiberado} />
}
