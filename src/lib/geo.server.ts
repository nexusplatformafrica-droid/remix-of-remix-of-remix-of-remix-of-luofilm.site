import { currencyForCountry } from "./country-currency";
/** Live exchange rates (base USD), cached for an hour per worker. */
let cache: { at: number; rates: Record<string, number> } | null = null;

const FALLBACK: Record<string, number> = { UGX: 3700, KES: 129, TZS: 2600, RWF: 1400, CDF: 2850 };

export async function usdRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.rates;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = (await res.json()) as { rates?: Record<string, number> };
    if (json.rates?.["UGX"]) {
      cache = { at: Date.now(), rates: json.rates };
      return json.rates;
    }
  } catch {
    /* fall through */
  }
  return cache?.rates ?? { USD: 1, ...FALLBACK };
}

/** Units of `currency` per 1 USD. */
export async function usdRate(currency: string) {
  const rates = await usdRates();
  return rates[currency.toUpperCase()] ?? FALLBACK[currency.toUpperCase()] ?? 1;
}

export type GeoResult = { code: string; name: string; currency: string; dial: string };

/** Looks up the visitor's country from their real network address. */
export async function lookupIp(headers: Headers): Promise<GeoResult | null> {
  const ip =
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "";
  const cfCountry = headers.get("cf-ipcountry");
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    const j = (await res.json()) as {
      success?: boolean;
      country?: string;
      country_code?: string;
      calling_code?: string;
      currency?: { code?: string };
    };
    if (j.success && j.country_code) {
      return {
        code: j.country_code.toUpperCase(),
        name: j.country ?? j.country_code,
        currency: (currencyForCountry(j.country_code) ?? j.currency?.code ?? "USD").toUpperCase(),
        dial: String(j.calling_code ?? ""),
      };
    }
  } catch {
    /* fall through */
  }
  if (cfCountry && cfCountry !== "XX") {
    return { code: cfCountry.toUpperCase(), name: cfCountry.toUpperCase(), currency: currencyForCountry(cfCountry) ?? "USD", dial: "" };
  }
  return null;
}
