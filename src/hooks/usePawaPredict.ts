import { useEffect, useState } from "react";
import { pawaPredict } from "@/lib/pawapay.functions";

/** Maps PawaPay provider codes (e.g. MTN_MOMO_UGA) to brand names used by ProviderPayLabel. */
function brand(code: string): string | null {
  const c = code.toUpperCase();
  if (c.startsWith("MTN")) return "MTN MoMo";
  if (c.startsWith("AIRTEL")) return "Airtel Money";
  if (c.startsWith("MPESA") || c.includes("MPESA")) return "M-Pesa";
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

/** Asks PawaPay which network a number belongs to (debounced); falls back to the local prefix guess. */
export function usePawaPredict(phone: string, dial: string | undefined, fallback: string | null) {
  const [predicted, setPredicted] = useState<string | null>(null);
  useEffect(() => {
    setPredicted(null);
    const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length < 8) return;
    const d = (dial ?? "").replace(/\D/g, "");
    const full = d && !digits.startsWith(d) ? d + digits : digits;
    let alive = true;
    const t = setTimeout(async () => {
      const r = await pawaPredict({ data: { phone: full } }).catch(() => null);
      if (alive && r?.ok) setPredicted(brand(r.provider));
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [phone, dial]);
  return predicted ?? fallback;
}
