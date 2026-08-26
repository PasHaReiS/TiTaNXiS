"""v124 — Source-of-truth Turkish legal texts (Privacy, Terms, Aydınlatma).
Backend endpoint `/api/legal/{doc}` translates on-demand via DeepL and caches
the result in mongo (`legal_translations` collection) so subsequent hits
don't burn quota. Structure is intentionally flat (title + list of sections)
so the DeepL bulk endpoint can round-trip it in one shot.
"""

LEGAL_UPDATED = "Şubat 2026"

LEGAL_SOURCES = {
    "privacy": {
        "title": "TiTaNXiS — Gizlilik Politikası",
        "sections": [
            {"heading": "1. Toplanan Bilgiler",
             "body": "Uygulamayı kullanabilmen için yalnızca aşağıdaki verileri topluyoruz: kullanıcı adı, oyun içi karakter adın (nickname), etkinlik RSVP kayıtların ve isteğe bağlı Telegram kullanıcı ID'n. E-posta yalnızca opt-in verirsen kaydedilir."},
            {"heading": "2. Verilerin Kullanımı",
             "body": "Verilerin sadece lonca hizmetlerini sunmak için kullanılır: sıralama, etkinlik hatırlatmaları, katılım takibi ve puan hesaplama. Üçüncü taraflarla pazarlama amacıyla asla paylaşılmaz."},
            {"heading": "3. Bildirimler",
             "body": "Push bildirimleri ve Telegram mesajları opt-in'dir. Profil sayfasından istediğin zaman kapatabilirsin."},
            {"heading": "4. Veri Saklama",
             "body": "Hesabını sildiğinde tüm RSVP, oturum, push aboneliği ve bildirim geçmişin kalıcı olarak silinir. Lonca üye kaydın (skor + ittifak) yerinde kalır."},
            {"heading": "5. Çerezler",
             "body": "Uygulama yalnızca oturum güvenliği için gereken minimum çerezleri kullanır. Analitik veya reklam çerezi kullanılmaz."},
            {"heading": "6. Çocukların Gizliliği",
             "body": "Uygulama 13 yaş altı çocuklara yönelik değildir. 13 yaş altı bir kullanıcıdan bilerek veri toplamayız."},
            {"heading": "7. İletişim",
             "body": "Gizlilik ile ilgili sorular için titanxis.com üzerinden yazılı olarak başvurabilirsin. En geç 30 gün içinde yanıtlanır."},
            {"heading": "8. Değişiklikler",
             "body": "Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişiklikler uygulama içinde duyurulur."},
        ],
    },
    "terms": {
        "title": "TiTaNXiS — Kullanım Şartları",
        "sections": [
            {"heading": "1. Şartların Kabulü",
             "body": "Hesap oluşturarak veya TiTaNXiS'i (\"Uygulama\") kullanarak bu Kullanım Şartları ile bağlı olmayı kabul edersin. Kabul etmiyorsan Uygulama'yı kullanma."},
            {"heading": "2. Uygunluk",
             "body": "TiTaNXiS'i kullanmak için en az 13 yaşında olmalısın. Hesap bilgilerinin gizliliğinden sen sorumlusun. Bir kişi = bir hesap; hesap paylaşımına izin verilmez."},
            {"heading": "3. Kabul Edilebilir Kullanım",
             "body": "Uygulama'yı taciz, spam veya yasadışı faaliyet için kullanma. Servisi ters mühendislik, kazıma veya aşırı yükleme girişiminde bulunma. Diğer oyuncuların, ittifakların veya liderlerin kimliğine bürünme. Gönderdiğin içerik telif hakkı veya üçüncü taraf haklarını ihlal etmemelidir."},
            {"heading": "4. Kullanıcı İçeriği",
             "body": "Gönderdiğin içeriğin (nickname, OCR ekran görüntüsü, notlar) sahibi sensin. Gönderim yaparak, TiTaNXiS'e bu içeriği Uygulama içinde ittifak üyelerine ve yöneticilere gösterme hakkını verirsin (dünya çapında, münhasır olmayan lisans)."},
            {"heading": "5. Hesap Askıya Alma ve Sonlandırma",
             "body": "Bu Şartları ihlal eden hesaplar yönetici tarafından askıya alınabilir veya sonlandırılabilir. Profil sayfandan hesabını istediğin zaman silebilirsin (KVKK unutulma hakkı)."},
            {"heading": "6. Garanti Reddi",
             "body": "Uygulama hiçbir garanti verilmeden \"olduğu gibi\" sunulur. TiTaNXiS bir hayran yapımı yardımcı araçtır ve Lands of Jail veya yayıncıları ile bağlantılı değildir."},
            {"heading": "7. Sorumluluğun Sınırlanması",
             "body": "Yasaların izin verdiği azami ölçüde, TiTaNXiS Uygulama'yı kullanmandan kaynaklanan dolaylı, arızi veya sonuçsal zararlardan (veri kaybı, kaçırılan etkinlik, oyun içi kayıplar dâhil) sorumlu değildir."},
            {"heading": "8. Şartlarda Değişiklik",
             "body": "Bu Şartları zaman zaman güncelleyebiliriz. Değişiklikler yayınlandıktan sonra Uygulama'yı kullanmaya devam etmen güncel Şartları kabul ettiğin anlamına gelir."},
            {"heading": "9. İletişim",
             "body": "Website: titanxis.com. Gizlilik Politikası için /privacy sayfasına git."},
        ],
    },
    "aydinlatma": {
        "title": "KVKK Aydınlatma Metni",
        "sections": [
            {"heading": "1. Veri Sorumlusunun Kimliği",
             "body": "6698 sayılı Kişisel Verilerin Korunması Kanunu (\"KVKK\") kapsamında veri sorumlusu TiTaNXiS'tir. İletişim: titanxis.com."},
            {"heading": "2. İşlenen Kişisel Veriler",
             "body": "Kimlik verileri (kullanıcı adı, karakter nickname). İletişim verileri (opsiyonel e-posta, opsiyonel Telegram user ID). Kullanım verileri (RSVP kayıtları, ziyaret edilen sayfalar, dil tercihi). Cihaz verileri (cihaz tipi, işletim sistemi, IP adresi). Görsel veriler (OCR yüklenen ekran görüntüleri — yalnızca yönetici erişimi)."},
            {"heading": "3. Kişisel Veri İşleme Amaçları",
             "body": "Üyelik hesabının oluşturulması ve yönetimi. Lonca sıralaması, etkinlik takibi ve puan hesaplama hizmetlerinin sunulması. Etkinlik hatırlatmaları ve bildirimlerin iletilmesi (opt-in olanlar için). 29 dilde içerik gösterimi (DeepL entegrasyonu). Güvenlik, sahtekârlığın önlenmesi ve oturum yönetimi. Yasal yükümlülüklerin yerine getirilmesi."},
            {"heading": "4. Kişisel Veri Aktarımı",
             "body": "DeepL API (Almanya) — sadece dil tercihi + çevrilecek metin. Telegram Bot API (İngiltere) — sadece opt-in kullanıcılar için Telegram ID + bildirim metni. Google Play (ABD) — uygulama mağazası dağıtımı için teknik veriler. Emergent Cloud (ABD) — barındırma altyapısı; veriler şifrelenerek saklanır."},
            {"heading": "5. Kişisel Veri Toplama Yöntemi ve Hukuki Sebebi",
             "body": "Verilerin elektronik ortamda, uygulama arayüzü ve API çağrıları aracılığıyla toplanır. Hukuki sebepler: KVKK Md. 5/2-c (sözleşmenin kurulması ve ifası), Md. 5/2-f (meşru menfaat — güvenlik, sahtekârlık önleme), Md. 5/1 (açık rıza — e-posta gönderimi, Telegram bildirimleri)."},
            {"heading": "6. KVKK Md. 11 Kapsamındaki Haklarınız",
             "body": "Her ilgili kişi veri sorumlusuna başvurarak; kişisel veri işlenip işlenmediğini öğrenme, bilgi talep etme, işleme amacını öğrenme, aktarıldığı üçüncü kişileri bilme, düzeltilmesini isteme, silinmesini/yok edilmesini isteme (Profil → Hesabımı Sil), aleyhine sonuç doğuran işleme itiraz etme ve zarar durumunda tazminat talep etme hakkına sahiptir."},
            {"heading": "7. Başvuru Yöntemi",
             "body": "KVKK Md. 11 kapsamındaki haklarını kullanmak için titanxis.com üzerinden yazılı olarak başvurabilirsin. Başvurun en geç 30 gün içinde ücretsiz olarak sonuçlandırılır (Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ Md. 7)."},
        ],
    },
}
