/**
 * Campos-alvo do mapeamento dinâmico do JSON (webhook). O admin aponta, para cada um,
 * o caminho (dot-path) no payload recebido. `padrao` = caminho usado quando não há mapa
 * (formato conhecido da Guru). Tipos-only (client + server).
 */
export interface CampoMapa {
  key: string
  label: string
  descricao: string
  padrao: string
  padroesAlt?: string[]   // fallbacks tentados quando o mapa/padrão não resolve
  obrigatorio?: boolean
}

export const CAMPOS_MAPA: CampoMapa[] = [
  { key: 'pedido_id', label: 'ID do pedido (único)', descricao: 'Chave única do pedido/transação — identifica o registro. Principal.', padrao: 'id', padroesAlt: ['transaction_id', 'subscription.id', 'code'], obrigatorio: true },
  { key: 'email', label: 'E-mail', descricao: 'E-mail do comprador (casa com o cadastro do aluno).', padrao: 'contact.email', padroesAlt: ['buyer.email', 'customer.email', 'contact.mail'] },
  { key: 'nome', label: 'Nome', descricao: 'Nome do comprador.', padrao: 'contact.name', padroesAlt: ['buyer.name', 'contact.full_name'] },
  { key: 'cpf', label: 'CPF / Documento', descricao: 'Documento do comprador.', padrao: 'contact.doc', padroesAlt: ['contact.document', 'contact.cpf'] },
  { key: 'telefone', label: 'Telefone', descricao: 'Telefone do comprador (número).', padrao: 'contact.phone_number', padroesAlt: ['contact.phone', 'contact.cellphone'] },
  { key: 'ddd', label: 'DDD / Código', descricao: 'Código de área do telefone (juntado ao número).', padrao: 'contact.phone_local_code' },
  { key: 'produto_ref', label: 'ID do produto', descricao: 'Identificador do produto/oferta — casa com o Mapeamento de produtos.', padrao: 'product.marketplace_id', padroesAlt: ['product.internal_id', 'product.id', 'product_id'] },
  { key: 'produto_nome', label: 'Nome do produto', descricao: 'Rótulo do produto (exibição).', padrao: 'product.name', padroesAlt: ['product.title'] },
  { key: 'status', label: 'Status', descricao: 'Status do pedido/assinatura (approved, canceled, refunded…).', padrao: 'status', padroesAlt: ['last_status', 'subscription.last_status', 'subscription.status'] },
]

export type MapaJson = Record<string, string>
