#!/bin/bash

PROGNAME=$(basename "$0")
UPLOAD_DIR="$(pwd)/uploads"
# Create unique temp dir
UUID=$(uuidgen)
TEMP_DIR="$UPLOAD_DIR/tmp/$UUID"
# DATA_LOADER="$HOME/github/pathomics_featuredb/src/build/install/featuredb-loader/bin/featuredb-loader"
# TODO: data loader is now a docker container.
# DATA_LOADER="quip-loader"

function usage {

   # Display usage message on standard error
   echo "Usage: $PROGNAME zip tile mask executionId db subjectId caseId" 1>&2
}

function clean_up {

   # Perform program exit housekeeping. Optionally accepts an exit status
   rm -rf "$TEMP_DIR"
   echo "Cleaning up and exiting $1"
   exit "$1"
}

function error_exit {

   # Display error message and exit
   echo "${PROGNAME}: ${1:-"Error"}" 1>&2
   clean_up 1
}

function do_stuff {

   # ERROR-CHECK EVERYTHING.

   # zip tile mask executionId algorithm subjectId caseId
   zipFile=$1
   tileImg=$2
   maskImg=$3
   executionId=$4
   db=$5
   subjectId=$6
   caseId=$7
   json="$8"

   host=${MONHOST}
   port=${MONPORT}

   # Check db for caseId
   #return_str=$(mongo --eval "connect('$host:$port/$db').images.find({'case_id':'$caseId'})" | grep "case_id" | xargs)
   return_str=$(mongo $host:$port/$db --eval "db.images.find({'case_id':'$caseId'}).shellPrint()" | grep "case_id" | xargs)

   # If we didn't find it, figure out which database it's really in.
   if [ "$return_str" = "" ]; then
     databases=( "quip" "u24_brca" "u24_gbm" "u24_lgg" "u24_luad" "u24_paad")
     for dd in "${databases[@]}"
     do
       :
       if [ "$db" = "$dd" ]; then
         continue
       fi
       # return_str=$(mongo --eval "connect('$host:$port/$dd').images.find({'case_id':'$caseId'})" | grep "case_id" | xargs)
       return_str=$(mongo $host:$port/$dd --eval "db.images.find({'case_id':'$caseId'}).shellPrint()" | grep "case_id" | xargs)
       if [ "$return_str" = "" ]; then
         echo "$caseId not in $dd"
       else
         echo "found $caseId in $dd"
         db=$dd
         break
       fi
     done

   fi;

   # Go to uploads dir
   cd $UPLOAD_DIR || error_exit "$LINENO: Could not change directory"

   # Create unique temp dir
   mkdir -p "$TEMP_DIR" || error_exit "$LINENO: Could not make directory"

   # Unzip file to temp dir
   unzip "$zipFile" -d "$TEMP_DIR" || error_exit "$LINENO: Could not unzip file"
   TEMP_SUB_DIR=$TEMP_DIR/${zipFile%.*}

   # Turn off stderr, since we are going to handle it.
   if ls $TEMP_SUB_DIR 2>/dev/null ; then
      echo "OK"
   else
      TEMP_SUB_DIR=$TEMP_DIR/${zipFile%.*}
      mkdir -p $TEMP_SUB_DIR
      mv $TEMP_DIR/*.* $TEMP_SUB_DIR
   fi

   # Get docker container id
   # TODO: User has to pass in what the container names are.
   # For both feature computation and data loader.
   # Use docker environment variable.
   # container="quip-jobs" # eventually this may be quip-jobs
   container="test_segmentation"
   containerId=$(docker inspect --format '{{ .Id }}' $container) || error_exit "$LINENO: Could not get docker container ID"

   # Copy mask and tile to docker container

   if [ ! -f "$TEMP_SUB_DIR/$maskImg" ]; then
     # A BandAid for SlicerPath.
     maskImg="WEB_gray-label.tif"
   fi

   (ls "$TEMP_SUB_DIR/$tileImg" && ls "$TEMP_SUB_DIR/$maskImg") || error_exit "$LINENO: I give up. manifest.json tells a lie."
   docker cp "$TEMP_SUB_DIR/$tileImg" "$containerId:/data/input/"
   # From manifest.json layers[0].file
   docker cp "$TEMP_SUB_DIR/$maskImg" "$containerId:/data/input/"


   # Run feature computation algorithm
   alg="Y"
   # pgm="/tmp/build/computeFeatures"
   pgm="/tmp/pathomics_analysis/nucleusSegmentation/build/app/computeFeatures"
   tile="/data/input/$tileImg"
   mask="/data/input/$maskImg"
   outfile="output-$alg.csv"
   output="/data/output/"$outfile
   docker exec $container $pgm $tile $mask $alg $output

   # Copy results here
   docker cp "$containerId:$output" "$TEMP_SUB_DIR/$outfile"
   ls "$TEMP_SUB_DIR/$outfile" || error_exit "$LINENO: Output file not found"

   # Add data to manifest
   sed -i '$s/}/,\n"output'$alg'":"'$outfile'"}/' $TEMP_SUB_DIR/manifest.json

   # Load results to database
   # mongoimport --host $host --port $port --db u24_3dslicer --collection optimized --type csv --headerline --file "$TEMP_SUB_DIR/$outfile"

   # Use data loader
   ###$DATA_LOADER --dbhost $host --dbport $port --dbname $db --inptype csv --inpfile "$TEMP_SUB_DIR/$outfile" --eid $executionId --cid $caseId --eparms $json --sid $subjectId --studyid "u24_tcga_slicer_$alg" --fromdb
   #|| error_exit "$LINENO: Data loader failed" # Loader doesn't return non-zero :(


   # Run feature computation algorithm
   alg="J"
   outfile="output-$alg.csv"
   output="/data/output/"$outfile
   docker exec $container $pgm $tile $mask $alg $output
   # Copy results here
   docker cp "$containerId:$output" "$TEMP_SUB_DIR/$outfile"
   ls "$TEMP_SUB_DIR/$outfile" || error_exit "$LINENO: Output file not found"

   # Add data to manifest
   sed -i '$s/}/,\n"output'$alg'":"'$outfile'"}/' $TEMP_SUB_DIR/manifest.json

   # Load results to database
   ###$DATA_LOADER --dbhost $host --dbport $port --dbname $db --inptype csv --inpfile "$TEMP_SUB_DIR/$outfile" --eid $executionId --cid $caseId --eparms $json --sid $subjectId --studyid "u24_tcga_slicer_$alg" --fromdb
   #|| error_exit "$LINENO: Data loader failed" # Loader doesn't return non-zero :(


   # Repackage the zip file
   cd $TEMP_DIR || error_exit "$LINENO: Could not change directory"
   zip -r $zipFile ${zipFile%.*} || error_exit "$LINENO: Could not repackage zip"
   mv $zipFile $UPLOAD_DIR || error_exit "$LINENO: Could not move zip"

   # Clean up temp dir
   clean_up 0

   exit 0
}

trap clean_up SIGHUP SIGINT SIGTERM

if [ $# -lt "7" ]; then
   usage
   error_exit "$LINENO: zip tile mask executionId db subjectId caseId"
fi

if [ ! -f "$UPLOAD_DIR/$1" ]; then
   error_exit "$LINENO: file $1 cannot be read"
fi

if file --mime-type "$UPLOAD_DIR/$1" | grep -q zip$; then
   do_stuff "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8"
else
  error_exit "$LINENO: $1 is not zipped"
fi
