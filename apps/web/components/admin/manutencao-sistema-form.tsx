'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Loader2, Check, Bell, Plus, X, ShieldAlert, Power, PowerOff, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import { isoParaBrtLocal, brtLocalParaIso, BRT_LABEL } from '@/lib/brt'
import { salvarManutencaoSistema } from '@/app/admin/sistema/actions'
import type { ManutencaoSistema } from '@/lib/sistema/manutencao'

export function ManutencaoSistemaForm({ inicial }: { inicial: ManutencaoSistema }) {
  const router = useRouter()
  // O que está de fato SALVO/ativo (independente de edições não salvas nos campos).
  const [ativoPersistido, setAtivoPersistido] = useState(inicial.ativo)
  const [inicio, setInicio] = useState(inicial.inicio ? isoParaBrtLocal(inicial.inicio) : '')
  const [fim, setFim] = useState(inicial.fim ? isoParaBrtLocal(inicial.fim) : '')
  const [titulo, setTitulo] = useState(inicial.titulo)
  const [mensagem, setMensagem] = useState(inicial.mensagem)
  const [avisos, setAvisos] = useState<number[]>(inicial.avisos)
  const [novoAviso, setNovoAviso] = useState('')
  const [pending, start] = useTransition()

  const agora = Date.now()
  const iniMs = inicio ? new Date(inicio).getTime() : null
  const fimMs = fim ? new Date(fim).getTime() : null
  const dentroJanela = (!iniMs || agora >= iniMs) && (!fimMs || agora <= fimMs)
  const emManutencaoAgora = ativoPersistido && dentroJanela
  const agendada = ativoPersistido && iniMs != null && agora < iniMs
  const encerrada = ativoPersistido && fimMs != null && agora > fimMs
  const estado = emManutencaoAgora ? 'Em manutenção agora' : agendada ? 'Agendada' : encerrada ? 'Janela encerrada' : 'Desativada'
  const estadoCls = emManutencaoAgora ? 'text-amber-600 dark:text-amber-400' : agendada ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground'

  function addAviso() {
    const n = Math.round(Number(novoAviso))
    if (!Number.isFinite(n) || n <= 0 || n > 1440) { toast.error('Informe minutos entre 1 e 1440.'); return }
    if (avisos.includes(n)) { setNovoAviso(''); return }
    setAvisos((a) => [...a, n].sort((x, y) => y - x))
    setNovoAviso('')
  }

  function salvar(ativoAlvo: boolean, msgOk: string) {
    start(async () => {
      const r = await salvarManutencaoSistema({
        ativo: ativoAlvo,
        inicio: inicio ? brtLocalParaIso(inicio) : null,
        fim: fim ? brtLocalParaIso(fim) : null,
        avisos, titulo, mensagem,
      })
      if (r?.error) { toast.error(r.error); return }
      setAtivoPersistido(ativoAlvo)
      toast.success(msgOk)
      router.refresh()
    })
  }

  async function ativar() {
    const imediato = !iniMs || agora >= iniMs
    const ok = await confirmar({
      titulo: 'Ativar manutenção da plataforma',
      mensagem: imediato
        ? 'A manutenção começa IMEDIATAMENTE: o portal do aluno será bloqueado agora. Quem já está fazendo um simulado NÃO é interrompido. Deseja ativar?'
        : `A manutenção fica AGENDADA para ${inicio.replace('T', ' ')}. Os alunos serão avisados ${avisos.join(', ')} min antes do início. Deseja ativar?`,
      confirmar: imediato ? 'Bloquear agora' : 'Agendar',
      destrutivo: imediato,
    })
    if (!ok) return
    salvar(true, imediato ? 'Manutenção ativada' : 'Manutenção agendada')
  }

  return (
    <div className="space-y-4">
      {emManutencaoAgora && (
        <AlertBox variante="aviso" icon={ShieldAlert} titulo="A plataforma está EM MANUTENÇÃO agora">
          Os estudantes não conseguem entrar no portal — veem o aviso abaixo. Quem já está fazendo um simulado continua normalmente.
        </AlertBox>
      )}
      {agendada && (
        <AlertBox variante="info" icon={CalendarClock} titulo="Manutenção agendada">
          Começa em <b>{inicio.replace('T', ' ')}</b>. Os alunos serão avisados antes. Você ainda pode ajustar tudo abaixo.
        </AlertBox>
      )}
      {encerrada && (
        <AlertBox variante="info">A janela de manutenção já passou (fim em {fim.replace('T', ' ')}). Ela não está mais bloqueando — atualize a janela ou desative.</AlertBox>
      )}

      <p className="text-sm text-muted-foreground">
        Configure o período, a mensagem e os avisos primeiro. Depois, use <b>Ativar manutenção</b> — nada bloqueia até você ativar.
      </p>

      <Tabs defaultValue="bloqueio">
        <TabsList variant="line" className="gap-4">
          <TabsTrigger value="bloqueio"><Wrench /> Bloqueio &amp; Período</TabsTrigger>
          <TabsTrigger value="avisos"><Bell /> Avisos ({avisos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bloqueio" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wrench className="h-[18px] w-[18px] text-amber-500" /> Período e mensagem</CardTitle>
              <CardDescription>Enquanto ativa e dentro da janela, o portal do aluno fica bloqueado com este aviso. Quem já está fazendo um simulado <b>não</b> é interrompido.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="ms_inicio">Início</Label><Input id="ms_inicio" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="ms_fim">Fim</Label><Input id="ms_fim" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
                <p className="text-xs text-muted-foreground sm:col-span-2">{BRT_LABEL}. Em branco = sem limite (início imediato ao ativar / fim manual).</p>
              </div>
              <div className="space-y-2"><Label htmlFor="ms_titulo">Título do aviso</Label><Input id="ms_titulo" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} /></div>
              <div className="space-y-2">
                <Label htmlFor="ms_msg">Mensagem para o estudante</Label>
                <textarea id="ms_msg" value={mensagem} maxLength={400} rows={3} onChange={(e) => setMensagem(e.target.value)}
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="avisos" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bell className="h-[18px] w-[18px] text-amber-500" /> Avisos antes de bloquear</CardTitle>
              <CardDescription>Antes do horário de início, o aluno recebe uma notificação de que a plataforma vai entrar em manutenção. Escolha quantos minutos antes disparar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!inicio
                ? <AlertBox variante="info">Defina um <b>Início</b> na aba “Bloqueio &amp; Período” para os avisos anteciparem o bloqueio. Sem início, a manutenção é imediata ao ativar e não há aviso prévio.</AlertBox>
                : <p className="text-sm text-muted-foreground">Com início às <b>{inicio.replace('T', ' ')}</b>, o aluno será avisado {avisos.length ? avisos.join(', ') + ' min antes' : '—'}.</p>}

              <div className="flex flex-wrap items-center gap-2">
                {avisos.length === 0 && <span className="text-sm text-muted-foreground">Nenhum aviso configurado.</span>}
                {avisos.map((n) => (
                  <span key={n} className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-sm font-medium">
                    {n} min
                    <button type="button" onClick={() => setAvisos((a) => a.filter((x) => x !== n))} className="text-muted-foreground transition hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={1440} value={novoAviso} placeholder="minutos antes" className="w-40"
                  onChange={(e) => setNovoAviso(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAviso() } }} />
                <Button type="button" variant="outline" onClick={addAviso}><Plus className="mr-1.5 h-4 w-4" /> Adicionar</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rodapé: estado + salvar config (sem ativar) + ativar/desativar deliberado */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="text-sm">
          <span className="text-muted-foreground">Estado atual: </span>
          <b className={estadoCls}>{estado}</b>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => salvar(ativoPersistido, 'Configuração salva')} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Salvar configuração
          </Button>
          {ativoPersistido ? (
            <Button variant="outline" onClick={() => salvar(false, 'Manutenção desativada')} disabled={pending}
              className="border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
              <PowerOff className="mr-2 h-4 w-4" /> Desativar
            </Button>
          ) : (
            <Button onClick={ativar} disabled={pending}>
              <Power className="mr-2 h-4 w-4" /> Ativar manutenção
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
