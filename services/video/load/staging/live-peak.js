// "Pico de aula ao vivo": N alunos abrem o MESMO video quase ao mesmo tempo (ex.: 2.000 alunos em 60 s)
// e mandam heartbeat a cada HB_INTERVAL_S (padrao 10 s, como o player real) por HOLD_S segundos.
// Estressa start + master + variante + chave + Redis de sessoes/rate limit com todos na mesma aula.
//
//   k6 run -e I_KNOW_THIS_IS_STAGING=1 -e API_URL=https://<staging> -e INTEGRATION_KEY=... \
//     -e LESSON_ID=<uuid> -e STUDENTS=2000 -e RAMP_S=60 -e HOLD_S=120 load/staging/live-peak.js
// Requisitos: STUDENTS alunos criados (seed-students.js), 1 sessao cada (nao altera MAX_CONCURRENT_STREAMS).
// Atencao: a integracao limita 600 chamadas/min por chave: 2.000 alunos levam ~3,5 min so no setup, e o JWT do
// aluno vale 15 min (JWT_ACCESS_TTL). Para muitos milhares, eleve o TTL e/ou o limite SO no staging.
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API, THRESHOLDS, assertStaging, endPlayback, openLesson, pace, renewPlayback, studentSession } from './lib.js';

assertStaging();

const N = Number(__ENV.STUDENTS || 1000);
const RAMP_S = Number(__ENV.RAMP_S || 60);
const HOLD_S = Number(__ENV.HOLD_S || 120);
const HB_S = Number(__ENV.HB_INTERVAL_S || 10);
const opened = new Counter('live_opened');
const refused = new Counter('live_refused');

export const options = {
  scenarios: {
    // Exatamente ~N aberturas em RAMP_S (taxa constante de chegada) = "todo mundo entra de uma vez".
    peak: {
      executor: 'constant-arrival-rate',
      rate: Math.max(1, Math.round(N / RAMP_S)),
      timeUnit: '1s',
      duration: `${RAMP_S}s`,
      preAllocatedVUs: Math.min(N, 500),
      maxVUs: N,
      gracefulStop: `${HOLD_S + 60}s`,
    },
  },
  setupTimeout: '30m',
  thresholds: { ...THRESHOLDS, live_refused: ['count<1'], checks: ['rate>0.995'] },
};

export function setup() {
  if (!__ENV.INTEGRATION_KEY || !__ENV.LESSON_ID) throw new Error('Defina INTEGRATION_KEY e LESSON_ID');
  const tokens = [];
  for (let i = 0; i < N; i++) {
    const t = studentSession(i);
    pace();
    if (!t) throw new Error(`sessao de integracao falhou para o aluno ${i} (rode seed-students.js?)`);
    tokens.push(t);
  }
  console.log(`setup ok: ${tokens.length} alunos prontos para entrar em ${RAMP_S}s`);
  return { tokens };
}

export default function (data) {
  const i = exec.scenario.iterationInTest % data.tokens.length;
  const o = openLesson(data.tokens[i], __ENV.LESSON_ID, i);
  if (!o) {
    refused.add(1);
    return;
  }
  opened.add(1);
  let token = o.token;
  let seq = 0;
  let sinceRenew = 0;
  for (let t = 0; t < HOLD_S; t += HB_S) {
    sleep(HB_S);
    seq += 1;
    sinceRenew += HB_S;
    const r = http.post(
      `${API}/progress/heartbeat`,
      JSON.stringify({ seq, position: seq * HB_S, rate: 1, quality: '720p', device: 'carga' }),
      {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        tags: { name: 'heartbeat' },
      },
    );
    check(r, { 'heartbeat 204': (x) => x.status === 204 });
    if (sinceRenew >= 240) {
      // o token de playback vale 5 min (PLAYBACK_TOKEN_TTL)
      token = renewPlayback(token, i) || token;
      sinceRenew = 0;
    }
  }
  endPlayback(token);
}
