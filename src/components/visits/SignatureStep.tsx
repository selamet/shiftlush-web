import { useTranslation } from "react-i18next";
import type { MaintenanceVisitStatus } from "@/api/enums";
import { enumLabel } from "@/lib/i18n";
import { SIGNER_ROLES, type SignatureAnswer, type SignatureChoice, type SignerRole } from "@/lib/signature";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { SignaturePad, type SignaturePadHandle } from "@/components/visits/SignaturePad";

const CHOICES: readonly SignatureChoice[] = ["signed", "not_present", "declined"];

/**
 * The building's answer at the end of a visit: a signature on the pad, or why
 * there is none. Nothing is chosen until somebody chooses — a preselected
 * "signed" would be a signature nobody gave. "Nobody was there" and "declined"
 * are answers, so a technician is never held at the form by an empty building.
 */
export function SignatureStep({
  status,
  answer,
  onChange,
  pad,
  errors,
}: {
  status: MaintenanceVisitStatus;
  answer: SignatureAnswer;
  onChange: (answer: SignatureAnswer) => void;
  pad: React.RefObject<SignaturePadHandle | null>;
  errors: Record<string, string>;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<SignatureAnswer>) => onChange({ ...answer, ...patch });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="visit-signature-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="visit-signature-title" className="text-cardtitle">
          {t("visit.signature.title")}
        </h2>
        <p className="text-help text-muted-foreground">
          {status === "completed" ? t("visit.signature.hintRequired") : t("visit.signature.hintOptional")}
        </p>
      </div>

      <Segmented
        name="signature_status"
        label={t("visit.signature.title")}
        labelHidden
        options={CHOICES.map((value) => ({ value, label: t(`visit.signature.choice.${value}`) }))}
        value={answer.choice ?? undefined}
        onChange={(choice) => set({ choice })}
      />
      {errors.signature_status && <p className="text-help text-destructive">{errors.signature_status}</p>}

      {answer.choice === "signed" && (
        <div className="flex flex-col gap-3">
          <SignaturePad ref={pad} label={t("visit.signature.pad")} onInk={(hasInk) => set({ hasInk })} />
          <Field label={t("visit.signature.name")} htmlFor="visit-signer-name" required error={errors.signer_name}>
            <Input
              id="visit-signer-name"
              value={answer.name}
              maxLength={100}
              autoComplete="off"
              onChange={(event) => set({ name: event.target.value })}
            />
          </Field>
          <div className="flex flex-col gap-1">
            <Segmented
              name="signer_role"
              label={t("visit.signature.role")}
              options={SIGNER_ROLES.map((value) => ({ value, label: enumLabel("visit.signerRole", value) }))}
              value={answer.role || undefined}
              onChange={(role: SignerRole) => set({ role })}
            />
            {errors.signer_role && <p className="text-help text-destructive">{errors.signer_role}</p>}
          </div>
          <p className="text-help text-muted-foreground">{t("visit.signature.privacy")}</p>
        </div>
      )}
    </section>
  );
}
