// findApi.js
// ========
var mongoClient = require("mongodb").MongoClient,
    ObjectID = require('mongodb').ObjectID,
    url = require("url"),
    port = 3000,
    db = "u24_luad",
    collection = "objects";

const http = require('http');

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

module.exports = {
    find: function (request, response) {
        console.log(Date());
        var urlString = request.url,
            parms = {}, // search parms
            urlObject,
            max = 10000, // maximum number of records at a time
            med = 0; // default number of records at a time

        if (urlString.endsWith(";")) {
            urlString = urlString.slice(0, -1);
        }

        console.log("urlString", urlString);
        urlObject = url.parse(urlString);

        if (urlString.indexOf("favicon.ico") !== -1) {
            response.end(""); //<-- favicon being requested
        } else {

            console.log("Client IP: " + request.ip);
            console.log("Client Address: " + request.connection.remoteAddress);

            if (urlObject.search) {

                var str = urlObject.search.slice(1);
                //delete stuff off the end that does not belong there
                //eg. &_=1467995391225
                if (str.indexOf("&_=") > -1)
                    str = str.substring(0, str.indexOf("&_="));

                //if (urlObject.search) { // parse request parameters
                str.split("&").forEach(function (pp) {
                    pp = pp.split("=");
                    if (parseFloat(pp[1])) {
                        pp[1] = parseFloat(pp[1]);
                    }
                    parms[pp[0]] = pp[1];
                });
                //}

                // default parameter values
                if (!parms.limit) {
                    parms.limit = med;
                    response.end("");
                    console.log("Request with no limit parameter!");
                    return;
                }

                if (parms.limit === 0) {
                    response.end("");
                    console.log("Request with limit===0!");
                    return;
                }

                if (parms.limit > max) {
                    parms.limit = max;
                }

                if (!parms.db) {
                    parms.db = db;
                } // <-- default db

                if (!parms.mongoUrl) {
                    parms.mongoUrl = mongoUrl + parms.db; // <-- default mongo
                }
                else {
                    var str = parms.mongoUrl;
                    if (str.endsWith("/")) {
                        parms.mongoUrl += parms.db;
                    }
                    else {
                        parms.mongoUrl += ("/" + parms.db);
                    }

                }

                if (!parms.collection) {
                    parms.collection = collection;
                } // <-- default collection

                if (!parms.find) { // find
                    parms.find = {};
                } else {
                    parms.find = recode(parms.find, parms);
                }
                if (parms.offset) {
                    parms.offset = recode(parms.offset, parms);
                    parms.offset = new ObjectID.createFromHexString(parms.offset);
                    parms.find._id = {"$gt": parms.offset};
                }

                if (!parms.project) { // project
                    parms.project = {};
                } else {
                    parms.project = recode(parms.project, parms);
                }

                response.writeHead(200, {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                });

                if (!parms.err) {

                    console.log("parms:", JSON.stringify(parms));

                    mongoClient.connect(parms.mongoUrl, function (err, db) {

                        if (err) {
                            console.log("Unable to connect to the MongoDB server. Error: ", err);
                            response.end(JSON.stringify({"Unable to connect to the MongoDB server. Error: ": err}));
                        } else {

                            db.collection(parms.collection).find(parms.find, parms.project, {
                                limit: parms.limit
                            }).toArray(function (err1, docs) {
                                if (err1) {
                                    console.log("toArray() error: ", err1);
                                    response.end(JSON.stringify({}));
                                } else {
                                    if (docs !== null) {
                                        db.close();
                                        response.end(JSON.stringify(docs));
                                    } else {
                                        db.close();
                                        response.end(JSON.stringify({}));
                                    }
                                }
                            });
                        }

                    });
                } else {
                    console.log("parms.err", parms.err);
                    console.log("parms.err.error.message", parms.err.error.message);
                    response.end(JSON.stringify({}));
                }
            }
            else {
                response.end(JSON.stringify({"required": "limit=#"}));
            }
        }
    }
};

function recode(enc, parms) {
    var json = "",
        dec = "";
    try {
        // recode operators
        dec = decodeURI(enc);
        if (dec.indexOf("'") > -1) {
            dec = dec.replace(/'/g, '"');
        }
        json = JSON.parse(dec);
    } catch (err) {
        parms.err = {
            error: err
        };
        console.log(err, enc);
    }

    return json;
}
