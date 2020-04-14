/*jslint node: true */
'use strict';

var db = require('ocore/db.js');
var constants = require('ocore/constants.js');
var moment = require('moment');
var async = require('async');
var BIGINT = 9223372036854775807;
var storage = require('ocore/storage.js');
var conf = require('ocore/conf.js');

function getAmountForInfoAddress(objTransactions, cb) {
	var arrTransactionsUnits = [], key;
	for (key in objTransactions) {
		if (arrTransactionsUnits.indexOf(objTransactions[key].unit) == -1) arrTransactionsUnits.push(objTransactions[key].unit);
	}
	db.query("SELECT inputs.unit, outputs.address, outputs.amount, outputs.asset FROM inputs, outputs \n\
		WHERE inputs.unit IN (?) AND outputs.unit = inputs.src_unit AND outputs.message_index = inputs.src_message_index AND outputs.output_index = inputs.src_output_index",
		[arrTransactionsUnits], function(rowsAmount) {
			db.query("SELECT unit, asset, type, serial_number, from_main_chain_index, to_main_chain_index, amount, address \n\
				FROM inputs WHERE unit IN (?) AND (type='issue' OR type='headers_commission' OR type='witnessing')", [arrTransactionsUnits], function(rows) {
				rowsAmount.forEach(function(row) {
					key = row.unit + '_' + row.asset;
					if (objTransactions[key]) objTransactions[key].from.push({
						address: row.address,
						amount: row.amount
					});
				});
				async.each(rows, function(row, callback) {
					if (row.type === 'issue') {
						key = row.unit + '_' + row.asset;
						if (objTransactions[key]) objTransactions[key].from.push({
							issue: true,
							amount: row.amount,
							serial_number: row.serial_number,
							address: row.address
						});
						callback();
					} else {
						var tableName, commissionType;
						if (row.type === 'headers_commission') {
							tableName = 'headers_commission_outputs';
							commissionType = 'headers';
						} else if (row.type === 'witnessing') {
							tableName = 'witnessing_outputs';
							commissionType = 'witnessing';
						}
						if (tableName) {
							db.query("SELECT SUM(amount) AS sum FROM " + tableName + " WHERE address = ? AND main_chain_index >= ? AND main_chain_index <= ? ORDER BY main_chain_index",
								[row.address, row.from_main_chain_index, row.to_main_chain_index],
								function(rowsCommissionOutputs) {
									key = row.unit + '_' + row.asset;
									if (objTransactions[key]) objTransactions[key].from.push({
										commissionType: commissionType,
										address: row.address,
										from_mci: row.from_main_chain_index,
										to_mci: row.to_main_chain_index,
										sum: rowsCommissionOutputs[0].sum
									});
									callback();
								});
						} else {
							callback();
						}
					}
				}, function() {
					cb(objTransactions);
				});
			})
		});
}

