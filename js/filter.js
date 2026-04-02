//----------------------------------------//
// Spielplatzfilter und Spielgerätefinder //
//----------------------------------------//

import $ from 'jquery';
import { dataPlaygrounds, dataIssues, dataFilteredEquipment } from './map.js';
import { showNotification } from './map.js';
import { getSliderMonth, getValidMonth, getSliderHour } from './shadow.js';

var cqlFilterObject = {
    playgrounds: {},
    completeness: {},
    filteredEquipment: {}
};

// Allgemeine Filterfunktionen für CQL-Filter (Spielplatzblasen und Spielgerätefinder)
export function addFilter(layer, filterClass, filterExpression) {
    cqlFilterObject[layer][filterClass] = filterExpression;
    return updateFilter(layer);
}

export function setFilter(layer, filterClass, filterExpression) {
    cqlFilterObject[layer] = { filterClass: filterExpression };
    return updateFilter(layer);
}

export function removeFilter(layer, filterClass) {
    delete cqlFilterObject[layer][filterClass];
    return updateFilter(layer);
}

export function getFilter(layer) {
    var cqlExpression = "";
    for (var filter in cqlFilterObject[layer]) {
        if (cqlExpression.length > 0) {
            cqlExpression += " AND "
        }
        cqlExpression += `(${cqlFilterObject[layer][filter]})`;
    }
    return cqlExpression;
}

function updateFilter(layer) {
    var cqlExpression = getFilter(layer);
    var lyr = dataPlaygrounds;
    if (layer == "filteredEquipment") {
        lyr = dataFilteredEquipment;
    }
    if (layer == "completeness") {
        lyr = dataIssues;
    }
    // updateParams ist nur bei WMS-Quellen verfügbar (nicht bei VectorSource)
    if (lyr.getSource().updateParams) {
        return lyr.getSource().updateParams({'CQL_FILTER': cqlExpression});
    }
}

// Spielplatzfilter
$('#filterPrivate').on('change', function()     { (!$(this).is(':checked')) ? removeFilter("playgrounds", "access")       : addFilter("playgrounds", "access", "access = 'yes' OR access IS NULL"); });
// TODO (GeoServer): filterArea und area_class-Klassifizierung (Mini/Klein/Groß/Riesen-Spielplatz) benötigen
// vorberechnete area_class-Attribute aus einem GeoServer sowie das zugehörige SLD-Styling (style/playgrounds.sld).
// UI-Element (#filterArea) und Legende wurden bereits entfernt. Wieder aktivieren, sobald ein GeoServer angebunden wird.
// $('#filterArea').on('change', function() { (!$(this).is(':checked')) ? removeFilter("playgrounds", "area") : addFilter("playgrounds", "area", "area_class > 0"); });
$('#filterWater').on('change', function()       { (!$(this).is(':checked')) ? removeFilter("playgrounds", "water")        : addFilter("playgrounds", "water", "is_water = true"); });
$('#filterShadow').on('change', function()      { (!$(this).is(':checked')) ? removeFilter("playgrounds", "shadow")       : addFilter("playgrounds", "shadow", `shadow_0${getValidMonth(getSliderMonth())}_${getFixedSliderHour(getSliderHour())} >= 50`); });
$('#filterBaby').on('change', function()        { (!$(this).is(':checked')) ? removeFilter("playgrounds", "baby")         : addFilter("playgrounds", "baby", "for_baby = true"); });
$('#filterToddler').on('change', function()     { (!$(this).is(':checked')) ? removeFilter("playgrounds", "toddler")      : addFilter("playgrounds", "toddler", "for_toddler = true"); });
$('#filterWheelchair').on('change', function()  { (!$(this).is(':checked')) ? removeFilter("playgrounds", "wheelchair")   : addFilter("playgrounds", "wheelchair", "for_wheelchair = true"); });
$('#filterBench').on('change', function()       { (!$(this).is(':checked')) ? removeFilter("playgrounds", "bench")        : addFilter("playgrounds", "bench", "bench_count > 0"); });
$('#filterPicnic').on('change', function()      { (!$(this).is(':checked')) ? removeFilter("playgrounds", "picnic")       : addFilter("playgrounds", "picnic", "picnic_count > 0"); });
$('#filterShelter').on('change', function()     { (!$(this).is(':checked')) ? removeFilter("playgrounds", "shelter")      : addFilter("playgrounds", "shelter", "shelter_count > 0"); });
$('#filterTableTennis').on('change', function() { (!$(this).is(':checked')) ? removeFilter("playgrounds", "table_tennis") : addFilter("playgrounds", "table_tennis", "table_tennis_count > 0"); });
$('#filterSoccer').on('change', function()      { (!$(this).is(':checked')) ? removeFilter("playgrounds", "soccer")       : addFilter("playgrounds", "soccer", "has_soccer = true"); });
$('#filterBasketball').on('change', function()  { (!$(this).is(':checked')) ? removeFilter("playgrounds", "basketball")   : addFilter("playgrounds", "basketball", "has_basketball = true"); });

function getFixedSliderHour(hour) {
    return (hour < 10) ? `0${hour}` : hour;
}


// Datenprobleme anzeigen
$('#show-map-issues').on('change', function() {
    if ($(this).is(':checked')) {
        dataIssues.setVisible(true);
    } else {
        dataIssues.setVisible(false);
    }
});

// Datenprobleme-Filter
// zu Beginn sind die Schatten-Issues ausgeblendet
$('#filter-map-issues-1').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "01") : addFilter("completeness", "01", "not bug_level = '1'"); });
$('#filter-map-issues-2').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "02") : addFilter("completeness", "02", "not bug_level = '2'"); });
$('#filter-map-issues-3').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "03") : addFilter("completeness", "03", "not bug_level = '3'"); });
$('#filter-map-issues-4').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "04") : addFilter("completeness", "04", "not bug_level = '4'"); });
$('#filter-map-issues-5').on('change', function() { ($(this).is(':checked')) ? removeFilter("completeness", "05") : addFilter("completeness", "05", "not bug_level = '5'"); });