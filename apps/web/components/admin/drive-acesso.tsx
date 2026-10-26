'use client'

// "Liberar acesso" PORTADO fielmente do protótipo card-pasta-drive(1).html (função openAccess):
// árvore de pastas+documentos à esquerda (busca, expandir/recolher, seleção em massa, selos de
// herança) e, à direita, o painel do item selecionado (herdar acesso, pessoas com papel
// reader/commenter/editor, acesso geral restrito/link, ações de herança) — ou o painel em massa.
// Data-driven: recebe a árvore e emite eventos; o estado é mantido localmente (otimista) como no
// protótipo, e cada mudança dispara `onAcao` para a persistência real. Classes/vars prefixadas gd-.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { acessoEfetivo, type ItemAcesso, type Atribuicao } from '@/lib/conteudo/acesso-efetivo'
import { PilulaModo, PilulaEstado, type ModoAcesso } from '@/components/biblioteca/pilulas'
import { PermissaoQuadros, type Permissoes } from '@/components/biblioteca/permissao-quadros'

const sv = (o: Record<string, string | number>): CSSProperties => o as CSSProperties

export type DrivePapel = 'reader' | 'commenter' | 'editor'
export type DriveGeral = { modo: 'restrito' | 'todos'; papel: DrivePapel } | null
export type DrivePessoa = {
  id: string // estudante_id ou grupo_id
  tipo: 'estudante' | 'grupo'
  email: string // e-mail (estudante) ou rótulo (grupo)
  nome: string
  papel: DrivePapel
  avatar?: string | null // foto de perfil (estudante)
  corAvatar?: string | null // cor de fundo do avatar
  origem?: 'avulsa' | 'individual' // proveniência da entrega (spec 01 §5); via_pacote é resolvido fora
  perms?: Permissoes // permissões ler/baixar/grifar desta entrega
}
export type { ModoAcesso }
export type DriveNode = {
  id: string
  nome: string
  tipo: 'folder' | 'doc'
  cor?: string | null
  herda: boolean
  modo?: ModoAcesso // modo de acesso de 1ª classe (principal/herdar/propria/bloquear)
  oculto?: boolean // visibilidade: escondido do aluno
  pessoas: DrivePessoa[]
  geral: DriveGeral
  filhos: DriveNode[]
}
const PERMS_FULL: Permissoes = { ler: true, baixar: true, grifar: true }
export type DriveAcessoEvento =
  | { tipo: 'herdar'; node: DriveNode; herda: boolean }
  | { tipo: 'add'; node: DriveNode; pessoa: DrivePessoa }
  | { tipo: 'papel'; node: DriveNode; pessoaId: string; papel: DrivePapel }
  | { tipo: 'remove'; node: DriveNode; pessoaId: string }
  | { tipo: 'geral'; node: DriveNode; geral: DriveGeral }
  | { tipo: 'limpar'; node: DriveNode }
  | { tipo: 'reset-filhos'; node: DriveNode }
  | { tipo: 'restringir-filhos'; node: DriveNode }

export const ROLES: Record<DrivePapel, string> = { reader: 'Leitor', commenter: 'Comentarista', editor: 'Editor' }
export type DriveGrupo = { id: string; nome: string; cor: string | null; is_mestre?: boolean; pai_id?: string | null }
export type DriveAluno = { id: string; nome: string; email: string | null; avatar?: string | null; cor?: string | null }
type SelecaoAcesso = { grupos: DriveGrupo[]; estudantes: DriveAluno[]; papel: DrivePapel }

// ---- avatar (iniciais + cor determinística, como no protótipo) ----
const AV_COLORS = ['#1a73e8', '#e8710a', '#0d904f', '#d93025', '#9334e6', '#12a4af', '#c5221f', '#185abc', '#b06000', '#a142f4']
function avColor(s: string) { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[n % AV_COLORS.length] }
function iniciais(nome: string) { return nome.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() }

// ---- SVG paths reaproveitados do protótipo ----
const P = {
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  chev: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  folder: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  file: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  globe: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  expand: 'M12 5.83 15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z',
  collapse: 'M7.41 18.59 8.83 20 12 16.83 15.17 20l1.41-1.41L12 14l-4.59 4.59zm9.18-13.18L15.17 4 12 7.17 8.83 4 7.41 5.41 12 10l4.59-4.59z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  people: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
}
const Svg = ({ d, cls, fill }: { d: string; cls?: string; fill?: string }) => (
  <svg className={cls} viewBox="0 0 24 24" style={fill ? { fill } : undefined}><path d={d} /></svg>
)

// ---- tipos derivados do cálculo de acesso efetivo ----
type EffPessoa = DrivePessoa & { owner?: boolean; sourceId: string }
type EffGeral = { modo: 'restrito' | 'todos'; papel: DrivePapel; fromId: string }
type EstadoNo = 'root' | 'inh' | 'cus' | 'res'
type Eff = { pessoas: EffPessoa[]; geral: EffGeral; estado: EstadoNo }

// Calcula, em uma passada top-down, o acesso efetivo de cada nó (espelha effective/effGeneral/state).
function calcularEfetivo(root: DriveNode, me: { id: string; nome: string }): Map<string, Eff> {
  const map = new Map<string, Eff>()
  const rec = (node: DriveNode, parent: DriveNode | null, herdPessoas: EffPessoa[], herdGeral: EffGeral) => {
    const isRoot = !parent
    let base: EffPessoa[]
    if (parent && node.herda) base = herdPessoas.map((p) => ({ ...p }))
    else base = [{ id: me.id, tipo: 'estudante', email: '', nome: me.nome, papel: 'reader', owner: true, sourceId: root.id }]
    for (const p of node.pessoas) {
      const i = base.findIndex((x) => x.id === p.id && x.tipo === p.tipo)
      const entry: EffPessoa = { ...p, sourceId: node.id }
      if (i >= 0) { if (!base[i].owner) base[i] = entry } else base.push(entry)
    }
    let geral: EffGeral
    if (node.geral) geral = { ...node.geral, fromId: node.id }
    else if (parent && node.herda) geral = herdGeral
    else geral = { modo: 'restrito', papel: 'reader', fromId: node.id }
    let estado: EstadoNo
    if (isRoot) estado = 'root'
    else if (!node.herda) estado = 'res'
    else estado = node.pessoas.length || node.geral ? 'cus' : 'inh'
    map.set(node.id, { pessoas: base, geral, estado })
    for (const c of node.filhos) rec(c, node, base, geral)
  }
  rec(root, null, [], { modo: 'restrito', papel: 'reader', fromId: root.id })
  return map
}

// Helpers de árvore (sem ponteiros de pai no estado).
function flatten(root: DriveNode): DriveNode[] { const a: DriveNode[] = []; const go = (n: DriveNode) => { a.push(n); n.filhos.forEach(go) }; go(root); return a }
function descendentes(n: DriveNode): DriveNode[] { const a: DriveNode[] = []; n.filhos.forEach((c) => { const go = (x: DriveNode) => { a.push(x); x.filhos.forEach(go) }; go(c) }); return a }
function caminhoDe(root: DriveNode, id: string): string[] {
  const path: string[] = []
  const go = (n: DriveNode, acc: string[]): boolean => {
    const cur = [...acc, n.nome]
    if (n.id === id) { path.push(...cur); return true }
    return n.filhos.some((c) => go(c, cur))
  }
  go(root, [])
  return path
}
function clone(n: DriveNode): DriveNode { return { ...n, pessoas: n.pessoas.map((p) => ({ ...p })), geral: n.geral ? { ...n.geral } : null, filhos: n.filhos.map(clone) } }
function acharNo(root: DriveNode, id: string): DriveNode | null { if (root.id === id) return root; for (const c of root.filhos) { const r = acharNo(c, id); if (r) return r } return null }

/** Modo exibido quando o nó ainda não tem `modo` explícito (dados antigos): deriva de raiz/herança. */
function modoDisplay(node: DriveNode, isRoot: boolean): ModoAcesso {
  if (node.modo) return node.modo
  if (isRoot) return 'principal'
  if (node.herda === false) return 'propria'
  return 'herdar'
}
/** Ancestrais (pai imediato → raiz) de um nó na árvore local. */
function ancestraisDe(root: DriveNode, id: string): DriveNode[] {
  const path: DriveNode[] = []
  const go = (n: DriveNode, acc: DriveNode[]): boolean => {
    if (n.id === id) { path.push(...acc.slice().reverse()); return true }
    return n.filhos.some((c) => go(c, [...acc, n]))
  }
  go(root, [])
  return path
}
/** DriveNode local → ItemAcesso (sem ancestrais) p/ o acessoEfetivo (motor ÚNICO, igual ao gate do aluno). */
function nodeParaItem(node: DriveNode, isRoot: boolean): ItemAcesso {
  return {
    id: node.id,
    modo: modoDisplay(node, isRoot),
    oculto: node.oculto === true,
    acessoGeral: node.geral ? node.geral.modo : null,
    atribuicoes: node.pessoas.map((p): Atribuicao => ({
      tipo: p.tipo === 'grupo' ? 'grupo' : 'aluno',
      grupoId: p.tipo === 'grupo' ? p.id : null,
      estudanteId: p.tipo === 'estudante' ? p.id : null,
      origem: p.origem ?? 'avulsa',
      podeLer: p.perms ? p.perms.ler : null,
      podeBaixar: p.perms ? p.perms.baixar : null,
      podeGrifar: p.perms ? p.perms.grifar : null,
    })),
  }
}

