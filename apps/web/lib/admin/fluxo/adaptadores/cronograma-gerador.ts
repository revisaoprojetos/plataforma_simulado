import 'server-only'
import { listarTiposMeta } from '@/lib/cronograma/carregar-tipos'
import { camposDoNoGerador, CHAVES_TIPO, montarFluxoGerador, type TipoMetaFluxo } from '@/lib/cronograma/fluxo-gerador'
import { atualizarTipo, alternarAtivoTipo } from '@/app/admin/cronogramas/tipos-actions'
import type { EntradaTipo } from '@/app/admin/cronogramas/tipos-actions-tipos'
import type { DadosFluxo, EdicaoNo, FluxoAdaptador } from '../adaptador'

async function tipos(tenantId: string): Promise<TipoMetaFluxo[]> { return (await listarTiposMeta(tenantId, true)) as TipoMetaFluxo[] }

/**
 * Adaptador do GERADOR de cronogramas: pipeline R1–R21 (leitura) + edição dos TIPOS DE META (única regra editável do gerador),
 * salvando pelas actions existentes `atualizarTipo`/`alternarAtivoTipo` (auditadas). Sem versão otimista (a tabela não versiona).
 */
export const adaptadorCronogramaGerador: FluxoAdaptador = {
  id: 'cronograma-gerador',
  titulo: 'Fluxo do Gerador de Cronogramas',
  descricao: 'Da grade do catálogo ao calendário datado e o comportamento de cada tipo de meta. Os tipos de meta são editáveis; as regras R1–R8 são fixas no código.',
  permVer: 'cronogramas:view',
  permEditar: 'cronogramas:update',
  href: '/admin/cronogramas/fluxo',
  construtor: {
    executavel: false,
    tiposNo: ['inicio', 'etapa', 'decisao', 'aviso', 'resultado', 'nota'],
    escopo: 'Somente documentação: etapas, avisos e notas acrescentados aqui ficam visíveis no diagrama, mas NÃO alteram o gerador (R1–R8 são regras fixas no código; só os tipos de meta são editáveis).',
  },

  async carregar(ctx): Promise<DadosFluxo> {
    const t = await tipos(ctx.tenantId)
    const diagramas = montarFluxoGerador(t)
    const edicao: Record<string, EdicaoNo> = {}
    for (const d of diagramas) for (const n of d.nos) { const e = camposDoNoGerador(n.id, t); if (e) edicao[n.id] = e }
    return { diagramas, edicao, versao: 0, rotuloVersao: 'Tipos de meta (sem versionamento)', podeEditar: ctx.podeEditar, motivo: 'nenhum' }
  },

  async salvar(ctx, patch) {
    if (!ctx.podeEditar) return { ok: false, error: 'Sem permissão.' }
    const t = (await tipos(ctx.tenantId)).find((x) => x.id === patch.alvo)
    if (!t) return { ok: false, error: 'Tipo de meta não encontrado.' }
    const v = patch.valores
    for (const k of Object.keys(v)) if (!(CHAVES_TIPO as readonly string[]).includes(k)) return { ok: false, error: `Campo não editável: ${k}` }
    const texto = (k: string, atual: string) => (k in v ? String(v[k] ?? '') : atual)
    const bool = (k: keyof EntradaTipo & string, atual: boolean) => (k in v ? v[k] === true : atual)
    const entrada: EntradaTipo = {
      nome: texto('nome', t.nome), rotulo_docx: texto('rotulo_docx', t.rotulo_docx), cor: texto('cor', t.cor ?? '') || null,
      mostra_links: bool('mostra_links', t.mostra_links), prefixo_aula: bool('prefixo_aula', t.prefixo_aula), aula_no_titulo: bool('aula_no_titulo', t.aula_no_titulo),
      quebra_conteudo: bool('quebra_conteudo', t.quebra_conteudo), conta_atividade: bool('conta_atividade', t.conta_atividade),
      destaque_docx: bool('destaque_docx', t.destaque_docx), sempre_no_docx: bool('sempre_no_docx', t.sempre_no_docx),
    }
    const r = await atualizarTipo(t.id, entrada)
    if (!r.ok) return { ok: false, error: r.error ?? 'Falha ao salvar.' }
    if ('ativo' in v && (v.ativo === true) !== (t.ativo !== false)) {
      const a = await alternarAtivoTipo(t.id, v.ativo === true)
      if (!a.ok) return { ok: false, error: a.error ?? 'Falha ao alterar a situação.' }
    }
    return { ok: true, versao: 0 }
  },
}
