/* Brand marks for payment methods (official brand colours). */

export function CardLogo() {
  return (
    <span className="flex items-center gap-1">
      <svg viewBox="0 0 48 16" className="h-[11px] w-auto" aria-label="Visa">
        <text x="0" y="14" fontFamily="Arial Black, Arial, sans-serif" fontStyle="italic" fontWeight="900" fontSize="16" fill="#1A1F71">VISA</text>
      </svg>
      <svg viewBox="0 0 32 20" className="h-[14px] w-auto" aria-label="Mastercard">
        <circle cx="11" cy="10" r="9" fill="#EB001B" />
        <circle cx="21" cy="10" r="9" fill="#F79E1B" />
        <path d="M16 2.5a9 9 0 0 1 0 15 9 9 0 0 1 0-15z" fill="#FF5F00" />
      </svg>
    </span>
  );
}

export function GooglePayLogo() {
  return (
    <span className="flex items-center gap-[3px]">
      <svg viewBox="0 0 48 48" className="size-[14px]" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
        <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
      </svg>
      <span className="text-[12px] font-semibold tracking-tight text-[#5F6368]">Pay</span>
    </span>
  );
}

export function ApplePayLogo() {
  return (
    <span className="flex items-center gap-[2px] text-[#000]">
      <svg viewBox="0 0 384 512" className="h-[13px] w-auto" aria-hidden fill="currentColor">
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
      <span className="text-[12.5px] font-semibold tracking-tight">Pay</span>
    </span>
  );
}

export function MobileMoneyLogo({ providers }: { providers: string[] }) {
  const colors: Record<string, [string, string, string]> = {
    mtn: ["#FFCC00", "#004F71", "MTN"],
    airtel: ["#E40000", "#FFFFFF", "airtel"],
    "m-pesa": ["#4CAF50", "#FFFFFF", "M-PESA"],
    vodacom: ["#E60000", "#FFFFFF", "Voda"],
    orange: ["#FF7900", "#000000", "orange"],
    tigo: ["#00377B", "#FFFFFF", "tigo"],
  };
  const marks = providers
    .map((p) => Object.entries(colors).find(([k]) => p.toLowerCase().includes(k))?.[1])
    .filter(Boolean)
    .slice(0, 2) as Array<[string, string, string]>;
  return (
    <span className="flex items-center gap-[3px]">
      {marks.map(([bg, fg, label]) => (
        <span
          key={label}
          style={{ background: bg, color: fg }}
          className="rounded-[4px] px-[4px] py-[2px] text-[8.5px] font-black leading-none tracking-tight"
        >
          {label}
        </span>
      ))}
    </span>
  );
}

export function PayPalLogo() {
  return (
    <span className="text-[13px] font-black italic tracking-tight" aria-label="PayPal">
      <span className="text-[#003087]">Pay</span>
      <span className="text-[#009CDE]">Pal</span>
    </span>
  );
}

export function WhopLogo() {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Whop">
      <svg viewBox="0 0 24 24" className="size-[17px]" aria-hidden>
        <rect width="24" height="24" rx="6" fill="#FF6243" />
        <path d="M5.2 7.2h3.2l1.4 6.1 1.1-4.5h2.5l1.1 4.5 1.4-6.1h3.1l-2.8 9.6h-3l-1.1-4.2-1.1 4.2H8z" fill="#FFFFFF" />
      </svg>
      <span className="text-[13px] font-black leading-none text-foreground">whop</span>
    </span>
  );
}

export function PaymentButtonSkeleton() {
  return (
    <div className="flex h-11 w-full animate-pulse items-center justify-center gap-2 rounded-full bg-foreground/10" aria-label="Loading payment button">
      <span className="size-4 rounded bg-foreground/15" />
      <span className="h-3 w-24 rounded bg-foreground/15" />
    </div>
  );
}
