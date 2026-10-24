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
 *
 * ROTAÇÃO DE CHAVE (incidente "integração some depois de um tempo"): se a `APP_ENCRYPTION_KEY`
 * mudar (troca/valor transitório num redeploy), os segredos salvos com a chave ANTERIOR ficam
 * ilegíveis e a integração "desaparece". Para blindar: `APP_ENCRYPTION_KEY_OLD` aceita UMA ou
 * MAIS chaves antigas (separadas por vírgula) — a descriptografia tenta a atual e depois cada
 * antiga, então uma troca de chave não órfã mais os dados (e permite re-salvar com a nova).
 * A CRIPTOGRAFIA usa SEMPRE a chave atual.
 */

const PREFIXO = 'enc:v1:'

/** Normaliza uma string de chave em 32 bytes (64 hex direto; senão SHA-256 da string). */
function derivar(raw: string | undefined | null): Buffer | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex')
  return createHash('sha256').update(s).digest()
}

/** Chave ATUAL (usada para criptografar). */
function getChave(): Buffer | null {
  return derivar(process.env.APP_ENCRYPTION_KEY)
}

/** Todas as chaves para DESCRIPTOGRAFAR: a atual primeiro, depois as de `APP_ENCRYPTION_KEY_OLD`. */
function getChavesDecrypt(): Buffer[] {
  const chaves: Buffer[] = []
  const atual = getChave()
  if (atual) chaves.push(atual)
  const olds = (process.env.APP_ENCRYPTION_KEY_OLD || '').split(',')
  for (const o of olds) { const k = derivar(o); if (k) chaves.push(k) }
  return chaves
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

/** Tenta descriptografar com UMA chave (null se a chave não serve). Não lança. */
function tentarComChave(valor: string, chave: Buffer): string | null {
  const [, , ivB64, tagB64, ctB64] = valor.split(':')
  try {
    const decipher = createDecipheriv('aes-256-gcm', chave, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()])
    return pt.toString('utf8')
  } catch { return null }
}

/**
 * Descriptografa. Valor sem prefixo (legado texto puro) é devolvido como está. Tenta a chave
 * atual e depois as antigas (`APP_ENCRYPTION_KEY_OLD`). Lança só se NENHUMA chave servir.
 */
export function descriptografar(valor: string | null | undefined): string | null {
  if (valor == null) return null
  if (!estaCriptografado(valor)) return valor // texto puro legado
  const chaves = getChavesDecrypt()
  if (!chaves.length) throw new Error('APP_ENCRYPTION_KEY ausente — não é possível descriptografar o segredo.')
  for (const chave of chaves) { const r = tentarComChave(valor, chave); if (r !== null) return r }
  throw new Error('Falha ao descriptografar (chave incorreta ou dado corrompido).')
}

/** Versão que NÃO lança: devolve o texto ou null se nenhuma chave serve (para diagnóstico/UI). */
export function tentarDescriptografar(valor: string | null | undefined): string | null {
  try { return descriptografar(valor) } catch { return null }
}

/** True se o valor está criptografado mas NENHUMA chave disponível consegue lê-lo (chave mudou). */
export function ilegivelPorChave(valor: string | null | undefined): boolean {
  if (!estaCriptografado(valor)) return false
  try { descriptografar(valor); return false } catch { return true }
}
