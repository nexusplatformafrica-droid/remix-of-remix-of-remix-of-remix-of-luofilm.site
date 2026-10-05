import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pawaPredict, pawaProviders } from "@/lib/pawapay.functions";
import type { CountryInfo } from "@/lib/countries";

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

/**
 * Mobile money network for a number: PawaPay's live networks for the country,
 * PawaPay's prediction once the number is complete, and a manual override the
 * customer can tap when their number was moved to another network.
 */
export function useMomoNetwork(phone: string, country: CountryInfo | null | undefined, enabled = true) {
  const iso3 = country?.iso3 ?? "";
  const { data: providers = [] } = useQuery({
    queryKey: ["pawa-providers", iso3],
    queryFn: () => pawaProviders({ data: { country: iso3 } }),
    enabled: enabled && /^[A-Z]{3}$/.test(iso3),
    staleTime: 30 * 60_000,
  });

  const [predicted, setPredicted] = useState<string | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setPredicted(null);
    setOverride(null);
    if (!enabled || !country) return;
    let digits = phone.replace(/\D/g, "");
    if (digits.startsWith(country.dial) && digits.length > country.localLength) digits = digits.slice(country.dial.length);
    digits = digits.replace(/^0+/, "");
    // Only ask PawaPay once the number is complete — partial numbers predict the wrong network.
    if (digits.length !== country.localLength) return;
    let alive = true;
    setChecking(true);
    const t = setTimeout(async () => {
      const r = await pawaPredict({ data: { phone: country.dial + digits } }).catch(() => null);
      if (!alive) return;
      setChecking(false);
      if (r?.ok && r.provider) setPredicted(r.provider);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
      setChecking(false);
    };
  }, [phone, country, enabled]);

  const code = override ?? predicted;
  return {
    providers,
    code,
    name: code ? brandOf(code) : null,
    checking,
    choose: setOverride,
  };
}
