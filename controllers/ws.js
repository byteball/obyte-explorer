/*jslint node: true */
'use strict';

var db = require('byteballcore/db.js');
var units = require('./units');
var address = require('./address');

function start(data) {
	var ws = this;

	if (data.type === 'last') {
		units.getLastUnits(function(nodes, edges) {
			ws.emit('start', {
				nodes: nodes,
				edges: edges
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
						not_found: true
					});
				});
			}
			else {
				units.getUnitsBeforeRowid(row[0].rowid + 25, 100, function(nodes, edges) {
					ws.emit('start', {
						nodes: nodes,
						edges: edges
					});
				});
			}
		});
	}
	else if (data.type === 'address') {
		address.getAddressInfo(data.address, function(objTransactions, unspent, objBalance, end) {
			if (objTransactions === null) {
				ws.emit('addressInfo');
			}
			else {
				ws.emit('addressInfo', {
					address: data.address,
					objTransactions: objTransactions,
					unspent: unspent,
					objBalance: objBalance,
					end: end
				});
			}
		});
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
						edges: edges
					});
				});
			}
		}
		else {
			ws.emit('info');
		}
	});
}

function nextPageTransactions(data) {
	var ws = this;

	address.getAddressTransactions(data.address, data.page, function(objTransactions) {
		ws.emit('nextPageTransactions', {
			address: data.address,
			objTransactions: objTransactions,
			end: objTransactions === null || Object.keys(objTransactions).length < 5
		});
	});
}

exports.start = start;
exports.next = next;
exports.prev = prev;
exports.newUnits = newUnits;
exports.info = info;
exports.highlightNode = highlightNode;
exports.nextPageTransactions = nextPageTransactions;