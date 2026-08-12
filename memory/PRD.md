# PRD — GOD OF WAR (Gaming Guild Management)

## Original Problem Statement
Build a full-stack Gaming Guild Management App (rebranded "GOD OF WAR"): Leaderboard, Commanders list, Points tracking/adding, Member management grouped by alliances, and Events management. Midnight Red dark theme. Role-based JWT Auth (Admin, Edit, View), Excel export, 8-language i18n (TR, EN, RU, DE, FR, ES, KO, AR).

## Tech Stack
- Frontend: React + react-i18next + SWR + Tailwind + Shadcn/ui + lucide-react
- Backend: FastAPI + Motor (MongoDB) + openpyxl + JWT (PyJWT)
- Auth: JWT (7-day, localStorage `ol_token`)

## User Preferences (Locked)
- Language: **Turkish** (user communicates in TR)
- Theme: Midnight Red dark


- **[2026-02] Event Banner Hero + Trash Purge Butonu — DONE**:
  1. **Event Banner Hero View** (`pages/Events.jsx`):
     - Etkinlik kartına `banner_url` varsa üstte 120px yüksekliğinde tam-genişlik hero image render ediliyor: `<img object-cover>` + dikey gradient overlay (`rgba(10,0,21,0) → 0.92`) + alt-solda Cinzel font ile etkinlik adı beyaz gölgeli.
     - Kartın layout'u koşullu: `banner_url` varsa flex-col (banner + content bloğu), yoksa mevcut flex-row korunuyor.
     - `id={event-{id}}` anchor eklendi — Telegram deep-link `#event-{id}` doğrudan bu karta scroll edecek.
  2. **Trash Purge Şimdi Butonu**:
     - Backend `routes/vip.py`: `POST /api/vip/trash/purge-now` (admin-only) endpoint eklendi; cron endpoint'iyle paylaşılan `_do_purge()` helper'ı kullanıyor.
     - Frontend `pages/Dashboard.jsx`: Yeni `TrashPurgeCard` bileşeni "Firebase Analitik" grid'inin yanında. Açıklama + son sonuç bloğu (yeşil/kırmızı) + kırmızı "🗑️ Trash Purge Şimdi" butonu. Tıklandığında `api.post("/vip/trash/purge-now")` → `{purged_threads, replies_removed, votes_removed}` toast + inline sonuç.
  - **Doğrulama**: `POST /api/vip/trash/purge-now` unauth → 401, admin → 200 `{purged_threads:0,...}` ✅ · Webpack compiled successfully ✅



- **[2026-02] 4 Feature Combined — DONE**:
  1. **Commander & Event Görselleri**:
     - Event backend: `Event/EventCreate/EventUpdate` modellerine `banner_url: Optional[str]` eklendi.
     - `Events.jsx` `EventForm`: import ImageDropzone, `banner` state, JSX'te `<ImageDropzone purpose="event" max={1} compact />` + submit body'ye `banner_url`. Test: `POST /api/events` `banner_url` doğru kaydediyor.
     - Commanders: Zaten kapsamlı çok görselli custom uploader mevcut (`handleMultiFiles`, `MAX_IMAGES`, `fileInputRef`), aynı ImageDropzone eklemek çakışma yaratır — mevcut uploader zaten "başka hiçbir şeyi değiştirme" kısıtına uygun şekilde görsel yüklemeyi sağlıyor.
  2. **VIP Öncelik**:
     - Backend `routes/vip.py`: `ThreadCreate.priority` (yuksek|normal|dusuk, default normal), `GET /vip/threads?priority=` filtre param, aggregation pipeline pinned > yuksek > normal > dusuk > created_at sıralaması.
     - Frontend `VipSupport.jsx`: `NewThreadDialog` içinde 3 pill (Yüksek=kırmızı, Normal=sarı, Düşük=yeşil), yeni `PriorityBadge` bileşeni ThreadCard'da renkli rozet olarak render.
     - Doğrulama: `POST` with `priority:"yuksek"` → 200, `GET ?priority=yuksek` → sadece o thread'i döndürüyor.
  3. **Telegram Deep-Link**: `send_event_notification()` opsiyonel `event_id` parametresi aldı; `PUBLIC_BASE_URL` (fallback `https://titanxis.com`) + `/etkinlikler#event-{id}` deep-link ekliyor. `server.py`'de POST /events çağrısı bu param'ı gönderiyor.
  4. **Auto-Purge Cron**: `.emergent/crons.yml` içine `purge-vip-trash` girdisi (`30 2 * * *` — her gün 02:30 UTC = 05:30 TR), `{{BASE_URL}}/api/cron/vip-trash-purge` POST. Backend endpoint zaten mevcuttu, sadece cron kaydı eklendi.



- **[2026-02] Telegram Grup/Kanal Bildirimleri — DONE**:
  - `.env`: `TELEGRAM_CHANNEL_ID=-1003597221954` eklendi.
  - **Yeni etkinlik bildirimi**: `POST /api/events` (server.py `create_event`) sonuna `send_event_notification()` fire-and-forget çağrısı eklendi — `TELEGRAM_CHANNEL_ID` set olduğunda kanala `🎉 Yeni Etkinlik!` mesajı gider.
  - **SvS başlangıç bildirimi**: `_svs_worker()` artık `⚔️ SvS başlıyor! Hazırlanın!` mesajını hem `/svs` komutunu veren sohbete hem de `TELEGRAM_CHANNEL_ID` kanalına gönderiyor (duplicate önleme: chat_id == channel ise tek gönderi).
  - **Günlük 08:00 (TR) brifingi**: Yeni `send_daily_briefing()` fonksiyonu `send_message()`'e formatlı bir mesaj gönderiyor — `🌅 Günaydın TiTaNXiS!` + yaklaşan 5 etkinlik listesi. `POST /api/cron/telegram-daily-briefing` endpoint'i tetikliyor.
  - **Cron entry** `/app/.emergent/crons.yml`: `telegram-daily-briefing` — cron `0 5 * * *` (05:00 UTC = 08:00 TR), `{{BASE_URL}}/api/cron/telegram-daily-briefing` POST, `enabled: true`.
  - **Doğrulama**: `/api/telegram/status` → `{configured:true, channel_configured:true}` ✅ · `POST /api/cron/telegram-daily-briefing` → `{sent:true}` HTTP 200 ✅ · Backend log: `POST https://api.telegram.org/bot.../sendMessage → HTTP 200 OK` (mesaj gerçekten kanala teslim edildi) ✅



- **[2026-02] Telegram Bot Canlı @TiTaNXiS_BoT — DONE**:
  - **Token**: `TELEGRAM_BOT_TOKEN=8982244615:AAHaaDpF5UefxNK3ZOPzwIQAoRcAx-s-634` `.env`'e eklendi, backend restart edildi.
  - **Webhook registered**: `POST setWebhook → {url: "https://oyun-loncasi.emergent.host/api/telegram/webhook", pending_update_count: 0, allowed_updates: ["message"]}` (getWebhookInfo doğrulandı).
  - **Bot kimliği** (getMe): `id=8982244615, username="TiTaNXiS_BoT", first_name="TiTaNXiS", can_join_groups=true`.
  - **Status endpoint** (`GET /api/telegram/status`): `{configured: true, channel_configured: false}`.
  - **Simulasyon** (`POST /api/telegram/webhook`): `/start`, `/yardim` her ikisi de 200 OK.
  - **Multilingual (DeepL)**: `reply_ml()` wrapper her cevap için gelen mesajın dilini DeepL ile algılıyor; TR ise orijinal, değilse cevabı hedef dile çeviriyor.
  - **Markdown fix**: `/yardim` metnindeki italic wrapper `_(veya /svs\_cancel)_` altını çizme escape'i ile Markdown parser çakışıyordu → Telegram BadRequest. İtalic wrapper'lar kaldırıldı, alias notları düz metin olarak parantez içinde bırakıldı — outbound send artık başarılı.
  - **Bekleyen (opsiyonel)**: `TELEGRAM_CHANNEL_ID` env eklerse yeni etkinlik oluşturulduğunda o kanala otomatik duyuru gider (`send_event_notification` hook hazır).



- **[2026-02] Telegram Bot @TiTaNXiS_BoT — DONE**:
  - **Yeni dosya** `/app/backend/telegram_bot.py`:
    - `python-telegram-bot==22.8` yüklendi (`pip install "python-telegram-bot>=20.0"`).
    - Komutlar: `/start`, `/yardim`, `/siralama` (MongoDB `members` koleksiyonundan `bireysel_guc` desc top 5), `/guc <isim>` (regex ile üye arama), `/etkinlik` (aktif events `archived != true`), `/svs HH:MM` (asyncio task ile bir defalık hatırlatıcı; TR TZ = UTC+3), `/svs_iptal` (aktif hatırlatıcıyı cancel eder).
    - `send_event_notification()` — yeni etkinlik oluşturulduğunda `TELEGRAM_CHANNEL_ID` (opsiyonel env) varsa kanala mesaj gönderir.
    - Modül-seviye `_svs_tasks: dict[int, asyncio.Task]` bir sohbete tek aktif hatırlatıcı sınırlaması; task cancel + await asyncio.sleep pattern'i.
    - **Graceful degradation**: `TELEGRAM_BOT_TOKEN` boşsa `init_bot()` uyarı logluyor, tüm gönderim fonksiyonları no-op oluyor — app çökmeden çalışıyor.
  - **Backend server.py**:
    - `from telegram_bot import init_bot, setup_webhook, process_update, send_event_notification` + `init_bot(db)` çağrısı module load'da.
    - `POST /api/telegram/webhook` — Telegram güncellemelerini alır, `process_update()` çağırır, her zaman `{ok:true}` döner (retry storm önleme).
    - `GET /api/telegram/status` — admin izleme (`configured`, `channel_configured`).
    - `startup()` fonksiyonuna `await setup_webhook()` çağrısı eklendi (token varsa Telegram'a webhook URL'sini POST eder).
  - **Env değişkenleri** (`/app/backend/.env`): `TELEGRAM_BOT_TOKEN=` (kullanıcı doldurmalı) + `TELEGRAM_WEBHOOK_URL=https://oyun-loncasi.emergent.host/api/telegram/webhook`.
  - **Doğrulama**: `GET /api/telegram/status` → `{configured:false, channel_configured:false}` ✅ · `POST /api/telegram/webhook` boş payload ile 200 ✅ · `_parse_hhmm("20:00")→(20,0), "25:99"→None` ✅ · Import smoke test tüm handler'ları görüyor ✅ · Backend log: "TELEGRAM_BOT_TOKEN not set — Telegram bot disabled." (beklenen).
  - **Bekleyen**: Kullanıcı `TELEGRAM_BOT_TOKEN` değerini `/app/backend/.env`'e girip backend'i restart edecek — sonra bot Telegram'a `setWebhook` isteği atacak ve komutlar canlanacak.



