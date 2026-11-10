export type Cell = string | number | boolean | Date | null | undefined;

/**
 * Neutraliza "injeção de fórmula": planilhas executam células que começam com = + - @ (ou TAB/CR).
 * Nomes de aluno vêm de usuários, então o prefixo ' é obrigatório. Números de verdade não são tocados.
 */
function cell(value: Cell, delimiter: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s.includes(delimiter) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV (RFC 4180) com BOM UTF-8 para o Excel reconhecer acentos. Linhas separadas por CRLF.
 * Use `;` como delimitador para o Excel em português.
 */
export function toCsv<T extends object>(
  rows: T[],
  columns: { header: string; get: (row: T) => Cell }[],
  delimiter = ',',
): string {
  const lines = [
    columns.map((c) => cell(c.header, delimiter)).join(delimiter),
    ...rows.map((r) => columns.map((c) => cell(c.get(r), delimiter)).join(delimiter)),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
