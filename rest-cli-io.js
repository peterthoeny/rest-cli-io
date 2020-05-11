/* rest-cli-io: REST Command Line Interface I/O web-app to securely execute shell scripts and system commands
 */

// modules
const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const bodyParser = require('body-parser');

// load rest-cli-io configuration - it defines the conf variable
try {
    require('/etc/rest-cli-io.conf');
} catch(error) {
    require('./rest-cli-io.conf');
}

// globals
var version = 'rest-cli-io-2020-05-11';
var app = express();
var pathRe = new RegExp('^/api/1/cli/run/([a-zA-Z0-9\\_\\-]+)(\\?.*)?$');
var usage = [
    'REST CLI I/O usage:',
    '- Execute command:  GET /api/1/cli/run/<commandID>?<param>=<value>',
    '  - <commandID>: Registered command ID',
    '  - return if ok:    { "data": "....", "error": "" }',
    '  - return if error: { "error": "Command <commandID> not found" }',
    '  - optionally add return content-type, such as:',
    '    GET /api/1/cli/echo?text=hello+world&contentType=text/plain',
    '- Query command IDs:  GET /api/1/cli/list',
    '  - return: { "data": "<id1>[, <id2>]", "error": "" }',
    '  - Currently registered command IDs:',
    '    ' + Object.keys(conf.commands).sort().join(', '),
    '- Version: ' + version
];
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit:50000 }));
app.use(express.static(__dirname + '/public'));

function log(msg) {
    var now = new Date();
    var prefix = '- '
        + now.getFullYear() + '-'
        + (now.getMonth() + 1).toString().replace(/^(.)$/, '0$1') + '-'
        + now.getDate().toString().replace(/^(.)$/, '0$1') + '-'
        + now.getHours().toString().replace(/^(.)$/, '0$1') + '-'
        + now.getMinutes().toString().replace(/^(.)$/, '0$1') + ': ';
    console.log(prefix + msg.replace(/\n/g, '\n  '));
}

function sendResponse(url, body, res, contentType) {
    if(contentType) {
        res.set('Content-Type', contentType);
    } else {
        res.contentType('file.json');
        body = JSON.stringify(body, null, '    ');
    }
    log(url + ', ' + JSON.stringify(body.replace(/[\n\r]+/g, ' ').replace(/^(.{100}).*(.{30})$/, '$1 ... $2')));
    res.send(body);
}

app.get('/api/1/cli/list*', function (req, res) {
    var body = {
        data: Object.keys(conf.commands).sort(),
        error: ''
    }
    sendResponse(req.url, body, res);
});

app.get('/api/1/cli/run/*', function (req, res) {
    if(!req.url.match(pathRe)) {
        var body = {
            data: usage,
            error: 'Unrecognized URI, or missing/unsupported command ID: ' + req.url
        }
        sendResponse(req.url, body, res);
        return;
    }
    var commandID = req.url.replace(pathRe, '$1');
    var commandDef = conf.commands[commandID];
    if(!commandDef) {
        var body = {
            data: '',
            error: 'Unrecognized command ID ' + commandID
        }
        sendResponse(req.url, body, res);
        return;
    }
    var cmd = commandDef.execute.replace(/\%PARAM\{([^\}]*)\}\%/g, function(m, p1) {
        var val = req.query[p1] || '';
        return val;
    });
    exec(cmd, function(err, stdout, stderr) {
        if(err) {
            var body = {
                error: 'Could not execute command with ID ' + commandID + ': ' + err
            }
            sendResponse(req.url, body, res);
        } else {
            if(req.query.contentType) {
                sendResponse(req.url, stdout, res, req.query.contentType);
            } else {
                if(stdout.match(/^\s*[\{\[][\s\S]*[\}\]]\s*$/)) {
                    try {
                        stdout = JSON.parse(stdout);
                    } catch(e) {
                        var body = {
                            data: stdout,
                            error: e.toString()
                        }
                        sendResponse(req.url, body, res);
                        return;
                    }
                }
                var body = {
                    data:   stdout,
                    error:  ''
                }
                sendResponse(req.url, body, res);
            }
        }
    });
});

app.get('/favicon.ico', function (req, res) {
    res.sendFile('favicon.ico');
});

app.post('/*', function (req, res) {
    var body = {
        data: usage,
        error: 'Unrecognized URI ' + req.url
    }
    sendResponse(req.url, body, res);
});

app.get('/*', function (req, res) {
    if(req.url === '/') {
        var body = usage.join('\n');
        sendResponse(req.url, body, res, 'text/plain');
    } else {
        var body = {
            data: usage,
            error:  'Unrecognized URI ' + req.url
        }
        sendResponse(req.url, body, res);
    }
});

app.listen(conf.port, function () {
    log('rest-cli-io app listening on port ' + conf.port);
});

// EOF
