export interface RetentionPoint {
  /** início do trecho, em segundos */
  bucketS: number;
  /** quantos alunos assistiram algum pedaço deste trecho */
  viewers: number;
}

export interface Dropoff {
  /** instante em que a audiência cai */
  atS: number;
  fromViewers: number;
  toViewers: number;
  lostViewers: number;
}

/**
 * Maiores quedas de audiência entre trechos consecutivos (ponto de abandono = onde o aluno parou
 * de assistir). Em empate vence o instante mais cedo. Devolve no máximo `limit` quedas.
 */
export function findDropoffs(curve: RetentionPoint[], limit = 3): Dropoff[] {
  const drops: Dropoff[] = [];
  for (let i = 1; i < curve.length; i++) {
    const lost = curve[i - 1].viewers - curve[i].viewers;
    if (lost > 0) {
      drops.push({
        atS: curve[i].bucketS,
        fromViewers: curve[i - 1].viewers,
        toViewers: curve[i].viewers,
        lostViewers: lost,
      });
    }
  }
  return drops.sort((a, b) => b.lostViewers - a.lostViewers || a.atS - b.atS).slice(0, limit);
}
