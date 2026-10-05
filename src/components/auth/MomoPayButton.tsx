import { useState } from "react";
import { Loader2 } from "lucide-react";

/* Brand colours of each network, used only for its own pay button. */
const BRAND: Record<string, { bg: string; fg: string }> = {
  "MTN MoMo": { bg: "#FFCC00", fg: "#1A1A1A" },
  "Airtel Money": { bg: "#E40000", fg: "#FFFFFF" },
  "M-Pesa": { bg: "#3FAE29", fg: "#FFFFFF" },
  Vodacom: { bg: "#E60000", fg: "#FFFFFF" },
  Orange: { bg: "#FF7900", fg: "#FFFFFF" },
  Free: { bg: "#CD1E25", fg: "#FFFFFF" },
  Moov: { bg: "#0058A3", fg: "#FFFFFF" },
  Zamtel: { bg: "#00A651", fg: "#FFFFFF" },
  Africell: { bg: "#6A1B9A", fg: "#FFFFFF" },
  Wave: { bg: "#1DC8FF", fg: "#0B1F3A" },
};
const NEUTRAL = { bg: "#5B5BD6", fg: "#FFFFFF" };

type Props = {
  name: string | null;
  logo: string;
  checking: boolean;
  label?: string | null | undefined;
  disabled?: boolean | undefined;
  onClick: () => void;
  className?: string | undefined;
};

/** Whop-style solid pay button showing only the detected network's logo. */
export function MomoPayButton({ name, logo, checking, label, disabled, onClick, className }: Props) {
  const [broken, setBroken] = useState(false);
  const c = (name && BRAND[name]) || NEUTRAL;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || checking}
      style={{ backgroundColor: c.bg, color: c.fg }}
      className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[16px] font-semibold shadow-sm transition hover:brightness-105 active:scale-[0.99] disabled:opacity-70 ${className ?? ""}`}
    >
      {label ? (
        label
      ) : checking ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Checking network…
        </>
      ) : (
        <>
          {logo && !broken ? (
            <img src={logo} alt={name ?? ""} onError={() => setBroken(true)} className="h-6 w-auto max-w-[44px] rounded-[4px] object-contain" />
          ) : null}
          Pay
        </>
      )}
    </button>
  );
}
