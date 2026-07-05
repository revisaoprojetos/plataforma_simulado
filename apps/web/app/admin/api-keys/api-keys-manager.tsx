'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, Check, Plus, Trash2, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { SecaoHeader } from '@/components/admin/secao-header'
import { criarApiKey, revogarApiKey } from './actions'

const AVAILABLE_SCOPES = [
  'questoes:create',
  'questoes:view',
  'import:run',
  'simulados:view',
  'relatorios:view',
]

interface ApiKey {
  id: string
  nome: string
  key_prefix: string
  escopos: string[]
  ultimo_uso: string | null
  expira_em: string | null
  revogada: boolean
  created_at: string
}

interface Props {
  initialKeys: ApiKey[]
}

export function ApiKeysManager({ initialKeys }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys)
  const [open, setOpen] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [nome, setNome] = useState('')
  const [escopos, setEscopos] = useState<string[]>(['import:run'])
  const [expiraEm, setExpiraEm] = useState('')

  function toggleScope(scope: string) {
    setEscopos(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope],
    )
  }

  function handleCopy() {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleCreate() {
    if (!nome.trim() || !escopos.length) {
      toast.error('Preencha o nome e selecione ao menos um escopo')
      return
    }

    startTransition(async () => {
      const result = await criarApiKey({
        nome: nome.trim(),
        escopos,
        expira_em: expiraEm || undefined,
      })

      if (!result.ok) {
        toast.error(result.error ?? 'Erro ao criar API key')
        return
      }

      setCreatedKey(result.key_completa ?? null)
      toast.success('API key criada com sucesso')

      const newKey: ApiKey = {
        id: result.id!,
        nome: nome.trim(),
        key_prefix: result.key_completa?.slice(0, 8) ?? '',
        escopos,
        ultimo_uso: null,
        expira_em: expiraEm || null,
        revogada: false,
        created_at: new Date().toISOString(),
      }
      setKeys(prev => [newKey, ...prev])
      setNome('')
      setEscopos(['import:run'])
      setExpiraEm('')
    })
  }

  function handleDialogClose(isOpen: boolean) {
    if (!isOpen) {
      setCreatedKey(null)
      setCopied(false)
    }
    setOpen(isOpen)
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const result = await revogarApiKey(id)
      if (!result.ok) {
        toast.error(result.error ?? 'Erro ao revogar')
        return
      }
      setKeys(prev => prev.map(k => k.id === id ? { ...k, revogada: true } : k))
      toast.success('API key revogada')
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">{keys.length} chave(s) registrada(s)</p>
        </div>

        <Dialog open={open} onOpenChange={handleDialogClose}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" />
            Nova API Key
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {createdKey ? 'Chave criada' : 'Criar nova API Key'}
              </DialogTitle>
              <DialogDescription>
                {createdKey
                  ? 'Copie a chave agora. Ela não será exibida novamente.'
                  : 'A chave completa só será exibida uma vez após a criação.'}
              </DialogDescription>
            </DialogHeader>

            {createdKey ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Chave de API</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs break-all font-mono">{createdKey}</code>
                    <Button size="icon" variant="ghost" className="shrink-0 h-7 w-7" onClick={handleCopy}>
                      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Guarde agora — esta chave não será exibida novamente.
                </p>
                <DialogFooter>
                  <Button onClick={() => handleDialogClose(false)}>Fechar</Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    placeholder="Ex: Integração Moodle"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Escopos</Label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_SCOPES.map(scope => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => toggleScope(scope)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          escopos.includes(scope)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-border hover:border-primary/50'
                        }`}
                      >
                        {scope}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expira_em">Expiração (opcional)</Label>
                  <Input
                    id="expira_em"
                    type="datetime-local"
                    value={expiraEm}
                    onChange={e => setExpiraEm(e.target.value)}
                  />
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => handleDialogClose(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreate} disabled={isPending}>
                    {isPending ? 'Criando…' : 'Criar API Key'}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={Key} titulo="Chaves registradas" subtitulo={`${keys.length} chave(s)`} />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Prefixo</TableHead>
                <TableHead>Escopos</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Expira em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    <Key className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    Nenhuma API key criada.
                  </TableCell>
                </TableRow>
              ) : (
                keys.map(key => (
                  <TableRow key={key.id} className={key.revogada ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{key.nome}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {key.key_prefix}…
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.escopos.map(s => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {key.ultimo_uso
                        ? new Date(key.ultimo_uso).toLocaleDateString('pt-BR')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {key.expira_em
                        ? new Date(key.expira_em).toLocaleDateString('pt-BR')
                        : 'Nunca'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.revogada ? 'destructive' : 'default'}>
                        {key.revogada ? 'Revogada' : 'Ativa'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {!key.revogada && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRevoke(key.id)}
                          disabled={isPending}
                          title="Revogar chave"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
