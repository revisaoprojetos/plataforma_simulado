'use client'
// 03b §2.1 — Fonte e link (só vídeo e áudio). Importado vs link externo, proteções condicionais (01 §6).
// O pipeline de versões geradas (1080p/720p…), detecção de provedor e verificação de link ainda não
// existe → a aba mostra o estado atual (importado por padrão) + a matriz de proteções, de forma honesta.

import { useState } from 'react'
import { toast } from 'sonner'
import { HardDriveUpload, Link2, Copy, Check, CloudDownload } from 'lucide-react'
import type { GestaoBase } from '@/app/admin/biblioteca/gestao-actions'
import { Secao } from './ui'
import { cn } from '@/lib/utils'

// 01 §6 — o que muda por serviço (vídeo). Áudio reaproveita os itens relevantes.
const REGRAS: { servico: string; marca: string; gravacao: string; naoPular: string; offline: string; metricas: string }[] = [
  { servico: 'Importado', marca: 'Funciona', gravacao: 'Funciona', naoPular: 'Funciona', offline: 'Funciona', metricas: 'Completas' },
  { servico: 'Panda Video', marca: 'Funciona (via Panda)', gravacao: 'Funciona (DRM)', naoPular: 'Funciona', offline: 'Não funciona', metricas: 'Completas' },
  { servico: 'Vimeo', marca: 'Não funciona', gravacao: 'Não funciona', naoPular: 'Funciona', offline: 'Não funciona', metricas: 'API (1h)' },
  { servico: 'YouTube', marca: 'Não funciona', gravacao: 'Não funciona', naoPular: 'Não funciona', offline: 'Não funciona', metricas: 'Aproximadas' },
  { servico: 'Google Drive', marca: 'Não funciona', gravacao: 'Não funciona', naoPular: 'Não funciona', offline: 'Não funciona', metricas: 'Nenhuma (não recomendado)' },
]

export function AbaFonteLink({ base }: { base: GestaoBase }) {
  const [fonte, setFonte] = useState<'importado' | 'link'>(base.fonteMidia?.tipo ?? 'importado')
  const [copiado, setCopiado] = useState(false)
  const ehAudio = base.kind === 'audio'
  const linkAluno = `https://simulado.revisaopge.com.br/biblioteca/${base.id}`

  function copiar() { navigator.clipboard?.writeText(linkAluno).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }) }
  function trocar(f: 'importado' | 'link') { setFonte(f); toast.info('Troca de fonte não perde alunos, vínculos nem marcadores. Persistência da fonte externa — em construção.') }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <Secao titulo={`De onde vem o ${ehAudio ? 'áudio' : 'vídeo'}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <CardFonte Ic={HardDriveUpload} titulo="Importado" descricao="Arquivo enviado para a plataforma. Todas as proteções, offline no app e métricas completas." ativo={fonte === 'importado'} onClick={() => trocar('importado')} />
            <CardFonte Ic={Link2} titulo="Link externo" descricao={ehAudio ? 'Spotify, SoundCloud, YouTube, Google Drive.' : 'YouTube, Vimeo, Panda Video, Google Drive.'} ativo={fonte === 'link'} onClick={() => trocar('link')} />
          </div>
        </Secao>

        {fonte === 'importado' ? (
          <Secao titulo="Arquivo importado">
            <p className="text-sm text-muted-foreground">Armazenado na plataforma. Metadados (tamanho, duração, quem enviou) e as versões geradas (1080p/720p/app) aparecerão quando o processamento de mídia estiver pronto.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => toast.info('Substituir — em construção.')} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Substituir</button>
              <button onClick={() => toast.info('Baixar original — em construção (só equipe).')} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Baixar original</button>
            </div>
          </Secao>
        ) : (
          <>
            <Secao titulo="Link externo">
              <div className="flex gap-2">
                <input placeholder={ehAudio ? 'Cole o link do Spotify/SoundCloud/YouTube' : 'Cole o link do YouTube/Vimeo/Panda'} className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
                <button onClick={() => toast.info('Verificar link — em construção.')} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Verificar link</button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">O serviço é detectado automaticamente pelo domínio (em construção).</p>
            </Secao>
            <Secao titulo={`O que muda usando link externo`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b text-muted-foreground"><tr><th className="py-1.5 pr-3 font-semibold">Serviço</th><th className="py-1.5 pr-3 font-semibold">Marca d’água</th><th className="py-1.5 pr-3 font-semibold">Gravação</th><th className="py-1.5 pr-3 font-semibold">Não pular</th><th className="py-1.5 pr-3 font-semibold">Offline</th><th className="py-1.5 font-semibold">Métricas</th></tr></thead>
                  <tbody>
                    {REGRAS.map((r) => (
                      <tr key={r.servico} className="border-b last:border-0"><td className="py-1.5 pr-3 font-medium text-foreground">{r.servico}</td><Cel v={r.marca} /><Cel v={r.gravacao} /><Cel v={r.naoPular} /><Cel v={r.offline} /><td className="py-1.5 text-muted-foreground">{r.metricas}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => toast.info('Importar para a plataforma — em construção.')} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"><CloudDownload className="h-3.5 w-3.5" />Importar para a plataforma</button>
            </Secao>
          </>
        )}

        <Secao titulo="Como o aluno vê">
          <p className="text-sm text-muted-foreground">A prévia do player (marca d’água do aluno, capítulos, legendas, qualidade, forma de onda do áudio) aparece quando o player estiver integrado. Fase posterior.</p>
        </Secao>
      </div>

      <aside className="space-y-4">
        <Secao titulo="Link para o aluno">
          <div className="flex gap-2">
            <input readOnly value={linkAluno} className="h-9 flex-1 truncate rounded-lg border bg-muted/40 px-2 text-xs text-muted-foreground" />
            <button onClick={copiar} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">{copiado ? <><Check className="h-3.5 w-3.5 text-emerald-600" />Copiado</> : <><Copy className="h-3.5 w-3.5" />Copiar</>}</button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Começar em um tempo, exigir login e link temporário — opções em construção. Por padrão, exige login (com marca d’água pessoal e registro de acesso).</p>
        </Secao>
      </aside>
    </div>
  )
}

function CardFonte({ Ic, titulo, descricao, ativo, onClick }: { Ic: typeof Link2; titulo: string; descricao: string; ativo: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/30 hover:bg-muted/40')}>
      <span className={cn('grid h-8 w-8 place-items-center rounded-lg', ativo ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}><Ic className="h-4 w-4" /></span>
      <span className="text-sm font-semibold text-foreground">{titulo}</span>
      <span className="text-[11px] text-muted-foreground">{descricao}</span>
    </button>
  )
}
function Cel({ v }: { v: string }) {
  const cls = v.startsWith('Funciona') ? 'text-emerald-600 dark:text-emerald-400' : v.startsWith('Não') ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
  return <td className={cn('py-1.5 pr-3', cls)}>{v}</td>
}
