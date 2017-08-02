'use strict';

const minimist = require('minimist');

let argv = minimist(process.argv.slice(2), {
    default:               {
        API_URL:    'https://x-token.com/base/xchat-api',
        API_KEY:    'yyy',
        PORT:       8090
    }
});

module.exports = argv;