'use client'

import { toast } from 'sonner'
import { arquivarConteudo, vinculosParaArquivar } from '@/app/admin/biblioteca/gestao-actions'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'

type Res = { ok: boolean; error?: string }

/**
 * Arquivar documentos COM a trava de vínculos: sem vínculos → confirmação simples; com metas/planos ativos/grifos etc. →
 * confirmação reforçada em 4 passos (vínculos detalhados → impacto → digitar ARQUIVAR → motivo livre). Devolve `null` se o admin
 * cancelar; senão a função que arquiva UM documento já com a autorização certa (para usar em lote ou isolado).
 */
export async function prepararArquivamento(ids: string[], titulos?: Record<string, string>): Promise<null | { fn: (id: string) => Promise<Res>; comVinculos: number }> {
  const lista = [...new Set(ids)]
  if (!lista.length) return null
  const v = await vinculosParaArquivar(lista).catch(() => null)
  const itens = v?.ok ? (v.itens ?? []) : []
  if (v && !v.ok) toast.message('Não foi possível verificar os vínculos agora. Documentos em uso continuarão protegidos pelo servidor.', { duration: 8000 })

  const n = lista.length
  if (itens.length === 0) {
    const ok = await confirmar({ titulo: `Arquivar ${n} ${n === 1 ? 'material' : 'materiais'}`, mensagem: 'O status vira “Arquivado” e os alunos deixam de ver. Os documentos continuam na Biblioteca.', confirmar: 'Arquivar' })
    return ok ? { fn: (id) => arquivarConteudo(id), comVinculos: 0 } : null
  }

  const planos = itens.reduce((s, i) => s + i.planosAtivos, 0)
  const mostra = itens.slice(0, 6).map((i) => `• ${titulos?.[i.id] ?? i.titulo}: ${i.resumo || 'em uso'}${i.planosAtivos ? ` (${i.planosAtivos.toLocaleString('pt-BR')} ${i.planosAtivos === 1 ? 'plano ativo' : 'planos ativos'})` : ''}`).join('\n')
  const resto = itens.length > 6 ? `\n… e mais ${itens.length - 6}.` : ''

  // 1) o que está vinculado
  if (!(await confirmar({
    titulo: `⚠ ${itens.length} ${itens.length === 1 ? 'documento tem' : 'documentos têm'} vínculos`,
    mensagem: `Estes documentos estão ligados a outras partes da plataforma:\n\n${mostra}${resto}\n\nA trava existe para não quebrar metas e leituras dos alunos. Deseja continuar mesmo assim?`,
    confirmar: 'Continuar', destrutivo: true,
  }))) return null

  // 2) impacto
  if (!(await confirmar({
    titulo: 'Tem certeza? Veja o impacto',
    mensagem: `• Os alunos deixam de ver ${itens.length === 1 ? 'este documento' : 'estes documentos'}.\n• ${planos ? `${planos.toLocaleString('pt-BR')} ${planos === 1 ? 'plano ativo' : 'planos ativos'} de alunos apontam para ${itens.length === 1 ? 'ele' : 'eles'}: as metas ficarão sem material para abrir.\n• ` : ''}Nada é apagado: grifos, metas e histórico continuam no banco.\n• Para desfazer, volte o status para “Publicado”.\n\nPrefere “Substituir” (nova versão, mantém metas) ou “Ocultar”? Se sim, cancele agora.`,
    confirmar: 'Sim, entendo o impacto', cancelar: 'Cancelar e escolher outra opção', destrutivo: true,
  }))) return null

  // 3) digitar ARQUIVAR
  const digitou = await pedirTexto({ titulo: 'Confirmação final', mensagem: 'Para confirmar, digite ARQUIVAR (em maiúsculas).', placeholder: 'ARQUIVAR', confirmar: 'Confirmar' })
  if (!digitou || digitou.trim() !== 'ARQUIVAR') { if (digitou) toast.error('Texto diferente de ARQUIVAR. Nada foi feito.'); return null }

  // 4) motivo (fica na auditoria)
  const motivo = await pedirTexto({ titulo: 'Motivo do arquivamento', mensagem: 'Registrado na auditoria, com seu usuário e a data. Pode ser curto.', placeholder: 'Ex.: material substituído', confirmar: 'Arquivar agora' })
  if (!motivo || !motivo.trim()) return null

  const comVinc = new Set(itens.map((i) => i.id))
  return { fn: (id) => (comVinc.has(id) ? arquivarConteudo(id, { confirmado: true, motivo: motivo.trim() }) : arquivarConteudo(id)), comVinculos: itens.length }
}
