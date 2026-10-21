import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, FileDown, Loader2 } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * A file behind the bearer token, offered rather than forced on the browser.
 *
 * The request is awaited, so by the time the file exists the click that asked
 * for it is over as far as the browser is concerned — a download started then
 * is one nobody asked for, and a tab opened then is a popup. So the button
 * fetches, and the links it leaves behind save or open what arrived: the same
 * arrangement the QR label sheet uses, for the same reason.
 */
export function FileOffer({
  label,
  filename,
  fetchFile,
  canOpen,
}: {
  label: string;
  filename: string;
  fetchFile: () => Promise<Blob>;
  /** A PDF can be opened in a tab; a CSV is only saved. */
  canOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const urlRef = useRef("");

  function replace(blob: Blob | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const next = blob ? URL.createObjectURL(blob) : "";
    urlRef.current = next;
    setUrl(next);
  }
  useEffect(() => () => replace(null), []);

  const fetching = useMutation({
    onMutate: () => replace(null),
    mutationFn: fetchFile,
    onSuccess: (blob) => replace(blob),
  });

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" disabled={fetching.isPending} onClick={() => fetching.mutate()}>
        {fetching.isPending ? <Loader2 className="animate-spin" /> : <FileDown />}
        {fetching.isPending ? t("billing.preparing") : label}
      </Button>
      {url && (
        <>
          <a href={url} download={filename} className={buttonVariants({ size: "sm" })}>
            <FileDown />
            {t("billing.save")}
          </a>
          {canOpen && (
            <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <ExternalLink />
              {t("billing.open")}
            </a>
          )}
        </>
      )}
      {fetching.isError && <span className="text-help text-destructive">{errorMessage(fetching.error, t)}</span>}
    </span>
  );
}
