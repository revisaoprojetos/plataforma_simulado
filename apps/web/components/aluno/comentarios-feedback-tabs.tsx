'use client'

import { useState } from 'react'
import { MessageSquare, Flag, Loader2, Check, ChevronDown } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu'
import { ComentariosQuestao } from '@/components/aluno/comentarios-questao'

const FB_TIPOS = [
  { value: 'erro_gabarito', label: 'Gabarito incorreto' },
  { value: 'alternativa_incorreta', label: 'Alternativa incorreta' },
  { value: 'enunciado_confuso', label: 'Enunciado confuso' },
  { value: 'erro_portugues', label: 'Erro de português / digitação' },
  { value: 'imagem_problema', label: 'Problema na imagem' },
  { value: 'desatualizada', label: 'Questão desatualizada' },
  { value: 'duplicada', label: 'Questão duplicada' },
  { value: 'comentario_incorreto', label: 'Comentário incorreto' },
  { value: 'outro', label: 'Outro' },
]

/**
 * Rodapé da questão em duas abas no estilo do sistema (sublinhado com linha primária que desliza):
 * "Comentários" (o que o aluno envia — ativo por padrão) e "Feedback" (reportar problema).
 */
export function ComentariosFeedbackTabs({ questaoId }: { questaoId: string }) {
  const [fbTipo, setFbTipo] = useState('erro_gabarito')
  const [fbMsg, setFbMsg] = useState('')
  const [fbEnviando, setFbEnviando] = useState(false)
  const [fbEnviado, setFbEnviado] = useState(false)

  async function enviarFeedback() {
    setFbEnviando(true)
    try {
      const res = await fetch('/api/aluno/questao-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questao_id: questaoId, tipo: fbTipo, mensagem: fbMsg }),
      })
      if (res.ok) { setFbEnviado(true); setTimeout(() => { setFbEnviado(false); setFbMsg('') }, 1800) }
    } finally { setFbEnviando(false) }
  }

  return (
    <div className="border-t pt-3">
      <Tabs defaultValue="comentarios">
        <TabsList className="w-fit">
          <TabsTrigger value="comentarios"><MessageSquare className="h-4 w-4" /> Comentários</TabsTrigger>
          <TabsTrigger value="feedback"><Flag className="h-4 w-4" /> Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="comentarios" className="pt-3">
          <ComentariosQuestao questaoId={questaoId} embutido />
        </TabsContent>

        <TabsContent value="feedback" className="pt-3">
          {fbEnviado ? (
            <p className="inline-flex items-center gap-1 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> Feedback enviado, obrigado!</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Encontrou um problema nesta questão? Conte pra gente.</p>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Tipo do problema"
                  className="group/sel flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-[var(--input-bg,transparent)] px-3 text-sm outline-none transition-colors hover:border-primary/50 focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:border-primary/60">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Flag className="h-3.5 w-3.5" /></span>
                    <span className="truncate font-medium">{FB_TIPOS.find((t) => t.value === fbTipo)?.label ?? 'Selecione o motivo'}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[popup-open]/sel:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={6}
                  className="w-(--anchor-width) duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ ['--tw-enter-translate-y' as any]: '-0.65rem' }}>
                  <DropdownMenuRadioGroup value={fbTipo} onValueChange={(v) => setFbTipo(v as string)}>
                    {FB_TIPOS.map((t) => (
                      <DropdownMenuRadioItem key={t.value} value={t.value}>{t.label}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <textarea value={fbMsg} onChange={(e) => setFbMsg(e.target.value)} placeholder="Descreva o problema (opcional)" rows={2} maxLength={1000}
                className="w-full resize-none rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
              <div className="flex justify-end">
                <button type="button" onClick={enviarFeedback} disabled={fbEnviando}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60">
                  {fbEnviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />} Enviar
                </button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
