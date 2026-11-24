import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { abasLinhaItem, ABAS_LINHA_LISTA } from '@/components/ui/abas-linha'

describe('abasLinhaItem', () => {
  it('ativo: sublinhado primário em negrito', () => {
    const c = abasLinhaItem(true)
    expect(c).toContain('border-b-2')
    expect(c).toContain('border-primary')
    expect(c).toContain('font-extrabold')
    expect(c).toContain('text-[14px]')
    expect(c).not.toContain('border-transparent')
  })
  it('inativo: transparente, muted, hover foreground', () => {
    const c = abasLinhaItem(false)
    expect(c).toContain('border-transparent')
    expect(c).toContain('font-semibold')
    expect(c).toContain('text-muted-foreground')
    expect(c).toContain('hover:text-foreground')
    expect(c).not.toContain('border-primary')
  })
  it('lista: linha de base única', () => {
    expect(ABAS_LINHA_LISTA).toContain('border-b')
    expect(ABAS_LINHA_LISTA).toContain('gap-x-7')
  })
})

describe('ui/tabs.tsx', () => {
  it('não usa o indicador deslizante (evita linha dupla)', () => {
    const src = readFileSync(join(process.cwd(), 'components/ui/tabs.tsx'), 'utf8')
    expect(src).not.toContain('TabsPrimitive.Indicator')
  })
})
