import 'server-only'

// Dados de EXEMPLO usados para gerar a PRÉVIA do template (docxtemplater) — sem tocar no .docx editável.
// Escalares no topo (nota, nº de peito…) + arrays para os laços ({#disciplinas}, {#pilares}, {#questoes}).
// Dentro de um laço, o docxtemplater usa o item primeiro (ex.: {nome} = nome da disciplina), senão o topo.
export const DADOS_PREVIA = {
  simulado: 'MARATONA DE SIMULADOS ENAP + AGU · SIMULADO 01 · 17/10/2026',
  numero_peito: '0042',
  nome: 'Ana Beatriz Souza',
  cpf: '123.456.789-00',
  email: 'ana.souza@email.com',
  acertos: '24',
  total_questoes: '30',
  percentual: '80%',
  erros: '6',
  em_branco: '0',
  tempo_usado: '3 h 42 min',
  nota: '8,0',
  gabarito: 'Certo',
  disciplina: 'Direito Constitucional',
  numero: '1',
  enunciado: 'Julgue o item a seguir conforme a CF/1988: a vedação à acumulação remunerada de cargos públicos aplica-se também às autarquias.',
  alternativas: '( ) Certo        ( ) Errado',
  assuntos: '- Constitucional: art. 37 (acumulação de cargos)',
  // Pilares (colunas fixas do bloco "Desempenho por pilar") + seção separada — escalares por frente.
  // _f1/_f2/_f3 = flags de FAIXA (0-49 / 50-80 / 81-100): só a do intervalo do % aparece (igual caderno).
  ls_pct: '45%', ls_acertos: '7', ls_total: '15', ls_f1: true, ls_f2: false, ls_f3: false,
  jur_pct: '70%', jur_acertos: '7', jur_total: '10', jur_f1: false, jur_f2: true, jur_f3: false,
  dout_pct: '100%', dout_acertos: '5', dout_total: '5', dout_f1: false, dout_f2: false, dout_f3: true,
  sec_pct: '60%', sec_acertos: '12', sec_total: '20', sec_f1: false, sec_f2: true, sec_f3: false,
  disciplinas: [
    { nome: 'Direito Constitucional', assuntos: '- Constitucional: art. 37 (acumulação de cargos)', acertos: '4', total: '5', pct: '80%' },
    { nome: 'Direito Administrativo', assuntos: '- Licitações: Lei 14.133/2021', acertos: '3', total: '5', pct: '60%' },
    { nome: 'Processo Civil', assuntos: '- Fazenda Pública em juízo', acertos: '5', total: '5', pct: '100%' },
  ],
  pilares: [
    { nome: 'Lei seca', acertos: '12', total: '15', pct: '80%' },
    { nome: 'Jurisprudência', acertos: '7', total: '10', pct: '70%' },
    { nome: 'Doutrina', acertos: '5', total: '5', pct: '100%' },
  ],
  questoes: [
    { numero: '1', disciplina: 'Direito Constitucional', enunciado: 'Julgue o item a seguir conforme a CF/1988: a vedação à acumulação remunerada de cargos públicos aplica-se também às autarquias.', alternativas: '( ) Certo        ( ) Errado', gabarito: 'Certo' },
    { numero: '2', disciplina: 'Direito Administrativo', enunciado: 'Sobre a Lei 14.133/2021, julgue o item quanto às modalidades de licitação.', alternativas: '( ) Certo        ( ) Errado', gabarito: 'Errado' },
  ],
}
