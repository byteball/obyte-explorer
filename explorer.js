/*jslint node: true */
"use strict";
const { existsSync, renameSync } = require('fs');
var desktopApp = require('ocore/desktop_app.js');
var appDataDir = desktopApp.getAppDataDir();
var path = require('path');

if (require.main === module && !existsSync(appDataDir) && existsSync(path.dirname(appDataDir)+'/byteball-explorer')){
	console.log('=== will rename old explorer data dir');
	renameSync(path.dirname(appDataDir)+'/byteball-explorer', appDataDir);
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
const randomString = require('./utils/randomString');

const app = express();
const httpServer = createServer(app);


const api = require('./gateways/api');
const BalanceDumpService = require('./services/BalanceDumpService');

const io = new Server(httpServer, {
	cors: {
		origin: "*"
	}
});

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

const activeRequests = new Map();
app.use((req, res, next) => {
	const id = randomString();
	const start = Date.now();

	activeRequests.set(id, { start, url: req.url, method: req.method, params: req.query });

	console.log(`[start:${id}] ${req.url}`);

	let cleaned = false;
	function cleanup() {
		if (cleaned) return;
		cleaned = true;
		const end = Date.now() - start;
		const isLong = end > 1000;
		console.log(`[end:${id}] ${req.url} ${res.statusCode} ${end}ms${isLong ? ' (long)' : ''}`);

		activeRequests.delete(id);
	}

	res.once('finish', cleanup);
	res.once('close', cleanup);

	next();
});

app.use(cors());

function sendJsonResult(res, result) {
	if (result && result.statusCode) {
		res.status(result.statusCode);
	}
	res.json(result);
}

function sendRouteError(res, err) {
	console.error('route error', err);
	res.status(500).json({ error: 'internal_error', message: 'Internal error' });
}

function asyncRoute(handler) {
	return (req, res) => {
		Promise.resolve(handler(req, res)).catch(err => sendRouteError(res, err));
	};
}

function registerSocketHandler(socket, eventName, handler) {
	socket.on(eventName, async (...args) => {
		const cb = args[args.length - 1];
		if (typeof cb !== 'function') {
			return;
		}

		try {
			await handler(...args);
		} catch (err) {
			console.error('socket handler error', eventName, err);
			cb({ error: 'internal_error', message: 'Internal error' });
		}
	});
}

app.get('/api/unit/:unit', asyncRoute(async(req, res) => {
	if (req.params.unit.length !== 44) {
		return res.json({ notFound: true });
	}

	await api.dagGateway.info(req.params.unit, result => {
		sendJsonResult(res, result);
	});
}));

app.get('/api/address/:address/info', asyncRoute(async (req, res) => {
	if (req.params.address.length !== 32) {
		return res.json({ notFound: true });
	}

	const params = {
		address: req.params.address,
		...req.query,
	}

	await api.addressGateway.getAddressData(params, result => {
		sendJsonResult(res, result);
	});
}));

app.get('/api/address/:address/next_page', asyncRoute(async (req, res) => {
	if (req.params.address.length !== 32) {
		return res.json({ notFound: true });
	}

	const params = {
		address: req.params.address,
		...req.query
	}

	await api.addressGateway.loadNextPageAddressTransactions(params, result => {
		sendJsonResult(res, result);
	});
}));

app.get('/api/asset/:asset/info', asyncRoute(async (req, res) => {
	const params = {
		asset: req.params.asset,
	}

	await api.assetGateway.getAssetData(params, result => {
		sendJsonResult(res, result);
	});
}));

app.get('/api/asset/:asset/next_page_transactions', asyncRoute(async (req, res) => {
	const params = {
		asset: req.params.asset,
		...req.query,
	}

	await api.assetGateway.loadNextPageAssetTransactions(params, result => {
		sendJsonResult(res, result);
	});
}));

app.get('/api/asset/:asset/next_page_holders', asyncRoute(async (req, res) => {
	const params = {
		asset: req.params.asset,
		...req.query,
	}

	await api.assetGateway.loadNextPageAssetHolders(params, result => {
		sendJsonResult(res, result);
	});
}));


io.on('connection', async (socket) => {
	socket.emit('rates_updated', exchange_rates);

	registerSocketHandler(socket, 'info', api.dagGateway.info);
	registerSocketHandler(socket, 'newUnits', api.dagGateway.newUnits);
	registerSocketHandler(socket, 'nextUnits', api.dagGateway.nextUnits);
	registerSocketHandler(socket, 'prevUnits', api.dagGateway.prevUnits);
	registerSocketHandler(socket, 'getUnit', api.dagGateway.getUnit);
	registerSocketHandler(socket, 'getLastUnits', api.dagGateway.getLastUnits);
	registerSocketHandler(socket, 'highlightNode', api.dagGateway.highlightNode);

	registerSocketHandler(socket, 'getAddressData', api.addressGateway.getAddressData);
	registerSocketHandler(socket, 'loadNextPageAddressTransactions', api.addressGateway.loadNextPageAddressTransactions);

	registerSocketHandler(socket, 'getAssetData', api.assetGateway.getAssetData);
	registerSocketHandler(socket, 'loadNextPageAssetTransactions', api.assetGateway.loadNextPageAssetTransactions);
	registerSocketHandler(socket, 'loadNextPageAssetHolders', api.assetGateway.loadNextPageAssetHolders);
	registerSocketHandler(socket, 'fetchAssetNamesList', api.assetGateway.fetchAssetNamesList);
	try {
		await api.assetGateway.fetchAssetNamesList(({ assetNames }) => {
			socket.emit('updateAssetsList', assetNames);
		})
	} catch (err) {
		console.error('failed to fetch asset names list', err);
	}
});

httpServer.listen(conf.webPort);

async function start() {
	const balanceDumpService = new BalanceDumpService();
	await balanceDumpService.start();
}
start();

process.on('uncaughtException', (err) => {
	console.error('uncaughtException', err);
	console.error('activeRequests', activeRequests);
	process.exit(1);
});

process.on('unhandledRejection', (reason) => {
	console.error('unhandledRejection', reason);
	console.error('activeRequests', activeRequests);
	process.exit(1);
});
