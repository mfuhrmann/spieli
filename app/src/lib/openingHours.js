// Opening-hours state for a panel badge: open / closed with the next change,
// or the raw string when it cannot be parsed. Shared by the playground and
// pitch panels (#934). Regional holidays come from `openingHoursAddress`.

import OpeningHours from 'opening_hours';
import { openingHoursAddress } from './config.js';

/**
 * @param {string} ohStr  OSM opening_hours value
 * @param {(key: string, opts?: object) => string} t  svelte-i18n translate
 * @returns {{ open: boolean | null, text: string }}
 */
export function openingHoursState(ohStr, t) {
  const fmt = d => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayLabel = (d, now) => {
    if (d.toDateString() === now.toDateString()) return t('poi.today');
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return t('poi.tomorrow');
    const diff = Math.round((d - now) / 86400000);
    if (diff <= 6) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' });
  };
  try {
    const oh = new OpeningHours(ohStr, { address: openingHoursAddress });
    const now = new Date();
    const isOpen = oh.getState(now);
    const next = oh.getNextChange(now);
    if (ohStr.trim() === '24/7') return { open: true, text: t('poi.alwaysOpen') };
    if (isOpen) {
      const label = next
        ? t('poi.openUntil', { values: { time: fmt(next) } })
        : t('poi.open');
      return { open: true, text: label };
    }
    if (next) return {
      open: false,
      text: t('poi.opensAt', { values: { day: dayLabel(next, now), time: fmt(next) } }),
    };
    return { open: false, text: t('poi.closed') };
  } catch {
    return { open: null, text: ohStr };
  }
}
