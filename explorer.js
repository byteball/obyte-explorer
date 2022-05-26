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
const device = require('ocore/device');
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var ws = require('./controllers/ws');
const BalanceDumpService = require('./services/BalanceDumpService');
var i18nModule = require("i18n");
let exchange_rates = {};

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

if (conf.initial_peers) {
	const firstPeer = conf.initial_peers[0];
	const hubAddress = firstPeer.startsWith('wss://') ? firstPeer.substring(6) : firstPeer.substring(5);
	device.setDeviceHub(hubAddress);
	network.findOutboundPeerOrConnect(firstPeer, (err, ws) => {
		if (err)
			return console.log('failed to connect to initial peer ' + firstPeer + ': ' + err);
		ws.bLoggedIn = true;

		network.sendRequest(ws, 'hub/get_exchange_rates', null, null, (ws, err, result) => {
			exchange_rates = result;
		})
	});
}

eventBus.on('new_joint', function() {
	io.sockets.emit('update');
});

eventBus.on('rates_updated', function() {
	exchange_rates = { ...exchange_rates, ...network.exchangeRates };
	console.log('rates_updated: ', exchange_rates);
	io.sockets.emit('rates_updated', exchange_rates);
});

io.on('connection', function(socket) {
	io.sockets.emit('rates_updated', exchange_rates);
	socket.on('start', ws.start);
	socket.on('next', ws.next);
	socket.on('prev', ws.prev);
	socket.on('new', ws.newUnits);
	socket.on('info', ws.info);
	socket.on('highlightNode', ws.highlightNode);
	socket.on('nextPageTransactions', ws.nextPageTransactions);
	socket.on('nextPageAssetTransactions', ws.nextPageAssetTransactions);
	socket.on('nextPageAssetHolders', ws.nextPageAssetHolders);
	socket.on('getAssetsListByName', ws.getAssetsListByName);
});

server.listen(conf.webPort);

async function start() {
	const balanceDumpService = new BalanceDumpService();
	await balanceDumpService.start();
}
start();
