'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PlatformLogin — switch por MARCA do novo login (spec 02 §2). Fase 4.
// ─────────────────────────────────────────────────────────────────────────────
//
// Resolve a lógica do formulário uma vez (useLoginCore) e entrega às variantes
// visuais por marca. Após login (`core.entrando`), cobre a tela com o carregamento
// branded da plataforma (<PlatformLoader/>, que re-lê o loadingStyle do console).
//
// Só é montado quando o console liga `loginAtivo` (ver app/login/page.tsx). Caso
// contrário, a plataforma segue no login atual (AlunoEntrarForm).

import { useLoginCore } from './login/use-login-core'
import { PlatformLoader } from './platform-loader'
import { LoginRevisao } from './login/login-revisao'
import { LoginVND } from './login/login-vnd'
import { LoginMEQ } from './login/login-meq'
import type { Brand, LoginTheme, Metodo } from './login/types'

export interface PlatformLoginProps {
  brand: Brand
  theme: LoginTheme
  /** Slug de login do catálogo (§1). */
  style: string
  /** Slug de CARREGAMENTO do catálogo — usado no loader pós-login. Sem ele, cai no fallback da marca. */
  loadingStyle?: string
  metodo?: Metodo
  preview?: boolean
  plataforma: string
  logo?: string | null
  modoInicial?: 'aluno' | 'admin'
}

export function PlatformLogin({
  brand,
  theme,
  style,
  loadingStyle,
  metodo = 'email',
  preview = false,
  plataforma,
  logo = null,
  modoInicial = 'aluno',
}: PlatformLoginProps) {
  const core = useLoginCore({ metodo, preview, modoInicial })
  const common = { theme, core, preview, plataforma, logo, style }

  const tela =
    brand === 'vnd' ? <LoginVND {...common} /> :
    brand === 'meq' ? <LoginMEQ {...common} /> :
    <LoginRevisao {...common} />

  return (
    <>
      {tela}
      {core.entrando && !preview && (
        <div className="fixed inset-0 z-[60]">
          {/* brand/theme/style EXPLÍCITOS → o loader resolve SÍNCRONO (sem piscar o NEUTRO_BG) e usa o
              CARREGAMENTO escolhido no console. Sem `style`, caía sempre no fallback da marca (bug). */}
          <PlatformLoader brand={brand} theme={theme} style={loadingStyle} />
        </div>
      )}
    </>
  )
}
