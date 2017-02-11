/*jslint node: true */
'use strict';

var db = require('byteballcore/db.js');
var moment = require('moment');


function getAmountForInfoAddress(objTransactions, cb) {
	var arrTransactionsUnit = [], key;
	for (key in objTransactions) {
		if (arrTransactionsUnit.indexOf(objTransactions[key].unit) == -1) arrTransactionsUnit.push(objTransactions[key].unit);
	}
	db.query("SELECT inputs.unit, outputs.address, outputs.amount, outputs.asset FROM inputs, outputs \n\
		WHERE inputs.unit IN (?) AND outputs.unit = inputs.src_unit AND outputs.message_index = inputs.src_message_index AND outputs.output_index = inputs.src_output_index",
		[arrTransactionsUnit], function(rowsAmount) {
			db.query("SELECT unit, asset, serial_number, amount, address  FROM inputs WHERE unit IN (?) AND type='issue'", [arrTransactionsUnit], function(rowsIssue) {
				rowsAmount.forEach(function(row) {
					key = row.unit + '_' + row.asset;
					if (objTransactions[key]) objTransactions[key].from.push({
						address: row.address,
						amount: row.amount
					});
				});
				rowsIssue.forEach(function(row) {
					key = row.unit + '_' + row.asset;
					if (objTransactions[key]) objTransactions[key].from.push({
						issue: true,
						amount: row.amount,
						serial_number: row.serial_number,
						address: row.address
					});
				});
				cb(objTransactions);
			})
		});
}

function getSpentOutputs(objTransactions, cb) {
	var arrTransactionsUnit = [], key, key2;
	for (key in objTransactions) {
		if (arrTransactionsUnit.indexOf(objTransactions[key].unit) == -1) arrTransactionsUnit.push(objTransactions[key].unit);
	}
	var n = 0, l = arrTransactionsUnit.length - 1;

	function setSpentOutputs() {
		db.query("SELECT outputs.output_id, outputs.message_index, outputs.output_index, outputs.asset, inputs.unit \n \
		FROM outputs, inputs WHERE outputs.unit = ? AND is_spent = 1 AND inputs.src_unit = outputs.unit \n\
		AND inputs.src_message_index = outputs.message_index AND inputs.src_output_index = outputs.output_index",
			[arrTransactionsUnit[n]], function(rows) {
				rows.forEach(function(row) {
					key = arrTransactionsUnit[n] + '_' + row.asset;
					key2 = row.output_id + '_' + row.message_index + '_' + row.output_index;
					if (objTransactions[key] && objTransactions[key].to[key2]) {
						objTransactions[key].to[key2].spent = row.unit;
					}
				});
				if (n < l) {
					n++;
					setSpentOutputs();
				}
				else {
					cb(objTransactions);
				}
			});
	}

	setSpentOutputs();
}

function getUnitsForTransactionsAddress(address, page, cb) {
	db.query("SELECT inputs.unit \n\
		FROM inputs, outputs, units \n\
		WHERE (( inputs.unit IN ( SELECT unit FROM inputs WHERE address = ? GROUP BY inputs.unit )) \n\
		OR ( outputs.unit IN ( SELECT unit FROM outputs WHERE address = ? GROUP BY outputs.unit ))) \n\
		AND inputs.unit = outputs.unit AND (( inputs.asset IS NULL AND outputs.asset IS NULL ) OR (inputs.asset = outputs.asset)) \n\
		AND units.unit = inputs.unit \n\
		GROUP BY inputs.unit \n\
		ORDER BY units.main_chain_index DESC LIMIT ?, 5", [address, address, page * 5], function(rows) {
		var arrUnit = [];
		rows.forEach(function(row) {
			arrUnit.push(row.unit);
		});
		cb(arrUnit);
	});
}

function getAddressTransactions(address, page, cb) {
	getUnitsForTransactionsAddress(address, page, function(arrUnit) {
		if (arrUnit.length) {
			db.query("SELECT inputs.unit, units.creation_date, inputs.address, outputs.address AS addressTo, outputs.amount, inputs.asset, outputs.asset AS assetTo, outputs.output_id, outputs.message_index, outputs.output_index \n\
		FROM inputs, outputs, units \n\
		WHERE (( inputs.unit IN (?) AND outputs.unit = inputs.unit ) OR ( outputs.unit IN (?) AND inputs.unit = outputs.unit )) \n\
		AND (( inputs.asset IS NULL AND outputs.asset IS NULL ) OR (inputs.asset = outputs.asset)) \n\
		AND units.unit = inputs.unit \n\
		ORDER BY units.main_chain_index DESC",
				[arrUnit, arrUnit], function(rowsTransactions) {
					var key, del, objTransactions = {};
					if (rowsTransactions.length) {
						rowsTransactions.forEach(function(row) {
							key = row.unit + '_' + row.asset;
							if (!objTransactions[key]) objTransactions[key] = {
								unit: row.unit,
								date: moment(row.creation_date).format(),
								from: [],
								to: {},
								spent: false,
								asset: row.asset,
								output_id: row.output_id
							};
							if (objTransactions[key].from.indexOf(row.address) == -1) objTransactions[key].from.push(row.address);
							if (!objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index]) {
								objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index] = {
									address: row.addressTo,
									amount: row.amount,
									spent: 0
								};
							}
						});

						for (var k in objTransactions) {
							del = true;

							if (del && objTransactions[k].from.indexOf(address) != -1) {
								objTransactions[k].spent = true;
								del = false;
							}
							else {
								for (key in objTransactions[k].to) {
									if (objTransactions[k].to[key].address == address) {
										del = false;
										break;
									}
								}
							}
							if (del) {
								delete objTransactions[k];
							}
							else {
								objTransactions[k].from = [];
							}
						}

						getAmountForInfoAddress(objTransactions, function(objTransactions) {
							getSpentOutputs(objTransactions, function(objTransactions) {
								cb(objTransactions);
							});
						});
					}
					else {
						cb(null);
					}
				}
			);
		}
		else {
			cb(null);
		}
	});
}

function getAddressInfo(address, cb) {
	getAddressTransactions(address, 0, function(objTransactions) {
		db.query("SELECT * FROM outputs WHERE address=? and is_spent=0 ORDER BY output_id DESC", [address], function(rowsOutputs) {
			if (objTransactions !== null || rowsOutputs.length) {
				var objBalance = {bytes: 0}, unspent = [];
				rowsOutputs.forEach(function(row) {
					unspent.push(row);
					if (row.asset === null) {
						objBalance.bytes += row.amount;
					}
					else {
						if (!objBalance[row.asset]) objBalance[row.asset] = 0;
						objBalance[row.asset] += row.amount;
					}
				});

				cb(objTransactions, unspent, objBalance, Object.keys(objTransactions).length < 5);
			}
			else {
				cb(null);
			}
		});
	});
}


exports.getAddressInfo = getAddressInfo;
exports.getAddressTransactions = getAddressTransactions;