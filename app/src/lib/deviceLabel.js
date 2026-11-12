import { objDevices } from './objPlaygroundEquipment.js';

/**
 * A raw OSM value turned into something readable: `water_pump` → "Water pump".
 * Used only when neither the locale nor objDevices knows the value, so an
 * unlisted or mistagged device (`playground=carousel`) is not shown in the
 * lower case it was typed in.
 */
export function humanizeTagValue(value) {
    const s = String(value ?? '').replace(/_/g, ' ').trim();
    return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
}

/**
 * Display name for a `playground=*` value: locale string, then the
 * `name_de` fallback, then the humanised tag value.
 * @param {string} key - the `playground` tag value
 * @param {Function} t - svelte-i18n's `$_`
 */
export function deviceLabel(key, t) {
    return t('equipment.devices.' + key, {
        default: objDevices[key]?.name_de ?? humanizeTagValue(key),
    });
}
