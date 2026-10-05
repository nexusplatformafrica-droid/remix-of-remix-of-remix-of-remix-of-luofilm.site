import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Wallet, XCircle } from "lucide-react";

/* Brand colours of each network, keyed by the first word of its name. */
const BRAND: Record<string, { bg: string; fg: string }> = {
  mtn: { bg: "#FFCC00", fg: "#1A1A1A" },
  airtel: { bg: "#E40000", fg: "#FFFFFF" },
  "m": { bg: "#3FAE29", fg: "#FFFFFF" }, // M-Pesa
  mpesa: { bg: "#3FAE29", fg: "#FFFFFF" },
  vodacom: { bg: "#E60000", fg: "#FFFFFF" },
  orange: { bg: "#FF7900", fg: "#FFFFFF" },
  free: { bg: "#CD1E25", fg: "#FFFFFF" },
  moov: { bg: "#0058A3", fg: "#FFFFFF" },
  zamtel: { bg: "#00A651", fg: "#FFFFFF" },
  africell: { bg: "#6A1B9A", fg: "#FFFFFF" },
  wave: { bg: "#1DC8FF", fg: "#0B1F3A" },
  "e": { bg: "#F7931E", fg: "#FFFFFF" }, // e-Mola
};
/* Used when the network list didn't include a logo. */
const FALLBACK_LOGO: Record<string, string> = {
  mtn: "https://static-content.pawapay.io/provider_logos/mtn.png",
  airtel: "https://static-content.pawapay.io/provider_logos/airtel.png",
  m: "https://static-content.pawapay.io/provider_logos/mpesa.png",
  vodacom: "https://static-content.pawapay.io/provider_logos/vodacom.png",
  orange: "https://static-content.pawapay.io/provider_logos/orange.png",
  free: "https://static-content.pawapay.io/provider_logos/free.png",
  moov: "https://static-content.pawapay.io/provider_logos/moov.png",
  zamtel: "https://static-content.pawapay.io/provider_logos/zamtel.png",
};
const NEUTRAL = { bg: "#5B5BD6", fg: "#FFFFFF" };
const SUCCESS = { bg: "#16A34A", fg: "#FFFFFF" };
const FAIL = { bg: "#DC2626", fg: "#FFFFFF" };
const LOW = { bg: "#B45309", fg: "#FFFFFF" };

const keyOf = (name: string | null) => (name ?? "").split(/[\s-]/)[0]!.toLowerCase();

export type MomoState = "idle" | "waiting" | "success" | "failed" | "insufficient";

/** Reads a payment failure message and tells apart "not enough money". */
export function momoFailState(message: string): MomoState {
  return /insufficient|not enough|balance|low funds/i.test(message) ? "insufficient" : "failed";
}

type Props = {
  name: string | null;
  logo: string;
  checking: boolean;
  state?: MomoState | undefined;
  disabled?: boolean | undefined;
  onClick: () => void;
  className?: string | undefined;
};

/** Whop-style solid pay button: detected network's colour + logo, and the payment result. */
export function MomoPayButton({ name, logo, checking, state = "idle", disabled, onClick, className }: Props) {
  const [broken, setBroken] = useState(false);
  const k = keyOf(name);
  const src = logo || FALLBACK_LOGO[k] || "";
  const c =
    state === "success" ? SUCCESS : state === "failed" ? FAIL : state === "insufficient" ? LOW : BRAND[k] || NEUTRAL;
  const busy = state === "waiting" || state === "success";
  const logoChip =
    src && !broken ? (
      <span className="flex h-7 items-center rounded-md bg-white px-1.5 shadow-sm">
        <img src={src} alt={name ?? ""} onError={() => setBroken(true)} className="h-5 w-auto max-w-[48px] object-contain" />
      </span>
    ) : name ? (
      <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-black">{name.split(" ")[0]}</span>
    ) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || checking || busy}
      style={{ backgroundColor: c.bg, color: c.fg }}
      className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[16px] font-semibold shadow-sm transition hover:brightness-105 active:scale-[0.99] disabled:cursor-default ${checking ? "opacity-80" : ""} ${className ?? ""}`}
    >
      {state === "waiting" ? (
        <>
          <Loader2 className="size-4 animate-spin" /> {logoChip} Approve on your phone…
        </>
      ) : state === "success" ? (
        <>
          <CheckCircle2 className="size-5" /> Payment successful
        </>
      ) : state === "insufficient" ? (
        <>
          <Wallet className="size-5" /> Not enough money · Try again
        </>
      ) : state === "failed" ? (
        <>
          <XCircle className="size-5" /> Payment failed · Try again <RotateCcw className="size-4" />
        </>
      ) : checking ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Checking network…
        </>
      ) : (
        <>
          {logoChip}
          Pay
        </>
      )}
    </button>
  );
}
