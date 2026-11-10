// Playback em staging: start -> master -> variante -> chave -> heartbeat -> renew -> end, por aluno.
// Mede cada rota separadamente (tags name=playback_start|manifest_master|manifest_variant|hls_key|heartbeat|playback_renew).
//
//   k6 run -e I_KNOW_THIS_IS_STAGING=1 -e API_URL=https://<staging> -e INTEGRATION_KEY=... \
//     -e LESSON_ID=<uuid> -e STUDENTS=200 -e VUS=100 -e DURATION=3m load/staging/playback.js
// Cada iteracao pega um aluno e libera a sessao no fim (end): MAX_CONCURRENT_STREAMS nao estoura se VUS <= STUDENTS.
// Limite de abertura: 60/min por aluno (playbackStart).
import http from 'k6/http';
import { sleep } from 'k6';
import { API, THRESHOLDS, assertStaging, endPlayback, openLesson, pace, renewPlayback, studentSession } from './lib.js';

assertStaging();

const STUDENTS = Number(__ENV.STUDENTS || 200);

export const options = {
  scenarios: {
    watch: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 100),
      duration: __ENV.DURATION || '3m',
      gracefulStop: '10s',
    },
  },
  setupTimeout: '30m',
  thresholds: { ...THRESHOLDS, checks: ['rate>0.995'] },
};

export function setup() {
  if (!__ENV.INTEGRATION_KEY || !__ENV.LESSON_ID) throw new Error('Defina INTEGRATION_KEY e LESSON_ID');
  const tokens = [];
  for (let i = 0; i < STUDENTS; i++) {
    const t = studentSession(i);
    pace();
    if (!t) throw new Error(`sessao de integracao falhou para o aluno ${i} (rode seed-students.js?)`);
    tokens.push(t);
  }
  console.log(`setup ok: ${tokens.length} alunos (o JWT do aluno vale 15m por padrao: setup + DURATION devem caber)`);
  return { tokens };
}

export default function (data) {
  // cada VU usa o proprio aluno (VU-1) para nunca dividir sessoes entre VUs simultaneas
  const i = (__VU - 1) % data.tokens.length;
  const opened = openLesson(data.tokens[i], __ENV.LESSON_ID, i);
  if (!opened) {
    sleep(1);
    return;
  }
  let token = opened.token;
  for (let n = 1; n <= 3; n++) {
    http.post(
      `${API}/progress/heartbeat`,
      JSON.stringify({ seq: n, position: n * 10, rate: 1, quality: '720p', device: 'carga' }),
      {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        tags: { name: 'heartbeat' },
      },
    );
    sleep(Number(__ENV.THINK_S || 2));
  }
  token = renewPlayback(token, i) || token;
  endPlayback(token);
}
