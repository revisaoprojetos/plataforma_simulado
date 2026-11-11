'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { OpcoesQ } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import type { RespostaTaxG } from '@/lib/admin-revisao/biblioteca-questoes-gestao-tipos'
import { lerG } from './questoes-api'

const URL_API = '/api/admin/revisao/biblioteca/questoes'
const sel = 'h-9 w-full rounded-lg border bg-background px-2 text-sm font-normal text-foreground disabled:opacity-60'

export type PatchUI = { disciplinaId?: string | null; assuntoId?: string | null; bancaId?: string | null; orgaoId?: string | null; ano?: number | null; dificuldade?: string | null; cargo?: string | null }

/** Classificação em massa (disciplina › assunto, banca, órgão, ano, dificuldade, cargo). Cada campo começa em "não alterar".
 *  "Só preencher vazios" evita sobrescrever o que já está classificado. Reusa a lista de opções do Banco (OpcoesQ). */
export function ClassificarDialog({ n, opcoes, padraoSoPreencher, onClose, onConfirm }: {
  n: number; opcoes: OpcoesQ | null; padraoSoPreencher: boolean; onClose: () => void
  onConfirm: (patch: PatchUI, soPreencher: boolean) => void | Promise<void>
}) {
  const [disc, setDisc] = useState('')
  const [ass, setAss] = useState('')
  const [banca, setBanca] = useState('')
  const [orgao, setOrgao] = useState('')
  const [ano, setAno] = useState('')
  const [dif, setDif] = useState('')
  const [cargo, setCargo] = useState('')
  const [soPreencher, setSoPreencher] = useState(padraoSoPreencher)
  const [assuntos, setAssuntos] = useState<{ id: string; nome: string }[]>([])
  const [carregandoAss, setCarregandoAss] = useState(false)
  const [cargos, setCargos] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    setAss(''); setAssuntos([])
    if (!disc) return
    let vivo = true; setCarregandoAss(true)
    fetch(`${URL_API}?assuntos=${disc}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (vivo) setAssuntos(j.assuntos ?? []) }).catch(() => {}).finally(() => { if (vivo) setCarregandoAss(false) })
    return () => { vivo = false }
  }, [disc])
  useEffect(() => { void lerG<RespostaTaxG>({ s: 'taxonomia', tipo: 'cargo', pp: 100, sort: 'nome', dir: 'asc' }).then((j) => { if (j.ok) setCargos((j.itens ?? []).map((i) => i.nome)) }) }, [])

  const patch = useMemo<PatchUI>(() => {
    const p: PatchUI = {}
    if (disc) p.disciplinaId = disc
    if (disc && ass) p.assuntoId = ass
    if (banca) p.bancaId = banca
    if (orgao) p.orgaoId = orgao
    if (ano.trim() && Number.isInteger(Number(ano))) p.ano = Number(ano)
    if (dif) p.dificuldade = dif
    if (cargo.trim()) p.cargo = cargo.trim()
    return p
  }, [disc, ass, banca, orgao, ano, dif, cargo])
  const alteracoes = Object.keys(patch).length
  const anoRuim = ano.trim() !== '' && !(Number.isInteger(Number(ano)) && Number(ano) >= 1950 && Number(ano) <= 2100)
  const lbl = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground'

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Classificar {n} {n === 1 ? 'questão' : 'questões'}</DialogTitle>
          <DialogDescription>Escolha só o que quer definir; os campos em “não alterar” ficam como estão.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}>Disciplina
            <select className={sel} value={disc} onChange={(e) => setDisc(e.target.value)} aria-label="Disciplina">
              <option value="">— não alterar —</option>{(opcoes?.disciplinas ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </label>
          <label className={lbl}>Assunto
            <select className={sel} value={ass} disabled={!disc || carregandoAss} onChange={(e) => setAss(e.target.value)} aria-label="Assunto">
              <option value="">{!disc ? 'Escolha a disciplina antes' : carregandoAss ? 'Carregando…' : '— não alterar —'}</option>{assuntos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>
          <label className={lbl}>Banca
            <select className={sel} value={banca} onChange={(e) => setBanca(e.target.value)} aria-label="Banca">
              <option value="">— não alterar —</option>{(opcoes?.bancas ?? []).map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </label>
          <label className={lbl}>Órgão
            <select className={sel} value={orgao} onChange={(e) => setOrgao(e.target.value)} aria-label="Órgão">
              <option value="">— não alterar —</option>{(opcoes?.orgaos ?? []).map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </label>
          <label className={lbl}>Ano
            <input className={sel} inputMode="numeric" placeholder="— não alterar —" value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Ano" list="classificar-anos" />
            <datalist id="classificar-anos">{(opcoes?.anos ?? []).map((a) => <option key={a} value={a} />)}</datalist>
          </label>
          <label className={lbl}>Dificuldade
            <select className={sel} value={dif} onChange={(e) => setDif(e.target.value)} aria-label="Dificuldade">
              <option value="">— não alterar —</option><option value="facil">Fácil</option><option value="medio">Médio</option><option value="dificil">Difícil</option>
            </select>
          </label>
          <label className={`${lbl} sm:col-span-2`}>Cargo
            <input className={sel} placeholder="— não alterar —" value={cargo} onChange={(e) => setCargo(e.target.value)} aria-label="Cargo" list="classificar-cargos" maxLength={200} />
            <datalist id="classificar-cargos">{cargos.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        </div>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/30 p-2.5 text-xs">
          <input type="checkbox" checked={soPreencher} onChange={(e) => setSoPreencher(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[var(--primary)]" />
          <span><b className="text-foreground">Preencher só o que está vazio.</b> <span className="text-muted-foreground">{soPreencher ? 'Quem já tem o campo preenchido não é alterado.' : 'Desmarcado: substitui o valor atual nas questões selecionadas (trocar a disciplina sem escolher assunto zera o assunto).'}</span></span>
        </label>
        <div className="-mx-4 -mb-4 mt-2 flex items-center justify-end gap-2 border-t px-4 py-3">
          <span className="mr-auto text-xs text-muted-foreground">{alteracoes ? `${alteracoes} ${alteracoes === 1 ? 'campo' : 'campos'} a definir` : 'Nada escolhido'}</span>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button disabled={!alteracoes || anoRuim || enviando} onClick={async () => { setEnviando(true); try { await onConfirm(patch, soPreencher) } finally { setEnviando(false) } }}>
            {enviando && <Loader2 className="animate-spin" />}Aplicar em {n}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
