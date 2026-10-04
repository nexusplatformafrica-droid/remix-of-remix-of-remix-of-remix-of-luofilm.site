import { currencyForCountry } from "./country-currency";
/**
 * Supported mobile money countries (PawaPay).
 *
 * Plan prices are authored in UGX; every other country sees the same plan
 * converted into its own currency, rounded to a friendly amount and clamped
 * into the mobile-money limits the backend enforces.
 */

export type CountryInfo = {
  code: string;
  /** ISO 3166-1 alpha-3 code used by PawaPay. */
  iso3?: string;
  name: string;
  short: string;
  flag: string;
  currency: string;
  /** How much 1 UGX is worth in this currency. */
  rate: number;
  /** Rounding step used when converting a UGX price. */
  step: number;
  dial: string;
  /** National number length after the dial code. */
  localLength: number;
  min: number;
  max: number;
  providers: string[];
};

export const COUNTRIES: CountryInfo[] = [
  { code: "UG", iso3: "UGA", name: "Uganda", short: "UG", flag: "🇺🇬", currency: "UGX", rate: 1, step: 500, dial: "256", localLength: 9, min: 500, max: 5000000, providers: ["MTN MoMo", "Airtel Money"] },
  { code: "KE", iso3: "KEN", name: "Kenya", short: "KE", flag: "🇰🇪", currency: "KES", rate: 0.0351, step: 10, dial: "254", localLength: 9, min: 10, max: 250000, providers: ["M-Pesa"] },
  { code: "RW", iso3: "RWA", name: "Rwanda", short: "RW", flag: "🇷🇼", currency: "RWF", rate: 0.378, step: 100, dial: "250", localLength: 9, min: 100, max: 5000000, providers: ["MTN MoMo", "Airtel Money"] },
  { code: "CD", iso3: "COD", name: "DR Congo", short: "CD", flag: "🇨🇩", currency: "CDF", rate: 0.77, step: 500, dial: "243", localLength: 9, min: 500, max: 5000000, providers: ["Vodacom M-Pesa", "Airtel Money", "Orange Money"] },
  { code: "ZM", iso3: "ZMB", name: "Zambia", short: "ZM", flag: "🇿🇲", currency: "ZMW", rate: 0.0072, step: 1, dial: "260", localLength: 9, min: 1, max: 100000, providers: ["MTN MoMo", "Airtel Money", "Zamtel"] },
  { code: "MZ", iso3: "MOZ", name: "Mozambique", short: "MZ", flag: "🇲🇿", currency: "MZN", rate: 0.0173, step: 10, dial: "258", localLength: 9, min: 10, max: 500000, providers: ["M-Pesa", "e-Mola"] },
  { code: "CM", iso3: "CMR", name: "Cameroon", short: "CM", flag: "🇨🇲", currency: "XAF", rate: 0.16, step: 100, dial: "237", localLength: 9, min: 100, max: 2000000, providers: ["MTN MoMo", "Orange Money"] },
  { code: "GA", iso3: "GAB", name: "Gabon", short: "GA", flag: "🇬🇦", currency: "XAF", rate: 0.16, step: 100, dial: "241", localLength: 8, min: 100, max: 2000000, providers: ["Airtel Money"] },
  { code: "CG", iso3: "COG", name: "Republic of the Congo", short: "CG", flag: "🇨🇬", currency: "XAF", rate: 0.16, step: 100, dial: "242", localLength: 9, min: 100, max: 2000000, providers: ["MTN MoMo", "Airtel Money"] },
  { code: "BJ", iso3: "BEN", name: "Benin", short: "BJ", flag: "🇧🇯", currency: "XOF", rate: 0.16, step: 100, dial: "229", localLength: 10, min: 100, max: 2000000, providers: ["MTN MoMo", "Moov Money"] },
  { code: "CI", iso3: "CIV", name: "Côte d'Ivoire", short: "CI", flag: "🇨🇮", currency: "XOF", rate: 0.16, step: 100, dial: "225", localLength: 10, min: 100, max: 2000000, providers: ["MTN MoMo", "Orange Money", "Wave"] },
  { code: "SN", iso3: "SEN", name: "Senegal", short: "SN", flag: "🇸🇳", currency: "XOF", rate: 0.16, step: 100, dial: "221", localLength: 9, min: 100, max: 2000000, providers: ["Orange Money", "Free Money", "Wave"] },
  { code: "SL", iso3: "SLE", name: "Sierra Leone", short: "SL", flag: "🇸🇱", currency: "SLE", rate: 0.0061, step: 1, dial: "232", localLength: 8, min: 1, max: 100000, providers: ["Orange Money", "Africell Money"] },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]!;

