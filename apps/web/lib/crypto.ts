import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

/**
 * Criptografia em repouso para segredos guardados no banco (ex.: credenciais Curseduca
 * por tenant). AES-256-GCM com chave do AMBIENTE (`APP_ENCRYPTION_KEY`) — a chave NUNCA
 * vai para o banco. Formato self-describing: "enc:v1:<iv>:<tag>:<ciphertext>" (base64).
 *
 * Compatibilidade: `descriptografar` de um valor SEM o prefixo "enc:" devolve o próprio
 * valor (texto puro legado). Assim, credenciais já salvas antes continuam funcionando e
 * passam a ser criptografadas no próximo salvamento.
 */

const PREFIXO = 'enc:v1:'

/** Chave de 32 bytes derivada de `APP_ENCRYPTION_KEY` (hex/base64/qualquer string). */
function getChave(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) return null
  // Aceita 64 hex (32 bytes) direto; senão deriva 32 bytes por SHA-256 da string.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return createHash('sha256').update(raw).digest()
}

export function criptografiaAtiva(): boolean {
  return getChave() !== null
}

/** True se o valor já está no formato criptografado. */
export function estaCriptografado(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith(PREFIXO)
}

/** Criptografa um texto. Sem chave no ambiente, devolve o texto puro (com aviso). */
export function criptografar(texto: string | null | undefined): string | null {
  if (texto == null || texto === '') return texto ?? null
  const chave = getChave()
  if (!chave) {
    if (process.env.NODE_ENV === 'production') console.warn('[crypto] APP_ENCRYPTION_KEY ausente — segredo salvo em TEXTO PURO.')
    return texto
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', chave, iv)
  const ct = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIXO}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/** Descriptografa. Valor sem prefixo (legado texto puro) é devolvido como está. */
export function descriptografar(valor: string | null | undefined): string | null {
  if (valor == null) return null
  if (!estaCriptografado(valor)) return valor // texto puro legado
  const chave = getChave()
  if (!chave) throw new Error('APP_ENCRYPTION_KEY ausente — não é possível descriptografar o segredo.')
  const [, , ivB64, tagB64, ctB64] = valor.split(':')
  try {
    const decipher = createDecipheriv('aes-256-gcm', chave, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()])
    return pt.toString('utf8')
  } catch {
    throw new Error('Falha ao descriptografar (chave incorreta ou dado corrompido).')
  }
}
