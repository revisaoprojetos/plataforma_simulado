// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO das variantes de LOGIN por marca (spec 02 §2) — Fase 4 do redesign.
// ─────────────────────────────────────────────────────────────────────────────
//
// Cada variante (Revisão/VND/MEQ) é um componente PRESENTACIONAL que monta o seu
// "chrome" (fundo, efeitos, headline, lista…) e encaixa o <LoginForm> compartilhado
// no slot do card. A LÓGICA do formulário (estado + submit + admin toggle) vive no
// hook `useLoginCore` e é repassada via `core`. Assim as 18 variantes não duplicam
// nada de autenticação — só desenham.

export type Brand = 'revisao' | 'vnd' | 'meq'
export type LoginTheme = 'claro' | 'escuro' | 'azul' // 'azul' só MEQ

export type Metodo = 'email' | 'email_cpf' | 'email_telefone'

/** Estado + ações do formulário de login (vem de useLoginCore). */
export interface LoginCore {
  email: string
  setEmail: (v: string) => void
  cpf: string
  setCpf: (v: string) => void
  telefone: string
  setTelefone: (v: string) => void
  senha: string
  setSenha: (v: string) => void
  /** 'aluno' = login leve por e-mail; 'admin' = e-mail + senha. */
  modo: 'aluno' | 'admin'
  alternarModo: () => void
  metodo: Metodo
  carregando: boolean
  /** true após submit bem-sucedido (dispara a tela de carregamento branded). */
  entrando: boolean
  erro: string | null
  manutencao: { titulo: string; mensagem: string } | null
  submit: (e: React.FormEvent) => void
}

/** Paleta que a marca injeta no <LoginForm> (campos/CTA/links) — type-safe, sem CSS vars soltas. */
export interface LoginFormTokens {
  /** Cor do texto do card. */
  fg: string
  /** Texto auxiliar (rodapé/placeholder). */
  muted: string
  fieldBg: string
  fieldBorder: string
  fieldFg: string
  /** Cor primária (foco do campo, links). */
  primary: string
  /** Fundo do CTA (pode ser cor sólida ou um `linear-gradient(...)`). */
  ctaBg: string
  ctaFg: string
  /** Pílula flutuante Admin/Aluno. */
  pillBg: string
  pillFg: string
  pillBorder: string
}

/** Props comuns a toda variante de login. */
export interface LoginVariantProps {
  theme: LoginTheme
  core: LoginCore
  /** Modo prévia (console): sem submit real, sem navegação. */
  preview?: boolean
  /** Nome da plataforma (rodapé/copyright). */
  plataforma: string
  /** Logo do tenant (quando houver); as variantes usam sobretudo os SVGs de marca. */
  logo?: string | null
}
