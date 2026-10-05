import { useState } from "react";
import { WhopCheckoutEmbed, WhopExpressCheckoutButton } from "@whop/checkout/react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentButtonSkeleton, WhopLogo } from "@/components/auth/PaymentLogos";

/**
 * Whop's real one-click pay button. Clicking it opens Whop's floating payment
 * window on top of the page (no new tab). If Whop can't show its express
 * button for this buyer, a plain card button opens Whop's checkout in a
 * floating window instead.
 */
export default function WhopEmbed({
  sessionId,
  onDone,
}: {
  sessionId: string;
  onDone?: () => void;
}) {
  const [noExpress, setNoExpress] = useState(false);
  const [open, setOpen] = useState(false);
  const returnUrl = typeof window !== "undefined" ? window.location.href : "https://luofilm.site";

  return (
    <>
      {!noExpress && (
        <WhopExpressCheckoutButton
          checkoutConfigurationId={sessionId}
          methods={["whop-pay"]}
          returnUrl={returnUrl}
          theme="light"
          skipRedirect
          onComplete={() => onDone?.()}
          onExpressMethodResolved={({ rendered }) => {
            if (rendered === "none") setNoExpress(true);
          }}
          fallback={
            <PaymentButtonSkeleton />
          }
        />
      )}
      {noExpress && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 w-full items-center justify-center rounded-full bg-foreground text-[14px] font-bold text-background transition hover:opacity-90"
        >
          <span>Pay with</span>
          <WhopLogo />
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-[420px] overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Pay with card</DialogTitle>
          </DialogHeader>
          <WhopCheckoutEmbed
            sessionId={sessionId}
            theme="light"
            skipRedirect
            returnUrl={returnUrl}
            onComplete={() => {
              setOpen(false);
              onDone?.();
            }}
            fallback={<div className="p-6"><PaymentButtonSkeleton /></div>}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
