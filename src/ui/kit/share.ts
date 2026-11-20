// F-47 Device-native sharing (no outside services): Web Share sheet where the phone has it, else copy to clipboard.
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator.share === 'function') { await navigator.share({ title, text }); return 'shared'; }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'shared' : 'failed';
  }
}

/** A local reminder on this phone after `ms` (shows while the app is open or in the background tab; no push server). */
export async function remindLater(title: string, body: string, ms: number): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  const ok = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
  if (ok) setTimeout(() => { new Notification(title, { body }); }, ms);
  return ok;
}
