import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, CameraOff, QrCode, RefreshCw, ScanLine } from "lucide-react";
import { tokenFromScan } from "@/lib/qr";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ElevatorLookup } from "@/components/scan/ElevatorLookup";

/**
 * The camera is read four times a second, not sixty.
 *
 * A `requestAnimationFrame` loop would decode every frame the phone paints,
 * which is a full-resolution image analysis per frame for a code that is either
 * in shot or is not. Four passes a second is faster than a person can aim and
 * costs a fraction of the battery — and battery is the resource a technician
 * runs out of at four in the afternoon, in a building with no socket.
 */
const FRAME_MS = 250;

/**
 * The ways the camera does not happen. Each is a different sentence, because
 * each has a different thing the person can do about it — and "camera error"
 * covering all five is how someone stands in a machine room retrying a
 * permission they revoked six months ago on a different site.
 */
type CameraFault = "unsupported" | "denied" | "missing" | "busy" | "failed";

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/**
 * The platform's own QR decoder, where there is one.
 *
 * Deliberately not a dependency. A decoding library is 40-60 KB of JavaScript,
 * downloaded by every role on every screen through the shared chunk, for one
 * control used by one role — and the phones that control is used on already
 * ship a decoder. Where they do not, the answer is not a smaller camera
 * experience, it is the registration number printed on the same sticker.
 */
