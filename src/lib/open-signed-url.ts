/**
 * Opens a file behind a freshly signed link, from inside a click.
 *
 * The link has to be asked for, and by the time the answer arrives the click
 * is over: Safari and every iOS browser treat a `window.open` made then as a
 * popup nobody asked for and swallow it. So the window is opened first, blank,
 * while the click is still happening, and pointed at the link when it exists.
 * Call this straight from the handler, before any `await` of your own.
 *
 * `noopener` cannot be passed to `window.open` here, because it makes the call
 * return null and the window could never be navigated; the opener is cut by
 * hand instead, before the window is given anything to load. If the browser
 * refuses even the blank window, the link opens in this tab rather than not at
 * all. A failure closes the blank window and is rethrown for the caller to word.
 */
export async function openSignedUrl(resolveUrl: () => Promise<string>): Promise<void> {
  const popup = window.open("", "_blank");
  if (popup) popup.opener = null;
  try {
    const url = await resolveUrl();
    if (popup) popup.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
