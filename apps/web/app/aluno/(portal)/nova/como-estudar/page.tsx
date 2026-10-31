// Como Estudar (novo) — ComoEstudarRevisao. Tela de menu (sem caminho).
// Método em 4 passos + 12 dicas (filtro por categoria) + atalhos "Para colocar em prática".
// CONTEÚDO DE EXEMPLO — marcado com TODO(dados). Layout fiel ao canvas.
import { Hero, PageHeader, Card, Soft, Grid, Row, Col, H2, H3, P, Btn, Chips, IconBox, Eyebrow } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'

export const dynamic = 'force-dynamic'

// ——— método em uma linha: 4 contatos ———
const PASSOS = [
  { n: 1, t: 'PDFULL', s: 'no dia da aula' },
  { n: 2, t: 'LegProc', s: 'logo em seguida' },
  { n: 3, t: 'Revisão', s: '1 semana depois' },
  { n: 4, t: 'Questões', s: '2 semanas depois' },
]

// ——— 12 dicas (TODO(dados): ligar ao CMS de dicas por tenant) ———
type Dica = { cat: string; icon: IconName; titulo: string; corpo: string; checks: string[] }
const DICAS: Dica[] = [
  { cat: 'Método Revisão', icon: 'spark', titulo: 'Uma aula vira quatro estudos', corpo: 'No método do Revisão, cada aula passa por quatro contatos: o PDFULL no dia, o LegProc logo em seguida, a Revisão uma semana depois e as questões duas semanas depois.', checks: ['Não pule a Revisão: é ela que segura o conteúdo até as questões.', 'Se atrasar, recalcule em vez de acumular.'] },
  { cat: 'Método Revisão', icon: 'file', titulo: 'O PDF é o centro do estudo', corpo: 'O PDFULL é a leitura principal. A videoaula é opcional: use para reforçar um tema que ficou difícil, não para substituir a leitura.', checks: ['Leia no seu ritmo, sem correr.', 'Marque o que precisa voltar com a cor de Revisar.'] },
  { cat: 'Método Revisão', icon: 'scale', titulo: 'Lei seca todo dia, em doses curtas', corpo: 'O LegProc da aula fixa o texto da lei que caiu no PDF. Blocos curtos e frequentes rendem mais do que uma maratona no fim de semana.', checks: ['Leia o artigo inteiro, não só o trecho grifado.', 'Volte aos grifos do Revisão antes das questões.'] },
  { cat: 'Rotina', icon: 'cal', titulo: 'Seja honesto com as suas horas', corpo: 'Um cronograma que cabe na sua semana é melhor do que um ideal que você não cumpre. Informe as horas que você realmente tem em cada dia.', checks: ['Dias corridos podem ter menos horas.', 'Mudou a rotina? Ajuste a partir de uma data.'] },
  { cat: 'Rotina', icon: 'flame', titulo: 'Constância vence intensidade', corpo: 'Estudar um pouco todos os dias mantém o conteúdo vivo. A sequência de dias nas Ligas ajuda a não quebrar o ritmo.', checks: ['Defina um horário fixo para começar.', 'Em dia ruim, faça ao menos uma meta curta.'] },
  { cat: 'Rotina', icon: 'clock', titulo: 'Pausas também são estudo', corpo: 'Blocos de concentração com pausas curtas cansam menos e rendem mais. Durma bem antes de simulados e provas.', checks: ['Faça uma pausa a cada 50 a 90 minutos.', 'Afaste o celular durante a meta.'] },
  { cat: 'Leitura e grifo', icon: 'pen', titulo: 'Cada cor tem um significado', corpo: 'Use as cores de marcação com critério: Importante para o que é central, Revisar para o que precisa voltar, Conceito para definições, Dúvida para o que não ficou claro e Exceção para as pegadinhas.', checks: ['Grife menos e escolha melhor.', 'Dúvida marcada vira pergunta na Central de Dúvidas.'] },
  { cat: 'Leitura e grifo', icon: 'zoom', titulo: 'Leia com uma pergunta na cabeça', corpo: 'Antes de cada tópico, pergunte o que a banca poderia cobrar dali. A leitura fica ativa e o grifo fica mais preciso.', checks: ['Leia o sumário da aula antes de começar.', 'Termine o tópico explicando para si mesmo.'] },
  { cat: 'Revisão', icon: 'bookmark', titulo: 'Monte o caderno enquanto estuda', corpo: 'Mande para o seu caderno o trecho que você errou, o artigo que confunde e o julgado que sempre cai. Na reta final, o caderno vira o seu material de revisão.', checks: ['Use um caderno por disciplina ou por tema.', 'Revise o caderno de erros toda semana.'] },
  { cat: 'Questões e simulados', icon: 'qbook', titulo: 'Questão errada é a mais valiosa', corpo: 'Depois de cada bloco de questões, leia o comentário de todas as que errou e descubra a origem do erro: lei seca, doutrina ou jurisprudência.', checks: ['Volte ao trecho do material ligado à questão.', 'Guarde a questão no caderno de erros.'] },
  { cat: 'Questões e simulados', icon: 'target', titulo: 'Simulado é treino de prova', corpo: 'Faça os simulados no tempo da prova, sem pausas e sem consulta. O diagnóstico por disciplina e assunto mostra onde investir as próximas horas.', checks: ['Analise o resultado no mesmo dia.', 'Compare a sua nota com a sua própria evolução.'] },
  { cat: 'Dicas da plataforma', icon: 'play', titulo: 'Continuar estudando', corpo: 'No Meu painel de estudos, o botão Continuar estudando abre a meta do dia direto no material. Ao concluir, a próxima meta abre sozinha.', checks: ['O cronômetro discreto mede o seu tempo.', 'Pausou? Continue de onde parou.'] },
]

