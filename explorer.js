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
const express = require("express");
const cors = require('cors')
const { createServer } = require("http");
const { Server } = require("socket.io");
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
	cors: {
		origin: "*"
	}
});

const api = require('./gateways/api');
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

app.use(cors());

app.get('/api/unit/:unit', async(req, res) => {
	if (req.params.unit.length !== 44) {
		return res.json({ notFound: true });
	}
	
	await api.dagGateway.info(req.params.unit, result => {
		res.json(result);
	});
});

app.get('/api/address/:address/info', async (req, res) => {
	if (req.params.address.length !== 32) {
		return res.json({ notFound: true });
	}
	
	const params = {
		address: req.params.address,
		...req.query,
	}
	
	await api.addressGateway.getAddressData(params, result => {
		res.json(result);
	});
});

app.get('/api/address/:address/next_page', async (req, res) => {
	if (req.params.address.length !== 32) {
		return res.json({ notFound: true });
	}
	
	const params = {
		address: req.params.address,
		...req.query
	}
	
	await api.addressGateway.loadNextPageAddressTransactions(params, result => {
		res.json(result);
	});
});

app.get('/api/asset/:asset/info', async (req, res) => {
	const params = {
		asset: req.params.asset,
	}
	
	await api.assetGateway.getAssetData(params, result => {
		res.json(result);
	});
});

app.get('/api/asset/:asset/next_page_transactions', async (req, res) => {
	const params = {
		asset: req.params.asset,
		...req.query,
	}
	
	await api.assetGateway.loadNextPageAssetTransactions(params, result => {
		res.json(result);
	});
});

app.get('/api/asset/:asset/next_page_holders', async (req, res) => {
	const params = {
		asset: req.params.asset,
		...req.query,
	}
	
	await api.assetGateway.loadNextPageAssetHolders(params, result => {
		res.json(result);
	});
});

io.on('connection', async (socket) => {
	socket.emit('rates_updated', exchange_rates);
	
	socket.on('info', api.dagGateway.info);
	socket.on('newUnits', api.dagGateway.newUnits);
	socket.on('nextUnits', api.dagGateway.nextUnits);
	socket.on('prevUnits', api.dagGateway.prevUnits);
	socket.on('getUnit', api.dagGateway.getUnit);
	socket.on('getLastUnits', api.dagGateway.getLastUnits);
	socket.on('highlightNode', api.dagGateway.highlightNode);
	
	socket.on('getAddressData', api.addressGateway.getAddressData);
	socket.on('loadNextPageAddressTransactions', api.addressGateway.loadNextPageAddressTransactions);
	
	socket.on('getAssetData', api.assetGateway.getAssetData);
	socket.on('loadNextPageAssetTransactions', api.assetGateway.loadNextPageAssetTransactions);
	socket.on('loadNextPageAssetHolders', api.assetGateway.loadNextPageAssetHolders);
	socket.on('fetchAssetNamesList', api.assetGateway.fetchAssetNamesList);
	await api.assetGateway.fetchAssetNamesList(({ assetNames }) => {
		socket.emit('updateAssetsList', assetNames);
	})
});

httpServer.listen(conf.webPort);

async function start() {
	const balanceDumpService = new BalanceDumpService();
	await balanceDumpService.start();
}
start();
