'use strict';

const minimist = require('minimist');

let argv = minimist(process.argv.slice(2), {
    default:               {
        API_URL:    'https://localhost/base/xchat-api',
        API_KEY:    'yyy',
        PORT:       8090
    }
});

module.exports = argv;