const FILTROS = ['Todas 12', 'Método Revisão 3', 'Rotina 3', 'Leitura e grifo 2', 'Revisão 1', 'Questões e simulados 2', 'Dicas da plataforma 1']

export default function ComoEstudarPage() {
  return (
    <>
      <PageHeader
        eyebrow="Para todos os alunos"
        title="Como Estudar"
        sub="Dicas do método Revisão, de rotina, de revisão e de como aproveitar a plataforma."
        right={<Btn kind="secondary" icon="video">Assistir o módulo em vídeo</Btn>}
      />

      {/* O método em uma linha */}
      <Hero>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 28 }}>
          <Col gap={10} style={{ maxWidth: 440 }}>
            <Eyebrow color="var(--gold)">O método em uma linha</Eyebrow>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.12 }}>Uma aula, quatro contatos com o conteúdo</h2>
            <P size={13.5}><span style={{ color: '#E6DEFF' }}>É assim que o seu Cronograma Adaptativo distribui cada aula ao longo das semanas.</span></P>
          </Col>
          <Grid cols={4} gap={12} style={{ flex: 1, minWidth: 420 }}>
            {PASSOS.map((p) => (
              <div key={p.n} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', padding: '14px 14px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'var(--gold)', color: 'var(--goldInk)', fontSize: 13, fontWeight: 800 }}>{p.n}</span>
                <div style={{ marginTop: 12, fontSize: 15, fontWeight: 800, color: '#fff' }}>{p.t}</div>
                <div style={{ fontSize: 12, color: '#C9BEF0' }}>{p.s}</div>
              </div>
            ))}
          </Grid>
        </Row>
      </Hero>

      {/* Todas as dicas + filtro por categoria */}
      <Col gap={16}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <H2>Todas as dicas</H2>
          {/* TODO(dados): tornar o filtro interativo (client) ligando às categorias reais */}
          <Chips items={FILTROS} active={0} />
        </Row>

        <Grid min={300} gap={16}>
          {DICAS.map((d, i) => (
            <Card key={i} style={{ gap: 12 }}>
              <Row gap={10}>
                <IconBox icon={d.icon} bg="var(--peachBg)" fg="var(--accentInk)" s={34} />
                <Eyebrow>{d.cat}</Eyebrow>
              </Row>
              <H3>{d.titulo}</H3>
              <P>{d.corpo}</P>
              <Soft pad={12} style={{ gap: 8, marginTop: 'auto' }}>
                {d.checks.map((c, k) => (
                  <Row key={k} gap={8} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <Icon n="check" size={14} style={{ color: 'var(--ok)', marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)' }}>{c}</span>
                  </Row>
                ))}
              </Soft>
            </Card>
          ))}
        </Grid>
      </Col>
    </>
  )
}
