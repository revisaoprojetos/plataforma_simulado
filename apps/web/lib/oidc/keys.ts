import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { calculateJwkThumbprint, exportJWK, type JWK } from 'jose'

export interface OidcKeys {
  privateKey: KeyObject
  publicKey: KeyObject
  publicJwk: JWK & { kid: string; alg: 'RS256'; use: 'sig' }
  kid: string
  /** Chave simétrica (32B) derivada da chave privada — cifra o `code` (JWE dir/A256GCM) de forma stateless entre réplicas. */
  codeKey: Uint8Array
}

export async function montarChaves(privateKey: KeyObject): Promise<OidcKeys> {
  const publicKey = createPublicKey(privateKey)
  const jwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(jwk, 'sha256')
  const der = privateKey.export({ type: 'pkcs8', format: 'der' })
  const codeKey = new Uint8Array(createHash('sha256').update('oidc-code-v1').update(der).digest())
  return { privateKey, publicKey, publicJwk: { ...jwk, kid, alg: 'RS256', use: 'sig' }, kid, codeKey }
}

export class ChaveAusenteError extends Error {}

let cache: { pem: string; keys: OidcKeys } | null = null
let efemera: OidcKeys | null = null

/** Carrega a chave de CADERNOS_OIDC_PRIVATE_KEY (aceita `\n` literais). Em produção sem chave: ChaveAusenteError (503). */
export async function carregarChaves(): Promise<OidcKeys> {
  const bruto = (process.env.CADERNOS_OIDC_PRIVATE_KEY ?? '').trim()
  if (!bruto) {
    if (process.env.NODE_ENV === 'production') throw new ChaveAusenteError('CADERNOS_OIDC_PRIVATE_KEY não configurada.')
    if (!efemera) {
      console.warn('[oidc] CADERNOS_OIDC_PRIVATE_KEY ausente — usando chave EFÊMERA (apenas dev; tokens invalidam a cada restart).')
      efemera = await montarChaves(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey)
    }
    return efemera
  }
  const pem = bruto.replace(/\n/g, '\n')
  if (cache?.pem === pem) return cache.keys
  let pk: KeyObject
  try { pk = createPrivateKey(pem) } catch { throw new ChaveAusenteError('CADERNOS_OIDC_PRIVATE_KEY inválida (esperado PEM RSA).') }
  if (pk.asymmetricKeyType !== 'rsa' || (pk.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
    throw new ChaveAusenteError('CADERNOS_OIDC_PRIVATE_KEY deve ser RSA >= 2048 bits.')
  }
  const keys = await montarChaves(pk)
  cache = { pem, keys }
  return keys
}
