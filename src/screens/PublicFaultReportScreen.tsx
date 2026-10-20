import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Phone, Siren } from "lucide-react";
import { ApiError } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { reportPublicFault } from "@/api/queries";
import { publicPriority } from "@/lib/faults";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

/** The number for a person trapped in a lift. Not the firm's: the emergency services'. */
const EMERGENCY_NUMBER = "112";

/**
 * Why the report did not go, in the words a resident can act on.
 *
 * An unknown sticker and a throttled one both end with "call instead": the
 * page has nothing else to offer, and saying so is better than a retry button
 * that will be refused again. A dropped connection is the one worth retrying,
 * and what was typed is still in the form.
 */
function failureMessage(error: unknown, t: ReturnType<typeof useTranslation>["t"]): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return t("publicFault.unknownSticker");
    if (error.status === 429) return t("publicFault.throttled");
    if (error.code === "NETWORK_ERROR") return t("publicFault.offline");
  }
  return errorMessage(error, t);
}

/**
 * What a resident sees after scanning the sticker on a lift without an account.
 *
 * One screen, three questions — what is wrong, is anybody trapped, has the
 * lift stopped — and an optional name and phone for a call back. Large
 * targets, no images to download, nothing that needs a second request: it is
 * opened by somebody standing at a broken lift, often on poor signal, and some
 * of them are frightened.
 *
 * Deliberately anonymous on the wire. The request carries no session and the
 * answer carries nothing about the firm, the building or the lift — only a
 * reference to quote on the phone. The priority is never asked: somebody
 * trapped is an emergency and a stopped lift is urgent, and the page says so
 * back to them before they send.
 *
 * The `website` field is a honeypot. People never see it — it is off screen,
 * hidden from assistive technology and out of the tab order — and a form that
 * fills it in is a script, which the server answers exactly as it answers a
 * person and then forgets.
 */
export function PublicFaultReportScreen() {
  const { t } = useTranslation();
  const { token } = useParams({ strict: false }) as { token?: string };
  const [trapped, setTrapped] = useState(false);
  const [stopped, setStopped] = useState(false);

  const send = useMutation({
    mutationFn: (body: Parameters<typeof reportPublicFault>[1]) =>
      reportPublicFault(token ?? "", body),
  });

  const priority = publicPriority({ someoneTrapped: trapped, elevatorStopped: stopped });

  if (send.isSuccess) {
    return (
      <PublicFrame>
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
          <h1 role="status" className="text-title">
            {t("publicFault.received")}
          </h1>
          <p className="text-body text-muted-foreground">{t("publicFault.referenceLabel")}</p>
          <p className="font-mono text-[2rem] font-semibold tracking-widest tnum">
            {send.data.reference}
          </p>
          <p className="text-help text-muted-foreground">{t("publicFault.referenceHint")}</p>
        </div>
        {trapped && <CallEmergency />}
      </PublicFrame>
    );
  }

  return (
    <PublicFrame>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t("publicFault.title")}</h1>
        <p className="text-body text-muted-foreground">{t("publicFault.intro")}</p>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const field = (name: string) => String(form.get(name) ?? "").trim();
          send.mutate({
            description: field("description"),
            someone_trapped: trapped,
            elevator_stopped: stopped,
            reporter_name: field("reporter_name"),
            reporter_phone: field("reporter_phone"),
            // Sent untrimmed: whatever a script put there is the signal.
            website: String(form.get("website") ?? ""),
          });
        }}
      >
        {send.isError && (
          <Alert tone="error" block title={failureMessage(send.error, t)} />
        )}

        <label className="flex min-h-control-xl items-center gap-3 rounded-lg border-2 border-border p-4 text-body has-[:checked]:border-foreground">
          <input
            type="checkbox"
            checked={trapped}
            onChange={(event) => setTrapped(event.target.checked)}
            className="size-6 shrink-0 accent-primary"
          />
          <span className="text-cardtitle">{t("publicFault.someoneTrapped")}</span>
        </label>

        {/* Before anything else they might read, the moment they say it. A
            report to the maintenance firm is not a rescue; this is the number
            that is. */}
        {trapped && <CallEmergency />}

        <label className="flex min-h-control-xl items-center gap-3 rounded-lg border-2 border-border p-4 text-body has-[:checked]:border-foreground">
          <input
            type="checkbox"
            checked={stopped}
            onChange={(event) => setStopped(event.target.checked)}
            className="size-6 shrink-0 accent-primary"
          />
          <span className="text-cardtitle">{t("publicFault.elevatorStopped")}</span>
        </label>

        <Field label={t("publicFault.description")} htmlFor="public-description" required>
          <Textarea
            name="description"
            rows={4}
            required
            maxLength={1000}
            placeholder={t("publicFault.descriptionPlaceholder")}
            className="text-[1rem]"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("publicFault.name")} htmlFor="public-name" hint={t("common.optional")}>
            <Input name="reporter_name" maxLength={100} autoComplete="name" className="h-control-lg text-[1rem]" />
          </Field>
          <Field label={t("publicFault.phone")} htmlFor="public-phone" hint={t("publicFault.phoneHint")}>
            <Input
              name="reporter_phone"
              type="tel"
              maxLength={30}
              autoComplete="tel"
              inputMode="tel"
              className="h-control-lg text-[1rem]"
            />
          </Field>
        </div>

        {/* The honeypot. Off screen rather than display:none, which some
            scripts know to skip; hidden from screen readers and from Tab, so
            no person reaches it by any route. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="public-website">Website</label>
          <input id="public-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <p className="text-help text-muted-foreground">
          {t(`publicFault.priorityNote.${priority}`)}
        </p>

        <Button type="submit" size="xl" className="w-full" disabled={send.isPending}>
          {send.isPending ? t("common.sending") : t("publicFault.submit")}
        </Button>
        <p className="text-help text-subtle">{t("publicFault.privacy")}</p>
      </form>
    </PublicFrame>
  );
}

/** A tel: link the size of a thumb. */
function CallEmergency() {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border-2 border-foreground bg-foreground p-4 text-background">
      <p className="flex items-start gap-2 text-cardtitle">
        <Siren className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        {t("publicFault.callEmergency", { number: EMERGENCY_NUMBER })}
      </p>
      <a
        href={`tel:${EMERGENCY_NUMBER}`}
        className="inline-flex min-h-control-xl items-center justify-center gap-2 rounded-md bg-background px-4 text-cardtitle font-semibold text-foreground focus-ring"
      >
        <Phone className="size-5" aria-hidden="true" />
        {t("publicFault.callButton", { number: EMERGENCY_NUMBER })}
      </a>
    </div>
  );
}

/** A plain, narrow column. No firm, no product branding: the resident needs neither. */
function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="relative mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">{children}</main>
    </div>
  );
}
