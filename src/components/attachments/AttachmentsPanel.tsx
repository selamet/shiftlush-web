import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, Download, Trash2, X, Upload } from "lucide-react";
import {
  attachmentDownloadUrl,
  confirmUpload,
  deleteAttachment,
  requestUploadTicket,
  type Attachment,
  type AttachmentCategory,
  type AttachmentObjectType,
} from "@/api/queries";
import { errorMessage } from "@/api/errors";
import type { TFunction } from "i18next";
import { putSignedFile, UploadError } from "@/lib/upload";
import { formatFileSize } from "@/lib/format";
import { enumLabel } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * What the server accepts, restated here to save a wasted transfer.
 *
 * These two numbers are the server's rule, not this file's: they are declared
 * in the contract as `MimeTypeEnum` and the maximum on `size_bytes`. Checking
 * them here only means a refusal arrives in a moment instead of after four
 * minutes of uploading a file that was never going to be accepted. The server
 * still decides — anything it rejects is shown as it explained it.
 */
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

const CATEGORIES: AttachmentCategory[] = [
  "inspection_report",
  "ce_certificate",
  "declaration_of_conformity",
  "permit",
  "signed_contract",
  "photo",
  "other",
];

const CATEGORY_ICON: Partial<Record<AttachmentCategory, typeof FileText>> = {
  photo: ImageIcon,
};

/** One file on its way to the bucket. */
interface Transfer {
  id: string;
  file: File;
  category: AttachmentCategory;
  /** 0…1, or null before the first progress event arrives. */
  fraction: number | null;
  /** Already-translated; a transfer is not a form and has no field errors. */
  error: string | null;
  controller: AbortController;
  /**
   * Minted once per file and kept across retries.
   *
   * One file is one intention: retrying it must not produce a second row, and
   * uploading a different file must not replay this one's response. This is why
   * `useIdempotencyKey` is not used here — that mints one key per mounted form,
   * which is right for a form and wrong for a list of independent uploads.
   */
  idempotencyKey: string;
}

interface AttachmentsPanelProps {
  objectType: AttachmentObjectType;
  objectId: string;
  attachments: Attachment[];
  /** Invalidated whenever the set of files changes. */
  invalidateKey: readonly unknown[];
  /** Reading is wider than writing: a technician sees files but cannot add one. */
  canWrite: boolean;
  /**
   * Fixes the category and drops the picker.
   *
   * For a panel that holds one kind of file — the company logo — the question
   * "which sort of document is this?" has one answer, and a select with one
   * option is a control that can only be got wrong.
   */
  fixedCategory?: AttachmentCategory;
  /**
   * The record the server made, for a caller that has to point a field at it.
   *
   * `company.logo` is a foreign key to an attachment: the upload has to finish
   * before anything can reference it, and only this component knows when that
   * happened. Invalidating the list is not enough — the caller needs the id.
   */
  onUploaded?: (attachment: Attachment) => void;
}