function getSpentOutputs(objTransactions, cb) {
	var arrTransactionsUnits = [], key, key2;
	for (key in objTransactions) {
		if (arrTransactionsUnits.indexOf(objTransactions[key].unit) == -1) arrTransactionsUnits.push(objTransactions[key].unit);
	}
	var n = 0, l = arrTransactionsUnits.length - 1;

	function setSpentOutputs() {
		db.query("SELECT outputs.output_id, outputs.message_index, outputs.output_index, outputs.asset, inputs.unit \n \
		FROM outputs, inputs WHERE outputs.unit = ? AND is_spent = 1 AND inputs.src_unit = outputs.unit \n\
		AND inputs.src_message_index = outputs.message_index AND inputs.src_output_index = outputs.output_index",
			[arrTransactionsUnits[n]], function(rows) {
				rows.forEach(function(row) {
					key = arrTransactionsUnits[n] + '_' + row.asset;
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

function getUnitsForTransactionsAddress(address, lastInputsROWID, lastOutputsROWID, filter, cb) {
	var strFilterAsset = filter.asset;

	var arrQuerySql = [
		"SELECT inputs.unit, MIN(inputs.ROWID) AS inputsROWID, MIN(outputs.ROWID) AS outputsROWID",
		"FROM inputs, outputs, units",
		"WHERE (( units.unit IN (SELECT DISTINCT unit FROM inputs WHERE address = ? AND ROWID < ? " + getStrSqlFilterAssetForSingleTypeOfTransactions(strFilterAsset) + " ORDER BY ROWID DESC LIMIT 0, 5))",
		"OR ( units.unit IN (SELECT DISTINCT unit FROM outputs WHERE address = ? AND ROWID < ? AND (is_spent=1 OR is_spent=0) " + getStrSqlFilterAssetForSingleTypeOfTransactions(strFilterAsset) + " ORDER BY ROWID DESC LIMIT 0, 5)))",
		"AND inputs.unit = outputs.unit",
		getStrSqlFilterAssetForTransactions(strFilterAsset),
		"AND units.unit = inputs.unit",
		"GROUP BY inputs.unit",
		"ORDER BY units.ROWID DESC LIMIT 0, 5"
	];

	db.query(
		arrQuerySql.join(" \n"),
		[address, lastInputsROWID, address, lastOutputsROWID],
		function (rows) {
			var lastRow = rows[rows.length - 1] || {};
			cb(
				rows.map(function (row) {
					return row.unit;
				}),
				lastRow.inputsROWID,
				lastRow.outputsROWID
			);
		}
	);
}

function getAddressTransactions(address, lastInputsROWID, lastOutputsROWID, filter, cb) {
	getUnitsForTransactionsAddress(address, lastInputsROWID, lastOutputsROWID, filter, function(arrUnits, newLastInputsROWID, newLastOutputsROWID) {
		if (arrUnits.length) {
			var strFilterAsset = filter.asset;

			var arrQuerySql = [
				"SELECT inputs.unit, units.creation_date, inputs.address, outputs.address AS addressTo, outputs.amount, inputs.asset, outputs.asset AS assetTo, outputs.output_id, outputs.message_index, outputs.output_index, inputs.type,\n\
				CASE timestamp \n\
					WHEN 0 THEN "+ db.getUnixTimestamp("units.creation_date")+" ELSE timestamp \n\
				END timestamp \n\
				FROM inputs, outputs, units",
				"WHERE units.unit IN (?) AND outputs.unit = inputs.unit",
				getStrSqlFilterAssetForTransactions(strFilterAsset),
				"AND units.unit = inputs.unit",
				"ORDER BY units.main_chain_index DESC,units.ROWID DESC"
			];

			db.query(
				arrQuerySql.join(" \n"),
				[arrUnits],
				function (rowsTransactions) {
					var key, objTransactions = {};
					if (rowsTransactions.length) {
						rowsTransactions.forEach(function(row) {
							key = row.unit + '_' + row.asset;
							if (!objTransactions[key]) objTransactions[key] = {
								unit: row.unit,
								timestamp: row.timestamp,
								from: [],
								to: {},
								spent: false,
								asset: row.asset,
								output_id: row.output_id
							};
							if (objTransactions[key].from.indexOf(row.address) === -1) objTransactions[key].from.push(row.address);
							if (!objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index]) {
								objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index] = {
									address: row.addressTo,
									amount: row.amount,
									spent: 0
								};
							}
						});

						for (var key in objTransactions) {
							if (objTransactions[key].from.indexOf(address) !== -1) {
								objTransactions[key].spent = true;
							}
							objTransactions[key].from = [];
						}

						getAmountForInfoAddress(objTransactions, function(objTransactions) {
							getSpentOutputs(objTransactions, function(objTransactions) {
								cb(objTransactions, newLastInputsROWID, newLastOutputsROWID);
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

function getStrSqlFilterAssetForTransactions(strFilterAsset) {
	if (typeof strFilterAsset === 'undefined' || strFilterAsset === 'all') {
		return "AND (( inputs.asset IS NULL AND outputs.asset IS NULL ) OR (inputs.asset = outputs.asset))";
	} else if (strFilterAsset === 'bytes') {
		return "AND inputs.asset IS NULL AND outputs.asset IS NULL";
	} else {
		var strEscapedFilterAsset = db.escape(strFilterAsset);
		return "AND inputs.asset = " + strEscapedFilterAsset + " AND outputs.asset = " + strEscapedFilterAsset;
	}
}

function getStrSqlFilterAssetForSingleTypeOfTransactions(strFilterAsset) {
	if (typeof strFilterAsset === 'undefined' || strFilterAsset === 'all') {
		return "";
	} else if (strFilterAsset === 'bytes') {
		return "AND asset IS NULL";
	} else {
		return "AND asset = " + db.escape(strFilterAsset);
	}
}

function getAddressInfo(address, filter, cb) {
	getAddressTransactions(address, BIGINT, BIGINT, filter, function(objTransactions, newLastInputsROWID, newLastOutputsROWID) {
		db.query(
			"SELECT * \n\
			FROM outputs \n\
			WHERE address=? and is_spent=0 \n\
			ORDER BY output_id DESC"
			, [address] 
			, function(rowsOutputs) {
				if (objTransactions !== null || rowsOutputs.length) {
					var strFilterAsset = filter.asset;
					var objBalance = { bytes: 0 }, unspent = [];
					if (typeof strFilterAsset === 'undefined') {
						strFilterAsset = 'all';
					} else if (strFilterAsset === 'bytes') {
						strFilterAsset = null;
					}

					rowsOutputs.forEach(function(row) {
						if (strFilterAsset === 'all' || strFilterAsset === row.asset) {
							unspent.push(row);
						}

						var assetKey = row.asset;
						if (assetKey === null) {
							objBalance.bytes += row.amount;
						}
						else {
							if (!objBalance[assetKey]) {
								objBalance[assetKey] = 0;
							}
							objBalance[assetKey] += row.amount;
						}
					});
				}
				var end = objTransactions ? Object.keys(objTransactions).length < 5 : null;
				if (isFinite(constants.formulaUpgradeMci)) {
					db.query("SELECT definition,storage_size FROM aa_addresses WHERE address=?", [address], function (rows) {
						if (rows.length === 0)
							return findRegularDefinition();
						async.parallel([
							function(asyncCb){
								storage.readAAStateVars(address, function (objStateVars) {
									return asyncCb(null, Object.keys(objStateVars).length > 0 ? objStateVars : null)
								});
							},
							function(asyncCb){
								getAaResponses(address, function(arrAaResponses){
									return asyncCb(null, arrAaResponses)
								});
							}], 
							function(error, arrResults){
								cb(objTransactions, unspent, objBalance, end, rows[0].definition, newLastInputsROWID, newLastOutputsROWID, rows[0].storage_size, arrResults[0], arrResults[1]);
							}
						);
					});
				}
				else
					findRegularDefinition();
				
				function findRegularDefinition() {
					storage.readDefinitionByAddress(db, address, 2147483647, {
						ifFound: function (definition) {
							cb(objTransactions, unspent, objBalance, end, JSON.stringify(definition), newLastInputsROWID, newLastOutputsROWID);
						},
						ifDefinitionNotFound: function () {
							cb(objTransactions, unspent, objBalance, end, false, newLastInputsROWID, newLastOutputsROWID);
						}
					});
				}
			}
		);
	});
}

function getAaResponses(address, handle){
	db.query("SELECT mci,trigger_address,trigger_unit,bounced,response_unit,response,timestamp \n\
	FROM aa_responses INNER JOIN units ON aa_responses.trigger_unit=units.unit WHERE aa_address = ?\n\
	ORDER BY aa_response_id DESC LIMIT " + conf.aaResponsesListed, [address], function (rows) {
		handle(rows.length > 0 ? rows : null);
	});
}

exports.getAddressInfo = getAddressInfo;
exports.getAddressTransactions = getAddressTransactions;