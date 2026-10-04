import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { startPayPal, syncPayPalPayment } from "@/lib/payments";
import type { Row } from "@/lib/fdb";

const CLIENT_ID =
  "BAA1V2BeV9eEaiwruLcISfdK1zxmx4PMVhKGFzdThPHBHHtMWH6DXBcnxaIpHu1smiJ_Xz39y27jT5-bwg";

type PayPalPaymentSession = {
  start: (
    options: { presentationMode: "modal" },
    order: Promise<{ orderId: string }>,
  ) => Promise<void>;
};

type PayPalSdk = {
  createInstance: (options: { clientId: string; components: string[] }) => Promise<{
    findEligibleMethods: () => Promise<{ isEligible: (method: string) => boolean }>;
    createPayPalOneTimePaymentSession: (callbacks: {
      onApprove: (data: { orderId: string }) => Promise<unknown>;
      onCancel: () => void;
      onError: (error: unknown) => void;
    }) => Promise<PayPalPaymentSession>;
  }>;
};

function loadSdk(): Promise<PayPalSdk> {
  const id = "paypal-web-sdk-v6";
  const w = window as unknown as { paypal?: PayPalSdk };
  if (w.paypal?.createInstance) return Promise.resolve(w.paypal);
  return new Promise((resolve, reject) => {
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement("script");
      s.id = id;
      s.src = "https://www.paypal.com/web-sdk/v6/core";
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", () => {
      if (w.paypal?.createInstance) resolve(w.paypal);
      else reject(new Error("PayPal failed to load."));
    });
    s.addEventListener("error", () => reject(new Error("PayPal failed to load.")));
  });
}

/** PayPal's real button. Its v6 SDK presents approval in PayPal's modal rather than navigating away. */
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
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let button: HTMLElement | null = null;
    let clickHandler: (() => void) | null = null;
    void (async () => {
      try {
        const sdk = await loadSdk();
        const instance = await sdk.createInstance({
          clientId: CLIENT_ID,
          components: ["paypal-payments"],
        });
        const eligibility = await instance.findEligibleMethods();
        if (!eligibility.isEligible("paypal")) throw new Error("PayPal is not available on this device.");
        if (cancelled || !box.current) return;
        const session = await instance.createPayPalOneTimePaymentSession({
          onApprove: async () => {
            const result = await syncPayPalPayment(String(tx.id));
            if (result.status === "failed") throw new Error(result.message);
            onApproved();
            return result;
          },
          onCancel: () => {
            setStarting(false);
            onError("PayPal payment was cancelled. No money was taken.");
          },
          onError: () => {
            setStarting(false);
            onError("PayPal could not finish the payment. No money was taken.");
          },
        });
        if (cancelled || !box.current) return;
        box.current.innerHTML = "";
        button = document.createElement("paypal-button");
        button.setAttribute("type", "pay");
        button.setAttribute("aria-label", "Pay securely with PayPal");
        button.className = "block min-h-11 w-full overflow-hidden rounded-md";
        clickHandler = () => {
          setStarting(true);
          const orderPromise = startPayPal(tx).then((order) => ({ orderId: order.orderId }));
          void session.start({ presentationMode: "modal" }, orderPromise).catch((error: unknown) => {
            setStarting(false);
            onError(error instanceof Error ? error.message : "PayPal could not start.");
          });
        };
        button.addEventListener("click", clickHandler);
        box.current.appendChild(button);
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : "PayPal could not start.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (button && clickHandler) button.removeEventListener("click", clickHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.id]);

  return (
    <div className="relative mt-4 rounded-2xl bg-card p-3 shadow-lg ring-1 ring-border">
      {(loading || starting) && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl bg-card/80">
          <Loader2 className="size-5 animate-spin opacity-60" />
        </div>
      )}
      <div ref={box} className="min-h-11" />
    </div>
  );
}
