// Shared utility functions used across multiple modules.

/**
 * Escape a string for safe insertion into innerHTML.
 *
 * Any field sourced from crowd-sourced or third-party data (OSM tags,
 * Mangrove review text, …) must be passed through this function before
 * being interpolated into an HTML template string.
 *
 * @param {*} str - Value to escape. null/undefined are returned as ''.
 * @returns {string} HTML-safe string.
 */
export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
