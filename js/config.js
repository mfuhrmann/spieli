// Region configuration — edit this file to deploy for a different city/region

export const mapCenter = [9.6744, 50.5520];                     // [lon, lat] — Fulda city center
export const mapExtent = [9.42, 50.35, 10.09, 50.81];           // [minLon, minLat, maxLon, maxLat] — Landkreis Fulda
export const mapZoom = 12;
export const mapMinZoom = 10;

export const geoServer = 'https://osmbln.uber.space/';
export const geoServerWorkspace = 'spielplatzkarte';

export const osmRelationId = 62700;
export const regionName = 'Landkreis Fulda';

// Optional: shown in the "Daten ergänzen" modal. Set to null to hide.
export const regionPlaygroundWikiUrl = 'https://wiki.openstreetmap.org/wiki/Fulda#Spielpl%C3%A4tze';
export const regionChatUrl = 'https://matrix.to/#/#osm-fulda:matrix.org';
export const regionChatName = 'OSM Fulda Matrix-Chat';

// Shown in the "Über das Projekt" modal.
export const projectAuthorName = 'Alex Seidel';
export const projectAuthorOsmUrl = 'https://www.openstreetmap.org/user/Supaplex030/';
export const projectRepoUrl = null; // TODO: set when moved to Codeberg
