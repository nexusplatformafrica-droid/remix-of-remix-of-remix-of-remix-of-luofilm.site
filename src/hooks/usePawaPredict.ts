import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pawaPredict, pawaProviders } from "@/lib/pawapay.functions";
import { providerFromPhone, type CountryInfo } from "@/lib/countries";

/** Maps PawaPay provider codes (e.g. MTN_MOMO_UGA) to brand names used by ProviderPayLabel. */
export function brandOf(code: string): string | null {
  const c = code.toUpperCase();
  if (c.startsWith("MTN")) return "MTN MoMo";
  if (c.startsWith("AIRTEL")) return "Airtel Money";
  if (c.includes("MPESA")) return "M-Pesa";
  if (c.startsWith("VODACOM")) return "Vodacom";
  if (c.startsWith("ORANGE")) return "Orange";
  if (c.startsWith("FREE")) return "Free";
  if (c.startsWith("MOOV")) return "Moov";
  if (c.startsWith("EMOLA")) return "e-Mola";
  if (c.startsWith("ZAMTEL")) return "Zamtel";
  if (c.startsWith("AFRICELL")) return "Africell";
  if (c.startsWith("WAVE")) return "Wave";
  return code ? (code.split("_")[0] ?? null) : null;
}

const cache = new Map<string, string | null>();

/**
 * Mobile money network for a number: asks PawaPay once the number is complete,
 * remembers the answer, and falls back to the local prefix guess if PawaPay is unreachable.
 */
export function useMomoNetwork(phone: string, country: CountryInfo | null | undefined, enabled = true) {
  const iso3 = country?.iso3 ?? "";
  const dial = country?.dial ?? "";
  const localLength = country?.localLength ?? 0;
  const { data: providers = [] } = useQuery({
    queryKey: ["pawa-providers", iso3],
    queryFn: () => pawaProviders({ data: { country: iso3 } }),
    enabled: enabled && /^[A-Z]{3}$/.test(iso3),
    staleTime: 30 * 60_000,
  });

  let digits = phone.replace(/\D/g, "");
  if (dial && digits.startsWith(dial) && digits.length > localLength) digits = digits.slice(dial.length);
  digits = digits.replace(/^0+/, "");
  const complete = enabled && !!dial && digits.length === localLength;
  const msisdn = complete ? dial + digits : "";

  const [result, setResult] = useState<{ msisdn: string; code: string | null } | null>(null);

  useEffect(() => {
    if (!msisdn) return;
    if (cache.has(msisdn)) {
      setResult({ msisdn, code: cache.get(msisdn) ?? null });
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const r = await pawaPredict({ data: { phone: msisdn } }).catch(() => null);
      const code = r?.ok && r.provider ? r.provider : null;
      cache.set(msisdn, code);
      if (alive) setResult({ msisdn, code });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [msisdn]);

  const settled = result && result.msisdn === msisdn ? result : null;
  const checking = complete && !settled;
  let code = settled?.code ?? null;
  // PawaPay unreachable: use the local prefix guess so the button still names a network.
  if (settled && !code && country) {
    const guess = providerFromPhone(digits, country);
    code = providers.find((p) => brandOf(p.provider) === guess)?.provider ?? null;
  }
  const logo = code ? providers.find((p) => p.provider === code)?.logo ?? "" : "";
  return { code: complete ? code : null, name: complete && code ? brandOf(code) : null, logo: complete ? logo : "", checking };
}
