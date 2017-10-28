#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const turf = {
    featureCollection: require('@turf/helpers').featureCollection,
    featureEach: require('@turf/meta').featureEach,
    lineString: require('@turf/helpers').lineString,
    feature: require('@turf/helpers').feature
};

if (process.argv.length < 3) {
    console.warn('Usage: ./segments2dataset.js route.geojson outputDirectory');
    process.exit(1);
}

const inputFile = process.argv[2];
const outputDir = process.argv[3];

var inputGeoJSON = JSON.parse(fs.readFileSync(inputFile).toString('utf8').replace(/^\uFEFF/, ''));
var outputFeatures = {};

var routeRefs = [];
turf.featureEach(inputGeoJSON, function (feature) {
    Object.keys(feature.properties).map(function (key) {
        if (key.startsWith('segment_')) {
            routeRefs.push(key.replace(/^segment_/, ''));
        } else if (key.startsWith('segment')) {
            routeRefs.push('');
        }
    });
});
routeRefs = _.uniq(routeRefs);
console.warn('Route Refs: ' + routeRefs.join(','));

turf.featureEach(inputGeoJSON, function (inputFeature) {
    routeRefs.forEach(function (ref) {
        var feature = _.cloneDeep(inputFeature);

        var key = 'segment' + (ref === '' ? '' : '_' + ref);
        var stationKey = 'station' + (ref === '' ? '' : '_' + ref);

        if (!(key in outputFeatures)) {
            outputFeatures[key] = [];
        }

        if (feature.geometry.type === "LineString" && key in feature.properties) {
            var nums = feature.properties[key].split(',').map(function (segment) { return Number(segment); });

            nums.forEach(function (num, index) {
                if (num >= 0) {
                    feature.properties.forward = true;
                } else {
                    feature.properties.backward = true;
                }
            });

            // duplicate into plain segment key
            feature.properties.segment = feature.properties[key];

            // remove all other segment tags
            Object.keys(feature.properties).forEach(function (i) {
                if (i.startsWith('segment_')) {
                    delete feature.properties[i];
                }
            });

            outputFeatures[key].push(feature);
        } else if (feature.geometry.type === "Point" && stationKey in feature.properties) {
            // duplicate into plain station key
            feature.properties.station = feature.properties[stationKey];

            // remove all other station tags
            Object.keys(feature.properties).forEach(function (i) {
                if (i.startsWith('station_')) {
                    delete feature.properties[i];
                }
            });
            outputFeatures[key].push(feature);
        } // else not part of the route
    });
});

Object.keys(outputFeatures).forEach(function (ref) {
    var geojson = JSON.stringify(turf.featureCollection(outputFeatures[ref]));
    var fileName = path.basename(inputFile, '.geojson') + '_' + ref + '_dataset.geojson';
    const outputPath = path.join(outputDir, fileName);
    if (fs.existsSync(outputPath)) {
        console.warn(outputPath + ' exists, skipping.');
    } else {
        console.warn('Writting to ' + outputPath);
        fs.writeFileSync(outputPath, geojson);
    }
});

