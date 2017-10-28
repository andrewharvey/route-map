#!/bin/sh

f="$1"
dem="$2"
bounds=`ogrinfo -al -so "$f" | grep Extent | cut -d' ' -f2,3,5,6 | tr -d '(),' | sed -E 's/^([^ ]+) ([^ ]+) ([^ ]+) ([^ ]+)$/\1 \4 \3 \2/'`
base=`basename "$f" .geojson`
gdal_translate -of GTIFF -co COMPRESS=LZW -projwin $bounds "$dem" "$base.tiff"
echo $base.tiff
