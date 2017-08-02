'use strict';
// Load required modules
const fs = require("fs");                   // https server core module
const https = require("https");             // https server core module
const CONFIG = require("./config");         // defaults, env vars, parameters
const express = require("express");         // web framework external module
const serveStatic = require('serve-static');// serve static files
const socketIo = require("socket.io");      // web socket external module
const easyrtc = require("easyrtc");         // EasyRTC external module
const got = require("got");

process.title = 'xchat-server';

var app = express();
app.use(serveStatic('static', {'index': ['index.html']}));

var webServer = https.createServer({
    key: fs.readFileSync(__dirname + '/keys/key.pem'),
    cert: fs.readFileSync(__dirname + '/keys/cert.pem')
},app).listen(CONFIG.PORT);

var socketServer = socketIo.listen(webServer, {"log level":1});

easyrtc.setOption("logLevel", "info");// (debug|info|warning|error|none)
easyrtc.setOption("logDateEnable", true);
easyrtc.setOption("appAutoCreateEnable", false);
easyrtc.setOption("roomAutoCreateEnable", true);//TODO: create room with model as owner
easyrtc.setOption("roomDefaultEnable", false);
easyrtc.setOption("apiEnable", false);
easyrtc.setOption("apiLabsEnable", false);
easyrtc.setOption("demosEnable", false);
easyrtc.setOption("updateCheckEnable", false);
easyrtc.setOption("usernameRegExp", /^[a-z0-9_.-]{1,32}$/i);
easyrtc.setOption("presenceShowRegExp", /^(online|offline)$/);
easyrtc.setOption("presenceStatusRegExp", /^(.){0,255}$/);

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

    appObj.events.on('easyrtcAuth', rtcAuthCallback);

    appObj.events.on('easyrtcCmd', rtcCmd);
};

function authenticateListener(socket, easyrtcid, appName, username, credential, easyrtcAuthMessage, next) {
    console.log('! authenticate', username);// easyrtcid, appName, username, credential);

    if (username !== credential.name) next('Invalid auth.');
    else {
        validateAuthToken(credential)
            .then(validTokenData => {
                credential.balance = validTokenData.balance || 0;

                customersData[easyrtcid] = validTokenData;
                next(null);
            })
            .catch(err => {
                //TODO: next action? reload? ajax for new token?
                next('Failed auth.');
            });
    }
}

function validateAuthToken(cred) {
    return new Promise((resolve, reject) => {
        apiCall({token: cred.token})
            .then(res => {
                if (res.body.ok === true) resolve(res.body);
                else reject(res.body);
            })
            .catch(err => {
                console.error('validateAuthToken.error', err);
                reject(err);
            });
    });
}

function apiCall(data) {
    data.api_key = CONFIG.API_KEY;

    return got.post(CONFIG.API_URL, {
        body: data,
        json: true,
        form: true
    });
}

function authSuccess(connectionObj, next) {
    console.log('! authenticated', connectionObj.getUsername());

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

function rtcAuthCallback(socket, easyrtcid, msg, socketCallback, callback) {
    easyrtc.events.defaultListeners.easyrtcAuth(socket, easyrtcid, msg, socketCallback, function (err, connectionObj) {
        if (err || !msg.msgData || !msg.msgData.credential || !connectionObj) {
            callback(err, connectionObj);
            return;
        }

        connectionObj.setField('credential', msg.msgData.credential, {"isShared": false});
        console.log('! cred', connectionObj.getFieldValueSync('credential'));

        callback(err, connectionObj);
    });
}

function rtcCmd(connectionObj, msg, socketCallback, next) {
    switch(msg.msgType) {
        case 'setPresence':
        case 'roomJoin':
        case 'getRoomList':
            console.log('CMD BLOCKED', msg.msgType);
            next(null);
            break;
        default:
            easyrtc.events.defaultListeners.easyrtcCmd(connectionObj, msg, socketCallback, next);
    }
}

//listen on port PORT
webServer.listen(CONFIG.PORT, function () {
    console.log('xchat-server listening on https://localhost:'+CONFIG.PORT);
});
