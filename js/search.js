//-------------------//
// Suche (Nominatim) //
//-------------------//

import { fromLonLat, transform } from 'ol/proj';
import map from './map.js';
import { getRegionExtent, showNotification } from './map.js';
import { pulse } from './pulse.js';
import { showNearbyPlaygrounds } from './selectPlayground.js';
import { t } from './i18n.js';

// Suchanfragen starten
document.getElementById('inputSearch').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = e.currentTarget.value;
        if (query) {
            searchLocation(query);
        }
    }
});

document.getElementById('inputSearchIcon').addEventListener('click', function() {
    const query = document.getElementById('inputSearch').value;
    if (query) {
        searchLocation(query);
    }
});

var coord = null;

// Funktion zur Suche
export async function searchLocation(query) {
    // Suche auf mapExtent beschränken und zum ersten Treffer zoomen
    const [minLon, minLat, maxLon, maxLat] = getRegionExtent();
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&viewbox=${minLon},${minLat},${maxLon},${maxLat}`;
    try {
        const response = await fetch(url);
        const results = await response.json();
        if (results.length > 0) {
            const result = results[0];
            coord = fromLonLat([parseFloat(result.lon), parseFloat(result.lat)]);

            // zur gefundenen Position fliegen
            map.getView().animate({ center: coord, zoom: 18 }, searchPulse);

            // Notification zum gesuchten Ort ausgeben
            var addr_suburb = result.address.suburb;
            var addr_city = result.address.city || result.address.town || result.address.village;
            var locationHint = addr_suburb ? `${addr_suburb}, ${addr_city || ''}` : addr_city;
            var notification = locationHint
                ? t('search.found', { query, location: locationHint })
                : t('search.foundGeneric', { query });
            showNotification(notification);

            // Spielplätze in der Nähe des Suchergebnisses anzeigen
            const label = addr_suburb || result.address.city || query;
            showNearbyPlaygrounds(parseFloat(result.lon), parseFloat(result.lat), `„${label}"`);
        } else {
            showNotification(t('search.notFound'));
        }
    } catch (error) {
        console.error('Fehler bei der Suchanfrage:', error);
    }
}

function searchPulse() {
    pulse(coord);
}