'use strict';

const minimist = require('minimist');

let argv = minimist(process.argv.slice(2), {
    default:               {
        API_URL:    'https://x-token.com/base/xchat-api',
        API_KEY:    'xxx',
        PORT:       8090,
        DBG:        false
    }
});

module.exports = argv;