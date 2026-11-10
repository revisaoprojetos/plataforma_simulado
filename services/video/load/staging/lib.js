// Biblioteca compartilhada dos testes de carga de STAGING (k6). Importada por seed-students.js,
// playback.js, heartbeat.js e live-peak.js. NAO roda sozinha.
//
// REGRAS DURAS (aplicadas no init de cada script via assertStaging()):
//   1. Exige I_KNOW_THIS_IS_STAGING=1.
//   2. Recusa qualquer host *.revisaopge.com.br (e revisaopge.com.br) a menos que
//      ALLOW_PROD_DOMAIN_HOST seja IGUAL ao host do API_URL (override consciente, ex.:
//      "video-api-staging.revisaopge.com.br"). O host de producao "video-api.revisaopge.com.br"
//      e recusado SEMPRE, mesmo com override.
//   3. Nada aqui apaga dados. Alunos de teste usam e-mails ...@load.invalid (dominio reservado).
import http from 'k6/http';
import { check, sleep } from 'k6';

export const API_URL = (__ENV.API_URL || '').replace(/\/+$/, '');
export const API = `${API_URL}/v1`;
export const ORIGIN = __ENV.ORIGIN || ''; // origem permitida da empresa de teste (allowedDomains), se configurada
const PROD_HOSTS = ['video-api.revisaopge.com.br'];

export function hostOf(url) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(url || '');
  return m ? m[1].toLowerCase() : '';
}

/** Trava de seguranca: chamar no init (topo do script), antes de qualquer requisicao. */
export function assertStaging() {
  if (__ENV.I_KNOW_THIS_IS_STAGING !== '1') {
    throw new Error('RECUSADO: defina I_KNOW_THIS_IS_STAGING=1 (este teste so pode rodar em staging).');
  }
  const host = hostOf(API_URL);
  if (!host) throw new Error('RECUSADO: defina API_URL (ex.: https://video-api-staging.exemplo.com).');
  if (PROD_HOSTS.includes(host)) {
    throw new Error(`RECUSADO: ${host} e o host de PRODUCAO. Nao ha override para ele.`);
  }
  const isProdDomain = host === 'revisaopge.com.br' || host.endsWith('.revisaopge.com.br');
  if (isProdDomain && (__ENV.ALLOW_PROD_DOMAIN_HOST || '').toLowerCase() !== host) {
    throw new Error(
      `RECUSADO: ${host} esta sob revisaopge.com.br. Se for mesmo um staging, defina ALLOW_PROD_DOMAIN_HOST=${host}.`,
    );
  }
}

export const STUDENTS = Number(__ENV.STUDENTS || 100);
export const PREFIX = __ENV.STUDENT_PREFIX || 'load';
export const emailOf = (i) => `${PREFIX}-${i}@load.invalid`;

const JSON_H = { 'Content-Type': 'application/json' };

