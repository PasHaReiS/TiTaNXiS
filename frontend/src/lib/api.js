import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;
const TOKEN_KEY = "ol_token";

// Add token from localStorage on every request (works after refresh)
axios.interceptors.request.use((config) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t && config.url && (config.url.includes(BACKEND_URL) || config.url.startsWith("/"))) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization) config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

// Handle 401 globally
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      const p = window.location.pathname;
      if (p !== "/login" && !p.startsWith("/login")) {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    return Promise.reject(err);
  }
);

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

// Also attach token to the api instance
api.interceptors.request.use((config) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return new Intl.NumberFormat("tr-TR").format(Math.round(n));
};

export const RANKS = ["R5", "R4", "R3", "R2", "R1"];

export const CATEGORIES = [
  { key: "bilgilendirme", label: "Bilgilendirme", section: "BİLGİLENDİRME" },
  { key: "mh_asker_egitim", label: "Asker Eğitim", section: "MALİYET HESAPLAMA" },
  { key: "mh_bina", label: "Bina", section: "MALİYET HESAPLAMA" },
  { key: "mh_teknoloji", label: "Teknoloji", section: "MALİYET HESAPLAMA" },
  { key: "mh_kitap", label: "Kitap", section: "MALİYET HESAPLAMA" },
  { key: "mh_koleksiyon", label: "Koleksiyon", section: "MALİYET HESAPLAMA" },
  { key: "mh_ekipman", label: "Ekipman", section: "MALİYET HESAPLAMA" },
  { key: "mh_uydu", label: "Uydu", section: "MALİYET HESAPLAMA" },
  { key: "mh_robot", label: "Robot", section: "MALİYET HESAPLAMA" },
  { key: "tetikci", label: "Tetikçi", section: "KOMUTANLAR" },
  { key: "bombaci", label: "Bombacı", section: "KOMUTANLAR" },
  { key: "kalkanli", label: "Kalkanlı", section: "KOMUTANLAR" },
  { key: "robotlar", label: "Robotlar", section: "KOMUTANLAR" },
  { key: "kafes_ana_ralli", label: "Ana Ralli Ekibi", section: "KAFES ETKİNLİK" },
  { key: "kafes_diger_ralli", label: "Diğer Ralli Ekipleri", section: "KAFES ETKİNLİK" },
  { key: "garnizon", label: "Garnizon Komutanları", section: "GARNİZON" },
  { key: "savas_solo", label: "Solo Saldırı Ekibi", section: "SAVAŞ" },
  { key: "savas_ralli", label: "Ralli Ekibi", section: "SAVAŞ" },
  { key: "svs_ana_kale", label: "Ana (Supreme) Kale", section: "SVS EKİP" },
  { key: "svs_taret", label: "Taret Ekipleri", section: "SVS EKİP" },
];

export function groupCategories() {
  const grouped = {};
  CATEGORIES.forEach((c) => {
    if (!grouped[c.section]) grouped[c.section] = [];
    grouped[c.section].push(c);
  });
  return grouped;
}

export function apiErr(e) {
  const d = e?.response?.data?.detail;
  if (!d) return e.message || "Bilinmeyen hata";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x?.msg || JSON.stringify(x))).join(" ");
  return JSON.stringify(d);
}
