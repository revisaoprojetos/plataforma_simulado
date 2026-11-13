import type { AchadoScan, ResultadoChecagem } from '../tipos'

type Env = Record<string, string | undefined>

const PADROES_FRACOS = /^(changeme|change-me|secret|password|admin|123456|test|teste|default|example|your[-_]|xxx|todo)/i

function segredoFraco(v: string | undefined, min: number): string | null {
  if (!v) return 'ausente'
  if (v.length < min) return `curto (<${min} caracteres)`
  if (PADROES_FRACOS.test(v)) return 'valor padrão/exemplo'
  return null
}

/** Segredos obrigatórios em produção: [nome, tamanho mínimo, severidade se faltar]. */
const OBRIGATORIOS: [string, number, 'critico' | 'alto'][] = [
  ['CRON_SECRET', 24, 'critico'],
  ['APP_ENCRYPTION_KEY', 32, 'critico'],
  ['SUPABASE_SERVICE_ROLE_KEY', 20, 'critico'],
  ['ALUNO_SESSION_SECRET', 24, 'alto'],
  ['API_INTERNAL_SECRET', 24, 'alto'],
  ['PDF_RENDER_SECRET', 24, 'alto'],
]

/** Pura: avalia as variáveis de ambiente do processo web. O valor dos segredos nunca é exibido. */
export function avaliarConfig(env: Env): AchadoScan[] {
  const out: AchadoScan[] = []
  if (env.NODE_ENV !== 'production') {
    out.push({
      categoria: 'config', severidade: 'alto', titulo: `NODE_ENV="${env.NODE_ENV ?? ''}" fora de production`,
      detalhe: 'Rotas /api/teste e /api/dev dependem de NODE_ENV; em modo dev há mais superfície exposta.',
      recomendacao: 'Executar o container com NODE_ENV=production.', fingerprint: 'config:node-env',
    })
  }
  for (const [nome, min, sev] of OBRIGATORIOS) {
    const problema = segredoFraco(env[nome], min)
    if (problema) {
      out.push({
        categoria: 'chaves', severidade: sev, titulo: `${nome}: ${problema}`,
        detalhe: 'Segredo obrigatório ausente, curto ou com valor padrão.',
        recomendacao: `Definir ${nome} com valor aleatório forte (>= ${min} caracteres) no Portainer/env.`,
        fingerprint: `config:segredo:${nome}`,
      })
    }
  }
  for (const [k, v] of Object.entries(env)) {
    if (/PASSWORD|PASSWD/i.test(k) && v !== undefined && v.trim() === '') {
      out.push({
        categoria: 'config', severidade: 'medio', titulo: `${k} definida com valor vazio`,
        recomendacao: 'Definir uma senha forte ou remover a variável.', fingerprint: `config:senha-vazia:${k}`,
      })
    }
  }
  if (!env.DATABASE_URL) {
    out.push({
      categoria: 'config', severidade: 'baixo', titulo: 'DATABASE_URL ausente',
      detalhe: 'Relatórios caem no PostgREST (egress alto) — ver incidente de egress.', recomendacao: 'Definir DATABASE_URL no serviço web.',
      fingerprint: 'config:database-url',
    })
  }
  return out
}

export function checarConfig(env: Env = process.env as Env): ResultadoChecagem {
  return { nome: 'config', achados: avaliarConfig(env) }
}
