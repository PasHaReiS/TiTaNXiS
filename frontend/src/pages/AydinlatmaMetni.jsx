import React from "react";
import { Link } from "react-router-dom";
import { Scale, ArrowLeft } from "lucide-react";

/**
 * v122 — KVKK Aydınlatma Metni (KVKK Art. 10).
 * Public route at /aydinlatma-metni. Detailed data-controller disclosure
 * separate from the shorter Privacy Policy so we satisfy Türk KVKK's
 * information-notice requirement in full.
 */
export default function AydinlatmaMetni() {
  return (
    <div
      className="min-h-screen w-full flex items-start justify-center py-10 px-4"
      style={{
        background:
          "radial-gradient(1200px 700px at 20% -10%, rgba(231,76,26,0.10), transparent 60%), radial-gradient(900px 500px at 90% 110%, rgba(76,29,149,0.12), transparent 60%), linear-gradient(180deg,#0A0604 0%,#120806 100%)",
        color: "#F5F0E8",
      }}
      data-testid="aydinlatma-page"
    >
      <article
        className="w-full max-w-2xl rounded-2xl"
        style={{
          background: "linear-gradient(180deg, rgba(26,18,16,0.92), rgba(14,10,8,0.92))",
          border: "1px solid rgba(245,166,35,0.35)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7), inset 0 0 24px rgba(231,76,26,0.06)",
          padding: "32px 28px",
        }}
      >
        <div className="flex items-center gap-3 mb-6 pb-4" style={{ borderBottom: "1px solid rgba(245,166,35,0.28)" }}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at 30% 28%, #FFD787 0%, #F5A623 32%, #B45309 68%, #4A1B08 100%)",
              boxShadow: "0 0 18px rgba(245,166,35,0.55)",
              border: "1.5px solid rgba(245,166,35,0.8)",
            }}
          >
            <Scale className="w-5 h-5" style={{ color: "#0B0704" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1
              className="font-bold uppercase text-lg sm:text-xl"
              style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.16em", color: "#F5A623", textShadow: "0 0 10px rgba(245,166,35,0.35)" }}
              data-testid="aydinlatma-title"
            >
              KVKK Aydınlatma Metni
            </h1>
            <div className="text-[11px] mt-1 uppercase" style={{ color: "#D4730A", letterSpacing: "0.14em" }} data-testid="aydinlatma-updated">
              KVKK Md. 10 — Son güncelleme: Şubat 2026
            </div>
          </div>
        </div>

        <Section number="1" title="Veri Sorumlusunun Kimliği">
          6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu <b>TiTaNXiS</b>'tir. İletişim:{" "}
          <a href="https://titanxis.com" target="_blank" rel="noopener noreferrer" style={{ color: "#F5A623", textDecoration: "underline" }} data-testid="aydinlatma-contact-link">titanxis.com</a>.
        </Section>

        <Section number="2" title="İşlenen Kişisel Veriler">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Kimlik verileri:</b> Kullanıcı adı, oyun içi karakter adı (nickname)</li>
            <li><b>İletişim verileri:</b> E-posta (opsiyonel), Telegram user ID (opsiyonel)</li>
            <li><b>Kullanım verileri:</b> Etkinlik RSVP kayıtları, ziyaret ettiğiniz sayfalar, dil tercihi</li>
            <li><b>Cihaz verileri:</b> Cihaz tipi, işletim sistemi versiyonu, IP adresi (oturum güvenliği için)</li>
            <li><b>Görsel veriler:</b> OCR yüklediğiniz oyun ekran görüntüleri (yalnızca yönetici erişimi)</li>
          </ul>
        </Section>

        <Section number="3" title="Kişisel Veri İşleme Amaçları">
          <ul className="list-disc pl-5 space-y-1">
            <li>Uygulama üyelik hesabınızın oluşturulması ve yönetimi</li>
            <li>Lonca sıralaması, etkinlik takibi ve puan hesaplama hizmetlerinin sunulması</li>
            <li>Etkinlik hatırlatmaları ve bildirimlerin iletilmesi (opt-in olanlar için)</li>
            <li>29 dilde içerik gösterimi (DeepL entegrasyonu)</li>
            <li>Güvenlik, sahtekârlığın önlenmesi ve oturum yönetimi</li>
            <li>Yasal yükümlülüklerin yerine getirilmesi</li>
          </ul>
        </Section>

        <Section number="4" title="Kişisel Veri Aktarımı">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>DeepL API</b> (Almanya) — Yalnızca dil tercihi + otomatik çevrilecek metin (KVKK Md. 9 kapsamında yeterli koruma)</li>
            <li><b>Telegram Bot API</b> (İngiltere) — Yalnızca opt-in kullanıcılar için Telegram ID + bildirim metni</li>
            <li><b>Google Play</b> (ABD) — Uygulama mağazası aracılığıyla dağıtım için gerekli teknik veriler</li>
            <li><b>Emergent Cloud</b> (ABD) — Barındırma altyapısı; veriler şifrelenerek saklanır</li>
          </ul>
        </Section>

        <Section number="5" title="Kişisel Veri Toplama Yöntemi ve Hukuki Sebebi">
          Verileriniz elektronik ortamda, uygulama arayüzü ve API çağrıları aracılığıyla toplanır. Hukuki sebepler:
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>KVKK Md. 5/2-c: Sözleşmenin kurulması ve ifası</li>
            <li>KVKK Md. 5/2-f: Meşru menfaat (güvenlik, sahtekârlık önleme)</li>
            <li>KVKK Md. 5/1: Açık rıza (e-posta gönderimi, Telegram bildirimleri)</li>
          </ul>
        </Section>

        <Section number="6" title="KVKK Md. 11 Kapsamındaki Haklarınız">
          Her ilgili kişi, veri sorumlusuna başvurarak kendisiyle ilgili;
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>Kişisel veri işlenip işlenmediğini <b>öğrenme</b></li>
            <li>Kişisel verileri işlenmişse buna ilişkin <b>bilgi talep etme</b></li>
            <li>İşleme amacını ve amacına uygun kullanılıp kullanılmadığını <b>öğrenme</b></li>
            <li>Aktarıldığı üçüncü kişileri <b>bilme</b></li>
            <li>Eksik/yanlış işlenmişse <b>düzeltilmesini isteme</b></li>
            <li>KVKK Md. 7 kapsamında <b>silinmesini/yok edilmesini isteme</b> (Profil → Hesabımı Sil)</li>
            <li>İşlemin aleyhine bir sonuç doğurması halinde <b>itiraz etme</b></li>
            <li>Zarara uğraması halinde <b>tazminat talep etme</b> hakkına sahiptir</li>
          </ul>
        </Section>

        <Section number="7" title="Başvuru Yöntemi">
          KVKK Md. 11 kapsamındaki haklarınızı kullanmak için{" "}
          <a href="https://titanxis.com" target="_blank" rel="noopener noreferrer" style={{ color: "#F5A623", textDecoration: "underline" }} data-testid="aydinlatma-application-link">titanxis.com</a>
          {" "}üzerinden yazılı olarak başvurabilirsiniz. Başvurunuz en geç 30 gün içinde ücretsiz olarak sonuçlandırılır (Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ Md. 7).
        </Section>

        <div
          className="mt-8 pt-4 flex items-center justify-between text-[11px]"
          style={{ borderTop: "1px solid rgba(245,166,35,0.22)", color: "rgba(245,240,232,0.55)", letterSpacing: "0.08em" }}
        >
          <Link to="/" data-testid="aydinlatma-back-home" className="flex items-center gap-1 uppercase font-bold" style={{ color: "#F5A623" }}>
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <span>© TiTaNXiS</span>
        </div>
      </article>
    </div>
  );
}

function Section({ number, title, children }) {
  return (
    <section className="mb-5" data-testid={`aydinlatma-section-${number}`}>
      <h2 className="mb-1.5 font-bold uppercase text-sm" style={{ fontFamily: "Cinzel, serif", letterSpacing: "0.12em", color: "#F5A623" }}>
        {number}. {title}
      </h2>
      <div className="text-sm leading-relaxed" style={{ color: "rgba(245,240,232,0.85)" }}>
        {children}
      </div>
    </section>
  );
}
