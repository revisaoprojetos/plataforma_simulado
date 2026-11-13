/** Anexa access_token a uma URL (puro, sem node:crypto — pode ser usado em componentes client). */
export function comTokenOO(url: string, token: string | null): string {
  if (!token) return url
  return url + (url.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token)
}
