// Helpers de CLIENTE para salvar em cadernos: destino padrão (Leitura / Questões) e o contador de itens
// salvos na sessão (usado pelo aviso ao sair do leitor). Sem dependência de beforeunload (o leitor roda
// iframe dentro de iframe na Curseduca): o aviso é in-app, disparado pelos botões Voltar/Concluir.

export type ContextoDestino = 'leitura' | 'questoes'
export type Destino = { caderno_id: string | null; salvar_sem_perguntar: boolean }
export type Destinos = Record<ContextoDestino, Destino>
export type CadernoLista = { id: string; nome: string; total: number; questoes?: number; comentarios?: number; grifos?: number; anotacoes?: number }

export const DESTINOS_VAZIOS: Destinos = {
  leitura: { caderno_id: null, salvar_sem_perguntar: false },
  questoes: { caderno_id: null, salvar_sem_perguntar: false },
}

const init: RequestInit = { credentials: 'same-origin' }

export async function carregarCadernos(): Promise<CadernoLista[]> {
  try {
    const r = await fetch('/api/aluno/cadernos', init)
    if (!r.ok) return []
    const j = await r.json()
    return Array.isArray(j?.cadernos) ? j.cadernos : []
  } catch { return [] }
}

export async function carregarDestinos(): Promise<{ destinos: Destinos; indisponivel: boolean }> {
  try {
    const r = await fetch('/api/aluno/cadernos/destinos', init)
    if (!r.ok) return { destinos: DESTINOS_VAZIOS, indisponivel: true }
    const j = await r.json()
    return { destinos: { ...DESTINOS_VAZIOS, ...(j?.destinos ?? {}) }, indisponivel: !!j?.indisponivel }
  } catch { return { destinos: DESTINOS_VAZIOS, indisponivel: true } }
}

export async function salvarDestino(contexto: ContextoDestino, d: Destino): Promise<{ ok: boolean; message?: string; destino?: Destino }> {
  try {
    const r = await fetch('/api/aluno/cadernos/destinos', {
      ...init, method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contexto, caderno_id: d.caderno_id, salvar_sem_perguntar: d.salvar_sem_perguntar }),
    })
    const j = await r.json().catch(() => null)
    invalidarDestinosCache()
    return r.ok && j?.ok ? { ok: true, destino: j.destino } : { ok: false, message: j?.message || 'Não consegui salvar a preferência.' }
  } catch { return { ok: false, message: 'Não consegui salvar a preferência. Verifique a conexão.' } }
}

// ---- Contador de salvamentos da sessão de leitura (aviso ao sair) ----
export type TipoContado = 'grifo' | 'anotacao' | 'comentario' | 'questao'
export type ResumoCaderno = { cadernoId: string; nome: string } & Record<TipoContado, number>

const CHAVE = 'cad:salvos-sessao'
let mem: Record<string, ResumoCaderno> = {}

function ler(): Record<string, ResumoCaderno> {
  if (Object.keys(mem).length) return mem
  try { const s = sessionStorage.getItem(CHAVE); if (s) mem = JSON.parse(s) } catch { /* storage bloqueado (iframe) */ }
  return mem
}
function gravar() { try { sessionStorage.setItem(CHAVE, JSON.stringify(mem)) } catch { /* ignore */ } }

export function registrarSalvo(cadernoId: string, nome: string, tipo: TipoContado, n = 1) {
  const m = ler()
  const r = (m[cadernoId] ??= { cadernoId, nome, grifo: 0, anotacao: 0, comentario: 0, questao: 0 })
  r.nome = nome || r.nome
  r[tipo] += n
  gravar()
}
export function resumoSalvos(): ResumoCaderno[] {
  return Object.values(ler()).filter((r) => r.grifo + r.anotacao + r.comentario + r.questao > 0)
}
export function limparSalvos() { mem = {}; try { sessionStorage.removeItem(CHAVE) } catch { /* ignore */ } }

const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
/** "3 grifos, 1 anotação" */
export function descreverResumo(r: ResumoCaderno): string {
  const p: string[] = []
  if (r.grifo) p.push(pl(r.grifo, 'grifo', 'grifos'))
  if (r.anotacao) p.push(pl(r.anotacao, 'anotação', 'anotações'))
  if (r.comentario) p.push(pl(r.comentario, 'comentário', 'comentários'))
  if (r.questao) p.push(pl(r.questao, 'questão', 'questões'))
  return p.join(', ')
}

// Destinos com cache curto em memória: várias QuestaoCard na mesma tela pedem o padrão e só 1 request sai.
let cacheDestinos: { at: number; p: Promise<{ destinos: Destinos; indisponivel: boolean }> } | null = null
export function destinosEmCache(): Promise<{ destinos: Destinos; indisponivel: boolean }> {
  if (cacheDestinos && Date.now() - cacheDestinos.at < 30000) return cacheDestinos.p
  const p = carregarDestinos()
  cacheDestinos = { at: Date.now(), p }
  return p
}
export function invalidarDestinosCache() { cacheDestinos = null }
