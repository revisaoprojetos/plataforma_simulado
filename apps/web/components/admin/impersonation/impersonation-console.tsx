'use client'

import Link from 'next/link'
import { Search, Loader2, Eye, ExternalLink, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { useImpersonationDock, Barra, BannerAviso, Corpo, TabStrip } from '@/components/admin/impersonation/impersonation-dock'

/** Página do console (consome o provider global). Picker + abas das visualizações abertas + a
 *  área da ativa. As janelas e a divisão são globais (no layout), por isso persistem ao navegar. */
export function ImpersonationConsole() {
  const d = useImpersonationDock()
  const foraDaArea = d.modo === 'flutuante' || d.modo === 'split'

  const mainInner = !d.ativo ? (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <Eye className="h-8 w-8 opacity-40" />
      <p className="text-sm">Escolha um aluno à esquerda para abrir a conta dele aqui.</p>
    </div>
  ) : !foraDaArea ? (
    <div className="absolute inset-0 flex flex-col"><Barra /><BannerAviso /><div className="min-h-0 flex-1"><Corpo /></div></div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <ExternalLink className="h-8 w-8 opacity-40" />
      <p className="max-w-sm text-sm">As visualizações estão {d.modo === 'split' ? 'na divisão lateral' : 'em janelas'} — continuam abertas ao navegar por outras telas. Use as abas acima para alternar.</p>
      <button type="button" onClick={() => d.setModo('encaixado')} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Trazer para a área</button>
    </div>
  )

  return (
    <div className="animate-page space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Eye className="h-6 w-6 text-primary" /> Visualização de aluno</h1>
          <p className="text-sm text-muted-foreground">Abra a conta de um aluno e opere como ele — as ações contam como do próprio aluno. O histórico fica em <Link href="/admin/auditoria?tipo=visualizacoes" className="text-primary hover:underline">Auditoria</Link>.</p>
        </div>
        {d.isAdmin && <Link href="/admin/impersonation/config" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><SlidersHorizontal className="h-4 w-4" /> Configurar</Link>}
      </div>

      {!d.podeAbrir && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">Seu papel não pode visualizar alunos. Peça a um administrador para habilitar em <b>Configurar</b>.</div>
      )}

      {/* Abas de TODAS as visualizações abertas (trocar a ativa / fechar / abrir outra). */}
      {d.abertos.length > 0 && <div className="overflow-hidden rounded-xl border bg-card shadow-sm"><TabStrip /></div>}

      {d.modo === 'expandido' ? (
        <main className="relative h-[calc(100vh-11rem)] overflow-hidden rounded-2xl border bg-muted/30 shadow-sm">{mainInner}</main>
      ) : (
        <div ref={d.containerRef} style={d.alturaCard != null ? { height: d.alturaCard } : undefined}
          className={cn('relative flex min-h-[26rem] overflow-hidden rounded-2xl border bg-card shadow-sm', d.alturaCard == null && 'h-[calc(100vh-12rem)]')}>
          <aside style={{ width: d.larguraPicker }} className="flex shrink-0 flex-col overflow-hidden">
            <div className="border-b p-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={d.busca} onChange={(e) => d.setBusca(e.target.value)} placeholder="Buscar aluno…" className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
                {d.buscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {d.alunos.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">Nenhum aluno.</p>
              ) : d.alunos.map((a) => {
                const aberto = d.abertos.some((o) => o.aluno.id === a.id)
                return (
                  <button key={a.id} type="button" onClick={() => d.abrir(a)} disabled={!d.podeAbrir}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-50', d.ativoId === a.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}>
                    <AvatarEstudante nome={a.nome} avatar={a.avatar} cor={a.avatarCor ?? '#6d28d9'} className="h-8 w-8 shrink-0 text-[11px] text-white" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.nome}</span>
                      {a.email && <span className="block truncate text-[11px] text-muted-foreground">{a.email}</span>}
                    </span>
                    {aberto && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" title="Aberto" />}
                  </button>
                )
              })}
            </div>
          </aside>

          <div onMouseDown={d.iniciarSplit} title="Arraste para ajustar a largura" role="separator" aria-orientation="vertical" className="group relative w-px shrink-0 cursor-col-resize bg-border">
            <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
            <span className="absolute inset-y-0 left-0 w-px bg-border transition-colors group-hover:bg-primary group-active:bg-primary" />
          </div>

          <main className="relative min-w-0 flex-1 bg-muted/30">{mainInner}</main>

          <div onMouseDown={d.iniciarAltura} title="Arraste para ajustar a altura" aria-label="Ajustar altura" className="absolute bottom-0 right-0 z-10 flex h-5 w-5 cursor-ns-resize items-end justify-end p-1 text-muted-foreground/70 hover:text-primary">
            <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M9 2.5 L2.5 9 M9 6 L6 9" /></svg>
          </div>
        </div>
      )}
    </div>
  )
}
