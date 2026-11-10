// Heartbeat em staging: meta 1.000 hb/s POR REPLICA com p95 < 100 ms.
// Cada VU = 1 sessao de reproducao enviando 1 hb/s (10x o player real, que envia a cada ~10 s):
// 1.000 VUs ~ 10.000 alunos assistindo. Renova o token de playback (TTL padrao 5 min) a cada RENEW_S.
//
//   k6 run -e I_KNOW_THIS_IS_STAGING=1 -e API_URL=https://<staging> -e INTEGRATION_KEY=... \
//     -e LESSON_ID=<uuid> -e STUDENTS=1000 -e VUS=1000 -e DURATION=5m load/staging/heartbeat.js
// Para medir UMA replica: escale o servico api para 1 replica no staging (ou aponte API_URL para a replica).
// Com STUDENTS=VUS cada aluno tem 1 sessao (nao precisa alterar MAX_CONCURRENT_STREAMS).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API, THRESHOLDS, abs, assertStaging, hdr, ipOf, pace, startPlayback, studentSession } from './lib.js';

assertStaging();

const VUS = Number(__ENV.VUS || 1000);
const STUDENTS = Math.min(Number(__ENV.STUDENTS || VUS), VUS);
const RENEW_S = Number(__ENV.RENEW_S || 240);
const HB_INTERVAL_S = Number(__ENV.HB_INTERVAL_S || 1);
const accepted = new Counter('heartbeats_accepted');
const renewed = new Counter('playback_renewed');

export const options = {
  scenarios: {
    heartbeats: { executor: 'constant-vus', vus: VUS, duration: __ENV.DURATION || '2m', gracefulStop: '5s' },
  },
  setupTimeout: '30m',
  thresholds: {
    'http_req_duration{name:heartbeat}': THRESHOLDS['http_req_duration{name:heartbeat}'],
    'http_req_failed{name:heartbeat}': THRESHOLDS['http_req_failed{name:heartbeat}'],
    'http_req_duration{name:playback_renew}': THRESHOLDS['http_req_duration{name:playback_renew}'],
    checks: ['rate>0.999'],
  },
};

export function setup() {
  if (!__ENV.INTEGRATION_KEY || !__ENV.LESSON_ID) throw new Error('Defina INTEGRATION_KEY e LESSON_ID');
  const per = Math.ceil(VUS / STUDENTS);
  const sessions = [];
  for (let i = 0; i < STUDENTS; i++) {
    const at = studentSession(i);
    pace();
    if (!at) throw new Error(`sessao de integracao falhou para o aluno ${i} (rode seed-students.js?)`);
    for (let s = 0; s < per && sessions.length < VUS; s++) {
      const { body, res } = startPlayback(at, __ENV.LESSON_ID, i, 'setup_playback');
      if (!body) throw new Error(`playback ${res.status}: ${String(res.body).slice(0, 200)}`);
      sessions.push({ token: body.playbackToken, at: Date.now() });
    }
  }
  console.log(`setup ok: ${sessions.length} sessoes de ${STUDENTS} alunos`);
  return { sessions };
}

let seq = 0;
let phased = false;
let cur = null;

export default function (data) {
  if (!phased) {
    sleep(Math.random() * HB_INTERVAL_S); // desalinha as VUs (sem rajada artificial)
    phased = true;
    cur = { ...data.sessions[(__VU - 1) % data.sessions.length] };
  }
  const started = Date.now();
  if ((started - cur.at) / 1000 > RENEW_S) {
    const r = http.post(`${API}/playback/renew`, '{}', {
      headers: { 'Content-Type': 'application/json', ...hdr(cur.token, ipOf(__VU)) },
      tags: { name: 'playback_renew' },
    });
    if (check(r, { 'renew 200': (x) => x.status === 200 })) {
      cur.token = r.json('playbackToken');
      cur.at = Date.now();
      renewed.add(1);
    }
  }
  seq += 1;
  const r = http.post(
    `${API}/progress/heartbeat`,
    JSON.stringify({ seq, position: seq * HB_INTERVAL_S, rate: 1, quality: '720p', device: 'carga' }),
    {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cur.token}` },
      tags: { name: 'heartbeat' },
    },
  );
  if (check(r, { 'heartbeat 204': (x) => x.status === 204 })) accepted.add(1);
  sleep(Math.max(0, HB_INTERVAL_S - (Date.now() - started) / 1000));
}

export function teardown() {
  const mt = __ENV.METRICS_TOKEN;
  if (!mt) return;
  const queue = () => {
    const t = http.get(abs('/metrics'), { headers: { Authorization: `Bearer ${mt}` } }).body;
    const m = /progress_events_queue_length (\d+)/.exec(t);
    return m ? Number(m[1]) : -1;
  };
  console.log(`fila de progresso ao parar: ${queue()}`);
  sleep(15);
  console.log(`fila de progresso 15 s depois: ${queue()}`);
}
