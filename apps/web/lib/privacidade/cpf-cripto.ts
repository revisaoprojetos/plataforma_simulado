import 'server-only'
import { createHmac, createHash } from 'node:crypto'
import { criptografar, descriptografar, criptografiaAtiva, tentarDescriptografar } from '@/lib/crypto'

// CPF criptografado em repouso (ETAPA 1: escrita dupla + helpers). Ver supabase/migrations/20261113010000_cpf_cifrado_etapa1.sql.
//  - cpf_enc  : AES-256-GCM (lib/crypto) — reversível só com a chave do ambiente.
//  - cpf_hash : HMAC-SHA256 dos 11 dígitos com chave DERIVADA da APP_ENCRYPTION_KEY — busca por igualdade, sem decifrar.
// A escrita das colunas novas só liga com CPF_CRIPTO_ESCRITA=on (depois de aplicar a migração) — antes disso nada muda.

export const soDigitosCpf = (v: string | null | undefined): string => String(v ?? '').replace(/\D/g, '')

/** CPF válido p/ indexar: 11 dígitos. Mascarado/vazio/incompleto → null (nunca hasheia lixo). */
function cpfNormalizado(v: string | null | undefined): string | null {
  const d = soDigitosCpf(v)
  return d.length === 11 ? d : null
}

function chaveHash(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim()
  if (!raw) return null
  return createHash('sha256').update(`cpf-hash:v1:${raw}`).digest() // chave de HMAC separada da de cifra
}

export function escritaCpfCriptoLigada(): boolean {
  return process.env.CPF_CRIPTO_ESCRITA === 'on' && criptografiaAtiva()
}

/** Hash de busca do CPF (hex). null se o CPF não tem 11 dígitos ou não há chave. */
export function hashCpf(v: string | null | undefined): string | null {
  const d = cpfNormalizado(v)
  const k = chaveHash()
  if (!d || !k) return null
  return createHmac('sha256', k).update(d).digest('hex')
}

/**
 * Colunas extras para gravar JUNTO com `cpf` em simulado_estudantes: `{ cpf_enc, cpf_hash }`.
 * Devolve `{}` quando a escrita cripto está desligada (flag/chave) ou o CPF não é gravável → seguro espalhar com `...`.
 * `cpf === null` (limpar o CPF) zera as duas colunas junto.
 */
export function colunasCpfCripto(cpf: string | null | undefined): { cpf_enc?: string | null; cpf_hash?: string | null } {
  if (!escritaCpfCriptoLigada()) return {}
  if (cpf === null) return { cpf_enc: null, cpf_hash: null }
  const d = cpfNormalizado(cpf)
  if (!d) return {}
  return { cpf_enc: criptografar(d), cpf_hash: hashCpf(d) }
}

/** Lê o CPF de uma linha: prefere `cpf_enc` (decifra) e cai no `cpf` legado. Nunca lança. */
export function cpfDaLinha(row: { cpf?: string | null; cpf_enc?: string | null } | null | undefined): string | null {
  if (!row) return null
  if (row.cpf_enc) { const d = tentarDescriptografar(row.cpf_enc); if (d) return d }
  return row.cpf ?? null
}

/** Para filtros `.eq('cpf_hash', …)` — a coluna só existe após a migração; quem usa deve manter o fallback por `cpf`. */
export { descriptografar as decifrarCpf }
