import type { Provider } from '@/lib/integracoes/tipos'

/** Metadados dos provedores para a UI (rótulos, cor, campos de credencial). */
export const PROVIDER_META: Record<Provider, { nome: string; cor: string; baseUrlPadrao: string; push: boolean }> = {
  curseduca: { nome: 'Curseduca', cor: '#7c3aed', baseUrlPadrao: 'https://prof.curseduca.pro', push: false },
  guru: { nome: 'Guru', cor: '#0ea5e9', baseUrlPadrao: 'https://digitalmanager.guru', push: true },
}

/** Campos de credencial por provedor (para o form; `secret` = mascarar na leitura). */
export const CAMPOS_PROVIDER: Record<Provider, { key: string; label: string; secret: boolean }[]> = {
  curseduca: [
    { key: 'api_key', label: 'API Key', secret: true },
    { key: 'usuario', label: 'Usuário (e-mail)', secret: false },
    { key: 'senha', label: 'Senha', secret: true },
  ],
  guru: [
    { key: 'api_token', label: 'User Token (API)', secret: true },
    { key: 'webhook_secret', label: 'Account Token (validação do webhook) — opcional', secret: true },
  ],
}
