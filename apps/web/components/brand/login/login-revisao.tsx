'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN — Revisão (spec 02 §1.1 / §2.3). As 9 variantes = layout × efeito.
//   layout: classico | lista | codigo
//   efeito: nenhum | quadrados | formas | efeitos
// Slug desconhecido → rev-login-classico. Acento PÊSSEGO #FFC4A3 (não o amarelo).
//
// Cada layout vive num arquivo próprio com <style> escopado por prefixo único
// (rlc-/rll-/rlk-) e reaproveita <LoginForm> + brand-marks. Mobile é o MESMO
// componente responsivo (@media ≤640px). Ver revisao/*.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import type { LoginVariantProps } from './types'
import { LoginRevisaoClassico } from './revisao/classico'
import { LoginRevisaoLista } from './revisao/lista'
import { LoginRevisaoCodigo } from './revisao/codigo'
import type { Efeito } from './revisao/shared'

type Layout = 'classico' | 'lista' | 'codigo'

/** Mapeia o slug do console p/ (layout, efeito). Slug inválido → clássico base. */
function resolver(style: string): { layout: Layout; efeito: Efeito } {
  switch (style) {
    case 'rev-login-formas': return { layout: 'classico', efeito: 'formas' }
    case 'rev-login-quadrados': return { layout: 'classico', efeito: 'quadrados' }
    case 'rev-login-lista': return { layout: 'lista', efeito: 'nenhum' }
    case 'rev-login-lista-efeitos': return { layout: 'lista', efeito: 'efeitos' }
    case 'rev-login-lista-quadrados': return { layout: 'lista', efeito: 'quadrados' }
    case 'rev-login-codigo': return { layout: 'codigo', efeito: 'nenhum' }
    case 'rev-login-codigo-efeitos': return { layout: 'codigo', efeito: 'efeitos' }
    case 'rev-login-codigo-quadrados': return { layout: 'codigo', efeito: 'quadrados' }
    case 'rev-login-classico':
    default: return { layout: 'classico', efeito: 'nenhum' }
  }
}

export function LoginRevisao({ style, ...props }: LoginVariantProps & { style: string }) {
  const { layout, efeito } = resolver(style)
  if (layout === 'lista') return <LoginRevisaoLista {...props} efeito={efeito} />
  if (layout === 'codigo') return <LoginRevisaoCodigo {...props} efeito={efeito} />
  return <LoginRevisaoClassico {...props} efeito={efeito} />
}
