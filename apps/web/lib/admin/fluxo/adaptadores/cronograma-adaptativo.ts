import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { lerRegistroRegras } from '@/lib/cronograma/adaptativo/config-regras'
import { montarFluxo } from '@/lib/cronograma/adaptativo/fluxo-regras'
import { aplicarPatchRegras, camposDoNo } from '@/lib/cronograma/adaptativo/fluxo-edicao'
import { salvarRegrasComTrava } from '@/app/admin/cronogramas/adaptativo/inteligencia-actions'
import { hashRegras } from '@/lib/cronograma/adaptativo/regras'
import { CATALOGO, compilarRegrasUsuario } from '@/lib/cronograma/adaptativo/regras-usuario'
import { verificarRegrasMotor } from '@/lib/cronograma/adaptativo/verificar-regras'
import { exigeConfirmacao, resumirTrava } from '@/lib/cronograma/adaptativo/impacto-regras'
import { rodarAmostraTrava } from '@/lib/cronograma/adaptativo/inteligencia-server'
import { TIPOS_NO_USUARIO } from '../overlay'
import type { DadosFluxo, EdicaoNo, FluxoAdaptador } from '../adaptador'

/** Adaptador do Cronograma ADAPTATIVO: diagramas de `montarFluxo` + edição das regras do motor (mesmo caminho da aba Faixas e limites). */
export const adaptadorCronogramaAdaptativo: FluxoAdaptador = {
  id: 'cronograma-adaptativo',
  titulo: 'Fluxo do Cronograma Adaptativo',
  descricao: 'Do cadastro ao plano gravado e as árvores de decisão, geradas das regras vigentes. Clique em uma etapa para ler e editar os valores da regra.',
  permVer: 'cronogramas:view',
  permEditar: 'cronogramas:update',
  href: '/admin/cronogramas/adaptativo/fluxo',

  construtor: {
    executavel: true,
    tiposNo: [...TIPOS_NO_USUARIO],
    escopo: 'Nós de Condição e Ação ligados entre si viram regras que o motor aplica (catálogo fechado, sem código livre). Os demais nós (etapa, decisão, aviso, nota…) são anotações. Sem nenhuma regra, o cronograma é gerado exatamente como antes.',
    catalogo: CATALOGO,
    async avaliar(ctx, overlay) {
      const r = await lerRegistroRegras(createAdminClient(), ctx.tenantId)
      const c = compilarRegrasUsuario(r.regras, overlay)
      return { erros: c.erros, avisos: c.avisos, diagnosticos: c.diagnosticos }
    },
    async verificar(ctx, overlay) {
      const r = await lerRegistroRegras(createAdminClient(), ctx.tenantId)
      // verifica as regras EFETIVAS (vigentes + regras do usuário compiladas), que é o que o motor usaria
      return verificarRegrasMotor(compilarRegrasUsuario(r.regras, overlay).regras)
    },
    async antesDeSalvar(ctx, anterior, novo, confirmarRisco) {
      const svc = createAdminClient()
      const vig = await lerRegistroRegras(svc, ctx.tenantId)
      const velha = compilarRegrasUsuario(vig.regras, anterior).regras, nova = compilarRegrasUsuario(vig.regras, novo).regras
      if (hashRegras(velha) === hashRegras(nova)) return { ok: true }
      const { itens } = await rodarAmostraTrava(svc, ctx.tenantId, velha, nova, 20)
      const s = resumirTrava(itens)
      if (exigeConfirmacao(s) && !confirmarRisco) return { ok: false, error: 'Confirme o risco detectado.', confirmar: { titulo: 'Risco detectado na amostra de planos', mensagem: `As regras do fluxo mudam o motor. Na amostra de ${s.planos} plano(s): ${s.totalDivergentes} meta(s) concluída(s) divergente(s) e ${s.novosErros} plano(s) que passam a falhar na geração. Salvar mesmo assim? Planos já gravados não mudam.` } }
      return { ok: true }
    },
  },

  async carregar(ctx): Promise<DadosFluxo> {
    const r = await lerRegistroRegras(createAdminClient(), ctx.tenantId)
    const diagramas = montarFluxo(r.regras).map((d) => ({ ...d, grupo: d.id === 'cadastro' ? 'Fluxograma principal' : d.id === 'precedencia' ? 'Precedência' : 'Árvores de decisão' }))
    const edicao: Record<string, EdicaoNo> = {}
    for (const d of diagramas) for (const n of d.nos) { const e = camposDoNo(n.id, r.regras); if (e && !edicao[n.id]) edicao[n.id] = e }
    return { diagramas, edicao, versao: r.versao, rotuloVersao: `Regras versão ${r.versao || 'padrão'}`, podeEditar: ctx.podeEditar, motivo: 'opcional', extras: ['simulador-faixa'] }
  },

  async salvar(ctx, patch, versaoEsperada, motivo, confirmarRisco) {
    if (!ctx.podeEditar) return { ok: false, error: 'Sem permissão.' }
    const vig = await lerRegistroRegras(createAdminClient(), ctx.tenantId)
    const ap = aplicarPatchRegras(vig.regras, patch.valores)
    if (!ap.ok) return { ok: false, error: ap.error }
    const r = await salvarRegrasComTrava(ap.regras, versaoEsperada, motivo, confirmarRisco)
    if (r.ok) return { ok: true, versao: r.versao, avisos: r.avisos }
    if (r.exigeConfirmacao) {
      const s = r.resumo
      return { ok: false, error: 'Confirme o risco detectado.', confirmar: { titulo: 'Risco detectado na amostra de planos', mensagem: `Na amostra de ${s.planos} plano(s): ${s.totalDivergentes} meta(s) concluída(s) divergente(s) e ${s.novosErros} plano(s) que passam a falhar na geração. Salvar mesmo assim? Planos já gravados não mudam.` } }
    }
    return { ok: false, error: r.error, conflito: r.conflito, erros: r.erros }
  },
}
