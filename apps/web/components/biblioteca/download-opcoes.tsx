'use client'

// Opções de download da Biblioteca (admin): formatos + "Incluir capa" (+ "Manter estrutura de pastas" no lote).
// Reusado pelo diálogo em lote (LoteDialog) e pelo botão "Baixar" do editor.
import { CheckSelecao } from '@/components/biblioteca/selecao-lote'
import { FORMATOS_DOWNLOAD, type FormatoDownload } from '@/lib/conteudo/download-admin-pura'

export function capaAplicavel(formatos: FormatoDownload[]): boolean {
  return formatos.some((f) => FORMATOS_DOWNLOAD.find((x) => x.id === f)?.aceitaCapa)
}

export function OpcoesDownload({ formatos, onFormatos, multi, incluirCapa, onIncluirCapa, incluirAtualizacao, onIncluirAtualizacao, manterEstrutura, onManterEstrutura }: {
  formatos: FormatoDownload[]; onFormatos: (f: FormatoDownload[]) => void
  /** true = vários formatos (checkbox, lote); false = um só (editor). */
  multi: boolean
  incluirCapa: boolean; onIncluirCapa: (v: boolean) => void
  /** Folha com a ÚLTIMA atualização do documento (depois da capa, antes da 1ª folha). Ausente = opção não aparece. */
  incluirAtualizacao?: boolean; onIncluirAtualizacao?: (v: boolean) => void
  /** Ausente = opção não aparece (download unitário). */
  manterEstrutura?: boolean; onManterEstrutura?: (v: boolean) => void
}) {
  const podeCapa = capaAplicavel(formatos)
  const alternar = (id: FormatoDownload) => {
    if (!multi) { onFormatos([id]); return }
    onFormatos(formatos.includes(id) ? formatos.filter((x) => x !== id) : [...formatos, id])
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">Formato{multi ? '(s)' : ''}</div>
      <div className="space-y-1">
        {FORMATOS_DOWNLOAD.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
            {multi
              ? <CheckSelecao marcado={formatos.includes(f.id)} onToggle={() => alternar(f.id)} rotulo={f.rotulo} className="mt-0.5" />
              : <input type="radio" name="fmt-dl" checked={formatos[0] === f.id} onChange={() => alternar(f.id)} className="mt-1 accent-primary" />}
            <span className="min-w-0"><span className="font-medium">{f.rotulo}</span><span className="block text-[11px] leading-tight text-muted-foreground">{f.dica}</span></span>
          </label>
        ))}
      </div>
      <div className={`flex items-start gap-2.5 rounded-md border px-2 py-1.5 ${podeCapa ? '' : 'opacity-60'}`}>
        <CheckSelecao marcado={podeCapa && incluirCapa} onToggle={() => { if (podeCapa) onIncluirCapa(!incluirCapa) }} rotulo="Incluir capa" className="mt-0.5" />
        <div className="min-w-0 text-sm">
          <div className="font-medium">Incluir capa</div>
          <p className="text-[11px] leading-tight text-muted-foreground">
            {podeCapa
              ? 'Aplica a capa do documento (ou da pasta) como 1ª página do PDF; respeita a “página inicial”. Documentos sem capa saem sem ela. Em .docx a capa não é aplicável: o original .docx com capa sai em PDF.'
              : 'Indisponível nos formatos ODT/RTF/TXT (a capa só pode ser mesclada em PDF). Marque PDF ou Original para usar.'}
          </p>
        </div>
      </div>
      {onIncluirAtualizacao && (
        <div className={`flex items-start gap-2.5 rounded-md border px-2 py-1.5 ${podeCapa ? '' : 'opacity-60'}`}>
          <CheckSelecao marcado={podeCapa && !!incluirAtualizacao} onToggle={() => { if (podeCapa) onIncluirAtualizacao(!incluirAtualizacao) }} rotulo="Incluir folha de atualização" className="mt-0.5" />
          <div className="min-w-0 text-sm">
            <div className="font-medium">Incluir folha de atualização</div>
            <p className="text-[11px] leading-tight text-muted-foreground">
              {podeCapa
                ? 'Adiciona uma folha formatada com a ÚLTIMA atualização publicada do documento, depois da capa (se marcada) e antes da 1ª folha. Documentos sem atualização publicada saem sem ela.'
                : 'Indisponível nos formatos ODT/RTF/TXT (a folha só pode ser mesclada em PDF). Marque PDF ou Original para usar.'}
            </p>
          </div>
        </div>
      )}
      {onManterEstrutura && (
        <div className="flex items-start gap-2.5 rounded-md border px-2 py-1.5">
          <CheckSelecao marcado={!!manterEstrutura} onToggle={() => onManterEstrutura(!manterEstrutura)} rotulo="Manter estrutura de pastas" className="mt-0.5" />
          <div className="min-w-0 text-sm"><div className="font-medium">Manter estrutura de pastas</div><p className="text-[11px] leading-tight text-muted-foreground">Cria subpastas no ZIP seguindo a árvore da Biblioteca. Desmarcado = tudo na raiz do ZIP.</p></div>
        </div>
      )}
    </div>
  )
}
