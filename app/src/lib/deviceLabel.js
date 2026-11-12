import { objDevices } from './objPlaygroundEquipment.js';

/**
 * A raw OSM value turned into something readable: `water_pump` → "Water pump".
 * Used only when neither the locale nor objDevices knows the value, so an
 * unlisted or mistagged device (`playground=carousel`) is not shown in the
 * lower case it was typed in.
 */
export function humanizeTagValue(value) {
    const s = String(value ?? '').replace(/_/g, ' ').trim();
    if (!s) return s;
    // By code point, so an astral first character is not split; toUpperCase,
    // not toLocaleUpperCase, so a Turkish browser does not turn "i" into "İ".
    const [first, ...rest] = s;
    return first.toUpperCase() + rest.join('');
}

/**
 * Label an OSM value that may be a `;`-separated list: each part is looked up
 * under `prefix` and falls back to its humanised form, joined with " / ".
 * @param {string} raw - the tag value, e.g. `grass;sand`
 * @param {string} prefix - locale key prefix, e.g. `details.surfaceValues.`
 * @param {Function} t - svelte-i18n's `$_`
 */
export function tagValuesLabel(raw, prefix, t) {
    return String(raw ?? '').split(';').map((p) => p.trim()).filter(Boolean)
        .map((p) => t(prefix + p, { default: humanizeTagValue(p) }))
        .join(' / ');
}

function singleDeviceLabel(key, t) {
    return t('equipment.devices.' + key, {
        default: objDevices[key]?.name_de ?? humanizeTagValue(key),
    });
}

/**
 * Display name for a `playground=*` value: locale string, then the
 * `name_de` fallback, then the humanised tag value. An OSM multi-value
 * (`swing;slide`) is labelled part by part and joined with " / ", like
 * surface and material.
 * @param {string} key - the `playground` tag value
 * @param {Function} t - svelte-i18n's `$_`
 */
export function deviceLabel(key, t) {
    const parts = String(key ?? '').split(';').map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) return singleDeviceLabel(parts[0] ?? '', t);
    return parts.map((p) => singleDeviceLabel(p, t)).join(' / ');
}
