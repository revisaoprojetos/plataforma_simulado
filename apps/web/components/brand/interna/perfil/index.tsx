'use client'

// PERFIL do aluno (spec 05 §1) — switch por marca. Cada marca tem composição PRÓPRIA (não há
// "skin" único): Revisão / VND / MEQ, cada uma com suas 4 abas e header.
// DADOS: `data` (produção, real) → renderiza só seções com fonte real; sem `data` (preview) → mock.
// Privacidade (§1.1): nenhum dado pessoal (e-mail/telefone), comparações anônimas.

import type { Brand, InternaTheme } from '../interna-tokens'
import type { PerfilData } from './data'
import { perfilMock } from './mock'
import { PerfilRevisao } from './perfil-revisao'
import { PerfilVnd } from './perfil-vnd'
import { PerfilMeq } from './perfil-meq'

// `tab`/`preview` são aceitos e IGNORADOS (preview usa mock); a marca governa a composição.
export function PlatformPerfil({ brand, theme, data }: { brand: Brand; theme: InternaTheme; data?: PerfilData; tab?: string; preview?: boolean }) {
  const d = data ?? perfilMock() // sem data (preview) → mock; com data (produção) → real
  if (brand === 'vnd') return <PerfilVnd theme={theme} data={d} />
  if (brand === 'meq') return <PerfilMeq theme={theme} data={d} />
  return <PerfilRevisao theme={theme} data={d} />
}
