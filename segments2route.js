#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const turf = {
    featureCollection: require('@turf/helpers').featureCollection,
    featureEach: require('@turf/meta').featureEach,
    lineString: require('@turf/helpers').lineString
};

if (process.argv.length < 3) {
    console.warn('Usage: ./segments2route.js route.geojson outputDirectory');
    process.exit(1);
}

const inputFile = process.argv[2];
const outputDir = process.argv[3];

var inputGeoJSON = JSON.parse(fs.readFileSync(inputFile).toString('utf8').replace(/^\uFEFF/, ''));
var segments = {};
var stationPoints = {};

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

turf.featureEach(inputGeoJSON, function (feature) {

    routeRefs.forEach(function (ref) {
        var key = 'segment' + (ref === '' ? '' : '_' + ref);
        var stationKey = 'station' + (ref === '' ? '' : '_' + ref);

        if (!(key in segments)) {
            segments[key] = {};
        }
        if (!(key in stationPoints)) {
            stationPoints[key] = [];
        }

        if (feature.geometry.type === "LineString" && key in feature.properties) {
            var nums = feature.properties[key].split(',').map(function (segment) { return Number(segment); });

            nums.forEach(function (num, index) {
                if (num >= 0) {
                    segments[key][nums[index]] = feature.geometry.coordinates;
                } else {
                    var reversed = feature.geometry.coordinates.slice();
                    reversed.reverse();
                    segments[key][nums[index]] = reversed;
                }
            });
        } else if (feature.geometry.type === "Point" && stationKey in feature.properties) {
            stationPoints[key].push(feature);
        } // else not part of the route
    });
});

Object.keys(segments).forEach(function (ref) {
    var lineString = [];
    console.warn('Segments for ' + ref + ' are:');
    Object.keys(segments[ref]).sort(function (a, b) {return Math.abs(a) - Math.abs(b)}).forEach(function (key) {
        console.warn('   ' + key);
        lineString.push(...segments[ref][key]);
    });

    var geojson = JSON.stringify(turf.featureCollection(stationPoints[ref].concat([turf.lineString(lineString)])));
    var fileName = path.basename(inputFile, '.geojson') + '_' + ref + '.geojson';
    const outputPath = path.join(outputDir, fileName);
    if (fs.existsSync(outputPath)) {
        console.warn(outputPath + ' exists, skipping.');
    } else {
        console.warn('Writting to ' + outputPath);
        fs.writeFileSync(outputPath, geojson);
    }
});

