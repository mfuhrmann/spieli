import { writable, get } from 'svelte/store';

// The browser's install offer (#939). Chromium fires `beforeinstallprompt`
// once the page meets its installability criteria; we keep the event so the
// Info dialog can offer "Install as app". Safari and Firefox never fire it,
// and an installed app does not either — the entry then simply stays hidden.
// preventDefault() only suppresses Chrome's own mini-infobar on Android; the
// address-bar install icon on desktop is unaffected.
export const installPrompt = writable(null);

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installPrompt.set(e);
    });
    window.addEventListener('appinstalled', () => installPrompt.set(null));
}

/** Show the browser's install dialog. The event can be used once. */
export async function promptInstall() {
    const e = get(installPrompt);
    if (!e) return;
    installPrompt.set(null);
    e.prompt();
    await e.userChoice;
}
