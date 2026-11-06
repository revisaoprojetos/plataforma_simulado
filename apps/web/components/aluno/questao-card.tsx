import { QuestaoResolvivel, type QuestaoAluno, type OnResponder } from '@/components/aluno/questao-resolvivel'
import { QuestaoDiscursiva } from '@/components/aluno/questao-discursiva'

/** Escolhe o card certo conforme o tipo da questão (objetiva x discursiva). `onResponder` só vale p/ objetivas. */
export function QuestaoCard({ questao, numero, onResponder }: { questao: QuestaoAluno; numero?: number; onResponder?: OnResponder }) {
  if (questao.tipo === 'discursiva') {
    return (
      <QuestaoDiscursiva
        questao={{
          id: questao.id,
          enunciado: questao.enunciado,
          disciplina: questao.disciplina,
          comentario_professor: questao.comentario_professor,
          favorito: questao.favorito,
        }}
        numero={numero}
      />
    )
  }
  return <QuestaoResolvivel questao={questao} numero={numero} onResponder={onResponder} />
}