function barcodeDetector(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

function cameraReachable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/**
 * `getUserMedia` reports what went wrong through `error.name`, and the names are
 * specified. Reading them is the difference between telling someone their camera
 * is in use by another app and telling them "something went wrong".
 */
function faultFrom(error: unknown): CameraFault {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "failed";
}

/**
 * Reading the next sticker.
 *
 * Opened from the one button on the technician's detail screen, and the reason
 * that button exists: they have finished with this lift and the next one is
 * along the corridor.
 *
 * Two things are on this screen and neither is a fallback for the other. The
 * camera is the fast path. The registration number is the path that works when
 * the camera does not — no decoder on this phone, permission refused, lens
 * fogged, a sticker worn past reading — and it is on screen from the start
 * rather than behind a "having trouble?" link, because a person who is having
 * trouble in a dark machine room with gloves on should not also have to find
 * the escape hatch.
 *
 * The permission prompt is the browser's, and it is only ever provoked when
 * there is a decoder to use the result. Asking for a camera we could not read
 * anyway would spend the one prompt the browser gives us on nothing.
 */
export function ScanScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Settled before the first paint: on a phone with no decoder there is no
  // camera state to pass through, and flashing "starting the camera" before
  // admitting it was never possible is a small lie told at the worst moment.
  const [fault, setFault] = useState<CameraFault | null>(() =>
    barcodeDetector() && cameraReachable() ? null : "unsupported",
  );
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState(false);
  /** A code that read cleanly and is not one of ours. */
  const [foreign, setForeign] = useState(false);

  useEffect(() => {
    if (fault) return;
    const Detector = barcodeDetector();
    if (!Detector) return;

    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // The camera light stays on until every track is stopped. Leaving the
    // stream open when the screen goes away is a phone that keeps filming a
    // machine room in someone's pocket.
    const release = () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
    };

    void (async () => {
      try {
        // `ideal`, not `exact`: a device with only a front camera should give
        // us that one rather than refuse, and a technician holding the phone
        // backwards is a solvable problem where a rejected constraint is not.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
      } catch (error) {
        if (!stopped) setFault(faultFrom(error));
        return;
      }

      const video = videoRef.current;
      if (stopped || !video) {
        release();
        return;
      }

      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        if (!stopped) setFault("failed");
        release();
        return;
      }
      if (stopped) return;

      let detector: BarcodeDetectorLike;
      try {
        detector = new Detector({ formats: ["qr_code"] });
      } catch {
        // The constructor exists but will not take the format. Rare, and the
        // same outcome as not having it at all.
        if (!stopped) setFault("unsupported");
        release();
        return;
      }

      setLive(true);

      const read = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          const raw = codes[0]?.rawValue;
          if (raw) {
            const token = tokenFromScan(raw);
            if (token) {
              release();
              void navigate({ to: "/q/$token", params: { token } });
              return;
            }
            // Read perfectly, and it is somebody else's code. Said here, with
            // the camera still running, rather than by sending the technician
            // to a screen that comes back "not found" a second later.
            setForeign(true);
          }
        } catch {
          // A frame too blurred or too dark to decode is the normal case in
          // this room, not a failure worth telling anyone about.
        }
        if (!stopped) timer = setTimeout(() => void read(), FRAME_MS);
      };
      void read();
    })();

    return release;
  }, [fault, attempt, navigate]);

  function retry() {
    setForeign(false);
    setLive(false);
    setFault(null);
    setAttempt((count) => count + 1);
  }

  // Written out rather than assembled from a template, so the key check in CI
  // sees every one of these and a missing sentence fails the build instead of
  // reaching a machine room as `scan.camera.busy.body`.
  const faultText: Record<CameraFault, { title: string; body: string }> = {
    unsupported: {
      title: t("scan.camera.unsupported.title"),
      body: t("scan.camera.unsupported.body"),
    },
    denied: { title: t("scan.camera.denied.title"), body: t("scan.camera.denied.body") },
    missing: { title: t("scan.camera.missing.title"), body: t("scan.camera.missing.body") },
    busy: { title: t("scan.camera.busy.title"), body: t("scan.camera.busy.body") },
    failed: { title: t("scan.camera.failed.title"), body: t("scan.camera.failed.body") },
  };

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Dark whatever the theme, for the same reason the detail screen is:
          the room is dark and the screen is at arm's length. */}
      <header className="dark flex items-center gap-3 bg-background px-4 py-3 text-foreground">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.history.back()}
          aria-label={t("common.back")}
        >
          <ArrowLeft />
        </Button>
        <h1 className="text-cardtitle">{t("qr.scanPrompt")}</h1>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-4">
        {fault ? (
          <section className="flex flex-col items-start gap-3 rounded-lg border border-border-subtle bg-card p-4">
            <span className="flex items-center gap-2 text-cardtitle">
              <CameraOff className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {faultText[fault].title}
            </span>
            <p className="text-body text-muted-foreground">{faultText[fault].body}</p>
            {/* Not offered for `unsupported`: there is no decoder on this phone
                and there will not be one in a second's time. Every other fault
                is something that can change while the person is standing
                there — they grant the permission, they close the other app. */}
            {fault !== "unsupported" && (
              <Button variant="secondary" size="lg" onClick={retry}>
                <RefreshCw />
                {t("common.retry")}
              </Button>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-black">
              <video
                ref={videoRef}
                className="size-full object-cover"
                // All three are required for an inline preview on iOS; without
                // them the browser takes the stream fullscreen or refuses to
                // play it at all.
                autoPlay
                muted
                playsInline
                aria-label={t("qr.scanPrompt")}
              />
              {/* An aiming frame, not decoration: the decoder reads the whole
                  frame, but a person needs to be told where to point. */}
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                aria-hidden="true"
              >
                <div className="size-1/2 rounded-lg border-2 border-white/70" />
              </div>
              {!live && (
                <p className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-center text-help text-white">
                  {t("scan.camera.starting")}
                </p>
              )}
            </div>
            <p className="flex items-center gap-2 text-help text-muted-foreground">
              <ScanLine className="size-4 shrink-0" aria-hidden="true" />
              {t("scan.camera.aim")}
            </p>
            {foreign && (
              <Alert tone="warning" block title={t("scan.foreign.title")}>
                {t("scan.foreign.body")}
              </Alert>
            )}
          </section>
        )}

        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-help uppercase text-subtle">{t("scan.or")}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <ElevatorLookup />

        <p className="mt-auto flex items-start gap-2 pt-2 text-help text-muted-foreground">
          <QrCode className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("scan.labelHint")}
        </p>
      </div>
    </div>
  );
}
