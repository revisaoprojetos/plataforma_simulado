import { QuestaoResolvivel, type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { QuestaoDiscursiva } from '@/components/aluno/questao-discursiva'

/** Escolhe o card certo conforme o tipo da questão (objetiva x discursiva). */
export function QuestaoCard({ questao, numero }: { questao: QuestaoAluno; numero?: number }) {
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
  return <QuestaoResolvivel questao={questao} numero={numero} />
}