export function countryByCode(code?: string | null) {
  return COUNTRIES.find((c) => c.code === String(code ?? "").toUpperCase()) ?? DEFAULT_COUNTRY;
}

export function countryByCurrency(currency?: string | null) {
  return (
    COUNTRIES.find((c) => c.currency === String(currency ?? "").toUpperCase()) ?? DEFAULT_COUNTRY
  );
}

/** Detects the country from an international/local phone number. */
export function countryFromPhone(input: string): CountryInfo | null {
  const digits = (input ?? "").replace(/[^0-9]/g, "");
  return COUNTRIES.find((c) => digits.startsWith(c.dial)) ?? null;
}

/** Converts a UGX plan price into the country's currency (rounded + clamped). */
export function convertPrice(ugx: number, country: CountryInfo) {
  const raw = Number(ugx || 0) * country.rate;
  const rounded = Math.max(country.step, Math.round(raw / country.step) * country.step);
  return Math.min(Math.max(rounded, country.min), country.max);
}

/** Flags a converted amount that falls outside the provider limits. */
export function priceNotice(amount: number, country: CountryInfo): "low" | "high" | null {
  if (amount < country.min) return "low";
  if (amount > country.max) return "high";
  return null;
}

export function formatAmount(amount: number, currency: string) {
  const n = Number(amount) || 0;
  const v = n < 100 && n % 1 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US");
  return `${currency} ${v}`;
}

/** Normalises a local number into +<dial><national> for the chosen country. */
export function normalizeFor(input: string, country: CountryInfo) {
  let d = (input ?? "").replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith(country.dial)) return `+${d}`;
  if (d.startsWith("0")) d = d.slice(1);
  return `+${country.dial}${d}`;
}

export function isValidFor(input: string, country: CountryInfo) {
  const msisdn = normalizeFor(input, country);
  return new RegExp(`^\\+${country.dial}\\d{${country.localLength}}$`).test(msisdn);
}

/** CDN flag image for a country (used where the emoji flag renders poorly). */
export function flagUrl(country: CountryInfo, width: 20 | 40 | 80 = 40) {
  return `https://flagcdn.com/w${width}/${country.code.toLowerCase()}.png`;
}

/** Human phone format hint, e.g. "+256 7XX XXX XXX". */
export function phoneFormat(country: CountryInfo) {
  const body = "X".repeat(country.localLength).replace(/^X/, "7");
  const grouped = body.match(/.{1,3}/g)?.join(" ") ?? body;
  return `+${country.dial} ${grouped}`;
}

/** True when mobile money is offered in this country. */
export function hasMobileMoney(code?: string | null) {
  return COUNTRIES.some((c) => c.code === String(code ?? "").toUpperCase());
}

/**
 * Resolves any world country into CountryInfo using live USD rates.
 * Mobile-money countries keep their limits/providers; others are card-only.
 */
export function resolveCountry(
  code: string,
  geo: { name?: string; currency?: string; dial?: string } | null,
  rates: Record<string, number> | null,
): CountryInfo {
  const known = COUNTRIES.find((c) => c.code === code.toUpperCase());
  const mapped = currencyForCountry(code);
  let currency = (known?.currency ?? mapped ?? geo?.currency ?? "USD").toUpperCase();
  // Prefer a currency the live rate table actually knows.
  if (rates && !rates[currency] && geo?.currency && rates[geo.currency.toUpperCase()])
    currency = geo.currency.toUpperCase();
  const ugxPerUsd = rates?.["UGX"] ?? 3700;
  const curPerUsd = rates?.[currency] ?? (currency === "USD" ? 1 : undefined);
  const liveRate = ugxPerUsd && curPerUsd ? curPerUsd / ugxPerUsd : null;
  if (known) return liveRate ? { ...known, rate: liveRate } : known;
  const rate = liveRate ?? (rates?.["UGX"] ? 1 / rates["UGX"] : 1 / 3700);
  const sample = 10000 * rate;
  const step = sample >= 5000 ? 100 : sample >= 500 ? 10 : sample >= 20 ? 1 : 0.01;
  return {
    code: code.toUpperCase(),
    name: geo?.name ?? code.toUpperCase(),
    short: code.toUpperCase(),
    flag: "",
    currency: liveRate ? currency : "USD",
    rate,
    step,
    dial: geo?.dial ?? "",
    localLength: 9,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    providers: [],
  };
}
