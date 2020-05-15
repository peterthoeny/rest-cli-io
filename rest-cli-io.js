// rest-cli-io.js: REST CLI I/O API to securely execute shell scripts and system commands
// Copyright: Peter Thoeny, https://github.com/peterthoeny/rest-cli-io
// License: MIT

// required modules
const express = require('express');
const { spawn } = require('child_process');
const bodyParser = require('body-parser');

// load rest-cli-io configuration - it defines the conf variable
try {
    require('/etc/rest-cli-io.conf');
} catch(error) {
    try {
        require('rest-cli-io.conf');
    } catch(error) {
        require(__dirname + '/rest-cli-io.conf');
    }
}

// globals
var version = 'rest-cli-io-2020-05-14';
var app = express();
var uriRe = new RegExp('^/api/1/cli/run/([a-zA-Z0-9][a-zA-Z0-9\\_\\-]*)(\\?.*)?$');
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
        data: '',
        error: 'Sorry, command listing is disabled'
    }
    if(conf.allowCmdList) {
        body = {
            data: Object.keys(conf.commands).sort(),
            error: ''
        }
    }
    sendResponse(req.url, body, res);
});

app.get('/api/1/cli/run/*', function (req, res) {
    if(!req.url.match(uriRe)) {
        var body = {
            data: usage,
            error: 'Unrecognized URI, or missing/unsupported command ID: ' + req.url
        }
        sendResponse(req.url, body, res);
        return;
    }
    var commandID = req.url.replace(uriRe, '$1');
    var commandConf = conf.commands[commandID];
    if(!commandConf) {
        var body = {
            data: '',
            error: 'Unrecognized command ID ' + commandID
        }
        sendResponse(req.url, body, res);
        return;
    }
    var args = [];
    commandConf.arguments.forEach(function(arg) {
        arg = arg.replace(/\%PARAM\{([^\}]*)\}\%/g, function(m, p1) {
            var param = p1.replace(/:.*$/, '');
            var split = p1.match(/:/) ? true : false;
            var val = req.query[param] || '';
            if(split) {
                val.split(/ +/).forEach(function(a) {
                    args.push(a);
                });
                return '';
            } else {
                return val;
            }
        });
        if(arg != '') {
            args.push(arg);
        }
    });
    var subprocess = spawn(commandConf.command, args, commandConf.options);
    var stderr = '';
    var stdout = '';
    subprocess.stdout.on('data', function(data) {
        stdout += data;
    });
    subprocess.stderr.on('data', function(data) {
        stderr += data;
    });
    subprocess.on('close', function(exitCode) {
        if(stderr) {
            var body = {
                error: 'Could not execute command with ID ' + commandID + ': ' + stderr
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
    log('/favicon.ico');
    res.sendFile(__dirname + '/public/favicon.ico');
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
