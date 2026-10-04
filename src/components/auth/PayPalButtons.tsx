import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { startPayPal } from "@/lib/payments";
import type { Row } from "@/lib/fdb";

const CLIENT_ID =
  "BAA1V2BeV9eEaiwruLcISfdK1zxmx4PMVhKGFzdThPHBHHtMWH6DXBcnxaIpHu1smiJ_Xz39y27jT5-bwg";

type PayPalSdk = {
  Buttons: (opts: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
};

function loadSdk(currency: string): Promise<PayPalSdk> {
  const id = `paypal-sdk-${currency}`;
  const w = window as unknown as Record<string, PayPalSdk | undefined>;
  const ns = `paypal_${currency}`;
  if (w[ns]) return Promise.resolve(w[ns]!);
  return new Promise((resolve, reject) => {
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement("script");
      s.id = id;
      s.src = `https://www.paypal.com/sdk/js?client-id=${CLIENT_ID}&currency=${currency}&intent=capture&components=buttons&enable-funding=card`;
      s.setAttribute("data-namespace", ns);
      document.head.appendChild(s);
    }
    s.addEventListener("load", () => (w[ns] ? resolve(w[ns]!) : reject(new Error("PayPal failed to load."))));
    s.addEventListener("error", () => reject(new Error("PayPal failed to load.")));
  });
}

/** PayPal's own buttons, shown inside the page (opens PayPal in a pop-up, never leaves the site). */
export function PayPalButtons({
  tx,
  onApproved,
  onError,
}: {
  tx: Row;
  onApproved: () => void;
  onError: (msg: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let btn: { close?: () => void } | null = null;
    void (async () => {
      try {
        const order = await startPayPal(tx);
        const sdk = await loadSdk(order.currency);
        if (cancelled || !box.current) return;
        box.current.innerHTML = "";
        const b = sdk.Buttons({
          style: { layout: "vertical", shape: "pill", label: "pay", height: 45 },
          createOrder: () => order.orderId,
          onApprove: async () => onApproved(),
          onError: () => onError("PayPal could not finish the payment. No money was taken."),
        });
        btn = b;
        await b.render(box.current);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : "PayPal could not start.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      btn?.close?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.id]);

  return (
    <div className="mt-4 rounded-2xl bg-card p-3">
      {loading && <Loader2 className="mx-auto my-3 size-5 animate-spin opacity-60" />}
      <div ref={box} />
    </div>
  );
}
