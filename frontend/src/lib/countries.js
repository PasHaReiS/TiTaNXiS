// ISO 3166-1 country data for the member-locations feature.
//
// Each entry has:
//   iso2  — 2-letter alpha code (stored on the Member document)
//   iso3  — 3-letter alpha code (matches world-atlas topojson `properties.name` in most cases)
//   isoN  — string numeric ISO 3166-1 code (matches world-atlas topojson `id`)
//   name  — English display name
//   flag  — Unicode flag emoji (rendered in the dropdown)
//
// Curated to the ~65 countries most represented in mobile strategy game guilds.
// Adding a new country is a one-line change.

export const COUNTRIES = [
  { iso2: "TR", iso3: "TUR", isoN: "792", name: "Türkiye",        flag: "🇹🇷" },
  { iso2: "US", iso3: "USA", isoN: "840", name: "United States",  flag: "🇺🇸" },
  { iso2: "GB", iso3: "GBR", isoN: "826", name: "United Kingdom", flag: "🇬🇧" },
  { iso2: "DE", iso3: "DEU", isoN: "276", name: "Germany",        flag: "🇩🇪" },
  { iso2: "FR", iso3: "FRA", isoN: "250", name: "France",         flag: "🇫🇷" },
  { iso2: "ES", iso3: "ESP", isoN: "724", name: "Spain",          flag: "🇪🇸" },
  { iso2: "IT", iso3: "ITA", isoN: "380", name: "Italy",          flag: "🇮🇹" },
  { iso2: "NL", iso3: "NLD", isoN: "528", name: "Netherlands",    flag: "🇳🇱" },
  { iso2: "BE", iso3: "BEL", isoN: "056", name: "Belgium",        flag: "🇧🇪" },
  { iso2: "PT", iso3: "PRT", isoN: "620", name: "Portugal",       flag: "🇵🇹" },
  { iso2: "GR", iso3: "GRC", isoN: "300", name: "Greece",         flag: "🇬🇷" },
  { iso2: "IE", iso3: "IRL", isoN: "372", name: "Ireland",        flag: "🇮🇪" },
  { iso2: "AT", iso3: "AUT", isoN: "040", name: "Austria",        flag: "🇦🇹" },
  { iso2: "CH", iso3: "CHE", isoN: "756", name: "Switzerland",    flag: "🇨🇭" },
  { iso2: "SE", iso3: "SWE", isoN: "752", name: "Sweden",         flag: "🇸🇪" },
  { iso2: "NO", iso3: "NOR", isoN: "578", name: "Norway",         flag: "🇳🇴" },
  { iso2: "DK", iso3: "DNK", isoN: "208", name: "Denmark",        flag: "🇩🇰" },
  { iso2: "FI", iso3: "FIN", isoN: "246", name: "Finland",        flag: "🇫🇮" },
  { iso2: "PL", iso3: "POL", isoN: "616", name: "Poland",         flag: "🇵🇱" },
  { iso2: "CZ", iso3: "CZE", isoN: "203", name: "Czechia",        flag: "🇨🇿" },
  { iso2: "SK", iso3: "SVK", isoN: "703", name: "Slovakia",       flag: "🇸🇰" },
  { iso2: "HU", iso3: "HUN", isoN: "348", name: "Hungary",        flag: "🇭🇺" },
  { iso2: "RO", iso3: "ROU", isoN: "642", name: "Romania",        flag: "🇷🇴" },
  { iso2: "BG", iso3: "BGR", isoN: "100", name: "Bulgaria",       flag: "🇧🇬" },
  { iso2: "RS", iso3: "SRB", isoN: "688", name: "Serbia",         flag: "🇷🇸" },
  { iso2: "HR", iso3: "HRV", isoN: "191", name: "Croatia",        flag: "🇭🇷" },
  { iso2: "SI", iso3: "SVN", isoN: "705", name: "Slovenia",       flag: "🇸🇮" },
  { iso2: "BA", iso3: "BIH", isoN: "070", name: "Bosnia & Herz.", flag: "🇧🇦" },
  { iso2: "AL", iso3: "ALB", isoN: "008", name: "Albania",        flag: "🇦🇱" },
  { iso2: "MK", iso3: "MKD", isoN: "807", name: "North Macedonia", flag: "🇲🇰" },
  { iso2: "UA", iso3: "UKR", isoN: "804", name: "Ukraine",        flag: "🇺🇦" },
  { iso2: "BY", iso3: "BLR", isoN: "112", name: "Belarus",        flag: "🇧🇾" },
  { iso2: "RU", iso3: "RUS", isoN: "643", name: "Russia",         flag: "🇷🇺" },
  { iso2: "GE", iso3: "GEO", isoN: "268", name: "Georgia",        flag: "🇬🇪" },
  { iso2: "AZ", iso3: "AZE", isoN: "031", name: "Azerbaijan",     flag: "🇦🇿" },
  { iso2: "AM", iso3: "ARM", isoN: "051", name: "Armenia",        flag: "🇦🇲" },
  { iso2: "KZ", iso3: "KAZ", isoN: "398", name: "Kazakhstan",     flag: "🇰🇿" },
  { iso2: "UZ", iso3: "UZB", isoN: "860", name: "Uzbekistan",     flag: "🇺🇿" },
  { iso2: "CY", iso3: "CYP", isoN: "196", name: "Cyprus",         flag: "🇨🇾" },
  { iso2: "IL", iso3: "ISR", isoN: "376", name: "Israel",         flag: "🇮🇱" },
  { iso2: "SA", iso3: "SAU", isoN: "682", name: "Saudi Arabia",   flag: "🇸🇦" },
  { iso2: "AE", iso3: "ARE", isoN: "784", name: "UAE",            flag: "🇦🇪" },
  { iso2: "QA", iso3: "QAT", isoN: "634", name: "Qatar",          flag: "🇶🇦" },
  { iso2: "KW", iso3: "KWT", isoN: "414", name: "Kuwait",         flag: "🇰🇼" },
  { iso2: "EG", iso3: "EGY", isoN: "818", name: "Egypt",          flag: "🇪🇬" },
  { iso2: "MA", iso3: "MAR", isoN: "504", name: "Morocco",        flag: "🇲🇦" },
  { iso2: "TN", iso3: "TUN", isoN: "788", name: "Tunisia",        flag: "🇹🇳" },
  { iso2: "DZ", iso3: "DZA", isoN: "012", name: "Algeria",        flag: "🇩🇿" },
  { iso2: "ZA", iso3: "ZAF", isoN: "710", name: "South Africa",   flag: "🇿🇦" },
  { iso2: "NG", iso3: "NGA", isoN: "566", name: "Nigeria",        flag: "🇳🇬" },
  { iso2: "IN", iso3: "IND", isoN: "356", name: "India",          flag: "🇮🇳" },
  { iso2: "PK", iso3: "PAK", isoN: "586", name: "Pakistan",       flag: "🇵🇰" },
  { iso2: "BD", iso3: "BGD", isoN: "050", name: "Bangladesh",     flag: "🇧🇩" },
  { iso2: "CN", iso3: "CHN", isoN: "156", name: "China",          flag: "🇨🇳" },
  { iso2: "JP", iso3: "JPN", isoN: "392", name: "Japan",          flag: "🇯🇵" },
  { iso2: "KR", iso3: "KOR", isoN: "410", name: "South Korea",    flag: "🇰🇷" },
  { iso2: "TW", iso3: "TWN", isoN: "158", name: "Taiwan",         flag: "🇹🇼" },
  { iso2: "HK", iso3: "HKG", isoN: "344", name: "Hong Kong",      flag: "🇭🇰" },
  { iso2: "SG", iso3: "SGP", isoN: "702", name: "Singapore",      flag: "🇸🇬" },
  { iso2: "MY", iso3: "MYS", isoN: "458", name: "Malaysia",       flag: "🇲🇾" },
  { iso2: "TH", iso3: "THA", isoN: "764", name: "Thailand",       flag: "🇹🇭" },
  { iso2: "VN", iso3: "VNM", isoN: "704", name: "Vietnam",        flag: "🇻🇳" },
  { iso2: "PH", iso3: "PHL", isoN: "608", name: "Philippines",    flag: "🇵🇭" },
  { iso2: "ID", iso3: "IDN", isoN: "360", name: "Indonesia",      flag: "🇮🇩" },
  { iso2: "AU", iso3: "AUS", isoN: "036", name: "Australia",      flag: "🇦🇺" },
  { iso2: "NZ", iso3: "NZL", isoN: "554", name: "New Zealand",    flag: "🇳🇿" },
  { iso2: "CA", iso3: "CAN", isoN: "124", name: "Canada",         flag: "🇨🇦" },
  { iso2: "MX", iso3: "MEX", isoN: "484", name: "Mexico",         flag: "🇲🇽" },
  { iso2: "BR", iso3: "BRA", isoN: "076", name: "Brazil",         flag: "🇧🇷" },
  { iso2: "AR", iso3: "ARG", isoN: "032", name: "Argentina",      flag: "🇦🇷" },
  { iso2: "CL", iso3: "CHL", isoN: "152", name: "Chile",          flag: "🇨🇱" },
  { iso2: "CO", iso3: "COL", isoN: "170", name: "Colombia",       flag: "🇨🇴" },
  { iso2: "PE", iso3: "PER", isoN: "604", name: "Peru",           flag: "🇵🇪" },
  { iso2: "VE", iso3: "VEN", isoN: "862", name: "Venezuela",      flag: "🇻🇪" },
  { iso2: "UY", iso3: "URY", isoN: "858", name: "Uruguay",        flag: "🇺🇾" },
  { iso2: "IR", iso3: "IRN", isoN: "364", name: "Iran",           flag: "🇮🇷" },
  { iso2: "IQ", iso3: "IRQ", isoN: "368", name: "Iraq",           flag: "🇮🇶" },
];

// Fast lookups.
export const COUNTRY_BY_ISO2 = Object.fromEntries(COUNTRIES.map((c) => [c.iso2, c]));
export const COUNTRY_BY_ISON = Object.fromEntries(COUNTRIES.map((c) => [c.isoN, c]));

export function countryLabel(iso2) {
  const c = COUNTRY_BY_ISO2[(iso2 || "").toUpperCase()];
  return c ? `${c.flag} ${c.name}` : (iso2 || "—");
}