const BADGE: Record<EstadoNo, { cls: string; label: string; lock?: boolean }> = {
  root: { cls: 'gd-b-root', label: 'Pasta principal' },
  inh: { cls: 'gd-b-inh', label: 'Herdado' },
  cus: { cls: 'gd-b-cus', label: 'Personalizado' },
  res: { cls: 'gd-b-res', label: 'Restrito', lock: true },
}

function FileIcon({ n, cor, cls }: { n: DriveNode; cor?: string | null; cls?: string }) {
  if (n.tipo === 'folder') return <Svg d={P.folder} cls={cls} fill={cor || 'var(--gd-folder)'} />
  return <Svg d={P.file} cls={cls} fill="var(--brand-primary, var(--primary))" />
}

// Avatar da pessoa: FOTO de perfil do aluno (AvatarEstudante) ou círculo "#" para grupo.
function PessoaAvatar({ p, cls }: { p: { tipo: 'estudante' | 'grupo'; id: string; nome: string; avatar?: string | null; corAvatar?: string | null }; cls: string }) {
  if (p.tipo === 'estudante') return <AvatarEstudante nome={p.nome} avatar={p.avatar} cor={p.corAvatar} seed={p.id} className={cls} />
  return <span className={`gd-grp-av ${cls}`} style={{ background: p.corAvatar || avColor(p.nome) }}>#</span>
}

