'use client'

// Barra de abas "tab de linha" (sublinhado) da área unificada Questões/Recomendados — SÓ Revisão.
// Fica logo abaixo do <h1> das telas internas (Banco e Recomendado-Revisão) e reusa os tokens das
// telas internas (internaTokensStyle já injeta --brand/--ink/--muted/--line no root de cada tela):
// aba ativa = sublinhado de 2px na cor da marca; inativa = texto apagado. Cada página sabe sua rota
// (passa `ativo`), então a barra é "server-friendly" (apenas <Link>, sem estado/efeito).

import Link from 'next/link'

type AbaKey = 'questoes' | 'recomendado'

const ABAS: { key: AbaKey; label: string; href: string }[] = [
  { key: 'questoes', label: 'Questões Revisão', href: '/aluno/questoes' },
  { key: 'recomendado', label: 'Recomendados', href: '/aluno/recomendado' },
]

export function QuestoesTabs({ ativo }: { ativo: AbaKey }) {
  return (
    <div
      role="tablist"
      aria-label="Área de questões"
      style={{ display: 'flex', gap: 22, marginTop: 14, borderBottom: '1px solid var(--line)' }}
    >
      <style>{'.qtabs-aba{transition:color .15s,border-color .15s}.qtabs-aba:hover{color:var(--ink)}'}</style>
      {ABAS.map((a) => {
        const on = a.key === ativo
        return (
          <Link
            key={a.key}
            href={a.href}
            role="tab"
            aria-selected={on}
            className="qtabs-aba"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 40,
              padding: '0 2px',
              marginBottom: -1,
              borderBottom: `2px solid ${on ? 'var(--brand)' : 'transparent'}`,
              color: on ? 'var(--brand)' : 'var(--muted)',
              fontSize: 14,
              fontWeight: on ? 800 : 600,
              whiteSpace: 'nowrap',
              textDecoration: 'none',
            }}
          >
            {a.label}
          </Link>
        )
      })}
    </div>
  )
}
