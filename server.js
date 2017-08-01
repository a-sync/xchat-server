'use strict';
// Load required modules
const fs = require("fs");                   // https server core module
const https = require("https");             // https server core module
const CONFIG = require("./config");         // defaults, env vars, parameters
const express = require("express");         // web framework external module
const serveStatic = require('serve-static');// serve static files
const socketIo = require("socket.io");      // web socket external module
const easyrtc = require("easyrtc");         // EasyRTC external module

easyrtc.setOption("logLevel", "info");// (debug|info|warning|error|none)
easyrtc.setOption("logDateEnable", true);
easyrtc.setOption("appAutoCreateEnable", false);
easyrtc.setOption("roomAutoCreateEnable", true);//TODO: create room with model as owner
easyrtc.setOption("roomDefaultEnable", false);
//easyrtc.setOption("connectionDefaultField", {"foo":{fieldValue:"bar",fieldOption:{isShared:true}}});
easyrtc.setOption("apiEnable", false);
easyrtc.setOption("apiLabsEnable", false);
easyrtc.setOption("demosEnable", false);
easyrtc.setOption("updateCheckEnable", false);
easyrtc.setOption("usernameRegExp", /^[a-z0-9_.-]{1,32}$/i);
easyrtc.setOption("presenceShowRegExp", /^(online|offline)$/);
easyrtc.setOption("presenceStatusRegExp", /^(.){0,255}$/);

process.title = "xchat-server";

var app = express();
app.use(serveStatic('static', {'index': ['index.html']}));

var webServer = https.createServer({
    key: fs.readFileSync(__dirname + '/keys/key.pem'),
    cert: fs.readFileSync(__dirname + '/keys/cert.pem')
},app).listen(CONFIG.PORT);

var socketServer = socketIo.listen(webServer, {"log level":1});


//DEBUG
// Overriding the default easyrtcAuth listener, only so we can directly access its callback
easyrtc.events.on("easyrtcAuth", function(socket, easyrtcid, msg, socketCallback, callback) {
    easyrtc.events.defaultListeners.easyrtcAuth(socket, easyrtcid, msg, socketCallback, function(err, connectionObj){
        if (err || !msg.msgData || !msg.msgData.credential || !connectionObj) {
            callback(err, connectionObj);
            return;
        }

        connectionObj.setField("credential", msg.msgData.credential, {"isShared":true});

        console.log("["+easyrtcid+"] Credential saved!", connectionObj.getFieldValueSync("credential"));

        callback(err, connectionObj);
    });
});

// To test, lets print the credential to the console for every room join!
easyrtc.events.on("roomJoin", function(connectionObj, roomName, roomParameter, callback) {
    console.log("["+connectionObj.getEasyrtcid()+"] Credential retrieved!", connectionObj.getFieldValueSync("credential"));
    easyrtc.events.defaultListeners.roomJoin(connectionObj, roomName, roomParameter, callback);
});
//DEBUG



var rtcServer = easyrtc.listen(
    app,
    socketServer,
    null,
    function(err, rtc) {
        if (err) console.error(err);

        rtc.createApp(
            'xchat',
            null,
            rtcApp
        );
    }
);

var customersData = {};
var rtcApp = function(err, appObj) {
    if (err) console.error(err);
    console.log('xchat-server init...');

    appObj.events.on('authenticate', authenticateListener);

    appObj.events.on('authenticated', authSuccess);
};

function authenticateListener(socket, easyrtcid, appName, username, credential, easyrtcAuthMessage, next) {
    console.log('! authenticate', easyrtcid, appName, username, credential);//, easyrtcAuthMessage);

    let validTokenData = validateAuthToken(username, credential.token);

    if (validTokenData) {
        credential.balance = validTokenData.balance || 0;
        credential.avatar_url = validTokenData.avatar_url || '';

        customersData[easyrtcid] = credential;
        next(null);
    }
    else {
        //TODO: next action? reload? ajax for new token?
        next(new easyrtc.util.ConnectionError("Failed auth."));
    }
}

function validateAuthToken(name, token) {
    let re = false;

    //TODO: got that json with ajax headers & api key posted
    console.log(CONFIG.API_KEY, CONFIG.API_URL);
    //if ok, return all necessary and available data

    return re;
}

function authSuccess(connectionObj, next) {
    console.log('! authenticated');

    let easyrtcid = connectionObj.getEasyrtcid();

    if (customersData.hasOwnProperty(easyrtcid)) {
        connectionObj.setField('balance', customersData[easyrtcid].balance, {"isShared":true});

        let p = {
            show: 'online',
            status: customersData[easyrtcid].avatar_url || ''
        };

        delete customersData[easyrtcid];

        connectionObj.setPresence(p, next);
    }
    else {
        let err = 'Missing auth credentials for: '+easyrtcid;
        console.error(err, connectionObj);
        next(new easyrtc.util.ConnectionError(err));
    }
}

//TODO: block users from setting presence or atleast filter status text

//listen on port PORT
webServer.listen(CONFIG.PORT, function () {
    console.log('xchat-server listening on https://localhost:'+CONFIG.PORT);
});
