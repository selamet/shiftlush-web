import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

/** What the form asks of the pad when it is sent. */
export interface SignaturePadHandle {
  /** The drawing as a PNG, at most 600x240, or null when the pad is empty. */
  toBlob(): Promise<Blob | null>;
  clear(): void;
}

const EXPORT_WIDTH = 600;
const EXPORT_HEIGHT = 240;

/**
 * A strip to sign on with a finger, a stylus or a mouse.
 *
 * Pointer events on a canvas, no library: the whole job is to join the points
 * a finger passes through. Black on white in both themes, because what it
 * makes is a document, and a signature drawn white on dark would print as
 * nothing. `touch-none` keeps the page from scrolling under the pen. An empty
 * pad is no signature, however many times it was tapped — a tap leaves no
 * stroke, only a dot, and the dot is not drawn.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { onInk: (hasInk: boolean) => void; label: string }>(
  function SignaturePad({ onInk, label }, ref) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef<{ x: number; y: number } | null>(null);
    const inked = useRef(false);

    const paintBlank = useCallback(() => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    // Sized to the element at device pixels, once, so strokes stay sharp.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const box = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(box.width * ratio));
      canvas.height = Math.max(1, Math.round(box.height * ratio));
      const context = canvas.getContext("2d");
      context?.scale(ratio, ratio);
      paintBlank();
    }, [paintBlank]);

    function point(event: React.PointerEvent<HTMLCanvasElement>) {
      const box = event.currentTarget.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    function start(event: React.PointerEvent<HTMLCanvasElement>) {
      event.currentTarget.setPointerCapture(event.pointerId);
      drawing.current = point(event);
    }

    function move(event: React.PointerEvent<HTMLCanvasElement>) {
      const from = drawing.current;
      const context = canvasRef.current?.getContext("2d");
      if (!from || !context) return;
      const to = point(event);
      context.strokeStyle = "#111111";
      context.lineWidth = 2.5;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      drawing.current = to;
      if (!inked.current && Math.hypot(to.x - from.x, to.y - from.y) > 0) {
        inked.current = true;
        onInk(true);
      }
    }

    function end() {
      drawing.current = null;
    }

    function clear() {
      paintBlank();
      inked.current = false;
      onInk(false);
    }

    useImperativeHandle(ref, () => ({
      clear,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas || !inked.current) {
            resolve(null);
            return;
          }
          // Scaled down to the size the server keeps, whatever the screen.
          const scale = Math.min(1, EXPORT_WIDTH / canvas.width, EXPORT_HEIGHT / canvas.height);
          const out = document.createElement("canvas");
          out.width = Math.round(canvas.width * scale);
          out.height = Math.round(canvas.height * scale);
          const context = out.getContext("2d");
          if (!context) {
            resolve(null);
            return;
          }
          context.drawImage(canvas, 0, 0, out.width, out.height);
          out.toBlob((blob) => resolve(blob), "image/png");
        }),
    }));

    return (
      <div className="flex flex-col gap-2">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className="h-60 w-full touch-none rounded-md border-2 border-dashed border-border-strong bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        <Button type="button" variant="ghost" size="sm" className="self-end" onClick={clear}>
          <Eraser aria-hidden="true" />
          {t("visit.signature.clear")}
        </Button>
      </div>
    );
  },
);
