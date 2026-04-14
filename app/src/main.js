import { mount } from 'svelte';
import { appMode } from './lib/config.js';
import StandaloneApp from './standalone/StandaloneApp.svelte';
import HubApp from './hub/HubApp.svelte';

const target = document.getElementById('app');

if (appMode === 'hub') {
  mount(HubApp, { target });
} else {
  mount(StandaloneApp, { target });
}
