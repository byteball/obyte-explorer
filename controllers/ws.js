/*jslint node: true */
'use strict';

var db = require('ocore/db.js');
var units = require('./units');
var address = require('./address');
const getAssetUnit = require('../api/getAssetUnit');

async function start(data) {
	var ws = this;

	if (data.type === 'last') {
		units.getLastUnits(function(nodes, edges) {
			ws.emit('start', {
				nodes: nodes,
				edges: edges,
				testnet: !!process.env.testnet
			});
		});
	}
	else if (data.type === 'unit') {
		db.query("SELECT ROWID FROM units WHERE unit = ? LIMIT 0,1", [data.unit], function(row) {
			if (!row.length) {
				units.getLastUnits(function(nodes, edges) {
					ws.emit('start', {
						nodes: nodes,
						edges: edges,
						not_found: true,
						testnet: !!process.env.testnet
					});
				});
			}
			else {
				units.getUnitsBeforeRowid(row[0].rowid + 25, 100, function(nodes, edges) {
					ws.emit('start', {
						nodes: nodes,
						edges: edges,
						testnet: !!process.env.testnet
					});
				});
			}
		});
	}
	else if (data.type === 'address') {
		const {
			objTransactions,
			unspent,
			objBalances,
			end,
			definition,
			newLastInputsROWID, 
			newLastOutputsROWID,
			storage_size,
			objStateVars,
			arrAaResponses,
			arrAasFromTemplate,
			unitAssets,
		} = await address.getAddressInfo(data.address, data.filter || {});
		
		if (!objTransactions && !definition)
			return ws.emit('addressInfo');
		
		ws.emit('addressInfo', {
			address: data.address,
			objTransactions: objTransactions,
			unspent: unspent,
			objBalances: objBalances,
			end: end,
			definition: definition,
			newLastInputsROWID,
			newLastOutputsROWID,
			storage_size: storage_size,
			objStateVars: objStateVars,
			arrAaResponses: arrAaResponses,
			arrAasFromTemplate: arrAasFromTemplate,
			unitAssets,
			testnet: !!process.env.testnet
		});
	}
	else if (data.type === 'asset') {
		const assetData = await address.getAssetData(data.asset);
		assetData.testnet = !!process.env.testnet;

		ws.emit('assetInfo', assetData);
	}	
}

function next(data) {
	var ws = this;

	units.getUnitsThatBecameStable(data.notStable, function(arrStableUnits) {
		units.getUnitsBeforeRowid(data.last, 100, function(nodes, edges) {
			ws.emit('next', {
				nodes: nodes,
				edges: edges,
				arrStableUnits: arrStableUnits
			});
		});
	});
}

function prev(data) {
	var ws = this;

	units.getUnitsThatBecameStable(data.notStable, function(arrStableUnits) {
		units.getUnitsAfterRowid(data.first, 100, function(nodes, edges) {
			ws.emit('prev', {
				nodes: nodes,
				edges: edges,
				end: nodes.length < 100,
				arrStableUnits: arrStableUnits
			});
		});
	});
}

function newUnits(data) {
	var ws = this;

	units.getUnitsThatBecameStable(data.notStable, function(arrStableUnits) {
		units.getUnitsAfterRowid(data.unit, 100, function(nodes, edges) {
			ws.emit('new', {
				nodes: nodes,
				edges: edges,
				arrStableUnits: arrStableUnits
			});
		});
	});
}


function info(data) {
	var ws = this;

	units.getInfoOnUnit(data.unit, function(objInfo) {
		if (objInfo) {
			ws.emit('info', objInfo);
		} else {
			ws.emit('deleted', data.unit);
		}
	});
}

function highlightNode(data) {
	var ws = this;

	db.query("SELECT ROWID FROM units WHERE unit = ? LIMIT 0,1", [data.unit], function(row) {
		if (row.length) {
			var rowid = row[0].rowid;
			if (rowid > data.first && rowid < data.first + 200) {
				units.getUnitsAfterRowid(data.first, 200, function(nodes, edges) {
					ws.emit('prev', {
						nodes: nodes,
						edges: edges,
						end: nodes.length < 100
					});
				});
			}
			else if (rowid < data.last && rowid > data.last - 200) {
				units.getUnitsBeforeRowid(data.last, 200, function(nodes, edges) {
					ws.emit('next', {
						nodes: nodes,
						edges: edges
					});
				});
			}
			else {
				units.getUnitsBeforeRowid(rowid + 25, 100, function(nodes, edges) {
					ws.emit('start', {
						nodes: nodes,
						edges: edges,
						testnet: !!process.env.testnet
					});
				});
			}
		}
		else {
			ws.emit('info');
		}
	});
}

async function nextPageTransactions(data) {
	var ws = this;
	const {
		objTransactions,
		newLastInputsROWID, 
		newLastOutputsROWID, 
		unitAssets,
	} = await address.getAddressTransactions(data.address, data.lastInputsROWID, data.lastOutputsROWID, data.filter || {});
	
	ws.emit('nextPageTransactions', {
		address: data.address,
		objTransactions: objTransactions,
		end: objTransactions === null || Object.keys(objTransactions).length < 5,
		newLastInputsROWID,
		newLastOutputsROWID,
		unitAssets,
	});
}

async function nextPageAssetTransactions(data) {
	var ws = this;

	const assetUnit = await getAssetUnit(data.asset) || data.asset;
	const transactionsData = await address.getAssetTransactions(assetUnit, data.lastInputsROWID, data.lastOutputsROWID);
	
	ws.emit('nextPageTransactions', {
		transactionsData,
		end: transactionsData.objTransactions === null || Object.keys(transactionsData.objTransactions).length < 5,
	});
}

exports.start = start;
exports.next = next;
exports.prev = prev;
exports.newUnits = newUnits;
exports.info = info;
exports.highlightNode = highlightNode;
exports.nextPageTransactions = nextPageTransactions;
exports.nextPageAssetTransactions = nextPageAssetTransactions;