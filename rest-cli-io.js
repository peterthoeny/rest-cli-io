// rest-cli-io.js: REST CLI I/O API to securely execute shell scripts and system commands
// Copyright: Peter Thoeny, https://github.com/peterthoeny/rest-cli-io
// License: MIT

// required modules
const express = require('express');
const { spawn } = require('child_process');
const bodyParser = require('body-parser');
const fs = require('fs')

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
var version = 'rest-cli-io-2020-05-19';
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
    if(contentType === 'application/json') {
        res.contentType('file.json');
        body = JSON.stringify(body, null, '    ');
    } else if(contentType != 'application/json' && typeof body === 'object') {
        res.set('Content-Type', contentType || 'application/json');
        body = JSON.stringify(body, null, '    ');
    } else if(contentType) {
        res.set('Content-Type', contentType);
    }
    log(url + ', ' + JSON.stringify(body).replace(/\\[nr]/g, ' ').replace(/\s+/g, ' ').replace(/^(.{100}).*(.{30})$/, '$1 ... $2'));
    res.send(body);
}

function expandOutputString(text, stdout, stderr, code) {
    return text
    .replace(/\%STDOUT\%/g, stdout)
    .replace(/\%STDERR\%/g, stderr)
    .replace(/\%CODE\%/g, code);
}

function expandOutputObject(obj, stdout, stderr, code) {
    //console.log('in:  '+JSON.stringify(obj)+', stdout: '+stdout+', stderr: '+stderr+', code: '+code);
    if(Array.isArray(obj)) {
        obj = obj.map(function(item) {
            return expandOutputObject(item, stdout, stderr, code);
        });
    } else if(typeof obj === 'object') {
        Object.keys(obj).forEach(function(key) {
            obj[key] = expandOutputObject(obj[key], stdout, stderr, code);
        });
    } else if(typeof obj === 'string') {
        obj = expandOutputString(obj, stdout, stderr, code);
    } // else keep as is
    //console.log('out: '+JSON.stringify(obj));
    return obj;
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
        sendResponse(req.url, body, res, req.query.contentType);
        return;
    }
    var commandID = req.url.replace(uriRe, '$1');
    var commandConf = conf.commands[commandID];
    if(!commandConf) {
        var body = {
            data: '',
            error: 'Unrecognized command ID ' + commandID
        }
        sendResponse(req.url, body, res, req.query.contentType);
        return;
    }
    commandConf = JSON.parse(JSON.stringify(commandConf));
    var command = commandConf.command.replace(/^\.\//, __dirname + '/');
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
    //console.log('args: '+JSON.stringify(args));
    var subprocess = spawn(command, args, commandConf.options);
    var stderr = '';
    var stdout = '';
    subprocess.stdout.on('data', function(data) {
        stdout += data;
    });
    subprocess.stderr.on('data', function(data) {
        stderr += data;
    });
    subprocess.on('close', function(exitCode) {
        var bodyFormat;
        var contentType = 'text/plain';
        if(commandConf.output) {
            if(commandConf.output.body) {
                bodyFormat = commandConf.output.body;
                if(typeof bodyFormat === 'object') {
                    contentType = 'application/json';
                }
            }
            if(stderr && commandConf.output.error) {
                bodyFormat = commandConf.output.error;
                if(typeof bodyFormat === 'object') {
                    contentType = 'application/json';
                }
            }
            if(commandConf.output.contentType) {
                contentType = commandConf.output.contentType;
            }
        }
        if(!bodyFormat) {
            if(stderr) {
                bodyFormat = 'Error: %STDERR%\nCode: %CODE%';
            } else {
                bodyFormat = '%STDOUT%';
            }
        }
        var body = expandOutputObject(bodyFormat, stdout, stderr, exitCode);
        if(req.query.contentType) {
            contentType = req.query.contentType;
        }
        /*
        if(body.match(/^\s*[\{\[][\s\S]*[\}\]]\s*$/)) {
            try {
                body = JSON.parse(body);
            } catch(e) {
                var body = {
                    data: body,
                    error: e.toString()
                }
                sendResponse(req.url, body, res);
                return;
            }
        }
        */
        sendResponse(req.url, body, res, contentType);
    });
});

app.post('/*', function (req, res) {
    var body = {
        data: usage,
        error: 'Unrecognized URI ' + req.url
    }
    sendResponse(req.url, body, res, req.query.contentType);
});

app.get('/*', function (req, res) {
    if(req.url.match(/^\/(index\.html)?(\?.*)?$/)) {
        var body = usage.join('\n');
        sendResponse(req.url, body, res, 'text/plain');
    } else {
        var filePath = __dirname + '/public' + req.url.replace(/\?.*$/, '');
        fs.access(filePath, fs.F_OK, function(err) {
            if (err) {
                var body = {
                    data: usage,
                    error:  'Unrecognized URI ' + req.url
                }
                sendResponse(req.url, body, res, req.query.contentType);
            } else {
                // regular file
                log(req.url);
                res.sendFile(filePath);
            }
        });
    }
});

app.listen(conf.port, function () {
    log('rest-cli-io app listening on port ' + conf.port);
});

// EOF
