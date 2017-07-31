'use strict';

const minimist = require('minimist');

let argv = minimist(process.argv.slice(2), {
    default:               {
        PORT:       8090,
        API_KEY:    'yyy'
    }
});

module.exports = argv;