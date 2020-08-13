/*jslint node: true */
"use strict";
var fs = require('fs');
var desktopApp = require('ocore/desktop_app.js');
var appDataDir = desktopApp.getAppDataDir();
var path = require('path');

if (require.main === module && !fs.existsSync(appDataDir) && fs.existsSync(path.dirname(appDataDir)+'/byteball-explorer')){
	console.log('=== will rename old explorer data dir');
	fs.renameSync(path.dirname(appDataDir)+'/byteball-explorer', appDataDir);
}
require('./relay');
var conf = require('ocore/conf.js');
var eventBus = require('ocore/event_bus.js');
var network = require('ocore/network.js');
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var ws = require('./controllers/ws');
var i18nModule = require("i18n");

var arrLanguages = [];
for (var index in conf.languagesAvailable) {
	arrLanguages.push(conf.languagesAvailable[index].file);
}

i18nModule.configure({
	updateFiles: false,
	locales: arrLanguages,
	directory: __dirname + '/locales'
});
var i18n = {};
i18nModule.init(i18n);
i18nModule.setLocale(i18n, conf.languagesAvailable[conf.selectedLanguage].file);

app.engine('html', require('ejs').renderFile);
app.use(express.static(__dirname + '/public'));
app.set('views', __dirname + '/views'); // general config
app.set('view engine', 'html');

app.get('/', function(req, res) {
	res.render('index', {i18n: i18n});
});

eventBus.on('new_joint', function() {
	io.sockets.emit('update');
});

eventBus.on('rates_updated', function() {
	console.log('rates_updated: ', network.exchangeRates);
	io.sockets.emit('rates_updated', network.exchangeRates);
});

io.on('connection', function(socket) {
	socket.on('start', ws.start);
	socket.on('next', ws.next);
	socket.on('prev', ws.prev);
	socket.on('new', ws.newUnits);
	socket.on('info', ws.info);
	socket.on('highlightNode', ws.highlightNode);
	socket.on('nextPageTransactions', ws.nextPageTransactions);
});

server.listen(conf.webPort);
