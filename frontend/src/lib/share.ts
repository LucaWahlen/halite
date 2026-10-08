type ShareResult = "shared" | "copied" | "failed";

/**
 * Shares via the Web Share API when available, otherwise copies to the
 * clipboard. Returns what actually happened so the caller can toast.
 */
export async function shareOrCopy(opts: { title?: string; text?: string; url?: string }): Promise<ShareResult> {
  const url = opts.url ?? window.location.href;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "failed";
      }
    }
  }
  const payload = [opts.text, url].filter((part) => part && part.trim().length > 0).join("\n\n");
  try {
    await navigator.clipboard.writeText(payload);
    return "copied";
  } catch {
    return "failed";
  }
}
