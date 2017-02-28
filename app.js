// app.js
// ========

var express = require('express');
var app = express();

var tools = require('./tools');
var findApi = require('./findApi');

var port = process.env.WEBPORT;
console.log("WEBPORT", port);

// GET method route
app.get('/', function (request, response, next) {
    if (request.url === "/") {
        request.url = "/cancer_select.html";
        next();
    } else {
        findApi.find(request, response);
    }

});

// POST method route
app.post('/upload', function (request, response) {
    tools.upload(request, response);
});

// GET public
// //app.use(express.static('public'));
app.use(express.static(__dirname + "/public"));

app.listen(port);
