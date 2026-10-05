import { Loader2 } from "lucide-react";
import { brandOf } from "@/hooks/usePawaPredict";

type Props = {
  providers: { provider: string; displayName: string; logo: string }[];
  code: string | null;
  checking: boolean;
  onChoose: (code: string) => void;
  disabled?: boolean;
};

/** Network chips from PawaPay; the predicted one is selected, the customer can tap another. */
export function NetworkPicker({ providers, code, checking, onChoose, disabled }: Props) {
  if (!providers.length && !checking) return null;
  return (
    <div className="mt-1.5">
      <p className="flex items-center gap-1 text-[10.5px] font-semibold opacity-75">
        {checking ? (
          <>
            <Loader2 className="size-3 animate-spin" /> Checking your network…
          </>
        ) : code ? (
          <>Network: {brandOf(code)} — not right? Tap yours</>
        ) : (
          <>Choose your network</>
        )}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {providers.map((p) => {
          const active = p.provider === code;
          return (
            <button
              key={p.provider}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(p.provider)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
                active ? "bg-foreground text-background ring-foreground" : "bg-background/60 ring-black/15 hover:ring-black/40"
              }`}
            >
              {p.logo && <img src={p.logo} alt="" className="size-4 rounded-sm object-contain" />}
              {brandOf(p.provider) ?? p.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
