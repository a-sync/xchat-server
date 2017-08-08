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
easyrtc.setOption("presenceShowRegExp", /^(online|offline|watching|hosting)$/);
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
var xChatAppObj = null;
var rtcApp = function(err, appObj) {
    if (err) console.error(err);
    console.log('xchat-server init...');

    xChatAppObj = appObj;

    appObj.events.on('authenticate', authListener);

    appObj.events.on('authenticated', authSuccess);

    appObj.events.on('easyrtcAuth', rtcAuthCallback);

    appObj.events.on('easyrtcCmd', rtcCmd);

    appObj.events.on('easyrtcMsg', rtcMsg);
};

function authListener(socket, easyrtcid, appName, username, credential, easyrtcAuthMessage, next) {
    if(CONFIG.DBG) console.log('! authenticate', username);// easyrtcid, appName, username, credential);

    if (username !== credential.name) next('Invalid auth.');
    else {
        validateAuthToken(credential)
            .then(validTokenData => {
                credential.user_id = validTokenData.user_id || 0;
                credential.balance = validTokenData.balance || 0;
                credential.is_model = validTokenData.is_model || false;
                credential.model_name = validTokenData.model_name || '';
                credential.model_id = validTokenData.model_id || 0;

                customersData[easyrtcid] = validTokenData;
                next(null);
            })
            .catch(err => {
                //TODO: next action? reload? ajax for new token?
                next('Failed auth. ' + (err.error?err.error:''));
            });
    }
}

function validateAuthToken(cred) {
    return new Promise((resolve, reject) => {
        apiCall({f: 'validateAuthToken', token: cred.token})
            .then(res => {
                if (res.body.ok === true) resolve(res.body);
                else reject(res.body);
            })
            .catch(err => {
                if(CONFIG.DBG) console.error('validateAuthToken.error', err);
                reject(err);
            });
    });
}

function getBalances(model_id, userIds) {
    return new Promise((resolve, reject) => {
        apiCall({f: 'getBalances', model_id: model_id, "userIds[]": userIds})
            .then(res => {
                if (res.body.ok === true) resolve(res.body);
                else reject(res.body);
            })
            .catch(err => {
                if(CONFIG.DBG) console.error('getBalances.error', err);
                reject(err);
            });
    });
}

