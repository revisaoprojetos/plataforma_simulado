'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TranscricaoForm } from './transcricao-form'
import { ApiKeysManager } from '../api-keys/api-keys-manager'
import type { StatusIA } from './actions-tipos'

interface ApiKey {
  id: string; nome: string; key_prefix: string; escopos: string[]
  ultimo_uso: string | null; expira_em: string | null; revogada: boolean; created_at: string
}

/**
 * Duas DIREÇÕES de API em abas:
 *  • IA / Transcrição = chave de SAÍDA (a plataforma usa p/ chamar Gemini/GPT/Claude).
 *  • APIs de fora = chaves de ENTRADA (sistemas externos acessam a API da plataforma).
 */
export function TranscricaoTabs({ inicial, apiKeys, podeApiKeys }: { inicial: StatusIA; apiKeys: ApiKey[]; podeApiKeys: boolean }) {
  return (
    <Tabs defaultValue="ia">
      <TabsList>
        <TabsTrigger value="ia">IA / Transcrição <span className="text-muted-foreground">(o sistema usa)</span></TabsTrigger>
        {podeApiKeys && <TabsTrigger value="externas">APIs de fora <span className="text-muted-foreground">(integrações)</span></TabsTrigger>}
      </TabsList>

      <TabsContent value="ia" className="pt-2">
        <TranscricaoForm inicial={inicial} />
      </TabsContent>

      {podeApiKeys && (
        <TabsContent value="externas" className="pt-2">
          <ApiKeysManager initialKeys={apiKeys} />
        </TabsContent>
      )}
    </Tabs>
  )
}
