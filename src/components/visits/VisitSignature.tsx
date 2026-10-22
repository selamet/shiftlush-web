import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Clock, PenLine, UserX, XCircle } from "lucide-react";
import { attachmentDownloadUrl, type Attachment, type MaintenanceVisit } from "@/api/queries";
import { formatDateTime } from "@/lib/format";
import { enumLabel } from "@/lib/i18n";
import { StatusChip } from "@/components/ui/status-chip";

type SignatureState = MaintenanceVisit["signature_state"];

/**
 * The building's answer on a visit, in one chip. Signed is outlined with a
 * pen, the reasons outlined with their own icon, "pending" outlined with a
 * clock — none of it final or alarming, so none of it filled. A visit recorded
 * before signatures existed says nothing at all.
 */
export function SignatureStateChip({ value }: { value: SignatureState }) {
  const { t } = useTranslation();
  const icon = { signed: PenLine, pending: Clock, not_present: UserX, declined: XCircle }[
    value as Exclude<SignatureState, "none">
  ];
  // "none", and anything a newer server sends that this build does not know.
  if (!icon) return null;
  return (
    <StatusChip weight="outline" icon={icon}>
      {t(`visit.signatureState.${value}`)}
    </StatusChip>
  );
}

/**
 * The signature as the office reads it: the image itself, who signed, in what
 * role and when — or the reason there is none. The image comes through a
 * signed URL asked for here, like any file; it is small and it is the point
 * of the block, so it is shown rather than linked.
 */
export function SignatureBlock({
  visit,
  image,
}: {
  visit: MaintenanceVisit;
  image: Attachment | undefined;
}) {
  const { t } = useTranslation();
  const url = useQuery({
    queryKey: ["attachment-url", image?.id],
    queryFn: () => attachmentDownloadUrl(image?.id ?? ""),
    enabled: Boolean(image),
    // A signed URL lives a few minutes; never reuse a stale one.
    staleTime: 60_000,
  });
  const state = visit.signature_state;

  if (state === "none") return <p className="text-help text-muted-foreground">{t("visit.signature.none")}</p>;

  return (
    <div className="flex flex-col gap-2">
      <SignatureStateChip value={state} />
      {(state === "signed" || state === "pending") && (
        <>
          {url.data && (
            <img
              src={url.data.download_url}
              alt={t("visit.signature.imageAlt", { name: visit.signer_name })}
              className="h-28 w-full max-w-sm rounded-md border border-border bg-white object-contain"
            />
          )}
          <p className="text-body">
            {visit.signer_name}
            {visit.signer_role && (
              <span className="text-muted-foreground"> · {enumLabel("visit.signerRole", visit.signer_role)}</span>
            )}
          </p>
          {visit.signed_at && (
            <p className="tnum text-help text-muted-foreground">{formatDateTime(visit.signed_at)}</p>
          )}
        </>
      )}
      {visit.amended_after_signature && (
        <p className="text-help font-medium text-warning">{t("visit.signature.amended")}</p>
      )}
    </div>
  );
}
