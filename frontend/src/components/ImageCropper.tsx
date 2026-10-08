import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Modal } from "@heroui/react";

const ASPECT_RATIO = 4 / 3;
const OUTPUT_WIDTH = 1600;
const MAX_ZOOM = 3;

interface Offset {
  x: number;
  y: number;
}

export function ImageCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [saving, setSaving] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; orig: Offset } | null>(null);

  const ratio = ASPECT_RATIO;
  const scale = natural && viewport.w > 0 ? Math.max(viewport.w / natural.w, viewport.h / natural.h) * zoom : 1;
  const displayW = natural ? natural.w * scale : 0;
  const displayH = natural ? natural.h * scale : 0;

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setNatural({ w: image.naturalWidth, h: image.naturalHeight });
    image.src = url;
    return () => {
      image.onload = null;
    };
  }, [url]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Re-center whenever the frame or image changes.
  useEffect(() => {
    if (!natural || viewport.w === 0 || viewport.h === 0) return;
    const s = Math.max(viewport.w / natural.w, viewport.h / natural.h) * zoom;
    setOffset({ x: (viewport.w - natural.w * s) / 2, y: (viewport.h - natural.h * s) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, viewport.w, viewport.h]);

  const clamp = useCallback(
    (value: Offset): Offset => {
      const minX = Math.min(0, viewport.w - displayW);
      const minY = Math.min(0, viewport.h - displayH);
      return {
        x: Math.min(0, Math.max(minX, value.x)),
        y: Math.min(0, Math.max(minY, value.y)),
      };
    },
    [viewport.w, viewport.h, displayW, displayH],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, orig: offset };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setOffset(clamp({ x: drag.orig.x + (e.clientX - drag.startX), y: drag.orig.y + (e.clientY - drag.startY) }));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const crop = async () => {
    if (!natural || viewport.w === 0) {
      onConfirm(file);
      return;
    }
    setSaving(true);
    try {
      const source = new Image();
      source.src = url;
      await source.decode();
      const outW = OUTPUT_WIDTH;
      const outH = Math.round(OUTPUT_WIDTH / ratio);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onConfirm(file);
        return;
      }
      const sx = -offset.x / scale;
      const sy = -offset.y / scale;
      const sw = viewport.w / scale;
      const sh = viewport.h / scale;
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) {
        onConfirm(file);
        return;
      }
      onConfirm(new File([blob], "bild.jpg", { type: "image/jpeg" }));
    } catch {
      onConfirm(file);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal.Backdrop isOpen onOpenChange={(open) => !open && onCancel()}>
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Bild zuschneiden</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className="flex flex-col gap-4">
              <div
                ref={viewportRef}
                className="relative w-full touch-none overflow-hidden rounded-xl bg-black"
                style={{ aspectRatio: String(ratio), cursor: natural ? "grab" : "default" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {natural ? (
                  <img
                    src={url}
                    alt=""
                    draggable={false}
                    className="absolute top-0 left-0 max-w-none select-none"
                    style={{ width: displayW, height: displayH, transform: `translate(${offset.x}px, ${offset.y}px)` }}
                  />
                ) : null}
                <span className="pointer-events-none absolute inset-0 border border-white/30" aria-hidden="true" />
              </div>

              <label className="flex items-center gap-3">
                <span className="text-sm text-muted">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  className="flex-1 accent-[var(--accent)]"
                  onChange={(e) => setZoom(Number.parseFloat(e.target.value))}
                />
              </label>
              <p className="text-xs text-muted">Ziehe das Bild, um den Ausschnitt zu wählen.</p>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary">
              Abbrechen
            </Button>
            <Button variant="secondary" isDisabled={saving} onPress={() => onConfirm(file)}>
              Original
            </Button>
            <Button isDisabled={saving || !natural} onPress={() => void crop()}>
              {saving ? "Zuschneiden …" : "Zuschneiden"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
