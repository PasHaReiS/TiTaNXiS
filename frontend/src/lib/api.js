import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

export const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return new Intl.NumberFormat("tr-TR").format(Math.round(n));
};

export const RANKS = ["GOW", "R5", "R4", "R3", "R2", "R1"];

export const CATEGORIES = [
  { key: "bilgilendirme", label: "Bilgilendirme", section: "BİLGİLENDİRME" },
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
