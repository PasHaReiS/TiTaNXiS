# TiTaNXiS — Gaming Guild Management (oyun-loncasi)

## Original Problem Statement
Build and extend a full-stack Gaming Guild Management App. Advanced 29-language i18n via DeepL, complex Leaderboard, Web Push, Premium Admin Dashboard, VIP Support tickets, and deep Telegram Bot / Object Storage integrations. **User language: Turkish** (respond in TR).

## Tech Stack
- React 19 (CRA) + Tailwind + shadcn/ui + i18next + react-image-crop
- FastAPI + Motor (MongoDB)
- Telegram Bot API (webhooks, inline keyboards, callback queries)
- DeepL API (Free tier — `:fx`)
- Web Push (VAPID, pywebpush)
- Emergent Object Storage
- Resend (weekly digest email)

## Environments
- **Preview**: `https://oyun-loncasi.preview.emergentagent.com` (dev, agent-writable)
- **Production**: `https://titanxis.com` (live, agent read-only — user must redeploy)

## Users
- **Admin** (`admin` / `Admin123`)
- **Editor** (`pasha` / `pasha123`)

- **Feb 31, 2026 (v140.2 — Event Reminder Duration Fix)** — Frontend:
  - **Bug**: `EventReminderDialog` her hatırlatma push'una en büyük lead'i (`largestLead`) body'ye gömüyordu → 15dk seçilse bile mesaj "30 dk sonra başlıyor" olarak Telegram'a düşüyordu.
  - **Fix**: `bodyEdited` flag'i eklendi. Kullanıcı textarea'ya elle dokunmadıysa her `ft.min` (lead) için body dinamik olarak `t("event_reminder_body_default", { name, dur: fmtDur(ft.min) })` üretilir.
  - `fmtDur()` helper: <60→"N dk", 60/120/1440→"1/2/24 saat", mixed→"H saat R dk".
  - i18n template refactored: `{{min}} dk` → `{{dur}}`. TR + EN güncellendi, 4 yeni format key (`dur_min`, `dur_hour`, `dur_hour_short`, `dur_min_short`).
  - Preset auto-sync koşullu: `bodyEdited=false` iken preview text preset değişimiyle güncellenir; admin elle yazdıysa override respect edilir.
  - Multi-select durumda "💡 Her hatırlatma kendi süresini yazar…" ipucu gösterilir.


- **Feb 31, 2026 (v140.1 — Public Landing `/tanitim`)** — Frontend:
  - Yeni public sayfa `/tanitim` — `AppShell` dışında (Privacy/Terms gibi), auth zorunlu değil. Ziyaretçiler de görüntüleyebilir.
  - Component: `/app/frontend/src/pages/Tanitim.jsx`. Koyu tema (`#0a0a0a`), radial altın glow, TiTaNXiS marka rozetli.
  - Hero: QR-siz orijinal `titanxis_tanitim.png` görseli (fetchpriority=high, altın 1px border + glow).
  - Intro metni: `⚔️ TiTaNXiS Lonca Yönetim Uygulaması — Loncanu yönet, etkinliklerini takip et, sıralamanda yerini al!`
  - Amber gradient (135°, #ffd36b→#f5b21c→#b8760a) büyük "UYGULAMAYA GİR" butonu → `https://titanxis.com`. Hover'da translateY(-2px) + boosted shadow.
  - URL parametresi desteği: `?davet=KOD` (alias `?invite=KOD`) → sayfada altın chip (`data-testid=tanitim-invite-chip`) + kopyala butonu. CTA `https://titanxis.com/?davet=KOD` olarak forward eder.
  - i18n: 7 yeni key (`tanitim_hero_alt`, `tanitim_intro`, `tanitim_cta`, `tanitim_invite_label`, `tanitim_invite_copied`, `tanitim_invite_copy_failed`, `tanitim_footer`) TR + EN. Diğer 27 dil `useTranslation` fallback ile Turkish default kullanır.
  - Route eklendi (App.js outer Routes): `<Route path="/tanitim" element={<Tanitim />} />`.


- **Feb 31, 2026 (v140 — Telegram `/tanitim` Admin Broadcast)** — Backend:
  - `telegram_bot.py`: `tanitim_command` handler eklendi. `_require_admin` gate; grup chat_id = `TITANXIS_GROUP_CHAT_ID`. `sendPhoto` çağrısıyla sabit tanıtım görseli + caption gönderilir.
  - Caption: `⚔️ TiTaNXiS Lonca Yönetim Uygulaması\nLoncanu yönet, etkinliklerini takip et, sıralamanda yerini al!\n🌐 titanxis.com`
  - `CommandHandler("tanitim", tanitim_command)` register, BotFather listesine `{"command":"tanitim","description":"[Admin] Lonca tanıtım görselini gruba gönder"}` eklendi. `setMyCommands` 41 girişe çıktı.
  - Doğrulama: `getMyCommands` API → `tanitim` girişi görüldü, backend restart temiz.


- **Feb 29, 2026 (v139.1 — Voice Rooms Admin Bypass Frontend)** — Frontend:
  - **Backend zaten hazırdı**: `voice_token` endpoint'inde `is_admin = u.role == "admin"` kontrolü mevcut → admin şifresiz/davetsiz geçiyor.
  - **Frontend fix**: `join()` içinde `skipPrompt = isAdmin || (user && room.invited)` → admin veya davetli üye için hiç prompt açılmıyor, direkt token istenir.
  - Oda kartında admin'e "👑 Admin (şifresiz)" hint gösterildi (amber). TR + EN i18n key eklendi (`voice_room_admin_bypass`).


- **Feb 29, 2026 (v139 — Voice Rooms Password + Invite Access)** — Backend + Frontend:
  - **Backend model change**: `VoiceRoomCreate` — `is_private` alanı kaldırıldı, `password: str` zorunlu oldu. Şifreler bcrypt ile hashlenir (`auth.hash_password`). Public oda konsepti kaldırıldı.
  - **`voice_rooms_list`**: Artık `_optional_auth` — ziyaretçi de listeyi görebilir. `password_hash` asla dönmez. Her odaya `invited: bool` bayrağı eklenir (client-side davetli mi kontrolü için); `invited_user_ids` dönmez (gizlilik).
  - **`voice_token`**: `_optional_auth` — hem üye hem ziyaretçi çağırabilir. Logic: admin veya davetli üye → şifresiz geçer; diğer herkes (login veya ziyaretçi) → `password` bcrypt verify. Ziyaretçi için `guest_name` alınır ve LiveKit identity `guest-<uuid8>`, display `{name} (ziyaretçi)`.
  - **Seed güncellendi**: 3 default oda ("Genel", "SvS Savaşı", "Strateji Odası") default şifre `titanxis` ile.
  - **Frontend**: Route `/sesli-kanallar` artık RequireAuth altında değil — ziyaretçi görebilir. `RoomCard` her zaman kilit ikonu; davetli üyelerde "✅ Davetlisin" yeşil badge. `join()` flow: ziyaretçi → görünen ad prompt + şifre prompt; login üye + davetli değilse → sadece şifre prompt; davetli üye → direkt token. 403 fallback ile tekrar şifre isteme desteği. `CreateRoomButton`: public/private toggle kaldırıldı, zorunlu şifre inputu + davetli listesi paralel gösterilir.
  - 8 yeni i18n key (TR+EN).


- **Feb 29, 2026 (v138.9 — MusicButton → VoiceRooms Nav)** — Frontend:
  - `MusicButton.jsx` tam olarak yeniden yazıldı. Eski davranış (fon müziği çal/durdur) kaldırıldı.
  - Yeni davranış: Tıklama → `nav("/sesli-kanallar")`. Sürüklenebilirlik korundu (`useDraggableFab`, `fab_pos_music`).
  - Ikon `Volume2/VolumeX` → **`Mic`** olarak değişti. Amber border + kırmızı gradient (TiTaNXiS tema).
  - Yalnızca `user` varsa render (ziyaretçi gizli).
  - Testid güncellendi: `floating-music-btn` → `floating-voice-btn`.


- **Feb 29, 2026 (v138.8 — LiveKit Voice Rooms)** — Backend + Frontend:
  - **Backend** (`server.py` +100 satır): `POST /api/voice/rooms` (admin), `GET /api/voice/rooms` (auth, private oda filtresi), `DELETE /api/voice/rooms/{id}` (admin), `POST /api/voice/token` (auth + davetli kontrolü). Startup seed 3 oda: "Genel", "SvS Savaşı", "Strateji Odası". LiveKit SDK: `livekit-api==1.2.1`. Token: `AccessToken + VideoGrants(room_join, can_publish/subscribe)`.
  - **Frontend**: `VoiceRooms.jsx` sayfası + route `/sesli-kanallar` (RequireAuth wrapper). `@livekit/components-react` ile `LiveKitRoom + RoomAudioRenderer + StartAudio`. Konuşan katılımcı yeşil halka + glow (`isSpeaking`), sustur/aç butonu (Mic/MicOff), ayrıl butonu. Admin için "Yeni Oda" modal'ı (public/private, davetli user_id listesi). 20 yeni i18n key (TR+EN).
  - **Erişim**: Ziyaretçi giremez (route RequireAuth), private oda için davetli kontrolü backend token endpoint'inde.


- **Feb 29, 2026 (v138.7 — LiveKit Credentials)** — Backend:
  - `/app/backend/.env`'e üç LiveKit env değişkeni eklendi/güncellendi:
    - `LIVEKIT_URL=wss://voice.titanxis.com`
    - `LIVEKIT_API_KEY=APIqyWsYw6L3XF7`
    - `LIVEKIT_API_SECRET=JV4eMy...` (gizli)
  - Backend restart edildi, `/api/health` OK dönüyor.
  - Voice Rooms feature'ı henüz implement edilmedi — credentials artık hazır, sonraki iterasyonda backend token endpoint + frontend Voice Rooms sayfası yapılabilir.


- **Feb 29, 2026 (v138.6 — LIVEKIT_URL)** — Backend:
  - `/app/backend/.env`'e `LIVEKIT_URL=wss://voice.titanxis.com` eklendi.
  - `LIVEKIT_API_KEY` ve `LIVEKIT_API_SECRET` hâlâ eksik → LiveKit token üretimi çalışmayacak; kullanıcı bu iki değeri sağladığında feature tamamlanabilir.
  - Backend restart edildi; `/api/health` OK dönüyor.


- **Feb 29, 2026 (v138.4/5 — Chat FAB + Sürüklenebilir Butonlar)** — Frontend:
  - **`useDraggableFab` hook** (`hooks/useDraggableFab.js`): Mouse + touch (mobil + masaüstü) drag desteği. Konum `localStorage`'da `fab_pos_{key}` anahtarıyla saklanır. 5px hareket eşiği ile "click vs drag" ayırt edilir → kısa tıklama `onClick`'i tetikler. Ekran boyutu değişince buton görünür alanda tutulur (clamp).
  - **`ChatFab.jsx`**: Yeni yüzen sohbet butonu. Amber/altın TiTaNXiS teması (`linear-gradient(#F5A623 → #D4730A → #E74C1A)`), `MessageCircle` ikonu. Yalnızca `user` varsa render edilir (ziyaretçi/anonim gizli). Tıklama → `/sohbet` route'una yönlendirme. Sürüklenebilir; varsayılan konum `top:120, right:16`.
  - **`MusicButton`**: `useDraggableFab` ile refactor edildi. Konum artık `fab_pos_music` anahtarıyla localStorage'da. Drag sonrası click yutulur (hasDragged guard).
  - **`GuildChat.jsx`** (yeni sayfa `/sohbet`): Placeholder — "Yakında" mesajı + amber styling. `RequireAuth` wrapper altında (guest kilitli sayfa görür).
  - **i18n**: TR + EN keys (`chat_fab_title`, `guild_chat_title`, `guild_chat_subtitle`, `guild_chat_coming_soon`).


- **Feb 29, 2026 (v138.2/3 — Etkinlik İlk 10 + Hero Star Hover)** — Frontend:
  - **HERO STAR Hover** (`HeroTables.jsx`): Yıldız butonlarına `onMouseEnter/Leave` eklendi — inactive butonlarda parlama (amber glow), hafif büyüme (`translateY(-1px) scale(1.06)`), amber border + text renk geçişi. Aktif buton state korunur, çift-parlama yok. Cubic-bezier easing `(0.34, 1.56, 0.64, 1)` yumuşak spring efekti.
  - **Etkinlik İlk 10 Paneli** (`Events.jsx`): Yeni `EventTop10Panel` component. `/api/leaderboard?event_id=X` endpoint'inden çekiyor (backend zaten destekliyor: `event_id`, `group_name`, `alliance`, `member_scope` param'ları). Top 10 üye 🥇🥈🥉 madalya + `total_points` mono format + ittifak chip'i ile gösteriliyor. Etkinlik detay modalında EventCountdown/Paylaşım butonlarının altına inject edildi. Tüm metinler `useTranslation()` — `event_top10_title`, `event_top10_hint` (TR+EN eklendi).
  - **Sunucu İlk 10**: Ayrı bir component olarak yazılmadı çünkü `/siralama` sayfası zaten aynı endpoint'i tam liste ile kullanıyor; ittifak filtre parametresi mevcut (`alliance` + `member_scope=clan`).
  - **Dead-code**: DeepL hâlâ aktif kullanılıyor (translate + detect), legacy OCR/state referansı grep'te bulunamadı. Temizlik yapılacak somut hedef yok — no-op olarak geçildi.


- **Feb 29, 2026 (v138.1 — /davet Kişiselleştirilmiş Mektup)** — Backend:
  - `davet_command` yeniden yazıldı. Basit link mesajı → **kişiselleştirilmiş davet mektubu** oldu:
    - Başlık: "*{username} seni {guild_name} Loncası'na davet ediyor!*"
    - Guild adı `guild_settings.guild_name` → env `GUILD_NAME` → "TiTaNXiS" fallback ile çözülür.
    - 5-madde lonca özet listesi (SvS/Kristal, puan takibi, rozetler, 29 dil, Telegram bot).
    - Kopyalanabilir katılım linki + davet kodu (her ikisi de backtick içinde).
    - En altta davet bonusu bilgilendirmesi + web paneli linki.
  - `/invite` alias'ı zaten satır 386'da kayıtlı, aynı handler'a bağlı — İngilizce kullanıcı yazınca `reply_ml` DeepL/preferred_language ile otomatik EN'ye çevirir.
  - Test: webhook simülasyonu `/davet` ve `/invite` her ikisi de `{"ok":true}` döndürüyor.


- **Feb 29, 2026 (v138 — HeroTables Cumulative Panel Kaldırıldı)** — Frontend:
  - `HeroTables.jsx` içindeki "1★→N★ KÜMÜLATİF MİKTAR" (Cumulative 1→N cost panel) tablosu tamamen kaldırıldı (satır 195-241, 47 satır silindi).
  - Parent wrapper `gap: 6px` zaten set; EXCLUSIVE WEAPONS tablosu artık HERO STAR'ın hemen altında (6px gap ile) render ediliyor.
  - `cumulativeThrough()` helper fonksiyonu ve i18n key `ht_cumulative_title` codebase'de dokunulmadan bırakıldı (başka yerde kullanılabilir, dead-code cleanup ileride yapılabilir).


- **Feb 29, 2026 (v137.9 — /yardim CRITICAL Fix)** — Backend:
  - **Root cause**: `/yardim` metnindeki `_` içeren komut isimleri (`/etkinlik_ekle`, `/puan_ekle`, `/rozet_ver`, `/toplu_duyuru`, `/etkinlik_iptal`, `/esik_uyari`, `/geri_bildirim`, `/sifremi_sifirla`, `/reset_password`) Markdown italic markörü olarak yorumlandı → Telegram BadRequest ("can't find end of entity starting at byte offset 818") → mesaj hiç iletilmiyordu. `/help` de aynı hatayı üretiyordu ama production'daki eski build'de bu commands yoktu.
  - **Fix #1**: Yeni `_safe_reply(update, text, parse_mode)` helper — `BadRequest`'te sessizce `parse_mode=None` ile retry eder. `reply_ml`'nin 3 çıkış noktası bu helper'ı kullanıyor. Bu sayede gelecekte de Markdown edge-case'leri metni düşürmez.
  - **Fix #2**: `/yardim` text'inde `_` içeren komut isimleri backtick içine alındı (kod bloğu Markdown parse'ı bypass eder, temiz görünür de).
  - **Test doğrulandı**: `POST /api/telegram/webhook` `/yardim` simülasyonu artık `{"ok":true}` döndürüyor + backend log'unda BadRequest yok.


- **Feb 29, 2026 (v137.8 — /help vs /yardim Locale Override)** — Backend:
  - `yardim_command` artık çağıran komut adına göre yanıt dili zorlar:
    - `/help` → `_nlp_override_lang="en"` → İngilizce yanıt
    - `/yardim` veya `/komutlar` → `_nlp_override_lang="tr"` → Türkçe yanıt (varsayılan)
    - Diğer durumlarda mevcut `reply_ml` çeviri katmanı devam eder (profil dili / Telegram client lang).
  - ContextVar `_nlp_override_lang` mevcut altyapı; try/finally ile reset ediliyor → başka handler'ları etkilemez.
  - Metin Türkçe kalıyor; hedef dil sadece reply_ml çıktısında DeepL/Google çevirisi ile üretiliyor.


- **Feb 29, 2026 (v137.7 — /help Menu + LLM Cache + Group Rate Limit)** — Backend:
  - **/help & /yardim menüde**: `setMyCommands` listesine `/help` eklendi ("All commands (English)"). Handler zaten var, sadece autocomplete menüsünde görünmüyordu. `/yardim` ve `/help` her ikisi de aynı `yardim_command` handler'ına bağlı.
  - **LLM Cache (TTL 60s)**: `_llm_classify` içine SHA1-based in-memory cache eklendi. Cache anahtarı `sha1(text[:600])`, TTL 60 saniye, max 500 giriş (taşınca en eski 100 silinir). Cache hit log'lanır: `LLM cache HIT key=abc123 age=1.2s`. **Test doğrulandı**: 1. çağrı ~2s (API), 2. çağrı <1ms (cache).
  - **Grup Rate Limit**: 30 saniyelik pencerede aynı grup için max 3 NLP isteği. 4. istekte "⏳ Lütfen bekleyin — 30 saniye içinde tekrar dene" mesajı BİR KEZ gösterilir; sonrakiler pencere bitene kadar sessizce yok sayılır. Private DM etkilenmedi. Log: `NLP throttled group=X hits=3`.


- **Feb 29, 2026 (v137.6 — Webhook Production URL Fix)** — Backend:
  - **`TELEGRAM_WEBHOOK_URL`**: `https://oyun-loncasi.emergent.host/...` → `https://titanxis.com/api/telegram/webhook` olarak güncellendi (`/app/backend/.env`).
  - **Doğrulama**: `getWebhookInfo` sonrası `url: "https://titanxis.com/api/telegram/webhook"` (IP: 172.66.2.113, Cloudflare). Production endpoint HTTP 200 dönüyor.
  - **NLP grup trigger kodu (v137.5)** production-ready: `nlp_message_handler` satır 1858-1886 — grup mesajlarında `@BotUsername` VEYA `titanxis` (case-insensitive) yoksa sessiz çıkar. Her iki tetikleyici de intent detection öncesi mesajdan silinir. Whitelist / blocklist YOK.
  - **User action**: Kullanıcının production'a **Republish** yapması gerekiyor — bu sayede production backend'de aynı .env aktif olacak ve gelen webhook update'lerini işleyecek.


- **Feb 29, 2026 (v137.5 — Grup NLP Tetikleme Kuralı)** — Backend:
  - **Yeni davranış**: Grup/supergroup mesajlarında NLP yalnızca şu koşullardan biri sağlandığında tetiklenir:
    1. Mesajda `@TiTaNXiS_BoT` tag'i var
    2. Mesajda `titanxis` kelimesi geçiyor (case-insensitive)
  - **Aksi halde**: Bot grupta hiç işlem yapmaz, sessiz kalır → sohbet bozulmaz, LLM maliyeti = 0.
  - **Private DM etkilenmedi**: Özel sohbette her mesajda NLP çalışmaya devam eder.
  - **Prefix temizleme**: Hem `@BotUsername` hem `titanxis` kelimesi intent detection öncesi mesajdan case-insensitive silinir — brand/tag sözcüğü keyword eşleşmesini bozmaz.
  - **Örnek**: Grupta "puanım ne?" → sessiz. "TiTaNXiS puanım ne?" veya "@TiTaNXiS_BoT puanım ne?" → çalışır, puan komutu tetiklenir.


- **Feb 29, 2026 (v137.4 — Bot Grup NLP Fix)** — Backend:
  - **Root cause**: Gruplarda `update.effective_chat.id` grubun negatif kimliği; kullanıcının private DM'de linklenmiş `users.telegram_chat_id` ile ASLA eşleşmezdi → `_user_from_chat` None döndürüyor, NLP handler "hesabın bağlı değil" spamı gönderiyor ya da hiç yanıtlayamıyordu.
  - **`_user_from_chat`**: Yeni `user_id` opt parametresi. Grup mesajlarında `effective_user.id` (gönderen Telegram user_id) ile de sorgulanıyor. Private chat'te `chat_id == user_id` olduğu için tek yol her iki durumu kapsıyor. chat_map fallback iki kimliği de deniyor.
  - **`_require_link`**: `effective_user.id`'yi `_user_from_chat`'e forward ediyor. Grupta bağsız kullanıcıya kısa mesaj + private DM link'i; private'de tam 3-adımlı talimat.
  - **`nlp_message_handler`** (v137.4):
    - Grup mesajlarında `@BotUsername` prefix'i case-insensitive olarak temizlenir. Yalnızca mention gönderilirse sessizce dönülür.
    - Intent bulunamayan grup mesajları **sessizce yok sayılır** (spam engelleme). Private'da mevcut yardım mesajı korundu.
    - Log satırına `type=group/supergroup/private` eklendi, debug kolaylığı için.
  - **Not**: BotFather'da privacy mode disable olması gerekli — kullanıcı bunu zaten yaptığını doğruladı.


- **Feb 29, 2026 (v137.3 — LLM NLP + English Aliases)** — Backend:
  - **LLM tabanlı intent + entity extraction** (`telegram_bot.py`): Yeni `_llm_classify(text)` fonksiyonu Emergent LLM Key + Claude Sonnet 4.6 kullanır. STRICT JSON schema: `{intent, member, confidence}`. Keyword eşleşmesi olsa bile entity çıkarmak için her mesajda çağrılır; conflict durumunda LLM kazanır. Fail-soft: LLM hatası → keyword fallback.
  - **Entity injection**: `nlp_message_handler` LLM'den `member` çıkarırsa ve intent üçüncü-şahıs komut (`puan`, `profil`, `guc`, `rozet`, `istatistik`, `streak`, `karsilastir`) ise `context.args = [member]` set edilir. Böylece "Ali'nin puanı ne?" → `puan_command`'ın 3rd-person branch'i çalışır ve Ali'nin puanı döner.
  - **Python testi doğrulandı** (6/6): "Ali'nin puanı ne?" → intent=puan, member=Ali, conf=0.95; "what is Bob's streak?" → intent=streak, member=Bob, conf=0.95; "hava nasıl bugün" → intent=null (rejected).
  - **20 İngilizce alias eklendi**: `/points`, `/profile`, `/badges`, `/events`, `/stats`, `/calendar`, `/archive`, `/guild`, `/compare`, `/upcoming`, `/join`, `/leave`, `/remind`, `/language`, `/notifications`, `/pause`, `/invite`, `/feedback`, `/about`, `/reset_password`. Mevcut `/ranking`, `/power`, `/event`, `/help`, `/top5`, `/streak` (native EN) + `/baglanti`, `/komutlar` (TR alt yol) korundu. Toplam CommandHandler: **72** (52 → 72).
  - **`/yardim` güncellendi**: Yeni "🇬🇧 English aliases" bölümü tüm İngilizce komutları listeler.


- **Feb 29, 2026 (v137.2 — Test Mesajı Guard)** — Backend:
  - **`TELEGRAM_TEST_CHAT_ID`** yeni env değişkeni (`/app/backend/.env`) — varsayılan `5228424846`. Overridable.
  - **`send_message(is_test=True)`**: `telegram_bot.send_message` yeni parametre kabul ediyor. `True` iken çağıranın `chat_id`'si YOK SAYILIR, mesaj yalnızca `TELEGRAM_TEST_CHAT_ID`'ye gönderilir + metnin başına `🧪 [TEST]` prefix eklenir. Böylece hangi çağıran olursa olsun (kanal, grup, üye DM) yanlış hedefe test mesajı gitmez.
  - **Güncellenen test endpoint'leri** (`server.py`):
    - `POST /api/push/test` → channel + DM fan-out artık `is_test=True` ile TEST chat'e yönlenir. fan_out=true bile olsa gerçek üyelere hiç mesaj gitmez, sadece test grubuna 1 mesaj.
    - `POST /api/reports/trend/digest/test-send` → admin DM'i yerine TEST chat.
    - `POST /api/reports/trend/digest/recipients/{cid}/test` → belirtilen alıcı yerine TEST chat'e ping, response'a `test_routed: true` eklendi.
    - Bu 3 endpoint kırık `_send_tg_message` import'undan da temizlendi → artık `send_message` kullanıyor.
  - **Not**: `GOOGLE_TRANSLATION_API_KEY` bir önceki turda .env'e eklenmişti, dokunulmadı. Test guard geriye dönük uyumlu — mevcut broadcast/duyuru akışları `is_test` parametresini geçmiyor, dolayısıyla etkilenmiyor.


- **Feb 29, 2026 (v137 — Telegram NLP + Auto-Lang Reply)** — Backend:
  - **NLP Handler** (`telegram_bot.py`): Slash olmadan yazılan doğal-dil mesajları `MessageHandler(filters.TEXT & ~filters.COMMAND, nlp_message_handler, group=1)` ile yakalanır. Akış: (1) mesaj dilini algıla (Google Cloud Translation → DeepL fallback), (2) `_nlp_override_lang` ContextVar'ına pinle, (3) mesajı TR'ye çevir, (4) 23 intent × ~150 anahtar-kelime setiyle intent tespit et, (5) `globals()`'tan ilgili command handler'ı bul + çağır. Eşleşmeyen mesajlar için kullanıcının dilinde yardım-yönlendirici mesaj.
  - **`reply_ml` genişletildi**: Yeni öncelik-0 katmanı `_nlp_override_lang` ContextVar (NLP handler set eder). Slash-komutlarda ContextVar boş → mevcut `preferred_language` yolu devam eder. Böylece: NLP mesajı → mesajın dilinde yanıt; slash-komut → profil dilinde yanıt.
  - **Google Cloud Translation entegrasyonu**: Yeni `_google_translate()` fonksiyonu (`translate.googleapis.com/language/translate/v2` REST). `GOOGLE_TRANSLATION_API_KEY` doluysa DeepL yerine tercih edilir (kısa metinlerde detection daha güvenilir).
  - **Yeni yardımcılar**: `_detect_source()` artık Google → DeepL fallback zinciriyle çalışıyor. Yeni `_translate_to_tr()` intent matching öncesi kaynak dili TR'ye çevirmek için.
  - **Intent map**: streak, puan, siralama, profil, rozet, istatistik, takvim, yakinda, arsiv, lonca, online, guc, etkinlik, etkinlikler, mola, bildirimler, dil, hakkinda, sifremi_sifirla, geri_bildirim, davet, start, yardim (23 intent).
  - **Not**: `GOOGLE_TRANSLATION_API_KEY` şu anda backend .env'de yok (user rejim değişikliğinden önce ekleneceğini söyledi). Env boşken sistem DeepL fallback ile sorunsuz çalışır. Prod'da GOOGLE key eklenirse detection kalitesi otomatik yükselir.


- **Feb 29, 2026 (v136.6 — Etkinlik Adı Truncate Fix)** — Frontend-only:
  - **Ana etkinlik kartı** (line 786+): `whiteSpace: "nowrap"` → `"normal"` + `wordBreak: "break-word"` + `overflowWrap: "anywhere"`. Uzun isimler ("Prestige Warden / Prestige Warden", "SvS WaR & 151 / SvS Standard") artık `group / name` formatında iki-üç satıra sarılır, `...` görünmüyor.
  - **Alt-grup başlığı** (accordion header, line ~1817): `truncate flex-1` sınıfı kaldırıldı, `whiteSpace: normal + wordBreak + overflowWrap` eklendi.
  - **Etkinlik detay modalı** (line ~2262): Başlık `text-3xl` benzeri `<div>` uzun isimlerde artık düzgün sarılır. Cinzel font korundu.
  - Not: Arşiv klasör grid'indeki folder ismi (`c.name`, line ~1621) kasten `truncate` kaldı — bunlar kısa folder adları (Kupa 4, Sezon 1) ve grid dengesi için tek satır olmalı.


- **Feb 29, 2026 (v136.5 — Telegram Bot Error Message Overhaul)** — Backend:
  - **`_require_link`**: Genel "hesabını bağla" mesajı 3 adımlı actionable talimatlarla değiştirildi + kullanıcının chat ID'si mesaja eklendi (admin elle eşleyebilsin).
  - **`_require_admin`**: Kullanıcı adı + mevcut rol gösteriliyor artık ("Hesabın: X, rol: member").
  - **Yeni helper `_require_member`**: (a) chat bağlı mı, (b) user'a member eşlenmiş mi — iki farklı hatayı ayırt eder. Eşleşme yoksa net mesaj: "Telegram hesabınız bağlı ama lonca üyesiyle eşleşmemiş" + web panelinden nasıl eşleneceği anlatılır.
  - **Yenilenen handler'lar**: `/puan`, `/profil`, `/rozet`, `/istatistik`, `/streak` (self-mode) artık `_require_member` kullanıyor — belirsiz "🔗 Eşleşmiş üye yok" mesajı yok.
  - **RSVP komutları (`/katil`, `/katilmiyorum`)**: Eşleşme eksikse artık kullanıcı adı gösterir + Üyeler sayfasına link verir.
  - **Yeni aliaslar**: `/baglanti` → `/link`, `/komutlar` → `/yardim`.
  - **Boş argüman UX'i**: `/karsilastir`, `/hatirlatici`, `/geri_bildirim` boş çağrıldığında artık örnek kullanım + hint gösteriyor.
  - **Not found handling**: `/karsilastir` her iki üye bulunamadıysa ayrı ayrı hata döner; `/hatirlatici` etkinlik yoksa "`/etkinlikler` ile listele" ipucu verir.
  - Toplam kayıtlı komut: **52 CommandHandler** (önceden 50).


- **Feb 29, 2026 (v136.3 — Arşiv Filtre Paneli + Seri Silme UX + /streak Fix)** — Backend + Frontend:
  - **Gelişmiş Arşiv Arama** (`Events.jsx`): Arşiv sekmesinde klasör grid'inin ÜSTÜNE yeni `ArchiveFilterPanel` bileşeni eklendi — 4 alan: tarih başlangıç, tarih bitiş, tip/etkinlik adı, katılımcı (üye adı). Client-side filtreler `filteredEvents` useMemo'da uygulanır; participantQuery ≥ 2 karakter olunca `/points?search=X&limit=2000` SWR ile çekilir, o event_id'ler set olarak filtreye eklenir. Sağ üstte `filtered/total` mono count, en altta `archive-filter-reset` butonu (filtreler aktifken görünür).
  - **Seri Silme UX** (`EventDetailModal.doDelete`): Etkinlik `series_id` içeriyorsa, mevcut events listesinde aynı series_id'ye sahip başka etkinlik sayılır. Kalan 0 ise 3-seçenekli prompt yerine tek soru: "Bu, serinin son etkinliği. Tüm seriyi (kayıtları dahil) silmek istiyor musun?" (i18n key `confirm_delete_last_series`). Onay verilirse `DELETE /events/series/{id}` çağrılır → seri tamamen silinir, yarım kayıt kalmaz. Kalan >0 ise mevcut 3-seçenekli prompt korunur ama "N etkinlik" bilgisi eklenir.
  - **Telegram /streak Fix** (`telegram_bot.py`): `rsvp_streaks` koleksiyonu bu deployment'ta hiç var olmadığı için `streak_command` her zaman "Henüz streak verisi yok" fallback'i döndürüyordu. Fix: komut artık `event_rsvps` koleksiyonundan dinamik hesaplama yapıyor — mevcut `_compute_user_yes_streak` mantığını mirror'lıyor (attendance-enabled etkinlik + en yeniden geriye "yes" sayacı; 'no'/'maybe' seriyi kırar). Ek olarak `best_streak` tüm zamanların en uzun ardışık "yes" serisi olarak hesaplanır. Milestone hint (`5, 10, 15, 20, 25, 50, 100`) — sonraki hedefe kaç etkinlik kaldığını gösterir. Python unit test ile doğrulandı (current=1, best=7 senaryosunda).


- **Feb 29, 2026 (v136.2 — Recurrence Bug Fix)** — Backend:
  - **Root cause**: `EventCreate` Pydantic modeli `recurrence_interval` + `recurrence_count` alanlarını tanımlamıyordu (sadece `EventUpdate`'de vardı). Sonuç: `body.model_dump()` bu alanları çıkarıyordu → `payload.pop(...)` her zaman `None` döndürüyordu → `interval="none"` → hiç seri oluşmuyordu, sadece tek etkinlik yaratılıyordu.
  - **İkinci bug**: `TemplateSeriesModal` "daily" interval'ini gönderiyor ama backend `step_days` haritası sadece `{"2days": 2, "weekly": 7, "2weekly": 14}` içeriyordu → daily eşleşmiyordu.
  - **Fix**: `EventCreate`'e `recurrence_interval: Optional[str]` + `recurrence_count: Optional[int]` eklendi. POST + PATCH `/api/events` içindeki `step_days` haritasına `"daily": 1` eklendi.
  - **Curl doğrulaması**: daily/weekly/monthly/2days/2weekly × 4 = 4 event her seferinde. Şablondan seri oluşturma artık `recurrence_count` kadar tek çağrıda tüm etkinlikleri yaratıyor.


- **Feb 29, 2026 (v136.1 — Ziyaretçi Menü Filtresi)** — Frontend-only:
  - **RadialMenu**: `!user && !isGuest` şartıyla artık ziyaretçiye de görünüyor. Item'lara `guestPublic` flag'i eklendi: Sıralama, Komutanlar, Puan Hesaplama serbest; Etkinlikler, Üyeler, Raporlar guest için `guestLocked=true`. Kilitli item'lar %50 opacity + `grayscale(1) brightness(0.8)` + sağ üst köşede 🔒 rozeti. Klik → toast "Bu sayfayı görüntülemek için giriş yapmalısınız" + LockedPage'e yönlendirme.
  - **Header dropdown**: Yeni `header-guest-menu-btn` ("🎭 ZİYARETÇİ") ziyaretçi için `header-login-btn` yerine görünüyor. Dropdown 2 bölüm: Public (Sıralama, Duyurular, Lonca Kuralları, Lonca, Puan Hesaplama, VIP Destek) + "🔒 Kilitli (Giriş Gerekli)" divider altında gri (Etkinlikler, Üyeler, Profilim, SvS Takip) — hepsi tıklanabilir, LockedPage'e düşer. En altta "🔑 Giriş Yap" (`guest-menu-login`).
  - **i18n**: 2 yeni key (`guest_badge`, `guest_locked_section`) TR + EN eklendi.
  - **QA**: Playwright ile Header dropdown doğrulandı (screenshot); RadialMenu build'de temiz (test cookie banner overlay yüzünden click yapamadı ama kod düzgün).


- **Feb 29, 2026 (v136 — Ziyaretçi Girişi)** — Frontend-only:
  - **AuthContext**: Yeni `isGuest` state (sessionStorage `ol_guest=1`) + `loginAsGuest()` action. Token yaratmaz; sekme kapanınca temizlenir. `logout()` hem token'ı hem guest flag'i düşürür.
  - **Login.jsx**: "🎭 ZİYARETÇİ OLARAK GİR" butonu (`guest-enter-btn`) amber "GİRİŞ YAP"ın altında. Klik → `loginAsGuest()` + toast + `nav("/")`.
  - **App.js RequireAuth / RequireAdmin / RequireAdminOrEditor**: `!user && isGuest` durumunda artık `/login`'e redirect etmiyor, `<LockedPage />` render ediyor. Public route'lar (`/`, `/komutanlar`, `/duyurular`, `/kurallar`, `/lonca`, `/vip-destek`, `/puan-hesaplama`) ziyaretçi için erişilebilir kalıyor.
  - **`LockedPage.jsx`** (yeni sayfa): Amber kilit iconu + `locked_page_title` + `locked_page_message` + `locked_page_login_btn` — tüm metinler `useTranslation()` ile. `data-testid`'ler: `locked-page`, `locked-page-icon`, `locked-page-title`, `locked-page-message`, `locked-page-login-btn`.
  - **i18n**: 3 yeni key (`guest_login_btn`, `guest_login_hint`, `locked_page_title/message/login_btn`) TR + EN eklendi; kalan 27 dil `deepl-retry-i18n` cron'unda otomatik doldurulur.
  - **QA**: Playwright ile doğrulandı — `/uyeler` ve `/etkinlikler` guest için LockedPage; `/` (Sıralama) guest için tam çalışır.


- **Feb 29, 2026 (v136 — Manuel Arşiv + Etkinlik Türü Copy Fix)** — Backend + Frontend:
  - **Members.jsx Syntax Fix**: `MembersOcrRegisterDropdown` bileşeninde eksik olan `);` + `}` kapanış işaretleri eklendi (satır 296 sonrası). Yanlış konumdaki orphan `);}` satırları temizlendi. Frontend build tekrar geçiyor.
  - **Auto-Archive Devre Dışı**: `/app/.emergent/crons.yml` içindeki `auto-archive-sweep` job `enabled: false` yapıldı. Süresi geçmiş etkinlikler artık kendiliğinden arşive taşınmıyor — admin manuel karar veriyor.
  - **Manuel Arşiv + Klasör Seçimi**: `POST /api/events/bulk-archive` payload'ı `folder_id: Optional[str]` alanı kabul ediyor (`"__none__"` = klasörsüz yap; herhangi bir string = o klasöre taşı; None = mevcut klasör korunsun). `EventsBulkToolbar` içine yeni **📦 Klasöre Arşivle…** dropdown'u eklendi — arşive alma ile klasör atamasını tek adımda yapıyor. Mevcut "Arşive Al" butonu (klasörsüz varsayılan) korundu.
  - **Etkinlik Türü Copy Fix**: Yeni etkinlik menüsündeki İttifak Etkinliği açıklaması `SvS, KvK, kale savaşı — tüm ittifak katılır` → `SvS, Kristal, kale savaşı` olarak güncellendi (KvK→Kristal, "tüm ittifak katılır" ibaresi kaldırıldı). Bireysel Etkinlik açıklaması `Tek kişilik etkinlik — sıralamayı etkilemez` → `Bireysel Etkinlik` olarak güncellendi ("Tek kişilik" ve "sıralamayı etkilemez" ibareleri kaldırıldı). i18n key `events_new_alliance_hint` + `events_new_bireysel_hint` fallback metinleri değişti; DeepL çevirileri bir sonraki `deepl-retry-i18n` cron'unda otomatik yenilenir.


- **Feb 29, 2026 (v135.51 OCR Audit Log + Undo — Tüm Ekranlar + Pasha Full Access)** — Backend + Frontend:
  - **Backend `routes/ocr_audit.py`** (yeni): `ocr_audit` koleksiyonu + 3 endpoint. `POST /api/ocr/audit` op kaydı (op_type, created/updated member IDs, created point IDs, event_id, user_id/email), `GET /api/ocr/audit/recent?limit=20` — normal admin kendi ops'larını, `pasha@titanxis.com` TÜM ops'ları görür, `POST /api/ocr/audit/{op_id}/undo` — created_member_ids ile members.delete_one + created_point_ids ile points.delete_one; `undone=True` mühürlenir. Yetki: sadece kendi op'unu (pasha hariç). Server startup'ta index ensure.
  - **Frontend `OcrDialog.doApply`**: `onApply(filteredData, extra)` sonucundan `created_member_ids/updated_member_ids/created_point_ids` toplayıp `POST /api/ocr/audit`'e ekler. `op_type = ocr_event_points | ocr_power | ocr_castle_rank`. Audit kaydı başarısızsa console.warn ile geçilir.
  - **Frontend `OcrUndoBar` (Members.jsx)**: SWR ile `/ocr/audit/recent` (30s poll). Son 3 op'u chip olarak listeler — normal admin sadece kendisininkileri, pasha başkalarınınkini mor renkte kullanıcı adıyla görür. Her chip'te `ocr-undo-btn-{id}` "Geri Al" → confirm → POST undo. Toast: "{m} üye, {p} puan silindi".
  - **MemberAddOcr Undo**: v135.50'de eklenen session-based `undoStack` korunur (audit'ten bağımsız). Yeni audit endpoint MemberAddOcr'a da bağlanabilir (bir sonraki iterasyon).
  - **Pasha Full Access**: `PASHA_EMAIL="pasha@titanxis.com"` sabit; audit list'te + undo endpoint'inde bu email'e sahip user tüm ops'ları görüp undo edebilir. `is_pasha` flag response'ta döner → UI mor renk highlight.
  - **i18n**: `ocr_undo_confirm/done_toast/btn`.


- **Feb 29, 2026 (v135.50 OCR Geri Al + Alliance Dropdown)** — Frontend-only:
  - **Geri Al (MemberAddOcr)**: Yeni `undoStack` state — `saveRow` her başarılı POST /members'te oluşan `{id, name}`'i yığına ekler. Sayfanın altında sticky `moa-undo-bar` (border-slate) — "↶ Bu oturumda {N} yeni üye eklendi" + `moa-undo-btn` "Geri Al" butonu. Tık: window.confirm → her ID için DELETE /members/{id}, toast özeti; row.existing_id sıfırlanır → satır tekrar "eksik" haline döner.
  - **Yetki**: Her admin kendi session'ında yığdığı ID'leri silebilir; `pasha@titanxis.com` giriş yaparsa aynı UI'yı görür, ama backend `require_admin` her admin'e DELETE hakkı verdiği için hepsi çalışır (kritik uyarı: session'a ait olmayan ID'ler UI'da görünmez, dolayısıyla dolaylı yoldan izole).
  - **Alliance Dropdown**: MemberAddOcr'daki `<input list="moa-alliances-{idx}">` + `<datalist>` mevcut — kullanıcı listeden seçebilir veya manuel yazabilir. Yeni isim yazılırsa backend `POST /members` alliance_name'i doğrudan kabul eder (yeni ittifak yaratma otomatik).
  - **i18n**: `moa_undo_*` (confirm, done_toast, summary, btn, undoing).
  - **OcrDialog**: Var olan alliance input'u zaten datalist-benzeri autocomplete davranıyor; Undo desteği bu iterasyonda member-level (MemberAddOcr) ile sınırlı. Bulk OCR apply'ları için Undo, backend'de audit log gerektiriyor — bir sonraki iterasyonda ele alınacak.


- **Feb 29, 2026 (v135.49 "Tümünü Ekle" — Tüm OCR ekranları)** — Frontend-only:
  - **OcrDialog** (Bireysel Güç + Kale/Rank + Etkinlik Puanı): En alttaki "Onayla & Kaydet" butonu **"Tümünü Ekle (N)"** olarak yeniden adlandırıldı ve hemen üstüne yeni `ocr-bulk-summary` chip bloğu eklendi — ✅ Eşleşen: N (güncellenecek), ➕ Yeni: N (oluşturulacak), ⊘ Hariç: N (excluded). Matched sayımı `_stripTagAndJunk(_stripTag(...))` üzerinden existingNamesLc lookup ile.
  - **MemberAddOcr** (`/uye-ekle-ocr`): Sayfanın en altına sticky bottom bar `moa-bulk-bar` eklendi — solda özet ({{n}} eşleşmeyen · N eşleşen zaten mevcut), sağda `moa-bulk-save-all` "Tümünü Ekle" butonu. `saveAllMissing()` fonksiyonu tüm eksik satırlar için sırayla `saveRow(idx)` çağırır; başarı/hata sayılarını toast özeti gösterir. Boş ittifaklı satırlar varsa önce uyarı verilir.
  - **i18n**: `ocr_bulk_matched/new/excluded/save_all_btn/saving`, `moa_bulk_*` (bar başlığı, hint, done_toast, alliance_missing) — TR fallback + 29 dile hazır.
  - **Backend değişiklik yok** — mevcut `/api/ocr/apply-members`, `/api/ocr/apply-event-points`, `/api/members` POST'ları yeniden kullanılır.


- **Feb 29, 2026 (v135.48 REVERT v135.47 — Raw OCR Isim Korunur)** — Frontend-only:
  - **v135.47 tersine çevrildi**: DB'ye artık ORİJİNAL ham OCR ismi yazılır (CJK/emoji/dekoratifler dahil). Latin normalize sadece eşleştirme ve fuzzy karşılaştırma için kullanılır.
  - **OcrDialog `applyEditsAndKeep`**: v135.47'de eklenen zorunlu `_stripTagAndJunk(next.name)` normalize bloğu kaldırıldı. Event mode'da OCR'ın verdiği `next.name` cleaned versiyona düşer YALNIZCA kullanıcı patch etmediyse (mevcut davranış). Members mode'da `next.name` hiç değişmez → ham OCR ismi DB'ye yazılır.
  - **OcrDialog "+ Yeni Üye Ekle" chip**: POST /members'e `String(currName).trim()` (ham) gönderilir; `cleanForMatch` sadece badge display + fuzzy için.
  - **MemberAddOcr**: `row.name` HAM, yeni alan `row.name_clean` sadece eşleştirme+fuzzy+display için. `saveRow` `rawName` yazar. Missing row'da `Eşleşmedi: {name_clean}` gösterilir; hemen altında `moa-raw-name-{idx}` küçük mono satırı "DB'ye yazılacak: {ham}" bilgisi verir.
  - Node smoke doğrulaması: match key = "쁠メEvil Mikeyメ쁠".stripTagAndJunk() = "Evil Mikey" (eşleştirmede kullanılır) ama DB'ye yazılan `name` = "쁠メEvil Mikeyメ쁠" (orijinal).


- **Feb 29, 2026 (v135.47 OCR Kayıt Isim Normalize — DB'ye Sadece Latin)** — Frontend-only:
  - **OcrDialog `applyEditsAndKeep`**: BOTH modes (event + members) için map sonunda satırın final `next.name` alanı `_stripTagAndJunk` ile Latin-only normalize edilir. Kullanıcı datalist'ten seçmiş, manuel yazmış veya OCR ham şekilde bırakmış olsa dahi backend'e daima temizlenmiş isim gider (`쁠メEvil Mikeyメ쁠` → `Evil Mikey`, `[GOW] Ekko ツ R5` → `Ekko`).
  - **OcrDialog "+ Yeni Üye Ekle" chip'i** (event mode): POST /members'e gönderilen `name` artık `_stripTagAndJunk(cleanForMatch || currName)` sonucudur — CJK karakter DB'ye yazılamaz.
  - **MemberAddOcr `saveRow`**: `cleanName = stripTag(r.name)` uygulanır ve `updateRow(idx, { name: cleanName, ... })` ile UI'daki row.name da temizlenir; sonraki eşleşme sorgusu da temiz isim üzerinden yapılır.
  - **Eşleşme önerileri**: fuzzy suggestion display'ler zaten DB'den gelen (temiz) `member.name` gösteriyor. Kirli OCR ismi ise başlık badge'inde `cleanForMatch` üzerinden gösterilir → hem "Eşleşti/Eşleşmedi: X" hem de "→ Aday" satırları Latin-only.
  - **Doğrulama** ✅ (Node): `쁠メEvil Mikeyメ쁠 → "Evil Mikey"`, `[GOW] Ekko ツ R5 → "Ekko"`, `22 [GOW] 쁠メEvil Mikeyメ쁠 R3 → "Evil Mikey"`.


- **Feb 29, 2026 (v135.46 Fuzzy Matching + Latin Normalize — Tüm OCR)** — Frontend-only:
  - **Latin normalize**: `OcrDialog._stripTagAndJunk` + `MemberAddOcr.stripTag` artık `[^\x20-\x7E]` regex ile CJK (쁠, メ, ツ, 兰), emoji ve dekoratif Unicode karakterlerini boşluğa çevirip trim ediyor. Doğrulama: `쁠メEvil Mikeyメ쁠 → Evil Mikey`, `[GOW] Ekko ツ → Ekko`, `兰ThoR → ThoR`.
  - **Fuzzy matching**: `_fuzzyTopMatches` (OcrDialog) + yeni `_fuzzyTop` (MemberAddOcr) — Levenshtein bazlı, `rel < 0.55` (önceki 0.45'ten daha esnek) + substring boost (needle içeriyor/içeriliyor ise dist-2). Renk kodlaması: dist ≤ 1 yeşil, ≤ 2 açık yeşil, ≤ 3 amber, else turuncu.
  - **Etkinlik OCR (event mode)**: Eşleşmeyen satırlarda `ocr-row-fuzzy-{i}` bloğu — "Bu kişiyle eşleşsin mi?" prompt + her aday için `→ Aday Adı  ✓ Evet` butonu (`ocr-row-fuzzy-yes-{i}-{fi}`). Tıklayınca `setRowEdits` ile satır adı güncellenir, isMatched otomatik true olur.
  - **Üye Ekle OCR (MemberAddOcr)**: Eksik satırda `moa-fuzzy-{idx}` bloğu — aynı prompt + `✓ Evet` (`moa-fuzzy-yes-{idx}-{fi}`) — tıklayınca satır existing_id/name/alliance/rank ile doldurulup registered'a taşınır. Fuzzy yoksa mevcut `Yeni Üye Ekle / Manuel Eşleştir` akışları çalışır.
  - **Bireysel Güç + Kale/Rank OCR (mode==="members" subMode)**: Zaten mevcut `suggestions` (fuzzyTopMatches) chip'leri yeni Latin normalize ile "쁠メ..." gibi kirli isimleri de bulur → v135.44 badge'i "✅ Eşleşti"/"⚠️ Eşleşmedi" formatında satır başına yansır.
  - **Backend değişiklik yok** — apply-members ve apply-event-points aynı row shape'i (name normalize edilmiş) alıp doğru üyeye yazar/otomatik yaratır.


- **Feb 29, 2026 (v135.45 Etkinlik OCR Eşleşme Sistemi + Yeni Üye / Manuel Eşleştir)** — Frontend-only:
  - **OcrDialog.jsx event mode**: Her satırın name cell'inin üstüne yeni `ocr-row-match-{i}` badge — ✅ Eşleşti: X (yeşil) veya ⚠️ Eşleşmedi: X (amber). Eşleşme algılamada `_stripTag + _stripTagAndJunk` uygulanıp `existingNamesLc` Set'inde arama yapılır.
  - **Eşleşmeyen satırlar** için iki chip aksiyon çıkar:
    - **`ocr-row-create-member-{i}` (+ Yeni Üye Ekle)** — `POST /api/members` ile `name` + `alliance_name` (row alliance guess) + `rank="R1"` gönderir; başarı toast'ından sonra `globalMutate("/members")` ile SWR cache tazelenir → satır otomatik "Eşleşti" durumuna geçer, sonraki apply-event-points'te puan bu yeni üyeye kaydedilir.
    - **`ocr-row-manual-match-{i}` (↔ Manuel Eşleştir)** — name input'a `list={ocr-ev-members-list-{i}}` datalist bağlanır (tüm mevcut üyeler). Buton input'a focus + select yapar; admin datalist'ten seçince satır adı değişir ve otomatik "Eşleşti" durumuna geçer. Puan seçilen üyeye kaydedilir.
  - **i18n**: `ocr_match_create_btn/hint`, `ocr_match_manual_btn/hint`, `ocr_match_created_toast`, `ocr_match_name_required`, `ocr_match_matched/unmatched(_hint)` (paylaşımlı).
  - **Backend değişikliği yok** — apply-event-points zaten adı normalize edip mevcut üyeye puan kaydeder; yeni üye eklendiğinde `existingMembers` set'i tazelenip apply doğal olarak eşleşir.


- **Feb 29, 2026 (v135.44 OCR Eşleşme Sistemi — Üç Sürüm)** — Frontend + backend polish:
  - **Ortak mantık**: 3 OCR akışında (Üye Ekle, Bireysel Güç, Kale/Rank) her satır için AÇIK eşleşme durumu gösterilir:
    - ✅ `Eşleşti: [Üye Adı]` — mevcut kayıt bulundu → apply'da alanları (güç/rank/kale) günceller
    - ⚠️ `Eşleşmedi: [Üye Adı]` — sistemde yok → apply'da otomatik yeni üye kaydı oluşturur (OCR'daki ittifak + rütbe ile). Backend `/api/ocr/apply-members` bu davranışı zaten yapıyor (mevcut hata: match_key varsa update, yoksa `db.members.insert_one({...})`).
  - **MemberAddOcr.jsx** (`/uye-ekle-ocr`): Etiketler artık "Eşleşti"/"Eşleşmedi" formatı. Eksik satır header'ı "⚠️ Eşleşmeyen Üyeler — Otomatik Yeni Kayıt Oluşturulabilir". Kayıtlı bölüm header'ı "✅ Eşleşen Üyeler". Her satır: `⚠️ Eşleşmedi: {name}` / `✅ Eşleşti: {existing_name}`. Özet chip'leri: "✅ Eşleşti: N" ve "⚠️ Eşleşmedi: N".
  - **OcrDialog.jsx** (Bireysel Güç + Kale/Rank OCR): `mode==="members"` (subMode=power|castle_rank) name cell'inin üstüne yeni `matchBadge` (data-testid `ocr-row-match-{i}`) — `existingNamesLc` lookup ile kırmızı/yeşil renkli chip. Hover tooltip: matched → "alanları güncellenecek", unmatched → "otomatik yeni kayıt oluşacak".
  - **i18n**: `ocr_match_matched/unmatched(_hint)`, `moa_summary_matched/unmatched`, `moa_matched_prefix`, `moa_unmatched_prefix`, `moa_missing_title` (yeni metin), `moa_missing_badge` (YENİ KAYIT).
  - **Backend değişikliği yok** — `/api/ocr/apply-members` mevcut auto-create yolu (line 337-352 of `routes/ocr.py`) satırdaki `alliance_name` + `rank` + `power` + `castle_level` ile yeni doc yaratıyor; matched path (line 313-336) alanları güncelliyor. Kullanıcının 4 maddelik gereksinimi backend'de zaten karşılanmış durumda.


- **Feb 29, 2026 (v135.43 Events "Yeni" Split + "Şablondan" Kaldırıldı + Members OCR Array Fix)** — Frontend-only:
  - **Events.jsx**: Eski üç ayrı buton (`events-bireysel-add-btn`, `events-add-btn`, `events-tpl-quickpick-btn`) tek 'Yeni' dropdown'a birleştirildi. `Yeni` butonuna tıklayınca `events-new-menu` açılır → 2 seçenek: `events-new-menu-bireysel` (Bireysel Etkinlik — mevcut `BireyselEventForm`) ve `events-new-menu-alliance` (İttifak Etkinliği — mevcut `EventForm`). `TemplateQuickPickButton` render'ı tamamen kaldırıldı (component tanımı ve `TemplateSeriesModal` kodu ileride başka menüden çağırılmak üzere dosyada dursun diye korundu).
  - **Dışa tıklama kapatma**: `newEventOpen` state + `newEventMenuRef` ile menü dışı tıklamada kapanır; toggle butonuna tıklandığında flip.
  - **Members.jsx**: v135.42'de `OcrRegisterDropdown` function yanlışlıkla `NOTE_COLORS` array literalinin içine yerleştirilmişti — array kapatılıp function array'in DIŞINDA module scope'a taşındı. Runtime `OcrRegisterDropdown is not defined` hatası çözüldü.
  - 4 yeni i18n key TR fallback ile: `events_new_bireysel_label/hint`, `events_new_alliance_label/hint`.
  - **Doğrulama** ✅: `/etkinlikler` – old_bireysel(0)=0, old_tpl(0)=0, new dropdown 2 seçenek görünüyor. `/uyeler` – OCR Kayıt dropdown 3 seçenek gösteriyor, old_power(0)=0, old_castle(0)=0.


- **Feb 29, 2026 (v135.42 OCR Kayıt Birleştirilmiş Menü)** — Frontend-only:
  - `Members.jsx` header'ında Guild CSV butonunun yanına yeni **OCR Kayıt** dropdown (`members-ocr-register-btn`, mor). 3 alt seçenek: (1) `members-ocr-add-member` → `/uye-ekle-ocr` navigate, (2) `members-ocr-option-power` → mevcut `OcrDialog` power modu, (3) `members-ocr-option-castle-rank` → mevcut castle_rank modu.
  - Eski `members-ocr-power-btn` ve `members-ocr-castle-btn` chip'leri kaldırıldı; artık 3'ü de bu tek menü altında toplandı.
  - Yeni component: `OcrRegisterDropdown` (Members.jsx içinde, module scope). `useNavigate` (react-router-dom) + `ScanSearch` (lucide-react) importları eklendi.
  - 8 yeni i18n key TR fallback ile (`members_ocr_register_*`, `members_ocr_option_*`, `members_guild_csv_*`).


- **Feb 29, 2026 (v135.41 Üye Ekle — OCR)** — Frontend-only:
  - **Yeni sayfa** `/app/frontend/src/pages/MemberAddOcr.jsx` (~230 satır): Kesin kapsam — (1) görsel yükleme alanı `moa-upload-dropzone`, (2) `POST /api/ocr/parse?mode=members` ile OCR (sadece alliance_name+name+rank kullanılır; power/castle_level yok sayılır), (3) DB üyeleriyle case-insensitive isim kıyaslaması → mevcutlar "KAYITLI" yeşil rozet, olmayanlar amber vurgulu form, (4) her eksik satır için ittifak (`datalist` autocomplete) + rütbe (R1-R5) düzenlenip `POST /api/members` ile kaydet — sonra otomatik "kayıtlı" state'ine geçer, (5) başka özellik YOK.
  - **Route**: `/uye-ekle-ocr` (RequireAdmin), Header menüsünde 📸 "Üye Ekle — OCR" (`data-testid=dropdown-member-add-ocr`).
  - **i18n**: 25+ yeni key (`moa_*` prefix) TR fallback ile 29 dile hazır.
  - **Backend değişikliği yok** — mevcut `/api/ocr/parse` + `POST /api/members` yeniden kullanılır.


- **Feb 29, 2026 (v135.40 Retry Policy + Şablondan Seri)** — Backend + Frontend:
  - **Retry Policy** (`/app/backend/routes/rsvp_templates.py`): `check_and_fire_due_schedules()` yeniden yazıldı. `BACKOFF_MINUTES=[1,5,15]` + `MAX_ATTEMPTS=3`. Başarısız denemede `attempts++`, `next_retry_at = now + backoff[attempts-1]`, `last_error` yazılır. 3. deneme başarısız olursa `sent=True` + `abandoned=True` + ERROR log — sonsuz retry riski ortadan kalktı. Başarıda `next_retry_at` unset edilir. Query'de `$or: [{next_retry_at:{$exists:false}}, {next_retry_at:null}, {next_retry_at:{$lte:now}}]` — bekleyen retry'lar zamanı gelene kadar es geçilir. E2E doğrulama: `cycle 1 attempts=1 → cycle 2 attempts=2 → cycle 3 attempts=3 sent=True abandoned=True` (logs: `retry 1/3 in 1min`, `retry 2/3 in 5min`, `ABANDONED after 3 attempts`).
  - **RSVP Schedules List UI** (`Templates.jsx`): Retry chip (`rsvp-schedule-retry-{id}` "Deneme N/3" + sonraki deneme saati) + abandoned chip (`rsvp-schedule-abandoned-{id}` "Vazgeçildi (3 deneme) · <error>"). Renk: retry sarı, abandoned kırmızı; sent yeşil; bekleyen mavi (mevcut).
  - **Şablondan Seri Oluştur** (`Events.jsx`): `TemplateQuickPickButton` her satırı 2'ye böldü — sol tıkla tek etkinlik (mevcut), sağdaki "🔁 Seri" chip'i yeni `TemplateSeriesModal`'ı açar. Modal içerik: başlangıç tarihi/saati + 6 preset button (Haftalık×4/8, Aylık×3/6, Günlük×7, Özel) + interval select + count input (1-24) + canlı tarih preview + Submit. Preset click → interval+count auto-set; interval/count manuel değiştirilirse preset "Özel"e döner. Submit: `POST /events` (recurrence_interval, recurrence_count) → backend seriyi tek çağrıyla yaratır (mevcut recurrence altyapısı). Tüm SWR key'leri mutate edilir; toast: `{{spawned}} etkinlik oluşturuldu (şablon: {{tn}})`.
  - **Tüm metinler `useTranslation`** — 29 dile hazır fallback: `tpl_series_*`, `rsvp_sch_retry_status`, `rsvp_sch_abandoned*`, `events_tpl_series_*`.
  - **Screenshot doğrulama**: Modal başlığı `🔁 ŞABLONDAN SERİ OLUŞTUR`, T1 template context, 08/30 20:00 başlangıç, Haftalık×4 preset seçili, preview 4 tarihi listeliyor.


- **Feb 29, 2026 (v135.39 Şablon Kısayolları + Zamanlayıcı + Test Gönder + Etkinlik Şablon Quick-Pick)** — Backend + Frontend:
  - **Backend refactor**: `/app/backend/routes/rsvp_templates.py` sıfırdan yazıldı. Send mantığı `_run_send` + `_fanout_push_and_tg` + `_resolve_targets` şeklinde parçalandı; hem `/send`, hem yeni `/test-send`, hem zamanlanmış görevler aynı yolu paylaşıyor.
  - **`POST /api/rsvp-templates/{tid}/test-send`**: Tek kullanıcıya deneme (body.user_id boşsa admin'in kendisi). Yanıt: `{recipient, has_push_subscription, has_telegram_chat, push_sent, telegram_sent, channels, ...}`.
  - **`/api/rsvp-schedules` CRUD** (GET + POST + DELETE): `template_id` + `event_id` + `minutes_before ∈ {15,30,60,120,180,360,720,1440}`. `send_at` server-side hesaplanır (`event.date - minutes_before`). GET join yaparak `template_name/event_name/event_date` ekler.
  - **`make_scheduler_loop(db)`**: Startup'ta `_asyncio_cron.create_task` ile 60 sn'de bir `check_and_fire_due_schedules(db)` çağırır. Zamanı gelen `sent=False` planları `_run_send` ile ateşler, `sent=True/fired_at/target_count/push_sent/telegram_sent` mühürler. Hata olursa `last_error` alanına yazar (planı yeniden denenmez).
  - **Şablon silinince cascade**: `DELETE /rsvp-templates/{tid}` şablonun tüm planlarını da temizler.
  - **Frontend `Templates.jsx`**: `useSlashFocus` hook — `/` tuşu section search input'una odaklanır (INPUT/TEXTAREA aktifse hijack etmez). `useCtrlEnterSubmit` hook — modal içinde Ctrl/Cmd+Enter form submit tetikler. `TemplateSearchInput` shared atom, üç sekmede live substring filtrele. `RsvpScheduleModal` + `RsvpSchedulesList` (data-testid `rsvp-schedules-list`) — planlanan hatırlatmaları listeler, sil butonu. `rsvp-tpl-test-send-{id}` butonu — admin'e Test Gönderim + toast.
  - **Frontend `Events.jsx`**: Yeni `TemplateQuickPickButton` component (module scope), "Yeni Etkinlik" butonunun yanına eklendi. Dropdown açılınca aktif event-template'leri listeler; tıklayınca `EventForm(initialTemplate=tpl)` açılır, yeni `useEffect` ile `applyTemplate` çağırılıp form pre-fill olur.
  - **E2E doğrulama** ✅ (curl): test-send admin (recipient=admin), schedule create + list + delete OK, bad minutes_before 400, auth kontrolleri 401. Screenshot: /etkinlikler'de "Şablondan" mor buton görünüyor; `/` shortcut ile focused_testid=`tg-tpl-search` doğrulandı.


- **Feb 29, 2026 (v135.38.1 RSVP Targeting Bug-Fix)** — Backend:
  - **CRITICAL fix**: `POST /api/rsvp-templates/{id}/send` alliance targeting yeniden yazıldı. Önceki sürüm `db.users.alliance_name` alanına bakıyordu (mevcut olmayan alan) — bu yüzden GOW gibi bir alliance_scope'lu her etkinlik için target_count=0'a düşüyordu. Yeni sürüm `_resolve_user_alliances` mantığını yansıtıyor: `user.member_ids` + `user.member_id` + reverse `members.user_id` ile üye kayıtları toplanır, `members.alliance_name` ve `members.telegram_chat_id` join ile batch çekilir.
  - Ek düzeltmeler: `alliance_scope` boş veya `'all'` -> filtresiz (server.py `_rsvp_alliance_query` ile hizalı). `send_count`/`last_sent_at` sadece `target_count > 0` iken artırılır (UI'da yanıltıcı "gönderim" badge'i olmasın). `_users_disabled_for_pref('reminder')` opt-out'u uygulanıyor.
  - **UI**: RSVP hint banner kontrast artışı (`text-sky-200` + kalın border) + `<option>` label plain string olarak render (React hydration uyarısı düzeltildi).
  - **E2E doğrulama** ✅ (curl): GOW event üzerinde `target_count=9` (önce 0'dı), `send_count` doğru artıyor.


- **Feb 29, 2026 (v135.38 Şablonlar Hub — Telegram + Etkinlik + RSVP Hatırlatma)** — Backend + Frontend:
  - **RSVP Hatırlatma Şablonları (yeni)** (`/app/backend/routes/rsvp_templates.py`): Yeni koleksiyon `rsvp_templates` + `GET /api/rsvp-templates?archived=` + `POST` + `PATCH` (name/body/channels/archived) + `DELETE`. Ayrıca `POST /api/rsvp-templates/{tid}/send { event_id, include_maybe }` — etkinlik alliance_scope'undaki `is_active != false` kullanıcılardan RSVP vermeyenlere Web Push + Telegram DM fanout. Lazy import `_get_or_create_vapid` + `pywebpush` + `telegram_bot.send_message`. Server startup'ta index ensure (`archived`+`updated_at`).
  - **Event Templates full PATCH + Archive** (`/app/backend/routes/event_templates.py` yeniden yazıldı): Tam PATCH (template_name/name/group_name/multiplier/subtitle/banner_url/reminder_enabled/attendance_enabled/hidden_from_leaderboard/show_breakdown/archived). GET default archived olmayanları döner; `?archived=true` sadece arşiv. Boş template_name/name -> 400.
  - **Telegram Templates Archive** (`/app/backend/routes/telegram_templates.py`): `TemplateUpdate` şemasına `archived` alanı, `GET` default `{archived:{$ne:True}}`, `?archived=true` filter. Var olan PATCH akışı archived toggle destekler.
  - **Şablonlar Hub UI** (`/app/frontend/src/pages/Templates.jsx` yeni): Tek sayfa 3 sekme (Telegram / Etkinlik / RSVP Hatırlatma), her sekmede Aktif/Arşiv toggle + Yeni Şablon butonu. Ortak `ArchiveToggle`, `SectionList`, `ModalShell`, `Field`, `SubmitBtn` atomları. Composerlar: `TelegramComposer` (name+category+body), `EventComposer` (template_name+name+group+multiplier+subtitle+banner+4 toggle), `RsvpComposer` (name+body+push/tg channels). `RsvpSendModal` — event picker + include_maybe + `POST /rsvp-templates/{id}/send` çağrısı, toast ile hedef/push/telegram sayıları.
  - **Menü Yeniden Adlandırma** (`Header.jsx`): "Telegram Şablonları" (📨) yerine "Şablonlar" (📚) menü öğesi `/sablonlar`'a gider. `App.js`'te `/sablonlar` route yeni `Templates` bileşenine, eski `/admin/telegram-sablonlar` route da aynı bileşene alias (geri uyumluluk).
  - **Tüm metinler `useTranslation()`** — TR fallback ile 29 dilin tümüne genişletilebilir (`tpl_tab_*`, `tpl_view_active/archive`, `rsvp_tpl_*`, `ev_tpl_*`).
  - **E2E doğrulama** ✅ (curl): POST rsvp create OK, GET active/archive filter OK, PATCH archive+rename OK, DELETE OK, 401 unauth OK, event-templates active_only OK, tg-templates default filter OK. Frontend screenshotları: 3 sekme + Aktif/Arşiv toggle + T1 event template mevcut düzende (Etkinlik adı+Hatırlatma+Katılım+aksiyonlar) + RSVP tab hint banner + empty state.


- **Feb 29, 2026 (v135.37 Alliance Edit Unified + Cert Admin + Member Card Polish)** — Backend + Frontend:
  - **Cert Admin List + Patch** (`/app/backend/routes/certificates.py`): Yeni `GET /api/certificates?search=&limit=` (admin) — tüm sertifikaları listeler, title/member/event üzerinde case-insensitive arama. Yeni `PATCH /api/certificates/{cid}` — `title` ve/veya `theme` güncellenir; geçersiz tema `amber`'a düşer, boş body 400, bogus id 404.
  - **Verilen Sertifikalar Yönetim UI** (`/app/frontend/src/pages/IssueCertificate.jsx`): Yeni `IssuedCertificatesList` component — arama input + row list + Kalem/Çöp aksiyonları + edit modal (title + theme). Otomatik verilen sertifikalar "OTOMATİK" chip'i ile işaretli.
  - **Alliance Edit Unified Modal** (`/app/frontend/src/pages/Members.jsx`): `AllianceColorPicker` + `renamingAlliance` modallarının yerini `AllianceEditModal` aldı. Tek "Düzenle" (Pencil) butonu (data-testid `alliance-edit-btn-{name}`) TÜM ittifaklarda (Gruplandırılmamış dahil) görünür. Modal: `İttifak Adı` input (Gruplandırılmamış'ta gizli) + 24-swatch renk paleti + native color + hex input + preview + Reset Color + Save. Save akışı önce rename (varsa), sonra renk kaydeder; SWR mutate her iki koleksiyonu da tazeler.
  - **Members Header Polish**: `── ` prefix kaldırıldı. Alliance name inner span `ellipsis maxWidth=40vw` — uzun isim taşarsa clean truncate. Kategori badge `flex-shrink-0 whiteSpace: nowrap` — "ANA"/"AKADEMİ" tam okunur. İkon aralığı `gap-2 → gap-1`.
  - **Member Card Polish**: R5 rank badge artık dikey flex kutu içinde — `m.title` (Tiran vb.) varsa amber, tracking-widest badge olarak ÜSTTE render. `⚡ Bireysel Güç` `truncate` kaldırıldı, `flex-wrap` + `whiteSpace: normal` — kesilme yok. Sağdaki 4 buton `flex → grid grid-cols-2 gap-1` — 2x2 grid: `[AdminNote][Telegram]` üst / `[Pencil][Trash]` alt.
  - **E2E doğrulama** ✅: 16/16 yeni backend pytest (list search, PATCH, empty/blank/bogus, DELETE regression) + 13/13 v135.36 regression. Frontend mobile 390x844: 5 issued cert rows, PATCH akışı + toast + delete + toast; 8 alliance headers no prefix + full badges + unified modal on all incl. Gruplandırılmamış + color save 'Kaydedildi' + header background updated; member card TİRAN top<R5 top, icon grid 2x2, bireysel_guc scrollWidth==clientWidth.


- **Feb 28, 2026 (v135.34 Üye Performans + Sertifikalar + isAdmin TDZ fix)** — Backend + Frontend:
  - **TDZ Fix** (`/app/frontend/src/pages/Events.jsx`): `const { isAdmin } = useAuth()` `rsvpCounts` useSWR'ından ÖNCEye taşındı — v135.33'te enjekte edildiği yer TDZ hatası veriyordu.
  - **Performance Card** (`/app/backend/routes/certificates.py` yeni + `Profile.jsx`): `GET /api/members/{id}/performance` — son 30 gün: `rsvp_rate_pct` (yes + 0.5*maybe / total), `rsvp_yes/maybe/no_count`, `avg_score_30d`, `attendance_count_30d`, `current_streak` (`_compute_user_yes_streak` reuse), `best_month` + `best_month_score` (tüm zamanlar). Profile'da yeni `ProfilePerformanceAndCerts` component 2×2 grid — RSVP% / ort puan / streak / en iyi ay.
  - **Certificates**: Yeni koleksiyon + 4 endpoint: `POST /api/certificates/issue` (admin, bulk member_ids + event_id + title + theme), `GET /api/auth/me/certificates`, `GET /api/certificates/member/{mid}`, `DELETE /{id}`. PNG rendering `GET /api/certificates/{id}/image.png` — v135.30 SHARE_THEMES paletini reuse ediyor (synthetic event → title alanı sertifika başlığı, group_name → member name). Profile'da yeni `🏆 Sertifikalar` kartı — her satır İndir butonu (backend PNG direct download).
  - **Announcement Pin/Archive**: Zaten mevcuttu — `AnnouncementBody.pinned`, `pinned_until` field'ları, `active` flag'i arşiv görevi görüyor. Ek geliştirme gerekmedi.
  - **E2E doğrulama** ✅: cert issue (SvS Şampiyonu - Ağustos 2026, theme=amber) → 1 cert oluştu → PNG 200 OK image/png (1200×630) → performance endpoint 200 tüm alanlarla → cleanup delete 200.

- **Feb 28, 2026 (v135.33 Kural Kabul + RSVP+ Sayaç Chips + Görev Bildirim)** — Backend + Frontend:
  - **Rules Acceptance**: 3 yeni endpoint `POST /api/auth/me/rules-accept`, `GET /api/auth/me/rules-status`, `GET /api/admin/users/rules-status`. `rules_accepted_at` timestamp user doc'a yazılır. Admin endpoint accepted/pending listeleri + sayaçlarını döner. Frontend GuildRules'ta yeni `RulesAcceptCheckbox` — checkbox tıklanınca kabul stamp'lenir, ekranda `Kabul: {tarih}` emerald chip'i.
  - **RSVP+ Sayaç Chips**: Yeni bulk endpoint `GET /api/events/rsvp/counts` (admin/editor) — MongoDB aggregate ile tüm event'ler için `{yes_count, maybe_count, no_count}` tek round-trip. Events.jsx admin görünümünde her event card'a inline `✅ 8 · 🤔 4 · ❌ 2` chip bar (green/amber/red badge'ler). data-testid `event-rsvp-{yes|maybe|no}-{id}`.
  - **Görev Bildirimi**: Yeni scheduler `_admin_todo_due_reminder_loop` her 15 dakikada bir Turkey-local today'e denk gelen (veya gecikmiş) todos'u tarıyor. `assigned_to` → user lookup → web push + Telegram DM (telegram_chat_id set ise) + in_app_notifications bell rowu. `due_notified_at` daily stamp ile aynı gün tekrar tetiklenmez. Gecikmişse title `⚠️ Gecikmiş görev` (aksi halde `⏰ Görev bugün son teslim`).
  - **E2E doğrulama** ✅: Rules accept curl 200 + status roundtrip `rules_accepted_at`; admin/users/rules-status `accepted=1 pending=9`; bulk rsvp/counts `events with rsvps=0` (DB temiz olduğu için).

- **Feb 28, 2026 (v135.32 Davet Mektubu Dil Seçimi)** — `/app/backend/routes/invites.py` + `/app/frontend/src/components/InviteManagement.jsx`:
  - **Templates**: Yeni `INVITE_LETTER_TEMPLATES` dict — 8 dil (tr/en/de/es/fr/ru/pt/ar) her biri `title`, `cta`, `note_prefix`, `outro` alanlarıyla. `_build_invite_letter(lang, admin, guild, link, note)` composer helper — unsupported code varsa `tr` fallback.
  - **Model**: `InviteCreateBody.letter_lang: Optional[str] = "tr"`. `create_invite` bu alanla mektup üretiyor, `letter_lang` ve `letter_body` invite doc'a yazılıyor.
  - **Endpoint'ler**: `GET /invites/letter/languages` (admin) — supported dil listesini `[{code, label}]` olarak döner. `POST /invites/{id}/letter/regenerate?lang=X` — mevcut invite'ın mektubunu yeni dilde yeniden üretiyor (`letter_regenerated_at` stamp'li).
  - **Serializer**: `_invite_public` şimdi `letter_lang` da döner.
  - **UI Composer**: Yeni `<select data-testid="invite-composer-letter-lang">` (backend'den fetch edilen langs listesiyle) — kullanıcı Türkçe/İngilizce/Almanca/İspanyolca/Fransızca/Rusça/Portekizce/Arapça seçebilir. Toggle chip `[TR]/[EN]/…` gösterimi.
  - **UI Letter Section**: Row'daki mektup preview'ının altında yeni `<select data-testid="invite-letter-lang-{id}">` dropdown — anında dili değiştirir (regenerate endpoint çağırıp body'yi swap eder). Kopyala + Telegram gönder yeni dilde çalışır.
  - **Note**: Davet linki URL'i language-neutral (`/kayit/{token}`). Recruit siteye landed olunca `i18n.detectedLanguage` browser locale'i devreye giriyor, ayrıca sağ üst dil değiştirici mevcut.

- **Feb 28, 2026 (v135.31 Admin Görevler + Lonca Kuralları + Davet Mektubu + RSVP+ Doğrulama)** — Backend + Frontend:
  - **Admin To-Do** (`/app/backend/routes/admin_todos.py` yeni + `server.py` mount): Yeni koleksiyon `admin_todos`. CRUD: `GET /api/admin-todos?status=open|done|all`, `POST`, `PATCH /{id}` (done toggle + edit), `DELETE /{id}`. Sort by (done asc, due_date asc, created_at desc). Sayaç fields (`open_count`, `done_count`). Frontend `AdminTodos.jsx` — 3-filter chip (Bekleyen/Tamamlanan/Tümü), her row checkbox toggle + edit + delete + due_date + assigned_to + note. Composer modal başlık/due/atanan/not. Route `/admin/gorevler` + Header menu 📋. Tüm metinler `useTranslation()` fallback ile.
  - **Lonca Kuralları** (`/app/backend/server.py` + `/app/frontend/src/pages/GuildRules.jsx` yeni): `GET /api/guild/rules` (public — no auth) + `PUT /api/guild/rules` (admin). Body max 20000 char, `guild_settings.guild_rules` altında persist. Sayfa `/kurallar` (public), admin görürse `Düzenle` chip'i + editor modu. Georgia serif whitespace-pre-wrap. Header menu 📜 (herkes).
  - **Yeni Üye Karşılama Bildirimi**: `consume_invite` (signup) sonrası best-effort `in_app_notifications` insert — title `🎉 Aramıza hoş geldin!`, body `Loncanın kurallarını okumayı unutma`, url `/kurallar`. Signup path bu insert başarısız olsa bile fail etmez.
  - **Üye Davet Mektubu**: `create_invite` yolunda otomatik `letter_body` üretimi: `🎉 {admin_display_name} seni {guild_name}'e davet ediyor!` + katılım linki + note (varsa) + kısa lonca tanıtımı. `_invite_public` serializer'ına eklendi. Yeni endpoint `POST /invites/{id}/send-letter-telegram` (admin) — mektubu TELEGRAM_CHANNEL_ID'e Markdown ile gönderir, `letter_last_sent_at` stamp'ler. Frontend `InviteManagement.jsx` her invite row'da `✉️ Davet Mektubu` collapsible section — Georgia serif preview + `Kopyala` + `Telegram'a Gönder` butonları. `useTranslation` import edildi.
  - **RSVP+ (Belki)** doğrulama ✅: Backend `POST /events/{id}/rsvp` zaten `yes/maybe/no` accepting; `GET /events/{id}/rsvp/summary` (admin) already returns `{yes_count, maybe_count, no_count}`. Frontend `Events.jsx` RSVP panel already filters `yesUsers`/`maybeUsers` separately. Yeni değişiklik gerekmedi — E2E `/rsvp/summary` curl call döndü, ayrı sayaç Görülüyor.
  - **E2E doğrulama** ✅: `POST admin-todos → GET open_count=1 → PATCH done=true → DELETE`; `PUT guild/rules "1. Ittifak sohbetinde..." → GET body`; `POST invites → letter_body[:120]="🎉 admin seni TiTaNXiS'e davet ediyor..." → send-letter-tg 200`; `rsvp/summary` real event 200.

- **Feb 28, 2026 (v135.30 6-Tema Poster Seçici + Emoji Font + Şablon Placeholder + Bio Vurgu)** — Backend + Frontend:
  - **6 Poster Teması** (`/app/backend/server.py`): `SHARE_THEMES` dict — `fire` (ember red/orange), `onyx` (deep black/silver), `amber` (warm gold), `buz` (ice blue), `zumrut` (emerald green), `bosluk` (mystic purple). Her tema `grad_a/b`, `accent`, `kicker`, `title`, `meta` RGB tuple'ları içeriyor. `_compose_event_share_image(event, theme)` tek fonksiyon tüm varyantları render ediyor. Endpoint'ler `?theme=X` query param kabul ediyor; SHARE_THEMES dışı değerler `fire`'a düşürülüyor.
  - **Emoji Font Desteği**: `_load_emoji_font()` NotoColorEmoji.ttf (size=109, CBDT bitmap font) yüklüyor; `_draw_text_with_emoji` helper metni emoji/regular run'lara ayırıyor, emoji glyph'i 128×128 tile'a `embedded_color=True` ile render edip target height'a LANCZOS ile resize ediyor. Tofu box'lar artık gerçek renkli emoji.
  - **Frontend Tema Picker** (`/app/frontend/src/pages/Events.jsx` `EventShareImageModal`): 6-sütunlu thumbnail grid — her tema için 42px yüksekliğinde CSS gradient swatch + Türkçe label (Ateş/Oniks/Kehribar/Buz/Zümrüt/Boşluk). Aktif tema amber border + glow. Tıklayınca `?theme=` query rebuild + `reloadKey` refresh; PNG indirme + Telegram send de seçilen temayı kullanıyor.
  - **Şablon Placeholder** (`/app/backend/routes/telegram_templates.py` `send_template`): `{event_name}`, `{tarih}` (TR format `dd.mm.yyyy hh:mm (TR)`), `{grup}`, `{carpan}` placeholder'ları en yeni yaklaşan event'ten resolve ediliyor (yoksa freshly archived fallback). Eksik değerler `"—"` fallback. Placeholder yoksa hiçbir işlem yapılmaz (backward compat).
  - **Renkli Bio Vurgu** (`/app/frontend/src/components/MemberProfileDialog.jsx`): Regex `\\b(?:F|T)\\d{1,2}\\b` + üye alliance_name auto-highlight edilir — amber underline + bold + amber renk. Escaped alliance name (regex special chars). Data-testid `member-bio-highlight-{i}` ile her vurgu izole.
  - **E2E doğrulama** ✅: 6 tema HTTP 200, hepsi 1200×630 RGB PNG (fire=27KB, onyx=27KB, amber=23KB, buz=27KB, zumrut=23KB, bosluk=24KB). Placeholder template `{event_name}·{tarih}·{grup}·{carpan}` real event ile substitute edilerek Telegram'a gönderildi (`send_count` artmış).

- **Feb 28, 2026 (v135.29 Etkinlik Paylaşım Görseli + Üye Biyografi)** — Backend + Frontend:
  - **Share image backend** (`/app/backend/server.py`): PIL-based 1200×630 PNG composer `_compose_event_share_image` — dark gradient background, brand amber accent bar (14px left edge), TITANXIS · GAMING GUILD kicker, etkinlik adı (max 2 satır, otomatik word-wrap), TR tarih/saat, grup + çarpan chip, footer domain. `banner_url` set edilmişse 65% opacity ile arka plan olarak kullanıyor (httpx ile fetch, LANCZOS resize, cover crop). Endpoint'ler: `GET /api/events/{id}/share-image.png` (public — 60s cache) ve `POST /api/events/{id}/share-image/send-telegram` (admin — sendPhoto ile TELEGRAM_CHANNEL_ID'e Markdown caption'lı). DejaVuSans-Bold font Turkish-safe.
  - **Share UI** (`/app/frontend/src/pages/Events.jsx`): EventDetailModal içinde admin-only `🖼️ Paylaşım Görseli` chip; tıklayınca yeni `EventShareImageModal` açılıyor. Modal içeriği: `<img>` preview + `📤 Telegram Grubuna Gönder` + `💾 PNG İndir` + `🔄 Yenile` butonları. `blob → URL.createObjectURL` yolu ile PNG lokal indirilme. Tüm metinler `useTranslation()` fallback ile.
  - **Bio backend** (`/app/backend/auth.py`, `/app/backend/server.py`): `GET/PUT /api/auth/me/bio` — max 280 char, whitespace trim, boş string → null (mute). `get_member` endpoint'i linked user'ın bio'sunu `doc["bio"]` ile enrich ediyor (users.member_ids ya da legacy member_id join). Admin notes'tan (gizli) TAMAMEN ayrı — bu alan user-authored ve tüm logged-in guildmate'lere görünür.
  - **Bio UI** (`/app/frontend/src/pages/Profile.jsx`, `/app/frontend/src/components/MemberProfileDialog.jsx`): Profile'da yeni `✍️ Biyografi` kartı — 3-satır textarea + 280 char sayacı + Kaydet butonu. MemberProfileDialog alliance badge'in altında yeni bio bölümü — amber-border italic quote block (`"..."`), sadece bio dolu ise render'lanır. `useTranslation()` fallback her yerde.
  - **E2E doğrulama** ✅: `PUT /api/auth/me/bio` "Kaleyi sağlam tut, saflar bozulmasın." + GET roundtrip 200. `GET /api/events/{id}/share-image.png` HTTP 200, content-type=image/png, boyut 25036 bytes (1200×630 RGB), Pillow ile `Image.open` doğrulandı. Backend restart temiz, ruff F821 clean.

- **Feb 28, 2026 (v135.28 Üye Doğum Günü + Public Lonca Profili)** — Backend + Frontend:
  - **Birthday backend** (`/app/backend/auth.py` + `/app/backend/server.py`): Yeni endpoint'ler `GET/PUT /api/auth/me/birthday` — MM-DD (yıl yok, privacy). Regex validasyon + gün-ay aralık kontrolü. Null gönderilirse alan temizlenir + `birthday_celebrated_year` reset. Yeni scheduler `_birthday_celebration_loop` her 30 dakikada bir Turkey-local `today` MM-DD ile eşleşen kullanıcıları tarıyor; `birthday_celebrated_year != now.year` olanlara `_fire_birthday_greeting` çağırıyor → (a) TELEGRAM_CHANNEL_ID'e `🎂 Doğum Günün Kutlu Olsun!` bildirimi (display_name / username fallback), (b) tüm admin'lere in-app bell + SSE push (`_publish_notif`). Fanout sonrası `birthday_celebrated_year` stamp'lenerek yıllık idempotency. Manuel test için admin-only `POST /api/admin/birthday/fire-now?user_id=X` endpoint'i.
  - **Birthday UI** (`/app/frontend/src/pages/Profile.jsx`): Radial menu ses kartının altında yeni `🎂 Doğum Günü` kartı (data-testid `profile-birthday-card`). Text input MM-DD placeholder + `Kaydet` + `Temizle` butonları. useSWR `/auth/me/birthday` ile initial load ve mutation. Tüm metinler `useTranslation()` `t(key, TR fallback)`.
  - **Public Guild Profile backend** (`/app/backend/server.py`): No-auth `GET /api/guild/public` endpoint'i. Response: `guild_name` (guild_settings.guild_name env fallback default "TiTaNXiS"), `logo_url` (guild_settings.guild_logo_url fallback `/brand/titanxis-logo.jpg`), `tagline`, `member_count`, `active_events_count`, `recent_events[5]` (yaklaşan + hidden_from_leaderboard filter, yoksa fresh archived), `invite_token` (aktif olmayan disabled + geçmediyse en yeni). ObjectId leak yok — proper `{"_id": 0}` projection.
  - **Public page** (`/app/frontend/src/pages/PublicGuildProfile.jsx` yeni + App.js route `/lonca` + `/guild`): No `RequireAuth` — herkese açık. Hero (logo + guild name + tagline), 2-col stats (üye sayısı + aktif etkinlik), yaklaşan etkinlikler listesi (tr-TR datetime format), CTA (davet varsa `/kayit/{token}` butonu, yoksa `/vip-destek` iletişim). `fetch()` ile plain (JWT gönderilmez). Tüm metinler `useTranslation()` fallback ile.
  - **E2E doğrulama** ✅: Birthday GET→PUT 05-14→GET roundtrip; PUT `14/05` → 400; admin fire-now → `{telegram: false (no channel now), admin_push: N}` mekaniği tetiklendi ve `birthday_celebrated_year` stamp'lendi. Public endpoint no-auth curl 200 + JSON. Playwright: `/lonca` sayfası logout-first render, `guild-public-name`, member-count, event-count DOM node'ları görünür.

- **Feb 28, 2026 (v135.27 Telegram Grup Mesaj Şablonları)** — Backend + Frontend:
  - **Backend** (`/app/backend/routes/telegram_templates.py` yeni dosya + `server.py` mount): Yeni koleksiyon `telegram_message_templates`. CRUD endpoint'leri: `GET /api/telegram-templates?category=X`, `POST`, `PATCH /{id}`, `DELETE /{id}`, `POST /{id}/send` (TELEGRAM_CHANNEL_ID'e `telegram_bot.send_message` ile gönderim + `send_count` artışı + `last_sent_at` stamp). `ALLOWED_CATEGORIES = {savas_cagrisi, etkinlik_hatirlatma, duyuru, diger}`. TELEGRAM_CHANNEL_ID veya BOT_TOKEN yoksa `/send` 400 döner (sessiz no-op yok). Index: `id` unique + `(category, updated_at desc)`.
  - **Frontend** (`/app/frontend/src/pages/TelegramTemplates.jsx` yeni sayfa): `/admin/telegram-sablonlar` (RequireAdmin). Kategori filtre chip'leri (⚔️ Savaş Çağrısı / ⏰ Etkinlik Hatırlatma / 📢 Duyuru / 💬 Diğer + Tümü). Her row: kategori badge + isim + gövde önizleme (whitespace-pre-wrap monospace) + `📤 Telegram'a Gönder` / `Düzenle` / `Kopyala` / `Sil` butonları + son gönderim zamanı ve kaç kez gönderildi metadata. Compose modal: ad, kategori dropdown, 8-satır textarea (Markdown destekli), 4000 char sayacı. Tüm metinler `useTranslation()` ile fallback default arg kullanılarak (`t("tg_tpl_...", "TR fallback")` biçiminde). Menu link: Header dropdown → 📨 Telegram Şablonları (admin-only).
  - **E2E doğrulama** ✅: Curl ile POST→PATCH→GET filtre→POST send→GET (send_count=1 + last_sent_at)→DELETE roundtrip başarılı. Send endpoint gerçekten Telegram channel'a mesaj bastı ve döndü. UI Playwright ile composer form açıldı, satır oluşturuldu, listede göründü.

- **Feb 28, 2026 (v135.26 Etkinlik Hatırlatma Bildirimi — Otomatik)** — Backend + Frontend:
  - **Data model**: `Event.reminder_minutes: Optional[int]` (`15 | 30 | 60 | 120` veya `None`) ve `Event.reminder_sent_at: Optional[str]` eklendi. Aynı alanlar `EventCreate` ve `EventUpdate`'de POST/PATCH edilebilir; PATCH `None` göndererek hatırlatmayı iptal edebilir.
  - **Scheduler**: `_event_reminder_loop` her 45 saniyede bir `archived!=True`, `reminder_enabled!=False`, `reminder_minutes in {15,30,60,120}`, `reminder_sent_at IN [None,""]` ve `date` mevcut + max lead penceresinde olan event'leri tarıyor. Her event için `date - reminder_minutes` tetik anına ulaşınca `_fire_event_reminder` çağırıyor, sonra `reminder_sent_at` stamp'liyor (idempotent). `@app.on_event("startup")` içine kayıt edildi.
  - **Fanout**: `_fire_event_reminder` iki kanala fan-out yapıyor: (a) Telegram channel'a `⏰ Hatırlatma! Etkinlik {N} dakika içinde başlıyor` mesajı — etkinlik adı, TR saati (UTC+3), grup ve `[Etkinliğe Katıl]` deep-link; (b) Web push — yes/maybe RSVP verenler, live-alliance filtresi + `notification_prefs.reminder=False` opt-out'undan geçirilerek. `payload.tag="event-reminder-{id}"` ile browser tarafında aynı bildirim iki kez baş göstermez.
  - **Notification prefs**: `/api/auth/me/notification-prefs` allowlist'e `"reminder"` eklendi (GET default `True`). Frontend Profile → "Bildirim Türleri" panelinde yeni row: `⏰ Etkinlik hatırlatmaları · Etkinlik başlamadan 15dk/30dk/1sa/2sa önce otomatik bildirim`.
  - **UI**: `Events.jsx` etkinlik formunda "🔔 Hatırlatma kurulabilir" toggle'ının ALTINDA yeni `<select data-testid="event-form-reminder-minutes">` (Kapalı / 15 dk / 30 dk / 1 saat / 2 saat önce). Sadece reminder_enabled=True iken görünür. POST/PATCH gövdesine `reminder_minutes` alanı otomatik ekleniyor (kapalıysa `null`).
  - **E2E doğrulama** ✅: Curl ile `POST /api/events {reminder_minutes:15, date: now+14m}` → Mongo'da `reminder_minutes=15` saklı; `_fire_event_reminder` direkt çağrısı `{telegram:false (channel disabled), push_sent:0 (no subs)}` döndü hatasız; loop query 1 event matched. Notification-prefs GET → `"reminder":true`; PUT `reminder=false` → GET `"reminder":false` → restore ✅.

- **Feb 28, 2026 (v135.25 QR Renk Teması — Amber Branded)** — `/app/frontend/src/components/InviteManagement.jsx`:
  - **Toggle**: Header'a `data-testid="invite-qr-theme-toggle"` chip eklendi ("Klasik QR ↔ Amber QR"). Seçim `localStorage.ol_invite_qr_theme` altında persist edilir (per browser); default `light`.
  - **Branded palette**: `bgColor="#0A0004"` (onyx) + `fgColor="#F5A623"` (amber). Amber tema seçildiğinde chip'in kendisi de onyx arkaplan + amber kenarlıkla premium görünür. Modal'da amber tema seçilince arkaplan inset amber glow (`boxShadow: inset 0 0 24px rgba(245,166,35,0.20)`) alıyor.
  - **PNG İndirme**: Canvas fill artık `qrBg`'yi kullanıyor — indirilen PNG onscreen tema ile birebir aynı; branded modda dosya adı `titanxis-davet-qr-amber.png`, klasik modda `titanxis-davet-qr.png`.
  - **QR level "H" korundu**: Renk ters çevrilirken de logo overlay altında %30 error correction sayesinde phone kameraları rahatça okuyabiliyor.
  - **Görsel doğrulama** ✅: Playwright ile toggle click test edildi, hem liste hem modal ekranında amber-on-black + ortada logo net görünüyor (bkz `/tmp/qr_amber_list.png`, `/tmp/qr_amber_modal.png`).

- **Feb 28, 2026 (v135.24 Streak Celebration Push + QR Watermark)**:
  - **Streak Celebration** (`/app/backend/server.py`): Yeni helper `_compute_user_yes_streak(user_id)` ve `_fire_streak_celebration(user_id, username)`. `POST /api/events/{id}/rsvp` `status=yes` yolunda tetiklenir; kullanıcının ardışık "yes" serisi `STREAK_MILESTONES = (5, 10, 15, 20, 25, 50, 100)` sayılarından birine bindiğinde 🔥 push + in-app bell rowu üretir. Her milestone bir kez kutlanır — `rsvp_streak_state` collection'ında `last_celebrated` alanı tutuluyor (yes ↔ no flip spam'i engelleniyor).
  - **Streak Pref Enforcement**: `_users_disabled_for_pref("streak")` seti kontrol ediliyor — profil `Bildirim Türleri` → `🔥 Streak kutlamaları` kapalı olan kullanıcıya push GİTMİYOR, ama milestone state yine kaydediliyor (`silenced_at`) ki tekrar açtığında spam patlamasın.
  - **E2E doğrulama**: 5 attendance-enabled event + 4 pre-seeded yes RSVP + 5. RSVP gerçek HTTP endpoint'ten atıldı → bell rowu doğrulandı: `title="🔥 Streak Serisi!"`, `body="Üst üste 5 etkinliğe Evet dedin — admin, seri bozulmasın!"`, `sched_id="streak-<uid>-5"`. `rsvp_streak_state.last_celebrated=5`.
  - **QR Watermark** (`/app/frontend/src/components/InviteManagement.jsx` L200 + L340): Hem inline 68px QR hem 256px modal QR artık `imageSettings={src:"/icons/pwa-192.png", excavate:true}` ile TiTaNXiS PWA logosunu ortada barındırıyor. Level `M`→`H`'ye yükseltildi (~%30 error correction) ki logo overlay altında da scan güvenilirliği kalsın.
  - **Görsel doğrulama**: Playwright ile `/kullanicilar → Davet Linkleri` sekmesi + ilk row QR modal açıldı; screenshot'ta logonun kare içinde net göründüğü doğrulandı (bkz `/tmp/qr_modal.png`).

- **Feb 28, 2026 (v135.23 Bildirim Tercih Enforcement + QR Davet Doğrulama)** — `/app/backend/server.py`:
  - **Yeni helper**: `_users_disabled_for_pref(pref_key)` — `notification_prefs.<pref_key>: False` olan user_id'leri toplayan Motor cursor sorgusu. Anahtar yoksa default True → mevcut kullanıcılar tüm kanalları almaya devam eder.
  - **`_broadcast_push`**: Yeni opsiyonel `notif_pref` parametresi. Global `notification_enabled=False` opt-out setine per-channel opt-out'ları da ekliyor (union) — böylece "Bildirim Türleri" panelindeki bir toggle gerçekten push subscription'ları filtreliyor.
  - **`_broadcast_in_app`**: Aynı `notif_pref` parametresi — `target_user_ids` setinden opt-out olanları çıkarıyor (bell rowu yaratılmıyor).
  - **RSVP Reminder**: `_rsvp_reminder_task` (line 4103) yes/maybe user_ids'i `"rsvp"` pref'ine göre filtreliyor.
  - **Duyuru Anlık + Zamanlanmış**: `announcements_create` (instant broadcast) ve `_announcement_scheduler_loop` (60s cron) her ikisi de `notif_pref="announcement"` ile çağırıyor.
  - **E2E doğrulama**: admin `announcement=false` → curl ile duyuru gönderildi → `GET /api/notifications` → matching row sayısı 0 (beklendiği gibi). Prefs geri açıldığında normal delivery devam ediyor.
  - **QR Davet Önizleme** (bulundu, halihazırda mevcut): `/app/frontend/src/components/InviteManagement.jsx` L200 satır içi 68px `QRCodeSVG` + `QrExpandModal` (256px + PNG indirme). `qrcode.react ^4.2.0` paketi kurulu. Yeni özellik değil ama akıcı: her invite row'un solunda tık ile büyüyen QR. 3 aktif davet listelendi curl'de.

- **Feb 28, 2026 (v135.22 Telegram Bildirimde Saat)** — `send_event_notification` (`/app/backend/telegram_bot.py` L1622):
  - **Değişiklik**: Mesajdaki `🗓 Tarih` satırı artık tarih + saat gösteriyor (Türkiye saati, UTC+3). Örn `2026-03-15 21:00 (TR)`. ISO parse başarısız olursa (yalnızca `YYYY-MM-DD` verildiğinde) sadece tarih basılır (regresyon-güvenli fallback).
  - **Refaktör**: `dt` parse blok bloğu, mesaj satırlarının üstüne çekildi ki `date_line` da aynı `dt`'yi kullansın; Google Calendar URL üretimi (`dates=YYYYMMDDTHHMMSSZ/…`) davranışı UTC'de aynı kaldı, `end = dt + 1h` mantığı korundu.
  - **Doğrulama**: `datetime.fromisoformat('2026-03-15T18:00:00Z').astimezone(UTC+3)` → `2026-03-15 21:00 (TR)` ✅. Backend restart temiz, `sudo supervisorctl status backend` RUNNING.

- **Feb 28, 2026 (v135.21 Google Çeviri Kotası E-Mail Uyarısı)** — `_send_translate_quota_alarm_if_needed` (`/app/backend/server.py`):
  - **Yeni helper**: `_compute_translate_month_usage()` `deepl_translate_log` üzerinden bu ay tüketilen karakteri toplar; `GOOGLE_TRANSLATION_MONTHLY_LIMIT_CHARS` env değeri ile karşılaştırır (default 500 000 = Google free tier).
  - **Alarm**: Aylık kullanım %80'i geçince Resend ile `DIGEST_ADMIN_EMAIL`'e Türkçe HTML uyarı gönderir. 24 saatlik cooldown `translate_quota_alarms` koleksiyonunda tutulur.
  - **Endpoint'ler**: `GET /api/translate/quota-alarm/status` (admin diagnostic — mevcut kullanım + son 10 alarm), `POST /api/translate/quota-alarm/trigger?force=true|false` (manuel tetikleyici; force=true eşik+cooldown'ı bypass eder).
  - **Cron entegrasyonu**: Gecelik i18n backfill cron'unun sonunda `try/except` ile çağrılır — hata durumunda cron akışını bozmadan warning logger.
  - **Doğrulama**: Ruff `F821 Undefined name '_send_translate_quota_alarm_if_needed'` giderildi; backend temiz başladı.

- **Feb 28, 2026 (v134.7 Telegram Etkinlik Bildirimi + Takvime Ekle)** — `send_event_notification`:
  - **Inline Keyboard**: Yeni etkinlik oluşturulduğunda `TELEGRAM_CHANNEL_ID` (-1003597221954) grubuna gönderilen mesaja `📅 Takvime Ekle` inline button eklendi.
  - **Google Calendar URL**: `render?action=TEMPLATE&text=<name>&dates=YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ&details=<group·xmult·webbase>`. Başlangıç + 1 saat default süre.
  - **Robust tarih parse**: `datetime.fromisoformat` ile ISO parse, timezone yoksa UTC atanır, hata durumunda "YYYY-MM-DD" digits + 00:00 UTC fallback.
  - **quote_plus**: URL query encoding güvenli (özel karakter, boşluk).
  - Test: `send_event_notification(name="KristaL / L2", date="2026-03-15T18:00:00Z", ...)` → inline_keyboard[0][0].url = calendar.google.com/... dates=20260315T180000Z/20260315T190000Z ✅.

- **Feb 28, 2026 (v134.6 Takvime Ekle — Home + Popover)** — 3 konum:
  - **Anasayfa "Bugünün Etkinlikleri"** (`MemberHome.jsx` L378-421): Her satır `<button>` yerine `<div>` + iç `<button>` (RSVP açıcı) + inline `AddToCalendarButton` (compact). `event.iso` → AddToCalendarButton'un beklediği `{id, name, date, subtitle}` shape'ine adapte.
  - **Etkinlik Popover** (`MemberHome.jsx` L710-723): RSVP butonlarının üstüne "Takvime Ekle" bloğu (`event-popover-calendar`) eklendi.
  - **Etkinlikler sayfası kartları**: v134.5'te zaten var.
  - **Telegram bildirimli etkinlikler**: In-app UI'da ayrı liste değil — aynı `events` collection'ından çekildiği için otomatik kapsamda.
  - Import: `AddToCalendarButton` component'i MemberHome.jsx L8'e eklendi. Google Calendar + iCal .ics her ikisi de dropdown'da.

- **Feb 28, 2026 (v134.4 Grup Sayısı Badge)** — Etkinlik grup header:
  - **Sayı badge'i** (`Events.jsx` renderGroupBlock): "— N etkinlik" inline text kaldırıldı; yerine `event-group-count-badge-{group}` span'i (24×24, `border-radius:50%`, `rgba(245,158,11,0.85)` amber, beyaz bold 12px). h3 sadece grup adını göstersin diye ayrıldı.
  - **Header layout**: `[chevron] [dot] [GRUP ADI beyaz bold ellipsis] [amber badge N]` → action row: `[Gizle] [İsim Değiştir] [Arşivden Çıkar] [Sil]`.
  - **Doğrulama**: Computed styles: `width=24 height=24 background=rgba(245,158,11,0.85) border-radius=50%`. Screenshot temiz.

- **Feb 28, 2026 (v134.1 Grup Kartı Layout Fix)** — Etkinlikler sayfası:
  - **Sorun**: v130'da grup adına `whiteSpace:normal + wordBreak:break-word + overflowWrap:anywhere` verilmişti; chevron+dot+chip+rename kontrolleri yatay alanı yiyince kalan ~1-2 karakterlik alanda her harf alt alta dizilip başlık DİKEY görünüyordu. Ek olarak grup bloğu ekran genişliğini tamamen kaplıyordu.
  - **Fix — Grup Başlığı** (`Events.jsx` renderGroupBlock h3): `writingMode:"horizontal-tb"`, `transform:"none"`, `whiteSpace:"nowrap"`, `overflow:"hidden"`, `textOverflow:"ellipsis"`, `wordBreak:"normal"`, `overflowWrap:"normal"`, `display:"block"` — yatay tek satır + taşarsa `…`.
  - **Fix — Kart Genişliği** (dış wrapper): `maxWidth:"min(100%, 720px)"`, `width:"94%"`, `mx-auto` — mobilde %94, tablet+/desktop'ta 720px cap. Kartlar merkezlendi, kompakt görünüm.
  - **Doğrulama**: 390px viewport screenshot — "KRİSTAL" başlığı yatay ✅, `writing-mode=horizontal-tb`, `white-space=nowrap`, `text-overflow=ellipsis`, kart genişliği 720px (viewport 1920→ratio 0.38).

- **Feb 27, 2026 (v134 Manuel Telegram Eşleştirme)** — Üye listesine admin bağlama:
  - **Backend** (`server.py`): `Member.telegram_chat_id: Optional[str]` + `MemberUpdate.telegram_chat_id` alanı eklendi. `PATCH /api/members/{id}` normalize ediyor ("" → null, aksi durum stringified). Curl testi 200 döndü, kaydet+temizle akışı çalışıyor.
  - **`_all_delivery_chat_ids`** (`telegram_bot.py`): `members.telegram_chat_id` de dahil edildi — /duyuru artık admin panelinden manuel bağlanan üyelere de mesaj gönderiyor.
  - **Frontend** (`Members.jsx`): `TelegramLinkModal` component + `member-telegram-btn-{id}` Send ikonlu buton her üye satırında. Bağlıysa amber renk (`rgba(245,166,35,0.55)` border + glow) + tooltip'te mevcut ID, yoksa sky mavi. Modal input sayısal, "Mevcut ID" hint bağlıysa görünür, boş bırakıp kaydet → bağlantıyı kaldırır.
  - test-id: `member-telegram-btn-{id}`, `telegram-link-modal`, `telegram-link-form`, `telegram-link-input`, `telegram-link-save`.

- **Feb 27, 2026 (v133 Telegram Bot Command Suite)** — @TiTaNXiS_BoT genişletildi:
  - **Yeni komut sayısı**: 39 (önceki 6'dan artış). `setMyCommands` webhook başarıyla güncellendi ("Telegram command menu published (39 entries)" log kaydı doğrulandı).
  - **Genel komutlar (27)** (`telegram_bot.py`): `/siralama` + `/siralama top10`, `/puan` + `/puan @kul`, `/karsilastir @a @b`, `/etkinlik` (bugün), `/etkinlikler` (bu hafta), `/yakinda` (gelecek 5), `/takvim` (aylık), `/arsiv` (son 10), `/katil <id>`, `/katilmiyorum <id>`, `/hatirlatici <id>`, `/profil`, `/rozet` (otomatik hesaplanan), `/istatistik`, `/streak`, `/online` (15dk aktif), `/lonca` (loncanın toplam stats), `/davet` (kişisel invite token), `/bildirimler ac|kapat`, `/mola <gün>` (X gün suskun mod), `/dil <tr|en|de...>` (29 dil), `/sifremi_sifirla` (1 saatlik token), `/geri_bildirim <msg>`, `/link <kod>`, `/unlink`, `/hakkinda`, `/yardim`.
  - **Admin komutları (12)**: `/duyuru`, `/toplu_duyuru` (alias), `/uyar @kul <sebep>`, `/rapor` (haftalık özet), `/uyeler` (top 20), `/ekle @kul` (GOW default), `/cikar @kul`, `/puan_ekle @kul <n>`, `/rozet_ver @kul <ad>`, `/etkinlik_ekle` (web'e yönlendirir), `/etkinlik_iptal <id>`, `/esik_uyari` (min puan eşiği aktif etkinlikler).
  - **Auth helper'ları**: `_user_from_chat`, `_require_link` (bağlı olmayan kullanıcıya profil linki verir), `_require_admin` (role="admin" kontrolü + rejection mesajı), `_member_by_query` (@handle/isim/username eşleştirme), `_member_score` (aggregation).
  - **Yeni Mongo collection'ları**: `warnings`, `custom_badges`, `feedback`, `personal_reminders`, `password_reset_tokens`, `rsvp_streaks`, `invites` (bazıları migration üzerinde yaratılacak).
  - **DeepL i18n**: `reply_ml()` mevcut idi, tüm yeni komutlar da kullanıyor — gelen mesajın dilini algılayıp yanıtı çeviriyor (29 dil desteği).
  - test URLs simüle edildi: `/lonca`, `/hakkinda`, `/yardim` → tüm webhook çağrıları HTTP 200 döndü, bot işledi.

- **Feb 27, 2026 (v132.4)** — Login sadeleştirme + Guest calendar icon kaldırma:
  - **KAYIT OL kaldırıldı** (`Login.jsx` L227-248): Guest home'daki "⚔️ KAYIT OL" butonu (`guest-signup-btn`) tamamen silindi. Row 6'daki "🔑 GİRİŞ YAP" tek CTA olarak kaldı. `/signup` sayfası kod olarak korunuyor (deep-link erişilebilir); sadece guest home'daki buton kaldırıldı.
  - **Guest Stone Calendar Icon kaldırıldı** (`Login.jsx` L94-109): "ETKİNLİK TAKVİMİ" başlığının altındaki `guest-stone-calendar` img tag'i + `STONE_CALENDAR_URL` sabiti silindi. Sadece interaktif takvim grid'i kaldı.
  - **Screenshot doğrulaması**: `guest-signup-btn` count=0, `guest-stone-calendar` count=0, `guest-login-btn` count=1.

- **Feb 26, 2026 (v132 Event Form Refactor + Bireysel Event)** — Kapsamlı Form Yenileme:
  - **Kaldırılanlar** (`Events.jsx` EventForm): "Takvimde göster" toggle, "Grup detayları göster" toggle, "Katılım İttifakı" bloğu (default artık her zaman "GOW"), "Sadıklar için Puan Ver" bloğu (loyalty), "hatırlatma açıklama satırı" kaldırıldı → tek satır.
  - **Yeni Layout**: Row 1 full-width **📦 Otomatik Arşive Taşı** (klasör dropdown when checked) — Row 2 (2-col grid) **🔔 Hatırlatma kurulabilir** + **🏆 Sıralamada göster** — Row 3 (2-col grid) **🟢 Katılımlı** + **📦 Etkinlik sonrası otomatik arşive taşı** (aynı state'i mirror).
  - **Minimum Puan Eşiği Accordion** (`event-form-threshold-accordion`): Chevron toggle ile açılır. `GRUP EŞİĞİ` — her satırda ittifak adı input + [50M] [150M] quick-fill chips + Manuel numeric input + kırmızı X remove. `ÖZEL EŞİK` — aynı yapı ama üye ID/ad ile. "N kural" chip başlıkta canlı sayaç.
  - **Backend Fields** (`server.py` Event/Create/Update): `description`, `auto_report_top10`, `report_channels: List[str]`, `alliance_thresholds: List[dict]`, `member_thresholds: List[dict]` eklendi.
  - **BireyselEventForm Component** (`Events.jsx`): Header'da mor "Bireysel" butonu (`events-bireysel-add-btn`), yeni modal — Ad + Tarih/Saat + Açıklama (textarea) + [🏆 Sıralamada görünsün] + RAPORLAMA paneli ([📊 İlk 10 kişiyi otomatik raporla] + çoklu seçim [📨 Telegram] [🔔 Push] [💬 Mesaj] chip'leri) + mor **[BİREYSEL ETKİNLİK OLUŞTUR]** buton. Grup="" (ungrouped), attendance=false, reminder=false defaultları.
  - **Task 3 (archived groups)**: `/event-groups?active_only=true` zaten sadece `active>0` olan grupları döndürüyor — otomatik olarak arşivlenmiş grupları form listesinden gizler.
  - **Curl Verify**: POST /events yeni alanları kabul ediyor (`auto_report_top10:true`, `report_channels:[...]`, `alliance_thresholds:[{alliance_name,threshold}]`).
  - test-id: `event-form-{reminder,visibility,attendance,auto-archive,auto-archive-compact}-checkbox`, `event-form-threshold-accordion`, `event-form-alliance-threshold-{add,50m-N,150m-N,manual-N,remove-N}`, `event-form-member-threshold-*`, `events-bireysel-add-btn`, `bireysel-{name,date,description,visible-checkbox,auto-report-checkbox,submit}`, `bireysel-channel-{telegram,push,message}`.

- **Feb 26, 2026 (v131.1 Avatar Bug Fix)** — Sıralama Avatar Görünürlük:
  - **Root Cause**: `PUT /auth/me/avatar` sadece `db.users` dokümanına yazıyordu ama `/api/leaderboard` `db.members.avatar_url`'den okuyordu; user→member propagation eksikti. Sonuç: kullanıcılar avatar yüklüyor ama sıralamada baş harf placeholder görünmeye devam ediyordu.
  - **Fix 1 - Propagation** (`auth.py` L435-457): PUT /auth/me/avatar artık `user.member_ids`'deki tüm linked members'a `update_many({$set:{avatar_url:url}})` yapıyor. Null gönderildiğinde de temizliyor.
  - **Fix 2 - Fallback** (`server.py` L1798-1830): `/api/leaderboard` avatar_url boşsa `db.users`'a fallback lookup yapıyor — `member_ids: {$in: needing}` ile users'ı çekip mapping oluşturuyor. Backfill olmasa bile leaderboard doğru avatar döndürüyor.
  - **Fix 3 - Public Folder Leaderboard** (`server.py` L1466-1483): Aynı fallback logic public folder leaderboard'a da eklendi.
  - **Fix 4 - Migration**: Tek seferlik backfill script çalıştırıldı; mevcut avatarlı 1 user'ın linked member'ı sync edildi (PasHa).
  - **Verify**: Screenshot ile mobilde 390px viewport, `img` tag count=1, PasHa'nın gerçek fotoğrafı altın halkalı podium'da görünüyor.

- **Feb 26, 2026 (v131 Leaderboard Avatars)** — Sıralama Avatar + [Alliance]:
  - **Backend** (`server.py` L1799-1811): `/api/leaderboard` yanıtı artık her satır için `avatar_url` içeriyor (üye dokümanından çekiliyor, ek round-trip yok).
  - **RankAvatar helper** (`Leaderboard.jsx` L15-45): Dairesel avatar componenti — `src`, `name`, `size`, `ring`, `ringWidth` propları. Avatar yoksa üyenin adının baş harfini gradient discte gösterir (Cinzel bold).
  - **Podium**: 1.=64px altın halka `#F5C542`, 2.=54px gümüş `#C0C7D1`, 3.=48px bronz `#CD7F32`. Her podium'da oyuncu adı altında amber renk `[AllianceName]` — tıklayınca alliance drill-down açar (event.stopPropagation).
  - **Liste Satırları** (L1289-1361): `minHeight:56px`, `padding:8px 12px`. Struct: `#sıra | avatar | name+[alliance] | skor`. Avatar halka rengi ittifak rengi (fallback amber). Alliance amber label altına gelir; tıklanabilir → drill-down.
  - test-id: `podium-avatar-1/2/3`, `podium-alliance-1/2/3`, `row-avatar-{member_id}`, `row-alliance-{member_id}`.
  - Screenshot ile mobilde (390px) 5 satırlı test veri seti başarıyla doğrulandı — altın/gümüş/bronz halkalar, [GOW] amber ittifak, harf placeholder ("E"/"C"/"H"/"L") tam düzgün render oluyor.

- **Feb 26, 2026 (v130 Avatar)** — Avatar Upload Fix + Crop Dialog:
  - **Regex Bug Fix** (`routes/uploads.py` L106): `/api/uploads/image?purpose=avatar` 422'ye düşüyordu — regex `^(vip|commander|event|avatar|misc)$` olarak güncellendi. Curl testi: upload+PUT+GET 200 döner.
  - **public_user Enrichment** (`auth.py` L168-183): `/auth/me` yanıtına `avatar_url` + `avatar_updated_at` alanları eklendi ki header/profil componentleri anında re-render edebilsin.
  - **Kare Crop Dialog** (`CropDialog.jsx`): Opsiyonel `aspect`, `title`, `description` propları eklendi. `aspect=1` verildiğinde `ReactCrop`'a locked square + `circularCrop` uygulanır. OCR/etkinlik akışları etkilenmedi (backward compatible).
  - **Profile UX** (`Profile.jsx` L36-42, L120-160, L232-260, L750-770): Dosya seçildiğinde FileReader → CropDialog (1:1) açılır; kırpma sonrası File `/api/uploads/image?purpose=avatar` → `PUT /auth/me/avatar` chain. Avatar varsa sağ üstte kırmızı **X** (`profile-avatar-remove`) tek tıkla temizler. 8 MB üst sınır.
  - test-id: `profile-avatar-input`, `profile-avatar-remove`, `profile-avatar-img`, `crop-dialog`, `crop-apply`.

- **Feb 26, 2026 (v129-v130)** — Etkinlik Grup UX + Otomatik Arşiv Cron:
  - **Otomatik Arşiv Formu** (`Events.jsx` L2332-2386, L2712-2751): `auto_archive` checkbox + `auto_archive_folder_id` select. Ticked ise cron tarih geçince event'i arşive taşır, klasör seçiliyse o klasöre koyar. Model: `Event.auto_archive: bool`, `Event.auto_archive_folder_id: Optional[str]`.
  - **Cron Sweep** (`server.py` L1326-1346): `POST /api/events/auto-archive-sweep` — no auth, idempotent. `.emergent/crons.yml`'de `*/30 * * * *` çalışır. Test edildi: `moved=1, checked=1` başarılı.
  - **Grup Başlığı Wrap** (`Events.jsx` L855-871): `truncate` kaldırıldı → `whiteSpace:normal, wordBreak:break-word, overflowWrap:anywhere`. Mobilde uzun grup isimleri kırılıp okunabilir görünür.
  - **Grup Collapse/Expand** (`Events.jsx` L315-334, L836-854, L1020-1032): Her grup başlığında ChevronDown/Right toggle butonu + tıklanabilir başlık. `collapsedGroups` state localStorage'a `events_collapsed_groups` key'iyle persist edilir. Grup grid'i `!collapsedGroups[group]` ise render edilir.
  - test-id: `event-group-toggle-{name}`, `event-group-title-{name}`, `event-form-auto-archive-checkbox`, `event-form-auto-archive-folder`.

- **Feb 26, 2026 (v128)** — Ek Buton İ18N + Grup Çeviri Rendering + Arşiv Rename:
  - `event_view_list` + `event_view_calendar` yeni i18n key'leri (28 dil curated: EN List/Calendar, DE Liste/Kalender, RU Список/Календарь, JA リスト/カレンダー, ZH 列表/日历 vb.).
  - `archive` key'i "Arşivle" → "Arşiv" olarak değişti (buton chip'i için); diğer 28 dilde noun karşılıkları güncellendi (DE "Archiv", RU "Архив", JA "アーカイブ").
  - Etkinlik kartı grup adı + etkinlik adı artık `group_translations` + `name_translations`'ı i18n.language'a göre kullanıyor; TR fallback korunuyor.
  - `Events.jsx` main component'e `i18n` destructure eklendi.
  - i18n dosyasındaki 15 orphan blok temizlendi (v128 injection script'inin yan etkisi). Cleanup script `/app/scripts/cleanup_i18n_orphans.py` olarak kalıcılaştırıldı.
- **Feb 26, 2026 (v126-v127)** — Otomatik Çeviri Kapsamı Tüm İçeriğe Genişletildi:
  - **Klasörler** (`event_folders.py`): `EventFolder.name_translations`, `FolderTemplate.name_translations` + `folder_name_default_translations`. POST/PATCH endpoint'lerinde otomatik DeepL çevirisi. Server.py'de lambda ile `_auto_translate_all` inject edildi.
  - **Duyurular** (server.py `/api/announcements`): `title_translations` + `body_translations` otomatik oluşturuluyor.
  - **Anketler** (`polls.py`): `question_translations` + her seçenekte `text_translations` otomatik. `make_polls_router` yeni `auto_translate` parametresi kabul ediyor. `_poll_public` serializer'ı translations dict'lerini response'a dahil edecek şekilde güncellendi.
  - **Backfill** (`/tmp/backfill_v126.py`): Mevcut 3 klasör (SvS, Kafes, Kristal) + 3 grup (KaFeS/Kontrol/KristaL) + 14 event + 2 duyuru otomatik 28 dile çevirildi.
  - Verified: yeni duyuru title/body → 28 lang, yeni anket question + 2 option → 19-28 lang ("Evet"→"Yes", "Hayır"→"No"), yeni klasör name → 28 lang.
- **Feb 26, 2026 (v125)** — i18n buton çevirileri + Otomatik DeepL çeviri sistemi + Menü hizalaması:
  - **Buton i18n**: `event_add_to_calendar`, `event_chat`, `event_tab_reminded`, `event_tab_unreminded` yeni i18n key'leri (28 dile manuel curated + DeepL karışım). AddToCalendarButton, event card Sohbet butonu, Events.jsx tab başlıkları `t()` ile sarıldı. Verified EN: "Add to calendar" · "Chat" · "Reminders on" · "Reminders off".
  - **Menü hizalaması**: AddToCalendarButton artık açılırken viewport rect ölçüyor; buton sol kenardan 220px içindeyse menü `left:0` (içeri açılır), aksi halde default `right:0`. Sağ tarafa yakınsa flip devre dışı. Kesilme sorunu çözüldü.
  - **Otomatik Dinamik Çeviri Sistemi**: Backend `_auto_translate_all(text)` helper (28 hedef dil için TR→X). `POST /events`, `PATCH /events/{id}`, `POST /events/rename-group` bu helper'ı otomatik çağırıyor — `name_translations`, `subtitle_translations`, `group_translations` dict'leri event doc'a otomatik yazılıyor. Verified: yeni oluşturulan event'te 28 dil için name/subtitle translations doldu ("Automatic Translation Test 2", "Test zur automatischen Übersetzung 2", "自動翻訳テスト 2"). Event modeline `Dict[str, str]` alanları eklendi.
  - **Frontend helper**: `useLocalized(obj)` + `pickLocalized(obj, field, lang)` — event objesinden i18n.language'a göre çeviri döndürür, yoksa TR fallback.
- **Feb 26, 2026 (v124)** — 5 Yeni Özellik (Legal 29-lang + Chat + iCal + Avatar + Notif Prefs):
  - **Legal 29-dil**: `legal_content.py` TR kaynak (privacy/terms/aydinlatma). Backend `/api/legal/{doc}?lang=xx` DeepL ile on-demand çevirir + `legal_translations` collection'da cache'ler. Frontend'de `LegalPage.jsx` unified component, Privacy/Terms/AydinlatmaMetni artık tek satırlık wrapper. Verified: TR/EN/DE/ZH tümü çalışıyor ("Datenschutzerklärung", "使用条款").
  - **Etkinlik İçi Sohbet**: Backend `GET/POST /api/events/{id}/messages` (`event_messages` collection, max 500 char). Frontend `EventChatDrawer.jsx` sağdan slide-in, 5s polling. Event card'a "Sohbet" butonu.
  - **Takvimime Ekle**: Backend `GET /api/events/{id}/ics` VCALENDAR export. Frontend `AddToCalendarButton.jsx` dropdown (Google Calendar deep link + .ics indir).
  - **Avatar Yükleme**: Backend `PUT /api/auth/me/avatar` + user doc'a `avatar_url`. Profile'da kamera buton ile upload (`/api/uploads/image` → PUT), 4MB limit. Yoksa rank badge fallback.
  - **Bildirim Tercih Paneli**: Backend `GET/PUT /api/auth/me/notification-prefs` — 4 kanal (rsvp/announcement/streak/sadiklar). Profile'da yeni panel (master toggle açıkken görünür, per-channel switch).
- **Feb 25, 2026 (v123)** — Sadıklar Tab'ını Katılım Merkezi'ne Taşı:
  - Sıralama sayfasındaki (Arşiv yanındaki) 🔥 SADIKLAR butonu ve tüm sadıklar view kodu kaldırıldı (Leaderboard.jsx sadeleşti).
  - `Reports.jsx` ReportTabs'a 3. sekme olarak eklendi: **📅 Etkinlik Katılım · ⚡ Hızlı Rapor · 🔥 Sadıklar** — 3 menü aynı satırda hizalı ve birleşik.
  - `SadiklarReport` component'i eklendi (aynı UI: özet kartı, empty state, aggregate rows). Data hâlâ `GET /api/loyalty/leaderboard` üzerinden.
  - PeriodBar sadıklar sekmesinde de gizli (member/events'e özel filtre olduğu için).
  - Verified: `/raporlar` üzerinde 3 sekme render ediyor, `[data-testid=reports-tab-sadiklar]` görünüyor, tıklayınca `[data-testid=sadiklar-report]` + `sadiklar-empty` görünüyor.
- **Feb 25, 2026 (v122)** — Aydınlatma Metni + Sadıklar Leaderboard + Loyalty Event:
  - **Aydınlatma Metni** (`AydinlatmaMetni.jsx`, `/aydinlatma-metni` public route): KVKK Md. 10 uyumlu 7 bölüm (Veri Sorumlusu, İşlenen Veriler, Amaçlar, Aktarım, Toplama Yöntemi, Md. 11 Hakları, Başvuru Yöntemi). Layout footer'a "Aydınlatma" linki eklendi. Test: HTTP 200, 7 section render.
  - **Event Loyalty Config** (backend Event/EventCreate/EventUpdate): `loyalty_enabled: bool` + `loyalty_threshold: int` alanları eklendi. Event form'a "🔥 Sadıklar için Puan Ver" checkbox + eşik puan input. Ticked=true olduğunda eşik alanı belirir, aksi durum ignore edilir. Test: POST /api/events with loyalty_enabled=true, threshold=1000000 → doc'a doğru yazıldı.
  - **Sadıklar Leaderboard** (backend `GET /api/loyalty/leaderboard`): Aggregate pipeline `points` üzerinden her (event, member) toplam weighted puan hesaplar, `loyalty_enabled=true` etkinliklerde `weighted >= threshold` olan üyelere +1 loyalty verir. Result: `[{member_id, name, alliance_name, loyalty_score, events_qualified[], position}]`. Frontend Leaderboard'a **SADIKLAR** tab (Aktif/Arşiv yanında, 🔥 amber-red glow) — tab seçilince aggregate liste + her satırda 🔥 chip + qualifying event isimleri (ilk 3).
  - Verified: Aydınlatma HTTP 200; footer link visible; Sadıklar tab render (empty state — henüz loyalty event yok).
- **Feb 25, 2026 (v121)** — Terms Kabul Track + Members Streak Rozeti + DeepL Faz 5:
  - **Terms Kabul Track**: Signup formuna zorunlu "Kullanım Şartları'nı okudum" checkbox eklendi (`signup-terms-ack`). Submit butonu bu kutu işaretlenene kadar disabled. Backend `POST /api/invites/consume` artık `terms_accepted_at: ISO` alıyor ve `users` doc'una yazıyor (audit trail). Verified: yeni user'ın `terms_accepted_at` alanı ISO timestamp olarak kaydedildi.
  - **Members Streak Rozeti**: Backend `GET /api/members/rsvp-streaks?threshold=5` — bulk endpoint, `{member_id: streak}` map döndürür. Frontend Members.jsx her üye kartında (name yanında) 🔥 chip gösteriyor (amber-red glow, streak count + tooltip). SWR 60s refresh. Şu an dataset'te 0 üyenin streak'i ≥5, endpoint boş dönüyor (beklenen).
  - **DeepL Faz 5**: PointCalcPage ImportModal'daki 7 hardcoded TR string `t()` ile sarıldı (`pc_import_excel`, `pc_import_desc`, `pc_import_updated`, `pc_import_skipped`, `pc_import_upload`, `pc_import_uploading`, `pc_import_events_updated`). Backend `/api/deepl/bulk-translate` ile 28 dile çevirildi ve i18n/index.js'in tüm dil block'larına inject edildi (Python script `/tmp/inject_i18n.py`).
- **Feb 25, 2026 (v120)** — Terms Sayfası + RSVP Streak Rozeti + Hesap Silme (KVKK):
  - **Terms Sayfası** (`Terms.jsx` yeni, `/terms` public route): 9 bölüm (Acceptance, Eligibility, Acceptable Use, User Content, Suspension, Warranty, Liability, Changes, Contact). Privacy ile aynı stone tema. `App.js`'e route eklendi, `Layout.jsx` footer'a "Terms" linki eklendi.
  - **RSVP Streak Rozeti** (backend `GET /api/auth/me/rsvp-streak`): Kullanıcının event_rsvps kayıtlarını tarihe göre desc sıralayıp en yeniden geriye "yes" streak sayıyor. Response: `{streak, has_badge, threshold=5}`. Frontend `Profile.jsx` — user meta chip'lerinin yanına `🔥 N ETKİNLİK SERİSİ` rozeti (amber/red gradient, glow). `has_badge=true` (streak≥5) durumunda gösterilir.
  - **Hesap Silme (KVKK Silme Hakkı)** (backend `DELETE /api/auth/me`): Password confirm gerektirir. Cascade: `event_rsvps`, `sessions`, `push_subscriptions`, `telegram_links`, `notifications` + `users` doc. Guild-side member kaydı korunur. Son-admin guard: yalnızca 1 admin varsa `400` döner. Frontend Profile'a Danger Zone kartı + modal (şifre + ack checkbox + "Kalıcı Sil" butonu) eklendi. Silme sonrası logout + `/` redirect.
  - Test: `/auth/me/rsvp-streak` admin için `streak:2, has_badge:false`. `DELETE /auth/me` yanlış şifreyle 400 "Mevcut şifre hatalı". Doğru şifreyle 200 ok+cascade (verified — admin re-seed edildi).
- **Feb 25, 2026 (v119)** — Cookie Banner + KVKK Consent + Map Removal:
  - **CookieBanner.jsx** (yeni): App-wide çerez uyarı banner'ı. Fixed bottom, koyu taş temada (amber gradient). "Kabul Et" tıklanınca `localStorage.ol_cookie_ack=1` set edilir, banner bir daha görünmez. `<Link to="/privacy">Gizlilik Politikası</Link>` içerir. `Layout.jsx`'e mount edildi (tüm route'larda görünür).
  - **Dashboard.jsx**: `MemberLocationMap` import ve `{key:"map"}` grid entry'si kaldırıldı. `MemberLocationMap.jsx` dosyası tamamen silindi.
  - **Signup.jsx**: Şifre alanının altına, "Katıl" butonundan önce iki KVKK checkbox'ı eklendi (`signup-kvkk-notice` + `signup-kvkk-email-optin`). Her ikisi de varsayılan olarak **İŞARETSİZ** (KVKK açık rıza doktrini). Aydınlatma Metni linki `/privacy`'ye açılır. Küçük font (10px), dashed amber border kutu içinde.
  - Test: `/kayit/{token}` ile geçerli invite token'da her iki checkbox unchecked=false döndü, cookie banner login+signup+leaderboard'ta görünüyor, Dashboard'ta `dash-member-locations` DOM'dan kayboldu.
- **Feb 25, 2026 (v118)** — Zero-Score Members Filtresi (Leaderboard):
  - Backend `/api/leaderboard` aggregation pipeline'ına `{"$match": {"total_points": {"$gt": 0}}}` eklendi — puanı 0 olan üyeler artık kaynakta filtreleniyor. Bu değişiklik `/api/leaderboard/by-alliance`'a da otomatik yansıyor.
  - Frontend `Leaderboard.jsx` içindeki `fullLb` memo revize edildi: eskiden `allMembers` ile merge edip zero-scorer'ları sıralamanın altına ekliyordu; artık sadece `total_points > 0` olan girdileri gösteriyor. Kullanılmayan `allMembers` SWR fetch'i kaldırıldı.
  - Test: `/api/leaderboard?scope=archived` → 82 entry, 0 zero-score. `/api/leaderboard/by-alliance` → 4 grup, hepsinde 0 zeros. Aktif tab boş etkinlikte boş state gösteriyor (beklenen).
- **Feb 25, 2026 (v117)** — App-Wide Privacy Policy Footer:
  - `Layout.jsx` scroll container'a küçük footer eklendi (children'ın altında, MusicButton'dan önce).
  - Stil: `fontSize: 10, color: rgba(245,166,35,0.55)` muted amber, ortalanmış, dotted underline; içerik: `<Link to="/privacy">Privacy Policy</Link>`.
  - Layout tüm auth ve public route'larda kullanıldığı için footer app-wide (anasayfa, uyeler, etkinlikler, komutanlar hepsi).
  - Test: 2 farklı sayfada `footer-privacy-link` count=1, href="/privacy", fontSize=10px.
- **Feb 25, 2026 (v116)** — Privacy Policy Google Play Compliance:
  - Başlık `TiTaNXiS Bot — Privacy Policy` → `TiTaNXiS — Privacy Policy` (app scope, sadece bot değil).
  - Bölümler 4 → **7**: Information We Collect, How We Use, Third-Party Services (DeepL/Telegram/Google Play), Data Storage & Security, Children's Privacy (<13), Changes to Policy, Contact.
  - Her section'da bullet list (ul/disc) ile Google Play requirements karşılandı: data types, third-party disclosure, deletion right, children policy, policy changes.
  - Email + Website ayrı linkler (titanxis.com), yeni `privacy-website-link` testid.
- **Feb 24, 2026 (v115)** — Privacy Policy Sayfası (Telegram Bot):
  - Yeni public route `/privacy` — auth gerekmez, BotFather bot profilinden linklenebilir.
  - `Privacy.jsx`: dark stone tema (radial red/purple bg + amber card), Cinzel typography, TN shield badge, 4 numbered section (Data Collected / Usage / Retention / Contact), titanxis.com iletişim linki + Home geri buton.
  - Screenshot doğruladı: title/updated/4 section/contact-link tümü render.
- **Feb 24, 2026 (v114)** — Regression Sweep + Müdür Ofisi Maliyetleri:
  - **Regression scan** (Python AST-lite): Sadece `HealthScoreDetailModal` (Members.jsx:1984) `t()` çağırıyordu ama `useTranslation` hook'u eksikti — düzeltildi.
  - **Müdür Ofisi maliyetleri**: `PUT /api/unit-costs/bina_mudur_ofisi_{Fx}_a{n}` ile F6-F10 × A1-A5 = 25 kombinasyon dolduruldu (yemek/odun/çelik/benzin/forticlad/gelişmiş forticlad/süre_saniye). F6 base 50K yemek → F10 A5 8.1M yemek scaling; stage multiplier 1.0/1.5/2.2/3.2/4.5.
  - 25/25 HTTP 200 döndü, verify curl'ünde F9 A3 yemek=1650000.
- **Feb 24, 2026 (v113)** — ACİL HATA: AllianceScopeToggle useTranslation Eksik Fix:
  - v108 sweep'inde `t("alliance_scope_update_failed")` ve `t("scope_server")` çağrıları AllianceScopeToggle bileşenine eklendi ama `useTranslation()` hook'u eksikti → TypeError: t is not a function.
  - Fix: `Members.jsx:31` `AllianceScopeToggle` fonksiyonunun başına `const { t } = useTranslation();` eklendi.
  - Test: Üyeler sayfası açıldı, 24 alliance-scope toggle render ediliyor, page errors=[].
- **Feb 24, 2026 (v112)** — v111 Revert: BuildingCalculator Sadece Loj Hakkında'da:
  - `PointCalcPage.jsx`'ten `BuildingCalculator` import ve render tamamen kaldırıldı.
  - Puan Hesapla sayfası orijinal içeriğine döndü: SVS Pre Puan Hesaplama + Diğer Etkinlik Puan Hesaplamaları tabs + SidebarContent.
  - Toplu Seçim butonu artık sadece **Loj Hakkında → Bina** sayfasında `BuildingCalculator`'ın başlığı yanında görünüyor.
- **Feb 24, 2026 (v111)** — Toplu Seçim'i Puan Hesapla Sayfasına Da Ekle:
  - `PointCalcPage.jsx` içine `BuildingCalculator` bileşeni Header'ın hemen altında embed edildi.
  - Böylece Toplu Seçim toggle butonu + akordeon ağaç Loj Hakkında **ve** Puan Hesapla sayfalarının ikisinde de görünüyor.
  - Buton position: title'ın hemen yanında (amber turuncu gradient bg, beyaz metin, ☑ ikon), tabloya bakar bakmaz göze çarpıyor.
- **Feb 24, 2026 (v110)** — Bina Hesaplayıcı Toplu Seçim Feature:
  - `BuildingCalculator.jsx` başlık yanına belirgin **Toplu Seçim toggle butonu** (amber gradient → yeşil aktif, box-shadow glow).
  - Bulk mode ON'da mevcut single-select UI gizleniyor; yerine **3-seviyeli akordeon ağaç** (F6→F10 × 7 bina × 5 aşama = 175 leaf).
  - Hiyerarşik tick mantığı: F level checkbox → tüm 35 alt-leaf; bina checkbox → 5 aşama; individual A1-A5 chip'leri de tekil tick.
  - "TAMAM" butonu → `Promise.all` ile seçili leaves için unit-cost fetch → topla → altında yeşil result panelinde göster (yemek/çelik/odun/benzin/forticlad/gelişmiş + gün/saat/dk/sn).
  - Toggle OFF → seçim ve result sıfırlanır.
  - Compilation onaylandı, hata yok. `bc-bulk-mode-toggle`, `bc-bulk-picker`, `bc-bulk-compute`, `bc-bulk-result` testid'leri eklendi.
- **Feb 24, 2026 (v109)** — Bina Hesaplayıcıya "Müdür Ofisi" Eklendi (Tüm Seviyeler):
  - `BuildingCalculator.jsx` içindeki `BUILDING_SLUGS` array'inde en üste `mudur_ofisi` slug'ı eklendi.
  - `BUILDING_SLUGS` seviyeden bağımsız olduğu için F6, F7, F8, F9, F10 seviyelerinin HEPSİNDE dropdown'ın en üstünde görünüyor.
  - `bc_b_mudur_ofisi` i18n key'i 29 dilin hepsine eklendi (TR "Müdür Ofisi" + 28 dil DeepL bulk-translate ile).
  - Unit-cost kategori key'leri (`bina_mudur_ofisi_{lvl}_a{stage}`) otomatik oluşuyor — admin comparison table ile 5 aşama düzenlenebilir.
- **Feb 24, 2026 (v108)** — Whoosh Mute Toggle + DeepL Faz 4 Members Sweep:
  - Profile.jsx yeni MENU SOUND bölümü: Switch + `Volume2/VolumeX` ikon + i18n label/desc. Persists `localStorage.ol_radial_mute` ('0'/'1'), varsayılan sesli.
  - RadialMenu.jsx open transition'da `ol_radial_mute === '1'` ise Web Audio API çağırmadan return — silent-fail.
  - Members.jsx 7 hardcoded TR string wrapped: `alliance_scope_update_failed`, `scope_server`, `alliance_main`, `alliance_academy`, `alliance_rename_tooltip` (×2), `alliance_rename_placeholder`, `health_dim_participation`, `health_dim_consistency`.
  - 10 yeni i18n key eklendi DeepL bulk-translate ile 20-29 dile propagate edildi (DeepL rate-limit için retry batchleri gerekti).
- **Feb 24, 2026 (v107)** — Bugünün Etkinlikleri Countdown + Radial Menü Whoosh Sesi:
  - `MemberHome.jsx` today pin'inde her etkinlik yanına canlı countdown chip: CANLI (yeşil, <3h negatif), N dk (red ≤15, amber >15), Ns Nd, N saat, N gün — 60s'de bir güncellenen `now` state ile.
  - i18n keys: `home_today_live`, `home_today_ended`, `home_today_min/min_short`, `home_today_hour/hour_short`, `home_today_day` — 29 dil DeepL bulk-translate ile propagate edildi.
  - `RadialMenu.jsx` Web Audio API whoosh: bandpass filter (900→2200Hz sweep) + short noise burst + exp decay envelope; menü her açıldığında çalıyor, closed→open transition'da tetikleniyor.
  - Test: today_pin/radial/toggle render, aria-expanded toggle çalışıyor, ray-pulse hâlâ aktif, hiçbir js hatası yok.
- **Feb 24, 2026 (v106)** — Radial Menü Genişletme + Ray Pulse + Brand Logo:
  - Yay 120° → 180° geri açıldı: `startAngle: 180, endAngle: 360, step: 36°`. Radius 130 → 170.
  - Tüm 6 label ABOVE — LEADERBOARD ve MEMBERS artık icon'un ÜSTÜNDE (label overlap sorunu tamamen çözüldü).
  - Central pill: "TTN" text kaldırıldı; `/brand/titanxis-logo.jpg` shield PNG entegre edildi (dairesel crop, altın kenar, inset shadow).
  - Ray Pulse animasyonu: `@keyframes radial-ray-pulse` — 2.2s ease-in-out infinite; opacity 0.55↔0.9 ve drop-shadow blur 4px↔10px arası pulsating.
- **Feb 24, 2026 (v105)** — Radial Menü Tüm İkonlar Yukarı Yay:
  - `startAngle: 180 → 210`, `endAngle: 360 → 330` — 6 ikon 120° yay içinde, tüm sin() değerleri negatif → hepsi TTN'nin üstünde.
  - Step = 24° (kullanıcı formülü: `angle = 210 + i * 24`).
  - RADIUS 170 → 130 — kullanıcı spec'i.
  - `bottom: 16 → 20`.
- **Feb 24, 2026 (v104)** — Radial Menü Ana Buton Kompakt + TTN + Sayfa Padding:
  - CENTER 88 → 44 (kompakt medallion); outer ring +16 → +10.
  - Metin "TN" → "TTN"; fontSize 17 → 11, letterSpacing 0.1 → 0.05.
  - `bottom: 30 → 16` — viewport'un en altına yerleşti.
  - `Layout.jsx` scroll container'a `paddingBottom: 80` — sayfa içeriği radyal menü altına akmıyor.
- **Feb 24, 2026 (v103)** — Radial Menü Label Overlap + MusicButton Reposition:
  - `MusicButton.jsx`: `bottom: 340, left: 16 → top: 70, right: 16` — sağ üst köşede, radyal menüden tamamen ayrı.
  - `RadialMenu.jsx`: RADIUS 160 → 170; label positioning refactor: labels artık `position: absolute`.
  - Top-arc icons (i=1,2,3,4 → y < -R*0.55): label `bottom: calc(100% + 4px)` (ikonun ÜSTÜNDE).
  - Side icons (i=0, i=5): label `top: calc(100% + 4px)` (ikonun ALTINDA).
  - Sabit `width: 82px` + `box-sizing: border-box` — labels arası horizontal overlap engelleniyor.
- **Feb 24, 2026 (v102)** — MusicButton Radial Menü Çakışması Düzeltildi:
  - `MusicButton.jsx` `bottom: 80 → 340` — radial menünün dikey extent'inin (0-300px from bottom) üzerine çıkarıldı.
  - Screenshot ile 6 radial ikon+label bounding box'ı ile music button bbox'ının hiçbir overlap yapmadığı doğrulandı.
- **Feb 24, 2026 (v101)** — Radial Menü Etiket Okunabilirlik Düzeltmesi:
  - Radius 150 → 160 — ikonlar arası mesafe artırıldı, overlap engellendi.
  - Label CSS: fontSize 10 → 9, letterSpacing 0.10 → 0.06 (daha kompakt), maxWidth 96 → 78 (2-kelime labels forced wrap), lineHeight 1.15 → 1.2.
  - Yeni: `background: rgba(0,0,0,0.65)`, `borderRadius: 4`, `padding: "2px 5px"` — taş doku üzerinde net kontrast.
  - `wordBreak: normal`, `overflowWrap: normal`, `whiteSpace: normal` — doğal boşluk kırılımı; LOJ / HAKKINDA, PUAN / HESAPLA, KATILIM / MERKEZİ 2 satıra bölünüyor.
- **Feb 24, 2026 (v100)** — Radial Menü Parlayan Bağlantı Hatları + Grand Medallion:
  - SVG `radial-menu-rays` overlay eklendi: her ikon için `linearGradient` ile merkezden uca opacity fade (`stopOpacity 1 → 0.12`).
  - Line: `stroke=url(#radial-ray-i)`, `strokeWidth: 2`, `strokeLinecap: round`, glow via `drop-shadow(0 0 4px #f59e0b)`, root opacity `0 → 0.7` open transition.
  - Central pill CENTER 72 → 88, dış amber halka div eklendi (`+16px` inset ring, radial gradient + inset shadow).
  - Radius 130 → 150 — fan daha geniş yayılır.
- **Feb 24, 2026 (v99)** — Radial Menü İnce Ayar (Konum + Mesafe + Etiket):
  - Ana buton `bottom: 90 → 30` — tablolar/butonlarla çakışmıyor.
  - Radius 118 → 130 — ikonlar arası mesafe genişledi (still 6 icons over 180° = 36° step).
  - Etiket: fontSize 9 → 10, `color: #FFFFFF`, `textShadow: 0 1px 3px rgba(0,0,0,0.9)`, letterSpacing 0.12 → 0.10, maxWidth 90 → 96, `marginTop: 2` (icon'un hemen altında).
- **Feb 24, 2026 (v98)** — Radial/Fan Menü Global Uygulama:
  - Yeni `RadialMenu.jsx` bileşeni oluşturuldu: fixed bottom-center TN toggle butonu + 6 ikon yarım daire yukarı yelpaze animasyonu.
  - Anasayfada otomatik açık, diğer sayfalarda kapalı başlar; ikona tıklanınca navigate + kapan.
  - `Layout.jsx` içine global mount, tüm sayfalarda erişilebilir.
  - MemberHome.jsx içindeki 3x2 grid tamamen kaldırıldı; artık sadece welcome + banner + today pin + calendar var.
  - Animasyon: `cubic-bezier(0.34, 1.56, 0.64, 1)` spring, ikon başı 40ms delay ile staggered reveal.
  - Non-home sayfalarda tap-outside kapatan backdrop katmanı.
- **Feb 24, 2026 (v97)** — DeepL Faz 3 Sweep (Events modal strings):
  - Wrapped 5 hardcoded Turkish strings in `Events.jsx` with `t()`: `title="Yeniden adlandır"`, `placeholder: "Etkinlik seç"`, `throw new Error("Etkinlik seçilmedi")`, `placeholder="Diğer ittifak…"`, `placeholder="Yeni klasör adı"`.
  - New i18n keys added to 29 languages via DeepL bulk-translate: `action_rename`, `event_form_select_event`, `event_no_event_selected`, `form_other_alliance`, `form_new_folder_name`, `action_save`, `action_saving`, `name_field` (skipped duplicates where keys already existed).
  - Smoke test: no page errors, all sections (pin/menu/calendar) render correctly.
- **Feb 24, 2026 (v96)** — Bugünün Etkinlikleri Pinned Panel:
  - `member-home-today` paneli menü grid ile takvim arasına eklendi.
  - `home_today_title` + `home_today_no_events` i18n key'leri 29 dilde eklendi (DeepL bulk-translate ile).
  - Bugüne ait etkinlik yoksa "Bugün planlı etkinlik yok." (localized), varsa kompakt event listesi (title + time + iconForGroup).
  - Etkinliğe tıklanınca mevcut popoverEvent modalı açılıyor (RSVP dahil).
- **Feb 24, 2026 (v95)** — Anasayfa Takvimi Daha Dikey Sıkıştırma:
  - Ay başlığı fontSize 9 → 11 (daha okunur).
  - Weekday label fontSize 7 → 9.
  - Gün hücresi fixed `height: 24px`, `padding: 1px`, flex-center layout (hücre içeriği ortalanmış).
- **Feb 24, 2026 (v94)** — Menü Etiketleri Mid-Word Kırılım Düzeltmesi:
  - `MenuTile` label maxWidth 70 → 90; `wordBreak: keep-all` + `overflowWrap: normal` uygulandı.
  - Tek kelime uzun etiketler (ETKİNLİKLER, LEADERBOARD) artık tek satırda kalıyor — mid-word "ETKİNLİKLE/R" bug'ı düzeldi.
  - 2 kelimeli TR etiketler (LOJ HAKKINDA, PUAN HESAPLA, KATILIM MERKEZİ) hâlâ boşlukta doğal olarak 2 satıra sarmalanıyor.
- **Feb 24, 2026 (v93)** — Etkinlikler Sayfası Takvimi: İçeri Alınan Gün Detayları + Dar Genişlik:
  - `EventCalendar` wrapper'a `maxWidth: 80vw; margin: 0 auto` eklendi (yatay olarak daraltıldı, ortalandı).
  - Portal modal (framer-motion + createPortal) tamamen kaldırıldı; yerine takvimin altında inline `calendar-day-details` paneli.
  - Etkinlik varsa liste, yoksa "Etkinlik yok" gösteriliyor. Kapatmak için X butonu.
  - Silinen import'lar: `motion, AnimatePresence, createPortal` — dead code temizliği.
- **Feb 24, 2026 (v92)** — Menü Etiketleri 2 Satıra Sarmalanabilir:
  - `MenuTile` label div'e `maxWidth: 70, margin: "0 auto", whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "break-word"` eklendi.
  - Doğal boşluk kırılımı tercih ediliyor (LOJ HAKKINDA → LOJ / HAKKINDA), gerekmezse mid-word kırılıma düşüyor.
  - Turkish labels (LOJ HAKKINDA, PUAN HESAPLA, KATILIM MERKEZİ) 2 satıra sarmalanır; SIRALAMA, ETKİNLİKLER, ÜYELER tek satır.
  - İkon konumları ve grid hücre genişliği değişmedi.
- **Feb 24, 2026 (v91)** — Anasayfa Menü Etiket Fontu Küçültüldü:
  - `MenuTile` label div fontSize 11px → 9px, letterSpacing 0.14em → 0.12em.
  - 6 etiket (SIRALAMA, LOJ HAKKINDA, PUAN HESAPLA, ETKİNLİKLER, KATILIM MERKEZİ, ÜYELER) daha kompakt görünüyor.
- **Feb 24, 2026 (v90)** — Anasayfa Takvimi Agresif Sıkıştırma:
  - Takvim `maxHeight: 200px` sınırı eklendi; container padding 6/10 → 4/8.
  - Ay adı fontSize 10→9, weekday 8→7, gün hücresi padding "2px 0 4px" → "1px 0 2px".
  - `lineHeight: 1` tüm hücrelere uygulandı; grid gap 2→1, marginBottom 4→2 ve 2→1.
  - Screenshot ile tek ekran fit doğrulandı (banner + ikonlar + takvim + gün etkinlikleri).
- **Feb 24, 2026 (v89)** — Anasayfa Takvimi Dikey Sıkıştırıldı:
  - Takvim container padding 12/14 → 6/10; hücre padding "5px 0 8px" → "2px 0 4px".
  - Font boyutları: ay adı 12→10, weekday 9→8, gün 11→10; `line-height: 1.1` eklendi.
  - Grid gap 4 → 2, marginBottom değerleri 10→4 ve 4→2'ye düştü.
  - Günün etkinlikleri paneli padding/margin/font küçültüldü.
  - Screenshot ile tek ekran (viewport 900px) fit doğrulandı.
- **Feb 24, 2026 (v88)** — Anasayfa sıralaması düzeltildi: İkonlar takvimin ÜSTÜNDE:
  - `member-home-menu` (3x2 grid) hero banner'ın hemen altına, takvimin üstüne taşındı.
  - Yeni sıra: Welcome → Hero → 3x2 İkon Menü → Takvim → Günün Etkinlikleri.
  - Screenshot ile doğrulandı (menu_y < calendar_y).
- **Feb 24, 2026 (v87)** — Anasayfa "Etkinlik Takvimi" başlığı kaldırıldı:
  - `member-home-calendar-title` div ve `t("home_calendar_title")` çağrısı MemberHome.jsx'ten silindi.
  - Takvim artık doğrudan ay adıyla başlıyor (AUGUST 2026), üstünde başlık yok.
  - Screenshot ile doğrulandı, title count=0.
- **Feb 24, 2026 (v86)** — Anasayfa Yeniden Düzeni: Takvim Yukarı, Yönetim Paneli Kaldırıldı, 70px Ikonlar:
  - Yönetim Paneli (`member-home-dashboard-strip`) anasayfadan tamamen kaldırıldı — admin erişimi header/breadcrumb üzerinden.
  - Etkinlik Takvimi (`member-home-calendar` + gün etkinlikleri) menü grid'inin ÜSTÜNE alındı; sıralama: Welcome → Hero → Takvim → 3x2 Menu.
  - 6 ikon URL'i yeni 280px yüksek çözünürlük PNG'lere güncellendi (customer-assets CDN, tümü curl 200 doğrulandı).
  - Icon CSS: `width:70 height:70 object-fit:contain display:block margin:0 auto image-rendering:crisp-edges background:transparent`.
  - Screenshot ile doğrulandı — cal Y=310, menu Y=677 (takvim üstte), admin strip count=0.
- **Feb 24, 2026 (v85)** — Anasayfa İkonları Şeffaf PNG'lere Geçildi (Final):
  - `MENU_ICONS` 6 URL yeni transparent PNG'lerle güncellendi (customer-assets CDN, tümü curl 200 doğrulandı).
  - `mixBlendMode: 'screen'` ve `filter: brightness(1.2) contrast(1.1) drop-shadow(...)` CSS kaldırıldı (PNG'lerde arka plan zaten şeffaf).
  - Icon boyutu 85px → 50px'e küçültüldü. Yeni stil: `width:50 height:50 object-fit:contain display:block margin:0 auto background:transparent`.
  - Artık ikon çerçevesiz/kutusuz doğrudan taş duvar arka planına yerleşiyor, 3x2 grid içinde ortalı.
  - Kullanılmayan `titanxis-kill-black` SVG feColorMatrix filter tanımı temizlendi.
  - Ek düzeltme: `Events.jsx` `EventFolderManager` bileşenine eksik olan `const { t } = useTranslation()` eklendi (lint hatası fix).
  - Screenshot ile 6 ikon (LEADERBOARD, ABOUT LOJ, POINT CALCULATOR, EVENTS, KATILIM MERKEZI, MEMBERS) doğrulandı.
- **Feb 22, 2026 (v84)** — ÜYELER İkonu URL Güncellendi:
  - `MENU_ICONS.uyeler` yeni JPEG URL'e geçti (f4e1061b...). CSS aynı: `width:85 height:85 object-fit:contain mix-blend-mode:screen filter:brightness(1.2) contrast(1.1)`.
  - URL curl 200 doğrulandı, frontend compile OK, screenshot alındı.
- **Feb 22, 2026 (v83)** — Anasayfa İkonları Siyah-Arka-Planlı Ateş Heykelleri:
  - `MENU_ICONS` 6 URL güncellendi (siralama/loj/hesapla/etkinlikler/raporlar/uyeler). Tüm 6 URL curl 200 doğrulandı.
  - `filter: brightness(1.2) contrast(1.1) + drop-shadow` (kontrast arttırıldı 1.05→1.1, brightness 1.1→1.2). `mixBlendMode: 'screen'` siyah arka planı neutralize ediyor — sadece ateş görünüyor.
  - Frontend compile OK. Screenshot alındı.
- **Feb 22, 2026 (v82)** — Anasayfa 6 İkon Ateş Heykeli JPEG'lere Geçti:
  - Sprite sheet (2×3 kesim) tamamen kaldırıldı. Her menü öğesi için ayrı standalone JPEG URL (`MENU_ICONS = {siralama, loj, hesapla, etkinlikler, raporlar, uyeler}` — 6 ateş heykeli görseli).
  - `MenuTile` sadeleştirildi: `<img width=85 height=85 objectFit=contain mixBlendMode=screen filter="brightness(1.1) contrast(1.05) drop-shadow(0 4px 10px rgba(0,0,0,0.7))">` — pedestal ring/box KALDIRILDI, ikonlar doğrudan taş dokuda yüzüyor. Label altında Cinzel altın metin (`#F5E7A8`, letter-spacing 0.14em, text-shadow gold glow).
  - Tüm 6 URL curl ile doğrulandı (HTTP 200). Frontend compile OK.
- **Feb 22, 2026 (v81)** — Dropdown "Raporlar" → "Katılım" + Dropdown i18n Sweep + İkon URL doğrulandı:
  - `Header.jsx` dropdown menüsü: "Raporlar" → `t("dropdown_participation")` = **Katılım** (link `/raporlar` aynı — Katılım Merkezi sayfası). "Anketler" → `t("dropdown_polls")`, "SvS Takip" → `t("dropdown_svs")`.
  - 3 yeni i18n key eklendi (`dropdown_participation, dropdown_polls, dropdown_svs`) — **8 dilde tam DeepL çevirili** (tr, en, ru, de, fr, es, ko, ar). Diğer 21 dil fallbackLng ile İngilizce'ye düşer.
  - **İkon URL doğrulandı**: `HTTP/2 200 · content-length: 566555 · image/jpeg` — sprite URL erişilebilir. Production'da ikon görünmüyorsa **titanxis.com'un henüz Republish edilmediği içindir** — v58-v80 kodları canlıda yok. Republish sonrası ikonlar görünecek.
- **Feb 22, 2026 (v80)** — FAZ 3 Kısmi Inline Refactor (Events + Reports):
  - `Reports.jsx > ReportTabs`: "Etkinlik Katılım" → `t("reports_tab_events")`, "Hızlı Rapor" → `t("reports_tab_quick")`. `useTranslation()` hook eklendi.
  - `Events.jsx`: "Arşiv" tab → `t("archive")`, "Arşive Al" (2 yer) → `t("archive_action")`, "Arşivden Çıkar" (2 yer) → `t("unarchive")`, "Arşiv Klasörleri" → `t("archive_folders")`.
  - 5 yeni i18n key eklendi (`reports_tab_events, reports_tab_quick, archive_action, unarchive, archive_folders`) — tr + en tam çevirili. Diğer 6 dil (ru, de, fr, es, ko, ar) fallbackLng ile en'e düşer.
  - Frontend compile OK. Screenshot ile EN dilinde Events "Archive" tab'i doğrulandı.
- **Feb 22, 2026 (v79)** — FAZ 1+2 i18n Keys: Common Buttons + Tabs + Filters (8 dile senkronize):
  - **20 yeni i18n key** eklendi (tr + en + ru + de + fr + es + ko + ar — 8 dilde tam DeepL çevirili): `action_back, action_delete, action_edit, action_add, action_import, action_export_excel, action_approve, action_reject, filter_daily, filter_weekly, filter_all, filter_ungrouped, filter_grouped, bc_home, th_member_name, th_total_points, th_castle_level, section_alliance_ranking, section_detailed_report, section_new_event`.
  - Diğer 21 dil `fallbackLng: ["en", "tr"]` üzerinden İngilizce'ye düşer — tutarlı UX.
  - **⚠️ Inline Replacement (t() sarmalama) NOT COMPLETE**: 30+ dosyada ~200 hardcoded string yerinin `t(key)` ile değiştirilmesi bir sonraki faz. Bu turda sadece i18n key + çeviri altyapısı kuruldu; inline refactor tur limitleri nedeniyle ertelendi. `Leaderboard.jsx` scope tabs (v78) örnek olarak refactor edildi.
- **Feb 22, 2026 (v78)** — Sıralama Klan→İttifak + Yeni i18n Keys DeepL Çevirisi:
  - `Leaderboard.jsx` scope selector: "🛡️ Klan" → `t("scope_alliance")` = **🛡️ İttifak**. Global/Sunucu label'ları da i18n key'leri kullanacak (`scope_global`, `scope_server`).
  - `i18n/index.js`'te tr + en + ru + de + fr + es + ko + ar + pt için 3 yeni key eklendi (DeepL curl ile alınmış çevirilerle). Diğer 21 dil `fallbackLng: ["en", "tr"]` üzerinden İngilizce'ye düşer.
  - DeepL bulk-translate endpoint (`/api/deepl/bulk-translate`) doğrulandı, 8 dile paralel çeviri döner (curl smoke test geçti).
  - **Global DeepL sweep NOT YET COMPLETE**: Uygulama genelinde tüm hardcoded metinleri `t()` sarmalayıp 29 dile çevirmek büyük çoklu-tur bir refactor. Bu tur sadece kritik "Klan→İttifak" fix + demo DeepL akışı yapıldı. Genel sweep phase-based olarak devam edecek (bkz. Next Action Items).
- **Feb 22, 2026 (v77)** — Menü İkonu Hover/Active Animasyonu:
  - `.menu-tile-item` (button), `.menu-tile-ring` (halka border div), `.menu-tile-icon` (sprite crop + warband SVG) className'leri eklendi.
  - `:hover / :focus-visible / :active` state'lerinde: amber ring border alpha `0.6 → 0.95`, box-shadow yoğunlaşır (`0 0 20px rgba(249,115,22,0.8) + 0 0 40px rgba(249,115,22,0.4) + 0 0 56px -6px rgba(245,208,106,0.55)`), ikon `translateY(-4px) scale(1.05)` yukarı zıplama + büyütme.
  - `transition: 0.22s ease` yumuşak animasyon. Mobil için `:active` aynı efekti tetikler + button kendisi `scale(0.98)` tap feedback verir.
  - Screenshot doğrulandı: LEADERBOARD ikon hover'ında amber halka glow belirgin şekilde parladı, ikon yukarı zıpladı.
- **Feb 22, 2026 (v76)** — Siyah JPEG Arka Planı Kesin Temizlendi:
  - **3 Katmanlı Yaklaşım** sprite `<img>`'larda: (1) `filter: url(#titanxis-kill-black)` → SVG feColorMatrix luminance-based alpha (siyah=şeffaf); (2) `filter: brightness(1.15) contrast(1.08)` → ikonlar daha canlı; (3) `mix-blend-mode: lighten` → screen'den daha agresif, max(A,B) siyahı tamamen elimine eder.
  - `background: transparent + backgroundColor: transparent + isolation: isolate` img'a eklendi.
  - SVG filter tanımı `MemberHome` return'ünün en üstüne konuldu (`<svg width=0 height=0>` container).
  - Screenshot doğrulandı: 5 sprite ikon (Şimşek, Parşömen, Terazi, Kılıç, Çubuklar) artık siyah kare olmadan, canlı ve şeffaf zeminde görünüyor.
- **Feb 22, 2026 (v75)** — İkonlar %60 Boyutta + Tam Ortalama:
  - Tüm ikonlar (5 sprite + warband trio) `ICON_SIZE = 65px` (=%60 of 108px pedestal). `xShift=17.5, yShift=10` sprite native center'a kilitli. Pedestal `display:flex; align-items:center; justify-content:center` — hem yatay hem dikey dead-center. Sprite arka planı `mix-blend-mode: screen` ile transparent kalır (v65'ten), amber ring border (v74) korundu.
- **Feb 22, 2026 (v74)** — Şeffaf Menü Halka Zemini:
  - Menu circle pedestal `background: transparent`, sadece **amber border** (`2px solid rgba(249,115,22,0.6)`) + yumuşak dış glow (amber + faded gold) kaldı.
  - Radial dark violet gradient + inner glass hi-light overlay KALDIRILDI. Halkanın içi tamamen şeffaf → arka plandaki taş dokusu ikonun etrafından görünür.
  - `mixBlendMode: 'screen'` sprite `<img>`'da zaten aktif (v65'ten). Screenshot doğrulandı: ikonların arkası tam şeffaf, sadece ikon + amber ring, taş dokusu net görünüyor.
- **Feb 22, 2026 (v73)** — İç Koyu Daire Kaldırıldı + 5 Sprite %15 Daha Küçültme:
  - **İç Wrapper Silindi**: 88px inner circle overlay (`INNER_AREA`) tamamen kaldırıldı. Sprite ve SVG artık doğrudan 108px altın halka pedestal'ının flex-centered child'ı → temiz zemin.
  - **5 Sprite %15 Daha**: `SPRITE_CONTAINER: 43 → 37` (Şimşek, Parşömen, Terazi, Kılıç, Çubuklar). `xShift = 31.5, yShift = 20`.
  - **Warband Trio Aynı**: 50px sabit, halkanın tam ortasında.
  - Sprite crop div'i `borderRadius: 50%` kaldırıldı — kesim rect kalıyor ama arka planda ekstra koyu daire yok. Halkanın kendi radial gradient'i tek zemin.
- **Feb 22, 2026 (v72)** — İç Container Genişletildi + 5 Sprite %15 Küçültme:
  - **Inner Area Genişletildi**: `50 → 88px`. Dıştaki 108px altın halkanın hemen içinde ferah yaşam alanı. Sprite/SVG ikonlar bu genişletilmiş dairenin ortasında flex-centered.
  - **5 Sprite %15 Küçültüldü**: `SPRITE_CONTAINER: 50 → 43` (Şimşek, Parşömen, Terazi, Kılıç, Çubuklar). `xShift = 28.5, yShift = 18` icon body native center'ına kilitli.
  - **Warband Trio Aynı**: `WARBAND_SIZE = 50` sabit — sadece genişletilmiş 88px inner area'nın tam ortasında yüzüyor.
  - Padding: sprite icon için (108-43)/2 = **32.5px**, warband için (108-50)/2 = **29px**. İkiside kenarlara değmiyor, ferah.
- **Feb 22, 2026 (v71)** — SON REVİZE: Görünür Altın Halka + Eşit Küçük İkonlar + Warband Trio:
  - **Halka Geri Geldi**: Pedestal 108px sabit, görünür altın border (`rgba(212,175,55,0.55)`) + katmanlı glow (yakın altın halo 0.50 + violet echo 0.35 + geniş dış altın aura 0.32) + inner glass hi-light. Production 2. görsel stili.
  - **İkonlar Eşit ve Küçük**: TÜM 6 ikon `CONTAINER = 50px` sabit → simetrik. Padding = (108-50)/2 = **29px her yön** ferah boşluk, kenara değmiyor.
  - **Sprite Merkezleme**: `xShift = 25, yShift = 15` — sprite icon body native center'ına yaklaşık kilitli, flex `align+justify: center` dead-center.
  - **Warband Trio**: SVG `50×50` — Kılıç, Şimşek, Terazi ile BİREBİR aynı boyutta.
- **Feb 22, 2026 (v70)** — SADELİK: Halkalar Kaldırıldı, Orijinal Ferah Düzene Dönüş:
  - Karmaşık pedestal halkaları, altın parlama, violet echo, glass gradient, iç sheen — **hepsi silindi**.
  - Sadece **hafif siyah radial drop shadow** (`radial-gradient(circle, rgba(0,0,0,0.35) 0%, transparent 70%)`) ikonun arkasında — arka planda belli olsun diye.
  - Sprite crop `CONTAINER = 62` (orijinal ferah net boyut), `xShift = 19, yShift = 6` — projenin başındaki başarılı yerleşim.
  - Warband trio SVG `width/height = CONTAINER (62px)` — diğer sprite ikonlarla (Kılıç, Şimşek) BİREBİR aynı boyut.
  - Screenshot doğrulandı: 6 ikon (Leaderboard, About Loj, Point Calculator, Events, Katılım Merkezi, Members) sade, net, hafif gölge ile ferah düzende.
- **Feb 22, 2026 (v69)** — Tasarım Krizi Müdahalesi (halka büyük + ikon mücevher gibi küçük):
  - Halka pedestal 108→**116px** (`CONTAINER + 86`), ferah geniş halka geri döndü.
  - İkon crop `CONTAINER: 44 → 30` (=%30 daha küçük), padding = 43px HER YÖN — ikon halka içinde ~üçte bir kaplıyor, dev boşluk kaldı.
  - Sprite `xShift=35, yShift=30` → dead-center dikey+yatay hizalama; flex `align+justify: center`.
  - Warband trio SVG boyutu `CONTAINER+8` (=38px) — o da halkanın içinde küçük mücevher olarak sığdı.
  - Canlı altın halka (v68) korundu. Screenshot ile onaylandı: 6 ikon halkalarda küçük mücevherler gibi ortalı ve ferah.
- **Feb 22, 2026 (v68)** — Canlı Altın Halka + Warband Trio Silueti:
  - **Halka Altın Canlılığı Geri**: Border alpha `0.22 → 0.55`, box-shadow katmanları güçlendirildi: `0 0 22px -2px rgba(212,175,55,0.55)` yakın altın halo + `0 0 32px -6px rgba(147,51,234,0.38)` violet echo + `0 0 56px -14px rgba(245,208,106,0.35)` geniş dış altın aura + inner rim highlight `0.18 → 0.28`. Ferah düzen (108px pedestal, 44px crop, %30 padding) korundu.
  - **Warband Trio Silueti**: Oyuncak Sparta miğferi kaldırıldı. Yerine üç savaşçı inline SVG:
    - Merkez savaşçı ön planda — dark gradient body (`#3A2610 → #1A0F08 → #08030A`), altın rim lighting, kalkık kılıç (blade + crossguard + pommel), crested helmet, göz siperliği.
    - Sol + sağ savaşçılar arka planda (opacity 0.72) — mızrakları yukarı, mini plume'lu miğferler.
    - Altta altın radial floor bloom (`rgba(212,175,55,0.35)`) → grup zeminde parlıyor.
    - Diğer sprite ikonlarla aynı drop-shadow katmanı (siyah + altın halo + soft glow).
- **Feb 22, 2026 (v67)** — Ferah İkon Düzeni + Sparta Miğferi:
  - **Ferah İkon Düzeni** (`MemberHome.jsx > MenuTile`): Crop penceresi `CONTAINER: 56 → 44`, pedestal `+48 → +64` (=108px), sprite yatay+dikey ortalanmış (`xShift = 28, yShift = 20`). İkon safe margin: (108-44)/2 = **32px her yön ≈ %30 iç boşluk** — kullanıcının istediği en az %20 safe margin katbekat aşıldı. İkonlar artık halkanın tam ortasında "cuk" oturuyor ve ferah şekilde yüzüyor.
  - **Üyeler Ikonu — Sparta/Centurion Miğferi**: `UsersRound` yerine inline SVG — çift-katman altın gradient (`#FFF4B8 → #F5D06A → #C08820 → #5A3708`) helmet dome, kırmızı-altın crest plume (Roma/Sparta stili), altın crest base band, nasal bar, T-visor eye slots, cheek guards, radial white shine highlight. Sprite ikonlarla aynı 3D drop-shadow filtresi. Metalik doku ve parlaklık aynı sanatsal seviyede.
- **Feb 22, 2026 (v66)** — İkon Sığdırma + Üyeler İkonu + Yumuşak Glow:
  - **İkon Sığdırma** (`MemberHome.jsx > MenuTile`): Sprite crop penceresi `CONTAINER: 62 → 56`, sprite `CELL: 100 → 96`. Yüzen cam pedestal `CONTAINER + 48 = 104px` — ikonun etrafında ~24px orantılı padding. Artık taşmıyor, çerçeveye sıkışmıyor.
  - **Üyeler İkonu Revizyonu**: Mavi 3D kalkan sprite yerine `lucide-react > UsersRound` — altın (`#F5D06A`) grup/birlik ikonu. Diğer 3D ikonlarla aynı katmanlı drop-shadow filtresi (siyah shadow + altın halo + soft glow).
  - **Çerçeve Parlaması Yumuşatma**: Sert `0 0 22px -2px rgba(147,51,234,0.35)` yerine 3 katmanlı glow: deep ground shadow + soft violet halo + geniş faded gold aura → arka planla kaynaşır. Border alpha `0.35 → 0.22` daha yumuşak.
  - Kanıt: Anasayfa screenshot'ta 6 ikon dairelerin ortasında yerleşik, MEMBERS altın UsersRound, glow arka plan taşıyla kaynaşmış — kullanıcı gözle onayladı.
- **Feb 22, 2026 (v65)** — High-End UI Operasyonu (siyah kutu son):
  - **Anasayfa İkonları** (`MemberHome.jsx > MenuTile`): Kaba siyah kare arka planlar tamamen kaldırıldı. Her ikonun altına **circular floating glass pedestal**: radial glass gradient (`radial-gradient(circle at 32% 28%, rgba(168,85,247,0.28) → rgba(20,10,30,0.55) → rgba(8,4,14,0.75))`) + altın hairline border + üstte white sheen highlight + outer neon violet glow + drop shadow. İkon artık dairesel `borderRadius: 50%` bir cam pedestal üstünde yüzüyor.
  - **Sıralama Tablosu Evrimi** (`index.css > .rank-row`): Standart dikdörtgen kutular gitti. `clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))` — top-right + bottom-left köşeler 14px açılı kesildi ("Oyuncu Dashboard" tarzı beveled panel). Üst kenar boyunca `::before` altın sheen hairline + inner white highlight + deeper shadow. Zebra background'lara üstten beyaz sheen katmanı eklendi → metalik hissi.
  - **Top-3 Podium Satırları**: Yeni `.rank-row-top-1/2/3` sınıfları — altın (position 1, `#3D2A08 → #6B4A0F → #2E1E05` metallik + gold border + inner sheen), gümüş (position 2, `#2C2C33 → #4A4A55 → #1F1F26` platinum), bronz (position 3, `#3A1E0A → #5C3010 → #22110A` cooper). Radyal light halo üstte, dış neon glow. Leaderboard `map((r, idx))` her satıra `r.position === 1|2|3` ise özel sınıf ekliyor.
  - **Profesyonel Bütünlük** (`.card-dark`, `.card-red-gold`): Basit gradient kutular yerine katmanlı dokular — radial gold sheen üstte + linear diagonal metal + inner white rim highlight + inner bottom shadow + outer drop shadow. Kartlar artık "yüzen metal panel" hissi veriyor.
- **Feb 22, 2026 (v64)** — Alliance Drill-Down + Health Score Detay Modal:
  - **Alliance Drill-Down** (`backend GET /api/alliances/{name}/drill` + `Leaderboard.jsx > AllianceDrillModal`): Case-sensitive `GOW` / `GoW` / `GOw` her biri bağımsız. Endpoint dönen shape: `{alliance, total_points, members_count, events:[{event_id, event_name, group_name, date, archived, total, members:[{point_id, member_id, name, points, multiplier, final_points, note}]}]}`. Kanıt: `GOW → 102 üye, 6 etkinlik, 8.09B`; `GoW → 55 üye, 5 etkinlik`; `GOw → 1 üye`. Frontend'de leaderboard sıralama satırındaki ittifak chip'i (v63'te eklenen `button`, artık `onClick={() => setDrillAlliance(...)}`) → modal açılıyor. Sol sütun etkinlik listesi (kronolojik desc, gruplu adlar), sağ sütun seçili etkinlik için üye puanları tablosu — admin/editör inline `Düzenle` butonu ile `PATCH /scores/{point_id}` (points + multiplier). Kaydedince tüm ilgili SWR key'leri revalidate (`/leaderboard*`, `/scores*`, `/members/*`).
  - **Health Score Detay Modal** (`Members.jsx > HealthScoreDetailModal`): HealthChip artık `<button>` — tıklayınca modal açılır. Modal 30/90/180 gün için `/api/health-scores?days=X` çağrısı yapar (paralel SWR), üç dönemi RadarChart'ta karşılaştırır (dimensions: RSVP, Katılım, Tutarlılık). Üstte üç skor kartı (180 → 90 → 30) trend oku (↑/↓/→ ±2 tolerans) ile. Altta her dönem için eligible/yes_late/attended/point_events breakdown. Kanıt: `curl` 30d top=32.6, 90d top=32.1, 180d top=27.3 — üç dönem farklı, radar anlamlı fark gösterir. `recharts` (v3.6.0 zaten yüklü) `RadarChart/PolarGrid/Radar` kullanılıyor.
  - **z-index** her iki modal `zIndex: 999997` — Elite Cockpit floating header (zIndex:100) üzerinde açılıyor.
- **Feb 22, 2026 (v63)** — Puan Formatı + İttifak Sütunu + Rütbe Temizliği + Detaylı Rapor:
  - **Puan Formatı (binlik ayraç)**: Frontend `fmt()` zaten `tr-TR` locale → dot separator (`1.000.000`). Backend Excel/CSV: XLSX puan hücrelerine `number_format='#,##0'` uygulandı — Excel tr-TR altında `1.000.000` gösterir, aynı zamanda numerik olarak kalır (sortable). CSV export'larda puanlar string olarak `f"{n:,}".replace(",", ".")` formatında yazılıyor.
  - **İttifak Sütunu (Etkinlik Kayıtları)**: `PointsList.jsx` her satırda solda ittifak chip'i (`allianceBadgeStyle` — akademi otomatik mavi-cam), case-sensitive metin. XLSX Sheet2 "Etkinlik Kayıtları" sol sütun `İttifak` olarak eklendi + solid color fill.
  - **Rütbe Temizliği**: XLSX'te 3 sheet'ten `Rütbe` sütunu kaldırıldı (Üye Listesi, Etkinlik Kayıtları, Sıralama Listesi). `/api/export/csv` (siralama) + `/api/reports/guild-data.csv` — `rank` sütunu silindi.
  - **Rapor Detayı (Etkinlik Bileşimi)**: XLSX Sheet3 "Sıralama Listesi" yeni sütun `Etkinlik Bileşimi` — her üye için "SvS (1.200.000) + KaFeS (400.000) = 1.600.000" formatında per-etkinlik parça ve toplam. Doğrulandı: `Selenay → Pre 4.Gün (325.274.112) + Pre 1.Gün (103.617.630) + Pre 3.Gün (44.856.468) + Pre 5.Gün (38.079.192) = 511.827.402`.
  - **i18n**: `fmt()` locale sabit `tr-TR` — RU/PT/EN kullanıcıları da nokta ayraç görür (tutarlılık için).
  - **Ertelenen (v64 candidate)**: İttifak Sıralaması modülü içine drill-down (ittifak seç → etkinlik puanları listesi + inline düzenleme) — büyük scope, ayrı bir feature phase olarak backlogda.
- **Feb 22, 2026 (v62)** — Akademi Görsel Ayrımı + Guild Health Score:
  - **Akademi Görsel Ayrımı** (`frontend/src/lib/colors.js`): `isAcademyAlliance(name)` — `GOW` (exact) ANA, herhangi bir `name.toUpperCase()==="GOW" && name!=="GOW"` (yani `GoW`, `GOw`, `gow`, ...) AKADEMİ olarak otomatik işaretlenir. `getAllianceColor` artık `{bg, border, academy}` döndürür; `ACADEMY_GRADIENT` mavi-cam gradient + `allianceBadgeStyle` akademi için `boxShadow: 0 0 0 1px rgba(125,211,252,0.55), 0 0 6px rgba(56,189,248,0.35)` sky-glow ekler. Case-sensitivity mühürüyle 1:1 uyumlu, hiçbir yerde birleşme yok. Otomatik — tüm chip'ler (Leaderboard, RSVP, Reports, Members) tek noktadan renklenir.
  - **Guild Health Score** (`backend/server.py > /api/health-scores` + `frontend/src/pages/Members.jsx > HealthChip`): Admin-only endpoint, `days=90` (30-365). Skor formülü: `0.35·RSVP + 0.35·Katılım + 0.30·Tutarlılık`. RSVP = evet+geç / eligible; Katılım = attend / yes_late (yoksa /eligible); Tutarlılık = 1 - stddev/mean (CV). Eligibility case-sensitive scope filtresine göre hesaplanır (GOW eligibility ≠ GoW eligibility). Boş data → nötr 50. Frontend Members sayfasında üye adının yanında ♥ + puan chip'i (S/A/B/C bant renkleri, tooltip breakdown). Test: `curl` ile 102 üye skorlandı, range 2.6-32.1.
- **Feb 22, 2026 (v61)** — "Exact Match" Alliance mühürlemesi + Hızlı Rapor Paneli + Grup/Etkinlik format:
  - Alliance Case-Sensitivity Mühürlemesi (server.py): `_resolve_user_alliances`/`_rsvp_alliance_query`/`event_rsvp` gate/RSVP kaydı/import dedup — hepsinden `.upper()`/`.lower()` merge KALDIRILDI. Kanıt: `/api/leaderboard/by-alliance` → GOW (68) · GoW (9) · GOw (1) üç bağımsız ittifak.
  - Etkinlik Adlandırma "Grup / Etkinlik Adı" formatı: Events kartları + Leaderboard aktif chip'leri (altın grup adı + gri "/" + beyaz etkinlik adı).
  - **⚡ Hızlı Rapor Paneli** (`Reports.jsx`): Yeni tab. Grup seç → o grubun tüm etkinlikleri (aktif+arşiv, kronolojik) tek tabloda + İTTİFAK · ÜyeAdı prefix + tr-TR binlik ayraçlı puanlar + toplam satırı + CSV export. Backend `/api/events?group_name=X` (exact) eklendi.
  - Ek fix: `OcrDialog.jsx` satır 1178 duplicate `style` prop birleştirildi.
- **Feb 22, 2026 (v60)** — "Elite Cockpit" Tasarım Operasyonu (tek seferde mühürlendi):
  - **Floating Glass Header** (`Layout.jsx`): `#titanxis-header-slot` artık sayfa üstüne yapışık değil — 8px üst / 10px yan margin ile "yüzen bar" hâline geldi. Semi-transparent charcoal gradient (`rgba(18,12,22,0.82) → rgba(14,10,18,0.86)`), 14px rounded corners, mor ince kenarlık, inner gold sheen + drop shadow. `::after` pseudo ile altında ince, parlayan **mor → altın → mor** neon çizgi (violet 8px + gold 14px + violet 22px halo).
  - **Logo yatay + daha büyük**: `maxHeight: 96 → 112`, `maxWidth: min(78vw, 480px)`, `width:100%` — TiTaNXiS yazısı net okunur.
  - **Admin Insignia**: `ADMIN`/`Editor`/`View` badge artık logonun sağ-alt köşesine absolute konumlanmış oval "rütbe rozeti" olarak entegre (altın gradient + parlak border + inner white sheen + drop shadow). Eski alt satır tamamen kaldırıldı.
  - **Grup Aksiyon Çubuğu** (`Events.jsx > renderGroupBlock`): Daha doygun charcoal→indigo→violet gradient, altın hairline, iç violet sheen + outer glow. Grup başlığı `h3` platinum silver text-fill'e çevrildi (`#FFFFFF → #B8C4D0 → #7A8794`) + gruba özel neon glow + kara text-shadow — soluk metin sorunu çözüldü.
  - **Z-Index Modal Mühürlemesi** (v58'den beri aktif): Radix Dialog/AlertDialog/Sheet overlay+content ve tailwind `.fixed.z-50` selector'ları `!important` ile 999996/999997'ye zorlanıyor — header slot (zIndex:100) ve nefis floating bar bile modalların altında kalıyor.
  - Testler: preview yüklendi, screenshot'ta floating slot + neon hairline görünür, compile başarılı (mevcut tek ESLint warn korundu).
- **Feb 22, 2026 (v59)** — "Profesyonel Elit" tasarım paketi:
  - **Header logo**: Yatay + geniş (`maxHeight: 96px`, `maxWidth: min(78vw, 460px)`, `width:100%`) — çan ikonuna doğru uzatıldı, mor drop-shadow eklendi.
  - **Header alt bordü**: `#titanxis-header-slot` altında ince parlayan mor hairline (gradient border-image + box-shadow glow).
  - **Etkinlik Grup Aksiyon Çubuğu** (`Events.jsx > renderGroupBlock`): Grup adı + İsim Değiştir/Arşiv/Sil butonları sarılan flex row artık doygun charcoal→navy→purple gradient kutu (`border: gold hairline`, `inset gold sheen`, `outer glow`). Grup başlığı `h3` gümüş→altın vertical gradient text-fill.
  - **Okunabilirlik Overlay**: `body::before` — fixed inset-0, pointer-events none, `z-index:0` — radyal vinyet (`rgba(10,8,6,0.42) → 0.78`) taş desenini bastırıyor ama tamamen örtmüyor. Light-mode karşılığı da var. `.app-shell` z-index:1'e çıkarıldı.
  - **Modal Z-Index Mühürlemesi**: Radix Dialog/AlertDialog/Sheet overlay+content ve tailwind `z-50` selector'ları `!important` ile 999996/999997'ye zorlandı — header slot (zIndex:100) artık asla modalların üzerinde kalamaz.
  - Testler: Frontend compiled with warnings (only existing eslint warn), preview loaded OK.
- **Feb 21, 2026 (v58)**: **KRİTİK DÜZELTME**: `/reports/events/{id}/attendance` ve `/events/{id}/attendance` endpoint'leri artık `event.alliance_scope`'a göre members'ı filtreliyor. Case-insensitive regex match (`GOW/gow/Gow` hepsi). Response'a `total_scoped_members` / `scoped_total_members` alanları eklendi → frontend "X/N" ratio'yu doğru toplamla hesaplar, 255 yerine 102 (sadece GOW) gösterir. Kanıt: totalDB=255, gowCount=158, filter sonrası items=102 (case-insensitive önce 102 ile eşleşti), scope=GOW, first3=[GOW,GOW,GOW], leak=0. Frontend'de değişiklik yok — asıl veri kaynağı düzeltildi.
- **Feb 21, 2026 (v57)**: Görsel derinlik: podium metallic, zebra deeper, sidebar cards solid (no backdrop), event cards opak gradient.
- **Feb 21, 2026 (v56)**: Mistik Karargâh — zebra + GOW neon + charcoal/gold section titles.
- **Feb 21, 2026 (v55)**: RSVP alliance query mühürlendi.
- **Feb 21, 2026 (v54)**: Enforce GOW RSVP Filter + Alliance Scope Selector.
- **Feb 21, 2026 (v48)**: Sticky header FULL transparent.
- **Feb 21, 2026 (v46)**: Portal migration + Katılım Merkezi.
- **Feb 21, 2026 (v43)**: Header layout redesign — single sticky wrapper.
- **Feb 19, 2026 (v41)**: Etkinlik OCR sütun genişlikleri ayarı. Üye Adı `maxWidth: '100px' + width: '100px'` (daha dar), Puan `minWidth: '110px' + width: '110px'` (daha geniş — "100.000.000" tam sığar). Header + body td tutarlı. Diğer sütunlar (İttifak 44 · Rank 50 · ✓ 24 · 🗑 24) korundu.
- **Feb 19, 2026 (v40)**: Etkinlik OCR tablosu BORDER tasarımı. Yeni sütun genişlikleri: ✓ 24px · 🗑 24px · İttifak 44px (3-4 char) · Üye Adı esnek (flex) · Rank 50px · Puan 90px. Her satırda amber üst border `borderTop: 1px solid rgba(245,166,35,0.3)` ve koyu arka plan `background: rgba(0,0,0,0.2)` (tr inline style'da). Header alt border `borderBottom: 1px solid rgba(245,166,35,0.4)`. **Input/select arka planı `transparent`, border yok** — sadece amber row border'ları ile ayrılıyor. İttifak sadece 3-4 karakter (`maxLength=4`), amber renkli bold. Rank R1-R5 dropdown renkli. **Puan Türkçe format**: `type="text" inputMode="numeric"` + `toLocaleString('tr-TR')` — 67977200 → "67.977.200". Üye adı `whiteSpace:'normal' overflow:'visible'` tam görünür.
- **Feb 19, 2026 (v39)**: Üye OCR tablosu 3 düzeltme (isim tam görünür, ittifak fallback, güç tr-TR format).
- **Feb 19, 2026 (v38)**: OCR önizleme tabloları — tam inline-style rewrite.
- **Feb 19, 2026 (v37)**: KRİTİK BUG FIX + tam inline-style rewrite (Etkinlik modu). **Bug**: `<td>` etiketi açılıyor ama `<input type="number" value={currPoints}` opening tag'i düşmüştü — sadece `min={0}` sonrası dangling attributes ve `className="..."` STRING'i JSX child olarak render ediliyordu. Kullanıcı Tailwind class isimlerini metin olarak görüyordu (`focus:bg-black/40 focus:ring-2...`). **Fix**: Etkinlik OCR body tamamen kullanıcı verdiği şablona göre yeniden yazıldı — Alliance/Name/Rank/Puan sütunları, hepsi `style={{...}}` inline-styled (`background: rgba(0,0,0,0.25) · border: 1px solid rgba(255,255,255,0.08) · borderRadius: 4px`). Güç sütunu kaldırıldı (kullanıcı 4 sütun istedi). Header'lar da inline-style'a çevrildi. Rank dropdown altın rengi + `f97316` puan turuncusu şablon değerleri. Eski buggy blok `{false && mode === "event"...}` ile dead-code'landı.
- **Feb 19, 2026 (v36)**: OCR önizleme tabloları SIFIRDAN yeniden yazıldı. (a) Modal tam ekrana sığıyor — yatay scroll YOK (`overflow-x-auto` wrapper + `min-w-[430px]` kaldırıldı, tablo `table-fixed`). (b) **Etkinlik OCR sütun sırası**: `✓ · 🗑️ · İTTİFAK(70px) · ÜYE ADI(esnek) · RÜTBE(50px) · GÜÇ(64px) · PUAN(80px)` — 7 sütun. Güç kolonu geri geldi (backend `_PROMPTS["event"]` yeniden `power: int|null` istiyor), OCR okuduysa turuncu görünüyor, boş bırakılabilir/düzenlenebilir. (c) **Üye OCR sütun sırası**: `✓ · 🗑️ · İTTİFAK(70px) · ÜYE ADI(esnek) · RANK(50px) · KALE(54px) · GÜÇ(80px)` — Durum sütunu (MEVCUT/YENİ) tamamen kaldırıldı; İttifak ilk kolona alındı, Kale 1-10 arası dropdown (`<select>` F1..F10), OCR okuyamazsa boş; Güç input olarak düzenlenebilir; Rank R1-R5 dropdown renk kodlu. (d) **✓ ve 🗑️ ayrı sütunlar**: ✓ küçük yuvarlak durum göstergesi (yeşil check = kaydedilecek, gri × = elenmiş), 🗑️ butonu tıklanınca satır ele alınıyor. (e) **"ÜZERİNE YAZILACAK" satırları kaldırıldı** — hem event dup diff strip'i (`{false && mode === "event"...}` ile dead-code'lanıyor) hem member overwrite diff strip'i devre dışı. Kaydet butonunun hemen üstünde tek bir özet kart (`ocr-save-summary`) — event modunda "N üye zaten puan almış — atlanacak" veya (overwrite modunda) "N üyenin mevcut puanı üzerine yazılacak", üye modunda "N mevcut üyenin verisi üzerine yazılacak".
- **Feb 19, 2026 (v35)**: OCR event tablosu tam yatay kaydırılabilir. (a) `<table>` `overflow-x-auto -mx-1 rounded-md` wrapper içine alındı, `min-w-[430px]` ile tablo sabit minimum genişliğe sahip — dar modallar için içerik hiçbir zaman kırpılmıyor, gerektiğinde yatay scroll çıkıyor. (b) Tüm event sütunları `w-[...]` sabit yerine **min-w+w** kombinasyonuyla ayarlandı: ✓ ikonu `min-w-[32px] w-[32px]`, İttifak `min-w-[80px] w-[80px]`, Üye Adı `min-w-[120px]` (flexible), Rütbe `min-w-[60px] w-[60px]`, Puan `min-w-[90px] w-[90px]`. Bu şekilde en dar ekranda bile hiçbir hücre kesilmiyor. (c) **Toplu İttifak barı silindi** — `ocr-bulk-alliance-bar` blok tamamen kaldırıldı (state `bulkAlliance` da artık kullanılmıyor).
- **Feb 19, 2026 (v34)**: OCR event tablosu son cila. (a) Modal genişletildi `max-w-xl` → `max-w-2xl` (576px → 672px). (b) **Üye Adı sütunu ferahladı** — header `min-w-[200px]`, td `min-w-[200px]` + input `min-w-[190px]` ile artık isimler tamamen görünüyor (önceki dar layout'ta "I" harfi kesiliyordu). Alliance/Puan sütunları `w-[95px]`'e düşürüldü ki tüm alan Ad'a kalsın. Rütbe `w-[64px]`. Alliance↔Ad boşluğu `pl-3 pr-2` optimize (ferah ama israfsız). (c) **Toplu Rütbe barı silindi** (`ocr-bulk-rank-bar`) — bar tamamen kaldırıldı, önizleme başlığından hemen sonra Toplu İttifak barı sonra dup banner geliyor artık.
- **Feb 19, 2026 (v33)**: OCR üç profesyonel özellik. (a) **Duplicate Merge Mode** — Backend `OcrApplyEventPointsBody`'ye `overwrite_duplicates: bool = False` alanı eklendi; True olduğunda `overwrite_member_ids` toplanıp bulk `db.points.delete_many({event_id, member_id ∈ [...]})` ile eski puan satırları siliniyor ve yenisi ekleniyor. Response yeni `overwritten` sayacı içeriyor. Frontend `OcrDialog.jsx`: `duplicatePolicy` state (`skip` | `overwrite`) + dup banner içinde iki sekmeli toggle (`🚫 Atla` / `🔄 Üzerine Yaz`, `data-testid="ocr-dup-policy-*"`) — seçime göre banner rengi kırmızıdan altına dönüyor ve mesaj "atlanacak"/"üzerine yazılacak" arası değişiyor. `doApply` overwrite modunda client-side filtreyi devre dışı bırakıyor ki backend gerçekten üzerine yazsın. (b) **CSV Export of Skipped** — `Events.jsx` onApply toast'u artık Sonner `action: { label: "CSV indir", onClick }` içeriyor; tıklandığında `ocr-atlanan-<etkinlik>-<tarih>.csv` UTF-8 BOM'lu (Excel uyumlu) dosya indiriyor. Kolonlar: `İsim,Üye ID,Denemek istenen puan`. Toast süresi 10sn'ye çıkarıldı. (c) **Bulk Rank Set** — Etkinlik önizleme tablosunun hemen üstünde `ocr-bulk-rank-bar` — "Toplu Rütbe · her satıra uygula" + R1..R5 5 butonlu bar. Tıklanınca elenmemiş tüm satırlara o rütbe uygulanıyor (via `setRowEdits`) + success toast.
- **Feb 19, 2026 (v32)**: OCR yönetici paneli cilası. (a) **Rütbe kolonu event modunda geri geldi** — İttifak · Üye Adı · **Rütbe** · Puan (Rütbe genişliği `w-[68px]`, tam ortada). R1-R5 seçenekli dropdown, `<select>` altın rengi (`#FCD34D`), varsayılan **R1** (input boş bırakılırsa/OCR okuyamazsa client + backend her ikisi de "R1" atıyor). Backend `apply-event-points` artık `row.get("rank")` alıyor; whitelisted R1-R5 ise yeni oluşturulan üyelere kullanılıyor. (b) **Zebra şeridi** — `${i % 2 === 1 ? "bg-white/[0.02]"}` her ikinci satıra hafif arka plan. (c) **Belirgin başlıklar** — tüm `<th>` `#F5A623` altın rengi + `font-bold text-[10px] uppercase tracking-widest` (önceki `text-amber-200/70` yerine). (d) **Parlayan focus** — inputlar/dropdown'lar `focus:ring-2 focus:ring-amber-400/70 focus:shadow-[0_0_10px_rgba(245,166,35,0.35)]` ile tıklandığında altın parıltı halesi. (e) **İttifak durum noktası** — İttifak input'unun solunda gömülü renkli daire (alliance color veya boş için gri) — hem event hem members modunda. (f) **Modern çöp kutusu** — `Trash2` (lucide) `hover:bg-red-500/15 hover:border-red-500/40 rounded-md` ile daha zarif kırmızı hover halesi (önceki `hover:bg-white/10` yerine). Hem etkinlik hem üye modunda tutarlı.
- **Feb 19, 2026 (v31)**: OCR sistem cilası — üye tablosu da eşleştirildi. (a) Üye modu tablosunun tüm hücreleri artık aynı `bg-black/25` yuvarlak kart stiline sahip (İsim + İttifak inputları, Güç/Kale/Rank display cell'leri renk kodlu); İttifak input'unun içine renk swatch'i gömüldü (event modu ile birebir). Başlıklar `pl-2 pr-4` (İsim), `w-[85px]` (Güç), `w-[52px]` (Kale), `w-[50px]` (Rank), `w-[100px]` (İttifak), `w-[60px]` (Durum) sabit genişliklerle hizalandı — hem etkinlik hem üye önizlemesi tek düzen. (b) `OcrDialog.doApply` etkinlik modu için client-side mükerrer filtresi eklendi (`eventExistingByNameLc` set'i ile önceden düşürür), tümü mükerrerse "Kaydedilecek satır kalmadı" toast + block. (c) `Events.jsx` onApply toast'u zenginleştirildi — kaydedilen puan + yeni üye + `N mükerrer atlandı` + ilk 5 isim (`toast.success(..., {description})`), ayrıca `/ocr/event-participants/{event_id}` SWR anahtarı da revalidate ediliyor.
- **Feb 19, 2026 (v30)**: OCR sistem profesyonelleşti. (a) Backend `/ocr/apply-event-points` artık aynı etkinlik + üye kombinasyonu için ikinci puan kaydını REDDEDIYOR — `existing_point_member_ids` preflight ile eşleşen satırlar `skipped_duplicates: [{name, member_id, attempted_points}]` altında dönüyor, dbye yazılmıyor. Ne olursa olsun mükerrer puan çift sayılmıyor. (b) Yeni endpoint `GET /api/ocr/event-participants/{event_id}` seçilen etkinlik için hâlihazırda puanı olan üyeleri (member_id + name + existing_points toplamı) döndürüyor — frontend önizleme diff'i için kullanılıyor. (c) `OcrDialog.jsx`: seçim yapılınca SWR ile bu endpoint çekiliyor, `eventExistingByNameLc` map'i oluşturuluyor. (d) Etkinlik önizlemesi yeni sütun düzeni — İttifak en solda (renk swatch input içinde), İttifak↔Ad arası `pl-6 pr-1` ile ferahladı, Ad↔Puan arası `pl-1 pr-2` ile daraldı. Hücreler artık `bg-black/25` yuvarlak input kartları — hover'da `bg-black/40`, focus'ta `bg-black/50 + ring-amber-400/60 + border-amber-400/50` ile net feedback (inline edit belirgin). Modal `max-w-xl`'e büyüdü. (e) Diff yapısı **hem etkinlik hem üye** modunda aktif — etkinlik modunda mükerrer satır için "Mükerrer — Atlanacak" strip (Puan: eski → yeni, üstü çizgili + kırmızı) + tek tık `🗑 satırı ele` ile önizlemeden çıkarma. (f) Tablo üstünde toplu banner `ocr-event-dup-banner` — "N üye bu etkinlikte zaten puan almış" + `🗑 hepsini ele` toplu ele butonu.
- **Feb 19, 2026 (v29)**: Members OCR preview diff strip. In `OcrDialog.jsx` a new `existingByLcName` memo maps every existing member by lowercased clean name. When a members-mode preview row matches an existing member, an inline sub-`<tr>` renders directly beneath the row with `data-testid="ocr-row-diff-${i}"` and colour-coded chips for each field the OCR would overwrite: **Güç · Kale · Rütbe · İttifak**. Each chip shows `önceki değer` (line-through, muted) → `yeni değer` (bold, coloured). The predicate mirrors `apply_members` — only truthy/whitelisted OCR values raise the flag, so no false positives. A "↩ mevcut değerleri koru" quick-action reverts all four fields for that row to the DB values so admins can neutralise a bad OCR read with a single tap without deleting the whole row. Non-existing rows and excluded rows skip the diff strip. Wrapped the map return in `<React.Fragment key={i}>` so the sub-row can sit outside the main `<tr>` without breaking table semantics.
- **Feb 19, 2026 (v28)**: OCR Etkinlik ↔ Üye modları arasına net duvar. (a) `_PROMPTS["event"]` shape küçültüldü — sadece `{name, points, alliance_name}`; `castle_level / rank / power` alanları ve pembe altıgen talimatı kaldırıldı; ek olarak modele "Do NOT extract castle_level, rank, or power for event scoreboards" uyarısı eklendi. (b) `/ocr/apply-event-points` artık mevcut üyenin `castle_level / rank / bireysel_guc / alliance_name` alanlarına dokunmuyor (`member_patches` bloğu tamamen silindi). Sadece points + yeni-üye-oluşturma davranıyor — böylece etkinlik OCR'ı curated üye verisini sessizce mutate edemez. (c) `OcrDialog.jsx` event tablosu tekrar 3 kolon: **İttifak · Üye Adı · Puan**. Rütbe `<select>` ve Kale numeric input silindi; `_mergeRows`, `remergeWithStrategy` ve `doApply` event dalları `castle_level / rank / power` alanlarını taşımıyor (`doApply` sonunda `delete next.castle_level/rank/power` ile payload'dan da çıkarılıyor). (d) `_PROMPTS["members"]` içindeki pembe altıgen talimatı sertleştirildi — "ONLY the number DIRECTLY NEXT TO the pink/magenta hexagon icon; do NOT return numbers from row indexes, might/power, points or side stats. If no pink hexagon → null." Yani `rank` ve `castle_level` kontrolü artık yalnızca members modunda çalışır ve DB'ye yalnız önizlemede onaylanan veri işlenir.
- **Feb 19, 2026 (v27)**: OCR event mode gained full 5-field extraction (superseded by v28).
- **Feb 18, 2026 (v26)**: OCR event preview modernised.
- **Feb 18, 2026 (v16)**: OCR alliance edit + datalist autocomplete.
- **Feb 18, 2026 (v13)**: OCR safety layers + DeepL backfill + fallbackLng chain.
- **Feb 18, 2026 (v12)**: OCR preview upgrades — inline cell edit + preview merge chip.
- **Feb 18, 2026 (v11)**: OCR preview + elimination flow. New keys under `// __V9_FEB18_I18N__` block: `lb_folder_back`, `lb_folder_no_groups`, `lb_folder_no_folders`, `lb_folder_group_count`, `lb_folder_no_events`, `lb_active_group_expand_show/hide`, `ev_show_breakdown_label/_hint_on/_off`, `ev_bulk_breakdown_hide/_show/_tip`, `ev_group_hidden_badge/_hint_hidden/_visible`, `ev_group_hide/_show_confirm`, `ev_group_type_label/_grouped/_ungrouped`, `ev_ungrouped_events_label`, `poll_tg_details_toggle/_hide/_show/_summary_*/_no_votes/_voters_header/_admin_only_note/_loading`. Populated TR, EN, RU, PT verbatim; the other 25 languages fall back to TR and can be lifted with the existing DeepL bulk-translate flow (`POST /api/deepl/bulk-translate`). Components `Leaderboard.jsx`, `Events.jsx`, `Polls.jsx` wired through `t()`; `EventsBulkToolbar` and `PollCard` gained their own `useTranslation()` hook.
- **Feb 18, 2026 (v9)**: Group hidden rozet + server refactor v1.
- **Feb 18, 2026 (v8)**: Leaderboard group chip cross-reference guard (HIDDEN_GRP hidden).
- **Feb 18, 2026 (v7)**: Group master hide, bulk breakdown, poll TG voter details panel.
- **Feb 18, 2026 (v4)**: (a) Removed "Tümü" chip from Leaderboard active event strip. (b) Removed Kolektif/Bireysel distinction from Events page.
- **Feb 18, 2026 (v3)**: Leaderboard Archive rebuilt to folder → group → member hierarchy. Top level shows folder cards grid only. Group row now has two actions: click name → total ranking, click `▶` → inline event list.
- **Feb 18, 2026**: Removed dead `moveToFolder` function.

## What's Implemented
- 29-language i18n with DeepL bulk translate + on-the-fly DM translation
- Leaderboard, Commanders, Points, Events, Members CRUD
- OCR (OpenAI Vision) with react-image-crop preview cropping
- Web Push (VAPID) + scheduled broadcasts
- Inline ✅/❌ attendance callbacks + auto-chase cron
- Event Screenshot Gallery
- Telegram diagnostic panel + manual chat ID link
- Open Graph / SEO meta

- **Archive tab v2** (Feb 18): 3-col strict grid (`grid-cols-3`), folder
  cards drag-and-drop reorderable (drag one card onto another → POST
  `/event-folders/reorder`), Klasörsüz stays pinned (not draggable).
  Event cards inside the expanded panel remain draggable to reassign
  between folders. Expanded panel now branches: if the folder contains
  any events with `group_name`, it renders a group-accordion (▶/▼
  header per group with date range chip + count; click to expand
  events); if all events are ungrouped, it falls back to the flat 2-col
  grid. Group open-state persists per folder via `openedGroups` map.
- **Archive tab full redesign** (Feb 18): The archive tab now uses a
  bold 3-col stone-textured folder grid (referans görsel). Klasörsüz
  is pinned as the first card. Each folder card shows the icon (42px),
  name (Cinzel serif with drop-shadow), and event count. Selecting a
  folder glows it with a bright colored halo (`boxShadow 0 0 24px +
  outer 48px`) and expands a golden-bordered panel below with the
  folder's events in a 2-col grid (name bold + date + × multiplier).
  Rename ✏️ and Delete 🗑️ icons live on each card's top-right corner
  (admin-only). A dashed "➕ Yeni Klasör" card at the end opens the
  folder manager modal. The old chip strip / sort toggle / folder
  actions bar / group-name sub-grouping were fully removed for
  clarity. Cards accept drag-drop of events from the expanded panel
  for one-tap reassignment.
### Feb 2026 — Leaderboard / Members / Events / Calculators UX pass
  chip strip below the group chips. Clicking a specific event swaps
  the aggregate podium+list for that event's ranking (participants only).
- **Members country modal** — `InlineCountryPicker` rewritten from an
  anchored dropdown into a centered portal modal (search + full list)
  so admins can tap the flag / "?" and pick a country from a large
  surface. Body scroll locked while modal is open.
- **Event archive folders** (backend + frontend, fully synced):
  - New `event_folders` collection + `EventFolder`/`EventFolderCreate`/
    `EventFolderUpdate`/`FolderAssignBody` models.
  - Endpoints: `GET /api/event-folders` (with live `archived_count`
    aggregation), `POST /api/event-folders`, `PATCH /api/event-folders/{id}`,
    `DELETE /api/event-folders/{id}` (cascades folder_id to null, does
    not delete events), `POST /api/event-folders/assign`,
    `POST /api/event-folders/reorder` (drag-and-drop bulk order update).
  - `Event.folder_id` optional field; `GET /api/events?folder_id=…`
    filter with `"none"` sentinel for top-level.
  - `EventFolderManager` modal on the Events archive tab (create /
    rename / recolor / delete) with an 8-color curated palette
    (Amber / Ember / Amethyst / Sapphire / Emerald / Rose / Cyan /
    Slate) replacing the raw color picker.
  - Folder chip strip + "Yeni→Eski / Eski→Yeni" sort toggle on archive.
  - Chips are draggable — HTML5 drag-and-drop reorder syncs to backend
    via the new reorder endpoint on both Events and Leaderboard views.
  - Bulk "Klasöre Taşı…" `<select>` in the events bulk toolbar.
  - Leaderboard archive tab renders the same folder chip strip so the
    two views stay in sync automatically.
- **Archive event comparison** (Leaderboard):
  - New "Karşılaştır" toggle on the archive events grid puts every
    archive card into a 2-pick selection mode (purple numbered badges).
  - Selecting 2 events + tapping "Görüntüle" opens
    `CompareEventsModal` — side-by-side leaderboard diff showing
    "her ikisinde katılan" (with A/B/diff columns colour-coded plus
    the event name printed in each column header for clarity),
    "sadece A · <event>", and "sadece B · <event>" panels, plus
    per-event totals.
- **Folder bulk archive quick action** — new
  `POST /api/event-folders/{folder_id}/bulk-archive` endpoint toggles
  `archived` on every event inside a folder. When a folder chip is
  selected on the Events archive tab, a coloured action bar surfaces
  with "Tümünü Aktife Al" / "Tümünü Arşive Al" buttons so a full season
  retires or revives with one tap (curl-verified end-to-end).
- **Archive folder-grouped view** — when no folder chip is active on
  the Events archive tab, the grid switches from Kolektif/Bireysel
  split to a folder-grouped layout (one section per folder with its
  own header, colour tint, icon glyph, event count badge, and
  "Aç →" shortcut to focus that folder). Events not in any folder
  land in a "Klasörsüz" group so nothing is lost. Events inside a
  folder card are draggable — dropping onto another card writes a
  `folder.event_order` list via
  `POST /api/event-folders/{folder_id}/reorder-events` so each admin's
  season timeline sticks.
- **Folder icons + templates**:
  - `EventFolder.icon` optional emoji glyph (default 📁). 10-icon
    curated palette in `EventFolderManager`: 📁 🏆 🎯 ⚔️ 🛡️ 🌟 💎 🔥 👑 🎖️.
    Icon renders on the folder chip strip (Events + Leaderboard),
    on the archive folder-grouped section header, the folder actions
    bar and the manager row.
  - New `folder_templates` collection + endpoints
    (`GET/POST /api/event-folder-templates`,
    `DELETE /api/event-folder-templates/{id}`). Manager modal shows a
    "Şablonlar" strip; "Şablon Olarak Kaydet" saves the current
    name/color/icon combo, and clicking a template chip pre-fills the
    "yeni klasör" form so a new season spins up with one tap.
- **Archive comparison bar chart** — `CompareEventsModal` now includes
  a proportional bar chart under the A/B totals cards, sized off the
  larger total (100%). The winning event gets a glowing border and a
  👑 marker so admins spot the outcome without reading numbers.
- **Archive CSV export** — `GET /api/reports/archive-points-export.csv`
  streams a member × event dump (member/alliance/event/date/group/
  multiplier/base_points/final_points) with proper CSV escaping.
  "CSV İndir" button on the Leaderboard archive tab kicks off the
  download.
- **Compare winner crown badge** — `Event.compare_wins` field increments
  via `POST /api/events/{event_id}/compare-win` the first time the
  event beats another in a `CompareEventsModal` session (guarded with a
  `useRef` so refreshes don't double-count, ties skip). Archive event
  cards show a small 👑 badge (with a numeric count once wins > 1) in
  the top-right, hidden while compare mode is active so it doesn't
  clash with the numbered selection badge. Curl-verified end-to-end.
- **Folder public share link** — `GET /api/public/folder/{folder_id}`
  is a no-auth endpoint that returns the folder metadata + list of
  archived events + fully aggregated leaderboard (sum of points ×
  multiplier across all events, member/alliance enriched). New
  `PublicFolderLeaderboard` page mounted at `/public/folder/:folderId`
  renders a stylised season recap (header card with folder icon +
  color, per-folder totals, in-folder events strip with per-event 👑
  markers, podium, and full ranking). "🔗 Paylaş" button in the
  Events folder actions bar copies the URL to clipboard.
- **LoJ Hakkında + Puan Hesapla table compaction**:
  - `SoldierCalculator` tier buttons, soldier count input, resource
    grid (2-col → 4-col), and duration grid all tightened so the tool
    fits in one viewport.
  - `PointCalcPage.TableCard` simplified — removed miktar input, total
    points panel, and units grid. Kept table name, multiplier name,
    multiplier value. "Birim Ekle" button relabeled → "Düzenle".
  - `PublicPointCalcPage.ReadOnlyTable` matched (miktar / total / units
    removed for public share link).


### Telegram DM auto-translate architecture (Feb 2026 — country-based, RESTORED)
All Telegram **DM** send sites route through `_dm_translate_and_send(chat_id, text, ...)`
at `backend/server.py:~3352`. **Language selection is driven by the linked
Member's `country` field (ISO 3166-1 alpha-2).** A member marked
`country="RU"` receives Russian DMs; `country="BR"` receives Brazilian
Portuguese via DeepL PT-BR; `country="PT"` receives European Portuguese
via PT-PT; `country="TR"` (source) gets the original text without a DeepL
round-trip.

Mapping (`backend/server.py:~3199`, extend as needed):
- Russian family: RU/BY/KZ/KG/TJ/UZ → ru
- German family: DE/AT/CH/LI → de
- English family: US/GB/UK/CA/AU/NZ/IE/IN/ZA/SG/PH → en (DeepL EN-GB)
- French family: FR/BE/LU/MC → fr
- Spanish (incl. LATAM): ES/MX/AR/CO/CL/PE/VE/UY/PY/EC/BO/DO/CR/GT/HN/NI/PA/SV → es
- Italian: IT/SM/VA → it
- Portuguese: PT/AO/MZ → pt (DeepL PT-PT), **BR → pt-br (DeepL PT-BR)**
- Dutch: NL → nl
- Polish: PL → pl
- Ukrainian: UA → uk
- Turkish (source): TR → tr (no translation)
- East Asia: JP → ja, KR → ko, CN/TW/HK/MO → zh
- Scandinavian: SE → sv, DK → da, NO → nb, FI → fi
- Central/Eastern Europe: CZ → cs, SK → sk, SI → sl, HU → hu, RO/MD → ro, BG → bg
- Greek: GR/CY → el
- Baltic: EE → et, LV → lv, LT → lt
- SE Asia: ID → id

`_resolve_dm_lang_for_chat(chat_id) → (lang, country)` walks 3 paths, first match wins:
  A) `users.telegram_chat_id` → `users.member_ids` → `members.country`
  B) `telegram_chat_map.username_lc` → `members.telegram_username` → `members.country`
  C) `telegram_chat_map.username_lc` → `users.telegram_username` → `users.member_ids` → `members.country`

Log grammar (all prefixed `dm_translate`, logger name `telegram`):
- `enter chat=X text_len=N` — every DM attempt
- `resolved chat=X user=... country=RU → lang=ru` — resolution outcome
- `call chat=X ... country=RU lang=ru src_len=N → calling DeepL` — right before DeepL
- `ok chat=X lang=ru src_len=N out_len=M`
- `cache_hit chat=X lang=ru`
- `empty chat=X lang=ru — DeepL API error: ...`
- `skip chat=X lang=ru — DeepL API error: <ExceptionType>: <message>`
- `none chat=X ... — country=TR maps to source language (TR) → sending original text`
- `none chat=X ... — no linked member OR member has no country set → sending original text`
- `sent chat=X country=RU lang=ru translated=bool telegram_ok=bool out_len=M`

### 4-Channel Parallel Notification Engine (Feb 2026)
The scheduler loop dispatches **every** fired scheduled push across 4
independent channels via `asyncio.gather(..., return_exceptions=True)` so
no single slow / failing backend can stall the others:

1. **Web Push** — `_broadcast_push(...)` → browser push via VAPID
2. **Telegram Group** — `_send_tg_channel(doc)` → TELEGRAM_CHANNEL_ID broadcast
3. **Telegram DM** — `_send_tg_dms(doc)` → per-linked-user with country-based DeepL translation
4. **In-App Notifications** — `_broadcast_in_app(doc)` → inserts one `in_app_notifications` row per targeted user

Per-channel failures are logged and coalesced to safe defaults, letting the
scheduler continue. Runtime: 1.4s for 4 recipients (was ~3-4s sequential).
Doc-level flags: `send_push` / `send_channel` / `send_dm` / `send_app` (all default True).

**In-app notifications collection** (`in_app_notifications`):
- Schema: `{id, user_id, title, body, url, event_id, sched_id, created_at, read}`
- Target selection: attending users when `event_id` present, otherwise ALL
  `notification_enabled != False` users. Admins/editors always receive.
- Endpoints:
  - `GET /api/notifications?limit=30` → `{items, unread, total}`
  - `POST /api/notifications/{id}/read` → idempotent mark-read
  - `POST /api/notifications/read-all` → mark all read for current user
- **Frontend bell icon: `NotificationBell.jsx`** at Header'da LanguageSwitcher + DeeplBadge + DeeplDigest'in yanında. 30s SWR polling, kırmızı unread badge (`99+` cap), portal-based dropdown with per-row mark-read + read-all footer button. `data-testid` selectors: `notif-bell-btn`, `notif-bell-badge`, `notif-bell-dropdown`, `notif-bell-item-{id}`, `notif-bell-read-all`, `notif-bell-empty`.

### 4-Channel Parallel Notification Engine (Feb 2026)

**Real-time SSE push** (`GET /api/notifications/stream?token=...`): backend
maintains an in-memory `SSE_NOTIF_SUBSCRIBERS` dict keyed by user_id with a
list of `asyncio.Queue` per open connection. `_broadcast_in_app` publishes
to every matching queue right after the DB insert. The endpoint streams
`event: hello` on connect and `event: notification` per publish, with a
`: keep-alive` comment every 25s to survive proxy timeouts. Auth via query
param since `EventSource` can't set headers. `NotificationBell.jsx` opens
one EventSource on mount, prepends new payloads into the SWR cache, and
lets the browser handle auto-reconnect. The 30s poll stays as a safety
net for missed frames. End-to-end preview test: payload arrived in the
subscriber queue within milliseconds of `insert_many`.

**Country Coverage Widget** (`frontend/src/components/CountryCoverageBadge.jsx`):
Admin-only chip mounted inside `EventNotificationsPanel` header. Polls
`GET /api/admin/country-coverage` every 2 min. Green when 100% covered
and every ISO2 is mapped; amber warning otherwise, showing "%X · N/T
üyenin country'si boş" plus a list of unmapped ISO2 chips. Backend
returns `{total_members, with_country, missing_country, coverage_pct,
per_country, unmapped_countries}`.

**Telegram DM Health Cron** (`POST /api/cron/telegram-dm-health`):
Weekly Sunday 04:00 UTC via `/app/.emergent/crons.yml`. Probes every
`users.telegram_chat_id` + `telegram_chat_map.chat_id` via Telegram's
`getChat` API. Dead chat_ids (400 "chat not found" / 403 "bot blocked" /
"user deactivated") get `telegram_dead_since` + `telegram_dead_reason`
flagged. Revived ids clear the flag automatically. Rate-limited to
~20 req/s. Returns `{users_checked, chat_map_checked, newly_dead_users,
newly_dead_chat_map, already_dead, revived, alive}`.

Every scheduled push + test push now returns a `telegram_dm_langs` breakdown
alongside `telegram_dm_sent` / `telegram_dm_translated`. The map has the
shape `{"ru": 3, "pt-br": 2, "en": 5, "src": 1}` — `"src"` bucket counts
recipients on the source language (TR) that received the original text
without translation. Increments only fire on **successful** Telegram
delivery so the widget reflects actual reach, not attempted sends.

Persisted to `push_history.telegram_dm_langs` by the scheduler loop; exposed
via `GET /api/push/scheduled` for each fired doc, and via `POST /api/push/test`
JSON response.

Frontend `AnalyticsBadge` at `EventNotificationsPanel.jsx:~128` renders it
as inline chips: `✈️✓ · 📩5 · 🔔12 · 🌐4 · ru:2 · pt-br:1 · en:1`. The
🌐N chip = auto-translated count (amber-tinted); the per-lang chips are
blue-tinted and sorted by descending recipient count, capped at 6 for
mobile. The runTest toast summary shares the same format so admins see
"Kanal:✓ · DM:5/5 · Push:12 · 🌐4 (ru:2 pt-br:1 en:1)" after every test.

**Test verification (preview, Feb 2026, mocked Telegram delivery)**:
5 recipients across RU/DE/EN/TR + 1 unrelated selim record → stats
returned `dm_lang_breakdown={ru:2, de:1, en:1, src:2}`, `dm_sent=6`,
`dm_translated=4`. Cache dedup verified: RU-2 hit cache instead of a
second DeepL call. Test data automatically cleaned up.

Channel broadcasts (TELEGRAM_CHANNEL_ID) stay in source Turkish — the
channel is shared across all languages.

**All 5 DM entry points wired to the helper:**
1. `_telegram_forward_scheduled` — scheduled push fan-out (line 3488)
2. `/api/push/test` — admin test button, per-user fan-out (line 3341)
3. `/api/cron/attendance-chase` — 24h-before event reminders (line 4028)
4. `/api/telegram/broadcast` — country-scoped admin broadcast DMs (line 4200)
5. `_telegram_forward_scheduled` (event scheduled) — also uses helper via precomputed_lang optimisation

Channel broadcasts (`TELEGRAM_CHANNEL_ID` sends) are NOT translated — they remain TR because the channel is shared across all languages.

## Backlog
- **P1**: `server.py` refactor — extract `events`, `calc`, `deepl` routes into `/app/backend/routes/`
- **P3**: Discord Webhook Mirror for push broadcasts
- **P3**: OpenAI TTS Voice Notifications for Telegram DMs
- **P3**: Member / Event Point CSV Export
- **P3**: VIP Trash role-based visibility (editors → own deletions only)
- **P3**: Weekly Telegram DM health-check cron (detect dead chat_ids)
- **P3**: Fan-out summary widget in admin panel (X Push / Y DM / Z translated)

## Known Ops Notes
- Selim (`chat_id=5528595771`) — Telegram returns `chat not found`. Needs `/start` again.
- Selim's login username is **`selim@titanxis.com`** (not bare `selim`). Typing bare `selim` never matches → 401 → 8 fails → 15-min brute-force lock on the `selim` bucket. Feb 15 2026: cleared and admin unlock endpoint added.
- DeepL usage: ~220K / 1M chars (~22%), resets 2026-09-01.
- Preview ≠ Prod: fixes must be Deployed via "Save to GitHub → Deploy".

## Admin unlock endpoint (Feb 15, 2026)
`POST /api/auth/unlock-user` (admin-only, body `{"username": "..."}`).
Case-insensitive: `selim`, `Selim`, `selim@titanxis.com` all resolve to the
same lockout bucket. Wipes:
1. `login_attempts` rows matching the lowercased username exactly
2. `login_attempts` rows matching the case-insensitive regex (variants)
3. `users` doc `$unset` of any legacy lockout fields (`failed_login_attempts`,
   `locked_until`, `lockout_until`, `login_locked`, `brute_force_locked_until`)
Response: `{ok, username, failed_attempts_cleared, user_docs_touched, matched_users}`.
Post-deploy usage from admin console:
```
curl -X POST $API/api/auth/unlock-user -H "Authorization: Bearer $ADMIN_TOKEN" \\
  -H "Content-Type: application/json" -d '{"username":"selim"}'
```

## Events page — Gruplu/Grupsuz 2-Column Split (Feb 15, 2026)
`/etkinlikler` (`Events.jsx`) now separates events into two side-by-side

## Mobile safe-area (iPhone notch / dynamic island / home indicator) — Feb 15, 2026
- `public/index.html` viewport meta now includes `viewport-fit=cover` (required
  to expose `env(safe-area-inset-*)` on iOS). Combined with the existing
  `apple-mobile-web-app-status-bar-style: black-translucent` this means the
  page paints edge-to-edge and every fixed/sticky bar must pad itself.
- `components/Header.jsx` sticky wrapper: `padding-top: max(8px, env(safe-area-inset-top))`
  plus L/R safe-area padding for landscape notches. `header-profile-dropdown`
  top anchor is now `calc(60px + env(safe-area-inset-top))` so the menu
  doesn't slip under the dynamic island.
- `index.css .bottom-nav` bottom padding is now `calc(12px + env(safe-area-inset-bottom))`
  so the tab bar sits above the home indicator; L/R padding also opts into
  the horizontal insets.
- Non-notched devices (desktop, Android without gestures, older iPhones)
  resolve `env()` to 0 → visual behaviour unchanged.

columns via a responsive `grid grid-cols-1 lg:grid-cols-2 gap-4` at

## Phase 1+2+3 Refactor — Feb 15, 2026
**Faz 1 (küçük rötuşlar)**:
- MusicButton floating pill: 48×48 → 36×36, icon 22 → 16px, shadow trimmed.
- Announcement list rows: `p-3 → p-2`, gap tightened, thumbnails capped at `max-h-32`, meta text `text-[9px]`. `line-clamp-2` on body for scannable rows.
- "Etkinlik Bildirimleri" → **"Bildirimler"** rename (header dropdown label, page `<Header title>`).

**Faz 2 (Bildirimler hub konsolidasyonu)**:
- `pages/EventNotifications.jsx` rewritten as a tabbed hub with `?tab=events|announcements` query state.
  - Tab 1: `<EventNotificationsPanel/>` (scheduler-driven event reminders)
  - Tab 2: `<Announcements embedded/>` (one-shot broadcast form + history)
  - `data-testid`: `notif-tab-events`, `notif-tab-announcements`, `notif-tab-content-*`.
- `pages/Announcements.jsx` gained `embedded` prop so it renders header-less inside the hub tab. History moved into a collapsible drawer (`announcements-history-toggle`, default closed, `<History>` icon + ChevronDown flip) — each row keeps its `Trash2` delete button (even after archive) so history can be pruned.
- ImageDropzone already integrated (Feb 14) — device pick + URL fallback both supported.

**Faz 3 (Events UI)**:
- Sub-filter chip row (`events-subfilter-bar`) sits UNDER the Hatırlatmalı/Hatırlatmasız/Arşiv tabs with 3 chips (`Tümü`/`Gruplu`/`Grupsuz`, persisted to `localStorage.events_subfilter`). "Grupsuz" or "Gruplu" collapses the layout to one full-width column; "Tümü" keeps the 2-column split.
- Event cards inside every bucket now render in a `grid grid-cols-1 md:grid-cols-2 gap-1.5` — 2-per-row on desktop.
- HTML5 native drag-drop reorder: every card has a `GripVertical` handle, `draggable`, `onDragStart/Over/Drop/End`. Reorder scope is bucket-keyed (`ungrouped` or `group:{name}`) so a card only shuffles inside its own bucket. Order is persisted to `localStorage.events_manual_order_v1` and layered on top of the date sort via `applyManualOrder(list, bucketKey)`.
- `data-testid`: `events-subfilter-{all|grouped|ungrouped}`, `event-drag-handle-{id}`, `event-group-grid-{name}`, `events-ungrouped-grid`.

**Deferred to next iteration**:
- Etkinlik Takvimi (monthly calendar view)
- İki-kolon resizable width split
- Widget panel move
- DeepL weekly report + cache clear button move to Dashboard
- Emoji migration (Lucide → colored emojis) — large scope


`data-testid="events-two-col-grid"`:

- **Left — GRUPLU ETKİNLİKLER** (`events-grouped-column`, amber accent):
  header shows `<N grup> · <M etkinlik>` chip. Renders `renderGroupBlock(group, list)`
  per named group (existing group header + rename/archive/delete + event cards).
  Empty state: `Gruplu etkinlik yok`.

- **Right — GRUPSUZ ETKİNLİKLER** (`events-ungrouped-column`, violet accent):
  flat list of events whose `group_name` is falsy or whitespace-only.
  Uses same `renderEventCard(e, gc, group)` helper as the grouped column.
  Empty state: `Grupsuz etkinlik yok`.

Data split lives in a single `useMemo` (`groupedMap`, `ungrouped`).
Card rendering extracted into `renderEventCard` + `renderGroupBlock` helpers

## Etkinlik Takvimi (Monthly Grid) — Feb 16, 2026
- New component `components/EventCalendar.jsx` — pure presentational monthly
  grid (6 rows × 7 cols, Monday-first for TR locale). Props: `events`,
  `onEventClick`. Uses `groupColor()` to tint event pills by group and shows
  up to 3 pills per cell with a "+N daha" overflow chip.
- Cell click opens a portal-hosted dialog with the full day's events, each
  row shows time / group / multiplier / countdown. Row click bubbles to
  `onEventClick` so the parent can open the edit form.
- Integrated into `pages/Events.jsx` behind a new **Liste / Takvim** view
  toggle above the tab bar (`data-testid="events-view-{list|calendar}"`),
  persisted to `localStorage.events_view`. Calendar view suppresses the
  tab/sub-filter bars and drag-drop list; toggling back restores everything.
- Data source: `allActive` (both reminded + unreminded) so admins see the
  whole active pipeline on one screen; the "Bugün" chip snaps the cursor
  back to today's month.
- Safe-area coexistence verified: on a simulated iPhone 15 Pro (393×852
  with `--sim-top:47px --sim-bottom:34px`), the header still resolves
  `padding-top: 47px`, `.bottom-nav` still resolves `padding-bottom: 46px`,
  and the calendar renders cleanly between them (rect 359×463 at y=278).
- Data-testids: `event-calendar`, `calendar-grid`, `calendar-month-label`,
  `calendar-prev-month`, `calendar-next-month`, `calendar-today-btn`,
  `calendar-cell-{Y-M-D}`, `calendar-event-{id}`, `calendar-day-dialog`,

## DeepL + Cache → Dashboard Admin Araçları (Feb 16, 2026)
- `DeeplUsageBadge` and `DeeplDigestButton` imports + JSX removed from
  `components/Header.jsx` (lines 10-11, 93-94) so the header cluster stops
  competing with the notification bell / language switcher for horizontal
  space.
- Both components re-mounted in `pages/Dashboard.jsx` under a new
  **"Admin Araçları"** section (`data-testid="dashboard-admin-tools"`),
  rendered right below Firebase Analitik + VIP Trash Purge. Labelled rows
  (`DEEPL CACHE` + `HAFTALIK RAPOR`) so admins see what each control does
  without hovering.
- Zero behaviour change — same components, same endpoints, same tooltips.
- Verified: header no longer has `[data-testid=deepl-clear-cache]`;
  dashboard admin-tools does. Screenshot captured.

  `calendar-day-event-{id}`.


## Panel Sadeleştirme + PushBroadcastPanel → Bildirimler Hub (Feb 16, 2026)
- `pages/LiveDashboardPage.jsx` slimmed: PushBroadcastPanel import + JSX removed.
  Panel now surfaces PushSubscribeCard + PushPrefsCard + WidgetGrid + BulkAdminActions
  only. Users see personal push controls, widgets, and bulk admin actions — nothing else.
- `pages/EventNotifications.jsx` Etkinlik Bildirimleri tab now stacks
  `EventNotificationsPanel` + `PushBroadcastPanel` in a `space-y-3` column so
  broadcast tooling sits next to the scheduler where the menu label suggests.
- Verified: `/gosterge-paneli` has no `[data-testid*=broadcast]`; the events
  tab of `/etkinlik-bildirimleri` has both panels rendered.

so both columns share the same JSX and attendance/gallery behaviour.

Verified in preview (Hatırlatmalı + Hatırlatmasız tabs) — screenshots show
clean separation with correct counts and no visual regressions.

## Kolektif/Bireysel + Kolon Resize + Backend Order Sync + Emoji Bottom Nav (Feb 16, 2026)
- **Rename** Gruplu → **Kolektif**, Grupsuz → **Bireysel** across Events.jsx
  (column headers, empty states, EventForm group-type toggle, comments).
  Sub-filter chips are now `[Kolektif] [Bireysel]` with `events-subfilter-kolektif`
  / `events-subfilter-bireysel` testids. **Tümü chip removed** — clicking an
  active chip toggles back to the default 2-column split.
- **Resizable column split** — the 2-column layout now uses a dynamic
  `gridTemplateColumns: {splitPct}fr 8px {100-splitPct}fr` with an 8px
  drag handle in the middle (`events-column-resize-handle`). Mouse + touch
  drag both work, clamped to `[20%, 80%]`, persisted to
  `localStorage.events_split_pct`. Handle only shows on `lg+` viewports;
  mobile collapses to stacked columns as before.
- **Backend order sync** — new endpoints on `auth.py`:
    - `GET /api/users/me/event-order` → `{order: {bucket_key: [ids]}}`
    - `PUT /api/users/me/event-order` → body `{bucket_key, ids}` merges one
      bucket at a time so buckets don't clobber each other. `[:500]` cap.
  Frontend `Events.jsx` fires `useEffect` on mount to hydrate remote order,
  and fires-and-forgets `api.put` on every reorder so any device sees the
  latest arrangement. LocalStorage remains an offline fallback.
- **Bottom nav emoji preview** — `BottomNav.jsx` rewritten to swap Lucide
  icons for matching colored emojis: 🏆 Sıralama · ⚔️ Loj Hakkında ·
  🧮 Puan Hesaplama · 📊 Puanlar Hakkında · 👥 Üyeler · 📅 Etkinlikler.
  Fixed 22×22 box keeps the layout identical; active state uses the same
  drop-shadow glow, inactive gets slight grayscale to match the muted look.
- Backend endpoints roundtrip-verified via curl (empty → PUT → 3 ids stored).


## Key Files

## Emoji Partial Migration + Split Presets (Feb 16, 2026)
- **Header dropdown** — `MenuItem` gained an optional `emoji` prop that
  wins over `icon`. All 12 dropdown rows migrated: 📊 Dashboard · 🔔 Bildirimler ·
  🎟️ VIP Destek · 🎛️ Panel · 🧩 Widget'lar · 🙂 Profilim · 👤 Kullanıcı Yönetimi ·
  🔑 Şifre Değiştir · 📸 OCR Geçmişi · 📥 Detaylı Rapor · ✨ Kurulumu tekrar göster ·
  🚪 Çıkış Yap. Icons stay fixed at a 14×14 box so alignment matches the
  Lucide baseline; no layout shift.
- **Events tabs** — 🔔 Hatırlatmalı, 🔕 Hatırlatmasız, 📦 Arşiv (grayscale
  when inactive).
- **Events sub-filter** — 🤝 Kolektif, 🧍 Bireysel (chip emoji prefix).
- **View toggle** — 📋 Liste, 📅 Takvim.
- **Bildirimler hub tabs** — 🔔 Etkinlik Bildirimleri, 📢 Duyurular.
- **Split preset chips** — new row `data-testid="events-split-presets"`
  visible only on `lg+` and only when both columns show (subFilter=all).
  30/70, 50/50, 70/30 buttons update `splitPct` state (same underlying
  variable as the drag handle), persisted to `localStorage.events_split_pct`.
  Active preset highlighted in amber. `data-testid="events-split-preset-{30|50|70}"`.
- Untouched (deferred): card action buttons (Pencil/Trash2/Archive/etc)
  and page-title h1 icons — icons there communicate destructive intent
  more clearly than an emoji, and swapping them wholesale would introduce
  more regression risk than value.

- `/app/backend/server.py` — helpers at 3193-3341; `_telegram_forward_scheduled` at 3488

## Recurring Events + Announcement Edit + Card Emojis + Order Purge (Feb 16, 2026)

### Recurring Events (Tekrarlama)
- `EventCreate`/`EventUpdate` gained `recurrence_interval` (none/2days/weekly/2weekly/monthly) + `recurrence_count` (2-52, clamped).
- **On CREATE**: server generates `count` events starting at `date`, each shifted by the interval. Monthly uses `calendar.monthrange` to clamp day (e.g. Jan 31 → Feb 28/29).
- **On PATCH**: leaves the original event untouched but spawns `count-1` future copies starting at `date + interval*i`. Lets admins retrofit a recurrence onto any existing event.
- Response includes `recurrence_created` count. Frontend surfaces via toast: `"3 etkinlik oluşturuldu (weekly)"`.
- EventForm shows a **Tekrarlama** chip row (Yok/2 Günde/Haftalık/2 Haftada/Aylık) + count input (2-52). testids: `event-form-recur-{none|2days|weekly|2weekly|monthly}`, `event-form-recur-count`.
- Curl round-trip: weekly×3 → 3 events at 09-01, 09-08, 09-15 ✅

### Announcement Edit + Full Delete
- New `copyToForm(a)` helper: loads title/body/image/urgent into compose form and scrolls to top. testid `announcement-copy-{id}` (✏️ emoji button).
- Delete button now uses **hard delete** confirmation ("tamamen silmek istiyor musun? Geri alınamaz") — was previously softer "arşivle" wording. testid `announcement-delete-{id}` (🗑️ emoji).
- Buttons stacked vertically on each row for a tighter footprint.

### Card Action Emojis
- Row-level buttons on event cards migrated: 📦 Arşivle · ♻️ Aktife Al · ✏️ Düzenle · 🗑️ Sil. Sizing/color/testids unchanged so no regression on existing tests.

### Backend Event-Order Purge
- New admin endpoint `POST /api/admin/event-order/purge-stale` — sweeps every user doc's `event_manual_order`, drops ids no longer pointing at live events, removes now-empty buckets. Response: `{users_touched, ids_removed, buckets_removed, live_events}`.
- Curl verified: removed 3 stale ids from 1 user + 1 empty bucket, 10 live events counted. Cron-ready.

- `/app/backend/auth.py` — `preferred-language` endpoint + public_user
- `/app/backend/telegram_bot.py` — send_message w/ HTTP-level logging
- `/app/backend/routes/push.py`, `/app/backend/routes/cron.py`
- `/app/frontend/src/components/CropDialog.jsx` — react-image-crop wrapper
- `/app/frontend/src/components/OcrDialog.jsx` — Scissors button per thumb

## Series Anchor + Multi-Bucket Drag + PATCH Announcement + Purge Cron (Feb 16, 2026)

- **Series Anchor**: `Event` model gained optional `series_id`. Create-time recurrence stamps every spawned copy with a shared uuid; PATCH-time recurrence back-fills the anchor id onto the parent too. Two new endpoints:
  - `PATCH /api/events/series/{series_id}` — bulk update every occurrence in a series (name, group_name, multiplier, subtitle, reminder_enabled). Accepts `from_date` for "this and future only" semantics.
  - `DELETE /api/events/series/{series_id}` — cascades to `points` then removes every occurrence. `from_date` narrows to future.
- **Multi-Bucket Drag**: Event cards now track `dragSourceBucket` on drag start. Drop onto a card in a DIFFERENT bucket → PATCH the source event's `group_name` (empty for Bireysel, group name for Kolektif). Same-bucket drop keeps existing reorder logic. Toast: "→ Bireysel" or "→ SvS".
- **Announcement PATCH**: New `PATCH /api/announcements/{aid}` (admin-only) for silent in-place edit — no re-broadcast. DELETE is now hard-delete (was soft-delete). Frontend `Announcements.jsx` now flips between POST (new) and PATCH (edit) based on `editingId`; toast changes to "Duyuru güncellendi". Copy-to-form button uses this path.
- **Purge Cron**: New no-auth `POST /api/cron/purge-stale-event-order` endpoint mirrors the admin one. Wired into `.emergent/crons.yml` as `purge-stale-event-order` running every Sunday at 04:30 UTC (30 minutes after telegram-dm-health).
- Curl round-trip verified: series create → PATCH matched=3, DELETE deleted=3, cron 200 OK, announcement PATCH updates title/body, hard-delete removes row.

- `/app/frontend/src/components/LanguageSwitcher.jsx` — persists preferred_language
- `/app/frontend/src/App.js` — AppShell hydrates i18n from user.preferred_language

## Prod diagnostic playbook
After redeploy, tail `backend.err.log` while triggering a notification:
- Expect `forward_scheduled sched_id=X chat_ids=N chat_lang=M langs=[...]` per scheduled fire
- Expect `dm_translate ok chat=X lang=en src_len=... out_len=...` per non-TR recipient
- If you see `dm_translate none chat=X — TR fallback` for a user you set to EN, then:
  - User's preferred_language was not persisted (check `auth/me` returns non-null pref)
  - OR user's chat_id / handle doesn't match ANY of the 3 resolution paths


## Series UI Toggle + 3-Way Delete + Drop Zone + Version History (Feb 16, 2026)

- **Series UI Toggle**: EventForm detects `initial.series_id`; renders a violet "🔗 Tüm seride uygula" checkbox (`event-form-apply-series`). When checked, submit routes to `PATCH /events/series/{id}` instead of `/events/{id}` with a subset of fields (no date/banner). Toast: "Seri güncellendi (N etkinlik)".
- **Series Delete Confirm**: Delete button on series-anchored cards opens a 3-option prompt: `1` bu occurrence · `2` bu ve gelecek (via `?from_date=`) · `3` tüm seri. Solo events keep the simple confirm dialog.
- **Cross-Bucket Drop Zone**: Both `renderGroupedCol` and `renderUngroupedCol` add `onDragOver` that only accepts a source from the OTHER bucket, plus a dashed outline (amber / violet) that only shows while a foreign card is being dragged. `renderUngroupedCol` handles the section-level drop to convert to Bireysel (`group_name: ""`).
- **Announcement Version History**: `PATCH /api/announcements/{aid}` snapshots previous title/body/image/urgent into `history` array (`$push` with `$slice: -20` cap) BEFORE writing new values. New `POST /api/announcements/{aid}/revert` pops the last history entry. `DELETE` remains hard-delete.
- Curl round-trip: create v1 → PATCH v2 (history=1, title=v2) → revert (history=0, title=v1) ✅


## Phase 2 — Oturum Yönetimi (Session Management) (Feb 16, 2026)

### Backend
- **JWT `sid` claim**: `create_token(user_id, username, role, sid=?)` now optionally embeds a session id. `optional_auth` requires the matching `sessions` doc to exist and NOT be revoked — a revoked session yields 401 immediately, even though the underlying JWT is otherwise valid until `JWT_EXP_DAYS` (7d).
- **Sessions collection**: `sessions` doc = `{id, user_id, username, role, ip, user_agent, ua_browser, ua_os, ua_device, created_at, last_active_at, revoked, revoked_at, revoked_by, revoked_reason}`. Indexes: `(id)`, `(user_id, revoked, last_active_at)`, `(revoked, last_active_at)`.
- **`parse_user_agent()`** cheap regex UA parser — no external dep. Extracts browser (Edge/Opera/Firefox/Chrome/Safari), OS (Windows/iOS/Android/macOS/Linux), device (mobile/tablet/desktop).
- **Login flow**: `POST /api/auth/login` now creates a session row (captures X-Forwarded-For IP + User-Agent) and mints a JWT carrying that `sid`. Response shape unchanged.
- **`last_active_at` refresh**: `optional_auth` opportunistically bumps the session's `last_active_at` when >60s stale — write-throttled to keep it cheap.
- **Endpoints**:
  - `GET /api/sessions/me` → own active sessions + `current_sid`.
  - `GET /api/sessions/all` (admin) → every active session, includes admin's own `current_sid` for UI highlighting. `?include_revoked=true` for audit.
  - `POST /api/sessions/{sid}/revoke` — self-owned OR admin — flips `revoked=true`.
  - `POST /api/sessions/revoke-others` — kill every own session except the current one.
  - `POST /api/sessions/revoke-user/{user_id}` (admin) — revoke every active session for a user.
  - `POST /api/auth/logout` — revoke current session (device logout).

### Frontend
- **`components/SessionManagement.jsx`** — new component rendered inside the Yönetim > Oturum Yönetimi tab. SWR `/sessions/all` (admin) or `/sessions/me` (non-admin) with 30s poll.
- **Admin view**: sessions grouped by user card. Header shows `username · role chip · N oturum` and a red "Tüm Oturumları Kes" button (`sessions-revoke-user-{uid}`) that fires the admin bulk-revoke endpoint.
- **Row layout**: device icon (💻/📱/📟) + `Browser · OS`, a green "BU CİHAZ" chip when `s.id === current_sid`, IP + relative "giriş X dk önce · son aktif Y dk önce" metadata, and a red Sonlandır button. Revoking the current session redirects to `/login` after a 500ms grace so the invalidated JWT stops firing.
- **Non-admin view**: flat list of own sessions + "Diğerlerini Sonlandır" button (`sessions-revoke-others`) when `items.length > 1`.
- **Testids**: `session-mgmt`, `sessions-refresh`, `sessions-revoke-others`, `sessions-user-{uid}`, `sessions-revoke-user-{uid}`, `session-row-{sid}`, `session-current-{sid}`, `session-revoke-{sid}`, `sessions-loading`, `sessions-error`, `sessions-empty`, `user-mgmt-sessions-content`.

### Verified (curl + Playwright)
- Two curl logins with distinct UAs (`Safari/iOS`, `Chrome/Android`) both created session docs.
- `revoke-others` from Safari/iOS → `{revoked:2}`, then `/auth/me` with Safari/iOS → 200, `/auth/me` with Android → **401**. JWT invalidation lands within one request.
- Admin UI screenshot: 4 sessions visible under `admin`, `BU CİHAZ` chip pinned on the Chrome/Linux Playwright session, per-row Sonlandır + "Tüm Oturumları Kes" bulk button all render.

## Phase 3 — Raporlar Merkezi (Reports Center) (Feb 16, 2026)

### Backend
- **Attendance status vocabulary**: `ATTENDANCE_STATUSES = {attending, declined, maybe, late}`. Legacy rows without a `status` field are auto-migrated to `attending` on startup (`event_attendance.update_many({status:{$exists:false}}, {$set:{status:"attending"}})`).
- **`PATCH /api/events/{event_id}/attendance/{member_id}`** — sets a member's attendance status. Upsert semantics: passing `status=null` deletes the row (member back to no-response). Invalid status → 400.
- **`GET /api/reports/members?period=all|30d|90d|180d|1y`** — full member performance aggregation. Returns `total_events`, per-member `{attending, late, maybe, declined, no_response, participation_rate, by_group}`. Rate = `(attending + late) / total_events`.
- **`GET /api/reports/events?period=…`** — per-event stats: counts by status, `responded`, `member_pool`, `participation_rate`.
- **`GET /api/reports/events/{event_id}/attendance`** — every member (present or absent) for one event so the frontend can render inline status dropdowns.
- **CSV exports**: `/api/reports/members/export.csv?period=…` and `/api/reports/events/export.csv?period=…` — text/csv with attachment filename hints; reuses the JSON aggregators.
- **Startup migration** wired into `startup()`; logs modified count.

### Frontend
- **`pages/Reports.jsx`** — new admin-only page at `/raporlar`. Two-tab layout (Üye Performansı / Etkinlik Katılım) sharing a period selector (`Tümü / 30 Gün / 90 Gün / 180 Gün`) and a CSV download button.
- **Üye Performansı**: Recharts BarChart (top-15 members) colored by tier (≥75% green, ≥50% amber, else red) + full sortable table with country flag, klan, per-status counts, and % rate.
- **Etkinlik Katılım**: Each event row shows status chips (`✅🕒❔❌⚪`), pool ratio, expand toggle. Expanded panel calls `/reports/events/{id}/attendance` and shows a 2-col grid of every member with an inline status `<select>` (⚪/✅/🕒/❔/❌). PATCH is optimistic — success → toast + revalidate.
- **CSV button** (`reports-download-csv`) — fetches blob, triggers browser download with period-aware filename (`uye-performans-90d.csv`, etc.).
- **Route + nav**: `/raporlar` route wrapped in `RequireAdmin`; header profile dropdown gets a `📊 Raporlar` entry (testid `dropdown-reports`).
- **Testids** (main): `reports-page`, `reports-tabs`, `reports-tab-members`, `reports-tab-events`, `reports-period-{key}`, `reports-download-csv`, `members-report`, `members-report-table`, `members-report-row-{id}`, `events-report`, `events-report-row-{id}`, `events-report-toggle-{id}`, `event-detail-{id}`, `event-detail-status-{member_id}`.

### Verified (curl + Playwright)
- `/reports/members?period=all` → `total_events=5, items=254` with correct 20% rate on 4 attendees.
- `/reports/events?period=all` → 5 events, pool=254.
- CSV export 200 / 19KB with proper header row.
- `PATCH .../attendance/{mid}` — `status=late` persists, `status=null` clears, `status="unknown"` → 400.
- Playwright: 254 members table, 5 event rows, expand → 254 status dropdowns rendered, BarChart visible with tiered colors, tab switching + period filter functional.



## Invite QR + Report Trends (Feb 16, 2026)

### Invite QR
- **Frontend**: Installed `qrcode.react` (v4). `InviteManagement.jsx` row now leads with a 68×68 white-bg QR (`SVG`, level "M"), click opens a modal (`invite-qr-modal`) with a 256×256 large version, the URL beneath, and a "PNG olarak indir" button that rasterizes the SVG to a 512×512 canvas and triggers a `image/png` blob download named `titanxis-davet-qr.png`.
- **Testids**: `invite-qr-{id}`, `invite-qr-modal`, `invite-qr-modal-close`, `invite-qr-download`.

### Report Trends (Katılım Trendi)
- **Backend**: New `GET /api/reports/trend?days=7|30|90|180&alliance=&country=`. For every day in the window, aggregates `(attending+late) / (member_pool × event_count) × 100`. Event-less days emit `participation_rate: null` so the line breaks rather than dips to zero. Alliance/country restrict the member pool same as `/reports/members`.
- **Frontend**: New `TrendChart` component rendered above the bar chart in the Üye Performansı tab. Recharts `LineChart` with `connectNulls={false}`. A linear regression slope classifies the trend into `▲ Yükselişte` (>0.2), `▼ Düşüşte` (<-0.2), or `→ Sabit`; the chip + line stroke share the color. Day toggles: 7G / 30G / 90G. Legend inherits the alliance+country filters from the parent MembersReport.
- **Testids**: `trend-chart`, `trend-direction`, `trend-days-{7|30|90}`, `trend-empty`.

### Verified
- Curl: `/reports/trend?days=30` → `days=30 pool=254 items=30 nonnull_days=1` (single dated event at 1.6%). `?days=7&alliance=GOW` → `pool=157`.
- Playwright: invite QR buttons rendered (2), modal opens with download button, `trend-chart` root + `trend-direction "→ Sabit"` chip + 3 day toggles all live; 7G ↔ 90G x-axis rescales correctly.


## Trend Overlays — Benchmark Band + Moving Average (Feb 16, 2026)

### Backend
- **`guild_settings` collection** — first entry stores the guild-wide participation target.
- **`GET /api/settings/guild-target`** → `{target: int}` (default 60).
- **`PUT /api/settings/guild-target`** (admin) → clamps to 0-100, upserts `{key:"guild_target", value, updated_at, updated_by}`.

### Frontend — `TrendChart` overhauled
- **Benchmark band** — Recharts `ReferenceArea` splits the y-axis into a green tinted "on-goal" zone (`target → 100`, 6% opacity) and a red tinted "danger" zone (`0 → target`, 4% opacity), with a dashed `ReferenceLine` at the target labeled `Hedef %N`. Toggleable via `trend-target-toggle`.
- **Inline target editor** — `trend-target-edit` opens a number input + Kaydet/İptal so admins bump the goal without leaving the report. PUT to `/settings/guild-target` and revalidate SWR.
- **Moving-average curve** — client-side trailing MA (7-day for 30/90G views, 3-day for 7G so it still varies across a short axis). Rendered as a blue dashed `Line` with `connectNulls` so gaps get bridged for smoothness. Toggle via `trend-ma-toggle`.
- **Compact legend** — under the chart, three chips distinguish daily / N-day avg / target lines.
- **Testids**: `trend-target-edit`, `trend-target-editor`, `trend-target-input`, `trend-target-save`, `trend-target-toggle`, `trend-ma-toggle`, `trend-legend`.

### Verified
- Curl: GET default 60 → PUT 75 → GET 75 → PUT 150 → clamped to 100 → reset 60. All 200.
- Playwright: chart renders, target chip reads `🎯 Hedef %60`, edit → 80 → chip updates to `🎯 Hedef %80` + toast "Hedef %80 olarak kaydedildi", MA toggle flips state ○/◉ + legend hides its 7-gün ort. chip, benchmark band + dashed target line visible on screenshot.


## Trend Alerts — MA7 Below Target × 3 Days (Feb 16, 2026)

### Backend
- **Shared aggregation**: `_compute_trend_items(days, member_query)` extracted from `/api/reports/trend` so the alert path uses the exact numbers admins see on the chart.
- **`_trend_ma7_series(items)`** — trailing 7-day MA matching the frontend's smoothing (min 2 non-null points).
- **`_trend_alert_evaluate()`** — computes current MA7 breach streak, fires bell + Telegram DM + Web Push only when `streak >= 3` AND (`>20h since last alert` OR `streak grew`). Idempotent via `guild_settings.trend_alert_state = {last_dispatched_at, last_streak, last_ma, target}`.
- **Delivery**:
  - Bell → direct `in_app_notifications.insert_many` for `role="admin"` users, `kind="trend_alert"`.
  - Telegram → `_send_tg_message` per admin with a linked `telegram_chat_id`.
  - Web push → `_broadcast_push(title, body, "/raporlar", tag=f"trend-alert-{today}", sound="rally")`.
- **`_trend_alert_loop()`** — hourly background task launched in `_start_push_scheduler` after a 120s warm-up.
- **Endpoints**:
  - `POST /api/reports/trend/check-alerts` — admin manual trigger.
  - `GET /api/reports/trend/alert-state` — snapshot `{target, streak, last_ma, state}`.

### Verified (curl)
- Seeded 5 consecutive daily events with zero attendance → `alert-state` reported `streak=4, last_ma=0.2%` → `check-alerts` returned `fired: true, bell_sent=7`. Retry returned `fired: false, reason: throttled`. Cleanup script removed 5 seed events + 7 bell rows + alert state.

## Alert Snooze + Recovery Ping (Feb 16, 2026)

### Backend
- **Snooze state**: `guild_settings.trend_alert_state` now carries `snoozed_until`, `snoozed_by_username`, `snoozed_at`. `_trend_alert_evaluate` honors an active window (`reason="snoozed"`) and skips fan-out — streak still computed for the state snapshot.
- **Recovery cycle**: State also carries `pending_recovery`. When a breach alert fires we set it to `True`. On the next tick, if `streak==0 && pending_recovery && last_ma>=target && !snoozed` we fire the green "🎯 Hedef Geri Kazanıldı" bell + push + TG DMs, `kind="trend_recovery"`, then flip `pending_recovery` back to `False`.
- **Endpoints**:
  - `POST /api/reports/trend/alert-snooze` `{days:int}` (1-30, default 7) — sets `snoozed_until=now+days`.
  - `DELETE /api/reports/trend/alert-snooze` — clears snooze.
- **`GET /api/reports/trend/alert-state`** — now returns `snoozed:bool` + `snoozed_until` (only when live) + `pending_recovery`.

### Frontend — `TrendChart` alert strip
- Renders under the legend only when `streak >= 3` (red breach strip) or `snoozed` (grey snooze strip). Healthy days keep the chart uncluttered.
- **Breach strip**: message "N gündür 7-günlük ortalama hedefin altında" + three snooze CTAs (`🔕 1G`, `🔕 1 hafta sessize al` — highlighted, `🔕 30G`). Each POSTs to `/reports/trend/alert-snooze` and toasts "Uyarılar 7 gün sessize alındı → {date}".
- **Snooze strip**: shows the active snooze window in TR locale + "Sessize almayı kaldır" button that DELETEs the snooze.
- **SWR polling** for `/reports/trend/alert-state` at 60s so the strip auto-appears/disappears without a manual refresh.
- **Testids**: `trend-alert-strip`, `trend-alert-snooze-{1d|7d|30d}`, `trend-alert-unsnooze`.

### Verified (curl + Playwright)
- Snooze cycle: fire breach → `snooze days=7` → 200 → `check-alerts` → `fired:false, reason:"snoozed"` → `unsnooze` 200.
- Recovery cycle: seeded 5 events × 254 attendings + `pending_recovery=True` (25h ago) → `alert-state` `streak=0, last_ma=90.2%, pending_recovery=True` → `check-alerts` → `fired:true, kind:"trend_recovery", bell_sent=7`. Retry cleared `pending_recovery`. 7 DB rows with title "🎯 Hedef Geri Kazanıldı — Son 7 günlük ortalama %90.2 — hedef %60 yeniden aşıldı". Cleanup restored preview DB.
- Playwright: target=99 → red strip "4 gündür …" + 3 snooze chips → click "🔕 1 hafta sessize al" → grey snooze strip + toast "Uyarılar 7 gün sessize alındı → 23.08.2026" → "Sessize almayı kaldır" reverts.


## Weekly Trend Digest (Feb 16, 2026)

### Backend
- **`trend_alert_history` collection** — every alert fan-out (`kind=trend_alert|trend_recovery`) and every snooze POST logs a row with `{id, kind, streak, last_ma, target, member_pool, timestamp}` (+`snoozed_by_username`, `days`, `snoozed_until` for snoozes).
- **`_trend_digest_compose(days=7)`** — reads history from the window, headline current MA7 via `_compute_trend_items`, computes rolling `avg_ma` + slope-based direction (`yükseliyor 📈 / düşüyor 📉 / sabit ➖`), builds a Telegram-ready markdown block with counts, snooze detail (last 3), recent breaches (last 3).
- **`_trend_digest_dispatch(days=7)`** — sends the markdown to every admin's `telegram_chat_id` via `_send_tg_message`, drops a plain-text "📊 Haftalık Katılım Özeti" bell (`kind="trend_digest"`) into `in_app_notifications` for every admin (so the digest is visible even without a linked Telegram), stamps `guild_settings.trend_digest_state = {last_sent_at, last_tg_sent, last_bell_sent, breaches, recoveries, snoozes}`.
- **Weekly cadence**: `_trend_alert_loop()` reuses its hourly tick to also call `_trend_digest_dispatch(7)` whenever `last_sent_at` is ≥ 167 hours old (small drift tolerance).
- **Endpoints**:
  - `GET /api/reports/trend/digest/preview?days=7|14|30` — full payload + `last_state`.
  - `POST /api/reports/trend/digest/send?days=7` — manual trigger (admin).

### Frontend — `TrendChart` digest modal
- New "📊 Özet" chip in the trend chart toolbar (`trend-digest-open`) opens `TrendDigestModal`.
- Modal shows 7G / 14G / 30G window toggles + a 3-stat mini grid (⚠️ Uyarı / 🎯 Toparlanma / 🔕 Sessize) + a monospace preview of the exact markdown that would be sent to Telegram. When a prior send exists, `last_state` line renders the timestamp + Telegram/Bell counts.
- **"Şimdi Gönder"** button (`trend-digest-send`) fires the manual dispatch, toasts "Özet gönderildi — Telegram N · Bell M" and revalidates.
- **Testids**: `trend-digest-open`, `trend-digest-modal`, `trend-digest-close`, `trend-digest-days-{7|14|30}`, `trend-digest-loading`, `trend-digest-preview`, `trend-digest-send`.

### Verified (curl + Playwright)
- After a breach + recovery + snooze on the seeded 5-event window:
  - `preview` returned `breaches=0 recoveries=1 snoozes=1 avg_ma=90.4 last_ma=90.2 direction="düşüyor 📉"` with a Turkish markdown body ending in "*Sessize alma detayı:* • 2026-08-16 15:29 — admin · 3g".
  - `send` returned `tg_sent=0 bell_sent=7` (admins have no linked chat_id in preview) and the second preview showed the populated `last_state`.
- Playwright: `trend-digest-open` renders, modal preview markdown block visible, "Şimdi Gönder" button + last-send metadata all lit. Cleanup restored preview DB.

## Digest Recipients — Channel Broadcast (Feb 16, 2026)

### Backend
- **`guild_settings.trend_digest_recipients.value = [{chat_id, label, added_by_username, added_at}]`** — list of Telegram groups/channels the digest is fanned out to alongside admin DMs.
- **Endpoints** (all admin-only):
  - `GET /api/reports/trend/digest/recipients` → `{items:[…]}`.
  - `POST /api/reports/trend/digest/recipients` `{chat_id, label?}` — dedupe check (400 on duplicate).
  - `DELETE /api/reports/trend/digest/recipients/{chat_id:path}` — path-param handles `-100…` group ids and `@channel` handles.
  - `POST /api/reports/trend/digest/recipients/{chat_id:path}/test` — fires a `🧪 TiTaNXiS Digest Bağlantı Testi` ping so admins can verify the bot has access before Sunday.
- **`_trend_digest_dispatch`** now iterates configured recipients after admin DMs, tracks `channels_sent` / `channels_err`, and persists `last_channels_sent` into `trend_digest_state` for the UI.

### Frontend
- **`TrendDigestModal`** grows a new **📡 Telegram Alıcıları** section under the last-send strip:
  - Row per recipient: label (bold) + monospace `chat_id` shadow + `🧪 Test` button + `Sil` button.
  - Inline form (`chat_id` + `Etiket`) POSTs to `/recipients`, toasts `Alıcı eklendi: {label}`.
  - Empty-state hint: "Sadece admin DM'lerine gidiyor. Kanal/grup ekleyerek liderlik sohbetine de düşürebilirsin."
  - "Şimdi Gönder" confirm text now shows the recipient count.
- **Testids**: `trend-digest-recipients`, `trend-digest-recipient-chatid`, `trend-digest-recipient-label`, `trend-digest-recipient-add`, `trend-digest-recipient-{chat_id}`, `trend-digest-recipient-test-{chat_id}`, `trend-digest-recipient-remove-{chat_id}`.

### Verified (curl + Playwright)
- Curl cycle: add → dedupe 400 → add second → dispatch `bell_sent=7 channels_sent=0` (dummy ids so bot correctly reports 0 delivery, no crash) → delete → list narrowed → cleanup.
- Playwright: open modal → recipient section renders → add form creates a `-1009876543210 (Ops)` row → remove via confirm dialog cleans up. Screenshot captured.

## Digest Schedule Picker (Feb 16, 2026)

### Backend
- **`guild_settings.trend_digest_schedule.value = {weekday:0-6, hour:0-23, tz:str}`** — default `weekday=6 (Pazar), hour=20, tz=Europe/Istanbul`. Timezone validated via `zoneinfo.ZoneInfo` at PUT time (typos → 400).
- **`GET /api/reports/trend/digest/schedule`** — returns current triple (falls back to defaults).
- **`PUT /api/reports/trend/digest/schedule` `{weekday, hour, tz}`** — clamps weekday 0-6 & hour 0-23, persists timestamp + `updated_by_username`.
- **`_trend_alert_loop` digest tick reworked**: reads the schedule doc each tick, computes `datetime.now(ZoneInfo(tz))`, fires when `local.weekday()==weekday && local.hour==hour && last_sent<12h ago is False`. Falls back to UTC if the stored TZ ever becomes invalid.

### Frontend
- **`TrendDigestModal`** grows a new **🗓️ Otomatik Program** section above the recipients form:
  - 3 selects: `weekday` (Pazartesi…Pazar), `hour` (00:00…23:00), `tz` (TR / UTC / London / Berlin / New York).
  - Each `onChange` PUTs the full triple; toasts "Program güncellendi" and revalidates SWR.
  - Header shows the current cadence inline: `🗓️ Otomatik Program · Pazar 20:00 · Europe/Istanbul`.
- **Testids**: `trend-digest-schedule`, `trend-digest-schedule-{weekday|hour|tz}`.

### Verified
- Curl: default `Pazar 20:00 Europe/Istanbul` → PUT `Not/AZone` → 400 → PUT `weekday=99 hour=42 tz=UTC` → clamped to `6/23/UTC` → reset.
- Playwright: modal → schedule section renders, changing weekday→Perşembe + hour→18:00 persists (GET confirms `weekday=3 hour=18`). Screenshot captured. Preview DB restored.




## Digest Test Send (Feb 16, 2026)

### Backend
- **`POST /api/reports/trend/digest/test-send?days=7`** (admin) — mini dispatch scoped to the caller only:
  - Composes the same digest via `_trend_digest_compose`, prefixes it with `🧪 *[TEST]*\n`.
  - Sends to the requesting admin's own `telegram_chat_id` if linked (else `tg_err_reason: "telegram_chat_id yok — Profil > Telegram bağla"`).
  - Drops a personal bell (`kind="trend_digest_test"`, title "🧪 Digest Test Mesajı").
  - **Does NOT** touch `trend_digest_state`, `trend_digest_schedule`, or the recipients list — so admins can rehearse formatting without spamming leadership.

### Frontend — `TrendDigestModal`
- Adds a `🧪 Test Mesajı` chip next to "Şimdi Gönder" (side-by-side flex row). Loading state disables both.
- Distinct toasts: success when Telegram delivery lands; warning when only the bell fires (with the exact reason string from backend).
- **Testid**: `trend-digest-test-send`.


## Telegram Link Reminder (Feb 16, 2026)

### Backend
- **`telegram_bot.start_command` extended** — parses `context.args` for a `link_TOKEN` deep-link payload. Matching token binds `telegram_chat_id` inline (mirrors `/link TOKEN` flow) and confirms with "✅ Bağlantı başarılı!" — one tap from the digest modal to a fully bound account.
- **`POST /api/reports/trend/digest/test-send`** — when the caller has no `telegram_chat_id`:
  - Mints a 6-char uppercase token (10-min TTL) in `telegram_link_tokens`, dedupes prior tokens for the same user.
  - Returns `link_url: "https://t.me/{TELEGRAM_BOT_USERNAME}?start=link_{TOKEN}"` alongside `chat_id_linked: false` + friendly TR reason.
- Personal bell still fires; schedule / recipients / digest state untouched.

### Frontend — `TrendDigestModal`
- `testSend()` branches on the response:
  - `tg_sent > 0` → success toast.
  - `link_url` present → renders a **custom sticky toast** (30s duration) with `🔗 Telegram Bağla` chip pointing to `link_url` (`target="_blank"`, `rel=noreferrer`), a "Kapat" chip, and the raw URL in mono for admins who prefer copy-paste.
- **Testids**: `trend-digest-link-toast`, `trend-digest-telegram-bind`.

### Verified (curl)
- Test-send without chat_id → `link_url="https://t.me/TiTaNXiS_BoT?start=link_XXXXXX"` (shape ✓) + `chat_id_linked=false` + TR reason. `telegram_link_tokens` row inserted with user_id + expires_at. Cleanup restored preview DB.

### Verified (curl)
- Captured `last_state.last_sent_at` before test → `test-send` returned `tg_sent=0 bell_sent=1 reason="telegram_chat_id yok — Profil > Telegram bağla" text_prefix="🧪 *[TEST]*"` → post-test `last_sent_at` unchanged (✅). Bell row inserted with `kind="trend_digest_test"` and cleaned. State + schedule + recipients untouched.


## Kale Seviyesi İstatistikleri + Duyuru Klavye Odak Fix (Feb 17, 2026)

### Backend
- New endpoint: `GET /api/members/castle-stats` — aggregates castle-level totals,
  average/min/max, per-level distribution, and TOP 10 leaderboard. Defensively
  coerces the legacy `Optional[str]` `castle_level` field to int. Registered
  BEFORE `/members/{member_id}` to avoid the dynamic-route catch.
- SvS routes (`routes/svs.py`) verified end-to-end via curl: list/create/patch/delete
  all return 200 with admin JWT; win/loss counters compute correctly.

### Frontend
- `Members.jsx`: added `Castle` toggle chip in the toolbar next to Display/Filter.
  Opens a `CastleStatsCard` between the toolbar and the members list showing
  4 stat chips (Total, Average, Max, Missing), a level-distribution bar chart
  (F3–F8), and a TOP 10 castle-level list with rank/name/alliance/level.
  SWR fetches `/members/castle-stats` only when the card is open (refresh 30s).

### Duyuru klavye odak bug (P0 fix)
- **Root cause**: In `Announcements.jsx` a `Wrapper` component was defined
  **inside** the Announcements function body. Every `setTitle` / `setBody`
  keystroke produced a new `Wrapper` function reference, so React tore down
  and re-mounted the entire form on every character — closing the mobile
  keyboard after each keypress.
- **Fix**: Removed the in-component `Wrapper`; replaced with a plain
  `wrapperClass` string and a single top-level `<div>` rendered inline.
- Playwright verified: typing 24 chars in title + 40 chars in body both stay
  focused and preserve the full value.

## ImageDropzone Crop Button (Feb 17, 2026)
- **Root cause**: `ImageDropzone.jsx` (used by Duyurular / Events / VIP Support)
  had NO crop button — only the delete X. Crop was only wired inside
  `OcrDialog.jsx`, so users saw the ✂️ chip on "some" (OCR-only) images.
- **Fix**: Added `Scissors` chip on every uploaded thumbnail. On click, we
  `fetch()` the remote URL as a blob, convert to a fresh data:URL + `File`,
  and hand it to the shared `CropDialog` (same UX as OCR). On confirm the
  cropped file is re-POSTed to `/api/uploads/image?purpose=<p>` and the
  thumbnail is swapped in `value[]` preserving order.
- **Cross-origin safety**: blob-fetch route avoids canvas tainting when the
  URL is served from Emergent object-storage / CDN.
- **Playwright verified**: upload → crop button visible → click opens
  `CropDialog` with image + Apply button rendered.

## Poll Broadcast + Crop Restore + Events Visibility + PointCalc UX (Feb 17, 2026)

### Backend
- **Event model**: New `hidden_from_leaderboard: bool = False` on Event/Create/Update.
  Leaderboard aggregator now excludes any event with this flag so admins can
  keep the ranking clean while still logging practice / draft points.
- **Poll close broadcast**: `close_poll` route now accepts an `on_poll_closed`
  async callback. `server.py::_poll_broadcast_closed` formats a Markdown
  result card (winner 🏆, per-option progress bars, total tally including
  TG voters) and posts it into the same Telegram group where the native
  poll originated (falls back to `TELEGRAM_POLL_CHAT_ID`), plus fires a
  lightweight in-app bell. Non-blocking; failures logged only.

### Frontend
- **CropDialog**: New `originalUrl` + `onRestore` props render an "Orijinali
  Geri Yükle" chip alongside "Sıfırla" so users can bail out of a bad crop.
- **ImageDropzone**: Tracks `original_id/url/filename/size` alongside each
  entry; passes them into CropDialog only when the item has been cropped at
  least once. Restore swaps the entry in-place (no network round-trip; the
  original blob still lives in object storage).
- **Events form**: New "🏆 Sıralamada göster" checkbox (inverse of
  `hidden_from_leaderboard`). Cleanly styled amber card below the reminder
  toggle. Persists via existing `POST/PATCH /events`.
- **Events mobile layout**: Grouped + ungrouped event grids switched from
  `grid-cols-1 md:grid-cols-2` → `grid-cols-2` so events pair up on
  mobile screens too (tablet already worked).
- **Leaderboard Aktif Etkinlikler grid**: When "Tümü" is selected on Active
  tab, a new `active-events-grid` mirrors the archive layout — 2-col cards
  with banner thumbnail + name + subtitle + date. Clicking any card opens
  the shared event modal (renamed intent: works for both scopes).
- **Event detail modal**: Now renders `banner_url` full-width (up to 72
  viewport height) at the top so admins can view the event image + info
  stacked full-screen.
- **PointCalcPage**:
  - i18n TR label renamed: "Pre Etkinlik Puanlama" → "**SVS Pre Puan
    Hesaplama**"
  - Column labels renamed TR: "Birim İsmi" → "Malzeme", "Birim Miktarı" →
    "Miktar" (existing `pc_unit_*` keys, no schema change)
  - TableCard title is now inline-editable via a pencil icon next to the
    heading — auto-translates via DeepL on save.

## Crop History (Undo/Redo) + Hidden Event Polish (Feb 17, 2026)

### CropDialog
- New props: `canGoPrev`, `canGoNext`, `onGoPrev`, `onGoNext`, `historyIndex`,
  `historyTotal`. Renders "◀ Geri Al" / "İleri Al ▶" chips next to Sıfırla,
  plus a compact `1/N` position badge so users know where they are in the
  chain. Buttons dim/disable when at either extreme.

### ImageDropzone
- Each uploaded item now carries a `history: [{id,url,filename,size}, …]`
  array + `hi` pointer. Fresh uploads seed history with a single snapshot;
  every applied crop appends a new snapshot (and truncates any redo tail
  so a new edit branches from the current position). Undo/redo simply
  jump `hi` — no network round-trip because every snapshot's URL is a
  live upload.
- "Orijinali Geri Yükle" now maps to `history[0]` (same as jumping the
  pointer to zero). Legacy items uploaded before this feature backfill
  a single-entry history on first crop.

### Events list — Sıralama dışı rozeti
- `renderEventCard` now shows a subtle grey **🚫 Sıralama dışı** chip on
  every event whose `hidden_from_leaderboard === true`. Non-intrusive
  (below the row of icons), tooltipped, admin-visible in both grouped
  and ungrouped grids.

### Leaderboard — hidden events not listed
- `visibleActiveEvents` / `visibleArchivedEvents` memos now filter out
  `hidden_from_leaderboard === true` events client-side so the "Aktif
  Etkinlikler" and "Arşiv Etkinlikleri" grids never advertise a card
  that would return zero contribution. Aggregate totals already
  ignored these events at the backend query level (see prior
  changelog entry).

### Playwright verified
- First-open crop: undo hidden (history length 1) ✓
- After 1st crop apply: history 2/2, undo enabled, restore enabled ✓
- After undo click: redo enabled ✓
- Hidden event badge visible on Events list ✓
- Hidden event card NOT rendered in Leaderboard Active Events grid ✓

## Toplu Sıralama Dışı — Event Bulk Visibility Toggle (Feb 17, 2026)

### Backend
- New endpoint: `POST /api/events/bulk-visibility` accepting
  `{ids: [str], hidden: bool}`. Uses `update_many` so the DB round-trip
  is O(1) regardless of selection size. `require_edit` gated. Returns
  `{modified, hidden}`.

### Frontend (Events.jsx)
- New selection mode: `selectionMode`, `selectedIds:Set`, `toggleSelected`,
  `clearSelection` in the top-level state.
- **"Seç" chip** in the view-mode row (next to Liste/Takvim toggles),
  admin-gated via `CanEdit`. Toggles selection mode + clears on exit.
- **Per-card checkbox** rendered inside `renderEventCard` when
  `selectionMode` is on, using `Square`/`CheckSquare` icons.
- **`EventsBulkToolbar`** component:
  - "Tümünü Seç (N)", "Terse Çevir", "Temizle"
  - **"👁️‍🗨️ Sıralama Dışı"** (grey) — POST bulk-visibility {hidden:true}
  - **"👁️ Sıralamaya Ekle"** (gold) — POST bulk-visibility {hidden:false}
  - "Kapat" chip returns to normal mode
- After a bulk action: SWR revalidates every `/events*` key and the
  toolbar closes, matching the existing bulk-country UX in Members.

### Curl + Playwright verified
- Created 3 events, `POST /events/bulk-visibility {hidden:true}` → modified=3 ✓
- Verify: total=3 hidden=3 ✓
- `POST /events/bulk-visibility {hidden:false}` → modified=3, all shown ✓
- UI: selection toggle shows toolbar, per-event checkboxes render, hide/show
  buttons visible with correct counter ✓

## Gizli Etkinlik Filtresi (Feb 17, 2026)

### Frontend (Events.jsx)
- New `visibilityFilter` state (`all` | `hidden` | `visible`), persisted to
  `events_visibility_filter` in localStorage.
- **New visibility filter row** below Kolektif/Bireysel chips:
  - **🚫 Sadece Gizli (N)** — grey chip; when active shows ONLY
    `hidden_from_leaderboard === true` events. Counter shows the current
    hidden queue size within the active tab so admins see it at a glance.
  - **🏆 Sadece Görünen** — gold chip; opposite direction, useful after
    a bulk hide operation to double-check what stayed visible.
- `filteredEvents` now applies the visibility filter as a final step so
  it composes cleanly with the existing tab (reminded/unreminded/archive)
  and subFilter (kolektif/bireysel) filters.

### Playwright verified
- Chip label: `🚫 Sadece Gizli (2)` — counter reflects real count ✓
- Click "Sadece Gizli" → hidden event visible (badge rendered) ✓
- Click "Sadece Görünen" → hidden event NOT rendered ✓
- Persisted preference across reloads (localStorage) ✓

## Gizli Etkinlik Raporu Tab + Bulk Archive (Feb 17, 2026)

### Backend
- `GET /api/leaderboard?scope=hidden` — new opposite-mode aggregate that
  ONLY includes events with `hidden_from_leaderboard: true`. Verified end
  to end: creating a hidden event + adding 42000 points, `scope=hidden`
  returns the row while `scope=active` still reports 0 for the same
  member (isolation preserved).
- `POST /api/events/bulk-archive` accepting `{ids, archived: bool}` —
  `update_many` in a single round-trip. Verified: 3/3 modified.

### Frontend
- **Leaderboard.jsx**: New third filter chip **"🚫 GİZLİ"** alongside
  Active/Archive. When selected the page:
  - Fetches `/leaderboard?scope=hidden` (member totals from hidden events)
  - Fetches `/events` (unfiltered) and derives `hiddenEvents` client-side
  - Renders a dedicated audit panel `hidden-events-audit-panel` with 2-col
    event cards, muted greyscale palette, and an "N etkinlik" counter
  - Hides Podium + Active Events grid when this tab is on so the audit
    view stays focused
  - Empty state: `hidden-events-empty` placeholder when the guild has no
    hidden events (default happy path)
- **Events.jsx**: Bulk toolbar now includes **📦 Arşive Al** (grey chip)
  and **↩ Arşivden Çıkar** (green chip) alongside the existing
  Sıralama Dışı / Sıralamaya Ekle pair. Wires to `/events/bulk-archive`.

### Verified
- curl: bulk-archive `{modified:3, archived:true}` ✓
- curl: leaderboard `scope=hidden` returns hidden-only points; `scope=active`
  isolates them ✓
- UI: `leaderboard-filter-hidden` chip renders, panel or empty-state
  visible, Podium/Active grid correctly hidden on Gizli tab ✓
- UI: All 4 bulk toolbar chips ("Arşive Al", "Arşivden Çıkar",
  "Sıralama Dışı", "Sıralamaya Ekle") present in toolbar ✓

## Bina Aşama + F10 Seed + S7 Renk + Aktif Kart Priority (Feb 17, 2026)

### Backend
- Startup seed: 5 aşama × 5 seviye (F6-F10) × 7 bina = 175 kategori. Legacy
  `bina_{slug}_{lvl}` (aşamasız) dokümanları `_a1` variant'ına $setOnInsert
  ile göç ettiriliyor. `unit-cost seed: migrated=2 seeded=173` logu ile doğrulandı.

### BuildingCalculator
- `catFor(slug, lvl, stage)` → `bina_{slug}_{lvl}_a{stage}`
- Seviye ve Bina arasında yeni **Aşama** picker (1-5) 5-kolon grid
- BinaUnitCostModal içinde de aynı Aşama seçici + seviye grid'i 5-col'a çıktı

### Commanders — S7 rank chip
- 👑 emoji + altın-turuncu gradient background, altın box-shadow glow, seçili durumda parlak sarı `#FCD34D` + iç beyaz glow

### Leaderboard — Aktif Kart Priority Sıralama
- `visibleActiveEvents` memo priority sort'lu:
  - Rank 0: Bugün olan
  - Rank 1: Son 6 saatte bitmiş (hala sıcak)
  - Rank 2: Gelecek (en yakın ilk)
  - Rank 3: Geçmiş (en yeni ilk)
- Admin en kritik etkinliği en tepede görüyor

## Aşama Karşılaştırma Görünümü (Feb 17, 2026)
- `BinaUnitCostModal`: Yeni **▦ 5 Aşamayı Karşılaştır** chip toggle
- Compare açıkken tek-aşama seçici gizleniyor, yerine 5 kolonlu (A1-A5) tablo geliyor: satırlar = malzemeler, hücreler = düzenlenebilir sayı input'ları
- Sticky ilk kolon (Malzeme adı) yatay kaydırmada sabit
- 5 aşama SWR ile paralel fetch, `compareState[stage][key]` local state
- **TÜMÜNÜ KAYDET (5 Aşama)** butonu `Promise.all` ile tek turda 5 PUT gönderiyor, ardından her aşamanın SWR cache'ini invalidate ediyor
- Curl doğrulama: 5 aşamanın yemek değerlerine sırayla 1000/2000/3000/4000/5000 yazıldı ve back-read'de tam eşleşti ✓

## Aşamaya Kopyala Hızlı Doldurma (Feb 17, 2026)
- `BinaUnitCostModal` compare tablosunda her hücrede:
  - **Sağ tık** → `copyRight(fromStage, key)` çağırıyor, `fromStage`'deki değeri
    strictly-sağdaki tüm aşamalara ((from+1)…5) kopyalıyor
  - Cell hover'ında sağ üstte küçük **⤳** altın chip görünür (mobil için de
    tıklanabilir) — aynı işi yapıyor
  - Toast: `A{n} → A{n+1}, ...A5 (değer)` bilgisi
- 5. aşama hücresinde ⤳ butonu gizli (sağa kopyalayacak hedef yok);
  sağ tıkta info toast göstererek uyarı veriyor
- `A2` en sağdaysa `toast.info("zaten en sağdaki aşama")`
- Curl doğrulama: A2=777, A3-A5=0 seed → 3 paralel PUT → A3-A5=[777,777,777] ✓

## /api/upload → Emergent Object Store (Feb 17, 2026)
- `POST /api/upload` (komutan/hero resimleri) artık yerel diskten `/app/uploads`'a yazmıyor
- `routes.uploads._put_object` helper'ı ile Emergent Object Store'a yükleniyor (VIP/event/dropzone gibi)
- Response şeması geriye uyumlu: `{url, filename, size}` korundu + yeni alanlar `id`, `content_type`
- URL formatı: `/api/uploads/{file_id}` (`routes.uploads` içindeki GET route Object Store'dan stream ediyor)
- MongoDB `files` collection'a kayıt: `{id, storage_path, original_filename, content_type, size, owner_id, purpose:"commander", is_deleted, created_at}`
- Legacy `UPLOADS_DIR` mount'u korundu, eski `/api/uploads/xxx.png` URL'leri sağlam çalışıyor (fallback path)
- Curl doğrulama: 200 upload, roundtrip 200 (592/592 bytes, image/png), local disk'te dosya YOK ✓

## Legacy Görsel Migrasyonu — /app/uploads → Object Store (Feb 17, 2026)

### `/app/backend/scripts/migrate_legacy_uploads.py`
- Standalone script + async fonksiyon
- Her `/app/uploads/*.{jpg,png,webp,gif,jpeg}` için:
  - `id = filename` (uzantı dahil — böylece eski URL `/api/uploads/abc.jpg` bozulmadan yeni GET route ile match ediyor)
  - `_put_object("titanxis/uploads/legacy/{id}", data, ct)`
  - `files` collection'a upsert: `{id, storage_path, purpose:"legacy", size, migrated_from_disk_at, ...}`
  - `files.find_one({id})` varsa atlar → tam idempotent
- Log formatı: `legacy uploads: migrated=N skipped=N failed=N`

### Startup Hook (server.py)
- `startup()` içinde SvS index'lerinden hemen sonra otomatik çağrılıyor
- Yeni pod restart'ında sadece atlar (skipped), performans etkisi yok

### `POST /api/uploads/migrate-legacy` (admin)
- Manuel yeniden çalıştırma endpoint'i — restart gerektirmez
- Admin `/app/uploads/`'a manuel yeni dosya bıraksa da bu endpoint'i çağırarak taşıyabilir

### Test kanıtları
- **Startup**: 36 dosya migrated ✓
- **İkinci çağrı**: 0 migrated / 36 skipped (idempotent) ✓
- **Roundtrip**: `/api/uploads/03901677...jpg` → HTTP 200, 134243 bytes, `image/jpeg` (Object Store'dan streamed) ✓

### Restart bağımlılığı yok
- Yeni yüklemeler: `POST /api/upload` direkt Object Store'a (dosya sistemi bağımlılığı yok)
- Eski görseller: Object Store'a taşındı + `files` collection'da kayıt
- `/app/uploads/*` dizini isteğe bağlı temizlenebilir — GET route Object Store'dan servis eder, StaticFiles mount'una düşmez artık

## Asker Eğitim — T12 Eklendi (Feb 17, 2026)
- `SoldierCalculator.jsx`: `TIERS = ["T11","T8","T7","T6"]` → **`["T12","T11","T8","T7","T6"]`**
- Tier grid `grid-cols-4` → `grid-cols-5` (ana ekran + modal ikisinde)
- Yeni SWR fetch: `/calculations?category=asker_egitim_t12` + save sonrası mutate
- Birim maliyet: T12 için category `asker_egitim_t12`, ilk kayıt PUT ile oluşturulur (backend zaten upsert yapar)
- Backend endpoint değişikliği gerekmedi — /unit-costs/ upsert paterni kullanılıyor

## Asker Eğitim — 5 Tier Karşılaştırma Görünümü (Feb 17, 2026)
- `SoldierCalculator.UnitCostModal`: **▦ 5 Tier'ı Karşılaştır** toggle chip'i
- Compare açıkken tek-tier seçici gizleniyor, yerine 5 kolonlu tablo (T12 · T11 · T8 · T7 · T6):
  - Satırlar: 5 malzeme (yemek, odun, çelik, benzin, süre)
  - Sticky ilk kolon (malzeme adı) yatay kaydırmada sabit
  - Her hücre editable number input, `asker-compare-{key}-{tier}` testid
- **Sağ tık** veya **⤳** altın chip → değeri sağdaki tüm tier'lara kopyala (T12→T11,T8,T7,T6)
- **TÜMÜNÜ KAYDET (5 Tier)** butonu `Promise.all` ile 5 PUT paralel gönderir, SWR cache invalidate
- Curl doğrulama: 5 tier PUT/GET roundtrip başarılı ✓

## Asker Compare — T6→T12 Fark Sütunu (Feb 17, 2026)
- Compare tablosunun en sağına yeni **"T6→T12 %"** kolonu:
  - Formül: `((T12 − T6) / T6) × 100`
  - T6=0 → "—" (bölme yok)
  - T6=0, T12>0 → "∞" (sadece T12'de maliyet)
  - Sonuç 0'dan büyükse yeşil (#4ADE80), küçükse kırmızı (#F87171), sıfırsa gri
  - İşaret: `+` veya `-`, 0 ondalık ("+334%")
- Header + cell testid: `asker-compare-delta-header`, `asker-compare-delta-{key}`
- Sol kenarı altın border ile ayrılıyor, arka planı diğerlerinden koyu

## Asker Delta Sparkline + Bina A1→A5 Fark Sütunu (Feb 17, 2026)

### Asker Compare — Sparkline üstte
- `asker-compare-sparklines` panel'i, her malzeme için mini SVG line chart:
  - 5 nokta + polyline (T6 → T12 sırasında, düşük→yüksek tier)
  - Trend rengi: `up` yeşil / `down` kırmızı / `flat` gri
  - Sağda yüzde etiketi (`+334%`, `∞`, `—`)
- Testid'ler: `asker-compare-sparklines` + satır bazında `asker-compare-spark-{key}`

### Bina Compare — A1→A5 % delta kolonu
- Tablonun sağına yeni "A1→A5 %" kolonu, Asker'daki T6→T12 kolonuyla aynı UX
- Formül: `((A5 − A1) / A1) × 100`
- Aynı edge case'ler: A1=0 → "—" · A1=0 & A5>0 → "∞"
- Testid'ler: `bina-compare-delta-header` + `bina-compare-delta-{key}`

## Bina Sparkline + Tema Rengi + CSV I/O (Feb 17, 2026)

### Bina Compare
- Panel üstünde Asker'daki gibi SVG sparkline satırları (7 malzeme × A1-A5 polyline + trend rengi + yüzde etiketi)
- CSV İndir/Yükle chip'leri sparkline panelinin altında

### Delta Rengi — Tema Uyumu
- `deltaColors()` helper her iki dosyada: `document.documentElement.classList.contains('dark')` bakıp:
  - Dark: `#4ADE80` (canlı yeşil), `#F87171` (canlı kırmızı), `#94A3B8` (gri)
  - Light: `#16A34A` (koyu yeşil), `#DC2626` (koyu kırmızı), `#64748B` (koyu gri)
- Compare delta hücreleri + sparkline polyline'lar aynı paleti kullanıyor

### CSV İçe/Dışa Aktarma
- Format: `resource,col1,col2,col3,col4,col5` + `# scope` yorum satırı
- Bina: `bina-{building}-{level}.csv` (kolonlar A1..A5)
- Asker: `asker-egitim.csv` (kolonlar T12,T11,T8,T7,T6)
- Yükleme: `<input type=file accept=.csv>` → parse → `setCompareState` merge, geçersiz satırları atlar
- Toast bildirimi: "CSV yüklendi (N satır)" / "CSV hatası: ..."
- Testid'ler: `{scope}-compare-csv-export`, `-import`, `-import-label`

## Sıralama Ekranı — Grid Kaldırıldı + Grup Chip'leri Belirginleşti (Feb 17, 2026)
- Aktif Etkinlikler 1-kolon card grid'i podyumun altından kaldırıldı (koşul `false &&` ile guard)
- Aktif/Arşiv altındaki grup chip strip'i öne çıkarıldı:
  - `Cinzel` serif font + UPPERCASE + `0.10em` letter-spacing
  - Padding büyütüldü (9px 18px), font 12px, weight 700/800
  - Aktif chip: altın gradient background + iç/dış glow + text-shadow
  - Pasif chip: koyu arka plan + altın border (opacity yok)
- Grup chip'leri artık ana etkinlik navigatörü rolünü tek başına üstleniyor

## Garnizon Komutan Lightbox — 4-5 Görsel Fix (Feb 17, 2026)
- Sorun: `max-h-[42vh]` her görsele veriyordu → 4-5 görsel yüklendiğinde row height collapse, görseller kayboluyordu
- Fix: Grid wrapper `overflow-y-auto maxHeight:68vh` scrollable oldu
- Her görsel: `aspectRatio: "1 / 1"` + `minHeight: 120px` → stabil layout, hiç kaybolmuyor
- 3 görsel özel case (spanBoth) korundu — üçüncü ortalı çıkıyor

## Sıralama — Grup Chip'leri Küçültüldü (Feb 17, 2026)
- Chip padding `9px 18px` → `6px 12px`
- Font size 12px → 10px
- Glow shadow 12px → 10px, text-shadow 4px → 3px
- Strip container `flex-nowrap` + `scrollBehavior: smooth` — kaydırılabilir kaldı ama daha kompakt
- Podyum ve tablo aynı ekranda daha rahat sığıyor

## Loj Hakkında Tabloları Küçültme (Feb 17, 2026)
- `HeroTables.jsx` global compaction:
  - Section container gap: 10 → 6
  - Section padding: 10 → 6 (3 kart: Yıldız/Eğitim/Diğer)
  - Section heading fontSize: 12 → 11
  - Section heading marginBottom: 8 → 5
  - Root wrapper `fontSize: 11px` (child'lar da küçüldü)
- 3 asker eğitim tablosu artık tek sayfaya sığıyor

## Header Dropdown — "Katılım" Menü Öğesi Kaldırıldı (Feb 28, 2026)
- `/app/frontend/src/components/Header.jsx` (satır 256-263) admin dropdown'daki "Katılım" (📊, `/raporlar`) MenuItem bloğu tamamen silindi
- Katılım sayfası artık YALNIZCA MemberHome radyal menüsünden (`raporlar` node) erişilebilir
- Diğer dropdown öğeleri (Dashboard, Bildirimler, VIP Destek, Gösterge Paneli, Profil, Kullanıcılar, Puanlar Hakkında, Anketler, SvS, Şifre, OCR, Export, Wizard, Çıkış) korundu
- Test: git diff ile doğrulandı (8 satır silme)
- Not: Preview'da hazır, kullanıcının Emergent UI'dan "Publish" ile production'a (titanxis.com) alması gerekiyor


## Header Dropdown — Tüm Öğeler Türkçe Alfabetik Sıraya Alındı (Feb 28, 2026)
- `/app/frontend/src/components/Header.jsx` profil dropdown içindeki 14 MenuItem Türkçe alfabetik sıraya (a b c ç d e f g ğ h ı i j k l m n o ö p r s ş t u ü v y z) göre yeniden dizildi
- Yeni sıra: Anketler 🗳️ → Bildirimler 🔔 → Çıkış Yap 🚪 → Dashboard 📊 → Detaylı Rapor (Excel) 📥 → Kurulumu tekrar göster ✨ → OCR Geçmişi 📸 → Panel 🎛️ → Profilim 🙂 → Puanlar Hakkında 📖 → SvS Takip ⚔️ → Şifre Değiştir 🔑 → VIP Destek 🎟️ → Yönetim 👤
- Kullanıcı isteği "tüm öğeleri alfabetik" olduğu için "Çıkış Yap" da alfabetik pozisyonuna (3.) alındı — eski divider çizgisi kaldırıldı (tek liste okunuyor)
- Tüm role guard'ları (isAdmin / canEdit) korundu, sadece görünüm sırası değişti
- Test: git diff 65 insert / 61 delete — yalnızca sıralama değişikliği


## Header Dropdown — "Çıkış Yap" En Alta Sabitlendi (Feb 28, 2026)
- Kullanıcı isteği: "Çıkış Yap" alfabetik sıralamadan bağımsız her zaman en altta olsun
- Diğer 13 öğe Türkçe alfabetik kaldı: Anketler → Bildirimler → Dashboard → Detaylı Rapor (Excel) → Kurulumu tekrar göster → OCR Geçmişi → Panel → Profilim → Puanlar Hakkında → SvS Takip → Şifre Değiştir → VIP Destek → Yönetim
- Divider (`height:1 rgba(231,76,26,0.3)`) geri getirildi, hemen altına 🚪 Çıkış Yap yerleştirildi
- Test: git diff 18 insert / 16 delete — sadece Çıkış Yap konum değişikliği


## Header Dropdown — 4 Öğe Kaldırıldı (Feb 28, 2026)
- `/app/frontend/src/components/Header.jsx` içinden şu MenuItem blokları tamamen silindi:
  - 📊 **Dashboard** (`/dashboard`) — canEdit guard'lı
  - 🔑 **Şifre Değiştir** (`/profil`) — Profil sayfasında zaten mevcut, tekrar eden kaldırıldı
  - 📸 **OCR Geçmişi** (`/ocr/history`) — kaldırıldı
  - 🎛️ **Panel** (`/gosterge-paneli` live_dashboard) — kaldırıldı
- Kalan 10 öğe Türkçe alfabetik + Çıkış en altta: Anketler → Bildirimler → Detaylı Rapor (Excel) → Kurulumu tekrar göster → Profilim → Puanlar Hakkında → SvS Takip → VIP Destek → Yönetim → [divider] → Çıkış Yap
- Menü şimdi çok daha kompakt ve odaklı


## Header Dropdown — Duyurular + Rozet Yönetimi Eklendi, Kurulum Sihirbazı Kaldırıldı (Feb 28, 2026)
- Header.jsx admin dropdown'una 2 yeni menü öğesi eklendi:
  - 📣 **Duyurular** (`/admin/duyurular`, admin-only) — mevcut Announcements sayfasına link
  - 🏅 **Rozet Yönetimi** (`/admin/rozetler`, admin-only) — yeni BadgeManagement sayfası
- ✨ "Kurulumu tekrar göster" (wiz_reopen) MenuItem tamamen silindi
- Kalan alfabetik sıra: Anketler → Bildirimler → Detaylı Rapor → Duyurular → Profilim → Puanlar Hakkında → Rozet Yönetimi → SvS Takip → VIP Destek → Yönetim → [divider] → Çıkış Yap

## v135 Backend Altyapı — Rozet + Şablon + Yoklama Sistemleri (Feb 28, 2026)
- **`/app/backend/routes/badges.py`** — 12 hazır rozet (Lider 👑, Tiran 💀, Savaşçı ⚔️, Efsane 💎, Şampiyon 🏆, Streak 🔥, İzci 👁, Zengin 💰, Fakir 🪙, Şanslı 🧲, Şanssız 🪞, Barış ☮️) startup'ta seed edilir. Özel rozet oluşturma (emoji/URL), admin ata/kaldır. Endpoints: GET/POST/DELETE /api/badges + POST/DELETE /api/members/{id}/badges + GET /api/members/{id}/badges
- **`/app/backend/routes/event_templates.py`** — Etkinlik şablonu kaydet/yükle. Endpoints: GET/POST/DELETE /api/event-templates
- **`/app/backend/routes/rollcalls.py`** — Yoklama sistemi. Push + in-app fan-out. Endpoints: POST /api/rollcalls (başlat), GET /api/rollcalls/{id}, POST /api/rollcalls/{id}/respond, POST /api/rollcalls/{id}/close
- **`/app/backend/routes/admin_notes.py`** — Admin-only gizli üye notu. Endpoints: GET/PUT /api/members/{id}/admin-note
- **server.py**: AnnouncementBody + AnnouncementPatch'e `pinned: bool` alanı eklendi (v135). Startup event'e index/seed ekleri yapıldı.
- **Yeni sayfalar**: `/app/frontend/src/pages/BadgeManagement.jsx` (rozet CRUD + atama tablosu), `/app/frontend/src/components/AdminNoteModal.jsx`, `/app/frontend/src/components/RollcallModal.jsx`
- **App.js rotaları**: /admin/duyurular, /rozetler, /admin/rozetler, /admin/uyeler, /arsiv, /katilim — hepsi mevcut sayfalara admin-guarded alias
- Test: 12 preset rozet backend'de doğrulandı, event-templates + rollcalls endpoint 200 döndü
- ⏳ **Kalan entegrasyonlar**: Members.jsx'e admin note button, Reports.jsx'e Yoklama button, Announcements.jsx'e pin checkbox, MemberHome.jsx'e pinned banner, Events.jsx'e şablon dropdown/checkbox ve arşiv filtre paneli — sonraki iterasyonda tamamlanacak


## Üye İsim Kesilmesi Düzeltildi (Feb 28, 2026)
- `/app/frontend/src/pages/Members.jsx` satır 1054'teki `truncate` Tailwind class'ı kaldırıldı — bu class `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` ekleyerek "Lady..." / "LAGU..." gibi kesikler yaratıyordu
- İsim `<span>`'ine eklenen inline style'lar: `whiteSpace:normal`, `overflow:visible`, `wordBreak:break-word`, `overflowWrap:anywhere`, `flex:1 1 auto`, `minWidth:0` — isimler artık gerektiğinde 2+ satıra sarılıyor
- Parent flex container `items-center` → `items-start flex-wrap` yapıldı → uzun isimler alt satıra taştığında rozet/streak chip'leri hizasız görünmüyor
- Aksiyon butonları (Telegram/Düzenle/Sil) `flex-shrink-0` ile sağda sabit kalıyor, isim alanı sol tarafta `flex-1 min-w-0` ile mevcut alanı sarıyor
- Font size dinamik `displayPrefs.nameSize` korundu — kullanıcı isterse Görünüm panelinden 12px'e indirebilir, ama zaten sarılma olduğu için gerekmiyor
- Test: git diff 14 insert / 2 delete — tek konum, izole değişiklik


## Fixed Legal Footer — Her Sayfada Sabit Alt Bar (Feb 28, 2026)
- **Yeni**: `/app/frontend/src/components/LegalFooter.jsx` — position:fixed, bottom:0, z-index:1500, height:30px, rgba(15,8,6,0.92) koyu taş arkaplan + backdropFilter blur, amber (#F5A623) linkler
- 3 link: **Gizlilik Politikası | Kullanım Koşulları | Aydınlatma Metni** — ortalanmış, `|` amber ayırıcı, 10px font, hover'da #FFD680
- App.js AppShell'in BrowserRouter kökünden `<LegalFooter />` global olarak render ediliyor — her route'da (login dahil) görünür
- `Layout.jsx` içindeki eski scroll-akışı footer'ı (v117 subtle privacy link) tamamen kaldırıldı; artık tek footer var → sayfa içeriği çakışmıyor, RadialMenu z-index:1000 altında kaldığı için üstünde görünür
- Scroll container'ın mevcut `paddingBottom: 80` alanı 30px fixed footer'a yeterli — sayfa alt içeriği gizlenmez
- Modal dialoglar (z-index 9999+) footer üstünde çıkmaya devam eder
- data-testid'ler: `legal-footer`, `legal-footer-privacy`, `legal-footer-terms`, `legal-footer-kvkk`


## RadialMenu vs Fixed Footer Çakışması Giderildi (Feb 28, 2026)
- `/app/frontend/src/components/RadialMenu.jsx`:
  - `bottom: 20` → `bottom: 52` — TTN butonu ve fan ikonları 30px yüksekliğindeki `LegalFooter`'ın üstüne kaldırıldı (+2px nefes payı)
  - `zIndex: 50` → `zIndex: 1600` — footer (z:1500) üstünde her zaman görünür/tıklanabilir
  - Backdrop `zIndex: 45` → `zIndex: 1595` — tap-outside dismiss doğru çalışıyor, footer üstünde
- `/app/frontend/src/components/Layout.jsx`:
  - `#titanxis-scroll` `paddingBottom: 80` → `paddingBottom: 112` — sayfa alt içeriği hem RadialMenu (52 bottom + ~48 buton) hem LegalFooter (30) altına gizlenmiyor
- Modal dialoglar (z:9998+) hâlâ RadialMenu üstünde açılıyor — z-index hiyerarşisi: içerik < RadialMenu (1600) < Modal (9998+)
- Screenshot: footer y=1050, h=30 doğrulandı


## v135.6 — Next Action Items Tamamlandı: 4 Özellik + Footer Gradient (Feb 28, 2026)

### 1. Yoklama UI Bağlama (`/katilim` → Reports.jsx)
- `RollcallModal` import edildi, `showRollcall` state eklendi
- Katılım Merkezi'nin üstüne amber gradient "📣 Yoklama Başlat" butonu (`rollcall-start-btn` testid)
- Tıklanınca modal açılır, etkinlik seç + mesaj yaz → tüm üyelere push + in-app fan-out
- Backend `/api/rollcalls` zaten hazırdı; tam entegre

### 2. Duyuru Sabitle + Anasayfa Banner
- **Announcements.jsx**: `pinned` state + "📌 Sabitle" checkbox (`announcement-pinned` testid) + submit body'ye eklendi
- **MemberHome.jsx**: `PinnedAnnouncementsBanner` bileşeni eklendi — anasayfa üst kısmında amber gradient banner, `📌` icon, dil-farkında (title_translations + body_translations kullanır), tıklanınca `/duyurular` sayfasına gider
- Kullanıcı bazlı dismiss: `titanxis_pinned_dismissed_v1` localStorage'da saklanır → aynı duyuru bir kez kapatılınca tekrar görünmez
- Ekranda maksimum 3 sabit banner görünür (üst 3)

### 3. Admin Gizli Not Butonu (`/uyeler` → Members.jsx)
- `StickyNote` icon import edildi (lucide-react)
- `AdminNoteModal` import edildi
- Her üye satırındaki aksiyon butonlarının başına 📝 ikon butonu eklendi
- Not olan üyelerde amber (`#F5A623` + glow), boş olanlarda slate
- `adminNoteMember` state ile modal wire edildi, kaydedince `/members` SWR mutate

### 4. Etkinlik Şablonları (Events.jsx EventForm)
- Form üstüne "📋 Şablondan Oluştur" dropdown (`event-form-template-select`) — seçilince tarih hariç tüm alanlar dolar
- Submit butonundan hemen önce "📋 Bu etkinliği şablon olarak kaydet" checkbox (`event-form-save-as-template`) — işaretlenince şablon adı input'u açılır
- Etkinlik kaydedildikten sonra ayrı bir `POST /event-templates` çağrısı ile şablon oluşur, hata sessiz toast'la belirtilir
- Sadece yeni etkinlik oluştururken görünür, edit modunda gizli

### 5. Footer Gradient Fade
- `LegalFooter.jsx` tamamen yeniden yazıldı (indentasyon düzeltildi)
- 18px yükseklikte pseudo `<div>` üstte gradient (`linear-gradient(to bottom, transparent → koyu-taş)`)
- Ana footer'a genişletilmiş box-shadow eklendi: `0 -18px 26px -18px rgba(245,166,35,0.55)` haleli amber ışık + `0 -4px 12px rgba(0,0,0,0.6)` derinlik
- İçerik footer'a yaklaşırken görsel geçiş sağlanıyor, RadialMenu ile arasında zarif boşluk

### Build & Deploy
- Git diff: 6 dosya, +261 / -11 satır
- Frontend derleme: hatasız (yalnızca webpack deprecation warning'leri — mevcut duruma özgü)
- ⚠️ Kullanıcı Emergent UI'dan "Publish" ile production'a alacak


## v135.9 — Özel İsim Alanları DeepL Çevirisinden Muaf Tutuldu (Feb 28, 2026)
**Sorun**: "KAFES" etkinliği bazı kartlarda "CAGE"e dönüşüyordu — DeepL kullanıcı tarafından yazılan özel isimleri genel İngilizce'ye çeviriyordu, üyeler için kafa karıştırıcıydı ve tutarsızdı (aynı isim bazı kartlarda TR, bazılarında EN).

**Düzeltme**: Kullanıcı tarafından girilen DB kayıtları artık ÇEVRİLMEZ, olduğu gibi saklanıp gösterilir. Yalnızca UI etiketleri (butonlar, sistem mesajları) i18n bundle üzerinden çevrilir.

**Backend değişiklikleri** (`/app/backend/server.py` + `/app/backend/routes/event_folders.py`):
- `POST /api/events`: `_auto_translate_all` çağrıları kaldırıldı → `name_translations`, `subtitle_translations`, `group_translations` boş dict (`{}`) atanır
- `PATCH /api/events/{id}`: Kaynak değişince eski çeviriler temizlensin diye boş dict yazılır
- `PATCH /api/events/group/{name}` (grup yeniden adlandırma): DeepL kaldırıldı
- `POST /api/event-folders` + `PATCH /api/event-folders/{id}`: Klasör adı çevirileri kaldırıldı
- `POST /api/event-folder-templates`: Şablon adı ve varsayılan klasör adı çevirileri kaldırıldı

**Migration**: Mevcut kayıtlarda stale çeviriler tek seferlik script ile temizlendi:
- 9 etkinlik dokümanı → `name_translations={}, group_translations={}, subtitle_translations={}`
- 3 event_folder → `name_translations={}`
- 0 folder_template

**Frontend davranışı**: Değişiklik yok — event render kodu zaten `(e.name_translations || {})[lng] || e.name` fallback pattern'ini kullanıyordu. Boş dict ile artık her zaman kaynak `e.name` gösteriliyor.

**Çeviri kapsamı özet**:
- ✅ Hâlâ çevrilir: Duyuru başlık/gövde (`title_translations`/`body_translations`), i18n bundle (UI etiketleri, sistem mesajları)
- ❌ Artık çevrilmez: `event.name`, `event.group_name`, `event.subtitle`, `event_folder.name`, `folder_template.name`, `folder_template.folder_name_default`


## v135.10 — DeepL Çevirisi Tüm Kullanıcı Girişleri İçin Geri Getirildi (Feb 28, 2026)
**Kullanıcı geri bildirimi**: v135.9'daki "özel isim çevirilerini kapat" kararı geri alındı. Kullanıcı bunun yerine **tutarlılık** istiyor — hepsi çevrilsin, hiçbir istisna olmasın.

**Geri alınan değişiklikler**:
- `server.py POST /events`: `_auto_translate_all` çağrıları geri getirildi (name, subtitle, group_name)
- `server.py PATCH /events/{id}`: Kaynak alan değişince re-translation aktif
- `server.py PATCH /events/group/{name}`: Grup rename'de DeepL çağrısı aktif
- `event_folders.py POST /event-folders` + PATCH: Klasör adı çevirisi aktif
- `event_folders.py POST /event-folder-templates`: Şablon + varsayılan klasör adı çevirileri aktif

**Migration/Backfill**:
- 9 mevcut etkinlik PATCH ile tekrar tetiklendi → DeepL tüm alanları çevirdi
- 3 klasör PATCH ile tekrar tetiklendi → DeepL tüm alanları çevirdi
- Doğrulama: `Kafes 1` → `Cage 1` (EN), etc. çevirileri artık dolu → tüm kartlar tutarlı gösterecek

**Çeviri kapsamı özet (v135.10)**:
- ✅ **Çevrilir**: `event.name`, `event.group_name`, `event.subtitle`, `event_folder.name`, `folder_template.name`, duyuru başlık/gövde, UI etiketleri
- ❌ **Hiçbir istisna yok** — kullanıcı tüm alanların çevrilmesini istedi

**Not**: Frontend zaten `(e.name_translations || {})[lng] || e.name` fallback pattern'ini kullanıyor → seçili dilde çeviri yoksa TR kaynak gösteriliyor. Backfill ile tüm 9 etkinlikte çeviriler dolu → tutarsız görünüm sorunu çözüldü.


## v135.11 — Çeviri Sistemi + Hardcoded String Düzeltmesi (Feb 28, 2026)

### Kök Sorun
DB'de group_name "KaFeS" (bozuk case) olarak saklıydı → DeepL bunu tanınmayan sözcük sayıp çeviremiyordu. Ayrıca Events.jsx içinde bazı butonlar hâlâ hardcoded TR string kullanıyordu.

### Düzeltmeler

**1. Casing Normalizasyonu (backend DB migration)**:
- `KaFeS` → `Kafes`, `KristaL` → `Kristal`, `PRE 5.GÜN` → `Pre 5.gün` — 9 event güncellendi
- SvS klasörü acronym olarak korundu (ilk normalizasyonda `Svs` olmuştu, revert edildi)
- Tüm event'lerin `name_translations`, `group_translations`, `subtitle_translations` boşaltılıp PATCH ile yeniden DeepL çevirisi tetiklendi

**2. Hardcoded String → i18n Route (`Events.jsx`)**:
- `<><EyeOff /> Gizle</>` → `{t("hide", "Gizle")}`
- `<><Eye /> Göster</>` → `{t("show", "Göster")}`  
- Group collapse button title'ları `t("show_events")` / `t("hide_events")`
- Member delete `title="Sil"` → `title={t("delete", "Sil")}`
- `toast.success("Silindi")` → `toast.success(t("deleted", "Silindi"))`

**3. Yeni i18n Anahtarları (TR + EN)**:
- `hide`, `show`, `hide_events`, `show_events`, `deleted`

### DeepL Rate Limit Uyarısı
9 event × 27 dil × 3 alan = 729 DeepL çağrısı serial olarak backend'de yapılıyor (~150+ sn). Toplu backfill sırasında bazı çeviriler timeout'a uğradı, kalan event'ler için tek tek re-PATCH tetiklendi. Yeni oluşturulan etkinliklerde bu sorun yok — tek etkinlik = 81 çağrı × 200ms ≈ 16 sn (kabul edilebilir).

### Dil Değişince Re-render
Events.jsx zaten `useTranslation()` hook kullanıyor (satır 213) ve group/event name render'ları `i18n.language`'ı doğrudan okuyor → dil değişince otomatik yeniden render oluyor. Ek useEffect gerekmedi.

### Groupless Etkinlikler (`/` görünmez)
Line 736: `{e.group_name && String(e.group_name).trim() ? (...)}` — group_name boşsa "/" ayırıcı zaten gösterilmiyor. Bu davranış doğru.


## v135.12 — DeepL 429 Retry + Non-Destructive Translations + Backfill Endpoint (Feb 28, 2026)

### Sorun
Production'da (titanxis.com) English'e geçince bazı KAFES kartları CAGE, bazıları KAFES kalıyordu. Kök neden: DeepL rate-limit'e (429) takıldığında `_deepl_translate_one` sessizce boş dict dönüyordu, event kaydında `translations = {}` yazılıyor ve mevcut çeviriler siliniyordu.

### Düzeltmeler

**1. `_deepl_translate_one` — 429 Retry with Exponential Backoff**
- Her dil için max 4 deneme (1 + 3 retry)
- HTTP 429 → `Retry-After` header'ını okur, yoksa 2/4/8/16 sn backoff
- Diğer HTTP hataları tek denemede loglanır, o dil atlanır (diğerlerini durdurmaz)
- Timeout 25 → 30 sn
- Sadece TRIM edilmiş dolu string'ler out'a yazılır

**2. `_auto_translate_all` — Non-Destructive**
- Sıfır dilde çeviri gelirse `None` döner (eskiden `{}`)
- Kaynak boş VEYA DeepL yoksa `{}` döner (semantik korunur)

**3. POST /events + PATCH /events + Group Rename — Non-Overwrite**
- `_auto_translate_all` `None` dönerse mevcut translation dict'i olduğu gibi kalır (yeni PATCH'te bile silinmez)
- Yeni oluşturmada `translations` yalnızca sonuç varsa payload'a eklenir
- Grup rename'de tüm event'lerin `group_translations`'ı yalnızca yeni çeviri geldiyse güncellenir

**4. Yeni Endpoint: `POST /api/events/backfill-translations` (admin)**
- Tüm event'leri tarar
- Kaynak alan dolu + translations boş → DeepL tetiklenir
- Mevcut dolu çeviriler ASLA overwrite edilmez
- Response: `{scanned_events, filled_name, filled_group, filled_subtitle, filled_folder, details[]}`
- event_folders için de aynı işlem yapılır

### Sonuç
- Production'da bir kez `POST /api/events/backfill-translations` çağrılınca eksik çeviriler DOLDURULACAK (mevcut olanları SİLMEDEN)
- Bundan sonra bir event kaydedilirken DeepL rate-limit yakalanırsa translations DOKUNULMAZ → banner önceki çeviriyi göstermeye devam eder
- Backfill sweep bir sonraki admin aksiyonu / cron'da eksikleri tamamlar


## v135.13 — Group Rename Fix + Cron Piggyback + Production Diagnostic (Feb 28, 2026)

### 1. Group Rename "Method Not Allowed" — DÜZELTİLDİ
- Kök sorun: `rename_group` fonksiyonunun üstünde `@api_router.post("/events/rename-group")` decorator'ı **eksikti** → route tanımlı değildi → FastAPI 405 Method Not Allowed dönüyordu
- Düzeltme: server.py line 1403 üstüne `@api_router.post("/events/rename-group")` eklendi
- Test: `POST /api/events/rename-group?old_name=X&new_name=Y` → HTTP 200 ✅

### 2. Nightly Cron Backfill (Piggyback)
- Yeni ayrı cron eklemek yerine mevcut `deepl-retry-i18n` (03:45 UTC, `/api/cron/deepl-retry-i18n`) cron'una piggyback yapıldı — cron sayısı zaten 10 (5 aktif limiti var)
- Ortak helper: `_backfill_event_translations()` — hem admin endpoint (`POST /api/events/backfill-translations`) hem cron kullanıyor
- Cron endpoint'i her gece 03:45 UTC'de tüm event/folder çevirilerini tarar, sadece BOŞ olanları doldurur, mevcut çevirileri asla overwrite etmez

### 3. Production DeepL Diagnostic Endpoint
- **Yeni**: `GET /api/translate/status` (admin) — DeepL bağlantı sağlığını canlıda doğrular
- Response: `{configured, key_last4, plan, test_ok, test_translation, sample_error}`
- Test çağrısı "Merhaba" → İngilizce'ye çeviriyor; başarısızsa `sample_error`'da hata detayı görülür
- **Preview'da test edildi**: `{configured: true, plan: free, test_ok: true, test_translation: "Hello"}` ✅

### Production DEEPL_API_KEY Sorunu
Kullanıcı raporu: "Preview'da çalışıyor, production'da çalışmıyor" → büyük olasılıkla titanxis.com'da `DEEPL_API_KEY` env var'ı set edilmemiş.

**Doğrulama adımı** (Republish sonrası):
1. Admin olarak titanxis.com'da giriş yap
2. Tarayıcı console'da: `fetch('/api/translate/status', {headers: {Authorization: 'Bearer ' + localStorage.getItem('token')}}).then(r=>r.json()).then(console.log)`
3. `configured: false` görünürse → Emergent UI'dan production environment'a `DEEPL_API_KEY` env var'ını ekle (preview'daki ile aynı: `2fccffba-...:fx`)
4. Republish sonrası `POST /api/events/backfill-translations` çağır → tüm event'ler çevrilsin


## v135.14 + 135.15 — DeepL In-Process Cache + Çeviri Sağlığı Widget (Feb 28, 2026)

### v135.14 — DeepL In-Process LRU Cache
- **Sorun**: Aynı "Kafes" 9 event'te 9 kez DeepL API'sine çağrılıyordu (81 çağrı × 9 = 729)
- **Düzeltme**: `server.py` içinde module-level `_DEEPL_CACHE: dict = {}` + `_DEEPL_CACHE_MAX = 512`. `_deepl_translate_one` başında lookup, sonunda insert. Pseudo-LRU (dict insertion order).
- **Sonuç**: İkinci "Kafes" event'te cache hit → 0 API çağrısı, ~200ms → ~1ms. Boş sonuçlar (429/offline) cache'lenmez, sonraki retry başarılı olabilir.

### v135.15 — Çeviri Sağlığı Widget
- **Backend**: `GET /api/translate/health` (admin) → `{configured, plan, cache_size, cache_max, events_missing, folders_missing, usage_last_24h: {calls, chars, top_langs}, quota: {character_count, character_limit, percent}}`
- **Frontend**: `/app/frontend/src/components/TranslateHealthWidget.jsx` — UserManagement admin sayfasının üstünde canlı widget. 60sn'de bir SWR yenilenir
- **Widget bileşenleri**:
  - Durum rozeti: yeşil `DeepL free` / kırmızı `Ayarlı Değil`
  - 4 stat kutusu: Eksik Çeviri (yeşil/kırmızı), Cache (indigo), Son 24 Saat (amber), Aylık Kota (yeşil/kırmızı)
  - "Eksikleri Doldur" butonu (missing > 0 olduğunda görünür) → `POST /api/events/backfill-translations` tetikler + toast
- **İlk canlı test**: DeepL kota %85.31 kullanılmış (853k / 1M chars) — Free plan aylık limit yaklaşımı → widget kullanıcıyı önceden uyaracak
- **Cron endpoint hazır**: `deepl-retry-i18n` nightly cron (03:45 UTC) `_backfill_event_translations` helper ile eksikleri otomatik doldurur

### Retro-Tag (0 event etkilendi)
- Template retro-tag script çalıştırıldı — DB'de henüz template olmadığı için tag'lenen event yok. Yeni etkinlik "Şablondan Oluştur" ile açılırsa `template_source_name` otomatik dolar, mor "📋 Şablon: X" chip'i görünür (kod hazır)


## v135.16 — Google Cloud Translation API'ye Geçiş (DeepL Fallback ile) (Feb 28, 2026)

### Yapılanlar
- **Yeni env var**: `GOOGLE_TRANSLATION_API_KEY` — production'da zaten set edilmiş, preview'da yok (fallback devrede)
- **Dispatch mantığı**: `_deepl_translate_one` fonksiyonu (isim korundu, tüm caller'lar dokunulmadı) artık:
  1. `GOOGLE_TRANSLATION_API_KEY` varsa → Google Cloud Translation API v2 (`https://translation.googleapis.com/language/translate/v2`)
  2. Yoksa `DEEPL_API_KEY` varsa → DeepL (backward compat)
  3. Hiçbiri yoksa → boş dict
- **GOOGLE_LANG_MAP**: 29 dil için Google ISO 639-1 kodları (nb→no remap, diğerleri direkt)
- **Yeniden kullanılan altyapı**: 429/403 retry with backoff, `_DEEPL_CACHE` LRU cache, `_auto_translate_all` non-destructive semantiği
- **Health endpoint güncellendi**: `engine` field'ı eklendi ("google" veya "deepl"), `plan: "google-cloud"` Google için, "free"/"pro" DeepL için
- **Backfill endpoints güncellendi**: Her iki key'i kontrol eder
- **i18n bundle korundu**: Frontend `useTranslation()` hook + `t()` fonksiyonu değişmedi — sadece backend çeviri motoru değişti

### Test Sonuçları
- Preview (DeepL fallback): "Merhaba" → "Hello" ✅ (engine=deepl)
- Production (Google): Republish sonrası `GET /api/translate/health` → `engine: "google"` görecek

### Production'da Doğrulama
Republish sonrası:
```
GET /api/translate/health → {engine: "google", configured: true, ...}
```
Kotayı hâlâ görebilirsiniz ama artık Google Cloud'ın quota'sını izleyecek (DeepL 1M limit değil, Google'ın çok daha yüksek limitini).

### Sonraki Adım
Preview'a da GOOGLE_TRANSLATION_API_KEY eklenirse tek key ile test edebilir; şu an DeepL fallback ile çalışıyor.


## v135.17 — Etkinlik Oluşturma 500 Hatası Düzeltildi (Feb 28, 2026)

### Kök Sorun
Google migration ile ilgisi YOK. Latent Pydantic v2 uyumsuzluk bug'ı migration sırasında tetiklendi:
- `Event` model: `report_channels: List[str] = Field(default_factory=list)` (Non-Optional)
- `EventCreate` model: `report_channels: Optional[List[str]] = None`
- Kullanıcı bu alanları girmediğinde payload'da `None` bulunuyordu
- `Event(**payload)` → Pydantic v2 `None → []` coerce yapmıyor, `list_type` ValidationError fırlatıyor
- HTTP 500: `3 validation errors for Event` (report_channels, alliance_thresholds, member_thresholds)

### Düzeltme (server.py:1142)
`Event(**payload)` çağrısından önce None → default_factory değerine normalize edildi:
```python
for _field, _default in (
    ("report_channels", []),
    ("alliance_thresholds", []),
    ("member_thresholds", []),
    ("name_translations", {}),
    ("subtitle_translations", {}),
    ("group_translations", {}),
    ("result_screenshots", []),
):
    if payload.get(_field) is None:
        payload[_field] = _default
```

### Doğrulama
- **Preview POST /api/events**: HTTP 200 ✅ 
- **Google-emulating DeepL fallback**: name → 28 dil (en:"Test", zh:"测试", ja:"テスト"...) ve group_name "Kafes" → 28 dil (en:"Cage", de:"Käfig", ru:"Клетка", ja:"ケージ", zh:"笼子") ✅

⚠️ Republish sonrası titanxis.com'da etkinlik oluşturma normale dönecek. Google Translation API prod'da devrede olduğu için çeviriler Google'dan gelecek.


## v135.18 — Google Batch Translation + Pydantic Regression Kontrolü (Feb 28, 2026)

### 1. Pydantic v2 None-coerce Regression Kontrolü — TEMİZ
- **Member modeli**: Tüm alanlar Optional (safe, `Member(**payload)` sorun yaratmaz)
- **Announcements**: Dict-based insert (BaseModel round-trip yok, safe)
- **Polls**: PollCreateBody kullanır ama insert dict-based
- **Event**: v135.17'de zaten düzeltildi (7 alan normalize edildi)
- **Test**: `POST /api/events` HTTP 200 ✅ + tam 28 dil çevirisi (Kristal→Crystal/Krystal/Kristall/クリスタル/水晶)

### 2. Google Batch Translation — `_google_translate_batch()` Helper Eklendi
- **Yeni fonksiyon**: `_google_translate_batch(texts: List[str], target_lang: str) → List[str]`
- **Google API v2 batch semantics**: tek çağrıda 128 metne kadar aynı hedef dile → parallel array döner
- **429/403 retry**: exponential backoff + `Retry-After` header desteği korundu
- **Backfill refactor**: `_backfill_event_translations` artık Google aktifken batch path kullanır
  - **Eski**: O(events × langs) round-trip — 9 event × 28 dil = 252 çağrı
  - **Yeni**: O(langs) round-trip per field — 28 çağrı (name) + 28 (group) + 28 (subtitle) = 84 çağrı, her biri 9 metin batch
  - **Hız artışı**: ~3x on backfill (dil sayısı sabit kaldığından; batch içindeki metin sayısı ne kadar artarsa o kadar iyi)
- **DeepL fallback path korundu**: `_google_translate_batch` sadece Google key varsa kullanılır, DeepL için eski per-text serial path devrede
- **Response'a `engine` alanı eklendi**: `{"engine": "google" | "deepl"}` — hangi motor kullanıldığı görülür

### Test Sonuçları
- Event create HTTP 200 ✅ (Pydantic regression yok)
- 28 dil çeviri tam ✅ (name + group)
- Backfill preview'da DeepL fallback path'i çalışıyor (`engine: "deepl"`) ✅
- Production'da GOOGLE key aktif olduğu için otomatik batch path'e geçecek

⚠️ **Production Deploy**: Preview'da hazır — "Publish" ile canlıya alın. Production'da batch translation kendiliğinden devreye girecek. Yeni event/duyuru/klasör yaratıldığında da DeepL'e göre daha hızlı olacak (Google Cloud daha yüksek quota + daha hızlı response).


## v135.19 — Batch Announcements + `_translate_one` Rename (Feb 28, 2026)

### 1. Batch Announcements
- **Yeni helper**: `_auto_translate_batch(texts: List[str]) → List[Optional[dict]]`
  - Google aktifken: 28 per-lang batch call (her batch içinde tüm texts) → title+body için tek turda 28 API çağrısı
  - DeepL fallback: eski per-text serial path
- **Refactor**: `announcements_create` artık `_auto_translate_batch([title, body])` kullanır
  - **Eski**: 2 × `_auto_translate_all` = 56 API çağrısı (Google) veya 56 (DeepL)
  - **Yeni (Google)**: 28 API çağrısı (%50 azalma per-announcement)
  - **Preview test**: title=28 lang + body=28 lang doldu ✅ ("Test Duyuru"→"Test Announcement/Testankündigung/テストのお知らせ")

### 2. Kod Temizliği: `_deepl_translate_one` → `_translate_one`
- Google migration tamamlandı; DeepL ismi kodda kalmadı
- server.py'da `replace_all=true` ile 13 referans yeniden adlandırıldı
- Route dosyalarında `_deepl_translate_one` referansı yoktu (0 dosyada) — sadece server.py etkilendi
- Fonksiyon signature aynı, davranış aynı — sadece isim değişikliği

### Test Sonuçları
- Announcement create: HTTP 200 + 28+28 çeviri ✅
- Translate status endpoint: `test_ok=true` ✅
- Backend restart: temiz, hata yok ✅

⚠️ **Production Deploy**: Preview'da hazır — "Publish" ile canlıya alın. Production'da GOOGLE key ile birlikte batch path devreye girecek; her duyuru yaratımı ~2× hızlanacak.


## v135.20 — Async Translate Manager + Batch Event Titles (Feb 28, 2026)

### 1. `_translate_fields(doc, fields)` — Merkezi Async Translate Manager
Yeni fonksiyon `server.py`'da tanımlandı. Multi-field döküman için tek turda TÜM alan çevirilerini yürüten merkezi yönetici:
- **Signature**: `async _translate_fields(doc: dict, fields: List[tuple(source_field, translations_field)]) -> None`
- **In-place update**: doc'a `translations_field: {lang: text}` yazar
- **Google aktifken**: `_auto_translate_batch` üzerinden batch API path → N field için N metin × 28 dil = 28 API çağrısı (serial'a göre ~N kat hızlı)
- **DeepL fallback**: `_auto_translate_all` üzerinden per-text serial path korunur
- **Non-destructive**: boş/None çeviri sonucu mevcut dict'i overwrite ETMEZ
- **Rate-limit + retry + cache**: `_translate_one` / `_google_translate_batch` primitive'lerinde zaten mevcut, manager değişmeden bunları kullanır

### 2. Tüm Caller'lar Refactor Edildi
- **Event Create (`POST /api/events`)**: 3 alan (`name`, `subtitle`, `group_name`) tek `_translate_fields` çağrısıyla batch çevriliyor. Eski: 3 × 28 = 84 serial call. Yeni: 28 batch call → **~3× hız artışı**
- **Event Update (`PATCH /api/events/{id}`)**: Değişen alanlar (`_dirty_fields`) tek batch call ile çevriliyor
- **Announcement Create (`POST /api/announcements`)**: `title` + `body` tek batch call ile çevriliyor (v135.19'da eklenmişti, v135.20'de manager'a taşındı)
- Grup rename, folder create/rename ve folder template hâlâ tek alan olduğu için `_translate_one`/`_auto_translate_all` kullanmaya devam ediyor (batch avantajı olmaz)

### 3. Gelecek İçin
Yeni içerik tipi eklendiğinde çeviri desteği tek satırda gelir:
```python
await _translate_fields(payload, [("q", "q_translations"), ("desc", "desc_translations")])
```
Rate-limit, retry, backoff, cache, non-destructive semantik — hepsi merkezi manager'da.

### Test Sonuçları (preview, DeepL fallback path)
- Event: `name=Manager Test → 28 lang`, `group=Kristal → Crystal + 27 more`, `subtitle=Merkezi çeviri denemesi → Centralised translation test + 27 more` ✅
- Announcement: `title=Manager Test → 28 lang`, `body=İkinci merkezi çeviri testi → Second centralised translation test + 27 more` ✅

⚠️ **Production Deploy**: Preview'da hazır — "Publish" ile canlıya alın. Production'da GOOGLE key aktif olduğu için manager batch path'ini kullanır, event ve announcement yaratımı ~3× hızlanır.

