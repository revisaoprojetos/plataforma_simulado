'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Loader2, Check, Bell, Plus, X, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertBox } from '@/components/ui/alert-box'
import { isoParaBrtLocal, brtLocalParaIso, BRT_LABEL } from '@/lib/brt'
import { salvarManutencaoSistema } from '@/app/admin/sistema/actions'
import type { ManutencaoSistema } from '@/lib/sistema/manutencao'

export function ManutencaoSistemaForm({ inicial }: { inicial: ManutencaoSistema }) {
  const router = useRouter()
  const [ativo, setAtivo] = useState(inicial.ativo)
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
  const emManutencaoAgora = ativo && (!iniMs || agora >= iniMs) && (!fimMs || agora <= fimMs)

  function addAviso() {
    const n = Math.round(Number(novoAviso))
    if (!Number.isFinite(n) || n <= 0 || n > 1440) { toast.error('Informe minutos entre 1 e 1440.'); return }
    if (avisos.includes(n)) { setNovoAviso(''); return }
    setAvisos((a) => [...a, n].sort((x, y) => y - x))
    setNovoAviso('')
  }

  function salvar() {
    start(async () => {
      const r = await salvarManutencaoSistema({
        ativo,
        inicio: inicio ? brtLocalParaIso(inicio) : null,
        fim: fim ? brtLocalParaIso(fim) : null,
        avisos,
        titulo,
        mensagem,
      })
      if (r?.error) { toast.error(r.error); return }
      toast.success('Manutenção salva')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {emManutencaoAgora && (
        <AlertBox variante="aviso" icon={ShieldAlert} titulo="A plataforma está EM MANUTENÇÃO agora">
          Os estudantes não conseguem entrar no portal — veem o aviso configurado. Quem já está fazendo um simulado continua normalmente.
        </AlertBox>
      )}

      <Tabs defaultValue="bloqueio">
        <TabsList variant="line" className="gap-4">
          <TabsTrigger value="bloqueio"><Wrench /> Bloqueio &amp; Período</TabsTrigger>
          <TabsTrigger value="avisos"><Bell /> Avisos ({avisos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bloqueio" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wrench className="h-[18px] w-[18px] text-amber-500" /> Manutenção da plataforma</CardTitle>
              <CardDescription>Enquanto ativa e dentro da janela, o portal do aluno fica bloqueado com um aviso. Quem já está fazendo um simulado <b>não</b> é interrompido (atividade com tempo).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Switch id="ms_ativo" checked={ativo} onCheckedChange={setAtivo} className="mt-0.5" />
                <div>
                  <Label htmlFor="ms_ativo">Ativar manutenção da plataforma</Label>
                  <p className="text-xs text-muted-foreground">Deixe a janela em branco para manutenção imediata até você desligar.</p>
                </div>
              </div>

              {ativo && (
                <>
                  <div className="grid gap-4 rounded-lg border bg-amber-500/5 p-3 sm:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor="ms_inicio">Início</Label><Input id="ms_inicio" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="ms_fim">Fim</Label><Input id="ms_fim" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
                    <p className="text-xs text-muted-foreground sm:col-span-2">{BRT_LABEL}. Em branco = sem limite (início imediato / fim manual).</p>
                  </div>
                  <div className="space-y-2"><Label htmlFor="ms_titulo">Título do aviso</Label><Input id="ms_titulo" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} /></div>
                  <div className="space-y-2">
                    <Label htmlFor="ms_msg">Mensagem para o estudante</Label>
                    <textarea id="ms_msg" value={mensagem} maxLength={400} rows={3} onChange={(e) => setMensagem(e.target.value)}
                      className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring" />
                  </div>
                </>
              )}
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
                ? <AlertBox variante="info">Defina um <b>Início</b> na aba “Bloqueio &amp; Período” para os avisos anteciparem o bloqueio. Sem início, a manutenção é imediata e não há aviso prévio.</AlertBox>
                : <p className="text-sm text-muted-foreground">Com início às <b>{inicio.replace('T', ' ')}</b>, o aluno será avisado {avisos.length ? avisos.map((n) => `${n}`).join(', ') + ' min antes' : '—'}.</p>}

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

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Salvar manutenção
        </Button>
      </div>
    </div>
  )
}