export function DriveAcessoDialog({
  root: rootProp, me, onClose, onSalvar, resolverEmail, onCopiarLink, onToast, focoId, listarGrupos, buscarAlunos, buscarGruposAluno,
}: {
  root: DriveNode
  me: { id: string; nome: string }
  onClose: () => void
  /** Chamado no "Concluído" com os nós cujo acesso mudou (persistência em lote). */
  onSalvar?: (mudados: DriveNode[]) => void | Promise<void>
  resolverEmail?: (email: string, papel: DrivePapel) => Promise<DrivePessoa | null>
  onCopiarLink?: (node: DriveNode) => void
  onToast?: (msg: string) => void
  focoId?: string
  listarGrupos?: () => Promise<DriveGrupo[]>
  buscarAlunos?: (q: string, offset: number) => Promise<{ items: DriveAluno[]; total: number }>
  /** Grupos (ids) de um aluno — habilita o "Simular aluno" (acessoEfetivo roda localmente). */
  buscarGruposAluno?: (estudanteId: string) => Promise<string[]>
}) {
  const [root, setRoot] = useState<DriveNode>(() => clone(rootProp))
  const [shown, setShown] = useState(false)
  const [open, setOpen] = useState<Set<string>>(() => new Set([rootProp.id, ...rootProp.filhos.filter((c) => c.tipo === 'folder').map((c) => c.id)]))
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [selId, setSelId] = useState<string>(focoId || rootProp.id)
  const [q, setQ] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novoPapel, setNovoPapel] = useState<DrivePapel>('reader')
  const [erroEmail, setErroEmail] = useState(false)
  const [bulkEmail, setBulkEmail] = useState('')
  const [bulkPapel, setBulkPapel] = useState<DrivePapel>('reader')
  const [bulkRm, setBulkRm] = useState('')
  const [picker, setPicker] = useState<null | 'single' | 'bulk' | 'sim'>(null)
  const [sim, setSim] = useState<{ aluno: DriveAluno; grupos: string[] } | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(r) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const eff = useMemo(() => calcularEfetivo(root, me), [root, me])
  const nodes = useMemo(() => flatten(root), [root])
  const selected = useMemo(() => acharNo(root, selId) || root, [root, selId])

  // Mutação é otimista e local; a persistência acontece em lote no "Concluído" (onSalvar).
  const emit = (_e: DriveAcessoEvento) => {}
  const toast = (m: string) => onToast?.(m)

  // Nós cujo acesso (herança/pessoas/geral) mudou vs. o estado inicial.
  function nodesMudados(atual: DriveNode): DriveNode[] {
    const ini = new Map<string, DriveNode>()
    const idx = (n: DriveNode) => { ini.set(n.id, n); n.filhos.forEach(idx) }
    idx(rootProp)
    const chave = (n: DriveNode) => JSON.stringify([n.herda, n.modo ?? null, n.oculto ?? false, n.geral, [...n.pessoas].map((p) => [p.tipo, p.id, p.papel, p.origem ?? 'avulsa', p.perms?.ler !== false, p.perms?.baixar !== false, p.perms?.grifar !== false]).sort()])
    const mud: DriveNode[] = []
    const cmp = (n: DriveNode) => { const o = ini.get(n.id); if (o && chave(n) !== chave(o)) mud.push(n); n.filhos.forEach(cmp) }
    cmp(atual)
    return mud
  }

  function fechar() {
    const mud = nodesMudados(root)
    if (mud.length) { onSalvar?.(mud); toast('Acessos salvos') }
    setShown(false); setTimeout(onClose, 260)
  }

  // Aplica mutação em cópia imutável da árvore (otimista) e re-renderiza.
  function mutar(fn: (r: DriveNode) => void) { setRoot((prev) => { const c = clone(prev); fn(c); return c }) }

  const setOpenNode = (id: string, on: boolean) => setOpen((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n })
  const revelar = (id: string) => {
    // abre todos os ancestrais do nó
    setOpen((s) => {
      const n = new Set(s)
      const go = (node: DriveNode, acc: string[]): boolean => {
        if (node.id === id) { acc.forEach((a) => n.add(a)); return true }
        return node.filhos.some((c) => go(c, [...acc, node.id]))
      }
      go(root, [])
      return n
    })
  }

  // ---- busca (conjunto de ids visíveis + ancestrais) ----
  const visiveis = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return null
    const show = new Set<string>()
    const go = (n: DriveNode, chain: string[]) => {
      const c2 = [...chain, n.id]
      if (n.nome.toLowerCase().includes(query)) c2.forEach((x) => show.add(x))
      n.filhos.forEach((f) => go(f, c2))
    }
    go(root, [])
    return show
  }, [q, root])

  // ---- seleção por checkbox (nó + descendentes) ----
  function toggleCheck(n: DriveNode, on: boolean) {
    setChecked((s) => { const c = new Set(s); [n, ...descendentes(n)].forEach((x) => (on ? c.add(x.id) : c.delete(x.id))); return c })
  }
  const emMassa = checked.size > 0
  const itensMassa = useMemo(() => nodes.filter((n) => checked.has(n.id)), [nodes, checked])

  // ---- ações sobre um nó ----
  const addPessoaLocal = (node: DriveNode, p: DrivePessoa) => mutar((r) => { const n = acharNo(r, node.id); if (!n) return; const ex = n.pessoas.find((x) => x.id === p.id && x.tipo === p.tipo); if (ex) ex.papel = p.papel; else n.pessoas.push({ origem: 'avulsa', perms: { ...PERMS_FULL }, ...p }) })

  // Modo de acesso (1ª classe). Sincroniza `herda` p/ manter o estado coerente (herdar=herda; demais=não herda).
  function definirModo(node: DriveNode, modo: ModoAcesso) {
    mutar((r) => { const n = acharNo(r, node.id); if (n) { n.modo = modo; n.herda = modo === 'herdar' } })
    toast(modo === 'bloquear' ? `"${node.nome}" bloqueado (só equipe)` : modo === 'herdar' ? `"${node.nome}" herda da pasta acima` : modo === 'principal' ? `"${node.nome}" é a pasta principal` : `"${node.nome}" com regra própria`)
  }
  function alternarOculto(node: DriveNode) {
    const oculto = !node.oculto
    mutar((r) => { const n = acharNo(r, node.id); if (n) n.oculto = oculto })
    toast(oculto ? `"${node.nome}" oculto do aluno` : `"${node.nome}" visível novamente`)
  }
  function alterarOrigem(node: DriveNode, pessoaId: string, origem: 'avulsa' | 'individual') {
    mutar((r) => { const n = acharNo(r, node.id); const p = n?.pessoas.find((x) => x.id === pessoaId); if (p) p.origem = origem })
  }
  function alterarPerm(node: DriveNode, pessoaId: string, chave: keyof Permissoes, ativo: boolean) {
    mutar((r) => { const n = acharNo(r, node.id); const p = n?.pessoas.find((x) => x.id === pessoaId); if (p) p.perms = { ...(p.perms ?? PERMS_FULL), [chave]: ativo } })
  }
  // Simulação de acesso de um aluno: busca os grupos do aluno e guarda — o cálculo (acessoEfetivo) é no render.
  async function simularAluno(al: DriveAluno) {
    const grupos = buscarGruposAluno ? await buscarGruposAluno(al.id).catch(() => []) : []
    setSim({ aluno: al, grupos })
    toast(`Simulando acesso de ${al.nome}`)
  }

  async function adicionarPessoa(node: DriveNode, email: string, papel: DrivePapel) {
    const v = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setErroEmail(true); return }
    let pessoa: DrivePessoa | null
    if (resolverEmail) pessoa = await resolverEmail(v, papel)
    else pessoa = { id: v, tipo: 'estudante', email: v, nome: v.split('@')[0], papel }
    if (!pessoa) { setErroEmail(true); toast(`Nenhum aluno encontrado com "${v}"`); return }
    addPessoaLocal(node, pessoa)
    emit({ tipo: 'add', node, pessoa })
    toast(`${pessoa.nome} agora é ${ROLES[papel].toLowerCase()} de "${node.nome}"`)
  }

  function alterarPapel(node: DriveNode, pessoaId: string, papel: DrivePapel) {
    mutar((r) => { const n = acharNo(r, node.id); const p = n?.pessoas.find((x) => x.id === pessoaId); if (p) p.papel = papel })
    emit({ tipo: 'papel', node, pessoaId, papel })
  }
  function removerPessoa(node: DriveNode, pessoaId: string, nome: string) {
    mutar((r) => { const n = acharNo(r, node.id); if (n) n.pessoas = n.pessoas.filter((x) => x.id !== pessoaId) })
    emit({ tipo: 'remove', node, pessoaId })
    toast(`${nome} removido de "${node.nome}"`)
  }
  function alternarHeranca(node: DriveNode) {
    const herda = !node.herda
    mutar((r) => { const n = acharNo(r, node.id); if (n) n.herda = herda })
    emit({ tipo: 'herdar', node, herda })
    toast(herda ? `"${node.nome}" volta a herdar acesso` : `"${node.nome}" não herda mais acesso`)
  }
  function definirGeral(node: DriveNode, geral: DriveGeral) {
    mutar((r) => { const n = acharNo(r, node.id); if (n) n.geral = geral })
    emit({ tipo: 'geral', node, geral })
  }
  function limparRegras(node: DriveNode) {
    mutar((r) => { const n = acharNo(r, node.id); if (n) { n.herda = true; n.pessoas = []; n.geral = null } })
    emit({ tipo: 'limpar', node })
    toast(`Regras de "${node.nome}" removidas`)
  }
  function resetFilhos(node: DriveNode) {
    mutar((r) => { const n = acharNo(r, node.id); if (n) descendentes(n).forEach((x) => { x.herda = true; x.pessoas = []; x.geral = null }) })
    emit({ tipo: 'reset-filhos', node })
    toast('Todos os itens internos herdam desta pasta')
  }
  function restringirFilhos(node: DriveNode) {
    mutar((r) => { const n = acharNo(r, node.id); if (n) descendentes(n).forEach((x) => { x.herda = false }) })
    emit({ tipo: 'restringir-filhos', node })
    toast('Itens internos restritos — só o acesso direto vale')
  }
  function selecionarInternos(node: DriveNode) { setChecked(() => new Set(descendentes(node).map((x) => x.id))); setOpenNode(node.id, true) }
  const copiarLink = (node: DriveNode) => { onCopiarLink?.(node); toast(`Link de "${node.nome}" copiado`) }

  // Adiciona grupos + alunos selecionados no seletor (ao nó atual ou a todos os marcados).
  function adicionarSelecionados(alvo: 'single' | 'bulk', sel: SelecaoAcesso) {
    const destinos = alvo === 'bulk' ? itensMassa : [selected]
    const pessoas: DrivePessoa[] = [
      ...sel.grupos.map((gr): DrivePessoa => ({ id: gr.id, tipo: 'grupo', email: '', nome: gr.nome, papel: sel.papel, origem: 'avulsa', perms: { ...PERMS_FULL } })),
      ...sel.estudantes.map((al): DrivePessoa => ({ id: al.id, tipo: 'estudante', email: al.email ?? '', nome: al.nome, papel: sel.papel, avatar: al.avatar ?? null, corAvatar: al.cor ?? null, origem: 'individual', perms: { ...PERMS_FULL } })),
    ]
    if (!pessoas.length) { setPicker(null); return }
    mutar((r) => {
      for (const d of destinos) {
        const n = acharNo(r, d.id); if (!n) continue
        if (n.geral?.modo === 'todos') n.geral = null // deixou de ser "todos" → passa a ser restrito pela seleção
        for (const p of pessoas) { const ex = n.pessoas.find((x) => x.id === p.id && x.tipo === p.tipo); if (ex) ex.papel = p.papel; else n.pessoas.push({ ...p }) }
      }
    })
    setPicker(null)
    toast(`${pessoas.length} ${pessoas.length === 1 ? 'adicionado' : 'adicionados'}${alvo === 'bulk' ? ` a ${destinos.length} itens` : ''}`)
  }
  // "Liberar para todos" = abre o item a todos (limpa a seleção própria e marca aberto).
  function liberarParaTodos(alvo: 'single' | 'bulk') {
    const destinos = alvo === 'bulk' ? itensMassa : [selected]
    mutar((r) => { for (const d of destinos) { const n = acharNo(r, d.id); if (!n) continue; n.pessoas = []; n.geral = { modo: 'todos', papel: 'reader' }; n.herda = true } })
    toast('Liberado para todos os alunos')
  }

  // ---- ações em massa ----
  async function massaAdicionar() {
    const v = bulkEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setErroEmail(true); return }
    const pessoa = resolverEmail ? await resolverEmail(v, bulkPapel) : { id: v, tipo: 'estudante' as const, email: v, nome: v.split('@')[0], papel: bulkPapel }
    if (!pessoa) { setErroEmail(true); toast(`Nenhum aluno encontrado com "${v}"`); return }
    itensMassa.forEach((n) => { addPessoaLocal(n, pessoa); emit({ tipo: 'add', node: n, pessoa }) })
    toast(`${pessoa.nome} adicionado a ${itensMassa.length} itens`)
  }
  function massaRemover() {
    if (!bulkRm) return
    itensMassa.forEach((n) => { mutar((r) => { const x = acharNo(r, n.id); if (x) x.pessoas = x.pessoas.filter((p) => p.id !== bulkRm) }); emit({ tipo: 'remove', node: n, pessoaId: bulkRm }) })
    toast('Acesso direto removido')
  }
  function massaHerdar(herda: boolean) { itensMassa.forEach((n) => { if (n.id !== root.id) { mutar((r) => { const x = acharNo(r, n.id); if (x) x.herda = herda }); emit({ tipo: 'herdar', node: n, herda }) } }); toast(herda ? 'Itens voltam a herdar acesso' : 'Itens restritos') }
  function massaLimpar() { itensMassa.forEach((n) => { if (n.id !== root.id) { mutar((r) => { const x = acharNo(r, n.id); if (x) { x.herda = true; x.pessoas = []; x.geral = null } }); emit({ tipo: 'limpar', node: n }) } }); toast('Regras próprias removidas') }
  function massaGeral(modo: 'todos' | 'restrito') { itensMassa.forEach((n) => { const g: DriveGeral = { modo, papel: 'reader' }; mutar((r) => { const x = acharNo(r, n.id); if (x) x.geral = g }); emit({ tipo: 'geral', node: n, geral: g }) }); toast(modo === 'todos' ? 'Disponível para quem tiver o link' : 'Acesso geral restrito') }

  // resumo do rodapé
  const resumo = useMemo(() => {
    const ppl = new Set<string>()
    let custom = 0
    for (const n of nodes) { eff.get(n.id)?.pessoas.forEach((p) => ppl.add(p.tipo + ':' + p.id)); if (n.id !== root.id && eff.get(n.id)?.estado !== 'inh') custom++ }
    return { pessoas: ppl.size, custom }
  }, [nodes, eff, root.id])

  // ---- render da árvore (recursivo) ----
  function Row({ n, depth }: { n: DriveNode; depth: number }) {
    const isF = n.tipo === 'folder' && n.filhos.length > 0
    const aberto = open.has(n.id)
    const e = eff.get(n.id)!
    const all = [n, ...descendentes(n)]
    const c = all.filter((x) => checked.has(x.id)).length
    const cbChecked = c === all.length && c > 0
    const cbInd = c > 0 && c < all.length
    const oculto = visiveis ? !visiveis.has(n.id) : false
    const effVis = e.pessoas.filter((p) => !p.owner)
    const badge = BADGE[e.estado]
    const query = q.trim().toLowerCase()
    const hitIdx = query ? n.nome.toLowerCase().indexOf(query) : -1
    return (
      <>
        <div
          className={`gd-row${!emMassa && n.id === selId ? ' gd-sel' : ''}${aberto ? ' gd-open' : ''}${oculto ? ' gd-hide' : ''}`}
          style={sv({ '--d': depth })}
          role="treeitem"
          onClick={(ev) => {
            if ((ev.target as HTMLElement).closest('.gd-tw, input')) return
            setSelId(n.id); setChecked(new Set())
          }}
        >
          <button className={`gd-tw${isF ? '' : ' gd-leaf'}`} tabIndex={-1} aria-label="Expandir" onClick={() => isF && setOpenNode(n.id, !aberto)}><Svg d={P.chev} /></button>
          <input type="checkbox" aria-label={`Selecionar ${n.nome}`} checked={cbChecked} ref={(el) => { if (el) el.indeterminate = cbInd }} onChange={(ev) => toggleCheck(n, ev.target.checked)} />
          <FileIcon n={n} cor={n.id === root.id ? n.cor : undefined} cls="gd-ficon" />
          <span className="gd-rname">
            {hitIdx >= 0 ? (<>{n.nome.slice(0, hitIdx)}<mark>{n.nome.slice(hitIdx, hitIdx + query.length)}</mark>{n.nome.slice(hitIdx + query.length)}</>) : n.nome}
          </span>
          <span className="gd-avs">
            {e.geral.modo === 'todos' && <Svg d={P.link} cls="gd-linkdot" />}
            {effVis.slice(0, 3).map((p) => (<span key={p.tipo + p.id} className="gd-av" style={{ background: avColor(p.nome) }} title={p.nome}>{p.tipo === 'grupo' ? '#' : iniciais(p.nome)}</span>))}
            {effVis.length > 3 && <span className="gd-av gd-more">+{effVis.length - 3}</span>}
          </span>
          <span className="gd-bslot"><span className={`gd-badge ${badge.cls}`}>{badge.lock && <Svg d={P.lock} />}{badge.label}</span></span>
        </div>
        {isF && (
          <div className={`gd-kids${aberto ? ' gd-open' : ''}`}><div>{n.filhos.map((c2) => <Row key={c2.id} n={c2} depth={depth + 1} />)}</div></div>
        )}
      </>
    )
  }

  const RoleSelect = ({ value, onChange, extraRemovivel }: { value: DrivePapel; onChange: (v: string) => void; extraRemovivel?: boolean }) => (
    <select className="gd-field gd-ghost" value={value} onChange={(e) => onChange(e.target.value)}>
      {(Object.keys(ROLES) as DrivePapel[]).map((k) => <option key={k} value={k}>{ROLES[k]}</option>)}
      {extraRemovivel && <><option disabled>──────</option><option value="remove">Remover acesso</option></>}
    </select>
  )

  // ---- painel de um item ----
  function PainelItem({ n }: { n: DriveNode }) {
    const e = eff.get(n.id)!
    const isRoot = n.id === root.id
    const modoAtual = modoDisplay(n, isRoot)
    const desc = descendentes(n)
    const nf = desc.filter((x) => x.tipo === 'folder').length
    const nfi = desc.length - nf
    const ncus = desc.filter((x) => eff.get(x.id)?.estado !== 'inh').length
    const pessoasVis = e.pessoas.filter((p) => !p.owner)
    const qtdPessoas = pessoasVis.length
    const liberadoTodos = e.geral.modo === 'todos' || qtdPessoas === 0
    return (
      <div className="gd-fade-in">
        <div className="gd-dp-head">
          <span className="gd-big"><FileIcon n={n} cor={n.cor} /></span>
          <div style={{ minWidth: 0 }}><h3>{n.nome}</h3><div className="gd-crumb">{caminhoDe(root, n.id).join(' › ')}</div></div>
        </div>
        <div className="gd-switch-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1 }}><b>Modo de acesso</b><small>{isRoot ? 'Pasta principal — define o padrão de tudo que está dentro' : 'Como este item decide quem vê'}</small></div>
            <button
              type="button"
              onClick={() => alternarOculto(n)}
              title={n.oculto ? 'Mostrar ao aluno' : 'Ocultar do aluno'}
              aria-pressed={!!n.oculto}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, opacity: n.oculto ? 1 : 0.6 }}
            >
              {n.oculto ? <PilulaEstado estado="oculto" /> : <span className="gd-tag">Visível</span>}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(isRoot ? (['principal', 'propria', 'bloquear'] as ModoAcesso[]) : (['herdar', 'propria', 'principal', 'bloquear'] as ModoAcesso[])).map((m) => {
              const ativo = modoAtual === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => definirModo(n, m)}
                  aria-pressed={ativo}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, borderRadius: 999, opacity: ativo ? 1 : 0.5, boxShadow: ativo ? '0 0 0 2px var(--gd-accent)' : 'none', transition: 'opacity .15s, box-shadow .15s' }}
                >
                  <PilulaModo modo={m} curto />
                </button>
              )
            })}
          </div>
        </div>
        <div className={`gd-status ${liberadoTodos ? 'gd-st-ok' : 'gd-st-restr'}`}>
          <span className="gd-st-ic">{liberadoTodos ? <Svg d={P.globe} /> : <Svg d={P.lock} />}</span>
          <div>
            <b>{liberadoTodos ? 'Liberado para todos os alunos' : `Restrito a ${qtdPessoas} ${qtdPessoas === 1 ? 'grupo/aluno' : 'grupos/alunos'}`}</b>
            <small>{liberadoTodos ? 'Todos os alunos com acesso à Biblioteca veem este item' : 'Só os grupos e alunos abaixo (e os herdados da pasta acima) veem este item'}</small>
          </div>
        </div>
        <div className="gd-add2">
          <button className="gd-btn gd-tonal" onClick={() => setPicker('single')}><Svg d={P.people} />Adicionar grupos e alunos</button>
          {!liberadoTodos && <button className="gd-btn gd-outline" onClick={() => liberarParaTodos('single')}><Svg d={P.globe} />Liberar para todos</button>}
        </div>
        {pessoasVis.length > 0 && (
          <>
            <div className="gd-sec-title">Com acesso <span className="gd-n">{pessoasVis.length}</span></div>
            <ul className="gd-people">
              {pessoasVis.map((p, i) => {
                const own = p.sourceId === n.id
                const perms = p.perms ?? PERMS_FULL
                return (
                  <li className="gd-person" key={p.tipo + p.id} style={{ animationDelay: `${i * 40}ms`, flexWrap: 'wrap' }}>
                    <PessoaAvatar p={p} cls="gd-av-lg" />
                    <div className="gd-who">
                      <b>{p.nome}</b>
                      <small>{p.email || (p.tipo === 'grupo' ? 'Grupo' : '')} {own ? <span className="gd-tag gd-direct">Acesso direto</span> : <span className="gd-tag">Herdado</span>}</small>
                    </div>
                    {own
                      ? <button className="gd-icon-btn" title="Remover acesso" onClick={() => removerPessoa(n, p.id, p.nome)}><Svg d={P.close} /></button>
                      : <span className="gd-tag" style={{ marginRight: 4 }}>da pasta acima</span>}
                    {own && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%', paddingLeft: 48 }}>
                        <select className="gd-field gd-ghost" style={{ width: 'auto' }} value={p.origem ?? 'avulsa'} onChange={(ev) => alterarOrigem(n, p.id, ev.target.value as 'avulsa' | 'individual')} title="Origem da entrega">
                          <option value="avulsa">Entrega avulsa</option>
                          <option value="individual">Individual</option>
                        </select>
                        <PermissaoQuadros kind="docx" valor={perms} onChange={(chave, ativo) => alterarPerm(n, p.id, chave, ativo)} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {n.tipo === 'folder' && (
          <>
            <div className="gd-sec-title">Itens dentro desta pasta</div>
            <div className="gd-stats">
              <div className="gd-stat"><b>{nf}</b><span>pastas</span></div>
              <div className="gd-stat"><b>{nfi}</b><span>documentos</span></div>
              <div className="gd-stat"><b>{ncus}</b><span>com regra própria</span></div>
            </div>
            <div className="gd-actions-wrap">
              <button className="gd-btn gd-outline gd-sm" disabled={!desc.length} onClick={() => selecionarInternos(n)}>Selecionar itens internos</button>
              <button className="gd-btn gd-outline gd-sm" disabled={!ncus} onClick={() => resetFilhos(n)}>Fazer todos herdarem desta pasta</button>
              <button className="gd-btn gd-outline gd-sm" disabled={!desc.length} onClick={() => restringirFilhos(n)}>Restringir todos os internos</button>
            </div>
          </>
        )}
        {buscarAlunos && (
          <>
            <div className="gd-sec-title">Simular aluno</div>
            <div className="gd-actions-wrap" style={{ marginTop: 0 }}>
              <button className="gd-btn gd-outline gd-sm" onClick={() => setPicker('sim')}><Svg d={P.people} />Escolher aluno</button>
              {sim && <button className="gd-btn gd-text gd-sm" onClick={() => setSim(null)}>Limpar</button>}
            </div>
            {sim && (() => {
              const item = nodeParaItem(n, isRoot)
              item.ancestrais = ancestraisDe(root, n.id).map((a) => nodeParaItem(a, a.id === root.id))
              const res = acessoEfetivo(item, { estudanteId: sim.aluno.id, grupos: sim.grupos })
              const podeTxt = [res.permissoes.ler && 'ler', res.permissoes.baixar && 'baixar', res.permissoes.grifar && 'grifar'].filter(Boolean).join(' / ') || '—'
              return (
                <div className={`gd-status ${res.permitido ? 'gd-st-ok' : 'gd-st-restr'}`} style={{ marginTop: 10 }}>
                  <span className="gd-st-ic">{res.permitido ? <Svg d={P.globe} /> : <Svg d={P.lock} />}</span>
                  <div>
                    <b>{sim.aluno.nome}: {res.permitido ? 'vê este item' : 'não vê este item'}</b>
                    <small>{res.permitido
                      ? `Origem: ${res.origens.join(', ') || '—'} · pode ${podeTxt}`
                      : `Motivo: ${res.motivo === 'bloqueado' ? 'bloqueado (só equipe)' : res.motivo === 'oculto' ? 'oculto' : 'não atribuído'}`}</small>
                  </div>
                </div>
              )
            })()}
          </>
        )}
        <div className="gd-actions-wrap" style={{ marginTop: 18 }}>
          <button className="gd-btn gd-text gd-sm" onClick={() => copiarLink(n)}><Svg d={P.link} />Copiar link deste item</button>
          {!isRoot && e.estado !== 'inh' && <button className="gd-btn gd-text gd-sm gd-danger" onClick={() => limparRegras(n)}>Limpar regras deste item</button>}
        </div>
      </div>
    )
  }

  // ---- painel em massa ----
  function PainelMassa() {
    const emails = Array.from(new Set(itensMassa.flatMap((n) => n.pessoas.filter((p) => p.tipo === 'estudante').map((p) => JSON.stringify({ id: p.id, nome: p.nome, email: p.email })))))
      .map((s) => JSON.parse(s) as { id: string; nome: string; email: string })
    return (
      <div className="gd-fade-in">
        <div className="gd-dp-head">
          <span className="gd-big"><Svg d={P.check} fill="var(--gd-accent)" /></span>
          <div><h3>{itensMassa.length} {itensMassa.length === 1 ? 'item selecionado' : 'itens selecionados'}</h3><div className="gd-crumb">As ações abaixo valem para todos</div></div>
        </div>
        <div className="gd-chips">
          {itensMassa.slice(0, 8).map((n, i) => <span className="gd-chip" key={n.id} style={{ animationDelay: `${i * 25}ms` }}><FileIcon n={n} cls="" /><span>{n.nome}</span></span>)}
          {itensMassa.length > 8 && <span className="gd-chip">+{itensMassa.length - 8}</span>}
        </div>
        <div className="gd-sec-title">Liberar acesso para</div>
        <div className="gd-add2" style={{ marginTop: 0 }}>
          <button className="gd-btn gd-tonal" onClick={() => setPicker('bulk')}><Svg d={P.people} />Adicionar grupos e alunos</button>
          <button className="gd-btn gd-outline" onClick={() => liberarParaTodos('bulk')}><Svg d={P.globe} />Liberar para todos</button>
        </div>
        <div className="gd-sec-title">Remover acesso de</div>
        <div className="gd-add-row" style={{ marginTop: 0 }}>
          <select className="gd-field" style={{ flex: 1 }} value={bulkRm} onChange={(ev) => setBulkRm(ev.target.value)}>
            <option value="">Escolha uma pessoa…</option>
            {emails.map((p) => <option key={p.id} value={p.id}>{p.nome} — {p.email}</option>)}
          </select>
          <button className="gd-btn gd-outline gd-danger" onClick={massaRemover}>Remover</button>
        </div>
        <div className="gd-sec-title">Herança</div>
        <div className="gd-actions-wrap" style={{ marginTop: 0 }}>
          <button className="gd-btn gd-outline gd-sm" onClick={() => massaHerdar(true)}>Herdar da pasta acima</button>
          <button className="gd-btn gd-outline gd-sm" onClick={() => massaHerdar(false)}><Svg d={P.lock} />Restringir (não herdar)</button>
          <button className="gd-btn gd-outline gd-sm gd-danger" onClick={massaLimpar}>Limpar regras próprias</button>
        </div>
      </div>
    )
  }

  const vazio = visiveis && visiveis.size === 0

  return createPortal(
    <>
      <div className={`gd-scrim${shown ? ' gd-show' : ''}`} onClick={fechar} />
      <div className={`gd-dialog gd-access${shown ? ' gd-show' : ''}`} role="dialog" aria-modal="true">
        <header>
          <h2>Liberar acesso a &quot;{root.nome}&quot;</h2>
          <button className="gd-icon-btn" aria-label="Fechar" onClick={fechar}><Svg d={P.close} /></button>
        </header>
        <div className="gd-dlg-body">
          <section className="gd-tree-pane">
            <div className="gd-tree-tools">
              <label className="gd-search"><Svg d={P.search} /><input type="search" placeholder="Buscar pastas e documentos" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" /></label>
              <button className="gd-icon-btn" title="Expandir tudo" onClick={() => setOpen(new Set(nodes.map((n) => n.id)))}><Svg d={P.expand} /></button>
              <button className="gd-icon-btn" title="Recolher tudo" onClick={() => setOpen(new Set([root.id]))}><Svg d={P.collapse} /></button>
            </div>
            <div className={`gd-bulkbar${emMassa ? ' gd-on' : ''}`}>
              <span className="gd-count">{checked.size} {checked.size === 1 ? 'item selecionado' : 'itens selecionados'}</span>
              <button className="gd-btn gd-text gd-sm" onClick={() => setChecked(new Set(nodes.map((n) => n.id)))}>Selecionar tudo</button>
              <button className="gd-btn gd-text gd-sm" onClick={() => setChecked(new Set())}>Limpar</button>
            </div>
            <div className="gd-tree" role="tree" ref={treeRef}>
              {vazio ? <div className="gd-empty2">Nenhum item encontrado para &quot;{q}&quot;</div> : <Row n={root} depth={0} />}
            </div>
          </section>
          <section className="gd-detail-pane">
            {emMassa ? <PainelMassa /> : <PainelItem n={selected} />}
          </section>
        </div>
        <footer>
          <button className="gd-btn gd-outline" onClick={() => copiarLink(emMassa ? root : selected)}><Svg d={P.link} />Copiar link</button>
          <span className="gd-spacer" />
          <span className="gd-footer-sum">{resumo.pessoas} pessoas · {resumo.custom} itens com regra própria</span>
          <button className="gd-btn gd-filled" onClick={fechar}>Concluído</button>
        </footer>
      </div>
      {picker && (
        <DriveAddPicker
          modo={picker === 'sim' ? 'sim' : 'add'}
          onClose={() => setPicker(null)}
          onConfirm={(sel) => {
            if (picker === 'sim') { const al = sel.estudantes[0]; setPicker(null); if (al) void simularAluno(al); return }
            adicionarSelecionados(picker, sel)
          }}
          listarGrupos={listarGrupos}
          buscarAlunos={buscarAlunos}
        />
      )}
    </>,
    document.body,
  )
}

function GrupoPickRow({ gr, sel, onToggle, indent }: { gr: DriveGrupo; sel: boolean; onToggle: () => void; indent?: boolean }) {
  return (
    <div className={`gd-pick-row${sel ? ' gd-sel' : ''}`} style={indent ? { marginLeft: 22 } : undefined} onClick={onToggle}>
      <input type="checkbox" checked={sel} readOnly />
      <span className="gd-av" style={{ background: gr.cor || avColor(gr.nome) }}>#</span>
      <span className="gd-rname">{gr.nome}</span>
    </div>
  )
}

// Seletor de GRUPOS + ALUNOS (abas, busca paginada server-side) p/ o "Liberar acesso". Mesmo espírito das
// outras áreas (grupos + alunos + liberar p/ todos), mas organizado no visual do Drive (pastas mestres → subgrupos).
function DriveAddPicker({ onClose, onConfirm, listarGrupos, buscarAlunos, modo = 'add' }: {
  onClose: () => void
  onConfirm: (sel: SelecaoAcesso) => void
  listarGrupos?: () => Promise<DriveGrupo[]>
  buscarAlunos?: (q: string, offset: number) => Promise<{ items: DriveAluno[]; total: number }>
  /** 'sim' = escolher UM aluno p/ simular acesso (só a aba Alunos). */
  modo?: 'add' | 'sim'
}) {
  const ehSim = modo === 'sim'
  const [shown, setShown] = useState(false)
  const [tab, setTab] = useState<'grupos' | 'alunos'>(ehSim ? 'alunos' : 'grupos')
  const [papel, setPapel] = useState<DrivePapel>('reader')
  const [grupos, setGrupos] = useState<DriveGrupo[] | null>(null)
  const [qG, setQG] = useState('')
  const [selG, setSelG] = useState<Map<string, DriveGrupo>>(new Map())
  const [qA, setQA] = useState('')
  const [alunos, setAlunos] = useState<DriveAluno[]>([])
  const [totalA, setTotalA] = useState(0)
  const [loadingA, setLoadingA] = useState(false)
  const [selA, setSelA] = useState<Map<string, DriveAluno>>(new Map())
  const [abertasG, setAbertasG] = useState<Set<string>>(new Set())

  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(r) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }) // eslint-disable-line
  useEffect(() => { if (!listarGrupos) { setGrupos([]); return } listarGrupos().then(setGrupos).catch(() => setGrupos([])) }, [listarGrupos])

  const buscar = useCallback((termo: string, offset: number) => {
    if (!buscarAlunos) { setAlunos([]); setTotalA(0); return }
    setLoadingA(true)
    buscarAlunos(termo, offset).then((r) => { setAlunos((prev) => (offset ? [...prev, ...r.items] : r.items)); setTotalA(r.total) }).finally(() => setLoadingA(false))
  }, [buscarAlunos])
  useEffect(() => { const t = setTimeout(() => buscar(qA, 0), 250); return () => clearTimeout(t) }, [qA, buscar])

  function fechar() { setShown(false); setTimeout(onClose, 220) }
  const toggleG = (gr: DriveGrupo) => setSelG((m) => { const n = new Map(m); n.has(gr.id) ? n.delete(gr.id) : n.set(gr.id, gr); return n })
  const toggleA = (al: DriveAluno) => setSelA((m) => { const n = new Map(m); n.has(al.id) ? n.delete(al.id) : n.set(al.id, al); return n })
  // Hierarquia dos grupos: pastas mestres (is_mestre) → subgrupos (pai_id) + soltos (como na área de Grupos).
  const comunsG = useMemo(() => (grupos ?? []).filter((g) => !g.is_mestre), [grupos])
  const pastasG = useMemo(() => (grupos ?? []).filter((g) => g.is_mestre), [grupos])
  const temHier = pastasG.length > 0
  const filhosDeG = useMemo(() => { const m = new Map<string, DriveGrupo[]>(); for (const g of comunsG) { const k = g.pai_id ?? '__soltos__'; (m.get(k) ?? m.set(k, []).get(k)!).push(g) } return m }, [comunsG])
  const matchG = (g: DriveGrupo) => !qG.trim() || g.nome.toLowerCase().includes(qG.trim().toLowerCase())
  const toggleVarios = (grs: DriveGrupo[]) => { if (!grs.length) return; const todos = grs.every((g) => selG.has(g.id)); setSelG((m) => { const n = new Map(m); grs.forEach((g) => (todos ? n.delete(g.id) : n.set(g.id, g))); return n }) }
  const toggleAbertaG = (id: string) => setAbertasG((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const totalSel = selG.size + selA.size

  return createPortal(
    <>
      <div className={`gd-scrim gd-s2${shown ? ' gd-show' : ''}`} onClick={fechar} />
      <div className={`gd-dialog gd-picker${shown ? ' gd-show' : ''}`} role="dialog" aria-modal="true">
        <header>
          <h2>{ehSim ? 'Escolher aluno para simular' : 'Adicionar grupos e alunos'}</h2>
          <button className="gd-icon-btn" aria-label="Fechar" onClick={fechar}><Svg d={P.close} /></button>
        </header>
        <div className="gd-ptabs">
          {!ehSim && <button className={tab === 'grupos' ? 'gd-on' : ''} onClick={() => setTab('grupos')}>Grupos {selG.size > 0 && <span className="gd-cnt">{selG.size}</span>}</button>}
          <button className={tab === 'alunos' ? 'gd-on' : ''} onClick={() => setTab('alunos')}>Alunos {selA.size > 0 && <span className="gd-cnt">{selA.size}</span>}</button>
        </div>
        <div className="gd-dlg-body" style={{ paddingTop: 12 }}>
          {tab === 'grupos' ? (
            <>
              <label className="gd-search" style={{ marginBottom: 10 }}><Svg d={P.search} /><input placeholder="Buscar grupos" value={qG} onChange={(e) => setQG(e.target.value)} /></label>
              {grupos === null ? <div className="gd-empty2">Carregando grupos…</div>
                : grupos.length === 0 ? <div className="gd-empty2">Nenhum grupo cadastrado.</div>
                  : (!temHier || qG.trim()) ? (
                    // Sem hierarquia OU buscando → lista plana dos grupos comuns que casam.
                    (() => { const lista = comunsG.filter(matchG); return lista.length === 0
                      ? <div className="gd-empty2">Nenhum grupo encontrado.</div>
                      : <div className="gd-pick-list">{lista.map((gr) => <GrupoPickRow key={gr.id} gr={gr} sel={selG.has(gr.id)} onToggle={() => toggleG(gr)} />)}</div> })()
                  ) : (
                    <div className="gd-pick-list">
                      {pastasG.map((p) => {
                        const filhos = filhosDeG.get(p.id) ?? []
                        const aberta = abertasG.has(p.id)
                        const todosSel = filhos.length > 0 && filhos.every((f) => selG.has(f.id))
                        const algum = filhos.some((f) => selG.has(f.id))
                        return (
                          <div key={p.id}>
                            <div className="gd-gfolder">
                              <button className="gd-tw" onClick={() => toggleAbertaG(p.id)} style={{ transform: aberta ? 'rotate(90deg)' : 'none' }}><Svg d={P.chev} /></button>
                              <input type="checkbox" checked={todosSel} ref={(el) => { if (el) el.indeterminate = !todosSel && algum }} onChange={() => toggleVarios(filhos)} disabled={!filhos.length} title="Selecionar todos da pasta" />
                              <span className="gd-av" style={{ background: p.cor || 'var(--gd-folder)' }}><Svg d={P.folder} /></span>
                              <span className="gd-rname" onClick={() => toggleAbertaG(p.id)} style={{ cursor: 'pointer', fontWeight: 500 }}>{p.nome}</span>
                              <span className="gd-gcount">{filhos.length} grupo{filhos.length === 1 ? '' : 's'}</span>
                            </div>
                            {aberta && (filhos.length === 0
                              ? <div className="gd-empty2" style={{ padding: '6px 0 6px 48px', textAlign: 'left' }}>Pasta vazia.</div>
                              : filhos.map((gr) => <GrupoPickRow key={gr.id} gr={gr} sel={selG.has(gr.id)} onToggle={() => toggleG(gr)} indent />))}
                          </div>
                        )
                      })}
                      {(filhosDeG.get('__soltos__') ?? []).length > 0 && (
                        <div>
                          <div className="gd-ssoltos">Sem pasta</div>
                          {(filhosDeG.get('__soltos__') ?? []).map((gr) => <GrupoPickRow key={gr.id} gr={gr} sel={selG.has(gr.id)} onToggle={() => toggleG(gr)} />)}
                        </div>
                      )}
                    </div>
                  )}
            </>
          ) : (
            <>
              <label className="gd-search" style={{ marginBottom: 10 }}><Svg d={P.search} /><input placeholder="Buscar alunos por nome ou e-mail" value={qA} onChange={(e) => setQA(e.target.value)} /></label>
              {alunos.length === 0 && !loadingA ? <div className="gd-empty2">{qA ? 'Nenhum aluno encontrado.' : 'Digite para buscar alunos.'}</div>
                : <ul className="gd-pick-list">
                  {alunos.map((al) => (
                    <li key={al.id} className={`gd-pick-row${selA.has(al.id) ? ' gd-sel' : ''}`} onClick={() => toggleA(al)}>
                      <input type="checkbox" checked={selA.has(al.id)} readOnly />
                      <AvatarEstudante nome={al.nome} avatar={al.avatar} cor={al.cor} seed={al.id} className="gd-av-pick" />
                      <span className="gd-rname"><b style={{ fontWeight: 500 }}>{al.nome}</b>{al.email ? <small style={{ display: 'block', color: 'var(--gd-text-3)', fontSize: 12 }}>{al.email}</small> : null}</span>
                    </li>
                  ))}
                </ul>}
              {alunos.length > 0 && alunos.length < totalA && (
                <div style={{ textAlign: 'center', marginTop: 10 }}><button className="gd-btn gd-text gd-sm" disabled={loadingA} onClick={() => buscar(qA, alunos.length)}>{loadingA ? 'Carregando…' : `Carregar mais (${totalA - alunos.length})`}</button></div>
              )}
            </>
          )}
        </div>
        <footer className="gd-lined">
          <span className="gd-footer-sum">{totalSel > 0 ? `${totalSel} selecionado${totalSel === 1 ? '' : 's'}` : ehSim ? 'Escolha um aluno' : 'Selecione grupos ou alunos'}</span>
          <span className="gd-spacer" />
          <button className="gd-btn gd-text" onClick={fechar}>Cancelar</button>
          <button className="gd-btn gd-filled" disabled={totalSel === 0} onClick={() => onConfirm({ grupos: [...selG.values()], estudantes: [...selA.values()], papel })}>
            {ehSim ? 'Simular' : `Adicionar${totalSel > 0 ? ` (${totalSel})` : ''}`}
          </button>
        </footer>
      </div>
    </>,
    document.body,
  )
}

// CSS portado do protótipo (diálogo + árvore de acesso + botões/campos), prefixado gd-.
// Dark mode via `.dark .gd-*` (o app usa classe .dark, não @media prefers-color-scheme).
export function DriveAcessoStyles() {
  return (
    <style>{`
  .gd-scrim,.gd-dialog,.gd-dl,.gd-up,.gd-drop{
    --gd-text:#1f1f1f;--gd-text-2:#444746;--gd-text-3:#5f6368;--gd-accent:var(--brand-primary,var(--primary));--gd-divider:#e8eaed;
    --gd-folder:#444746;--gd-surface:#f8fafd;--gd-card-bg:#f0f4f9;--gd-menu-bg:#fff;
    --gd-accent-soft:color-mix(in oklab,var(--brand-primary,var(--primary)) 16%,var(--gd-menu-bg));--gd-accent-softer:color-mix(in oklab,var(--brand-primary,var(--primary)) 8%,var(--gd-menu-bg));
    --gd-shadow-dialog:0 24px 64px -12px rgba(32,33,36,.35),0 8px 24px rgba(32,33,36,.12);
    --gd-shadow-menu:0 1px 2px rgba(60,64,67,.25),0 6px 18px 4px rgba(60,64,67,.14),0 18px 40px -8px rgba(60,64,67,.18);
    --gd-ease:cubic-bezier(.2,0,0,1);--gd-ease-out:cubic-bezier(.05,.7,.1,1);--gd-spring:cubic-bezier(.34,1.56,.64,1)}
  .dark .gd-scrim,.dark .gd-dialog,.dark .gd-dl,.dark .gd-up,.dark .gd-drop{
    --gd-text:#e8eaed;--gd-text-2:#c4c7c5;--gd-text-3:#9aa0a6;--gd-divider:#3c4043;--gd-folder:#c4c7c5;
    --gd-surface:#26272b;--gd-card-bg:#2a2b2f;--gd-menu-bg:#2d2e31}
  .gd-dialog *,.gd-dl *,.gd-up *,.gd-drop *{box-sizing:border-box}

  /* botões / campos */
  .gd-btn{position:relative;isolation:isolate;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 20px;
    border-radius:20px;border:none;font:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;
    transition:background .2s var(--gd-ease),box-shadow .2s var(--gd-ease),color .2s,transform .15s}
  .gd-btn:active{transform:scale(.97)}
  .gd-btn svg{width:18px;height:18px;fill:currentColor}
  .gd-btn.gd-filled{background:var(--gd-accent);color:var(--primary-foreground,#fff)}
  .gd-btn.gd-filled:hover{box-shadow:0 1px 3px color-mix(in oklab,var(--brand-primary,var(--primary)) 40%,transparent);background:color-mix(in oklab,var(--brand-primary,var(--primary)) 88%,black)}
  .gd-btn.gd-tonal{background:var(--gd-accent-soft);color:var(--brand-primary,var(--primary))}
  .gd-btn.gd-tonal:hover{filter:brightness(.97)}
  .gd-btn.gd-text{background:transparent;color:var(--gd-accent);padding:0 12px}
  .gd-btn.gd-text:hover{background:var(--gd-accent-softer)}
  .gd-btn.gd-outline{background:var(--gd-menu-bg);color:var(--gd-accent);border:1px solid #c4c7c5}
  .dark .gd-btn.gd-outline{border-color:#5f6368}
  .gd-btn.gd-outline:hover{background:var(--gd-accent-softer)}
  .gd-btn.gd-danger{color:#b3261e}
  .dark .gd-btn.gd-danger{color:#f28b82}
  .gd-btn.gd-danger:hover{background:#fce8e6}
  .dark .gd-btn.gd-danger:hover{background:rgba(242,139,130,.14)}
  .gd-btn.gd-sm{height:32px;padding:0 14px;font-size:13px}
  .gd-btn:disabled{opacity:.5;cursor:default;transform:none}
  .gd-icon-btn{position:relative;width:36px;height:36px;border-radius:50%;border:none;background:transparent;display:grid;place-items:center;cursor:pointer;flex-shrink:0;transition:background .2s}
  .gd-icon-btn:hover{background:rgba(31,31,31,.08)}
  .dark .gd-icon-btn:hover{background:rgba(255,255,255,.1)}
  .gd-icon-btn svg{width:20px;height:20px;fill:var(--gd-text-2)}
  .gd-field{height:40px;border:1px solid #c4c7c5;border-radius:10px;padding:0 12px;font:inherit;font-size:14px;color:var(--gd-text);
    background:var(--gd-menu-bg);outline:none;transition:border-color .2s,box-shadow .2s;min-width:0}
  .dark .gd-field{border-color:#5f6368}
  .gd-field:focus{border-color:var(--gd-accent);box-shadow:0 0 0 3px color-mix(in oklab,var(--brand-primary,var(--primary)) 15%,transparent)}
  .gd-field.gd-err{border-color:#b3261e;box-shadow:0 0 0 3px rgba(179,38,30,.12);animation:gdErrShake .35s}
  @keyframes gdErrShake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
  select.gd-field{appearance:none;padding-right:32px;cursor:pointer}
  .gd-field.gd-ghost{border-color:transparent;background-color:transparent;height:34px;font-size:13px;color:var(--gd-text-2)}
  .gd-field.gd-ghost:hover{background-color:rgba(31,31,31,.06)}
  .dark .gd-field.gd-ghost:hover{background-color:rgba(255,255,255,.06)}
  .gd-field.gd-ghost:disabled{cursor:default;opacity:.8}

  /* diálogo base */
  .gd-scrim{position:fixed;inset:0;z-index:1500;background:rgba(32,33,36,.42);backdrop-filter:blur(3px);opacity:0;visibility:hidden;transition:opacity .25s var(--gd-ease),visibility 0s .25s}
  .gd-scrim.gd-show{opacity:1;visibility:visible;transition:opacity .3s var(--gd-ease),visibility 0s}
  .gd-dialog{position:fixed;left:50%;top:50%;z-index:1600;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);
    display:flex;flex-direction:column;background:var(--gd-menu-bg);color:var(--gd-text);border-radius:24px;box-shadow:var(--gd-shadow-dialog);
    opacity:0;transform:translate(-50%,-46%) scale(.94);transition:opacity .2s var(--gd-ease),transform .25s var(--gd-ease)}
  .gd-dialog.gd-show{opacity:1;transform:translate(-50%,-50%);transition:opacity .25s var(--gd-ease),transform .5s var(--gd-ease-out)}
  .gd-dialog header{display:flex;align-items:center;gap:12px;padding:20px 16px 12px 24px}
  .gd-dialog header h2{flex:1;margin:0;font-size:22px;font-weight:400;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gd-dlg-body{flex:1;min-height:0;overflow:auto;padding:4px 24px 16px}
  .gd-dialog footer{display:flex;align-items:center;gap:8px;padding:12px 20px 20px 24px}
  .gd-spacer{flex:1}
  .gd-fade-in{animation:gdFadeIn .35s var(--gd-ease-out)}
  @keyframes gdFadeIn{from{opacity:0;transform:translateY(6px)}}

  /* liberar acesso */
  .gd-dialog.gd-access{width:min(1040px,calc(100vw - 24px));height:min(700px,calc(100vh - 24px))}
  .gd-dialog.gd-access .gd-dlg-body{padding:0;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);border-top:1px solid var(--gd-divider);overflow:hidden}
  .gd-tree-pane{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--gd-divider);background:var(--gd-surface)}
  .gd-tree-tools{display:flex;align-items:center;gap:4px;padding:12px 12px 8px 16px}
  .gd-search{flex:1;display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:20px;background:var(--gd-card-bg);transition:background .2s,box-shadow .2s}
  .gd-search:focus-within{background:var(--gd-menu-bg);box-shadow:0 1px 3px rgba(60,64,67,.3)}
  .gd-search svg{width:20px;height:20px;fill:var(--gd-text-2);flex-shrink:0}
  .gd-search input{flex:1;border:none;background:none;outline:none;font:inherit;font-size:14px;min-width:0;color:var(--gd-text)}
  .gd-bulkbar{display:flex;align-items:center;gap:6px;margin:0 12px;padding:0 6px 0 14px;height:0;opacity:0;overflow:hidden;border-radius:12px;
    background:var(--gd-accent-soft);color:var(--brand-primary,var(--primary));font-size:13px;font-weight:500;transition:height .3s var(--gd-ease),opacity .25s,margin .3s}
  .gd-bulkbar.gd-on{height:44px;opacity:1;margin:4px 12px 8px}
  .gd-bulkbar .gd-count{flex:1}
  .gd-bulkbar .gd-btn{color:inherit}
  .gd-tree{flex:1;overflow:auto;padding:4px 8px 16px}
  .gd-row{position:relative;display:flex;align-items:center;gap:6px;height:38px;padding-right:8px;padding-left:calc(var(--d)*20px + 4px);
    border-radius:10px;cursor:pointer;font-size:14px;transition:background .15s;user-select:none}
  .gd-row:hover{background:rgba(31,31,31,.05)}
  .dark .gd-row:hover{background:rgba(255,255,255,.05)}
  .gd-row.gd-sel{background:var(--gd-accent-soft)}
  .gd-row.gd-hide{display:none}
  .gd-tw{width:24px;height:24px;border:none;background:none;border-radius:50%;display:grid;place-items:center;cursor:pointer;flex-shrink:0;padding:0}
  .gd-tw:hover{background:rgba(31,31,31,.08)}
  .dark .gd-tw:hover{background:rgba(255,255,255,.08)}
  .gd-tw svg{width:20px;height:20px;fill:var(--gd-text-2);transition:transform .3s var(--gd-spring)}
  .gd-row.gd-open>.gd-tw svg{transform:rotate(90deg)}
  .gd-tw.gd-leaf{visibility:hidden}
  .gd-row input[type=checkbox]{width:16px;height:16px;margin:0 4px 0 0;accent-color:var(--gd-accent);cursor:pointer;flex-shrink:0}
  .gd-ficon{width:20px;height:20px;flex-shrink:0}
  .gd-rname{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gd-rname mark{background:#fde293;color:#1f1f1f;border-radius:3px;padding:0 1px}
  .gd-avs{display:flex;flex-shrink:0;align-items:center}
  .gd-av{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:500;color:#fff;border:2px solid var(--gd-surface);margin-left:-7px;flex-shrink:0}
  .gd-avs .gd-av:first-child{margin-left:0}
  .gd-av.gd-more{background:#e3e3e3;color:var(--gd-text-2)}
  .gd-av.gd-lg{width:36px;height:36px;font-size:14px;border:none;margin:0}
  .gd-linkdot{width:18px;height:18px;fill:var(--gd-accent);flex-shrink:0;margin-right:2px}
  .gd-badge{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:11px;font-size:11px;font-weight:500;flex-shrink:0}
  .gd-badge svg{width:12px;height:12px;fill:currentColor}
  .gd-b-inh{background:#eceff1;color:#5f6368}
  .gd-b-cus{background:color-mix(in oklab,var(--brand-primary,var(--primary)) 18%,var(--gd-menu-bg));color:var(--brand-primary,var(--primary))}
  .gd-b-res{background:#ffe0b2;color:#8a4b00}
  .gd-b-root{background:#c4eed0;color:#0d652d}
  .dark .gd-b-inh{background:#3c4043;color:#c4c7c5}
  .dark .gd-b-res{background:#4a3410;color:#f8c889}
  .dark .gd-b-root{background:#173a24;color:#8bd1a2}
  .gd-kids{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s var(--gd-ease)}
  .gd-kids.gd-open{grid-template-rows:1fr}
  .gd-kids>div{overflow:hidden;min-height:0}
  .gd-legend{display:flex;flex-wrap:wrap;gap:8px 12px;padding:10px 16px 12px;border-top:1px solid var(--gd-divider);font-size:12px;color:var(--gd-text-3)}
  .gd-legend span{display:flex;align-items:center;gap:6px}
  .gd-empty2{padding:32px 16px;text-align:center;color:var(--gd-text-3);font-size:14px}

  .gd-detail-pane{overflow:auto;padding:20px 24px 24px;min-height:0}
  .gd-dp-head{display:flex;align-items:center;gap:14px;margin-bottom:6px}
  .gd-dp-head .gd-big{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--gd-card-bg);flex-shrink:0}
  .gd-dp-head .gd-big svg{width:26px;height:26px}
  .gd-dp-head h3{margin:0;font-size:18px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gd-crumb{font-size:12px;color:var(--gd-text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gd-sec-title{display:flex;align-items:center;gap:8px;margin:22px 0 10px;font-size:14px;font-weight:500}
  .gd-sec-title .gd-n{font-size:12px;color:var(--gd-text-3);font-weight:400}
  .gd-switch-row{display:flex;align-items:center;gap:12px;margin-top:16px;padding:12px 14px;border-radius:14px;background:var(--gd-surface);border:1px solid var(--gd-divider)}
  .gd-switch-row div{flex:1;font-size:14px}
  .gd-switch-row small{display:block;color:var(--gd-text-3);font-size:12px;margin-top:2px}
  .gd-switch{position:relative;width:52px;height:32px;border-radius:16px;border:2px solid #747775;background:#e3e3e3;cursor:pointer;flex-shrink:0;transition:background .25s,border-color .25s;padding:0}
  .gd-switch::after{content:"";position:absolute;left:6px;top:6px;width:16px;height:16px;border-radius:50%;background:#747775;transition:all .35s var(--gd-spring)}
  .gd-switch.gd-on{background:var(--gd-accent);border-color:var(--gd-accent)}
  .gd-switch.gd-on::after{left:22px;top:2px;width:24px;height:24px;background:#fff}
  .gd-switch:disabled{opacity:.4;cursor:default}
  .gd-add-row{display:flex;gap:8px;margin-top:16px}
  .gd-add-row .gd-field:first-child{flex:1}
  .gd-people{list-style:none;margin:0;padding:0}
  .gd-person{display:flex;align-items:center;gap:12px;padding:6px 4px;border-radius:12px;animation:gdFadeIn .35s var(--gd-ease-out) both;transition:background .15s}
  .gd-person:hover{background:var(--gd-surface)}
  .gd-who{flex:1;min-width:0}
  .gd-who b{display:block;font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gd-who small{display:flex;flex-wrap:wrap;align-items:center;gap:2px 4px;font-size:12px;color:var(--gd-text-3);margin-top:1px}
  .gd-tag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:6px;background:#eceff1;color:#5f6368}
  .gd-tag.gd-direct{background:color-mix(in oklab,var(--brand-primary,var(--primary)) 18%,var(--gd-menu-bg));color:var(--brand-primary,var(--primary))}
  .dark .gd-tag{background:#3c4043;color:#c4c7c5}
  .gd-general{display:flex;align-items:center;gap:12px;padding:6px 4px}
  .gd-gicon{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}
  .gd-gicon svg{width:20px;height:20px}
  .gd-gicon.gd-r{background:#e3e3e3}.gd-gicon.gd-r svg{fill:var(--gd-text-2)}
  .gd-gicon.gd-l{background:#c4eed0}.gd-gicon.gd-l svg{fill:#0d652d}
  .dark .gd-gicon.gd-r{background:#3c4043}
  .dark .gd-gicon.gd-l{background:#173a24}.dark .gd-gicon.gd-l svg{fill:#8bd1a2}
  .gd-gtxt{flex:1;min-width:0}
  .gd-gtxt small{display:block;font-size:12px;color:var(--gd-text-3);margin:2px 0 0 12px}
  .gd-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .gd-stat{padding:12px;border-radius:14px;background:var(--gd-surface);border:1px solid var(--gd-divider)}
  .gd-stat b{display:block;font-size:20px;font-weight:500}
  .gd-stat span{font-size:12px;color:var(--gd-text-3)}
  .gd-actions-wrap{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .gd-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .gd-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid #c4c7c5;font-size:12px;animation:gdFadeIn .3s var(--gd-ease-out) both;max-width:200px}
  .dark .gd-chip{border-color:#5f6368}
  .gd-chip svg{width:16px;height:16px;flex-shrink:0}
  .gd-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gd-footer-sum{font-size:12px;color:var(--gd-text-3);margin-right:8px}

  @media (max-width:760px){
    .gd-dialog.gd-access{height:min(700px,calc(100vh - 24px))}
    .gd-dialog.gd-access .gd-dlg-body{grid-template-columns:1fr;grid-template-rows:minmax(220px,45%) 1fr}
    .gd-tree-pane{border-right:none;border-bottom:1px solid var(--gd-divider)}
    .gd-legend,.gd-footer-sum{display:none}
  }
  /* "Adicionar grupos e alunos" + seletor */
  .gd-add2{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
  .gd-scrim.gd-s2{z-index:1700;background:rgba(32,33,36,.3)}
  .gd-dialog.gd-picker{z-index:1800;width:min(520px,calc(100vw - 24px));height:min(600px,calc(100vh - 24px))}
  .gd-ptabs{display:flex;gap:4px;border-bottom:1px solid var(--gd-divider);padding:0 20px;margin-top:2px;flex-shrink:0}
  .gd-ptabs button{position:relative;height:44px;padding:0 14px;border:none;background:none;font:inherit;font-size:14px;font-weight:500;color:var(--gd-text-2);cursor:pointer;display:flex;align-items:center;gap:6px}
  .gd-ptabs button:hover{color:var(--gd-text)}
  .gd-ptabs button.gd-on{color:var(--gd-accent)}
  .gd-ptabs button.gd-on::after{content:"";position:absolute;left:8px;right:8px;bottom:-1px;height:3px;border-radius:3px 3px 0 0;background:var(--gd-accent)}
  .gd-ptabs .gd-cnt{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--gd-accent);color:#fff;font-size:11px;font-weight:500}
  .gd-pick-list{list-style:none;margin:0;padding:0}
  .gd-pick-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;cursor:pointer;transition:background .15s}
  .gd-pick-row:hover{background:rgba(31,31,31,.05)}
  .dark .gd-pick-row:hover{background:rgba(255,255,255,.05)}
  .gd-pick-row.gd-sel{background:var(--gd-accent-soft)}
  .gd-pick-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--gd-accent);flex-shrink:0;cursor:pointer;margin:0}
  .gd-pick-row .gd-av{width:30px;height:30px;font-size:12px;border:none;margin:0}
  .gd-pick-row .gd-av svg{width:16px;height:16px;fill:#fff}
  .gd-pk-papel{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--gd-text-3)}
  .gd-gfolder{display:flex;align-items:center;gap:8px;padding:8px;border-radius:10px}
  .gd-gfolder:hover{background:rgba(31,31,31,.04)}
  .dark .gd-gfolder:hover{background:rgba(255,255,255,.04)}
  .gd-gfolder .gd-tw svg{transition:transform .25s var(--gd-spring)}
  .gd-gfolder .gd-av{width:30px;height:30px;border:none;margin:0}
  .gd-gfolder .gd-av svg{width:17px;height:17px;fill:#fff}
  .gd-gfolder input[type=checkbox]{width:16px;height:16px;accent-color:var(--gd-accent);flex-shrink:0;cursor:pointer;margin:0}
  .gd-gcount{font-size:12px;color:var(--gd-text-3);flex-shrink:0}
  .gd-ssoltos{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.3px;color:var(--gd-text-3);padding:12px 8px 4px}
  /* status (liberado/restrito) + avatares com foto */
  .gd-status{display:flex;align-items:center;gap:12px;margin-top:16px;padding:12px 14px;border-radius:14px;border:1px solid var(--gd-divider)}
  .gd-status .gd-st-ic{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}
  .gd-status .gd-st-ic svg{width:20px;height:20px}
  .gd-status b{display:block;font-size:14px;font-weight:500}
  .gd-status small{display:block;font-size:12px;color:var(--gd-text-3);margin-top:2px}
  .gd-st-ok{background:color-mix(in oklab,#0d904f 9%,var(--gd-menu-bg))}
  .gd-st-ok .gd-st-ic{background:color-mix(in oklab,#0d904f 18%,var(--gd-menu-bg))}
  .gd-st-ok .gd-st-ic svg{fill:#0d904f}
  .gd-st-restr{background:color-mix(in oklab,var(--brand-primary,var(--primary)) 7%,var(--gd-menu-bg))}
  .gd-st-restr .gd-st-ic{background:color-mix(in oklab,var(--brand-primary,var(--primary)) 16%,var(--gd-menu-bg))}
  .gd-st-restr .gd-st-ic svg{fill:var(--brand-primary,var(--primary))}
  .gd-av-lg{width:36px;height:36px;font-size:14px}
  .gd-av-pick{width:30px;height:30px;font-size:12px}
  .gd-grp-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:500;flex-shrink:0}
  @media (prefers-reduced-motion:reduce){.gd-dialog,.gd-scrim,.gd-fade-in,.gd-person,.gd-chip,.gd-kids,.gd-switch::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
    `}</style>
  )
}
