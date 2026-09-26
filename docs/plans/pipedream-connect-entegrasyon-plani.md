# Pipedream Connect Entegrasyon Plani

Bu belge, **protokol-7** microservice mimarisine Pipedream Connect SDK ve REST/MCP API katmaninin entegre edilmesine iliskin teknik plani tanimlar.

## 1. Mimari Hedef ve Baglam

- **Proje Kimligi**: `proj_zNsBAEe`
- **Ortam (Environment)**: `production`
- **Resmi Referans**: [Pipedream Connect Quickstart](https://pipedream.com/docs/connect/quickstart)
- **Paket**: `@pipedream/sdk` (v3.1.6)

Pipedream Connect entegrasyonu asagidaki temel yetenekleri saglar:
1. **Connect Token Uretimi**: Son kullanicilar (`external_user_id`) icin kisa omurlu oturum token'i ve iframe/popup baglanti URL'si olusturma.
2. **Hesap Yonetimi**: Kullanicilarin bagladigi 3.000+ servis hesabini listeleme, sorgulama ve silme.
3. **MCP / Tool Entegrasyonu**: Pipedream uzaktan MCP sunucusu (`https://remote.mcp.pipedream.net/v3`) uzerinden arac cagrilari icin header ve yetkilendirme profili saglama.
4. **CLI ve Betik Calistirma**: Gelistiricinin terminal uzerinden ortam testi, token uretimi ve hesap denetimi yapabilmesi.

## 2. Dosya Plani ve Sorumluluk Matrisi

| Dosya Yolu | Sorumluluk |
|---|---|
| `src/integrations/pipedream-connect.ts` | Pipedream Connect SDK istemcisi sarmalayicisi (`PipedreamConnectService`), token uretici, MCP config olusturucu. |
| `src/core/server.ts` | HTTP REST endpoint'leri (`/api/v1/pipedream/*`). |
| `src/index.ts` | Disa aktarilan modullere `PipedreamConnectService` ve `globalPipedreamConnect` eklenmesi. |
| `.env.example` | Pipedream kimlik dogrulama ve proje yapilandirma degiskenleri sablonu. |
| `scripts/pipedream-cli.mjs` | Komut satiri betigi (status, token, accounts, actions). |
| `package.json` | `@pipedream/sdk` bagimligi ve `npm run pipedream` komutu. |
| `tests/pipedream-connect.test.ts` | Servis, REST endpoint'leri ve token dogrulama testleri. |
| `context/architecture-schema.md` | Entegrasyon katmaninin ve dosya haritasinin guncellenmesi. |

## 3. Guvenlik ve Calisma Kurallari

1. **Guvenli Varsayilanlar**: `PIPEDREAM_PROJECT_ID` tanimli degilse otomatik olarak `proj_zNsBAEe` ve `PIPEDREAM_ENVIRONMENT=production` degerleri kullanilir.
2. **Gizli Anahtar Korunumu**: `PIPEDREAM_CLIENT_SECRET` asla yanit govdesinde veya istemciye gonderilen paketlerde acik edilmez.
3. **SSRF ve Ag Yalitimi**: Tum Pipedream API istekleri HTTPS uzerinden yurutulur.
4. **Sifir Emoji & Buzzword Disiplini**: Loglarda ve kod yorumlarinda emoji ve pazarlama terimleri kullanilmaz.