function spend(spendings) {
    return new Promise((resolve, reject) => {
        apiCall({f: 'spend', spendings: spendings})
            .then(res => {
                if (res.body.ok === true) resolve(res.body);
                else reject(res.body);
            })
            .catch(err => {
                if(CONFIG.DBG) console.error('spend.error', err);
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
    if(CONFIG.DBG) console.log('! authenticated', connectionObj.getUsername());

    let easyrtcid = connectionObj.getEasyrtcid();

    if (customersData.hasOwnProperty(easyrtcid)) {
        connectionObj.setField('balance', customersData[easyrtcid].balance, {isShared:true});

        let p = {
            show: 'online',
            status: customersData[easyrtcid].avatar_url || ''
        };

        delete customersData[easyrtcid];

        connectionObj.setPresence(p, next);
    }
    else {
        let err = 'Missing auth credentials for: '+easyrtcid;
        if(CONFIG.DBG) console.error(err, connectionObj);
        next(new easyrtc.util.ConnectionError(err));
    }
}

function rtcAuthCallback(socket, easyrtcid, msg, socketCallback, callback) {
    easyrtc.events.defaultListeners.easyrtcAuth(socket, easyrtcid, msg, socketCallback, function (err, connectionObj) {
        if (err || !msg.msgData || !msg.msgData.credential || !connectionObj) {
            callback(err, connectionObj);
            return;
        }

        connectionObj.setField('credential', msg.msgData.credential, {isShared: false});
        if(CONFIG.DBG) console.log('! cred', connectionObj.getFieldValueSync('credential'));

        callback(err, connectionObj);
    });
}

function rtcCmd(connectionObj, msg, socketCallback, next) {
    switch(msg.msgType) {
        case 'setPresence':
        case 'roomJoin':
        case 'getRoomList':
            console.log('CMD BLOCKED', msg.msgType, connectionObj.getUsername());
            next(null);
            break;
        default:
            if(CONFIG.DBG) console.log('CMD|'+msg.msgType, connectionObj.getUsername(), msg.msgData);
            easyrtc.events.defaultListeners.easyrtcCmd(connectionObj, msg, socketCallback, next);
    }
}

function rtcMsg(connectionObj, msg, socketCallback, next) {
    let is_model = connectionObj.getFieldValueSync('credential')['is_model'];

    switch (msg.msgType) {
        case 'spend':
            if (CONFIG.DBG) console.log('spend', msg.msgData);

            let balances = [];

            balances.push({name:'name1',easyrtcId:'eid1',balance:11.11});//dbg
            balances.push({name:'name2',easyrtcId:'eid2',balance:22.22});//dbg
            //spend(spendings).then(data => {}).catch(err => {});

            // ########################################################################################
            // ########################################################################################
            // ########################################################################################

            let msgObj = {
                msgType: 'balances',
                msgData: {
                    balances: balances
                }
            };

            easyrtc.util.sendSocketCallbackMsg(connectionObj.getEasyrtcid(), socketCallback, msgObj, connectionObj.getApp());
            next(null);
            break;
        case 'getBalances':
            if (is_model) {
                if (CONFIG.DBG) console.log('getBalances', msg.msgData);

                let model_name = connectionObj.getFieldValueSync('credential')['model_name'];
                connectionObj.room('model.'+connectionObj.getUsername(), (err, connectionRoomObject) => {
                    if (err) {
                        console.error(err, model_name);
                        next(err);
                    }
                    else {
                        let room = connectionRoomObject.getRoom();

                        if (msg.msgData && Object.keys(msg.msgData).length) {

                            let conns = [];
                            Object.keys(msg.msgData).forEach(key => {
                                room.getConnectionWithEasyrtcid(msg.msgData[key], (err, connObj) => {
                                    if (err) console.error(err);
                                    else if (connObj) {
                                        conns.push(connObj);
                                    }

                                    delete msg.msgData[key];

                                    if (Object.keys(msg.msgData).length === 0) {
                                        getBalancesForConnections(connectionObj, conns, (err, balances) => {
                                            if (err) next(err);
                                            else {
                                                let msgObj = {
                                                    msgType: 'balances',
                                                    msgData: {
                                                        balances: balances
                                                    }
                                                };

                                                easyrtc.util.sendSocketCallbackMsg(connectionObj.getEasyrtcid(), socketCallback, msgObj, connectionObj.getApp());
                                                next(null);
                                            }
                                        });
                                    }
                                });
                            });
                        }
                        else {
                            room.getConnectionObjects((err, conns) => {
                                if (err) {
                                    console.error(err, model_name);
                                    next(err);
                                }
                                else {
                                    //console.log('getConnections', err, Object.keys(conns));

                                    getBalancesForConnections(connectionObj, conns, (err, balances) => {
                                        if (err) next(err);
                                        else {
                                            let msgObj = {
                                                msgType: 'balances',
                                                msgData: {
                                                    balances: balances
                                                }
                                            };

                                            easyrtc.util.sendSocketCallbackMsg(connectionObj.getEasyrtcid(), socketCallback, msgObj, connectionObj.getApp());
                                            next(null);
                                        }
                                    });
                                }
                            });
                        }
                    }
                });
            }
            else next('Permission denied!');
            break;
        case 'easyrtc_streamReceived'://TODO: track webrtc connections on the server side (stream received by customer)
        default:
            if(CONFIG.DBG) console.log('MSG|'+msg.msgType+'|'+(msg.targetRoom||msg.targetEasyrtcid), connectionObj.getUsername(), msg.msgData);
            easyrtc.events.defaultListeners.easyrtcMsg(connectionObj, msg, socketCallback, next);
    }
}

function getBalancesForConnections (thisConn, conns, callback) {
    let model_id = thisConn.getFieldValueSync('credential')['model_id'];

    let userIds = [];
    let usersById = {};
    Object.keys(conns).forEach(key => {
        let user_id = conns[key].getFieldValueSync('credential')['user_id'];

        userIds.push(user_id);
        usersById[user_id] = {
            name: conns[key].getUsername(),
            easyrtcId: conns[key].getEasyrtcid(),
            connsKey: key
        };
    });

    getBalances(model_id, userIds)
        .then(
            data => {
                //console.log('balances for', model_name, data.balances);

                let balances = [];
                Object.keys(data.balances).forEach(key => {
                    let b = data.balances[key];

                    let u = usersById[ b.user_id ];
                    if (u) {
                        let k = u.connsKey;
                        delete u['connsKey'];

                        u.balance = parseFloat(b.balance);
                        balances.push(u);

                        let connObj = conns[k];
                        if (connObj) {
                            let curr_balance = parseFloat(connObj.getFieldValueSync('balance'));

                            if (curr_balance !== u.balance) {
                                connObj.setField('balance', u.balance, {isShared: true});
                                //TODO: server msg to user about connection field update?
                            }
                        }
                    }
                });

                callback(null, balances);
            },
            err => {
                let er = 'Failed to return balances. ' + (err.error ? err.error : '');
                console.error(err, er);
                callback(er);
            }
        );
}

webServer.listen(CONFIG.PORT, function () {
    console.log('xchat-server listening on https://localhost:'+CONFIG.PORT);
});
