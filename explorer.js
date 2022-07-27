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
const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
	cors: {
		origin: "*"
	}
});

const ws = require('./gateways/ws');
const BalanceDumpService = require('./services/BalanceDumpService');
let exchange_rates = {};


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

io.on('connection', async (socket) => {
	socket.emit('rates_updated', exchange_rates);
	
	socket.on('info', ws.dagGateway.info);
	socket.on('newUnits', ws.dagGateway.newUnits);
	socket.on('nextUnits', ws.dagGateway.nextUnits);
	socket.on('prevUnits', ws.dagGateway.prevUnits);
	socket.on('getUnit', ws.dagGateway.getUnit);
	socket.on('getLastUnits', ws.dagGateway.getLastUnits);
	socket.on('highlightNode', ws.dagGateway.highlightNode);
	
	socket.on('getAddressData', ws.addressGateway.getAddressData);
	socket.on('loadNextPageAddressTransactions', ws.addressGateway.loadNextPageAddressTransactions);
	
	socket.on('getAssetData', ws.assetGateway.getAssetData);
	socket.on('loadNextPageAssetTransactions', ws.assetGateway.loadNextPageAssetTransactions);
	socket.on('loadNextPageAssetHolders', ws.assetGateway.loadNextPageAssetHolders);
	socket.on('fetchAssetNamesList', ws.assetGateway.fetchAssetNamesList);
	
	await ws.assetGateway.fetchAssetNamesList(({ assetNames }) => {
		socket.emit('updateAssetsList', assetNames);
	})
});

httpServer.listen(conf.webPort);

async function start() {
	const balanceDumpService = new BalanceDumpService();
	await balanceDumpService.start();
}
start();
