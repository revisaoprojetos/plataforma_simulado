'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, PlugZap, Video } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import type { VideoConfigPublica, TesteConexaoVideo } from '@/lib/video/config-tipos'
import { salvarVideoConfigAction, testarConexaoVideoAction } from './actions'

function Campo({ id, rotulo, dica, children }: { id: string; rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}

function Sonda({ nome, v }: { nome: string; v?: string }) {
  return (
    <span className="rounded-lg border px-2 py-1 text-xs">
      {nome}: <b className={v === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{v ?? '-'}</b>
    </span>
  )
}

export function VideoConfigClient({ inicial, tabelaExiste }: { inicial: VideoConfigPublica; tabelaExiste: boolean }) {
  const [urlInterna, setUrlInterna] = useState(inicial.urlInterna)
  const [prefixo, setPrefixo] = useState(inicial.prefixoPublico)
  const [ativo, setAtivo] = useState(inicial.ativo)
  const [chave, setChave] = useState('')
  const [adminEmail, setAdminEmail] = useState(inicial.adminEmail)
  const [adminSenha, setAdminSenha] = useState('')
  const [chaveOk, setChaveOk] = useState({ cfg: inicial.chaveConfigurada, fim: inicial.chaveFim })
  const [senhaOk, setSenhaOk] = useState(inicial.adminSenhaConfigurada)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<TesteConexaoVideo | null>(null)

  async function salvar() {
    setSalvando(true)
    const r = await salvarVideoConfigAction({ urlInterna, prefixoPublico: prefixo, ativo, chave, adminEmail, adminSenha })
    setSalvando(false)
    if (!r.ok) return toast.error(r.error)
    if (chave.trim()) setChaveOk({ cfg: true, fim: chave.trim().slice(-4) })
    if (adminSenha.trim()) setSenhaOk(true)
    setChave('')
    setAdminSenha('')
    toast.success('Configuração de vídeo salva.')
  }

  async function testar() {
    setTestando(true)
    setTeste(await testarConexaoVideoAction(urlInterna))
    setTestando(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Video className="size-5 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold">Serviço de vídeo</h1>
          <p className="text-sm text-muted-foreground">Configuração global (vale para todas as plataformas). Sem redeploy; as variáveis VIDEO_* seguem como fallback.</p>
        </div>
      </div>

      {!tabelaExiste && (
        <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          Tabela video_config não encontrada. Aplique a migration 20261110020000_video_config.sql no SQL Editor.
        </p>
      )}

      <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
        <Campo id="vc-url" rotulo="URL interna do serviço" dica="Rede interna do Swarm/Docker. Ex.: http://video-api:3000">
          <Input id="vc-url" value={urlInterna} onChange={(e) => setUrlInterna(e.target.value)} />
        </Campo>
        <Campo id="vc-prefixo" rotulo="Prefixo público" dica="O navegador acessa [domínio da plataforma][prefixo]/v1/... (o Traefik encaminha ao serviço).">
          <Input id="vc-prefixo" value={prefixo} onChange={(e) => setPrefixo(e.target.value)} />
        </Campo>
        <Campo id="vc-chave" rotulo="Chave de integração" dica={chaveOk.cfg ? `Configurada (termina em ••••${chaveOk.fim ?? ''}). Deixe vazio para manter.` : 'Não configurada.'}>
          <Input id="vc-chave" type="password" autoComplete="new-password" value={chave} onChange={(e) => setChave(e.target.value)} placeholder={chaveOk.cfg ? '••••••••' : ''} />
        </Campo>
        <div />
        <Campo id="vc-email" rotulo="E-mail do admin do serviço">
          <Input id="vc-email" type="email" autoComplete="off" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
        </Campo>
        <Campo id="vc-senha" rotulo="Senha do admin do serviço" dica={senhaOk ? 'Configurada. Deixe vazio para manter.' : 'Não configurada.'}>
          <Input id="vc-senha" type="password" autoComplete="new-password" value={adminSenha} onChange={(e) => setAdminSenha(e.target.value)} placeholder={senhaOk ? '••••••••' : ''} />
        </Campo>
        <label className="flex items-center gap-3 text-sm md:col-span-2">
          <Switch checked={ativo} onCheckedChange={setAtivo} />
          Ativo (usar esta configuração; desativado = usa as variáveis de ambiente, se houver)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
        </Button>
        <Button variant="outline" onClick={testar} disabled={testando}>
          {testando ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Testar conexão
        </Button>
        {teste && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={teste.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{teste.mensagem}</span>
            <Sonda nome="db" v={teste.db} />
            <Sonda nome="redis" v={teste.redis} />
            <Sonda nome="s3" v={teste.s3} />
          </div>
        )}
      </div>
    </div>
  )
}
