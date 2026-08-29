'use client'

import { FileText, CalendarClock, ShieldCheck, Settings2, Trophy, Clock, Info, ListChecks, List, AlertTriangle, Timer, Infinity as Infinito, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BRT_LABEL } from '@/lib/brt'
import { Secao, Campo, Rotulo, ToggleRow, SegCard, LIB_OPTS } from '@/components/admin/simulado-form-bits'
import { useCriar, useGuardStep } from '../criar-context'

// Rótulo + descrição de cada método de identificação (login leve, sem senha).
const METODO_ID: Record<string, { label: string; desc: string }> = {
  email: { label: 'Somente e-mail', desc: 'Menor atrito — só o e-mail cadastrado.' },
  email_cpf: { label: 'E-mail + CPF', desc: 'E-mail + CPF como 2º fator leve.' },
  email_telefone: { label: 'E-mail + telefone', desc: 'E-mail + telefone como 2º fator leve.' },
}

export default function RegrasPage() {
  useGuardStep(4)
  const { draft, patch, patchInfo, patchRegras } = useCriar()
  const info = draft.info
  const r = draft.regras as Record<string, any>
  const tipoCorrecao = (r.tipo_correcao ?? 'pontuacao') as 'pontuacao' | 'cebraspe'
  const ehCebraspe = tipoCorrecao === 'cebraspe'

  // Campo "Tempo de prova" reutilizado nos 3 modos (fica ao lado do fim, no prazo e no aberto).
  const campoTempo = (
    <Campo label="Tempo de prova (por aluno)" hint="Duração de cada tentativa (h:min). Em branco = sem limite.">
      <Input type="time" className="w-full"
        value={info.tempo_limite_min ? `${String(Math.floor(info.tempo_limite_min / 60)).padStart(2, '0')}:${String(info.tempo_limite_min % 60).padStart(2, '0')}` : ''}
        onChange={(e) => { const [h, m] = (e.target.value || '').split(':'); const tot = (Number(h) || 0) * 60 + (Number(m) || 0); patchInfo({ tempo_limite_min: tot || null }) }} />
    </Campo>
  )

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Já vêm com os padrões recomendados — ajuste o que precisar.</p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>O simulado nasce como <strong>rascunho</strong> (invisível ao aluno). Estas regras definem como ele vai funcionar; você publica quando quiser.</span>
      </div>

      {/* Modalidade, formato e tipo de correção */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <Secao icon={ListChecks} titulo="Modalidade e correção" desc="Como as questões são respondidas e como a nota é calculada." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Tipo do simulado (como a nota é calculada) — à esquerda, mesmo estilo do formato. */}
          <div className="space-y-2">
            <Rotulo>Tipo do simulado</Rotulo>
            <Select value={tipoCorrecao} onValueChange={(v) => patchRegras({ tipo_correcao: (v ?? 'pontuacao') as any })} items={{ pontuacao: 'Por pontuação', cebraspe: 'Estilo CEBRASPE' }}>
              <SelectTrigger className="!h-auto w-full items-start gap-3 whitespace-normal rounded-2xl border bg-card p-4 text-left shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Trophy className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{ehCebraspe ? 'Estilo CEBRASPE' : 'Por pontuação'}</span>
                  <span className="block text-xs text-muted-foreground">{ehCebraspe ? 'Cada erro anula um acerto (acertos − erros).' : '+1 ponto por acerto. Erros e em branco não descontam.'}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pontuacao">Por pontuação</SelectItem>
                <SelectItem value="cebraspe">Estilo CEBRASPE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Rotulo>Modalidade</Rotulo>
            <div className="flex items-start gap-3 rounded-2xl border border-primary bg-card p-4 shadow-sm ring-2 ring-primary/30">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ListChecks className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block font-semibold">Objetivo</span>
                <span className="block text-xs text-muted-foreground">Alternativas / certo-errado, corrigido automaticamente.</span>
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Rotulo>Formato das questões</Rotulo>
            <Select value={draft.objetivoSub} onValueChange={(v) => patch({ objetivoSub: (v ?? 'multipla') as any })} items={{ multipla: 'Múltipla escolha', certo_errado: 'Certo / Errado' }}>
              <SelectTrigger className="!h-auto w-full items-start gap-3 whitespace-normal rounded-2xl border bg-card p-4 text-left shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><List className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{draft.objetivoSub === 'certo_errado' ? 'Certo / Errado' : 'Múltipla escolha'}</span>
                  <span className="block text-xs text-muted-foreground">{draft.objetivoSub === 'certo_errado' ? 'Julgamento Certo/Errado (estilo Cespe).' : 'Questões com alternativas (A–E).'}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multipla">Múltipla escolha</SelectItem>
                <SelectItem value="certo_errado">Certo / Errado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {ehCebraspe && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Estilo CEBRASPE:</strong> a nota é <strong>acertos − erros</strong>. Ex.: 5 acertos e 4 erros = <strong>1 ponto</strong>.
              Questões <strong>não marcadas são desconsideradas</strong> (não descontam). Questão <strong>anulada soma ponto</strong>;
              se o aluno errar mais, esse ganho é compensado. É uma prova mais rígida — não permite errar à toa.
            </span>
          </div>
        )}
      </section>

      {/* Identificação */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <Secao icon={FileText} titulo="Identificação da prova" desc="Como o simulado aparece para o aluno." />
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-2">
          <Campo label="Descrição"><Textarea value={info.descricao} onChange={(e) => patchInfo({ descricao: e.target.value })} rows={3} className="resize-none" placeholder="Breve resumo da prova (opcional)" /></Campo>
          <Campo label="Instruções ao aluno" hint="Exibidas antes de iniciar a prova.">
            <Textarea value={info.instrucoes} onChange={(e) => patchInfo({ instrucoes: e.target.value })} rows={3} className="resize-none" placeholder="Ex.: Leia com atenção. Sem consulta." />
          </Campo>
        </div>
      </section>

      {/* Aplicação e prazos */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <Secao icon={CalendarClock} titulo="Aplicação e prazos" desc="Quando o aluno pode fazer e por quanto tempo." tone="info" />
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Rotulo>Modo de aplicação</Rotulo>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {([
                ['janela_fixa', CalendarClock, 'Agendado', 'Abre e fecha em data e hora definidas — todos fazem na mesma janela.'],
                ['prazo_relativo', Timer, 'Prazo relativo', 'Cada aluno tem um prazo, contado a partir da liberação do acesso.'],
                ['aberto', Infinito, 'Sempre disponível', 'Sem data nem prazo — o aluno faz quando quiser.'],
              ] as const).map(([v, Icone, label, desc]) => {
                const on = info.modo_aplicacao === v
                return (
                  <button key={v} type="button" onClick={() => patchInfo({ modo_aplicacao: v })}
                    className={cn('flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors', on ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'bg-muted/30 hover:border-primary/40')}>
                    <span className="flex items-center gap-2">
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors', on ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}><Icone className="h-4 w-4" /></span>
                      <span className="text-[13px] font-bold">{label}</span>
                    </span>
                    <span className="text-[11px] leading-snug text-muted-foreground">{desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Configuração do modo escolhido + tempo de prova (agrupados num bloco destacado). */}
          <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
            {info.modo_aplicacao === 'janela_fixa' && (
              <div className="space-y-1.5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Campo label="Abre em" obrigatorio hint="Data e hora em que o aluno pode começar."><Input type="datetime-local" value={info.data_inicio} onChange={(e) => patchInfo({ data_inicio: e.target.value })} /></Campo>
                  <Campo label="Fecha em" hint="Opcional. Com data, encerra e corrige tudo automaticamente."><Input type="datetime-local" value={info.data_fim} onChange={(e) => patchInfo({ data_fim: e.target.value })} /></Campo>
                  {campoTempo}
                </div>
                {info.data_fim ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5 shrink-0" /> {BRT_LABEL} — informe e confira sempre no horário de Brasília.</p>
                ) : (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Infinito className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Sem "Fecha em": abre na data acima e fica <strong className="font-semibold text-foreground">aberto para sempre</strong>, até você encerrar manualmente.</p>
                )}
              </div>
            )}
            {info.modo_aplicacao === 'prazo_relativo' && (
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Campo label="Prazo para concluir" obrigatorio hint="Começa a contar quando você libera o acesso de cada aluno.">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input type="number" min={1} value={info.prazo_valor ?? ''} onChange={(e) => patchInfo({ prazo_valor: Number(e.target.value) || null })} placeholder="ex.: 7" className="w-28" />
                    <Select value={info.prazo_unidade} onValueChange={(v) => patchInfo({ prazo_unidade: (v ?? 'dias') as any })} items={{ horas: 'Horas', dias: 'Dias', meses: 'Meses' }}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="horas">Horas</SelectItem><SelectItem value="dias">Dias</SelectItem><SelectItem value="meses">Meses</SelectItem></SelectContent>
                    </Select>
                  </div>
                </Campo>
                {campoTempo}
              </div>
            )}
            {info.modo_aplicacao === 'aberto' && (
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <p className="flex items-start gap-1.5 self-center text-xs text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Sempre disponível: sem data nem prazo — o aluno inicia quando quiser. O tempo de prova ao lado, se definido, limita cada tentativa.</p>
                {campoTempo}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Acesso do aluno */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <Secao icon={ShieldCheck} titulo="Acesso do aluno" desc="Como o aluno se identifica para entrar na prova." tone="ok" />
        <div className="mt-4 grid items-stretch gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Rotulo>Identificação do aluno</Rotulo>
            <Select value={info.metodo_identificacao} onValueChange={(v) => patchInfo({ metodo_identificacao: (v ?? 'email_cpf') as any })} items={{ email: 'Somente e-mail', email_cpf: 'E-mail + CPF', email_telefone: 'E-mail + telefone' }}>
              <SelectTrigger className="!h-auto w-full flex-1 items-start gap-3 whitespace-normal rounded-2xl border bg-card p-4 text-left shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserCheck className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{(METODO_ID[info.metodo_identificacao] ?? METODO_ID.email_cpf).label}</span>
                  <span className="block text-xs text-muted-foreground">{(METODO_ID[info.metodo_identificacao] ?? METODO_ID.email_cpf).desc}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Somente e-mail</SelectItem>
                <SelectItem value="email_cpf">E-mail + CPF</SelectItem>
                <SelectItem value="email_telefone">E-mail + telefone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Rotulo>Como funciona</Rotulo>
            <div className="flex flex-1 items-start gap-2.5 rounded-2xl border bg-muted/20 p-4 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Login <strong className="text-foreground">leve, sem senha</strong>: o aluno entra informando os dados escolhidos, conferidos contra o cadastro. Mais campos = mais segurança — o e-mail sozinho tem menos atrito; CPF/telefone funcionam como 2º fator.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Comportamento */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <Secao icon={Settings2} titulo="Comportamento da prova" desc="Regras aplicadas durante a execução." />
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <ToggleRow label="Embaralhar questões" desc="Cada aluno recebe uma ordem diferente." v={r.embaralhar_questoes} on={(v) => patchRegras({ embaralhar_questoes: v })} />
          <ToggleRow label="Embaralhar alternativas" desc="Reduz cópia entre alunos." v={r.embaralhar_alternativas} on={(v) => patchRegras({ embaralhar_alternativas: v })} dim={draft.tipo === 'discursivo'} />
          <ToggleRow label="Revisão antes de enviar" desc="Mostra o resumo das respostas." v={r.revisao_antes_enviar} on={(v) => patchRegras({ revisao_antes_enviar: v })} />
          <ToggleRow label="Exibir nota ao aluno" desc="Nota aparece assim que envia." v={r.exibir_nota} on={(v) => patchRegras({ exibir_nota: v })} />
          <ToggleRow label="Mostrar comentário do professor" desc="Exibe o comentário junto do gabarito." v={r.mostrar_comentario} on={(v) => patchRegras({ mostrar_comentario: v })} />
          <div className="space-y-2">
            <ToggleRow label="Permitir iniciar atrasado" desc="Aluno entra após o início da janela." v={r.iniciar_atrasado} on={(v) => patchRegras({ iniciar_atrasado: v })} />
            {r.iniciar_atrasado && (
              <div className="flex items-center gap-1.5 pl-1">
                <Label className="whitespace-nowrap text-xs text-muted-foreground">até</Label>
                <Input type="number" min={1} value={r.tolerancia_atraso_min ?? ''} onChange={(e) => patchRegras({ tolerancia_atraso_min: e.target.value })} placeholder="30" className="h-8 w-20" />
                <span className="text-xs text-muted-foreground">min de atraso</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tentativas e pontuação */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <Secao icon={Trophy} titulo="Tentativas e pontuação" desc="Define como a nota é calculada." tone="info" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Tentativas permitidas">
            <Input type="number" min={1} value={r.retentativas_ilimitadas ? '' : (r.retentativas ?? '')} onChange={(e) => patchRegras({ retentativas: e.target.value })} disabled={r.retentativas_ilimitadas} placeholder={r.retentativas_ilimitadas ? 'Ilimitadas' : '1'} />
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={!!r.retentativas_ilimitadas} onChange={(e) => patchRegras({ retentativas_ilimitadas: e.target.checked })} className="h-3.5 w-3.5 rounded border accent-[var(--primary)]" />
              Ilimitadas
            </label>
          </Campo>
          <Campo label="Política de nota" hint={r.retentativas_ilimitadas ? 'Considera todas as tentativas.' : 'Com 1 tentativa, é indiferente.'}>
            <Select value={r.politica_nota} onValueChange={(v) => patchRegras({ politica_nota: v })} items={{ ultima: 'Última', melhor: 'Maior', media: 'Média' }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ultima">Última tentativa</SelectItem><SelectItem value="melhor">Maior nota</SelectItem><SelectItem value="media">Média</SelectItem></SelectContent>
            </Select>
          </Campo>
          <Campo label="Tempo por questão (seg)"><Input type="number" min={0} value={r.tempo_por_questao_seg ?? ''} onChange={(e) => patchRegras({ tempo_por_questao_seg: e.target.value })} placeholder="opcional" /></Campo>
          <Campo label="Peso padrão das questões"><Input type="number" min={1} value={r.peso_padrao ?? ''} onChange={(e) => patchRegras({ peso_padrao: e.target.value })} /></Campo>
        </div>
      </section>

      {/* Liberações */}
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <Secao icon={ShieldCheck} titulo="Liberações para o aluno" desc="Quando cada item fica visível após o envio." tone="warn" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SegCard label="Liberar nota" hint="Quando o aluno vê a pontuação." value={r.liberar_nota} onChange={(v) => patchRegras({ liberar_nota: v })} options={LIB_OPTS} />
          <SegCard label="Liberar gabarito" hint="Respostas corretas e justificativas." value={r.liberar_gabarito} onChange={(v) => patchRegras({ liberar_gabarito: v })} options={LIB_OPTS} />
          <SegCard label="Liberar caderno (PDF)" hint="Download da prova completa." value={r.liberar_caderno} onChange={(v) => patchRegras({ liberar_caderno: v })} options={LIB_OPTS} />
          <SegCard label="Público do caderno" hint="Quem consegue baixar o caderno." value={r.caderno_publico} onChange={(v) => patchRegras({ caderno_publico: v })} options={[{ v: 'todos', label: 'Todos' }, { v: 'passaporte', label: 'Passaporte' }]} />
        </div>
        <div className="mt-3">
          <ToggleRow label="Caderno de questões (sem respostas)" desc="Deixa o aluno baixar a prova sem gabarito antes de iniciar." v={r.enunciado_liberado} on={(v) => patchRegras({ enunciado_liberado: v })} />
        </div>
      </section>
    </div>
  )
}
