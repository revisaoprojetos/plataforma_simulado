/**
 * Parser SIMPLES de User-Agent (sem dependência). Puro e testável. Serve só para EXIBIÇÃO/triagem
 * no painel de acessos — nunca para decisão de segurança (o UA é falsificável).
 */
export interface UaInfo {
  navegador: string
  so: string
  dispositivo: 'desktop' | 'celular' | 'tablet'
}

export function parseUserAgent(uaRaw: string | null | undefined): UaInfo {
  const ua = String(uaRaw ?? '').slice(0, 400)
  if (!ua) return { navegador: 'Desconhecido', so: 'Desconhecido', dispositivo: 'desktop' }

  // Sistema operacional (iPadOS 13+ se anuncia como Macintosh; sem touch no UA → fica macOS).
  let so = 'Desconhecido'
  if (/iPhone|iPod/i.test(ua)) so = 'iOS'
  else if (/iPad/i.test(ua)) so = 'iPadOS'
  else if (/Android/i.test(ua)) so = 'Android'
  else if (/Windows NT|Windows Phone/i.test(ua)) so = 'Windows'
  else if (/CrOS/i.test(ua)) so = 'ChromeOS'
  else if (/Mac OS X|Macintosh/i.test(ua)) so = 'macOS'
  else if (/Linux|X11/i.test(ua)) so = 'Linux'

  // Navegador (ordem importa: Edge/Opera/Samsung/Chrome-iOS antes do Chrome; Chrome antes do Safari).
  let navegador = 'Outro'
  if (/curl\/|python-requests|bot\b|spider|crawler/i.test(ua)) navegador = 'Automação/Bot'
  else if (/Edg(e|A|iOS)?\//i.test(ua)) navegador = 'Edge'
  else if (/OPR\/|Opera/i.test(ua)) navegador = 'Opera'
  else if (/SamsungBrowser\//i.test(ua)) navegador = 'Samsung Internet'
  else if (/Firefox\/|FxiOS\//i.test(ua)) navegador = 'Firefox'
  else if (/CriOS\//i.test(ua)) navegador = 'Chrome'
  else if (/Chrome\//i.test(ua)) navegador = /; wv\)/i.test(ua) ? 'App/WebView' : 'Chrome'
  else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) navegador = 'Safari'
  else if (/MSIE |Trident\//i.test(ua)) navegador = 'Internet Explorer'
  else if (/Mobile\//i.test(ua) && /AppleWebKit/i.test(ua)) navegador = 'App/WebView' // iOS WebView sem "Safari/"

  let dispositivo: UaInfo['dispositivo'] = 'desktop'
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) dispositivo = 'tablet'
  else if (/Mobile|iPhone|iPod|Android|Windows Phone/i.test(ua)) dispositivo = 'celular'

  return { navegador, so, dispositivo }
}

/** Rótulo curto "Chrome · Windows · Desktop" para a UI. */
export function rotuloAparelho(i: { navegador?: string | null; so?: string | null; dispositivo?: string | null }): string {
  const disp = i.dispositivo === 'celular' ? 'Celular' : i.dispositivo === 'tablet' ? 'Tablet' : i.dispositivo === 'desktop' ? 'Desktop' : null
  return [i.navegador, i.so, disp].filter(Boolean).join(' · ') || 'Desconhecido'
}