export const ipOf = (i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${(i & 255) || 1}`;

export function hdr(token, ip) {
  return {
    ...(ORIGIN ? { Origin: ORIGIN } : {}),
    ...(ip ? { 'X-Forwarded-For': ip } : {}), // exige TRUST_PROXY>=1 no staging; cada aluno com seu IP
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Chave de integracao -> accessToken do aluno (POST /access/sessions). Limite: 600 req/min por chave. */
export function studentSession(i) {
  const r = http.post(`${API}/access/sessions`, JSON.stringify({ email: emailOf(i) }), {
    headers: { ...JSON_H, ...hdr(__ENV.INTEGRATION_KEY, ipOf(i)) },
    tags: { name: 'setup_session' },
  });
  return r.status === 200 ? r.json('accessToken') : null;
}

/** Abre uma sessao de reproducao (o servidor gera o sessionId). */
export function startPlayback(accessToken, lessonId, i, name = 'playback_start') {
  const r = http.post(`${API}/lessons/${lessonId}/playback`, '{}', {
    headers: { ...JSON_H, ...hdr(accessToken, ipOf(i)) },
    tags: { name },
  });
  return { res: r, body: r.status === 200 ? r.json() : null };
}

export const abs = (u) => (u.startsWith('http') ? u : `${API_URL}${u}`);

/** Pacing para respeitar o limite de integracao (600/min por chave => <= 9 chamadas/s). */
export function pace() {
  sleep(Number(__ENV.SETUP_PACE_S || 0.12));
}

/** Escolhe a 1a variante (ou a pedida em RENDITION) do master. */
export function parseMaster(text) {
  const want = __ENV.RENDITION || '';
  const variants = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return (want && variants.find((v) => v.includes(`/${want}/`))) || variants[0] || null;
}

export function parseKeyUri(variantText) {
  const m = /#EXT-X-KEY:[^\n]*URI="([^"]+)"/.exec(String(variantText));
  return m ? m[1] : null;
}

export function segmentUrls(variantText, max) {
  return String(variantText)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.startsWith('http'))
    .slice(0, max);
}

/** Metas do projeto (RNF10: heartbeat) + metas PROPOSTAS para as demais rotas (ajuste apos a 1a medicao). */
export const THRESHOLDS = {
  'http_req_duration{name:heartbeat}': ['p(95)<100'],
  'http_req_failed{name:heartbeat}': ['rate<0.001'],
  'http_req_duration{name:playback_start}': ['p(95)<400'],
  'http_req_duration{name:playback_renew}': ['p(95)<200'],
  'http_req_duration{name:manifest_master}': ['p(95)<150'],
  'http_req_duration{name:manifest_variant}': ['p(95)<250'],
  'http_req_duration{name:hls_key}': ['p(95)<100'],
  'http_req_failed{name:manifest_master}': ['rate<0.005'],
  'http_req_failed{name:hls_key}': ['rate<0.005'],
};

/**
 * Fluxo de "abrir a aula" de um aluno: start -> master -> variante -> chave (-> N segmentos opcionais).
 * Segmentos vao direto ao S3 (URL assinada) e COBRAM egress: padrao SEGMENTS=0. Use 1-2 so para validar.
 * Devolve { token } ou null se o start falhou.
 */
export function openLesson(accessToken, lessonId, i) {
  const { res, body } = startPlayback(accessToken, lessonId, i);
  if (!check(res, { 'playback 200': (r) => r.status === 200 }) || !body) return null;
  const token = body.playbackToken;
  const bearer = { headers: { Authorization: `Bearer ${token}` } };

  const m = http.get(abs(body.manifestUrl), { ...bearer, tags: { name: 'manifest_master' } });
  if (!check(m, { 'master 200': (r) => r.status === 200 })) return { token };
  const variantPath = parseMaster(m.body);
  if (!variantPath) return { token };

  const v = http.get(abs(variantPath), { ...bearer, tags: { name: 'manifest_variant' } });
  if (!check(v, { 'variante 200': (r) => r.status === 200 })) return { token };

  const keyUri = parseKeyUri(v.body);
  if (keyUri) {
    const k = http.get(abs(keyUri), { ...bearer, tags: { name: 'hls_key' } });
    check(k, { 'chave 200 (16 bytes)': (r) => r.status === 200 && r.body && r.body.byteLength === 16 });
  }
  const nSeg = Number(__ENV.SEGMENTS || 0);
  if (nSeg > 0) {
    for (const u of segmentUrls(v.body, nSeg)) http.get(u, { tags: { name: 'hls_segment_s3' } });
  }
  return { token };
}

export function renewPlayback(token, i) {
  const r = http.post(`${API}/playback/renew`, '{}', {
    headers: { ...JSON_H, ...hdr(token, ipOf(i)) },
    tags: { name: 'playback_renew' },
  });
  check(r, { 'renew 200': (x) => x.status === 200 });
  return r.status === 200 ? r.json('playbackToken') : null;
}

export function endPlayback(token) {
  http.post(`${API}/playback/end`, '{}', {
    headers: { ...JSON_H, Authorization: `Bearer ${token}` },
    tags: { name: 'playback_end' },
  });
}
