export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3010';

interface Auth {
  accessToken: string;
  refreshToken: string;
  tenant: string;
  email: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Referência: tokens de acesso ficam em sessionStorage (somem ao fechar a aba). Em produção,
// prefira cookies httpOnly emitidos pelo seu back-end. O token de PLAYBACK nunca é persistido.
const KEY = 'gv.auth';
let auth: Auth | null = load();
let refreshing: Promise<boolean> | null = null;
let onLogout: () => void = () => undefined;

function load(): Auth | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Auth) : null;
  } catch {
    return null;
  }
}

function save(a: Auth | null): void {
  auth = a;
  try {
    if (a) sessionStorage.setItem(KEY, JSON.stringify(a));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* sem storage: a sessão vale só nesta página */
  }
}

export const isLoggedIn = () => auth !== null;
export const currentUser = () => (auth ? { email: auth.email, tenant: auth.tenant } : null);
export const setLogoutHandler = (fn: () => void) => (onLogout = fn);

export async function login(tenant: string, email: string, password: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant, email, password }),
  });
  if (!res.ok) throw new ApiError(res.status, 'Empresa, e-mail ou senha inválidos');
  const t = (await res.json()) as { accessToken: string; refreshToken: string };
  save({ ...t, tenant, email });
}

export async function logout(): Promise<void> {
  const refreshToken = auth?.refreshToken;
  save(null);
  if (refreshToken) {
    await fetch(`${API_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
}

/** Uma única renovação por vez, mesmo com várias requisições recebendo 401 juntas. */
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    if (!auth) return false;
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    }).catch(() => null);
    if (!res?.ok) return false;
    const t = (await res.json()) as { accessToken: string; refreshToken: string };
    save({ ...auth, ...t });
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Baixa um arquivo autenticado (ex.: CSV de analytics) e dispara o salvamento no navegador. */
export async function download(path: string, filename: string): Promise<void> {
  const res = await request(path, {});
  if (!res.ok) throw new ApiError(res.status, `Erro ${res.status} ao baixar`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await request(path, options);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new ApiError(res.status, msg ?? `Erro ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Requisição com o login atual; uma renovação automática se vier 401. */
async function request(
  path: string,
  options: { method?: string; body?: unknown },
): Promise<Response> {
  const call = () =>
    fetch(`${API_URL}/v1${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined && { 'content-type': 'application/json' }),
        ...(auth && { authorization: `Bearer ${auth.accessToken}` }),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res = await call();
  if (res.status === 401 && auth) {
    if (await refresh()) res = await call();
    else {
      save(null);
      onLogout();
    }
  }
  return res;
}
