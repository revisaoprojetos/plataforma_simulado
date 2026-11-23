// Contrato estrutural: o IDOR de sessão fica fechado enquanto a checagem vier ANTES dos efeitos/dados.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const idx = (s: string, t: string) => {
  const i = s.indexOf(t)
  expect(i, `"${t}" ausente`).toBeGreaterThan(-1)
  return i
}

describe('rotas de PDF do aluno chamam autorizarSessao antes de qualquer efeito', () => {
  it('diagnostico-docx-pdf', () => {
    const s = ler('app/api/aluno/diagnostico-docx-pdf/route.ts')
    const a = idx(s, 'autorizarSessao(')
    expect(a).toBeLessThan(idx(s, 'await urlAssinadaOriginal('))
    expect(a).toBeLessThan(idx(s, 'await carregarDadosBancoCore('))
    expect(s).toContain("searchParams.get('sat')")
  })
  it('caderno-teste-pdf', () => {
    const s = ler('app/api/aluno/caderno-teste-pdf/route.ts')
    const a = idx(s, 'autorizarSessao(')
    expect(a).toBeLessThan(idx(s, 'await registrarRelatorioEvento('))
    expect(a).toBeLessThan(idx(s, 'adquirirSlotPdf()'))
    expect(s).toContain('assinarRenderToken(')
    expect(s).toMatch(/s:\s*\(sess as any\)\.id/)
    expect(s).toContain('pdftoken')
    expect(s).toContain('PDF_RENDER_SECRET')
    expect(s).toContain("searchParams.get('sat')")
  })
  it('imprimir/caderno-teste: o ramo sp.sessao só concede acesso após autorizarSessao (sem fallback por id puro)', () => {
    const s = ler('app/imprimir/caderno-teste/[id]/page.tsx')
    const a = idx(s, 'autorizarSessao(')
    const ramo = idx(s, 'if (sp.sessao) {')
    expect(ramo).toBeLessThan(a)
    // entre o início do ramo e a chamada não há leitura de dados do aluno nem atribuição de tenant
    expect(s.slice(ramo, a)).not.toMatch(/tenantId = |carregar(Dados|Questoes)BancoCore/)
    expect(s).toContain('exigirDados: true')
    expect(s).toContain('renderToken: sp.pdftoken')
  })
})
