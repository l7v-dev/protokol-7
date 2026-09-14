#!/usr/bin/env node
/**
 * scripts/sca-check.mjs
 *
 * Canlı Bağımlılık ve Paket Halüsinasyonu (Slopsquatting) Denetçisi
 * Ajanların önerdiği npm paketlerinin npm registry'de gerçekten var olup olmadığını
 * ve indirme/sürüm geçmişini deterministik olarak doğrular.
 *
 * Log Standardı: rules/logging-discipline.md (Sıfır emoji, standart ASCII etiketler).
 *
 * Kullanım: node scripts/sca-check.mjs <paket-adı> [paket-adı-2 ...]
 */

import { execSync } from "node:child_process";

const packages = process.argv.slice(2);

if (packages.length === 0) {
  console.log("Kullanım: node scripts/sca-check.mjs <paket-adı> [paket-adı-2 ...]");
  process.exit(1);
}

console.log("[INFO] Canlı Paket Kayıt (SCA) Denetimi başlatılıyor...\n");

let hasError = false;

for (const pkg of packages) {
  try {
    const rawOutput = execSync(`npm view ${pkg} name version description time.created --json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const info = JSON.parse(rawOutput);
    console.log(`[VERIFIED] Paket: ${info.name}`);
    console.log(`           Son Sürüm: ${info.version}`);
    console.log(`           Oluşturulma: ${info["time.created"] || "Bilinmiyor"}`);
    console.log(`           Açıklama: ${info.description || "Yok"}\n`);
  } catch (_err) {
    console.error(`[ERROR] Paket bulunamadı: ${pkg}`);
    console.error(`        Hata: Bu paket resmi npm kayıt defterinde mevcut değil!`);
    console.error(`        Ref: verification-pipeline.md §2 — Bu bağımlılık projeye eklenemez.\n`);
    hasError = true;
  }
}

if (hasError) {
  console.error("[FAIL] Doğrulanmamış bağımlılıklar tespit edildi. İcra durdurulmalıdır.");
  process.exit(1);
} else {
  console.log("[PASS] Tüm bağımlılıklar resmi kayıt defterinde doğrulandı.");
}
