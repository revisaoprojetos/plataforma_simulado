'use client'

import { toast } from 'sonner'
import { definirVisibilidadeConteudo } from '@/app/admin/biblioteca/gestao-actions'
import { forcarAcaoDocumentos, podeForcarBloqueio } from '@/app/admin/biblioteca/override-actions'
import { pedirTexto } from '@/components/ui/confirm-dialog'

/**
 * Aviso padrão quando o servidor RECUSA excluir/mover/despublicar um documento com vínculos ou em uso por plano de aluno.
 * Mostra o motivo e oferece as duas saídas seguras: "Substituir documento" (nova versão no MESMO documento — mantém
 * id, pasta, posição, grifos e metas) e "Ocultar" (esconde do aluno sem apagar nada).
 */
export function avisarRecusaDocumento(
  mensagem: string,
  docId: string,
  opts?: { onSubstituir?: () => void; onOcultado?: () => void; forcar?: { acao: 'lixeira' | 'mover' | 'despublicar' | 'categoria'; valor?: string | null } },
) {
  if (opts?.forcar) {
    const f = opts.forcar
    // Só super-admin vê a saída "forçar" (motivo obrigatório + registro no banco).
    void podeForcarBloqueio().then((pode) => {
      if (!pode) return
      toast.message('Super-admin: forçar esta ação exige motivo e fica registrado.', {
        duration: 20000,
        action: {
          label: 'Forçar com motivo',
          onClick: async () => {
            const motivo = await pedirTexto({ titulo: 'Forçar ação (super-admin)', placeholder: 'Motivo obrigatório (mín. 10 caracteres)', confirmar: 'Forçar' })
            if (!motivo) return
            const r = await forcarAcaoDocumentos({ docIds: [docId], acao: f.acao, valor: f.valor ?? null, motivo })
            if (r.ok) { toast.success('Ação forçada e registrada.'); opts.onOcultado?.() } else toast.error(r.error || 'Falha ao forçar.')
          },
        },
      })
    })
  }
  toast.error(mensagem, {
    duration: 20000,
    action: opts?.onSubstituir ? { label: 'Substituir documento', onClick: () => opts.onSubstituir?.() } : undefined,
    cancel: {
      label: 'Ocultar',
      onClick: () => {
        void definirVisibilidadeConteudo(docId, false).then((r) => {
          if (r.ok) { toast.success('Documento oculto para os alunos. Nada foi apagado.'); opts?.onOcultado?.() }
          else toast.error(r.error || 'Falha ao ocultar.')
        })
      },
    },
  })
}

/** Resumo de lote por documento (um toast único com os motivos; os livres já foram processados). */
export function avisarRecusasLote(bloqueados: { id: string; motivo: string }[], totalDocs: number) {
  if (!bloqueados.length) return
  const primeiro = bloqueados[0].motivo
  toast.error(`${bloqueados.length} de ${totalDocs} não foram processados (vínculos/em uso). ${primeiro}${bloqueados.length > 1 ? ` (+${bloqueados.length - 1} outros)` : ''}`, { duration: 20000 })
}
