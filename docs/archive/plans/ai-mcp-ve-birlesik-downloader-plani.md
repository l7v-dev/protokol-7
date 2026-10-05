# Yapay Zeka Ajanları İçin Yerel Stdio MCP Sunucusu ve Birleşik İndirici Planı

Bu plan, Protokol-7 projesinin AI ajanları tarafından sıfır sürtünmeyle kullanılabilmesini sağlayacak Yerel Stdio Model Context Protocol (MCP) sunucusunun geliştirilmesini (P1) ve parçalanmış Wikipedia indiricilerinin tek bir yüksek performanslı indirici altında birleştirilmesini (P1 Downloader) kapsar.

## Hedefler
1. Protokol-7 bünyesindeki tüm kazıma, ayıklama ve damıtma aktörlerini (Cheerio, Playwright, ArXiv, PDF, SERP, Sitemap, MarkdownReader vb.) standart JSON-RPC 2.0 stdio MCP sunucusu (`src/mcp/protokol-mcp-server.ts`) üzerinden dışa açmak.
2. AI ajanlarının (Claude Desktop, Cursor, Antigravity, Cline) sistemi doğrudan bir araç seti olarak çalıştırabilmesini sağlamak.
3. Çalışan arka plan sürecini (PID 1589526) indirici aşamasına geçildiğinde güvenli bir şekilde `SIGTERM` ile durdurmak.
4. Çift başlı Wikipedia indiricilerini (`scripts/download-wikipedia-drive.mjs` ve `scripts/wikipedia_pipeline/downloader.py`) tek bir birleşik ve in-flight MD5 hesaplayan yüksek hızlı indiriciye dönüştürmek.

## Değişiklik Yapılacak Dosyalar
- `src/mcp/protokol-mcp-server.ts` (Yeni)
- `tests/protokol-mcp-server.test.ts` (Yeni)
- `package.json` (Güncelleme - `mcp:server` betiği)
- `scripts/wikipedia_pipeline/downloader.py` (Güncelleme - In-flight MD5 ve CLI)
- `scripts/download-wikipedia-drive.mjs` (Konsolidasyon / Kaldırma)
- `TASKS.md` (Güncelleme)
- `context/architecture-schema.md` (Güncelleme)

## Doğrulama Planı
- `npm run typecheck`
- `npm run test`
- `npm run verify`
- `npm run doctor`
- `npm run bigdata:test`
- Stdio JSON-RPC girdi/çıktı testi
