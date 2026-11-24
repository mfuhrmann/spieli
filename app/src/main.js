import { mount } from 'svelte';
import { waitLocale } from 'svelte-i18n';
// Nunito, self-hosted: bundled by Vite and served from this origin (#1081).
import '@fontsource-variable/nunito';
// Icon font for the remaining `bi bi-*` icons; was a dependency but never
// imported, so every one of them rendered empty (#1085). Same origin.
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import './styles/app.css';
import { appMode } from './lib/config.js';
import { setupI18n } from './lib/i18n.js';
import { installImageFallback } from './lib/imageFallback.js';
import StandaloneApp from './standalone/StandaloneApp.svelte';
import HubApp from './hub/HubApp.svelte';

const target = document.getElementById('app');

installImageFallback();

async function main() {
    await setupI18n();
    await waitLocale();

    if (appMode === 'hub') {
        mount(HubApp, { target });
    } else {
        mount(StandaloneApp, { target });
    }
}

main();
