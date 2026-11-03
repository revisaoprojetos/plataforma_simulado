import 'server-only'
import { SignJWT, jwtVerify } from 'jose'

// Fonte de arquivo para o OnlyOffice (ConvertService + editor) baixar SEM depender de alcançar o
// storage diretamente. O Document Server baixa a URL do PRÓPRIO app (host = o mesmo CONTEUDO_WOPI_HOST
// já usado nos callbacks de edição → comprovadamente alcançável pelo container). A rota
// /api/conteudo/fonte lê o arquivo via getStorage() (baixarOriginal) e faz streaming. Resultado:
// trocar STORAGE_PROVIDER p/ s3 (Hetzner) NÃO quebra a conversão — o OnlyOffice nunca precisa baixar
// do Hetzner (presigned), que o container não alcança/aceita. O arquivo_key viaja num token curto
// assinado (HMAC) p/ a rota não servir chave arbitrária.

function segredo(): Uint8Array {
  return new TextEncoder().encode(
    process.env.ONLYOFFICE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-fonte-onlyoffice',
  )
}

function hostApp(): string {
  return (process.env.CONTEUDO_WOPI_HOST || process.env.TESTE_WOPI_HOST || 'http://host.docker.internal:3000').replace(/\/$/, '')
}

/** URL (app-hosted) usada como document.url do editor e como `url` do ConvertService. Provider-independente. */
export async function urlFonteOnlyOffice(arquivoKey: string, segundos = 1800): Promise<string> {
  const token = await new SignJWT({ k: arquivoKey })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${Math.max(60, Math.trunc(segundos))}s`)
    .sign(segredo())
  return `${hostApp()}/api/conteudo/fonte?t=${encodeURIComponent(token)}`
}

/** Verifica o token da rota /api/conteudo/fonte e devolve o arquivo_key autorizado (ou null). */
export async function lerTokenFonte(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, segredo())
    return typeof payload.k === 'string' && payload.k ? payload.k : null
  } catch {
    return null
  }
}
