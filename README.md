# route-map

route-map is a simple tool helping you create maps for a walking, running, cycling route particularly where the route doubles back on itself. The key is that the route definition contains each segment mapped once. So a route which goes from A to B then back to A along the same way (eg. a return journey) only has one line from A to B in your source route definition. This aims to retain the topology of the route.

## Create Source Route
Create your route in JOSM ([sample](data/willoughby-park-run.osm)) or any other tool as a GeoJSON ([sample](data/willoughby-park-run.geojson)).

Each segment of the route should be one way/feature. Each segment should have a tag/property of key `segment` and value should be a comma seperated list of the segment number. For example in the route shown below each color is one segment. The red one has `segment=8,-9` which means this way/feature makes up segment 8 of the route and segment 9 of the route in the reverse direction.

[!data/willoughby-park-run.png]

If you created your route in JOSM save it as a .osm file and convert it to a GeoJSON with:

    # osmium-tool >= 1.7.0 http://osmcode.org/osmium-tool/
    > osmium renumber --output route.renumber.osm route.osm
    > osmium export --config osmium-export.json --output-format geojson --output route.geojson route.renumber.osm

## Full GPX Style Route

Once you have the route.geojson this can be processed into a full GPX style route with:

    > ./segments2route.js route.geojson .

To produce a GPX file:

    # split into route and waypoint files
    > ogr2ogr -f 'GeoJSON' -where "OGR_GEOMETRY='Point'" -nln waypoints route_segment.wpt.geojson route_segment.geojson 
    > ogr2ogr -f 'GeoJSON' -where "OGR_GEOMETRY='LineString'" -nln routes route_segment.rte.geojson route_segment.geojson 

    # use VRT source to combine the waypoint and route geojson files into a GPX
    > ogr2ogr -f 'GPX' -dsco GPX_USE_EXTENSIONS=YES route_segment.gpx gpx.vrt 


## Add Elevation

You can add an elevation to your `route_segment.gpx` from SRTM1 or another source. The following instructions based on a mosaic for NSW, Australia.

    # convert the route into the same projection as the DEM
    ogr2ogr -f 'GeoJSON' -t_srs 'EPSG:28356' route_28356.geojson route_segment.geojson

    # trim the DEM to only cover the extent of the route
    ./trimDem.sh route_28356.geojson nswdemz56.tif

    # load the trimmed DEM into PostgreSQL as a PostGIS raster
    raster2pgsql -d -C -I -M -t auto -s 28356 route_28356.tiff dem | psql --quiet

    # also load the route into PostgreSQL
    ogr2ogr -f "PostgreSQL" -nln route PG:"dbname=" route_28356.geojson 

    # determine the pixel size of the DEM
    pixel_size=`gdalinfo route_28356.tiff | grep 'Pixel Size' | cut -d' ' -f4 | cut -d',' -f1 | sed 's/^(//'`

    # segmentize the route based on the resolution of the DEM (pixel size), and dump the linestring out to individual points
    psql -c "DROP TABLE route_points;"
    psql -c "CREATE TABLE \"route_points\" AS select (ST_DumpPoints(ST_Segmentize(wkb_geometry, $pixel_size))).*, 0.0 AS ele from route;"

    # use ST_Value to get the elevation from the DEM at each point in the segmentized route
    psql -c "CREATE INDEX ON route_points USING gist (geom);"
    psql -c "UPDATE route_points SET ele = (SELECT ST_Value(dem.rast, geom) AS ele FROM dem WHERE ST_Intersects(route_points.geom, dem.rast) ORDER BY ele LIMIT 1);"

    # then update the geometry to include the elevation
    psql -c "UPDATE route_points SET geom = ST_MakePoint(ST_X(geom), ST_Y(geom), ele);"

    # then ST_MakeLine to reconstruct the points with elevation back into a LineString.
    psql -c "CREATE AGGREGATE array_accum (anyelement) ( sfunc = array_append, stype = anyarray, initcond = '{}');"
    psql -c "DROP TABLE routez;"
    psql -c "CREATE TABLE routez AS SELECT ST_MakeLine(array_accum(geom)) AS geom FROM (SELECT * FROM route_points ORDER BY path) AS route;"

    # export back to GeoJSON
    ogr2ogr -f GeoJSON -lco COORDINATE_PRECISION=6 -t_srs 'EPSG:4326' -s_srs 'EPSG:28356' routez.geojson PG: routez
