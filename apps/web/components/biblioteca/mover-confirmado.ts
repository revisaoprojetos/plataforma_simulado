'use client'

import { toast } from 'sonner'
import { vinculosParaArquivar } from '@/app/admin/biblioteca/gestao-actions'
import { moverDocumento } from '@/app/admin/biblioteca/actions'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'

type Res = { ok: boolean; error?: string }

/**
 * Mover documentos de pasta COM a trava "em uso por plano de aluno ativo": sem documento em uso → move direto; com → confirmação
 * reforçada em 4 passos (o que está em uso → impacto → digitar MOVER → motivo livre), igual ao arquivar. Devolve `null` se o admin
 * cancelar; senão a função que move UM documento já com a autorização certa (serve para lote ou isolado).
 */
export async function prepararMovimento(ids: string[], destino: string | null, titulos?: Record<string, string>): Promise<null | { fn: (id: string) => Promise<Res>; emUso: number }> {
  const lista = [...new Set(ids)]
  if (!lista.length) return null
  const v = await vinculosParaArquivar(lista).catch(() => null)
  const itens = (v?.ok ? (v.itens ?? []) : []).filter((i) => i.emUso)
  if (v && !v.ok) toast.message('Não foi possível verificar os documentos em uso agora. O servidor continua protegendo os que estiverem em uso.', { duration: 8000 })
  if (!itens.length) return { fn: (id) => moverDocumento(id, destino), emUso: 0 }

  const planos = itens.reduce((s, i) => s + i.planosAtivos, 0)
  const mostra = itens.slice(0, 6).map((i) => `• ${titulos?.[i.id] ?? i.titulo}: ${i.resumo || 'em uso'}${i.planosAtivos ? ` (${i.planosAtivos.toLocaleString('pt-BR')} ${i.planosAtivos === 1 ? 'plano ativo' : 'planos ativos'})` : ''}`).join('\n')
  const resto = itens.length > 6 ? `\n… e mais ${itens.length - 6}.` : ''

  if (!(await confirmar({
    titulo: `⚠ ${itens.length} ${itens.length === 1 ? 'documento está em uso' : 'documentos estão em uso'}`,
    mensagem: `Estes documentos estão ligados a planos de alunos ativos:\n\n${mostra}${resto}\n\nA trava existe para não quebrar metas e leituras dos alunos. Deseja mover de pasta mesmo assim?`,
    confirmar: 'Continuar', destrutivo: true,
  }))) return null

  if (!(await confirmar({
    titulo: 'Tem certeza? Veja o impacto',
    mensagem: `• ${itens.length === 1 ? 'O documento mantém' : 'Os documentos mantêm'} o mesmo id: metas, grifos e histórico continuam ligados.\n• ${planos ? `${planos.toLocaleString('pt-BR')} ${planos === 1 ? 'plano ativo' : 'planos ativos'} apontam para ${itens.length === 1 ? 'ele' : 'eles'}. ` : ''}Regras e liberações baseadas na PASTA (tipo de material, disciplina, acesso herdado) passam a valer pela pasta nova.\n• Para desfazer, mova de volta.\n\nPrefere “Substituir” (nova versão, mantém tudo)? Se sim, cancele agora.`,
    confirmar: 'Sim, entendo o impacto', cancelar: 'Cancelar e escolher outra opção', destrutivo: true,
  }))) return null

  const digitou = await pedirTexto({ titulo: 'Confirmação final', mensagem: 'Para confirmar, digite MOVER (em maiúsculas).', placeholder: 'MOVER', confirmar: 'Confirmar' })
  if (!digitou || digitou.trim() !== 'MOVER') { if (digitou) toast.error('Texto diferente de MOVER. Nada foi feito.'); return null }

  const motivo = await pedirTexto({ titulo: 'Motivo da mudança de pasta', mensagem: 'Registrado na auditoria, com seu usuário e a data. Pode ser curto.', placeholder: 'Ex.: reorganização das pastas', confirmar: 'Mover agora' })
  if (!motivo || !motivo.trim()) return null

  const emUso = new Set(itens.map((i) => i.id))
  return { fn: (id) => (emUso.has(id) ? moverDocumento(id, destino, { confirmado: true, motivo: motivo.trim() }) : moverDocumento(id, destino)), emUso: itens.length }
}
