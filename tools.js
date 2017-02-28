// tools.js
// ========

const exec = require('child_process').exec;

var formidable = require("formidable"),
    util = require("util"),
    AdmZip = require('adm-zip'),
    mongoClient = require("mongodb").MongoClient,
    assert = require('assert');

var mongoUrl = "";
var monhost = process.env.MONHOST;
var monport = process.env.MONPORT;

if (monhost && monport) {
    mongoUrl = "mongodb://" + monhost + ":" + monport + "/";
}
else {
    mongoUrl = "mongodb://172.17.0.1:27015/";
}
console.log("mongoUrl", mongoUrl);

/**
 * Send message to user
 */
var alertUser = function (message, response, fields, files) {
    response.writeHead(200, {
        "content-type": "text/plain"
    });

    response.write(message + "\n\n");

    if (fields != undefined && files != undefined) {
        // Output the processed form details to the user
        response.end(util.inspect({
            fields: fields,
            files: files
        }));
    } else {
        response.end();
    }

};

/**
 * Get manifest file
 */
function getManifest(file_name) {

    var zip = new AdmZip(file_name);
    var zipEntries = zip.getEntries(); // an array of ZipEntry records
    var rtn = {};
    var count = 0;

    zipEntries.forEach(function (zipEntry) {
        //var en = zipEntry.entryName;
        var n = zipEntry.name;
        //console.log(zipEntry.toString()); // outputs zip entries information

        if (n == "manifest.json") {
            count++;
            var data = zipEntry.getData().toString('utf8'); // string
            //var data1 = zip.readAsText(zipEntry); // string
            rtn = JSON.parse(data); // object

        }

    });

    if (Object.keys(rtn).length == 0) {
        rtn = null;
    }
    return rtn;
}

/**
 * Insert document (manifest) to database
 */
var insert = function (zipFile, newDoc, response, compute_features_load_data, alertUser) {
    // Connection URL
    var url = mongoUrl + 'u24_3dslicer';

    // Use connect method to connect to the Server
    mongoClient.connect(url, function (err, db) {
        assert.equal(null, err);
        var msg;

        // Check first to see if document exists
        db.collection('optimized').findOne(newDoc, function (err, doc) {
            if (err || doc) {
                msg = "Document exists";
                console.log(msg);
                alertUser(msg, response);
            } else {
                // Insert document
                newDoc.submit_date = new Date();
                db.collection('optimized').insertOne(newDoc, function (err, r) {
                    assert.equal(1, r.insertedCount);
                    console.log("Inserted document");
                    compute_features_load_data(zipFile, newDoc, response, alertUser);

                });
            }
            db.close();
        });

    });
};

/**
 * Run command-line
 */
var run_my_cmd = function (mycmd, newDoc, response, alertUser) {
    console.log("Running command:", mycmd);

    var child = exec(mycmd, function (error, stdout, stderr) {
        if (error) {
            console.log("ERROR: " + error);
            alertUser("SOMETHING WENT WRONG. HERE'S THE MESSAGE:\n" + error, response);

        } else {
            var msg = "Success! Uploaded file.";
            alertUser(msg, response);
            console.log(msg);
        }
    });

};

/**
 * Compute features and load the results to the database.
 */
var compute_features_load_data = function (zipFile, manifestDoc, response, alertUser) {

    // Default
    var tileImg = "original.tif";
    var maskImg = manifestDoc.layers[0].file;

    var dbTemp = "",
        caseId = "",
        subjectId = "",
        executionId = "",
        x = "",
        y = "",
        w = "",
        h = "";

    if (manifestDoc.x == null) {
        // Tile is from filesystem; parse the name.
        // Issue: any old file won't work. :(
        var res = maskImg.split("_");
        caseId = res[0];
        x = res[1];
        y = res[2];
        w = res[3];
        h = res[4];
        dbTemp = res[5];

    }
    else {
        caseId = maskImg.substring(0, maskImg.lastIndexOf("-"));
        x = manifestDoc.x;
        y = manifestDoc.y;
        //dbTemp = manifestDoc.cancerType; // SlicerPath: hopefully we're getting this soon
    }

    subjectId = caseId.substring(0, 12);
    executionId = manifestDoc.execution_id;

    if (dbTemp != "") {
        db = "u24_" + dbTemp.toLowerCase();
    }
    else {
        // DB will be validated in shell script.
        db = "u24_luad";
    }

    var jsonString = "{'curvatureWeight':'" +
        manifestDoc.layers[0].curvatureWeight +
        "','kernelSize':'" +
        manifestDoc.layers[0].kernelSize +
        "','mpp':'" +
        manifestDoc.layers[0].mpp +
        "','otsuRatio':'" +
        manifestDoc.layers[0].otsuRatio +
        "','sizeThld':'" +
        manifestDoc.layers[0].sizeThld +
        "','sizeUpperThld':'" +
        manifestDoc.layers[0].sizeUpperThld +
        "'}";

    var cmd = __dirname + "/run_feature_computation.sh "
        + zipFile + " "
        + tileImg + " "
        + maskImg + " "
        + executionId + " "
        + db + " "
        + subjectId + " "
        + caseId + " "
        + "\"" + jsonString + "\"";

    run_my_cmd(cmd, manifestDoc, response, alertUser);

};

/**
 * Convert string date from manifest, to ISODate.
 */
function dateToISO(str1) {
    // str1 format would be 20160928104932
    var yr1 = parseInt(str1.substring(0, 4));
    var mon1 = parseInt(str1.substring(4, 6));
    var dt1 = parseInt(str1.substring(6, 8));

    var hh = parseInt(str1.substring(8, 10));
    var mm = parseInt(str1.substring(10, 12));
    var ss = parseInt(str1.substring(12, 14));

    return new Date(yr1, mon1 - 1, dt1, hh, mm, ss);
}

module.exports = {

    /**
     * Upload file
     */
    upload: function (request, response) {
        console.log(Date());
        var form = new formidable.IncomingForm();

        // Change default upload dir
        form.on('fileBegin', function (name, file) {
            file.path = __dirname + "/uploads/" + file.name;
        });

        // Parse incoming request containing form data
        form.parse(request, function (err, fields, files) {

            var location = __dirname + "/uploads/";

            var fileObject = files.file;

            // Built-in: The file name of the uploaded (zip) file
            var file_name = fileObject.name;
            console.log("file_name", file_name);

            var newDoc = getManifest(location + file_name);

            if (newDoc != null) {
                if (newDoc.layers == null) {
                    // Supposing someone sent a bogus manifest...
                    var msg = "Invalid manifest.json content";
                    alertUser(msg, response);
                    console.log(msg);
                }
                else {
                    // Looks good, compute features and load data
                    newDoc.file_name = file_name;
                    newDoc.location = location;

                    insert(file_name, newDoc, response, compute_features_load_data, alertUser);

                }

            } else {
                alertUser("No manifest! Try again.", response);
                console.log("No manifest");
            }

        });

        // Check for upload errors
        form.on("error", function (err) {
            console.error(err);
        });

    }

};
