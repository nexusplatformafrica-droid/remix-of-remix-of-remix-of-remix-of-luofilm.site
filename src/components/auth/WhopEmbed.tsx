import { WhopCheckoutEmbed } from "@whop/checkout/react";

/** Whop's own embedded checkout: card, Apple Pay and Google Pay buttons come from Whop. */
export default function WhopEmbed({
  sessionId,
  onDone,
}: {
  sessionId: string;
  onDone?: () => void;
}) {
  return (
    <WhopCheckoutEmbed
      sessionId={sessionId}
      theme="light"
      skipRedirect
      onComplete={() => onDone?.()}
      fallback={<div className="p-6 text-center text-xs opacity-60">Loading secure payment…</div>}
    />
  );
}
