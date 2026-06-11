/**
 * Writable store for the user's current GPS location.
 * null means location is unknown/not granted.
 * @type {import('svelte/store').Writable<{lat: number, lon: number, accuracy: number} | null>}
 */
import { writable } from 'svelte/store';

export const location = writable(null);