export function AttachmentsPanel({
  objectType,
  objectId,
  attachments,
  invalidateKey,
  canWrite,
  fixedCategory,
  onUploaded,
}: AttachmentsPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<AttachmentCategory>("inspection_report");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function patchTransfer(id: string, patch: Partial<Transfer>) {
    setTransfers((current) =>
      current.map((transfer) => (transfer.id === id ? { ...transfer, ...patch } : transfer)),
    );
  }

  function dropTransfer(id: string) {
    setTransfers((current) => current.filter((transfer) => transfer.id !== id));
  }

  /** The client-side refusals, in the server's own words where they exist. */
  function refuse(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      return t("attachment.errors.type");
    }
    if (file.size > MAX_BYTES) {
      return t("attachment.errors.tooLarge", { max: formatFileSize(MAX_BYTES) });
    }
    return null;
  }

  async function run(transfer: Transfer) {
    patchTransfer(transfer.id, { error: null, fraction: null });
    try {
      // A fresh ticket every attempt. Retrying with the previous URL is the one
      // thing guaranteed not to work when the reason for retrying was that it
      // expired.
      const ticket = await requestUploadTicket({
        object_type: objectType,
        object_id: objectId,
        category: transfer.category,
        mime_type: transfer.file.type as never,
        size_bytes: transfer.file.size,
      });

      await putSignedFile({
        url: ticket.upload_url,
        file: transfer.file,
        contentType: ticket.content_type,
        onProgress: (fraction) => patchTransfer(transfer.id, { fraction }),
        signal: transfer.controller.signal,
      });

      const record = await confirmUpload(
        { storage_key: ticket.storage_key, original_filename: transfer.file.name },
        transfer.idempotencyKey,
      );

      await queryClient.invalidateQueries({ queryKey: invalidateKey });
      dropTransfer(transfer.id);
      onUploaded?.(record);
    } catch (error) {
      if (error instanceof UploadError && error.reason === "cancelled") {
        dropTransfer(transfer.id);
        return;
      }
      patchTransfer(transfer.id, { error: describeFailure(error, t) });
    }
  }

  function accept(files: FileList | null) {
    if (!files || !canWrite) return;
    for (const file of Array.from(files)) {
      const transfer: Transfer = {
        id: crypto.randomUUID(),
        file,
        category: fixedCategory ?? category,
        fraction: null,
        error: refuse(file),
        controller: new AbortController(),
        idempotencyKey: crypto.randomUUID(),
      };
      setTransfers((current) => [...current, transfer]);
      // A file the client already knows is unacceptable is shown as refused
      // rather than sent. It stays on screen with its reason instead of
      // vanishing, because a file that disappears reads as a bug.
      if (!transfer.error) void run(transfer);
    }
  }

  async function download(file: Attachment) {
    setListError(null);
    try {
      const { download_url } = await attachmentDownloadUrl(file.id);
      window.open(download_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setListError(errorMessage(error, t));
    }
  }

  async function remove(file: Attachment) {
    setPendingDelete(null);
    setListError(null);
    try {
      await deleteAttachment(file.id);
      await queryClient.invalidateQueries({ queryKey: invalidateKey });
    } catch (error) {
      setListError(errorMessage(error, t));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {!fixedCategory && (
              <>
                <label className="sr-only" htmlFor="attachment-category">
                  {t("attachment.categoryLabel")}
                </label>
                <select
                  id="attachment-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as AttachmentCategory)}
                  className="h-control-sm rounded-md border border-input bg-card px-2 text-body focus-ring pointer-coarse:h-control-md"
                >
                  {CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {enumLabel("attachment.category", value)}
                    </option>
                  ))}
                </select>
              </>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              <Upload aria-hidden="true" />
              {t("attachment.choose")}
            </Button>
            <span className="text-help text-muted-foreground">{t("attachment.limits")}</span>
          </div>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              accept(event.target.files);
              // Cleared so that choosing the same file twice in a row still
              // fires a change event.
              event.target.value = "";
            }}
          />

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              accept(event.dataTransfer.files);
            }}
            className={cn(
              "rounded-md border border-dashed px-3 py-4 text-center text-help transition-colors",
              dragging
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {t("attachment.dropHere")}
          </div>
        </div>
      )}

      {listError && <Alert tone="error" block title={listError} />}

      {transfers.map((transfer) => (
        <div
          key={transfer.id}
          className="flex flex-col gap-1.5 rounded-md border border-border-subtle px-3 py-2"
        >
          <div className="flex items-center gap-3">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 truncate text-cell">{transfer.file.name}</span>
            <span className="ml-auto shrink-0 text-help text-subtle">
              {formatFileSize(transfer.file.size)}
            </span>
            {transfer.error ? (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => void run(transfer)}
              >
                {t("attachment.retry")}
              </Button>
            ) : (
              <Button
                type="button"
                size="iconXs"
                variant="ghost"
                aria-label={t("common.cancel")}
                onClick={() => transfer.controller.abort()}
              >
                <X aria-hidden="true" />
              </Button>
            )}
            {transfer.error && (
              <Button
                type="button"
                size="iconXs"
                variant="ghost"
                aria-label={t("common.close")}
                onClick={() => dropTransfer(transfer.id)}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </div>

          {transfer.error ? (
            <span className="text-help text-destructive">{transfer.error}</span>
          ) : (
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full bg-primary",
                  // Indeterminate until the browser reports a total: a bar
                  // pinned at zero looks like nothing is happening.
                  transfer.fraction === null ? "w-1/3 animate-pulse" : "transition-[width]",
                )}
                style={
                  transfer.fraction === null
                    ? undefined
                    : { width: `${Math.round(transfer.fraction * 100)}%` }
                }
              />
            </div>
          )}
        </div>
      ))}

      {attachments.length === 0 && transfers.length === 0 && (
        <p className="py-2 text-body text-muted-foreground">{t("attachment.empty")}</p>
      )}

      {attachments.map((file) => {
        const Icon = CATEGORY_ICON[file.category] ?? FileText;
        return (
          <div
            key={file.id}
            className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-0"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-cell">{file.original_filename}</span>
              <span className="text-help text-muted-foreground">
                {enumLabel("attachment.category", file.category)}
              </span>
            </div>
            <span className="ml-auto shrink-0 text-help text-subtle">
              {formatFileSize(file.size_bytes)}
            </span>
            <Button
              type="button"
              size="iconXs"
              variant="ghost"
              aria-label={t("common.download")}
              onClick={() => void download(file)}
            >
              <Download aria-hidden="true" />
            </Button>
            {canWrite && (
              <Button
                type="button"
                size="iconXs"
                variant="ghost"
                aria-label={t("common.delete")}
                onClick={() => setPendingDelete(file)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("attachment.deleteTitle")}
        body={pendingDelete?.original_filename}
        confirmLabel={t("common.delete")}
        onConfirm={() => pendingDelete && void remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/**
 * Why a transfer failed, in terms of what to do about it.
 *
 * An `UploadError` came from the bucket, which speaks XML and knows nothing
 * about this application, so its status is translated here rather than run
 * through the API error messages. Anything else came from our own server and
 * already has a message worth showing.
 */
function describeFailure(error: unknown, t: TFunction): string {
  if (error instanceof UploadError) {
    if (error.reason === "expired") return t("attachment.errors.expired");
    if (error.reason === "network") return t("attachment.errors.network");
    return t("attachment.errors.rejected");
  }
  return errorMessage(error, t);
}
