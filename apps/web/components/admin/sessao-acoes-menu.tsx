'use client'
import { confirmar } from '@/components/ui/confirm-dialog'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { usePdfDownloads } from '@/components/pdf-downloads-provider'
import { MoreHorizontal, Trash2, ListChecks, ClipboardList, FileText, FileCheck2, Loader2, FileSpreadsheet } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { excluirSessaoAction } from '@/app/admin/estudantes/actions'

type Mod = { id: string; nome: string }

function IconeMod({ nome }: { nome: string }) {
  const n = (nome ?? '').toLowerCase()
  const Icon = n.includes('diagn') ? ClipboardList : n.includes('discursiv') ? FileText : n.includes('gabarito') || n.includes('objetiv') ? FileCheck2 : ListChecks
  return <Icon className="mr-2 h-4 w-4" />
}

export function SessaoAcoesMenu({
  cadId, mods, estudanteId, sessaoId, simuladoId, temResultado, estudanteNome, simuladoTitulo,
}: {
  cadId: string | null
  mods: Mod[]
  estudanteId: string
  sessaoId: string
  simuladoId: string
  temResultado: boolean
  estudanteNome?: string
  simuladoTitulo?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // O acompanhamento/baixa fica no provider global (continua mesmo trocando de página).
  const { registrar } = usePdfDownloads()
  // Estado local só durante o POST de enfileiramento (evita clique-duplo na MESMA modalidade).
  const [enviando, setEnviando] = useState<Set<string>>(new Set())
  const marcarEnviando = (id: string, on: boolean) => setEnviando((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  function baixar(url: string) {
    const a = document.createElement('a')
    a.href = url; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); a.remove()
  }

  function urlNavegador(m: Mod) {
    return `/imprimir/caderno/${cadId}?aluno=${estudanteId}&mod=${m.id}&sessao=${sessaoId}`
  }
  // Nome do arquivo: {estudante}_{simulado}_{caderno} (limpa caracteres inválidos).
  const limpar = (s?: string) => (s ?? '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
  const nomeArquivo = (m: Mod) => [estudanteNome, simuladoTitulo, m.nome].map(limpar).filter(Boolean).join('_')
  // Ação "abrir no navegador" (dentro de um clique do usuário — nunca bloqueado).
  const acaoNavegador = (url: string) => ({ label: 'Abrir no navegador', onClick: () => window.open(url, '_blank', 'noopener,noreferrer') })

  async function gerarCaderno(m: Mod) {
    if (!cadId || enviando.has(m.id)) return
    const fallbackUrl = urlNavegador(m)
    marcarEnviando(m.id, true)
    try {
      const res = await fetch('/api/pdf/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'caderno', cadernoId: cadId, mod: m.id, aluno: estudanteId, sessao: sessaoId, titulo: m.nome }),
      })
      const data = await res.json()
      if (!res.ok || !data.jobId) { toast.error(data.message ?? 'Servidor de PDF indisponível.', { action: acaoNavegador(fallbackUrl) }); return }
      // Entrega ao provider global → baixa quando pronto, mesmo que você saia da página.
      registrar({ id: data.jobId, nome: m.nome, arquivo: nomeArquivo(m), statusUrl: `/api/pdf/jobs/${data.jobId}` })
    } catch { toast.error('Erro de rede ao iniciar a geração.', { action: acaoNavegador(fallbackUrl) }) }
    finally { marcarEnviando(m.id, false) }
  }

  async function excluir() {
    if (!(await confirmar({ mensagem: 'Excluir esta tentativa?\n\nEla sai do histórico, dos resultados e do ranking (recalculado), e vai para a Lixeira — pode ser restaurada.', destrutivo: true }))) return
    start(async () => {
      const r = await excluirSessaoAction(sessaoId, simuladoId, estudanteId)
      if (r?.error) toast.error(r.error)
      else { toast.success('Tentativa enviada para a Lixeira'); router.refresh() }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        title="Ações" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {temResultado && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Material para download</DropdownMenuLabel>
              {cadId && mods.length ? (
                // Cada modalidade gera o PDF no servidor (worker + Gotenberg); se indisponível, abre no navegador.
                mods.map((m) => (
                  <DropdownMenuItem key={m.id} disabled={enviando.has(m.id)} onClick={() => gerarCaderno(m)}>
                    {enviando.has(m.id) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <IconeMod nome={m.nome} />} {m.nome}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem onClick={() => router.push(`/admin/estudantes/${estudanteId}/gabarito/${sessaoId}`)}>
                  <ListChecks className="mr-2 h-4 w-4" /> Ver caderno
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => baixar(`/api/admin/relatorio-sessao/${sessaoId}`)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Baixar relatório (Excel)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={excluir} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Excluir tentativa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
