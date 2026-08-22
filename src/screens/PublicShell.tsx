import { useTranslation } from "react-i18next";
import { QrCode } from "lucide-react";

/**
 * The only decorative element in the product: the logo mark blown up to screen
 * scale. Horizontal lines are floor levels, the two verticals are guide rails,
 * the solid block is the car. It is the grid itself, not an illustration.
 */
function ShaftGraphic() {
  return (
    <svg
      viewBox="0 0 220 300"
      className="h-full w-full text-primary/25"
      fill="none"
      aria-hidden="true"
    >
      {[40, 80, 120, 160, 200, 240].map((y) => (
        <line key={y} x1="10" y1={y} x2="210" y2={y} stroke="currentColor" strokeWidth="1.5" />
      ))}
      <line x1="72" y1="10" x2="72" y2="290" stroke="currentColor" strokeWidth="2" />
      <line x1="148" y1="10" x2="148" y2="290" stroke="currentColor" strokeWidth="2" />
      <rect x="72" y="120" width="76" height="80" rx="3" className="fill-primary/70" />
    </svg>
  );
}


/**
 * The frame every screen a signed-out person can reach is drawn in.
 *
 * Lifted out of the login screen once there were five of these. Registration,
 * password reset, verification and invitation acceptance are all the same
 * moment from the product's point of view — somebody outside, trying to get in
 * — and drawing them differently would make the product look like it changed
 * hands between steps.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
      {/* Brand panel is always dark: it is the one surface where the product
          gets to have presence, and it reads the same in either theme. */}
      <div className="dark relative hidden flex-col justify-between overflow-hidden bg-background p-12 lg:flex">
        <div className="flex items-center gap-2.5 text-foreground">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect
              x="3.6"
              y="2.6"
              width="24.8"
              height="26.8"
              rx="4.2"
              stroke="currentColor"
              strokeWidth="2.6"
              className="text-primary"
            />
            <rect x="9" y="6.6" width="14" height="10.4" rx="1.6" className="fill-primary" />
            <path
              d="M9.4 21.6h13.2M9.4 25.4h13.2"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="text-primary"
            />
          </svg>
          <span className="text-cardtitle font-bold tracking-tight">ShiftLush</span>
        </div>

        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-70">
          <ShaftGraphic />
        </div>

        <div className="relative flex max-w-sm flex-col gap-3 text-foreground">
          <p className="text-section">{t("login.tagline")}</p>
          <p className="flex items-start gap-2 text-body text-muted-foreground">
            <QrCode className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("login.qrHint")}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-card px-6 py-12">{children}</div>
    </div>
  );
}
