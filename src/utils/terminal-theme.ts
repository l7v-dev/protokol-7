/**
 * src/utils/terminal-theme.ts
 *
 * Protokol-7 Standart Terminal & Cikti Sablon Motoru (Terminal Theme)
 * Sifir emojili, deterministik ASCII banner, rozet, panel ve tablo sablonlari saglar.
 *
 * Log Standardi: rules/logging-discipline.md (Sifir emoji, standart ASCII etiketler).
 */

export const TERMINAL_WIDTH = 71;

export type LogLevel =
  | "INFO"
  | "OK"
  | "PASS"
  | "WARN"
  | "ERROR"
  | "FAIL"
  | "VERIFIED"
  | "STALL"
  | "VETO";

export function badge(level: LogLevel | string, message: string): string {
  const normalizedLevel = String(level).toUpperCase();
  return `[${normalizedLevel}] ${message}`;
}

export function banner(title: string, subtitle?: string): string {
  const titlePad = Math.max(0, Math.floor((TERMINAL_WIDTH - title.length - 2) / 2));
  const centeredTitle = ` ${"=".repeat(titlePad)} ${title} ${"=".repeat(
    TERMINAL_WIDTH - titlePad - title.length - 4
  )} `;

  const lines = [centeredTitle.slice(0, TERMINAL_WIDTH)];
  if (subtitle) {
    const subPad = Math.max(0, Math.floor((TERMINAL_WIDTH - subtitle.length - 2) / 2));
    lines.push(
      ` ${"-".repeat(subPad)} ${subtitle} ${"-".repeat(
        TERMINAL_WIDTH - subPad - subtitle.length - 4
      )} `.slice(0, TERMINAL_WIDTH)
    );
  }
  return lines.join("\n");
}

export function divider(char = "-"): string {
  return char.repeat(TERMINAL_WIDTH);
}

export function panel(title: string, entries: Array<[string, string]>): string {
  const lines = [`[${title.toUpperCase()}]`];
  const maxKeyLen = entries.reduce((max, [k]) => Math.max(max, k.length), 0);
  const padLen = Math.max(maxKeyLen + 2, 14);

  for (const [key, value] of entries) {
    const paddedKey = `${key}:`.padEnd(padLen);
    lines.push(`  ${paddedKey} ${value}`);
  }
  return lines.join("\n");
}

export function table(headers: string[], rows: (string | number)[][]): string {
  if (headers.length === 0) return "";
  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      if (row[i] !== undefined) max = Math.max(max, String(row[i]).length);
    }
    return max + 2;
  });

  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join("| ");
  const sepLine = colWidths.map((w) => "-".repeat(w)).join("+-");
  const rowLines = rows.map((row) =>
    row.map((cell, i) => String(cell ?? "").padEnd(colWidths[i])).join("| ")
  );

  return [headerLine, sepLine, ...rowLines].join("\n");
}

export const TerminalTheme = {
  WIDTH: TERMINAL_WIDTH,
  badge,
  banner,
  divider,
  panel,
  table,
};

export default TerminalTheme;
