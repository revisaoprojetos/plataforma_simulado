export const COLS_ALUNO = 'id, nome, email, acesso_bloqueado, created_at, ultimo_acesso_em'

/** Só campos NÃO sensíveis (nunca CPF/telefone/ip/hash). */
export function mapAluno(r: any) {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    status: r.acesso_bloqueado ? 'bloqueado' : 'ativo',
    criado_em: r.created_at,
    ultimo_acesso: r.ultimo_acesso_em ?? null,
  }
}
