// Share a link from the detail panels (#1087).
//
// Phones get the system share sheet; computers copy the link, which is what
// people want there. Whatever happens, the visitor sees an outcome: when the
// share sheet fails for any reason other than a cancel (Firefox on Android
// was seen to reject it), the link is copied instead.

/**
 * @param {{ title: string, url: string }} data
 * @param {{ mobile: boolean, nav?: Navigator, doc?: Document }} [env]
 * @returns {Promise<'shared' | 'copied' | 'cancelled' | 'failed'>}
 */
export async function shareOrCopy({ title, url }, { mobile, nav = globalThis.navigator, doc = globalThis.document } = {}) {
    if (mobile && typeof nav?.share === 'function') {
        try {
            await nav.share({ title, url });
            return 'shared';
        } catch (err) {
            if (err?.name === 'AbortError') return 'cancelled';
            // Any other rejection: fall through and copy instead.
        }
    }
    return (await copyText(url, { nav, doc })) ? 'copied' : 'failed';
}

/** Copy text; the clipboard API where available, else a hidden textarea. */
export async function copyText(text, { nav = globalThis.navigator, doc = globalThis.document } = {}) {
    try {
        if (nav?.clipboard?.writeText) {
            await nav.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Not allowed here (non-secure context, permissions): try the fallback.
    }
    try {
        const ta = doc.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        doc.body.appendChild(ta);
        ta.select();
        const ok = doc.execCommand('copy');
        doc.body.removeChild(ta);
        return !!ok;
    } catch {
        return false;
    }
}