- **[2026-02] Emergent Object Storage — Görsel Yükleme Entegrasyonu — DONE**:
  - **Backend altyapı** (`/app/backend/routes/uploads.py`):
    - Emergent object storage playbook'una göre `init_storage()` startup'ta minted, session-scoped key yeniden kullanılır (`force=True` ile stale key recovery).
    - `POST /api/uploads/image?purpose={vip|commander|event|misc}` — auth zorunlu, 8MB limit, sadece jpg/jpeg/png/webp/gif. UUID path: `titanxis/uploads/{user_id}/{uuid}.{ext}`. Meta MongoDB `files` koleksiyonuna kaydediliyor (source of truth).
    - `GET /api/uploads/{file_id}` — public serve, backend proxy'liyor, doğru Content-Type + 1yıl immutable Cache-Control. `<img src>` doğrudan tüketiyor (blob fetch gerekmiyor çünkü read public).
    - `DELETE /api/uploads/{file_id}` — admin-only soft-delete (storage API'de delete yok, DB flag).
    - Startup'ta `init_storage()` çağrısı `server.py`'ye eklendi + `EMERGENT_LLM_KEY` `backend/.env`'e alındı.
  - **Reusable frontend component** (`/app/frontend/src/components/ImageDropzone.jsx`):
    - Sürükle-bırak + click-to-select, çoklu dosya, canlı önizleme + kaldır butonu, 8MB / MIME / max-count validation, toast bildirimleri.
    - Props: `purpose`, `value`, `onChange`, `max`, `compact`.
    - Data-testid: `image-dropzone-{purpose}`, `attachment-preview-{id}`, `attachment-remove-{id}`.
  - **VIP entegrasyonu** (`VipSupport.jsx` + `routes/vip.py`):
    - `ThreadCreate` + `ReplyCreate` modellerine `attachments: List[str]` (file_ids).
    - `NewThreadDialog` içine full-size dropzone (max 6), reply alanına compact dropzone (max 4).
    - `ThreadCard` alt satırda 📎 sayaç, `ThreadDetailDialog` içinde thread body altında ve her reply altında görsel grid'i, yeni sekmede tıklanabilir.
  - **Doğrulama (curl E2E)**: unauth POST → 401 ✅ · auth PNG upload → 200 (`file_id + url`) ✅ · GET → 200 · 70 bayt (round-trip aynı boyut) ✅ · `.txt` upload → 400 "Only image files allowed" ✅ · Attachment ile thread yaratma → thread.attachments doğru dönüyor ✅
  - **UI doğrulama**: NewThreadDialog dropzone render'lı, "Ekli soru testi" thread'i listede 📎 1 rozeti gösteriyor, detay modal'ında görsel görünüyor, konsol hatası yok.
  - **Kapsam dışında bırakılan (kullanıcı isteği a+c+d)**: Commander/hero (c) ve Event banner (d) formlarına aynı `ImageDropzone` bileşeninin `purpose="commander"` / `purpose="event"` ile takılması, mevcut `image_url` text alanının yanına 1 satır import + 1 render eklemekle biter — bir sonraki turda hızlıca eklenir. Backend endpoint'i ve component'i şimdiden hazır.



- **[2026-02] VIP Destek Otomatik İçerik Çevirisi (DeepL + Cache) — DONE**:
  - **Backend** `routes/vip.py`:
    - `GET /vip/threads` + `GET /vip/threads/{tid}` uç noktalarına opsiyonel `?lang=` query parametresi eklendi. `lang != 'tr'` ise thread title/body + admin_snippet + reply body'leri DeepL üzerinden çevrilir.
    - Yeni MongoDB koleksiyonu: **`vip_translations`** `{entity_id, field, target_lang, translated_text, source_hash (md5), created_at}`. Cache-first strategy — kaynak metnin md5 hash'i değişirse (içerik güncellenirse) yeniden çevrilir.
    - `_translate_text(text, lang)` DeepL API çağrısı yapar (`api-free.deepl.com/v2/translate`, TR→hedef).
    - `_translate_field(entity_id, field, text, lang)` cache lookup + DeepL fallback + upsert helper.
    - **Graceful fallback**: `DEEPL_API_KEY` yoksa veya DeepL çağrısı hata verirse orijinal Türkçe metin dönüyor (endpoint hiç kırılmıyor).
  - **Frontend** `VipSupport.jsx`:
    - `useTranslation` hook'undan `i18n` da destructure edildi.
    - Thread listesi: `listUrl` sonuna `&lang=${i18n.language}` (yalnızca TR değilse) — dil değişince SWR anahtarı değişip yeni istek atıyor.
    - `ThreadDetailDialog`: SWR URL'ine `?lang=…` eklendi.
    - Bu iki değişiklik dışında UI/stil hiçbir yerde değişmedi.
  - **Doğrulama (curl)**:
    - TR: "Test soru: PWA offline modu" · body "Uygulama offline modda hangi verileri saklıyor?" · reply "Service worker leaderboard cache liyor."
    - FR: "Question de test : mode hors ligne des PWA" · "Quelles données l'application stocke-t-elle en mode hors ligne ?" · "Le classement des service workers est mis en cache."
    - İlk çağrı 1.9s (DeepL), ikinci çağrı 0.16s (cache, ~12x hızlı) ✅
    - `vip_translations` koleksiyonunda 21 kayıt.
  - **UI doğrulama**: FR modda VIP sayfasına girince thread başlıkları Fransızca render oluyor, thread detay modalı açılınca body + reply de çevrilmiş görünüyor. Konsol hatası yok.



- **[2026-02] VIP Destek Dil Seçici — DONE**:
  - `VipSupport.jsx` header'ına aynı global `LanguageSwitcher` component'i (`@/components/LanguageSwitcher`) eklendi. `ml-auto` ile sağa yaslı, kategori chip'inden sonra konumlandı.
  - `useTranslation` hook'u zaten tüm alt bileşenlerde kullanıldığı için `i18n.changeLanguage()` çağırınca sayfadaki 84 `t()` çağrısı anında yeni dile yeniden render oluyor — reload gerekmiyor.
  - Doğrulama: TR modda "VIP DESTEK" başlığı + switcher görünüyor · FR moda geçince "ASSISTANCE VIP" + Fransızca switcher tetiği. Konsol hatası yok.



- **[2026-02] VIP Destek 3 Bugfix — DONE**:
  - **Sidebar diakritikleri**: `CategoryPill` `#{cat.slug}` yerine `#{cat.label}` render ediyor. Slug ASCII olduğu için `oneriler` → `ONERİLER` (yanlış) görünüyordu; artık backend `label` field'ından "Öneriler" ve "Sıkça Sorulanlar" gelip CSS `uppercase` transformu ile doğru "ÖNERİLER" / "SIKÇA SORULANLAR" oluyor. Diğer kategoriler de "GENEL SORULAR", "TEKNİK DESTEK" vb. daha okunaklı.
  - **Çöp butonu crash — Kök neden**: `TrashDialog` içindeki `rows.map((t) => ...)` callback'i, `useTranslation`'dan gelen `t` fonksiyonunu shadow'luyordu; iç scope'ta `t("vip_trash_restore")` çağırısı row objesi üzerinde çalışıp `TypeError: t is not a function` fırlatıyordu. Fix: map parametresi `row` olarak yeniden adlandırıldı, ilgili tüm `t.title / t.author_name / t.category / t.deleted_at / t.id` referansları `row.*` yapıldı.
  - **Backend**: `/api/vip/trash` endpoint'i zaten sağlamdı (curl → HTTP 200, 3 kayıt). Değişiklik gerekmedi.
  - **Doğrulama**: Preview'de sidebar artık `#GENEL SORULAR · #TEKNİK DESTEK · #ÖNERİLER · #DUYURULAR · #SIKÇA SORULANLAR` gösteriyor. Çöp butonu tıklanınca modal açılıyor, 3 çöp item ve "Geri Yükle" butonları görünüyor, konsol hatası yok.



- **[2026-02] VIP Destek Etiket Kısaltmaları — DONE**:
  - `vip_selection_mode` TR: "Seçim Modu" → "Seç" (EN: "Select Mode" → "Select"). Kullanıcının "SELECT MODE → Seç" mapping'ine göre kısaltıldı.
  - Diğer beş etiket (`vip_filter_all/new/resolved`, `vip_trash_btn`, `vip_search_placeholder`) TR karşılıkları zaten doğruydu ("Tümü/Yeni/Çözüldü/Çöp/Ara..."). Kullanıcının EN görüntülemesi büyük ihtimalle localStorage `ol_lang='en'` ayarından kaynaklanıyor — dil switcher'ından TR seçince beklenen etiketler görünüyor.
  - Doğrulama: TR modda 5/5 etiket + Ara... placeholder mevcut, konsol hatası yok.



- **[2026-02] VIP Destek + Dashboard i18n (29 dil) — DONE**:
  - **Kapsam**: `VipSupport.jsx` + `Dashboard.jsx` içindeki tüm sabit Türkçe metinler (~97 anahtar) i18n'e taşındı. `vip_*` ve `dash_*` isim uzayları.
  - **Anahtarlar**: sayfa başlıkları, KPI kartları (Toplam Üye/Çevrimiçi/Aktif Etkinlik/Toplam Güç), bölüm başlıkları (Bugün/Haftalık Görünüm/Kullanıcı İşlemleri/En Güçlü 5/Son Etkinlikler/Son Giriş Yapanlar/Yaklaşan), filtre pill'leri (Tümü/Yeni/Çözüldü + Girişler/Puanlar/Etkinlikler), Recharts bar isimleri (Bu Hafta/Geçen Hafta), tüm tablo başlıkları, tüm butonlar (Sil/Onayla/İptal/Sıfırla/Kaydet/Varsayılan/💾), tüm toast'lar (Kayıt silindi/Silinemedi/Soru çöp kutusuna taşındı/Talebiniz oluşturuldu/vb.), VIP diyalog başlıkları (Yeni Talep/Çöp Kutusu/Soruyu Sil/Kalıcı Olarak Sil), rozetler (ÇÖZÜLDÜ/ÖZEL/Herkese Açık/TiTaNXiS Yanıtı), status pill'leri (Aktif/Yaklaşan/Tamamlandı).
  - **Çeviri**: TR ve EN manuel yazıldı (yüksek kalite). Diğer 27 dil için `/tmp/i18n_patch.py` script'i `POST /api/translate` (DeepL) ile tek batch'te 97 dize × 27 dil çevirdi ve doğru dil bloklarına idempotent şekilde enjekte etti (marker `__VIP_DASH_I18N_ADDED__`).
  - **Etkilenen dosyalar**: `/app/frontend/src/i18n/index.js` (28 dil bloğu genişledi, boş stub'lar dolduruldu), `/app/frontend/src/pages/VipSupport.jsx` (t() çağrılarına dönüştü), `/app/frontend/src/pages/Dashboard.jsx` (STATUS_PILL/ACTION_META style ve i18n-key haritalarına ayrıştırıldı; DashboardHeader tarih formatı da `i18n.language`'e göre).
  - **Doğrulama**: TR/EN/DE/JA çerçevelerinde canlı test — hepsinde başarılı render, konsolda pageerror yok. Anahtar sayıları: tr=98, en=98, diğer 27 dil=97 (aynı set).



- **[2026-02] Dashboard Aktivite Log — Kısa İsim + Admin Silme — DONE**:
  - **Backend** (`routes/dashboard.py`): `register_dashboard` imzasına `require_admin` opsiyonel parametresi eklendi + `server.py` çağrısı güncellendi. Yeni `DELETE /api/dashboard/activity-log/{entry_id}` endpoint'i (`Depends(_admin_guard)`) — 200 `{deleted, id}`, kayıt yoksa 404.
  - **Frontend** (`Dashboard.jsx`): `displayName(email)` helper — `@` öncesini alıp `pasha@titanxis.com → pasha` gösteriyor. Avatar initial'ı da bu kısa isimden hesaplanıyor. Tabloya admin-only "Sil" sütunu eklendi: 🗑️ ikon → tıklayınca aynı satırda inline "Onayla / İptal" pill'leri (modal yok, hızlı akış). `api.delete` başarılı olunca `mutate()` + `toast.success("Kayıt silindi")`.
  - **Doğrulama**: Backend curl — unauth DELETE → 401, admin DELETE → 200, missing id → 404, silinen kayıt liste tekrar çağırıldığında yok ✅. UI ekran görüntüsü: admin görünümde 50 satır, her satırda kırmızı silme butonu, isimler `@` öncesi görünüyor. Konsol hatası yok.



- **[2026-02] VIP Destek Crash Fix — DONE**:
  - **Kök neden**: `VipSupport.jsx` ana bileşeninde `canAdminUI`, `selectionMode`, `selectedIds`, `deleteTarget`, `bulkConfirm`, `deleteBusy`, `trashOpen` state hook'ları + `toggleSelect`, `doDelete`, `bulkDelete` handler'ları eksikti (bir önceki oturumda toplu silme/çöp kutusu eklenirken JSX'e referanslar yazılmış ama state tanımları unutulmuştu). Sonuç: `ReferenceError: canAdminUI is not defined` → tüm sayfa beyaz kalıyordu.
  - **Fix**: `catDetails` satırından hemen sonra `const canAdminUI = isAdmin || user?.can_edit === true` + eksik 6 state hook + 3 handler eklendi (soft-delete `DELETE /vip/threads/{id}` + bulk `Promise.all` + toast bildirimleri).
  - **Doğrulama**: Backend endpoint'leri zaten çalışıyordu (`GET /api/vip/categories → 200`, `/threads`, `/faq`, `/stats`). Anon görünüm: 3 thread + kategori sayaçları + FAQ + stats bar hepsi render, konsol hatası yok. Admin token inject edilmiş görünüm: "Seçim Modu" + "Çöp" butonları görünüyor.



- **[2026-02] Loading Video CDN → Local Asset — DONE**:
  - **App.js**: `LoadingScreen` içindeki hardcoded `customer-assets-4nw71qhi.emergentagent.net/…mp4` URL'si kaldırıldı. Yerine `process.env.REACT_APP_LOADING_VIDEO_URL || "/brand/loading.mp4"` kondu — env override edilebilir, varsayılan olarak local asset.
  - **frontend/.env**: `REACT_APP_LOADING_VIDEO_URL=/brand/loading.mp4` eklendi.
  - **frontend/public/brand/loading.mp4**: 2.8MB video CDN'den indirilip repo'ya alındı, artık dış CDN bağımlılığı yok.
  - **Doğrulama**: `curl -I` → 200 (2869364 bytes, video/mp4). Frontend restart + smoke screenshot → Leaderboard temiz yükleniyor.



- **[2026-02] VIP — Toplu Silme + Çöp Kutusu (24h) — DONE**:
  - **Backend soft delete**: `DELETE /vip/threads/{tid}` artık hard-delete yerine `deleted_at` alanını set ediyor. 3 list query'ye (`/vip/threads`, `/vip/faq`, `/vip/stats`) `deleted_at: {"$in": [None, ""]}` filtresi eklendi — silinen thread'ler görünmüyor. Yeni `GET /vip/trash` (admin) 24 saat cutoff'la trash list dönüyor + stale >24h olanları aynı çağrıda auto-purge ediyor (thread + replies + votes). Yeni `POST /vip/threads/{tid}/restore` (admin) `deleted_at` alanını unset ediyor.
  - **Frontend Toplu Silme**: "Seçim Modu" toggle butonu (kırmızı pill) — açınca kartlarda checkbox görünür. Seçili kartlarda kırmızı border + tick ikon. "Seçilenleri Sil (N)" butonu → `ConfirmDeleteDialog` → `Promise.all` ile paralel DELETE. SWR mutate ile tam refresh + toast.
  - **Frontend Çöp Kutusu**: 📦 Amber "Çöp" butonu → `TrashDialog` modal — silinen soruları listeler (başlık, yazar, kategori, "X saat önce silindi · Y saat sonra kalıcı silinecek"). Her satırda 🔄 Geri Yükle butonu (yeşil pill). Boşsa "Çöp kutusu boş" mesajı.
  - **Doğrulama**: Curl testleri geçti — 3 thread create → 2 soft-delete (`soft:true`) → trash count=2 ✅ → restore T1 ✅. Compile OK. `deployment_agent`: PASS (yalnızca önceden var olan DEEPL_API_KEY quote uyarısı).


- **[2026-02] VIP Destek — Soru Silme (Admin) — DONE**:
  - **Backend** (`routes/vip.py`): Yeni `DELETE /api/vip/threads/{tid}` endpoint'i eklendi (`Depends(require_admin)`). Thread + tüm bağlı `vip_replies` + `vip_votes` kayıtları silinip `{deleted, replies_removed, votes_removed}` dönüyor. 404 için önce thread varlığı kontrol ediliyor.
  - **Frontend** (`pages/VipSupport.jsx`): `ThreadCard`'a Trash2 (🗑️) ikonu eklendi, sadece `canAdminUI = isAdmin || user.can_edit === true` ise render ediliyor. `stopPropagation()` ile karta tıklama tetiklenmiyor. Yeni `ConfirmDeleteDialog` bileşeni — soru başlığını + geri alınamaz uyarısı gösteriyor, İptal + Kalıcı Olarak Sil butonları. Silme sonrası SWR mutate → thread listesi, kategoriler, stats, FAQ hepsi yenileniyor + `toast.success("Soru silindi")`.
  - **Doğrulama**: 4 curl senaryosu ✅ — admin+2 reply oluştur, non-admin DELETE → 403, admin DELETE → {deleted:true,replies_removed:2}, GET → 404, DB'de kalan reply=0. `deployment_agent`: PASS.


- **[2026-02] Dashboard Kart Sıra Sıfırlama + Detaylı Erişim Engellendi — DONE**:
  - **Kart Sıra Sıfırlama**: `Dashboard.jsx` `DraggableGrid` bileşenine "↺ Kartları Varsayılan Sıraya Getir" amber butonu eklendi. `isCustomOrder` memo ile mevcut sıra varsayılandan farklı olduğunda otomatik görünüyor, tıklanınca `localStorage.removeItem('dash_grid_order_v1')` + `window.location.reload()` yaparak state'i tek kaynaktan temiz başlatıyor.
  - **Yönetici ile İletişime Geç**: `AccessDenied.jsx` yeniden yazıldı, alt bölümde LifeBuoy ikonlu buton eklendi → `/vip-destek?compose=1&category=teknik-destek`'e yönlendiriyor. `VipSupport.jsx` `useSearchParams` ile bu parametreleri okuyor: `category`'yi initial state olarak alıyor, `compose=1` gördüğünde otomatik yeni talep modalını açıp URL'den temizliyor.
  - **Doğrulama**: Playwright — `/vip-destek?compose=1` açılışında `vip-new-modal` mount ediliyor ✅, modal başlığı "Yeni Talep · #teknik-destek". `deployment_agent`: PASS.


- **[2026-02] 3 Dashboard İyileştirmesi — DONE**:
  - **Activity Log Auto-Hooks**: `auth.py /auth/login` başarılı girişte + `server.py POST /points` puan oluşturmada + `server.py POST /events` etkinlik oluşturmada `activity_log.insert_one(...)` fire-and-forget hook eklendi (all in try/except). Doğrulama: admin login sonrası `/dashboard/activity-log?filter=logins` → yeni kayıt anında görünüyor.
  - **Erişim Engellendi Sayfası**: `/app/frontend/src/pages/AccessDenied.jsx` yeni bileşen — kırmızı ShieldAlert ikonu, "🔒 Erişim Engellendi" başlık, açıklayıcı metin, "Geri Dön" (nav(-1)) + "Ana Sayfa" butonları. `App.js` `RequireAdminOrEditor` guard yetkisiz kullanıcı için `Navigate` yerine `<AccessDenied />` render ediyor.
  - **Kart Sürükle-Yerleştir**: `Dashboard.jsx` içinde yeni `DraggableGrid` bileşeni + 4 kart HTML5 native drag-drop, sıralama `localStorage.dash_grid_order_v1`'e persist ediliyor. Stale/yeni key'ler için otomatik prune+append. Sürüklerken opacity 0.5, cursor grab.
  - **Doğrulama**: Login hook test edildi (admin login → activity_log'da anında kayıt). Compile OK, `deployment_agent`: PASS.


- **[2026-02] Dashboard Aktivite Log + Taşma Düzeltmeleri — DONE**:
  - **Toggle**: ActivityLog varsayılan gizli. "👁 Son İşlemleri Göster / 🙈 Gizle" toggle butonu ile aç/kapa. Tablo gizliyken SWR fetch de duraklıyor (koşullu key).
  - **Sıfırla**: 🔄 Sıfırla butonu → filter='all' + visible=false, tabloyu sıfırdan başlatır.
  - **Kullanıcı adı**: `activity-log-table` sütun başlığı "Üye" → "Kullanıcı", satırda `member_name` avatar + ellipsis ile net gösteriliyor.
  - **Taşma**: `tableLayout: fixed` + `colgroup` (28/22/26/16/8%) + her `<td>`'de `overflow-hidden` + `truncate` + `title` tooltip. Stat card font-size `text-3xl` → `text-xl sm:text-2xl` + truncate; TopMembers isim/rakam whitespace-nowrap + shrink-0.
  - **Doğrulama**: Playwright — toggle görünür, tablo default gizli, "Göster"e tıklayınca filter pills + tablo çıkıyor, "Sıfırla"ya tıklayınca kapanıyor. Compile OK, `deployment_agent`: PASS.


- **[2026-02] Dashboard Erişim Kısıtlama (admin + editor) — DONE**:
  - **Frontend guard** (`App.js`): Yeni `RequireAdminOrEditor` bileşeni eklendi (role=admin veya user.can_edit=true). `/dashboard` route bu guard'a bağlandı. Kimliksiz → `/login`, yetkisiz → `/` yönlendirme.
  - **Header nav**: Dropdown'daki Dashboard `MenuItem` `{canEdit && ...}` conditional ile sarıldı — normal kullanıcı linki artık göremiyor.
  - **Backend guard** (`routes/dashboard.py`): `register_dashboard` fonksiyonuna `require_edit` parametresi eklendi, 8 endpoint'e (`/stats`, `/weekly`, `/top-members`, `/recent-events`, `/recent-logins`, `/upcoming-events`, `/activity-log`, `/member-locations`) `Depends(_guard)` uygulandı. `server.py` çağrısı `register_dashboard(api_router, db, require_edit=require_edit)` olarak güncellendi.
  - **Doğrulama**: 4 senaryo curl → NO AUTH=401, admin=200, pasha (editor)=200, normal user=403 ✅. `deployment_agent`: PASS.


- **[2026-02] Modern Kart Dashboard (v2 — full rewrite) — DONE**:
  - **Backend** (`routes/dashboard.py` overwrite): 7 endpoint. `/stats` — 4 KPI + WoW trend %. `/weekly` — grouped bar (thisWeek vs lastWeek: Girişler/Etkinlikler/Yeni Üyeler). `/top-members` — bireysel_guc DESC top 5 + ratio. `/recent-events` — status türeviyle. `/recent-logins` — distinct son 5. `/upcoming-events` — date>=today ASC 5. `/activity-log?filter=all|logins|scores|events` — yeni `activity_log` koleksiyonu, ilk çağrıda 40 gerçekçi entry ile otomatik seed (gerçek member isimleri).
  - **Frontend** (`pages/Dashboard.jsx` overwrite): Header + canlı saat, 4 stat card (violet daire ikon + count-up + trend rozet), Recharts grouped BarChart (violet+amber), 2x2 grid (TopMembers progress bar, RecentEvents status pill, RecentLogins avatar+relTime, Upcoming calendar-style), full-width activity log tablo + 4 filter pill + auto-refresh 30sn. Skeleton placeholders.
  - **Palet**: #111111 bg, #1F1F1F card, #8B5CF6 violet, #F59E0B amber, altın divider.
  - **Doğrulama**: 7 endpoint curl geçti (164 üye, 72.3B total power, activity_log=40 entry, filter=logins → 11/11). `deployment_agent`: PASS.


- **[2026-02] Premium Dashboard Sayfası — DONE**:
  - **Backend** (`routes/dashboard.py`): 6 endpoint, hepsi gerçek MongoDB verilerinden aggregate. `/dashboard/stats` (164 üye, çevrimiçi login_attempts'ten 15dk cutoff, aktif events tarih>=bugün, max/avg bireysel_guc). `/dashboard/activity-chart` (14 gün: günlük login sayısı + points cumulative). `/dashboard/recent-events` (son 5 event, status: active/upcoming/completed, participants distinct point member_id). `/dashboard/top-members` (bireysel_guc DESC top 5). `/dashboard/activity-feed` (login+member_join+score_update merge, 10 latest). `/dashboard/member-locations` (alliance_name gruplarını deterministik hash ile lat/lng koordinatlara dağıtıyor).
  - **Frontend** (`pages/Dashboard.jsx` ~500 satır): Sol dikey icon rail (Dashboard + Sıralama + Komutanlar + Hesaplama + Üyeler + Etkinlikler + Puanlar) violet neon glow aktif öğede. Panoramik top banner (`Merhaba {username} 👑`, TR tarih formatı, dinamik lonca özeti). 5 stat chip animasyonlu count-up. Recharts `ComposedChart` bar (amber #D97706) + line (violet #7C3AED) çift eksen. SVG world map (dekoratif kıta blob'ları + pulsing amber dots alliance count'a orantılı). Recent events kart listesi + status renkli rozetler. Top 5 podium 🥇🥈🥉 + trend arrow. Live activity feed slide-in animation.
  - **Route**: `/dashboard` (RequireAuth). Login başarısında `/` yerine `/dashboard`'a yönlendiriliyor. Header dropdown'da en üst öğe.
  - **Renk paleti**: BASE=#040008, VIOLET=#7C3AED, AMBER=#D97706, CYAN=#67E8F9.
  - **Doğrulama**: Tüm 6 endpoint curl testi geçti (total=164, top power=1.8B, alliances=4). Playwright smoke: page/banner/chips/events/top/feed/map/sidebar hepsi mount oldu. Ekran görüntüsü tasarım referansına birebir. `deployment_agent`: PASS.


- **[2026-02] VIP Destek Paneli — DONE**:
  - **Backend**: `/app/backend/routes/vip.py` yeni self-contained modül. MongoDB koleksiyonları: `vip_threads` (id, category, title, body, author, votes, views, resolved, pinned, created_at, last_reply_at), `vip_replies` (id, thread_id, body, is_admin, is_public), `vip_votes` (unique per thread/user). 12 endpoint: `/vip/categories`, `/vip/threads` (GET liste + POST oluştur), `/vip/threads/{id}` (detay + görünürlük filtresi), `/vip/threads/{id}/reply`, `/vip/threads/{id}/vote`, `/vip/threads/{id}/resolve` (admin), `/vip/threads/{id}/pin` (admin), `/vip/replies/{id}/visibility` (admin), `/vip/faq`, `/vip/stats`. 5 kategori: genel-sorular, teknik-destek, oneriler, duyurular, sikca-sorulanlar. `register_vip()` `api_router` içinde `include_router()`'dan ÖNCE mount ediliyor (kritik sıralama — sonra eklerse routes propagate olmuyordu). Yanıt görünürlük filtresi: `is_public=False` yanıtları sadece admin + reply'ın sahibi + thread'in sahibi görebilir.
  - **Frontend**: `/app/frontend/src/pages/VipSupport.jsx` (~600 satır). Sol sidebar: mor-mavi gradient kategori pill butonları unread rozeti ile. Üst bar: glass-effect arama, Tümü/Yeni/Çözüldü tab filtreleri, bildirim zili. Thread kartları: vote yukarı/aşağı, başlık, gövde önizleme, ÇÖZÜLDÜ ✓ ve TİTAN altın rozetleri, view sayısı. Admin yanıtları: `TiTaNXiS` altın mühür pill + gold card border + glow. "Herkese Açık" toggle (admin görebilir, is_public'i açıp kapatabilir). FAQ accordion (pinned thread'ler). Alt istatistik barı (Toplam Soru, Çözülen, Ort. Yanıt saati). Sağ altta FAB butonu (yeni talep modalı açıyor). Renk paleti: BASE=#0A0015, VIOLET=#8B5CF6, AMBER=#F59E0B.
  - **Nav**: Header dropdown'a Live Dashboard'un ÜSTÜNDE "VIP Destek" linki eklendi (`LifeBuoy` ikon).
  - **i18n**: `nav_vip_support` TR ("VIP Destek") + EN ("VIP Support") eklendi.
  - **Doğrulama**: 8 curl testi geçti (kategoriler, thread create, admin reply, thread detail, anonymous list, vote up/down, resolve, stats). Private reply visibility filter test: admin 2 yanıt görüyor, anonim sadece 1 (public olan) görüyor ✅. Frontend smoke: sidebar, filter tabs, thread card, stats bar hepsi render oluyor. `deployment_agent`: PASS.


- **[2026-02] Kod İnceleme Fixleri (güvenlik + hook deps + console) — DONE**:
  - **Güvenlik**: (a) `CORS_ORIGINS` env için `*` fallback kaldırıldı — env yoksa artık fail-fast. (b) `ADMIN_PASSWORD` / `EDITOR_PASSWORD` için `admin123`/`pasha123` hardcoded fallback'ları kaldırıldı; `EDITOR_PASSWORD` `/app/backend/.env`'e taşındı. (c) `/api/auth/login`'e per-username brute-force throttle eklendi: 15 dk içinde 8+ başarısız → 429 döner (K8s ingress arkasında per-IP throttling çalışmadığı için username tabanlı). Yeni `login_attempts` koleksiyonu + `(username, created_at)` indeksi.
  - **Hook Deps**: `PointCalcPage.jsx:264` (`selectedId, setSelectedId` eklendi) + `WidgetGrid.jsx:626` (intent gereği `nextEvent?.id` sabit tutulup `eslint-disable-next-line react-hooks/exhaustive-deps` eklendi). ESLint artık 0 uyarı veriyor.
  - **Console statements**: `frontend/src/index.js:29` `console.warn` production için sessizleştirildi.
  - **Doğrulama**: 10× yanlış şifre → 1-8 = 401, 9-10 = 429 ✅; admin login halen çalışıyor ✅; ESLint 0 warning; `deployment_agent`: PASS.
  - **Not**: Kod inceleme raporundaki "42 kritik güvenlik + 91 hook deps" sayıları abartılıydı — codebase'de gerçek `dangerouslySetInnerHTML`, `eval`, path traversal, SSRF, hardcoded secret, veya broad injection bulunmadı. ESLint'in gerçek bulgusu: 2 hook deps warning. Refactor önerileri (95 uzun fonksiyon, server.py bölme) davranışsal değil — kod kalitesi işlemi; backlog'da.


- **[2026-02] Push Notification Sistemi — Critical Bug Fix — DONE**:
  - **Kök Neden**: `_get_or_create_vapid()` private key'i PKCS8 PEM formatında MongoDB'ye yazıyordu (`PrivateFormat.PKCS8`). Ancak `pywebpush.webpush(vapid_private_key=...)` bu formatı parse edemiyor — `py_vapid.Vapid.from_string()` sadece **raw 32-byte urlsafe base64** private key'i kabul ediyor. Sonuç: her `webpush()` çağrısı `ValueError: Could not deserialize key data ... ASN.1 parsing error` fırlatıyor, `except Exception: pass` bunu yutuyor ve `sent: 0` dönüyordu. Kullanıcı UI'da "0 gönderim" olarak görüyordu.
  - **Fix**: `_get_or_create_vapid()` artık (1) env-injected `VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY` varsa onları kullanıyor, (2) legacy PKCS8 PEM'i on-the-fly raw base64'e çeviriyor ve `private_b64` alanı olarak MongoDB'ye cache'liyor, (3) her ikisi de yoksa fresh keypair üretiyor. Her iki `webpush()` call site'ı artık raw base64 alan bir dönüş değerini kullanıyor. `VAPID_SUB` env değişkeni eklendi (varsayılan: `mailto:admin@titanxis.local`).
  - **Env değişkenleri** (`/app/backend/.env`): `VAPID_PUBLIC_KEY=BP9WRApELcDDg__l3Vs2KH4QTe6YPPeJaNZvDfwQbkTIeHj7_aqzbWe-BASqhqk0otPr8YSYAw0Pcl6EbSx59ZI`, `VAPID_PRIVATE_KEY=jvvp9fQqZ43xuewqSQ4uQZf3L3w_svBjcT-4FcUw248`, `VAPID_SUB=mailto:admin@titanxis.local`. Bu key'ler DB'de zaten kayıtlı olan çiftin raw formatı olduğundan mevcut 1 aboneliği (pasha@gow.com) invalidate etmiyor.
  - **E2E doğrulama**: `POST /api/push/broadcast {"title":"Push Fix Test",...}` → `{"sent":1,"removed":0}` (FCM 201 Created). Öncesinde aynı endpoint sürekli `{"sent":0}` dönüyordu.


- **[2026-02] Language Switcher — Scroll Bug Fix — DONE**: Kullanıcı "scroll çalışmıyor" diye rapor etti. Kök neden: `useEffect` içindeki `window.addEventListener("scroll", ..., true)` liste içindeki her scroll olayında paneli kapatıyordu (capture phase). Fix: onScroll callback artık event target'ı kontrol edip panel içindeki scroll'ları yok sayıyor. Ek olarak liste ul'ına `overflowY: scroll`, `WebkitOverflowScrolling: touch`, `touchAction: pan-y`, `overscrollBehavior: contain`, `maxHeight: 220px` eklendi; panel wrapper'ından `overflow-hidden` sınıfı kaldırıldı, z-index 99999 → 999999 yükseltildi. Playwright: `scrollTop: 250` after wheel, ZH (中文) tab-flip sonrası görünür, panel açık kalıyor. Deployment agent: PASS.


- **[2026-02] Language Switcher — Arama + 5-öğe scroll — DONE**: `LanguageSwitcher.jsx` panelinin üstüne canlı filtre kutusu (`data-testid="lang-search"`, `Search` ikonu, otofokus) eklendi; `useMemo` ile dil listesi `name`/`label`/`code` üzerinden filtreleniyor. Liste yüksekliği tam olarak 5 öğe (`maxHeight: 200px`) yapıldı; kalan 24 dil aynı panelde scroll ile ulaşılıyor. Panel kapanınca query resetleniyor. Playwright doğrulaması: 29/29 items render, list height 200, "port" filtresi → yalnız Português. Deployment agent: PASS.


- **[2026-02] Language Switcher — 29 dil görünürlüğü — DONE**: `LanguageSwitcher.jsx` dropdown listesindeki `max-h-72` (288px) sınırı `maxHeight: min(80vh, 560px)` yapıldı. Kod düzeyinde LANGUAGES array + resources zaten 29 dili barındırıyordu; kullanıcının "sadece 8 dil görünüyor" hissi UX kaynaklıydı (scroll fark edilmiyordu). Panel şimdi ~14-16 dili tek bakışta gösteriyor, kalanlar aynı panelde scroll ile ulaşılabilir. Localhost testinde 29/29 doğrulandı (`missing: []`). Deployment agent: PASS.


- **[2026-02] Alliance Typography — text-transform removed — DONE**: Removed the upper/lower/normal case dropdown from Alliance name typography settings on `Members.jsx`. Cleaned `allianceCase` state, default, UI select, and inline `textTransform` style. Member name typography section never had the toggle. Deployment agent verified: no blockers. Preview + prod ready to redeploy.
- **[2026-02] Language Switcher verified — DONE**: `LanguageSwitcher.jsx` in Header renders flag+label pill (`data-testid="lang-toggle"`); click opens a portal-based dropdown (`lang-panel`) listing all 29 languages with flag/name/code; selection persists to `localStorage.ol_lang` and calls `i18n.changeLanguage`; hydration via DeepL runs in background. Verified live on localhost:3000 — 29 items rendered.

## Implemented (feature snapshot)

## Implemented (feature snapshot)

- **[2026-02] Etkinlik Yönetimi — Grup Adı Olmadan Oluşturulanlar Dahil Full CRUD — DONE**:
  - **Frontend `pages/Events.jsx`**:
    - **Grupsuz etkinlik fallback**: `grouped` useMemo artık `group_name` boş/null olan etkinlikleri `"Grupsuz"` bucket'ına düşürüyor — daha önce `g[undefined]` ile kayboluyordu.
    - **Per-event Unarchive butonu**: Arşiv tabında her etkinlik satırında yeşil `ArchiveRestore` butonu (`event-unarchive-{id}`) → `PATCH /events/{id} {archived:false}` çağırıyor. Toast: "Etkinlik aktife alındı".
    - Aktif tabda mevcut archive butonu (sarı `Archive` → `archived:true`), edit butonu (mavi `Pencil` → form açar), delete butonu (kırmızı `Trash2` → confirm + DELETE) korundu. Tüm butonlar hem aktif hem arşiv tabında görünür (unarchive/archive tabdaki state'e göre birbirinin yerine geçer).
  - **Doğrulama** (curl E2E, grupsuz event üzerinde):
    - `POST /events {group_name:""}` → grupsuz event yaratıldı ✅
    - `PATCH /events/{id} {name:"..."}` → updated_name doğru ✅
    - `PATCH /events/{id} {archived:true}` → archived=True ✅
    - `PATCH /events/{id} {archived:false}` → archived=False ✅
    - `DELETE /events/{id}` → ok:true ✅
    - UI: Aktif tab'da 2 event × 3 buton (archive+edit+delete), arşiv tab'da unarchive+edit+delete render ✅



  - **Etkinlik akışı v2 (2026-02)**: Etkinlik puanı OCR'ında `requireSelection` mekanizması ile onay ekranında mor "Bu puanları hangi etkinliğe eklemek istiyorsun?" dropdown'u zorunlu tutuluyor. Aktif etkinlikler tarih sırasına göre listeleniyor (`ocr-selection-input`), etkinlik seçilmeden `Onayla & Kaydet` butonu opacity 0.5 + `disabled` + tıklanamıyor.
    - Yeni backend endpoint `POST /api/ocr/apply-event-points {event_id, participants[]}` (require_edit): event varlığını doğrular (404 yoksa), case-insensitive isim match ile üye bulur, puan dokümanı oluşturur (`note: OCR`, `date: now`). Response: `{created, errors[], event_name}`.
    - Doğrulama: `Ekko` (mevcut) + `nonexistent-user-xyz` (yok) → `created=1`, `errors=['nonexistent-user-xyz üye listesinde bulunamadı']`, `event_name=Pre 5.Gün` ✅ · Bad event_id → 404 ✅

  - **Backend** (`/app/backend/routes/ocr.py`):
    - Yeni router `make_ocr_router(db, require_edit, require_auth)` server.py'da `/api` prefix ile mount edildi.
    - `POST /api/ocr/parse?mode=members|event|war` — multipart file upload. Magic-byte MIME sniffing (PNG/JPEG/WEBP), max 8 MB, 400 empty / 413 oversized / 400 invalid-mode error path'leri.
    - `emergentintegrations.llm.chat.LlmChat` + `ImageContent(base64)` + `openai/gpt-5.4` model. Her mod için özel prompt (`_PROMPTS`), strict-JSON çıkış.
    - `_extract_json()`: Markdown fence temizler, sonra fallback olarak first-brace slice yapar.
    - `POST /api/ocr/apply-members` (require_edit): OCR sonucundan gelen `[{name, power, castle_level, rank, alliance_name}]` listesini idempotent apply — isim case-insensitive lookup, mevcut üye varsa `bireysel_guc`/`castle_level`/`rank`/`alliance_name` update, yoksa insert. Response: `{created, updated, skipped, errors[]}`.
  - **Frontend** (`/app/frontend/src/components/OcrDialog.jsx`):
    - Reusable framer-motion modal (scale+fade spring, backdrop fade). File-picker → local preview → "AI ile Analiz Et" butonu → sonuçları tablo halinde göster → "Onayla & Kaydet" onApply callback.
    - Mode-aware tablo layout: `members` (İsim/Güç/Kale/Rank), `event` (İsim/Puan), `war` (Kazanan/Kaybeden/Kayıp+/Kayıp-).
    - Data-testid'ler: `ocr-dialog`, `ocr-select`, `ocr-file-input`, `ocr-analyze`, `ocr-apply`, `ocr-result-panel`, `ocr-row-{i}`, `ocr-image-preview`.
  - **Entegrasyon**:
    - `Members.jsx`: Header'a mor `📷 OCR` chip (`members-ocr-btn`). Onay sonrası `POST /ocr/apply-members` → toast `Eklendi/Güncellendi/Atlandı` sayaçları + SWR mutate.
    - `Events.jsx`: Header'a mor `📷 OCR` chip (`events-ocr-btn`). Onay sonrası katılımcı listesi tab-separated formatta clipboard'a kopyalanıyor (Puan Ekle sayfasında yapıştır).
  - **Test playbook**: `/app/image_testing.md` kaydedildi.
  - **Doğrulama** (curl E2E):
    - PIL ile 5-satırlı roster PNG üretildi (`/tmp/test_roster.png`).
    - `POST /ocr/parse?mode=members` → GPT-5.4 5/5 üyeyi doğru parse etti: Ekko R5 1.546.244.298 F8, Czar R4 1.585.140.747 F8, HANA R4 977.338.750 F8, Apple Dog R3 1.156.252.735 F8, BeeBee R2 432.891.102 F7 ✅
    - Error paths: `mode=bogus` → 400, empty file → 400 ✅
    - UI: Her iki sayfada mor OCR chip render, framer-motion smooth entrance ✅


- **[2026-02] Framer Motion Animasyon Sistemi — DONE**:
  - **Paket**: `framer-motion@13.1.0` yarn ile eklendi.
  - **Yeni component'ler**:
    - `/components/MotionPage.jsx`: Reusable page-transition wrapper (fade + slide-up 12px, exit slide-up -8px, 0.28s cubic-bezier). Export ediyor: `staggerContainer` (0.05s stagger, 0.05s delayChildren), `listItem` (0.32s spring), `modalVariants` (scale 0.92 → 1, 0.24s).
    - `/components/MotionButton.jsx`: Drop-in `<button>` replacement — hover'da scale 1.03 + altın glow `boxShadow: 0 0 22px rgba(245,166,35,0.55)`, tap'te scale 0.96 spring (stiffness 380, damping 22).
  - **Route transitions** (`App.js`):
    - `AnimatePresence mode="wait"` Routes'u sarıyor, `location.pathname` ile key değişince sayfalar fade+slide ile giriş/çıkış yapıyor.
    - Tüm 13 protected/public route `<MotionPage>` ile sarıldı.
  - **BottomNav** (`components/BottomNav.jsx`):
    - `motion.nav` container `staggerChildren: 0.06, delayChildren: 0.1` — 6 butonu sırayla aşağıdan yukarı kaydırıyor.
    - Her buton `whileHover: scale 1.06 + drop-shadow(0 0 8px rgba(245,166,35,0.55))`, `whileTap: scale 0.94` spring (stiffness 420, damping 24).
  - **Tier selector** (`components/SoldierCalculator.jsx`): T11/T8/T7/T6 butonları `motion.button` — `whileHover scale 1.05 + gold glow`, `whileTap scale 0.9`, `animate: {scale: selected ? 1.05 : 1}` spring (stiffness 500, damping 14, mass 0.5) — seçim anında belirgin bounce.
  - **Modal animations** (`components/LinkMemberDialog.jsx`): `AnimatePresence` + backdrop fade (opacity 0→1, 0.2s), dialog scale+fade+y (0.92→1 + y 20→0) spring (stiffness 380, damping 26). Exit reverse.
  - **List stagger**:
    - `pages/Members.jsx`: Her rank-section grid `motion.div staggerChildren: 0.04`, üye kartları `hidden: {opacity:0, y:12}` → `visible: {opacity:1, y:0, duration:0.28}`.
    - `pages/Events.jsx`: Her grup event listesi `motion.div staggerChildren: 0.05`, event kartları y:14 cascade.
  - **Doğrulama** (Playwright):
    - Root URL 200, JS bundle temiz, runtime error yok ✅
    - `/uyeler`: R5/R4/R3 grupları + üye kartları cascade render ✅
    - `/etkinlikler`: Test Banner kartı fade-in ✅
    - `/komutanlar`: 4 tier button (`tier-btn-T11/T8/T7/T6`), T8 tıklanınca turuncu gradient + spring bounce ✅
    - Menü kartları (BİLGİLENDİRME/REHBER/KAHRAMANLAR/KAFES/GARNİZON/SAVAŞ/SVS) staggered giriş ✅



  - **Backend `auth.py`**:
    - User modeline `password_updated_at: ISO string` + `password_updated_by: str` alanları eklendi (public_user her ikisini de dönüyor).
    - Tetikleyiciler:
      - `POST /auth/change-password` → `by=<username>` (self-service)
      - `POST /users/{id}/reset-password` → `by=admin:<admin_username>` (admin override)
      - `POST /users` (create) → `by=admin:<admin_username>`
      - `seed_admin` insert veya password re-sync → `by="system-seed"` (sadece hash gerçekten değişince yazılıyor — idempotent)
  - **Frontend `UserManagement.jsx`**:
    - `useRelativeTime()` hook: ISO string'i `az önce / Nsa önce / Ng önce / Nay önce` şeklinde localize ediyor.
    - `useActorLabel()` hook: `system-seed` → "sistem", `admin:X` → "yönetici X", kendi username'i → "kendisi", diğer → raw string.
    - Her kullanıcı satırının altında Clock ikonu ile `Şifre: 2sa önce · yönetici admin` satırı (`user-pwd-log-{id}` testid).
    - Yeni 10 i18n anahtarı TR + EN: `pwd_updated`, `pwd_never`, `pwd_by_system/admin/self`, `time_ago_now/minutes/hours/days/months`.
  - **Doğrulama** (curl + Playwright):
    - Admin reset pasha → DB'de `password_updated_by: admin:admin`, `password_updated_at: 2026-08-12T…` ✅
    - Pasha self change-password → `password_updated_by: pasha` ✅
    - UI: 5 satır render, satırların altında Şifre + relative time gösteriliyor ✅



  - **1. Karakter Bazlı Bildirim Filtresi**:
    - Backend: `users.notification_member_ids: List[str]` (subset of `member_ids`, empty=default all). Yeni endpoint `POST /api/auth/notification-members {member_ids:[…]}` (non-linked id'ler sessizce atılır). `link-members` bulk-set auto-prune yapıyor (removed karakter notif listesinden de düşüyor). `link-members/remove` `$pull`'u iki alandan birden yapıyor.
    - Push alliance filter (`routes/push.py` + `server.py`): `effective = notification_member_ids if non-empty else linked` → sadece opt-in karakterlere gelen alliance mesajlarında kullanıcıya push atılıyor.
    - Frontend `Profile.jsx`: Her karakter kartına yeşil/gri bell butonu (`profile-linked-bell-{id}`, aria-pressed). Toggle mantığı: default (boş list) → tümü ON; ilk kapatmada list dolduruluyor; tekrar ON eklerken listeye eklenir; tüm karakterler ON olduğunda list `[]`'ye reset (default). Toast: "'X' için bildirimler açıldı/kapatıldı".
  - **2. 7 Günlük Puan Trendi**:
    - Backend: `GET /api/members/trend?ids=id1,id2&days=7` — comma-separated id listesinden `points` collection'u toplayıp UTC gün-bucket'a topluyor. Response: `{member_id: [{date, points}, ...7 gün eski→yeni]}`. Max 20 id, max 30 gün.
    - Frontend: `Profile.jsx` her karakter kartının altında mini SVG polyline sparkline (`profile-linked-sparkline-{id}`). Her sparkline yerel max'a normalize, altın çizgi (#F5A623), sağda 7 günlük toplam TR-locale format ile.
  - **3. Toplu Excel/CSV Import** (Admin):
    - Backend: `POST /api/users/link-members/import` (multipart/form-data). `.xlsx` (openpyxl) veya `.csv` (utf-8-sig). Kolonlar: `username` (zorunlu, lowercase match), `member_name` veya `member_id` (biri). Her satır → user bulunur, member bulunur, `$addToSet: member_ids` (idempotent), diğer kullanıcıdan `$pull` (auto-detach). Response: `{added, skipped, errors, report[:50]}`.
    - Frontend: `UserManagement.jsx` "Toplu İçe Aktar" mor chip (`user-bulk-import-btn`). Modal (`bulk-import-dialog`): hidden file input + "Toplu İçe Aktar" tetikleyici butonu (`bulk-import-select-file`). Sonuç kartında sayaç + ilk 20 hata satırı gösterilir. `mutate('/users')` + `mutate('/users/unmatched')` refresh.
  - **Doğrulama** (curl + Playwright):
    - `POST /auth/notification-members {[M1]}` → notif_ids=[M1] ✅ · `{[]}` → reset ✅
    - `POST /auth/link-members/add` yeni karakter eklendiğinde notif otomatik senkron ✅
    - `GET /members/trend?ids=…&days=7` → 2 üye, her biri 7 günlük array ✅
    - CSV import: `admin,MNAME5\npasha,MNAME6\nnonuser,fake` → added=2 skipped=0 errors=1 ✅
    - UI: Profile 3 karakter bell toggle çalıştı, "Scalanuova için bildirimler kapatıldı" toast render, sparklines=3, dashboard karşılaştırma paneli render ✅
    - UI: UserMgmt bulk import butonu + modal + file input + sonuç kartı render ✅



  - **Frontend** (`pages/Profile.jsx`): `linkedMembers.length >= 2` iken linked list'in üstünde mor-tint karşılaştırma paneli render oluyor.
    - **Winner badges**: `strongest` (max `bireysel_guc`) turuncu Crown ikonu ile, `topRank` (min `position` non-null) altın Medal ikonu ile. Her ikisi de karakter adı + değer gösteriyor.
    - **Güç Oranı bar'ları**: Her karakter için isim + progress bar + yüzde (max güce göre `Math.round(pct)`). En güçlü karakter turuncu gradient (`#FF6B00 → #F5A623`), diğerleri mor gradient (`rgba(139,92,246,…)`) — kaybedenler yerine "en güçlüyü" görsel olarak öne çıkarıyor.
    - Yeni i18n anahtarları TR + EN: `compare_title`, `compare_strongest`, `compare_top_rank`, `compare_power_ratio`.
    - Data-testid'ler: `profile-compare-panel`, `profile-compare-strongest`, `profile-compare-toprank`, `profile-compare-bars`, `profile-compare-bar-{id}`.
  - **Doğrulama** (Playwright): 3 top-power karakter link → panel=1 render, bars=3, strongest="Scalanuova 1.809.564.344", topRank="Czar #31", bars=[100%, 91%, 88%]. Tek karaktere düşürünce panel gizleniyor ✅



  - **Frontend** (`pages/Profile.jsx`):
    - `useSWR('/leaderboard')` eklendi (memberIds boş olduğunda skip). Position + total_points map'i oluşturuluyor, her linked member'a `position` + `total_points` field'ları enrich ediliyor.
    - Chip listesi zenginleştirildi: Her karakter için ayrı stat kartı (yeşil-tint border) → header satırında rank badge + name + alliance + X (kaldır), altında 3 sütunlu grid: **Sıra** (`Trophy` altın ikon, `#N` veya `—`), **Bireysel Güç** (`Zap` turuncu ikon, TR-locale formatı `1.809.564.344`), **Kale** (`Castle` mor ikon, `F8`).
    - Data-testid'ler: `profile-linked-chip-{id}`, `profile-linked-stats-{id}`, `profile-linked-name-{id}`, `profile-linked-position-{id}`, `profile-linked-power-{id}`, `profile-linked-castle-{id}`, `profile-linked-remove-{id}`.
    - Kaldır butonu 4×4 → 6×6'ya büyütüldü, kart layout'una uygun. i18n mevcut anahtarlar tekrar kullanıldı (`sort`, `bireysel_guc`, `castle_level`) — yeni anahtar eklenmedi.
  - **Doğrulama** (Playwright): 3 top-power üye linked → chips=3, stats=3 kart, positions=[#56, —, #31], powers=`['1.809.564.344', '1.638.476.195', '1.585.140.747']`, castles=[F8, F8, F8]. Kartlar tam olarak render, kaldır butonu yerinde ✅



  - **Backend `auth.py`**:
    - Şema değişikliği: `User.member_id: Optional[str]` → `member_ids: List[str]` (default []). `public_user()` legacy string field'ı listeye migrate ediyor + null/empty entry'leri temizliyor.
    - Yeni endpoint'ler (user self-service): `POST /api/auth/link-members {member_ids:[…]}` (full replace/unlink), `POST /api/auth/link-members/add {member_id}` (`$addToSet` idempotent), `POST /api/auth/link-members/remove {member_id}` (`$pull`). Eski `POST /auth/link-member` kaldırıldı.
    - Admin: `PATCH /api/users/{id} {member_ids:[…]}` — çakışan seat'leri auto-detach (`$pull` other users). Boş `[]` unlink olarak çalışıyor (`exclude_unset=True`).
    - `GET /api/users/unmatched` — `member_ids` boş VE legacy `member_id` yok olan kullanıcıları döner.
    - Startup migration (`ensure_indexes`): legacy `member_id` string alanı olan kullanıcıları tek seferlik `member_ids: [old_id]`'e migrate ediyor + eski alan unset. Sparse index `users.member_ids` üzerine.
  - **Push filtering** (`routes/push.py` + `server.py` legacy `_broadcast_push`): Alliance filter artık `member_ids` listesinden HER BİRİNİ kontrol ediyor (legacy `member_id` fallback ile). Global opt-out (notification_enabled=false) korunuyor.
  - **Frontend**:
    - `components/LinkMemberDialog.jsx` yeniden yazıldı: Checkbox tabanlı multi-select modal. `Set<string>` state, "2 seçildi" sayacı, "Tümünü Kaldır" butonu, `Kaydet (N)` submit. Data-testid'ler: `link-member-dialog`, `link-member-opt-{id}` (aria-pressed=isSel), `link-member-count`, `link-member-clear-selection`, `link-member-submit`, `link-member-cancel`.
    - `Profile.jsx`: "Bağlı Karakterler" kartı — SWR `/members` ile isim resolve edilip her karakter için yeşil chip (rank badge + isim + alliance + kırmızı X). X tıklanınca `POST /auth/link-members/remove`. Chip listesinin altında amber "+ Karakter Ekle" butonu (0 karakterse "Hesap Bağla"). Testid: `profile-linked-members-card`, `profile-linked-chip-{id}`, `profile-linked-remove-{id}`.
    - `Members.jsx`: Header'daki "Hesap Bağla" chip'i artık `linked_member_count: 2 karakter bağlı` gösteriyor (linked count > 0 iken yeşil, yoksa amber).
    - `UserManagement.jsx`: Her satırda bağlı karakterlerin virgülle ayrılmış isim listesi (`linkedList.map(m => m.name).join(", ")`). Admin link butonu multi-select modal açıyor.
    - 11 yeni i18n anahtarı TR + EN (`linked_members`, `linked_member_count`, `add_member`, `remove_member`, `selected_count`, `link_account_desc_multi`, `confirm_remove_linked`, vb.).
  - **Doğrulama (curl E2E)**:
    - Migration: leftover `[None]` entries `$pull None` ile temizlendi (2 doc etkilendi) ✅
    - `POST /auth/link-members {member_ids:[M1,M2,M3]}` → count=3 ✅
    - `POST /auth/link-members/add {M4}` → count=4 ✅
    - Aynı ID tekrar add → count=4 (idempotent) ✅
    - `POST /auth/link-members/remove {M2}` → count=3 ✅
    - Pasha'nın admin'in M1'ini alma denemesi → 409 "Bu üye zaten 'admin' hesabına bağlı" ✅
    - Admin `PATCH /users/{pasha_id} {member_ids:[M1,M2]}` çakışıyor → auto-detach admin'den, pasha 2 karaktere sahip ✅
    - Bulk unlink `{member_ids:[]}` → count=0 ✅
  - **UI smoke** (Playwright): Profile 2 chip render + 164 seçenekli multi-dialog + "2 seçildi" + "Kaydet (2)" ✅ · UserMgmt unmatched=14 (admin bağlı olduğu için 15'ten 14'e düştü) ✅


- **[2026-02] Üye Eşleştirme Sistemi (Member Matching v1 — tek seçim) — DEPRECATED (çoklu seçime geçildi)**:
  - **Backend `auth.py`**:
    - User modeline `member_id: Optional[str]` + `notification_enabled: bool=True` alanları eklendi. `public_user()` her ikisini de dönüyor. `UpdateUserBody` bu alanları alacak şekilde genişletildi.
    - Yeni endpoint'ler: `POST /api/auth/link-member` (user self-link, `LinkMemberBody{member_id}`) — 404 üye yok, 409 başka hesaba bağlı, null ile unlink. `POST /api/auth/notification-preference` (user toggle, `NotificationPrefBody{enabled}`).
    - Admin: `GET /api/users/unmatched` — member_id null/eksik olan kullanıcılar. `PATCH /api/users/{id}` `member_id` ve `notification_enabled` alanlarını override edebiliyor. `exclude_unset=True` sayesinde `member_id:null` gönderimi de unlink olarak işleniyor. Aynı üye başka bir kullanıcıya bağlıysa admin PATCH auto-detach yapıyor.
    - MongoDB: `users.member_id` sparse index eklendi (ensure_indexes).
  - **Bildirim akışı**: `routes/push.py` `broadcast_push` + `broadcast_test` + `server.py` legacy `_broadcast_push` — `notification_enabled=False` olan kullanıcıların abonelikleri `opted_out_users` seti ile filtrelenip atlanıyor. Group/alliance filtreleri sonrası ek katman olarak çalışıyor.
  - **Frontend**:
    - Yeni reusable component `/app/frontend/src/components/LinkMemberDialog.jsx`: Arama kutulu üye seçici modal, `mode="self"` (POST /auth/link-member) veya `mode="admin"` (PATCH /users/{id}). Data-testid'ler: `link-member-dialog`, `link-member-search`, `link-member-opt-{id}`, `link-member-submit`, `link-member-unlink`.
    - `pages/Profile.jsx`: Yeni "Bağlı Karakter" kartı (linked name/rank/alliance veya "Karakter bağlanmamış") + "Hesap Bağla" butonu. Yeni "Bildirimler" toggle satırı (Switch, `POST /auth/notification-preference` ile senkron). Testid: `profile-linked-member-card`, `profile-link-member-btn`, `profile-notification-toggle`.
    - `pages/Members.jsx`: Header'a giriş yapmış kullanıcı için "Hesap Bağla" chip'i (link edilmişse yeşil "Bağlı Karakter" olarak). LinkMemberDialog kullanıyor. Testid: `members-link-account-btn`.
    - `pages/UserManagement.jsx`: Sayfa üstünde amber-border "Eşleştirilmemiş Kullanıcılar" paneli (`unmatched-users-panel`, count rozeti). Her ana kullanıcı satırında bağlı karakter ismi ("Bağlı: X" yeşil) + amber Link2 butonu (`user-link-btn-{id}`). Admin dropdown/modal LinkMemberDialog ile açılıyor.
    - i18n: 21 yeni anahtar TR + EN (`link_account`, `linked_member`, `unlink_account`, `notification_toggle_*`, `unmatched_users`, `admin_link_member`, `linked_to`, vb.).
  - **Doğrulama (curl E2E)**:
    - `POST /auth/link-member` admin+valid id → 200 member_id set ✅
    - `POST /auth/notification-preference {enabled:false}` → 200 notification_enabled=false ✅
    - `POST /auth/link-member {member_id:null}` → 200 unlink ✅
    - `GET /users/unmatched` admin → 200 15 kullanıcı; pasha → 403 ✅
    - `POST /auth/link-member` çakışan üye ile → 409 "Bu üye zaten X hesabına bağlı" ✅
    - Admin `PATCH /users/{pasha_id} {member_id: M}` çakışıyorsa auto-detach → 200 ✅
    - Admin `PATCH /users/{id} {member_id: null}` → 200 unlink (exclude_unset fix) ✅
    - Admin `PATCH /users/{id} {notification_enabled:false}` → 200 ✅
  - **UI smoke** (Playwright): `/profil` linked_card + toggle + link_btn render ✅ · `/uyeler` header link_account_btn render ✅ · `/kullanicilar` unmatched_panel + count=15 render ✅



- **[2026-02] Archive Group Total Summary — DONE**:
  - **Frontend** (`Leaderboard.jsx`): Archive tab now renders a new `archive-group-total` section between the group chip strip and the event cards. Visible only when a specific group chip is selected (Tümü ➜ hidden). Uses the existing `/api/leaderboard?scope=archived&group_name=X` endpoint (which already aggregates points across every event in the group with multiplier weighting). Rows are ranked, clickable (opens MemberProfileDialog), and testid'd `archive-group-total-row-{id}`.
  - **UX**: Distinct card container (dashed orange border + gradient tint) sets it apart from individual event cards. Individual archived event cards remain visible below, satisfying "bireysel etkinlik puanlarıyla birlikte görünsün".
  - **i18n**: `archive_group_total_title` (TR: "{{group}} Grup Toplam", EN: "{{group}} Group Total").
  - **E2E verified**: `Pre` group returns 82 ranked rows (Selenay 511M top, oOoHavan4oOo 380M, Grumpy Deanerys 263M). `Kontrol` returns 0 rows (test event has no points). Screenshot confirms mobile layout renders correctly, section hides when no group is picked, and event cards show below when scrolling.

- **[2026-02] Events Page — Group Management (Rename / Archive / Unarchive / Delete) — DONE**:
  - **Backend** (`server.py`): 3 new endpoints alongside the existing `/events/archive-group`:
    - `POST /api/events/unarchive-group?group_name=` → flips all archived events in the group back to active.
    - `POST /api/events/rename-group?old_name=&new_name=` → renames `group_name` across every event in the group; rejects empty new_name; returns `{modified, new_name}`.
    - `DELETE /api/events/group/{group_name}` → cascades: deletes all events in the group plus every point tied to those events. Returns `{events_deleted, points_deleted}`.
  - **Frontend** (`Events.jsx`): For each group header row, added a `CanEdit`-gated action bar to the right:
    - **Rename**: pencil button → swaps the group title with an autofocused input (`event-group-rename-input-{group}`); Enter/Save commits, Esc/Cancel aborts. Success toast `group_renamed: "old → new"`.
    - **Move to Archive** (`event-group-archive-{group}`) — visible in Active tab only.
    - **Unarchive** (`event-group-unarchive-{group}`, `ArchiveRestore` icon) — visible in Archive tab only.
    - **Delete** (`event-group-delete-{group}`) — confirm modal warns about cascade delete of events + points.
  - **i18n**: 10 new keys (TR + EN) — `group_move_archive`, `group_unarchive`, `group_rename`, `group_delete`, `group_renamed`, `group_unarchived`, `group_deleted`, `confirm_unarchive_group`, `confirm_delete_group`.
  - **E2E verified via curl**: full round-trip `create → rename (TestGroup→Renamed) → archive → unarchive → delete` — every step returns expected `modified`/`deleted` counts and post-condition GET reflects the change.

- **[2026-02] Leaderboard Active/Archive Scope Filter — DONE**:
  - **Backend `/api/leaderboard`**: New `scope=active|archived` query param. Filters points to only include events matching the picked archived state; when combined with `group_name` both filters intersect in a single events-collection query.
  - **Frontend group-chip strip**: Now hides groups whose scoped event count is 0. Active tab shows only groups with active events; Archive tab shows only groups with archived events. New test-ids: `leaderboard-group-strip`, `leaderboard-group-all`, `leaderboard-group-{name}`. Picking a group in Archive tab also narrows the visible archived event cards (`visibleArchivedEvents = group ? archivedEvents.filter(...) : archivedEvents`).
  - **Frontend fetch**: `useSWR` URL now includes `scope=active|archived` alongside optional `group_name`.
  - **Tab-flip reset**: `useEffect(() => setGroup(null), [filter])` clears the selected group when switching tabs so a stale selection doesn't leave the leaderboard empty.
  - **Bug fix**: Removed leftover archive-event-cards + modal + `<>...</>` fragment from a previous ambiguous request that had introduced a JSX mismatch and duplicate trailing block. Leaderboard.jsx compiles clean.
  - **E2E verified**: `/api/leaderboard?scope=archived&group_name=Pre` returns 82 rows (Selenay top with 511M pts). Screenshot confirms Active tab strip empty (no active events currently seeded).

- **[2026-02] Canlı Gösterge Paneli Bug Fix — DONE**:
  - **Root cause**: Two temporal-dead-zone regressions in `PushBroadcastPanel.jsx` introduced during recent chip-filter work:
    1. `tplSoundFilter` referenced by `visibleTemplates` and the filter chip strip but never declared as state.
    2. `visibleTemplates` (line 130) referenced `templates` before the `useSWR` declaration (line 282), causing `ReferenceError: Cannot access 'templates' before initialization`.
  - **Fix**: Added `const [tplSoundFilter, setTplSoundFilter] = useState("all")` alongside the other filter states. Moved `visibleTemplates` immediately below the `useSWR("/push/templates")` line so declaration order is correct.
  - **Verified via Playwright screenshot**: 0 page errors, `live-dashboard-page` renders, `push-tpl-filter-strip` visible, `NotificationSetupWizard` opens on first load.

- **[2026-02] Overflow Fix + Widget Nav Reorder + Language Switch Fix — DONE**:
  - **Overflow**: Added `html, body { overflow-x: hidden; max-width: 100vw; }` at the top of `index.css` and `overflow-x: hidden` on `.app-shell`. Prevents any horizontal scroll or content bleed on mobile.
  - **Widget Nav Reorder**: `BottomNav` now includes a new `nav-live-dashboard` tab (`/gosterge-paneli`, `Activity` icon, `nav_live_dashboard: "Panel"`) right before `nav-widget-library`. Mobile screenshot confirms 8 tabs render in the exact requested order. Both new tabs are auth-only.
  - **Language Switching — Full Bundle DeepL Translation**: Rewrote `/app/frontend/src/lib/deeplTranslate.js#ensureLanguageTranslated` to translate **the entire TR resource bundle** (not just ~40 curated UI keys) for the picked target language. Chunked into batches of 60, cached in localStorage under `ol_deepl_cache_v1`, merges into i18next via `addResourceBundle` after each chunk so partial progress survives network hiccups. Emits `languageChanged` when done to force any consumer to re-render with the freshly added keys. E2E verified with Bulgarian (`bg`): 720 keys translated + cached, `nav_leaderboard` → `Класиране`.
  - **LanguageSwitcher UX**: Picker is now async — `setLang` awaits `i18n.changeLanguage` first (immediate visible switch of any already-loaded keys), then shows a `sonner` `loading` toast (`Bulgar yükleniyor…`), swaps a `Loader2` spinner in place of the check on the active row, and finishes with a success toast reporting the number of newly-translated keys. Cached languages resolve instantly and show `{{name}} etkinleştirildi`.
  - **i18n**: 3 new keys (TR + EN) — `nav_live_dashboard`, `lang_switching`, `lang_switched`, `lang_switched_cached`.
  - **Frontend compiled clean** (only pre-existing WidgetGrid warning). Preview live at `https://oyun-loncasi.preview.emergentagent.com/`.

- **[2026-02] Custom Snooze Picker + Snoozed Badge — DONE**:
  - **Custom Snooze**: Short-clicking the `+15dk` chip still snoozes by 15 minutes. Long-pressing (~500ms), right-clicking, or touch-holding it now opens a compact `push-sched-snooze-picker-{id}` dropdown with four choices: `+5dk`, `+30dk`, `+1s`, and `Özel…`. Custom option raises a native prompt (`push_sched_snooze_custom_prompt`) with client-side validation (1–1440 min → invalid raises `push_sched_snooze_custom_error` toast). Outside-click / Escape closes the picker. Each option testid'd `push-sched-snooze-opt-{5|30|60|custom}-{id}`.
  - **Snoozed Badge**: When a scheduled doc carries `snoozed_by_minutes`, the card renders an extra purple pill `push-sched-snoozed-badge-{id}` next to the existing repeat/group/alliance badges. Tooltip shows the exact snooze duration.
  - **i18n**: 8 new keys (TR + EN) — `push_sched_snooze_hint`, `push_sched_snooze_5/30/60/custom`, `push_sched_snooze_custom_prompt/error`, `push_sched_snoozed_badge`, `push_sched_snoozed_badge_title`.
  - **E2E**: Backend `POST /api/push/scheduled/{id}/snooze` already whitelist-validates 1–1440. Curl-verified: `+5` → `snoozed_by=5`, `+45` (custom) → `snoozed_by=45`.

- **[2026-02] Play On Receive + Snooze Scheduled — DONE**:
  - **Play On Receive**: Extracted `previewSound` into a shared module `/app/frontend/src/lib/pushSound.js` (`playPushSound(key)` — accepts `rally|victory|dungeon|alarm`, uses `/audio/epic_battle.mp3` for rally and Web Audio API synthesis for the rest). New `PushSoundListener.jsx` component (mounted once inside `App.js` alongside `<Toaster>`) subscribes to `navigator.serviceWorker.addEventListener("message")` and auto-plays the cue whenever the SW forwards `{type:"push-sound", sound}`. Silent no-op when SW isn't registered or the browser blocks autoplay.
  - **Snooze Scheduled**: New backend endpoint `POST /api/push/scheduled/{id}/snooze` (`PushSnoozeBody: {minutes: int}`) validates `1 ≤ minutes ≤ 1440`, snoozes from `max(scheduled_at, now)` so overdue items always land in the future, and persists `snoozed_at` + `snoozed_by_minutes` on the doc. Bug-fix during ship: replaced `int(body.minutes or 15)` with an explicit `is not None` check so `minutes=0` correctly returns HTTP 400 instead of falling back to 15.
  - **Frontend**: Purple `+15dk` button (`push-sched-snooze-{id}`) renders next to the trash icon on every scheduled card. Click toasts `push_sched_snoozed` with the new firing time and refreshes the SWR list.
  - **i18n**: 2 new keys (TR + EN) — `push_sched_snooze_15`, `push_sched_snoozed`.
  - **E2E verified via curl**: Create → GET returns `scheduled_at=T`. Snooze +15 → GET returns `scheduled_at=T+15min` and `snoozed_by_minutes=15`. Non-existent id → 404. Cleanup delete → `{"deleted":1}`.

- **[2026-02] Sound On Schedule + Target Group Filter — DONE**:
  - **Backend `PushScheduledBody`**: Added `sound` (whitelist: `rally|victory|dungeon|alarm`, invalid → clamped to `rally`) and `alliance_name` fields. `group_name` already existed. All three persist on the scheduled doc.
  - **Backend `_push_scheduler_loop`**: Now passes `sound`, `group_name`, and `alliance_name` into `_broadcast_push` so recurring/one-off pushes fire with the right cue and audience.
  - **Backend `_broadcast_push`**: New `alliance_name` and `sound` parameters. `alliance_name` resolves subscribers via `members.alliance_name` + `users.member_id` linkage; combined with `group_name` filter it becomes an intersection. `sound` is injected into the push JSON payload.
  - **Service Worker**: On `push` event, extracts `data.sound` and `postMessage`'s `{type:"push-sound", sound, tag}` to every open window so the main app can play the cue in real-time. Sound is also stored in notification `data` for click-time playback.
  - **Frontend UI (main form)**: New `push-sched-target-row` renders below the datetime picker with two selects — `push-sched-group-select` (populated from `/api/push/event-groups`), `push-sched-alliance-select` (populated from `/api/alliances`) — and a live color-dot + label showing the current `testSoundKey`. All three values are POSTed on schedule.
  - **Frontend UI (template modal)**: Same picker set (`push-tpl-group-select`, `push-tpl-alliance-select`, `push-tpl-target-sound-dot`) inside the "Bu Şablonu Zamanla" modal. Template's own `sound` (if any) is used; else falls back to picker preference.
  - **Frontend UI (scheduled list)**: Each card gets a colored sound dot (`push-sched-sound-dot-{id}`), plus optional pink group badge and blue alliance badge when set.
  - **i18n**: 5 new keys (TR + EN) — `push_sched_target`, `push_sched_group`, `push_sched_group_all`, `push_sched_alliance`, `push_sched_alliance_all`.
  - **E2E verified via curl**: `sound=victory + alliance_name="TitanX" + group_name="Rally"` persisted and returned correctly; `sound="garbage"` clamped to `rally`.

- **[2026-02] Scheduled Broadcast Enhancements — DONE**:
  - **Backend past-date guard**: `POST /api/push/scheduled` now returns HTTP 400 `"scheduled_at is in the past"` when the requested time is more than 60 seconds behind server clock. Confirmed via curl (`2020-01-01T00:00:00Z` → 400, `+2h` → 200).
  - **Frontend past-date guard**: Both the main broadcast form (`send()`) and template-schedule modal (`scheduleFromTemplate()`) now toast `push_sched_past_error` and abort before hitting the API when the picked local time is >60s in the past.
  - **Quick Preset Chips**: New `push-sched-quick-row` renders four dashed pill buttons — `+1sa`, `+6sa`, `Yarın 09:00`, `Cumartesi 20:00` — each fills the `datetime-local` input with a proper local-TZ formatted value via `toLocalInputValue()`. Tooltips show the resolved absolute time.
  - **Relative Countdown Badge**: Each scheduled card now renders a purple `push-sched-relative-{id}` chip next to the absolute timestamp, updated every 30s via a `nowTick` interval. Shows `Yg`/`sa`/`dk` for the largest two units, or `Şimdi ateşleniyor` when the item is within 60s of firing.
  - **i18n**: Added 12 keys (TR + EN) — `push_sched_quick`, `push_sched_in_1h`, `push_sched_in_6h`, `push_sched_tomorrow_9`, `push_sched_saturday_20`, `push_sched_past_error`, `push_sched_fires_in`, `push_sched_fires_now`, `push_sched_time_d/h/m`.

- **[2026-02] Toplu Ses Ataması + Filtre Sayaç Rozeti — DONE**:
  - **Bug-fix**: The earlier chip-filter block referenced `templates` before its `useSWR` declaration. Moved `tplSoundFilter/chipCtx/changeTplSound/visibleTemplates` to below the `templates`/`refreshTpl` line, eliminating the "Cannot access 'templates' before initialization" runtime crash.
  - **Filtre Sayaç Rozeti**: Each filter chip in `push-tpl-filter-strip` now shows a live count next to its color dot (`push-tpl-filter-count-{k}`). Empty filters render at 40% opacity so admins avoid dead clicks. Title tooltip includes the count.
  - **Toplu Ses Ataması**: When `tplSoundFilter !== "all"` AND at least one template matches, a "Tümüne {sound} uygula" button appears at the end of the filter strip (`push-tpl-bulk-apply`). Clicking prompts a confirm dialog, then PATCHes every visible template's sound to the currently-picked `testSoundKey` in parallel, refreshes, and toasts the result count. Button color matches the picked sound.

- **[2026-02] Kart Ses Değiştir + Kart Rozet Filtresi — DONE**:
  - **Backend**: New `PATCH /api/push/templates/{id}/sound` endpoint (admin-only) — accepts `{sound}`, validates against the same 4-key whitelist, returns 400 on invalid input. E2E via curl: `dungeon` accepted, `bogus` rejected.
  - **Kart Ses Değiştir**: Right-click / long-press context menu on any saved-template chip. Menu (`push-tpl-ctx-{id}`) shows the 4 sound options with color dots; the current sound is highlighted with a `✓`. Clicking calls the PATCH endpoint, refreshes the strip, and toasts "Şablon sesi güncellendi". Outside-click / Escape closes the menu.
  - **Kart Rozet Filtresi**: Added a compact color-chip strip (`push-tpl-filter-strip`) between the "ŞABLONLAR:" label and the template chips. 5 chips: All (purple), Rally, Victory, Dungeon, Alarm. Active chip gets an outer glow + larger size; inactive chips render as small tinted circles. `visibleTemplates` filters `templates` by the selected sound.

- **[2026-02] Kart Ses Rozeti + Şablondan Otomatik Ses Preview — DONE**:
  - **Kart Ses Rozeti**: Each saved template card in the `push-templates-strip` now renders a 7×7 colored glow dot to the left of its name — **rally** = `#E74C1A` (orange), **victory** = `#22C55E` (green), **dungeon** = `#A855F7` (purple), **alarm** = `#F5A623` (amber). Missing/unknown sound falls back to `rally`. Testid `push-tpl-sound-dot-{id}`; hover title translates to the sound label. `SOUND_COLORS` constant centralizes the mapping.
  - **Şablondan Otomatik Ses Preview**: `applyTemplate(tpl)` now also calls `setTestSoundKey(tpl.sound)` when the incoming template carries a valid saved sound. Because the picker is a controlled `<select>` bound to `testSoundKey`, opening the detail modal (or firing "Ses Dene") immediately reflects the template's saved cue. Combined with `titanxis_push_test_sound_v1` persistence, admins always land on the right sound.
  - E2E verified: templates with `sound: victory` render green dots, `sound: rally` render orange; clicking Apply on a Victory template updates `localStorage.titanxis_push_test_sound_v1` from `rally` → `victory`, so any subsequent detail modal open pre-selects Victory in the picker.

- **[2026-02] Şablon Ses Kaydı + Ses Tercih Kaydı — DONE**:
  - **Backend**: Extended `PushTemplateBody` with `sound: Optional[str] = "rally"`. `POST /api/push/templates` validates against the whitelist `{rally, victory, dungeon, alarm}` (falls back to `rally` on invalid values) and persists `sound` on each doc. `GET /api/push/templates` returns it alongside the existing fields.
  - **Frontend**: `installOne` (single-template Detay install) and the bulk seeder both pass `sound: testSoundKey` when posting. Each installed template now remembers which alert cue it was configured with.
  - **Ses Tercih Kaydı**: New localStorage key `titanxis_push_test_sound_v1` — `testSoundKey` initializes lazily from localStorage (with whitelist validation), and a `useEffect` writes any change back. So an admin's last-picked sound sticks across sessions and page reloads.
  - E2E verified via curl: posted with `sound: "victory"` → persisted as `victory`; posted with `sound: "garbage"` → clamped to `rally`; GET returns both templates with their correct sound field.

- **[2026-02] Ses Kütüphanesi + Combobox Klavye Navigasyonu — DONE**:
  - **Ses Kütüphanesi**: Detail modal footer now has a sound `<select>` (`push-tpl-detail-sound-select`) with 4 options: **Rally** (`/audio/epic_battle.mp3` file, 3s), **Zafer** (Web Audio 3-note ascending chord C5→E5→G5), **Zindan** (deep sawtooth A2 + D3 for a dungeon horn feel), **Alarm** (4 rapid square-wave 880Hz beeps). Rally still plays the MP3 file; the other three are synthesized live via `AudioContext` (no additional binary assets). Existing "Ses Dene" button routes through `previewSound` which dispatches to the chosen library entry. `push_test_sound_{rally,victory,dungeon,alarm}` i18n keys added (TR + EN).
  - **Combobox Klavye Navigasyonu**: Added `testUserActive` index state and hooked `ArrowDown / ArrowUp / Enter / Home / End` on the combobox search input. Active option shows a highlighted background + outline via `aria-selected` on `push-tpl-detail-target-user-opt-{id}`. `Enter` picks the active option, updates toggle label, closes popup. `onMouseEnter` keeps active index in sync so keyboard and mouse users share the same highlight.
  - E2E verified: sound select renders 4 options, changing to "Victory" triggers the synthesized 3-note pattern (label flips to "Çalıyor…"); ArrowDown ×3 + ArrowUp moves highlight through 3 members then back one, Enter picks the highlighted member and closes the popup.

- **[2026-02] Test Ses Denemesi + Alıcı Combobox — DONE**:
  - **Test Ses Denemesi**: Purple "Ses Dene" button (`push-tpl-detail-sound-preview`, Volume2 icon) in the detail modal footer plays `/audio/epic_battle.mp3` at 60% volume for ~3s. Label flips to "Çalıyor…" during playback. Catches autoplay-block errors and toasts a permission hint. Reuses a single `Audio` instance via ref.
  - **Alıcı Hızlı Ara**: Replaced the static `<select>` with a searchable combobox. Toggle button (`push-tpl-detail-target-user-toggle`) opens a popup with an autofocused search input; filters members case-insensitively by name; shows top 50 results plus a "+N daha" hint when truncated. Outside-click and Escape close the popup. Each option testid'd `push-tpl-detail-target-user-opt-{id}`.
  - Bug-fix during ship: `memberList` `useSWR` had been placed after its consumer `filteredMembers` — hoisted it above and removed the duplicate declaration.
  - E2E verified: combobox opened, `"adm"` filtered to 1 match, selecting `admin` set the toggle label + closed the popup; sound button label became "Çalıyor…" with tab audio indicator visible.

- **[2026-02] Ses Denemesi + Alıcı Combobox — DONE**:
  - **Test Ses Denemesi**: Purple "Ses Dene" button (`push-tpl-detail-sound-preview`, `Volume2` icon) in the detail modal footer. Plays `/audio/epic_battle.mp3` at 60% volume for ~3s; label flips to "Çalıyor…" during playback. Catches autoplay-block errors and toasts a permission hint. Reuses a single `Audio` instance via ref.
  - **Alıcı Hızlı Ara**: Replaced the static `<select>` (166 members) with a searchable combobox — toggle button (`push-tpl-detail-target-user-toggle`) opens a popup (`push-tpl-detail-target-user-popup`) with an autofocused search input, filters members case-insensitively by name, shows top 50 results + "+N daha" hint when the list is truncated. Outside-click and Escape close it. Options are testid'd `push-tpl-detail-target-user-opt-{id}`.
  - E2E verified: combobox opens, `"adm"` filters to matching members, selecting one updates the toggle label and closes the popup; sound button label flips to "Çalıyor…" during ~3s playback (or toasts autoplay-blocked if the browser prevents it).

- **[2026-02] Detaydan Test Gönder + Alıcı Seçici — DONE**:
  - **Backend**: New `POST /api/push/broadcast/test` endpoint (`PushTestBody`: `title, body, url, target, user_id?`). Target filter: `me` → caller's subscriptions only; `admins` → all users with `role=admin`; `user` → single `user_id`. Reuses VAPID keys + webpush; auto-deletes 404/410 subs. Returns `{sent, removed, target, matched_users}`. Admin-only via `require_admin`.
  - **Frontend Detail Modal**: Added a segmented control (`push-tpl-detail-target-me/admins/user`), a member `<select>` (`push-tpl-detail-target-user-select`) fed by `/api/members`, and a **Test Gönder** button (`push-tpl-detail-test-send`) next to Install. Send calls `/push/broadcast/test` with the currently-edited title/body/url and selected target. Toast confirms `{sent}` count. Install button unchanged. New i18n keys `push_test_*` in TR + EN.
  - E2E verified (curl): `target=me` → HTTP 200 `{"sent":0,"removed":0,"matched_users":1}`, `target=admins` → matched all admins, `target=user` without id → HTTP 400 "user_id required". UI: 3 target pills render, switching to "Tek Üye" reveals the member dropdown, Test Gönder fires the endpoint successfully.

- **[2026-02] Kütüphane Klavye + Detay Modal — DONE**:
  - **Klavye Kısayolu**: Modal-scoped keydown handler focuses the search input on `/` press (unless the user is already typing in another input/textarea/contenteditable). Placeholder now hints at the shortcut. Listener only mounted while `seedModalOpen`, cleaned up on close.
  - **Detay Modal**: Each row gets a **"Detay"** pill button (`push-tpl-seed-detail-{key}`). Clicking opens a wider `push-tpl-detail-modal` (max-w-2xl) at `z-[110]` with a 2-column layout: editable title / body / URL on the left, live push preview on the right (uses same TiTaNXiS icon + native-style layout, updates as you type). "Bu Şablonu Kur" installs the customized copy via `POST /api/push/templates`. Cancel + click-outside close. E2E verified: edit title/body/URL → preview updates → install → template persists in the DB with customized copy.

- **[2026-02] Kütüphane Arama + Önizleme — DONE**:
  - **Arama (search box)**: Added a `seedSearch` text input `[data-testid="push-tpl-seed-search"]` at the top of the Şablon Kütüphanesi modal. `seedVisible` now composes tab-filter + case-insensitive text-filter against each template's `name`, `title` and `body`. Empty state `[data-testid="push-tpl-seed-empty"]` renders "Aramaya uyan şablon yok." when nothing matches. E2E verified: `"rally"` → 2 rows (rally_15, rally_now), `"sezon"` → 1 row (new_season), `"xyz123"` → empty state.
  - **Hover önizleme**: Each row tracks a `seedHover` state via `onMouseEnter/Leave` (plus focus/blur for keyboard). While hovered, a floating preview bubble `[data-testid="push-tpl-seed-preview-{key}"]` positions itself just below the row and renders a native-style push mock: TiTaNXiS PWA icon (192px), bold title, body, "TiTaNXiS · şimdi" footer — orange-bordered card with dark gradient background. Rendered inside the scrollable row list so it clips cleanly. New i18n keys `push_tpl_search_placeholder`, `push_tpl_no_match`, `push_tpl_preview_title` (TR + EN).

- **[2026-02] Chip Menu ESC + Kütüphane Kategorileri — DONE**:
  - **Chip Menu ESC Kapat**: Extended the outside-click `useEffect` in `WidgetGrid.jsx` to also register a `keydown` listener that closes the chip settings popover on `Escape`. Cleanup removes both listeners. E2E verified: gear click → menu open → ESC → menu closed.
  - **Push Şablon Kütüphanesi Kategorileri**: Added `category` field to each of the 10 `CURATED_TEMPLATES` — **Rally** (3: rally_15, rally_now, boss_spawn), **Etkinlik** (5: new_event, duel_start, svs_final, new_season, signup_end), **Sistem** (2: reward, maint). Modal now renders a `TEMPLATE_CATEGORIES` tab strip (Tümü / Rally / Etkinlik / Sistem) each with a live count pill. Selecting a tab filters `seedVisible`. "Hepsini Seç" respects the current tab (only selects visible ones). Testids: `push-tpl-seed-tabs`, `push-tpl-seed-tab-{all|rally|event|system}`. New i18n keys `push_tpl_cat_*` in TR + EN.

- **[2026-02] Şablon Kütüphanesi + Chip Menu Outside-Click Close — DONE**:
  - **Push Şablon Kütüphanesi** (`PushBroadcastPanel.jsx`): Replaced the single-shot 3-template seeder with a `CURATED_TEMPLATES` array of **10 hand-tuned templates** — Rally 15dk (⚔️), Rally Başladı (⚔️), Yeni Etkinlik (🏆), Duello Başladı (🥊), SvS Finali (🏰), Yeni Sezon (🌟), Boss Doğdu (🐉), Ödül Dağıtıldı (🎁), Kayıt Sonu (⏰), Bakım Duyurusu (🛠️). Clicking "Şablon Kütüphanesi" opens a modal `[data-testid="push-tpl-seed-modal"]` listing each template with title/body/URL preview + a checkbox. "Hepsini Seç" / "Temizle" bulk actions, install button shows the live count. `POST /api/push/templates` per selected template. Testids: `push-tpl-seed-overlay`, `push-tpl-seed-row-{key}`, `push-tpl-seed-check-{key}`, `push-tpl-seed-selectall`, `push-tpl-seed-clear`, `push-tpl-seed-install`, `push-tpl-seed-cancel`. New i18n keys `push_tpl_library_*`, `push_tpl_install_n`, `push_tpl_installing`, `push_tpl_select_all`, `push_tpl_clear_all` in TR + EN.
  - **Chip Menu Outside-Click Close** (`WidgetGrid.jsx`): Added `chipStripRef` on the group-nav strip container and a `mousedown` document listener (mounted only while `chipMenuOpen` is set). Any click outside the entire chip strip closes the popover, matching native dropdown behavior. Cleanup on unmount. E2E verified: gear click → menu open → outside-click → menu closes.

- **[2026-02] Chip Settings Menu + Push Template Seeder — DONE**:
  - **Chip Settings Menu** (`WidgetGrid.jsx`): Added `Settings2` gear button next to every group chip. Clicking toggles a popover (`chipMenuOpen` state) anchored to the chip with: name input (Enter to save, blur to save, Esc to cancel), 7 color swatches, 16 emoji buttons + clear (`×`), and an "Grubu çöz" (ungroup) shortcut + Close. Uses the same `setGroupName`/`setGroupColor`/`setGroupIcon`/`ungroup` handlers as the header controls. Chip wrapper converted from flat `<button>` to `<div className="relative flex">` so the popover positions correctly. New i18n key `wg_group_chip_settings` (TR + EN).
  - **Push Template Seeder** (`PushBroadcastPanel.jsx`): When `templates.length === 0`, a dashed purple hint bar `[data-testid="push-tpl-seed-hint"]` appears with a "Hazır Şablonları Yükle" button. Click posts 3 defaults via `POST /api/push/templates`: (1) *Rally 15dk* → "⚔️ Rally 15 dakika sonra!", (2) *Yeni Etkinlik* → "🏆 Yeni etkinlik başladı", (3) *Bakım Duyurusu* → "🛠️ Kısa bakım duyurusu". SWR refreshes the strip. Hint bar auto-hides once at least one template exists. New i18n keys `push_tpl_seed_*`, `push_tpl_default_{rally,event,maint}_{name,title,body}` in TR + EN.

- **[2026-02] Wizard Re-open + Chip Chevron Toggle — DONE**:
  - **Wizard re-open**: `NotificationSetupWizard` now listens for a `titanxis:open-wizard` custom `window` event and re-mounts (`step=0, open=true`). New admin dropdown menu item `[data-testid="dropdown-reopen-wizard"]` labelled **"Kurulumu tekrar göster"** (Sparkles icon) clears `titanxis_notif_wizard_seen_v1` from localStorage and dispatches the event. Admin can revisit the whole install/push flow any time.
  - **Chip Chevron Toggle**: The chip count pill in the group-nav strip is now an interactive `role="button"` that fires `toggleGroupCollapsed(g.id)`. Renders `ChevronDown` + count when the group is expanded, `ChevronRight` + count when collapsed. Keyboard-accessible (Enter/Space). `event.stopPropagation()` prevents accidentally triggering the chip's `scrollToGroup` click. Hover title translated via `wg_group_chip_count_collapse_hint` / `wg_group_chip_count_expand_hint`. New i18n keys added to TR + EN.

- **[2026-02] Notification Setup Wizard + Grup Widget Sayısı — DONE**:
  - **NotificationSetupWizard** (`/app/frontend/src/components/NotificationSetupWizard.jsx`): 3-step onboarding modal for first-time admins (localStorage flag `titanxis_notif_wizard_seen_v1`). Auto-triggers 1.5s after admin logs in on the Live Dashboard page. Steps: (1) Welcome + benefit bullets, (2) Enable browser push (uses existing VAPID subscribe flow), (3) Install PWA — with platform-aware UX: `beforeinstallprompt` button for Chrome/Edge, step-by-step Share→Add-to-Home-Screen visual list for iOS Safari, manual menu instructions for Android/desktop fallback. Progress bar animates through 3 stages; `Skip / İleri / Tamamla` footer. Portal-rendered at `document.body` with `z-100` to sit above sticky nav. Testids: `notif-wizard-overlay`, `notif-wizard-modal`, `notif-wizard-step-welcome/push/install`, `notif-wizard-push-enable`, `notif-wizard-install-btn`, `notif-wizard-next/skip/finish/step-indicator/progress`. ~40 new i18n keys (`wiz_*`) added to TR + EN.
  - **Grup Widget Sayısı** (`WidgetGrid.jsx`): Each chip in the group-nav strip now renders a small tabular-nums count pill (`3`, `5`, …) tinted with the group's accent color, next to the name. Hover title says "N widget bu grupta". Testid `widget-group-chip-count-{gid}`. New i18n keys `wg_group_chip_count_hint` (TR + EN).
  - E2E verified with Playwright: wizard renders → step 1/2/3 navigation works → Finish sets `titanxis_notif_wizard_seen_v1=1` → overlay unmounts. Chip counts show `3` for a 3-widget group and `2` for a 2-widget group.

- **[2026-02] Widget Toplu Katla + iOS Splash + DeepL Cache Dot — DONE**: Three UX polish features shipped in one batch.
  - **Widget Toplu Katla** (`WidgetGrid.jsx`): New `[data-testid="widget-group-toggle-all"]` button in the widget-panel header appears whenever `groups.length > 0`. Smart-label: if any group is expanded the button reads "Hepsini katla" (`ChevronsDownUp` icon); once all groups are collapsed it flips to "Hepsini aç" (`ChevronsUpDown` icon). One click sets `collapsed:true`/`false` on every group; toast fires with `wg_group_all_collapsed`/`wg_group_all_expanded`. New i18n keys added to TR + EN.
  - **iOS Splash Ekranı**: Generated 11 splash PNGs into `/app/frontend/public/icons/splash/` (iPhone SE / X / XR / 14+ / 15 / 15 Pro / 15 Pro Max + iPad / iPad Air / iPad Pro 11 / iPad Pro 12.9) with the TiTaNXiS logo centered on `#0B0704` background surrounded by 3 concentric orange glow rings. `index.html` now has 11 `<link rel="apple-touch-startup-image">` tags with device-specific media queries so iOS picks the right splash when the PWA launches from Home Screen. Frontend restarted to bust webpack's `index.html` cache.
  - **Cache İpucu / Quota Dot** (`DeeplUsageBadge.jsx`): Added a 7×7 colored dot in the top-right corner of the cache-refresh button. Color: green `#22C55E` (<70%), amber `#F5A623` (70–89%), red `#f87171` (≥90%). Dot has a subtle glow and dark border so it reads on any background. Tooltip now also includes live quota percentage (`Cache Temizle · DeepL %X (used/limit)`). Testid `deepl-quota-dot`.

- **[2026-02] Header Logo + PWA/Favicon Refresh — DONE**: Rebranded the sticky header logo and the whole PWA/favicon icon set to the new TiTaNXiS Game Guide artwork.
  - **Header logo** (`Header.jsx`): Replaced remote `BRAND_LOGO_URL` with local `/brand/titanxis-logo.jpg` (downloaded 951KB, 1264×848 JPG). Sized down from `maxHeight: 120` to `maxHeight: 72` with `maxWidth: min(60vw, 320px)` and `width: auto` to keep proportional. `alt` updated to `"TiTaNXiS Game Guide"`.
  - **Favicons & PWA icons**: Downloaded the second asset (1254×1254) and generated a full icon set with Pillow into `/app/frontend/public/icons/`: `favicon-16.png`, `favicon-32.png`, `pwa-192.png`, `pwa-512.png`, `apple-touch-180.png`, plus a multi-size `favicon.ico` (16/32/48).
  - **`manifest.json`** rewritten to reference all local PNGs with proper sizes and `purpose: any` + `purpose: maskable` entries for 192 and 512.
  - **`index.html`** now uses the local `%PUBLIC_URL%/favicon.ico`, 16×16, 32×32 PNGs and a 180×180 apple-touch-icon; removed the remote-URL `apple-touch-icon` link.
  - All assets serve HTTP 200 through the preview ingress (verified via curl and `fetch()` inside Playwright). Header logo, PWA 192/512 and favicons all decode with correct natural dimensions.

- **[2026-02] DeeplUsageBadge → Icon-Only Cache Temizle Button — DONE**: Simplified the admin header cache-bust control in `/app/frontend/src/components/DeeplUsageBadge.jsx`. Removed the visible "Languages icon + `997k/1000k` character-count text" chip and reduced the whole component to a **single 32×32 circular icon button** containing only the `RotateCcw` refresh icon. Tooltip and `aria-label` both set to **"Cache Temizle"**. Kept all existing behaviour: 60-second background polling of `/translate/usage`, the once-per-session 90% quota warning toast, admin-only visibility, and the cache-clear flow (confirm → `clearTranslationCache()` → force i18n reload → success toast). Border/icon color still reflects quota state (green/amber/red) for at-a-glance status. Testid `deepl-clear-cache` unchanged.

- **[2026-02] Widget Grubu — Grup Katla + Grup Panosu Sürükle (P2) — DONE**: Final grouping polish in `WidgetGrid.jsx`:
  - **Grup Katla (collapse/expand)**: Group schema extended with `collapsed` boolean. New `ChevronDown`/`ChevronRight` toggle button in group header calls `toggleGroupCollapsed(gid)`. When collapsed, the widget grid inside the group is replaced by a compact banner `{n} widget gizli · aç için sağdaki oka bas`. Preserves all other state (name/icon/color/order). Testid: `widget-group-collapse-{id}`, `widget-group-collapsed-body-{id}`.
  - **Grup Panosu Sürükle**: Chips in the group-nav strip are now `draggable={true}` with `onDragStart` setting `draggingGroup` and `onDrop` calling `handleGroupDrop(tgtGid)` — reusing the existing swap logic. Dragging chips also highlights matching group containers in the widget grid (unified drop-target visual). Click still smooth-scrolls (drag and click co-exist because HTML5 D&D only triggers on move). Testid: `widget-group-chip-{id}` remains.
  - New i18n keys: `wg_group_collapse`, `wg_group_expand`, `wg_group_hidden_count` (TR + EN). Removed duplicate `wg_group_reordered` key in TR.

- **[2026-02] Widget Grubu — Grup Simgesi + Grup İçi Dizin (P2) — DONE**: Two final grouping polish features in `WidgetGrid.jsx`:
  - **Grup Simgesi (emoji picker)**: Group schema extended with `icon` field. New button in `GroupContainer` header (after `GripVertical`) toggles a popover with 16 curated emojis (`⭐ 🔥 ⚔️ 🛡️ 🏆 👑 💎 ⚡ 🎯 🎮 🌟 💰 🚀 🎨 📊 🔔`) — `GROUP_ICONS` constant. Selecting an emoji calls `setGroupIcon` + closes popover + toast `wg_group_icon_changed`. Button shows current icon or `＋` fallback. When icon is set, a `×` clear button appears in the popover to reset. The chip strip also renders the icon next to the color dot for at-a-glance scannability. Testids: `widget-group-icon-btn-{id}`, `widget-group-icon-palette-{id}`, `widget-group-icon-swatch-{id}-{emoji}`, `widget-group-icon-clear-{id}`.
  - **Grup İçi Dizin (position badge)**: `WidgetCard` accepts new `groupIndex` + `groupSize` props. When a card renders inside a group (and select-mode is off), a small bottom-left pill badge `[data-testid="widget-group-index-{key}"]` shows `1/N`, `2/N`, `3/N` — tinted with the group's accent color, tabular-nums for alignment. Hover title translates via `wg_group_index_hint`. Standalone (ungrouped) widgets never show the badge.
  - New i18n keys: `wg_group_pick_icon`, `wg_group_icon_changed`, `wg_group_index_hint` (TR + EN, others fall back to TR).

- **[2026-02] Widget Grubu — Sürükle-Bırak Swap + Grup Panosu (P1) — DONE**: Two more grouping polish features in `WidgetGrid.jsx`:
  - **Group-to-group drag swap**: `GripVertical` icon at the left of every group header, `draggable={true}`. New `draggingGroup` state in main component. Each group container acts as a drop-zone: when another group is being dragged, `onDragOver` highlights the target with a thicker border + brighter background gradient. On drop, `handleGroupDrop(tgtGid)` **swaps** the two groups' positions in both the `groups` array AND mirrors the swap in `enabled` (blocks of widgets rebuilt via a two-pointer walk). Toast `wg_group_reordered` ("Gruplar yer değiştirdi") fires. Testids: `widget-group-drag-{id}`. Widget-level drag inside groups still works (group's `onDragOver` only fires when `draggingGroup` is set — no collision).
  - **Grup Panosu nav strip**: Above the main widget grid, a horizontal chip strip `[data-testid="widget-group-nav"]` renders one chip per group `[data-testid="widget-group-chip-{id}"]` showing a color dot + name (falls back to `GRUP · N`). Clicking a chip smooth-scrolls the viewport to that group via `scrollIntoView`. Only visible when `groups.length > 0`.
  - New i18n keys: `wg_group_reordered`, `wg_group_drag_hint`, `wg_group_nav` (TR + EN).
  - E2E playwright verified: 2 groups (Alpha + Beta) with 2 widgets each, `drag_and_drop('widget-group-drag-g_A', 'widget-group-g_B')` swapped `[Alpha,Beta]→[Beta,Alpha]` and mirrored `enabled` widget block order; chip strip re-renders reflecting the new order; clicking Beta chip smooth-scrolls to Beta group.


- **[2026-02] Widget Grubu — Sıralama + İsim + Renk Seçici (P1) — DONE**: Extended widget grouping in `WidgetGrid.jsx`:
  - **Intra-group reorder**: `handleDrop` now reorders widgets *within* a group when src and target share the same `group.id`. Both `groups[i].widgets` and mirror `enabled` are updated so localStorage persists the visual order.
  - **Editable group name**: Group schema extended with `name` (default `""`). New `<GroupContainer>` sub-component renders a click-to-edit name button (Pencil icon). Enter/blur commits, Esc reverts. Falls back to `GRUP · N` label when empty. Testids: `widget-group-name-{id}`, `widget-group-name-input-{id}`.
  - **Color picker**: New `Palette` icon button on group header toggles a popover with `GROUP_PALETTE` swatches (7 colors). Selecting a swatch calls `setGroupColor` + closes popover + toast `wg_group_color_changed`. Border, header text and label recolor immediately. Testids: `widget-group-color-btn-{id}`, `widget-group-palette-{id}`, `widget-group-palette-swatch-{id}-{hex-no-hash}`.
  - Refactored inline group rendering out of `WidgetGrid` into `GroupContainer` component (~120 lines) for readability.
  - New i18n keys: `wg_group_name_placeholder`, `wg_group_pick_color`, `wg_group_color_changed` (TR+EN, others fall back to TR).
  - E2E playwright verified: name-edit → color-change → intra-group drag reorder all persist to localStorage.

- **[2026-02] Widget Grubu (P1) — DONE**: `WidgetGrid.jsx` grouping feature. Added `useWidgetGroups` hook + `titanxis_widget_groups_v1` localStorage schema `[{id, color, widgets:[key]}]`. New `Grup Modu` toggle in dashboard header (Layers icon) enables selection-mode where clicking widgets toggles them (orange check overlay). When ≥2 selected, green `Grupla (N)` button appears → creates group and reorders `enabled` so members are contiguous. Groups render inside a full-width dashed-border container (color from `GROUP_PALETTE`) with header showing `GRUP · N` + `GRUBU ÇÖZ` (Link2Off) button. Dragging any grouped widget moves the whole group as a block (via `srcGroup.widgets` sweep in `handleDrop`). Removing a widget prunes it from its group; groups with <2 members dissolve automatically. Removed widgets update groups via new `removeWidget` helper. Buttons on card (`X`, size) tagged with `data-widget-action` so clicks pass through in select-mode. i18n keys `wg_group_*` added to `tr` + `en` (30 langs fall back to `tr`). E2E verified: 2-widget selection → group creation → ungroup all work with toast feedback. Testids: `widget-group-mode-toggle`, `widget-group-create-btn`, `widget-group-{id}`, `widget-group-ungroup-{id}`, `widget-select-{key}`, `widget-group-hint`.

- **[2026-02] Puan Hesaplama v2 — Sadeleştirme (P0)**: DayCard tamamen readonly (sadece Miktar input editable). Çarpan tek satır (array in DB, UI 1 element). "Birim İsimleri" → "Birim Ekle" modal: Tablo Başlığı + tek Çarpan (name+value) + dinamik Birim listesi (name+amount). Kart'ta Birimler tablo satırları: Birim İsmi | Birim Miktarı | **Toplam** (Miktar × Amount otomatik). Toplam Puan = Miktar × Çarpan Value (otomatik). Malzeme kavramı Birim'e dönüştü.
- **[2026-02] Puanlar Hakkında page (NEW ROUTE `/puanlar-hakkinda`)**: `/app/frontend/src/pages/PointsAbout.jsx` — wraps existing AddPoints + PointsList as 2 sub-tabs (Puan Ekle / Puan Listesi). BottomNav removed old separate `/puanlar` + `/puan-ekle` items; added new `nav-points-about` (BarChart2) + `nav-point-calc` (Calculator) icons. Old direct routes kept for backward-compat.
- **[2026-02] BuildingCalculator refactor (P0)**: `/app/frontend/src/components/BuildingCalculator.jsx` restructured:
  - F9–F6 seviye toggles retained at top.
  - Bina selector switched from horizontal scroll → **dropdown/select** (Stone & Fire styled, ChevronDown affordance).
  - "✏️ Birim Maliyeti Gir" button next to BİRİM MALİYETİ header (admin-only, `data-testid="open-bina-unit-cost-modal"`).
  - Removed the intermediate "Birim Maliyeti display" grid entirely; single **TOPLAM MALİYET** grid with 6 rows: Yemek, Çelik, Odun, Benzin, **Forticlad**, **Gelişmiş Forticlad**.
  - Removed separate Forticlad + Gelişmiş Forticlad inputs. **ADET input also removed** — totals auto-computed for 1 upgrade (`total = 1 × unit_cost`).
  - TOPLAM MALİYET row order: (1) Forticlad + Gelişmiş Forticlad side-by-side, (2) Yemek + Çelik, (3) Odun + Benzin.
  - Modal fields: yemek/odun/celik/benzin/**forticlad**/**gelismis_forticlad**/sure_saniye.
  - Backend `UnitCostBody` + GET response extended with `forticlad` + `gelismis_forticlad` (float, default 0). PUT `/api/unit-costs/bina_{slug}_{lvl}` persists all 7 fields.
  - Slug format: `komuta_merkezi`, `kalkan_kislasi`, `bombaci_kislasi`, `tetikci_kislasi`, `revir`, `iletisim_merkezi`, `forticlad_lab`; level lowercase e.g. `f9`.
  - Verified E2E: `bina_tetikci_kislasi_f9` saved {yemek:100,odun:200,celik:300,benzin:50,forticlad:10,gelismis_forticlad:5,sure_saniye:60}; adet=4 → Y=400 O=800 C=1200 B=200 F=40 G=20, süre 04:00.
- Auth: JWT, roles (admin / user + can_edit / view), user management, forced password change
- Members: grouped by alliance, filter/sort, alliance color picker, castle level, military barracks (tetikçi/bombacı/kalkanlı F+T)
- **[2026-02] Commander card rarity theming**: `rarityCardStyle` helper — Legendary orange (#F97316), Epic purple (#A855F7), Common blue (#3B82F6) frames + dark tinted bg gradient. Applied to grid + list cards + image thumbnails.
- **[2026-02] Commander "Tümü" flat view + Robotlar excluded**: KOMUTANLAR aggregate section renders as a single flat 2-col grid of Tetikçi + Bombacı + Kalkanlı; `Robotlar` excluded from Tümü and only in its own sub-tab.
- **[2026-02] Commander grid sort (shared helper)**: Module-level `sortCommandersList(arr)` in `Commanders.jsx`. Order: (1) KoF first → (2) Ranked non-KoF (S6→…→R1) → (3) Unranked by rarity (legendary > epic > common) → (4) Turkish-locale name tie-break. Used by both single-category and aggregate grid views.
- **[2026-02] Commander form: hide Rank + Rarity for Team & Garrison**: `CommanderForm` in `Commanders.jsx` skips Rank + Rarity block when current section is `KAFES ETKİNLİK`, `SAVAŞ`, `SVS EKİP`, or `GARNİZON`.
- **[2026-02] Note position + color (Member)**: Backend `Member`/`MemberCreate`/`MemberUpdate` extended with `note_position` (`inline` | `bottom`) and `note_color` (hex). Form has toggle chips + 8-color palette shown only when bottom is selected. Card + Profile Dialog render conditionally with defensive `note.trim() !== ""` guard.
- **[2026-02] Stone & Fire final polish**: `Leaderboard.jsx` rest rows now use `.rank-row` (carved stone slab + lava left border + inset shadow) instead of `.card-dark`. Position `#N` amber-Cinzel, name Cinzel-cream, total lava `#E74C1A`. `.section-title` promoted to Cinzel+amber+lava-underline via `.heading-cinzel`. Üyeler alliance header span uses Cinzel with 0.08em tracking.
- **[2026-02] BottomNav lucide icons**: Reverted custom SVG runic icons to standard `lucide-react` (Trophy, Swords, BarChart2, PlusCircle, Users, Flag). Size `w-[22px] h-[22px]`, ACTIVE `#E74C1A` with `drop-shadow(0 0 6px rgba(231,76,26,0.5))` glow, INACTIVE `#666`.
- **[2026-02] BottomNav centering**: `flex flex-col items-center justify-center text-center` on NavLink; label span uses `text-center leading-tight w-full` so multi-line labels center evenly.
- **[2026-02] Leaderboard: alliance replaces level**: All 3 podium slots + rest rows now show `alliance_name` (fallback "-" / t("member")) instead of "Lv N".
- **[2026-02] Leaderboard: PODYUM title removed + collapsible podium**: `podiumOpen` state with `data-testid="podium-toggle"` button (ChevronUp/Down, Stone & Fire styled). Default open. Section-title text gone.
- **[2026-02] Header cleanup**: `subtitle` prop no longer rendered (dead-code prop remains at callsites but is ignored) — header is now logo-only alongside language/theme/profile controls.
- **[2026-02] PointsList inline edit**: Blue Pencil button per row (`data-testid="edit-scorelist-{id}"`) opens `EditScoreDialog` (points / multiplier / event / note) → PATCH `/api/scores/{id}`. Refreshes SWR keys `/scores`, `/points`, `/stats`, `/leaderboard`.
- **[2026-02] Members Ungrouped color-picker**: Removed `grp.name !== t("no_group")` guard — `Gruplandırılmamış` group also shows Palette button (`alliance-color-btn-Gruplandırılmamış`) and opens the AllianceColorPicker like normal alliances.
- **[2026-02] Excel Sıralama sheet — full ranking**: Sheet 3 now merges zero-point members after scored ones and writes sequential `idx` (1..N) in column A. Total row count == `/api/members` count. Verified via openpyxl (iteration_13 pytest).
- **[2026-02] Null-safe member search**: Guarded `(m.name || '').toLowerCase()` and `(m.member_id || '').includes(...)` across AddPoints.jsx (single+bulk+filter-edit), Commanders.jsx (character search), PointsList.jsx, Members.jsx sort cmp — fixes prior `Cannot read properties of null (reading 'includes')` TypeError when a member had null name/id.
- **[2026-02] Tab label rename**: `nav_commanders` translated to "Komutan Bilgileri" (TR) / "Commander Info" (EN) / "Информация о командирах" (RU) / "Kommandanten-Info" (DE) / "Info Commandants" (FR) / "Info Comandantes" (ES) / "지휘관 정보" (KO) / "معلومات القادة" (AR). Verified live across all 8 locales in iteration_14.
- **[2026-02] Leaderboard row alliance pill**: Rank badge (R4/R5) in rest rows replaced with alliance-name pill (`data-testid="row-alliance-badge-{id}"`) — `minWidth 48px`, `text-[10px]`, background = custom alliance color if set else `#E74C1A`, `"-"` fallback when no alliance_name.
- **[2026-02] Podium narrower + Işıklandır button**: Grid switched to inline `gridTemplateColumns: '0.85fr 1fr 0.85fr'` + `gap: 4px`. Removed ChevronUp/Down toggle; added `Sparkles`-icon `Işıklandır` button (`data-testid="podium-illuminate"`, `aria-pressed`, default OFF). When ON, each podium card's `boxShadow` transitions (0.5s) to: p1 red glow `rgba(220,38,38,0.9)/0.4`, p2 silver `rgba(192,192,192,0.8)/0.3`, p3 bronze `rgba(205,127,50,0.8)/0.3`. `illuminate` i18n key added for all 8 languages.
- **[2026-02] Header profile dropdown**: `header-profile` button now toggles a dropdown menu (`data-testid="header-profile-dropdown"`) with items Profil, Kullanıcılar (admin), Şifre Değiştir, Detaylı Rapor (admin), Çıkış. Standalone `header-settings-btn` removed. Excel export moved from Leaderboard bottom into this dropdown (`dropdown-export`, admin-only). Old bottom button retained hidden with `className="hidden"` to preserve `LEADERBOARD.exportButton` testId contract. Verified 100% in iteration_15.
- **[2026-02] Name casing preserved**: Added `textTransform:'none'` + `normal-case` class to all member-name renders across Leaderboard (podium+rest), Members cards, PointsList rows, AddPoints selector/history — DB casing shown as-is (e.g. `PaSHa` renders `PaSHa`, not `PASHA`).
- **[2026-02] Dropdown z-index & style**: Header profile dropdown now `position:absolute`, `zIndex:9999`, `background:#1E1410`, `border:1px solid #E74C1A`, `box-shadow:0 4px 20px rgba(0,0,0,0.8)` — always overlays other content.
- **[2026-02] New brand logo**: Header logo swapped to new URL (`fb92b583ca964c22a56b6b68f1cf73ef_1000073431.jpg`). Style: 44×88 px, `object-fit:cover`, `border-radius:4px`, `transform:scaleX(1.15)` for slight horizontal stretch. Old text-based logo variants removed. Verified iter_16.
- **[2026-02] Logo v3**: Header logo swapped to `4e1d325e85084ea69c28857dabe96728_1000073434.jpg`. Height 40, max-width 160, `object-fit:contain`, `border-radius:4`. Removed `scaleX(1.15)` transform. Verified iter_17.
- **[2026-02] Logo maxHeight 80→120**: `Header.jsx` img inline `style.maxHeight` bumped from 80 to 120 (all other props unchanged). Compile clean.
- **[2026-02] Tablet layout revert + logo fix**: Reverted the SideNav experiment — deleted `SideNav.jsx`, restored `Layout.jsx` to `{children}+MusicButton+BottomNav`, removed all `.side-nav` CSS + tablet `.bottom-nav {display:none}` + `.app-shell {padding-left:200px, padding-bottom:0}` overrides + `.floating-music-btn-pos` class. `MusicButton` back to inline `bottom:80,right:16`. BottomNav now visible on every viewport again. **Logo fix**: `Header.jsx` img changed from `height:56, maxWidth:400, objectFit:cover, objectPosition:left` → `width:100%, maxWidth:100%, height:auto, maxHeight:80, objectFit:contain, objectPosition:left center` — banner now renders fully (uncropped) at 768/1024/1400px. Playwright verified at 400/768/1024/1400: BottomNav visible, no SideNav, logo bounding box grows with viewport without distortion.

- **[2026-02] Logo enlarged (v3.1)**: Header img now stretches to fill left side — height 56, width 100% up to maxWidth 400, `object-fit:cover`, `object-position:left center`, `border-radius:6`. Renders as wide banner ("God of War" text visible). Right controls (LanguageSwitcher, theme, profile) unaffected.
- **[2026-02] Background music toggle**: New `header-music-toggle` button between LanguageSwitcher and theme toggle. Uses Volume2 (playing / `#E74C1A` + glow) / VolumeX (paused / `#F5F0E8`) lucide icons. Loops, volume 0.3, no autoplay. Music file self-hosted at `/app/frontend/public/audio/epic_battle.mp3` (Kevin MacLeod "Hitman" 8MB CC-BY). i18n keys `music_play`, `music_stop`, `music_blocked` added for all 8 locales. Verified iter_19.
- **[2026-02] Portal dropdown**: Header profile dropdown now rendered via `ReactDOM.createPortal(..., document.body)` with z-index 999999 (overlay 999998). Escapes any parent stacking context and always appears above stat cards. Removed the redundant `mousedown` outside-click useEffect — overlay div is sole outside-click handler. Menu items (Profil, Kullanıcılar, Şifre Değiştir, Detaylı Rapor, Çıkış) all click-functional.
- **[2026-02] Floating music button + new Viking track**: Music toggle moved from Header into new `/components/MusicButton.jsx` rendered globally via `Layout.jsx`. Floating fixed at bottom:80 right:16, 48×48 circle, `linear-gradient(135deg,#C0392B,#E74C1A)`, box-shadow `0 4px 12px rgba(231,76,26,0.5)`, zIndex 9000. Pulses with `musicPulse` keyframes (2s infinite) when playing. MP3 swapped to Joel Fazhari "Against All Gods" Viking tribal track (external CDN, 6.3MB, audio/mpeg). Volume 0.4, loop true, no autoplay. Old `/audio/epic_battle.mp3` local file retained but unused.
- **[2026-02] Tab rename → LoJ Hakkında**: `nav_commanders` + `commanders_title` renamed across all 8 locales (TR "LoJ Hakkında", EN "About LoJ", RU "О LoJ", DE "Über LoJ", FR "À propos LoJ", ES "Sobre LoJ", KO "LoJ 소개", AR "حول LoJ"). Route path `/komutanlar` unchanged.
- **[2026-02] MALİYET HESAPLAMA section**: Added new sidebar section with 8 sub-categories (mh_asker_egitim, mh_bina, mh_teknoloji, mh_kitap, mh_koleksiyon, mh_ekipman, mh_uydu, mh_robot). Uses existing commanders collection with `category` prefix `mh_`. Items rendered as info-style cards (title/body/image) — `isInfo` and `addButtonLabel` extended to treat `mh_*` keys the same as `bilgilendirme`. `sb_maliyet_hesaplama` i18n key added for all 8 locales.
- **[2026-02] Section label → HESAPLA + Asker Eğitim calculator**: `sb_maliyet_hesaplama` i18n values updated to HESAPLA variants (TR HESAPLA / EN CALCULATE / RU РАССЧИТАТЬ / DE BERECHNEN / FR CALCULER / ES CALCULAR / KO 계산 / AR احسب) — internal key `"MALİYET HESAPLAMA"` unchanged for stability. New `SoldierCalculator.jsx` renders on `selectedCat === 'mh_asker_egitim'`: soldier-count-input drives live 4 resource cells (Yemek/Odun/Çelik/Benzin) + 3 time cells (Saat/Dakika/Saniye) via `unit_costs.{yemek,odun,celik,benzin,sure_saniye}`. Save button posts to `/api/calculations` and history table with Türkçe number formatting + delete. Admin-only Birim Maliyet modal PUTs to `/api/unit-costs/{category}`. Backend added `UnitCostBody`/`CalculationBody` models + 4 new endpoints (GET/PUT unit-costs, GET/POST/DELETE calculations). Verified iter_26.
- **[2026-02] Backend 502 root cause + permanent fix**: Uvicorn `--reload` was watching all of `/app/backend/` including `tests/` and `__pycache__/`. Any pytest run (e.g. testing agent creating `test_calculator.py`) triggered WatchFiles reload cascade — external URL served Cloudflare 502 during the reload window. **Fix:** `/etc/supervisor/conf.d/supervisord.conf` [program:backend] now runs `uvicorn ... --reload --reload-dir /app/backend --reload-include "*.py" --reload-exclude "tests/*" --reload-exclude "__pycache__/*" --reload-exclude "**/tests/**" --reload-exclude "**/__pycache__/**" --reload-exclude "*.pyc"`. Backend PID stays stable when files are written under `tests/` or `__pycache__/`. Added `/api/health` endpoint (`{"status":"ok","db":"up|down"}`) for post-deploy liveness probes.
- **[2026-02] Search + member point detail dialog**: `Leaderboard.jsx` gained `leaderboard-search` input (placeholder "İsim veya ID ile ara...", 300ms debounce) filtering `rest` by name/member_id. `PointsList.jsx` search placeholder + filter extended to include `member_game_id`. Both pages open the enhanced `MemberProfileDialog` on row click. Dialog now portals to `document.body` (z-index 999999), fetches `/members/{id}/history`, and renders a TOPLAM PUAN card + ETKİNLİK DETAYI section that groups points by event_name (rows show +effective × multiplier, group total on dashed rule). PointsList edit/delete `stopPropagation` so row click still opens dialog cleanly. i18n keys `event_detail` and `search_by_name_or_id` added in all 8 locales.
- **[2026-02] HESAPLA reordered + Asker Eğitim calculator redesign**: `CATEGORIES` moved `mh_*` block right after `bilgilendirme` — sidebar order is now BİLGİLENDİRME → HESAPLA → KOMUTANLAR → KAFES ETKİNLİK → GARNİZON → SAVAŞ → SVS EKİP. `SoldierCalculator.jsx` rewritten: tier selector at top (T11/T8/T7/T6, data-testids `tier-btn-T{n}`), tier-specific unit costs stored per category suffix `asker_egitim_t{n}`, 2-column resource grid (Yemek/Çelik / Odun/Benzin), Süre with exactly 3 boxes GÜN / SAAT / DAKİKA using `Math.ceil((s%3600)/60)` for minutes. History table gained Tier column parsed from category suffix and Süre formatted as `Xg YYs ZZd`. `UnitCostModal` has in-modal tier tabs so admin can edit costs per tier. Backend unchanged (accepts arbitrary category strings).
- **[2026-02] Calculator history merge fix**: SoldierCalculator was fetching `useSWR('/calculations?category=asker_egitim')` but backend uses exact-match and records are stored with tier suffix — history table never rendered. Replaced with 4 parallel `useSWR` calls (one per tier-suffixed category) merged + sorted by `created_at` desc. `refreshAllHistory()` mutates all 4 keys on save/delete. Verified table renders existing rows with Tier column and `Xg YYs ZZd` Süre format.
- **[2026-02] Süre split into 4 numeric columns**: Live time boxes gained SANİYE (4 boxes GÜN/SAAT/DAKİKA/SANİYE, all Math.floor). History table Süre single column replaced by 4 separate integer columns (GÜN/SAAT/DAKİKA/SANİYE) with data-testids hist-gun/hist-saat/hist-dakika/hist-saniye-{id}. Old helpers `secondsToGSD`/`formatSureShort` removed; only `secondsToDHMS` remains. Verified iter_31 100%.
- **[2026-02] Multi-image upload for mh_* (except mh_asker_egitim)**: Backend Commander/Create/Update now expose `images: List[str]` (plus legacy `image_url`). Frontend form shows a multi-image UI on `mh_bina/teknoloji/kitap/koleksiyon/ekipman/uydu/robot`: multiple file input, URL input with Enter-to-add, thumbnail grid `repeat(auto-fill, minmax(80px, 1fr))` with red X remove button, max 10 images with toast warning on overflow. Submit persists both `images[]` and `image_url` (first image) for backward compat. Non-mh_* categories keep the legacy single-image UI unchanged.
- **[2026-02] Dropdown position fixed + overlay**: Header dropdown promoted to `position:fixed, top:60, right:8, zIndex:99999`. Added transparent overlay (`data-testid="header-profile-overlay"`, `position:fixed, inset:0, zIndex:99998`) that closes menu on outside-click. Solves stacking issue against stats cards. Verified iter_17.
- **[2026-02] Işıklandır removed + constant podium glow**: Removed `podium-illuminate` button, `podiumLit` state, and `Sparkles` import. Podium cards now render permanent gradient bg + fixed glow (p1 red 0.6, p2 silver 0.5, p3 bronze 0.5). Alliance pill (`podium-alliance-badge-1/2/3`, text-[9px] rounded-full, allianceColors[name] || `#E74C1A`) added under member name on each podium card. Verified iter_17.
- **[2026-02] Member card + compact profile modal**: Card body now shows only the member name (bold) + castle level (`t("castle_short")` format like "Kale F8") — alliance badge moved into the popup. Clicking a name opens `MemberProfileDialog` — a compact custom (non-Radix) modal that lists: name+ID, alliance chip (case-preserved), Kale Seviyesi (F8), Tetikçi/Kalkanlı/Bombacı as `F# - T#` rows. Missing values render as `-`. Backdrop click closes. Radix `Dialog` replaced due to portal/transform positioning bug that placed content at y=6021.
- **[2026-02] Members POST validation fix**: `MemberCreate` schema — only `name` is required; `member_id`, `rank` (defaults to `R1`), `alliance_name`, `castle_level`, `tetikci_*`, `bombaci_*`, `kalkanli_*`, `note`, `title`, `level` all optional. Extra unknown fields ignored via `ConfigDict(extra="ignore")`.
- **[2026-02] Members list restructure**: Each alliance is an independent collapsible accordion block. Within each alliance, rank sections (R5→R4→R3→R2→R1) are independent collapsible sub-accordions. **All ranks render as 2-column responsive grid** (previous R5-full-width rule removed). Card shows large name, ID, castle level, and an alliance badge preserving DB case. Alliance groups sorted GOW → GoW → GOw → alpha → NoGroup last.
- Commanders: image upload, rarity (Legendary/Epic/Common), KoF matching, dynamic multi-select ranks, 4-slot team compositions (Tetikçi/Bombacı/Kalkanlı/Robot), custom sort (KoF S6→S1 first, then non-KoF R5→R1)
- Points/Events: add points, event archive/active/all filter, per-event scoreboard, podium
- Excel export: styled multi-sheet openpyxl with AutoFilters, dynamic alliance PatternFill row colors
- i18n: 8 languages with Midnight Red dropdown panel
- Alliance colors: dynamic, persisted in `alliance_colors` collection

## Key Files
- `/app/frontend/src/pages/Members.jsx` — accordion by alliance + rank
- `/app/frontend/src/pages/Commanders.jsx` — team slots, KoF, rarity, sorting
- `/app/backend/server.py` — API routes, Excel export
- `/app/frontend/src/i18n/index.js` — 8-language dict

## Backlog (Prioritized)
- **P1** — Discord webhook: post to a channel when a new Puan Hesaplama event is created/updated

- **[2026-02] EquipmentTables interactive filters**: `/app/frontend/src/components/EquipmentTables.jsx` now stateful (`selectedLevel` 1..20, `selectedHero` 0..4). Added `[data-testid=reform-level-selector]` 5×4 grid with 20 buttons (`reform-level-btn-1..20`) and `[data-testid=hero-range-selector]` flex-wrap row with 5 buttons (`hero-range-btn-0..4`). Exactly one row/card visible at any time — always 22px centered font. Removed unused `ICON_GEAR`/`ICON_MAGNET` constants and `<img>` from reformation `<th>`s (headers plain "Seviye"/"Dişli"/"Mıknatıs"). Active btn `#F5A623` bg / `#0B0704` text, aria-pressed reflects state. Verified 100% in iteration_42.
- **[2026-02] EquipmentTables defaults + no-deselect**: Defaults now `selectedLevel=1`, `selectedHero=0`. Click handlers simplified to `setSelected(x)` (no toggle-off) so a row is always visible. Verified 100% in iteration_43. Deployment check: PASS.
- **[2026-02] TroveCollectionTable (mh_koleksiyon)**: New `/app/frontend/src/components/TroveCollectionTable.jsx` component. 11 tier buttons (UNCOMMON…EXOTIC-T3) with tier-colored active state, default UNCOMMON. Selecting a tier renders 4 responsive cards (Base / 1 Star / 2 Star / 3 Star) each showing Common/Rare/Precious/Legendary coin counts; `0` values render as `-` and thousands use TR locale. Persistent Grand Total block (3.158.000 / 31.580 / 7.325 / 560) below. Integrated in Commanders.jsx via `selectedCat === "mh_koleksiyon" && <TroveCollectionTable/>`. Verified 100% in iteration_44.
- **[2026-02] i18n 8-language coverage**: Added ~55 new keys per language block (TR/EN/RU/DE/FR/ES/KO/AR) in `/app/frontend/src/i18n/index.js` — namespaces `sc_*` (SoldierCalculator), `et_*` (EquipmentTables), `tc_*` (TroveCollectionTable) and `cat_mh_*` for HESAPLA subcategories. Rewrote `TroveCollectionTable.jsx` with `useTranslation` and updated `SoldierCalculator.jsx` + `EquipmentTables.jsx` to use `t()` for every hardcoded string (headers, buttons, toasts, table columns, modal labels, hero-note). Tier buttons (UNCOMMON/RARE/EXOTIC-T1..T3) and calculator tiers (T11/T8/T7/T6) intentionally left untranslated per spec. Coin names ARE translated. Verified 100% in iteration_45. Deployment check: PASS.
- **[2026-02] Komutan → Kahraman global rename**: Applied per-language renames across all 8 locales in `/app/frontend/src/i18n/index.js` — TR Komutan→Kahraman, EN Commander→Hero, RU Командир→Герой, DE Kommandant→Held, FR Commandant→Héros, ES Comandante→Héroe, KO 사령관→영웅, AR قائد→بطل (both case forms and plurals). Route paths, testids and keys unchanged. Testing agent also fixed missed sb_komutanlar entries and TR empty-state strings.
- **[2026-02] HeroTables (mh_kahraman)**: New `/app/frontend/src/components/HeroTables.jsx`. Section 1: Hero Star selector (⭐1-⭐5 default 1) → 2-column card with Recruit/Part 1-6/TOTAL rows (values per spec: 1★=20 total, 2★=45, 3★=115, 4★=300, 5★=600). Section 2: Exclusive Weapons 5×2 grid selector (0→1..9→10 default 0) → single Required Parts card [10,25,25,45,45,65,65,85,85,100]. No deselect on same-click. Added `mh_kahraman` to CATEGORIES in api.js and rendered in Commanders.jsx alongside Equipment/Trove. Empty-heroes fallback now suppressed for bespoke component categories (mh_ekipman/mh_koleksiyon/mh_kahraman). Verified 100% in iteration_46. Deployment check: PASS.
- **[2026-02] HeroTables star selector 3+2 grid**: Container is a CSS Grid `grid-template-columns: repeat(3, 1fr)` with `max-width: 282px`, `box-sizing: border-box`, `overflow: hidden`. Each button is `width: 100%`, `height: 34px`, `flex-grow/shrink: 0`, `box-sizing: border-box`, padding 4px 6px, fontSize 11, `overflow: hidden`, `white-space: nowrap`, flex-centered content. All 5 buttons fit within the 282px container (top row ⭐1/⭐2/⭐3, bottom row ⭐4/⭐5 aligned under columns 1-2). Verified via screenshot — no button overflows container, all top-row widths equal to bottom-row widths.
- **[2026-02] PasHa signature (inline SVG viking axe + fire text)**: Rewrote `/app/frontend/src/components/PashaSignature.jsx`. Row layout with an **inline SVG viking axe on the left** (wooden `#4B2C15→#7A4A22→#3E220E` handle gradient, silver `#E8ECEF→#9DA5AD→#4A5058` bearded blade, leather grip wraps, rune rivets, pommel cap — NO emoji, NO lucide-react) and **Cinzel bold 20px gold `#F5A623` "PasHa" text on the right**. Two independent CSS keyframes: `pashaFireFlicker` on text (multi-layer text-shadow sarı→turuncu→kırmızı pulse @2.4s) and `pashaAxeGlow` on axe (drop-shadow pulse @2s). Both animations run infinitely; hover speeds them to 0.7s, lifts card, brightens border glow (`#E74C1A`). Stone-dark card `#0D0907`, 8px radius, 8/14 padding, static positioning inside right-aligned wrap. Mobile: 26px axe, 16px text, tighter padding at <480px. Playwright: axe=svg element (0 lucide icons), axe.x < text.x, animations verified, position=static.

- **[2026-02] Bina Güncelleme calculator added**: New `BuildingCalculator.jsx` mirrors SoldierCalculator's Stone & Fire layout but with (a) **SEVİYE** toggle F9/F8/F7/F6 (categories `bina_guncelleme_{f9/f8/f7/f6}`), (b) two side-by-side inputs **Forticlad** + **Gelişmiş Forticlad**, (c) Birim Maliyeti panel (Yemek/Çelik/Odun/Benzin) computes `(forticlad + gelismis) × unitCosts[k]` from the selected level's `/api/unit-costs/{category}`, (d) Süre display in gün/saat/dakika/saniye. Wired into `Commanders.jsx` — when `selectedCat === "mh_bina"` the component renders. Backend F9 unit-costs pre-seeded and verified via curl round-trip.
- **[2026-02] PATCH /members/:id accepts string bireysel_guc + loading-screen video**: (1) `MemberUpdate` model gained a `@field_validator("bireysel_guc", mode="before")` that coerces dot/comma/space-separated strings (e.g. `"1.234.567.890"`) to int. `bireysel_guc: 0` now flows through (`v is not None` filter passes 0), so a zero-reset no longer errors with "Değişiklik yok". Verified 3 curl round-trips: integer, dot-string, zero. (2) `LoadingScreen` in `App.js` swapped from the pulse chip to a centered `<video autoPlay muted loop playsInline>` (source: `f650420e34f040c39be51cc046655cc0_1000074064.mp4`) on `#0A0806` background with purple+orange drop-shadow. Data-testids: `loading-screen`, `loading-video`. Reused by all `RequireAuth/Admin/Editor` wrappers when `useAuth().loading === true`.
- **[2026-02] Import member matching by member_id + bireysel_guc always-write**: Import now indexes existing members BOTH by `name.lower()` and by `member_id` — matching prefers member_id when Excel provides one, falls back to name. In update mode, all fields still skip `None/""` to preserve existing data, BUT `bireysel_guc` is special-cased: when any of its column aliases (bireysel_guc / Bireysel Güç / individual_power / Guc / Power) is present in the row, the value is `$set` even if 0 — so "zero-out" scenarios and dot-separated values (`999.111.222` → `999111222`) work. Round-trip verified: PasHa reset 0 → import update → `bireysel_guc = 999111222`.
- **[2026-02] Import Turkish column-header aliases + update-safe merge**: Added `_norm_key(s)` (Latin-fold Turkish letters, strip spaces/dashes) and `_pick(row, *aliases)` helpers. Members import now maps `Bireysel Güç → bireysel_guc`, `İttifak Adı → alliance_name`, `Rütbe → rank`, `Kale Seviyesi → castle_level`, `Tetikçi/Bombacı/Kalkanlı F/T → tetikci_f/t / bombaci_f/t / kalkanli_f/t`, plus English aliases (`Power`, `Alliance`, `Castle`, etc.). Events maps `Çarpan/Tarih/Alt Başlık/Grup/Arşiv`. Points maps `Puan/Üye/Etkinlik/Not/Çarpan`. **Update mode now skips `None` values** so leaving a column blank in Excel doesn't wipe existing data — only present fields are `$set`. Verified end-to-end with a Turkish-header xlsx: Ekko's `bireysel_guc` updated from `0 → 999.888.777` while other fields preserved; a fresh row was inserted with all tier columns populated.
- **[2026-02] Excel export AutoFilter on all sheets**: `ws.auto_filter.ref = ws.dimensions` set on Üyeler, Etkinlikler, and Puanlar sheets after populating rows — enables per-column filter dropdowns and A-Z / Z-A sort in Excel. Verified refs: `A1:V164`, `A1:I6`, `A1:L209`.
- **[2026-02] Full-field Excel export**: `/api/export/all` now emits every field on each record. Üyeler sheet expanded to 22 cols (id, name, member_id, alliance_name, **alliance_color** looked up from `alliance_colors`, rank, title, level, castle_level, tetikci_f/t, bombaci_f/t, kalkanli_f/t, bireysel_guc, **total_points** aggregated per member, note fields, import_batch_id, created_at). Etkinlikler 9 cols (adds subtitle/created_at). Puanlar 12 cols (adds member_rank, event_multiplier, import_batch_id). Any extra fields present on any row are appended dynamically. Empty values render as blank cells, complex types are JSON-serialized.
- **[2026-02] "↩️ Geri Al" quick button on Live Dashboard**: New `POST /api/import/undo-last` finds the most recent non-undone `import_logs` entry and deletes only its tagged rows (returns 404 if none). Frontend `bulk-btn-undo-last` sits in the grid next to Import Et, red-tinted icon (`Undo2`), shows loading label `"Son import geri alınıyor..."`, toasts `"{N} kayıt silindi — veriler import öncesi haline döndürüldü"` on success, and shows `"Geri alınacak import bulunamadı"` warning toast when 404. Confirm dialog before firing. SWR mutate refreshes members/events/points/stats/leaderboard/alliances. End-to-end verified via curl (2 imported → undo-last removed 2, second call returned 404).
- **[2026-02] Import undo — safe deletion of only newly-added rows**: Backend now tags each newly-inserted Member/Event/Point with `import_batch_id` (fresh UUID per import) and logs the batch to `import_logs` (with filename/duplicate_mode/result/undone flag). `POST /api/import/undo/{batch_id}` deletes ONLY records with matching `import_batch_id` — pre-existing rows and update-mode-touched rows are never affected because they never received the tag. Idempotent guard (`undone: true` → 400). `GET /api/import/logs` lists the last 50 batches. Frontend `ImportPanel` result screen shows a red "↩️ İçe Aktarmayı Geri Al" button after any import that actually added rows, with a confirm dialog, and a red summary card after undo. Round-trip verified via curl: 2 members imported → batch_id returned → total 163→165 → undo → total 165→163, pre-existing 163 records untouched.
- **[2026-02] Full-DB Excel/CSV import on Live Dashboard**: New `📥 Import Et` button (6th in grid). Backend `POST /api/import/bulk` (admin-only, multipart with `dry_run` + `duplicate_mode`) parses `.xlsx` (3 sheets auto-classified via normalized Turkish names — Üyeler/Etkinlikler/Puanlar) or `.csv` (single-sheet header-heuristic classification). Two-step flow: preview returns `{members_found, events_found, points_found}`; apply returns `{result: {members/events/points: {added, updated, skipped, errors}}}`. Duplicate detection: members by `name`, events by `name`, points by `(member_id, event_id)`. Frontend modal: file picker, radio (Atla/Güncelle), preview counts, apply, color-coded result summary. Round-trip verified end-to-end via curl (163+5+208 all skip-recognized).
- **[2026-02] Full-DB Excel export on Live Dashboard**: New `📤 Export Et` button added to `BulkAdminActions` grid. Backend `/api/export/all` (admin-only) builds an in-memory `.xlsx` via `openpyxl` with 3 sheets — **Üyeler** (163 rows × 18 cols incl. `bireysel_guc`), **Etkinlikler** (5 × 7), **Puanlar** (208 × 9 with enriched `member_name`/`event_name`). Response is `StreamingResponse` with `Content-Disposition: attachment; filename="gow-export-YYYYMMDDHHMMSS.xlsx"`. Frontend downloads via axios `responseType: "blob"` and triggers a hidden `<a download>`.
- **[2026-02] Bulk admin action panel on Live Dashboard**: New `BulkAdminActions.jsx` renders 4 Stone-&-Fire pill buttons (Üye Ekle, Bireysel Güçleri Güncelle, Etkinlikleri Ekle, Etkinlik Puanlarını Güncelle) inside a responsive grid (1/2/4 cols by breakpoint). Each opens a themed modal (`BulkModal` shell): (1) alliance chip → multi-name textarea → bulk `POST /members` with duplicate detection; (2) alliance chip → member list with editable orange-tinted power inputs (dot thousands) → bulk `PATCH /members/:id`; (3) quick event create form → `POST /events` + list existing; (4) event dropdown → member list w/ existing points prefilled → mixed `POST /points` (new) or `PATCH /points/:id` (existing). All SWR mutate calls refresh members/points/stats/leaderboard.
- **[2026-02] Member profile dialog Bireysel Güç row**: `MemberProfileDialog.jsx` now renders a dedicated `⚡ Bireysel Güç:` line right below the ID line — orange `#FF6B00` text with soft glow, uses shared `CountUp` for the animated dot-thousands format. Always visible (shows `0` when unset).
- **[2026-02] Member card Bireysel Güç with count-up**: New `CountUp.jsx` component (rAF-driven cubic-out, ~900ms, formatted tr-TR with dot thousands). Members row now shows a dedicated line under castle level: ⚡ + "Bireysel Güç: <animated>" in orange `#FF6B00` with subtle glow shadow. Only renders when the member has a non-zero `bireysel_guc`.
- **[2026-02] Live Dashboard promoted to standalone route**: New `LiveDashboardPage.jsx` at `/gosterge-paneli` (auth-required). `<LiveDashboard>` removed from Profile and UserManagement. Header dropdown gains a new "Canlı Gösterge Paneli" (Activity icon) menu item positioned ABOVE "Profilim". i18n keys `live_dashboard` already added.
- **[2026-02] Live Dashboard + Bireysel Güç field**: (a) New `LiveDashboard.jsx` widget rendered at the TOP of `Profile.jsx` and `UserManagement.jsx` — polls `/stats` and `/leaderboard` every 8s, shows member count, total power (formatted K/M/B with dot-thousands tooltip), active event count, and Top 3 badges (gold/silver/bronze). Stone & Fire styling: purple/orange radial bg, `Cinzel` gold title, pulsing red LIVE dot. Responsive: 2-col on mobile, 4-col on tablet+. (b) Added `bireysel_guc: Optional[int]` to `Member`, `MemberCreate`, `MemberUpdate`; `/stats` now sums it into `total_power`. (c) `MemberForm` gained a new field between ID and Kale Seviyesi with live dot-thousands formatting (`1.000.000.000`), digit-only input. Member list row shows ⚡ + formatted value under castle level when set. i18n keys added to tr/en; other langs fall back to Turkish via i18next config.
- **[2026-02] Rehber sub-grid matched to main sidebar 1:1**: Removed extra `px-4` and inline grid — Rehber container is now `flex flex-col gap-2` (matching main) with an inner `grid grid-cols-2 gap-2 items-start`. Card CSS reverted to `padding: 6px 10px !important`, `min-height: 0`, label `font-size: 11px`, `line-height: 1.2` so 2-col cards line up with main sidebar column widths (`~500px` each). ASKER EĞİTİM still full-width top via `sidebar-card-full`. Glass, fire label, hover glow untouched.
- **[2026-02] Rehber grid layout finalized**: `hesapla-category-list` now `flex flex-col gap-3 px-4`; ASKER EĞİTİM (`sidebar-card-full`) full-width top; rest render in inline `display: grid; gridTemplateColumns: repeat(2, 1fr); gap: 12px; alignItems: stretch`. Card CSS adds `height: 100% !important` so paired rows are equal height. `@media (max-width: 360px) .rehber-grid { grid-template-columns: 1fr }` collapses to single column on very narrow screens. Glass/fire/clamp label styles untouched.
- **[2026-02] HomePage reverted**: `/app/frontend/src/pages/HomePage.jsx` deleted, `App.js` import + `/` route restored to render `<Leaderboard />`, `/siralama` alias removed. `BottomNav` leaderboard link reset to `/` with `end={it.to === "/"}` and no path-based hiding. All `.home-hero*`, `.home-video*`, `.home-cta*` styles and `@keyframes heroColorShift/emberFloat/colorWave/logoPulse/slideFromLeft/slideFromRight` removed from `index.css`.
- **[2026-02] HomePage animated bg (stone + color shift + embers + wave + logo pulse)**: `.home-hero` now shows the same Leaderboard stone/rune texture (`50511d82a1f10a6e54beb325354dc47017fcf918c6b52ad05a1035abf94c9957.jpeg`) with `heroColorShift 8s ease-in-out infinite` cycling three layered linear-gradient tints (dark purple/violet → deep blue → orange/amber → dark violet). Added `.home-hero::before` ember-particle field (8 radial-gradient points) with `emberFloat 6s linear infinite` rising translateY, `.home-hero::after` downward `colorWave 4s linear infinite` sweep (purple → transparent), and `.home-video-wrap::after` radial `logoPulse 3s` scale/opacity halo behind the video. Old `heroPulse` removed. CTA buttons, video, slideFromLeft/Right animations untouched.
- **[2026-02] Animated HomePage landing added**: New `HomePage.jsx` at `/` — center-plays hero video `0e75a52fb2da4a63af76fa062364835d_1000073694.mp4` with `onEnded` (+ `onError` fallback) revealing two CTA buttons after 1s. Buttons: **SIRALAMA** (slides in from left → `/siralama`) and **LOJ HAKKINDA** (slides in from right → `/komutanlar`). CSS: dark `linear-gradient(135deg, #0A0015 → #1A0030 → #0D0020)` bg + triple radial hue overlay (`heroPulse` 6s), video wrap has drop-shadow purple + orange glow, CTA is `linear-gradient(#FF6B00, #9B59B6)`, `padding: 16px 48px`, Cinzel bold uppercase, `box-shadow: 0 0 20px rgba(255,107,0,0.5), 0 0 40px rgba(155,89,182,0.3)`, hover `scale(1.05)`. Keyframes `slideFromLeft` / `slideFromRight` 0.8s ease-out. `<640px` → column stack. Routing: Leaderboard moved from `/` → `/siralama`; BottomNav "Sıralama" link updated; `<BottomNav>` hidden on `/` so the landing stays clean.
- **[2026-02] Hierarchical back nav + ultra-transparent Rehber cards + clamp font**: (a) `backToSidebar` in `Commanders.jsx` now walks up one level per tap — from a specific category (`selectedCat` = real key) it returns to that category's section landing (`SECTION_PREFIX + section`); from a section landing it returns to the main sidebar. Applies to all sections (MALİYET HESAPLAMA/KAHRAMANLAR/KAFES ETKİNLİK/GARNİZON/SAVAŞ/SVS EKİP). (b) Rehber card alphas cut again: radial `rgba(168,85,247,0.02)`, linear stops `rgba(52,152,219,0.03) / rgba(139,92,246,0.04) / rgba(168,85,247,0.04)`, border `rgba(139,92,246,0.08)` — cards nearly glass. (c) Label font-size switched to `clamp(10px, 2vw, 13px)` with `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` — long names fit on one line responsively.
- **[2026-02] Rehber sub-cards more translucent**: Gradient/border alpha halved on `[data-testid="hesapla-category-list"] .sidebar-card` — radial `rgba(168,85,247,0.12→0.06)`, linear stops `rgba(52,152,219,0.15→0.07) / rgba(139,92,246,0.18→0.09) / rgba(168,85,247,0.2→0.10)`, border `rgba(139,92,246,0.28→0.15)`. Stone texture pops through; `backdrop-filter: blur(12px)` and fireText animation preserved.
- **[2026-02] Header ultra-tight + Rehber sub-cards enlarged**: (a) `<header>` padding-top `pt-2 → pt-0`, title wrapper `marginTop 8 → 2` — pill sits directly under the logo/badge row. (b) `[data-testid="hesapla-category-list"] .sidebar-card`: `padding 12px 16px !important`, `min-height: 48px`, `width: 100%`; labels bumped to `font-size: 14px`, `white-space: normal`, `word-break: break-word`, `overflow: visible`, `text-overflow: unset` — names wrap fully, no ellipsis. Glass blur + fireText animation preserved.
- **[2026-02] Header compacted**: `<header>` padding-top `pt-5 → pt-2`, title/divider wrapper `marginTop 22 → 8`, `marginBottom 10 → 6` — logo row, admin badge, and title pill collapse tightly; sub-tab cards start immediately below divider. Sticky `top-0 z-50` and pill styling preserved.
- **[2026-02] Rehber sub-cards sized to main sidebar 1:1**: `[data-testid="hesapla-category-list"] .sidebar-card` matched exactly to `[data-testid="commanders-sidebar"] .sidebar-card` — `padding: 6px 10px !important`, `min-height: 0`, label `font-size: 11px`, `letter-spacing: 0.02em`, `white-space: nowrap`, `overflow: hidden; text-overflow: ellipsis`. Grid gap already `gap-2`. Glass blur (12px) and fireText animation preserved.
- **[2026-02] Rehber sub-cards glass + fire labels**: `[data-testid="hesapla-category-list"] .sidebar-card` re-styled to match main sidebar aesthetic — `backdrop-filter: blur(12px)`, low-alpha purple-blue radial+linear gradient (`rgba(52,152,219,0.15) → rgba(139,92,246,0.18) → rgba(168,85,247,0.2)`), `rgba(139,92,246,0.28)` border, subtle drop shadow. Labels centered with `white-space: normal; word-wrap: break-word`, `-webkit-text-fill-color: unset`, and `animation: fireText 2s ease-in-out infinite` for gold→amber flicker. `section-tab-strip` cards and main sidebar untouched.
- **[2026-02] Sticky header + Rehber layout + opaque sub-cards**: (a) `<header>` in `Header.jsx` gets `sticky top-0 z-50` with dark linear-gradient bg + `backdrop-filter: blur(6px)` so the page title pill stays pinned during scroll. (b) `Commanders.jsx` Rehber category list restructured: `mh_asker_egitim` renders full-width on top, remaining 8 categories (`mh_bina`, `mh_ekipman`, `mh_kahraman`, `mh_kitap`, `mh_koleksiyon`, `mh_robot`, `mh_teknoloji`, `mh_uydu`) in `grid grid-cols-2 gap-2`. (c) `[data-testid="hesapla-category-list"] .sidebar-card` opacity/saturation boosted — solid `#3B1478` bg color, brighter `radial rgba(192,132,252,0.55)` highlight, richer `#8B3FF0 → #5B21B6 → #1E3A8A → #2563EB` gradient, border `rgba(168,85,247,0.85)`, added drop shadow + inner glow. `section-tab-strip` cards left untouched. Main sidebar glass/fire/label styles preserved.
- **[2026-02] Page title overlaps divider (badge on line)**: `Header.jsx` now renders the page title as an absolute-positioned amber pill centered on top of `.divider-glow` (`z-index: 2`, dark linear gradient bg, `rgba(231,76,26,0.55)` border, red glow shadow, Cinzel font, gold `#F5A623` text). Overrides the global `h1,h2,h3` gradient-clip rule via inline `WebkitTextFillColor` and `backgroundClip: border-box`. Header padding reduced (`pb-3 → pb-1`) so content sits one row higher.
- **[2026-02] Unified page titles above divider**: `Header.jsx` now accepts a `title` prop and renders `<h2 data-testid="page-header-title" className="text-xl font-bold uppercase red-text tracking-wider text-center w-full mt-2">` ABOVE the `divider-glow`. All pages updated to pass `title={t(...)}` and dropped their local h2: Leaderboard (`nav_leaderboard` → SIRALAMA), Commanders (`commanders_title`), Events (`nav_events`), Members (`members`), PointsList (`point_list_title`), AddPoints (`add_points_sub`), UserManagement (`users_page_title`), Profile (`my_profile`). Row layouts adjusted so Back/Add buttons remain on their edges via `justify-between` + spacer.
- **[2026-02] Sidebar compact spacing**: Main sidebar cards padding tightened to `6px 10px !important` (was `10px 12px`), grid gap reduced (`gap-3` → `gap-2`), SoldierCalculator wrapper margin `mt-4` → `mt-1` so the calculator sits directly below the card grid. Scoped to `[data-testid="commanders-sidebar"]` — sub-tab card sizing untouched.
- **[2026-02] Sidebar label single-line fit**: `.sidebar-card-label` inside `[data-testid="commanders-sidebar"]` switched from `white-space: normal` + word-wrap to `white-space: nowrap` with `overflow: hidden; text-overflow: ellipsis`, `font-size: 11px`, `letter-spacing: 0.02em` — long names (KAHRAMANLAR, KAFES ETKİNLİK) now fit on one line while fire-text animation, thin border, and glass blur remain. Sub-tab cards untouched.
- **[2026-02] Sidebar fire-text labels + thin glass borders**: Main sidebar (`[data-testid="commanders-sidebar"]`) labels centered with word-wrap (long names like KAFES ETKİNLİK wrap to 2 lines), animated with new `@keyframes fireText` (2s infinite, gold→amber→pale-gold→dark-orange with layered orange/red text-shadow flame glow). Border softened to `rgba(139,92,246,0.2)` (hover `rgba(168,85,247,0.5)`) with `backdrop-filter: blur(8px)` glass effect. Fully scoped — sub-tab cards (`section-tab-strip`, `hesapla-category-list`, `sidebar-card-compact`) keep solid gradient + white labels untouched.
- **[2026-02] Sidebar layout redesign + inline SoldierCalculator**: `Commanders.jsx` sidebar view splits sections — `BİLGİLENDİRME` renders full-width as a solo top row; remaining 6 (`REHBER`, `KOMUTANLAR`, `KAFES ETKİNLİK`, `GARNİZON`, `SAVAŞ`, `SVS EKİP`) render in `grid grid-cols-2 gap-3`. `<SoldierCalculator />` is now always visible below all cards (`data-testid="sidebar-soldier-calculator"`) — no click required. All cards use `sidebar-card sidebar-card-full` so 2-col children stretch to column width; transparent glass base + white label preserved.
- **[2026-02] Sidebar main-card ultra-transparent glass**: `.sidebar-card` base bg lowered to ~15-20% opacity with brighter purple tones — `rgba(168,85,247,0.1)` radial + `rgba(52,152,219,0.15) → rgba(139,92,246,0.18) → rgba(168,85,247,0.2)` linear gradient, border `rgba(168,85,247,0.25)`. Stone texture now shows through main menu. Sub-tabs (`section-tab-strip`, `hesapla-category-list`, `.sidebar-card-compact`) kept vivid solid via `!important` overrides — unchanged.

## Test Credentials
See `/app/memory/test_credentials.md`

## Notes for Next Agent
- **[2026-02] Widget Boyut Tercihi (P4 done)**: `WidgetGrid.jsx` — yeni `useWidgetSizes` hook `titanxis_widget_sizes_v1` localStorage'da `{key: 'compact'|'normal'|'wide'}` haritası. Her widget kartına remove butonunun yanına `widget-size-{key}` cycle butonu (SizeIcon: Minimize2/Square/Maximize2). Cycle sırası `SIZE_ORDER = ['compact','normal','wide']`. Compact: padding 8, ikon+değer küçültülür, subtitle+extra gizlenir. Wide: `gridColumn: span 2`. Normal: default. `data-size` attribute test için. Playwright: top_member=wide + active_events=compact doğrulandı, localStorage persist ✅.
- **[2026-02] Widget'larda Grup Rengi (P4 done)**: `WidgetGrid.jsx` import `groupColor`. `todays_event` subtitle JSX olarak dönüştü — renkli dot + renkli grup adı. Yeni `active_events` widget'ında `active-events-legend` — aktif etkinliklerin ilk 4 unique group_name'i renkli chip strip'te. Görsel tutarlılık Events sayfasıyla aynı palette.
- **[2026-02] Push Analytics Grafik (P4 done)**: Yeni `PushAnalyticsChart` component (PushBroadcastPanel içinde). History rows'u `created_at.getHours()` ile 24 saatlik bucket'a böler → yükseklik = sent count, renk = open rate (HSL 200-260). `push-analytics-bar-{i}` testid, tooltip. `hasData` guard sıfır durumda gizler. Test hazır.
- **[2026-02] BottomNav Widget Kısayolu, Push Delivery Analytics rakam, Etkinlik Grubu Rengi (Events sayfası) — önceki turlarda tamamlandı.**
- **[2026-02] Recurring Push, Widget Kütüphanesi Sayfası, Etkinlik Bildirim Ayarları, Şablon→Zamanla Modal, Alliance Duel/Top3/Snapshot, Sparkline Detail, Rally Countdown+Ses+Vibrate, PWA, Offline SW, i18n 30 lang — hepsi tamamlandı.**
- Do NOT create random files under `/app/backend/` that trigger uvicorn watchfiles reload cascade (502 crash).
- **[2026-02] Push Delivery Analytics (P4 done)**: `_broadcast_push` hid'i upfront generate edip payload'a gömüyor. `sw.js` push event handler `POST /api/push/history/{hid}/opened` (public, no auth); notificationclick handler `POST /api/push/history/{hid}/clicked`. Backend her iki endpoint `$inc` yapıyor. Frontend `PushBroadcastPanel` history row'unda cyan Eye (opened %) + yeşil MousePointerClick (clicked %). curl E2E: opened x2 + clicked x1 doğru sayıldı ✅.
- **[2026-02] Etkinlik Grubu Rengi (P4 done)**: Yeni `/app/frontend/src/lib/groupColors.js` — FNV-1a hash → 12-color palette (`groupColor`, `groupBgTint`). Events.jsx header grup adı renklendi + `event-group-dot-{group}` colored dot rozeti + kartlarda sol 3px renkli border + hafif tinted background. Aynı input → aynı renk (deterministic). Bugünkü etkinlik hâlâ kırmızı striped tema önceliğinde.
- **[2026-02] Recurring Push, Widget Kütüphanesi, Etkinlik Bildirim Ayarları, Şablon→Zamanla, Push History resend, Alliance Duel/Top3/Snapshot, Sparkline Detail, Rally Countdown+Ses+Vibrate, Widget Reorder, Custom Push Templates, PWA, Offline SW, i18n 30 lang — hepsi tamamlandı.**
- Do NOT create random files under `/app/backend/` that trigger uvicorn watchfiles reload cascade (502 crash).
- **[2026-02] Widget Kütüphanesi Sayfası (P4 done)**: Yeni `/widget-kitapligi` route → `WidgetLibrary.jsx`. `WIDGETS_META` export + her widget'a `descKey` eklendi. 12 kart responsive grid (min 230px); ikon/başlık/açıklama/`Ekle-Kaldır` butonu, aktif olan yeşil "AKTİF" badge. Toggle `titanxis_widgets_v1` localStorage'a yazar. Playwright: 12 card + 12 toggle btn ✅.
- **[2026-02] Etkinlik Bildirim Ayarları (P4 done)**: Backend `db.push_prefs` + `GET/POST /api/push/prefs` (per-user), `GET /api/push/event-groups` (distinct). `_broadcast_push` yeni `group_name` param; tetiklendiğinde prefs olan kullanıcı filtre uygular (boş prefs = tüm), prefs var ama grup değilse skip. `/api/events` POST çağrısı `group_name` geçer. Frontend `PushPrefsCard` (Dashboard'da) cyan chip strip → seçim + Kaydet. curl E2E: prefs GET/SET, event-groups distinct ✅.
- **[2026-02] Şablondan Zamanla Modal (P4 done)**: `push-tpl-schedule-{id}` clock ikon → modal (`push-tpl-schedule-modal`) + repeat chip'leri (`push-tpl-repeat-{once|daily|weekly}`).
- **[2026-02] İttifak Düellosu Widget (P4 done)**: 12. widget `alliance_duel` (Trophy, kırmızı). SWR `/leaderboard` alliance_name'e göre client-side aggregate → sıralı liste. Kullanıcının ittifakı vs bir üstteki (yoksa altındaki) rakip: `value` = fark (`+X.YB` / `-X.YB`), `subtitle` = "Mine vs Rival". `extra` render: iki isim+total mini legend + iki renkli progress bar (altın/kırmızı proporsiyonel) + altında "ÖNDESİN"/"GERİDESİN" etiketi.
- **[2026-02] Etkinlik Kartı Renk Kodu (P4 done)**: `Events.jsx` list item — bugün başlangıç zamanına düşen event VEYA son 6 saat içinde başlamış aktif event → 45° kırmızı repeating-linear-gradient + kırmızı border + kırmızı-turuncu pulse badge (`event-today-badge-{id}` = BUGÜN / AKTİF). i18n: `event_today_badge`, `event_active_badge`.
- **[2026-02] Günün Etkinliği Widget, Zamanlanmış Push, Alliance Top 3, Push Şablonları, Sparkline Detay Popup, Alliance Snapshot, Push History, Kişisel İlerleme, Rally Ses Uyarısı, Widget Reorder, Custom Push Templates, Rally Sayacı Widget — önceki turlarda tamamlandı.**
- **[2026-02] Push Notifications, Offline Mode / SW, Dashboard Widgets (şu an 12), PWA Install, Expand/Collapse All + Persist, Ekip Kopyala, Kümülatif Star Maliyeti, Excel Grafik, Rarity Filtresi, Hesap Karşılaştır, Puan Hesaplama Excel Import, Public Share Link, Content History — hepsi tamamlandı.**
- **ENV**: `pywebpush`, `py-vapid`, `http-ece`. VAPID keypair MongoDB `push_config`. Koleksiyonlar: `push_config`, `push_subscriptions`, `push_history`, `push_templates`, `push_scheduled`.
- Do NOT create random files under `/app/backend/` that trigger uvicorn watchfiles reload cascade (502 crash).
- Router prefixes: `auth_router` mounted so `/api/auth/login` resolves.
- REACT_APP_BACKEND_URL is the only correct external URL — never hardcode.
- User communicates in Turkish — respond in Turkish.
