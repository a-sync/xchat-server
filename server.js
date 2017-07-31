// Load required modules
const fs = require("fs");              // https server core module
const https = require("https");              // https server core module
const CONFIG = require("./config");
const express = require("express");           // web framework external module
const serveStatic = require('serve-static');  // serve static files
const socketIo = require("socket.io");        // web socket external module
const easyrtc = require("easyrtc");               // EasyRTC external module

easyrtc.setOption("logLevel", "debug");// (debug|info|warning|error|none)
easyrtc.setOption("logDateEnable", true);
easyrtc.setOption("appAutoCreateEnable", true);
easyrtc.setOption("roomAutoCreateEnable", true);
easyrtc.setOption("roomDefaultEnable", true);
//easyrtc.setOption("connectionDefaultField", {"foo":{fieldValue:"bar",fieldOption:{isShared:true}}});
easyrtc.setOption("apiEnable", false);
easyrtc.setOption("apiLabsEnable", false);
//easyrtc.setOption("apiPublicFolder", "/xchat");
easyrtc.setOption("demosEnable", false);
easyrtc.setOption("updateCheckEnable", false);
easyrtc.setOption("usernameRegExp", /^[a-z0-9_.-]{1,32}$/i);

// Set process name
process.title = "xchat-server";

// Setup and configure Express https server. Expect a subfolder called "static" to be the web root.
var app = express();
app.use(serveStatic('static', {'index': ['index.html']}));

// Start Express https server on port PORT
var webServer = https.createServer({
    key: fs.readFileSync(__dirname + '/keys/key.pem'),
    cert: fs.readFileSync(__dirname + '/keys/cert.pem')
},app).listen(CONFIG.PORT);

// Start Socket.io so it attaches itself to Express server
var socketServer = socketIo.listen(webServer, {"log level":1});

easyrtc.events.on("authenticate", function(socket, easyrtcid, appName, username, credential, easyrtcAuthMessage, next){
    console.log('onAuthenticate', easyrtcid, appName, username, credential, easyrtcAuthMessage);

    //TODO: rest call to localhost to verify token

    if (false){
        next(new easyrtc.util.ConnectionError("Failed auth."));
    }
    else {
        next(null);
    }
});

// Overriding the default easyrtcAuth listener, only so we can directly access its callback
easyrtc.events.on("easyrtcAuth", function(socket, easyrtcid, msg, socketCallback, callback) {
    easyrtc.events.defaultListeners.easyrtcAuth(socket, easyrtcid, msg, socketCallback, function(err, connectionObj){
        if (err || !msg.msgData || !msg.msgData.credential || !connectionObj) {
            callback(err, connectionObj);
            return;
        }

        connectionObj.setField("credential", msg.msgData.credential, {"isShared":false});

        console.log("["+easyrtcid+"] Credential saved!", connectionObj.getFieldValueSync("credential"));

        callback(err, connectionObj);
    });
});

// To test, lets print the credential to the console for every room join!
easyrtc.events.on("roomJoin", function(connectionObj, roomName, roomParameter, callback) {
    console.log("["+connectionObj.getEasyrtcid()+"] Credential retrieved!", connectionObj.getFieldValueSync("credential"));

    easyrtc.events.defaultListeners.roomJoin(connectionObj, roomName, roomParameter, callback);
});

// Start EasyRTC server
var rtc = easyrtc.listen(app, socketServer, null, function(err, rtcRef) {
    console.log("Xchat init...");

    rtcRef.events.on("roomCreate", function(appObj, creatorConnectionObj, roomName, roomOptions, callback) {
        console.log("roomCreate fired! Trying to create: " + roomName);
        console.log("creatorConnectionObj", creatorConnectionObj);

        appObj.events.defaultListeners.roomCreate(appObj, creatorConnectionObj, roomName, roomOptions, callback);
    });
});

/*
// Start EasyRTC server with options to change the log level and add dates to the log.
var easyrtcServer = easyrtc.listen(
    httpApp,
    socketServer,
    {logLevel:"debug", logDateEnable:true},
    function(err, rtc) {

        // After the server has started, we can still change the default room name
        rtc.setOption("roomDefaultName", "SectorZero");

        // Creates a new application called MyApp with a default room named "SectorOne".
        rtc.createApp(
            "easyrtc.instantMessaging",
            {"roomDefaultName":"SectorOne"},
            myEasyrtcApp
        );
    }
);

// Setting option for specific application
var myEasyrtcApp = function(err, appObj) {
    // All newly created rooms get a field called roomColor.
    // Note this does not affect the room "SectorOne" as it was created already.
    appObj.setOption("roomDefaultFieldObj",
        {"roomColor":{fieldValue:"orange", fieldOption:{isShared:true}}}
    );
};
*/

//listen on port PORT
webServer.listen(CONFIG.PORT, function () {
    console.log('Xchat listening on https://localhost:'+CONFIG.PORT);
});
