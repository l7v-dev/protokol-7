/**
 * scripts/terminal-theme.mjs
 *
 * Protokol-7 Standart Terminal & Cikti Sablon Motoru (Terminal Theme)
 * Tum betikler ve CLI araclari icin sifir emojili, deterministik
 * ASCII banner, rozet, panel ve tablo sablonlari saglar.
 *
 * Log Standardi: rules/logging-discipline.md (Sifir emoji, standart ASCII etiketler).
 */

export const TERMINAL_WIDTH = 71;

/**
 * Belirtilen seviyede ASCII rozeti uretir.
 * Ornek: [INFO] Baslatiliyor...
 */
export function badge(level, message) {
  const normalizedLevel = String(level).toUpperCase();
  return `[${normalizedLevel}] ${message}`;
}

/**
 * Standart ASCII baslik/banner ciktisi uretir.
 */
export function banner(title, subtitle = null) {
  const titlePad = Math.max(0, Math.floor((TERMINAL_WIDTH - title.length - 2) / 2));
  const centeredTitle = ` ${"=".repeat(titlePad)} ${title} ${"=".repeat(
    TERMINAL_WIDTH - titlePad - title.length - 4
  )} `;

  const lines = [centeredTitle.slice(0, TERMINAL_WIDTH)];
  if (subtitle) {
    const subPad = Math.max(0, Math.floor((TERMINAL_WIDTH - subtitle.length - 2) / 2));
    lines.push(
      ` ${"-".repeat(subPad)} ${subtitle} ${"-".repeat(TERMINAL_WIDTH - subPad - subtitle.length - 4)} `.slice(
        0,
        TERMINAL_WIDTH
      )
    );
  }
  return lines.join("\n");
}

/**
 * Belirtilen karakterle ayirici cizgi uretir.
 */
export function divider(char = "-") {
  return char.repeat(TERMINAL_WIDTH);
}

/**
 * Anahtar-Deger paneli uretir.
 * Ornek:
 * [PANEL BASLIGI]
 *   Anahtar:     Deger
 */
export function panel(title, entries = []) {
  const lines = [`[${title.toUpperCase()}]`];
  const maxKeyLen = entries.reduce((max, [k]) => Math.max(max, k.length), 0);
  const padLen = Math.max(maxKeyLen + 2, 14);

  for (const [key, value] of entries) {
    const paddedKey = `${key}:`.padEnd(padLen);
    lines.push(`  ${paddedKey} ${value}`);
  }
  return lines.join("\n");
}

/**
 * ASCII formatinda duzenli tablo basar.
 */
export function table(headers = [], rows = []) {
  if (headers.length === 0) return "";
  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      if (row[i]) max = Math.max(max, String(row[i]).length);
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

export const Theme = {
  WIDTH: TERMINAL_WIDTH,
  badge,
  banner,
  divider,
  panel,
  table,
};

export default Theme;
