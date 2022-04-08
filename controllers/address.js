/*jslint node: true */
'use strict';

var db = require('ocore/db.js');
var constants = require('ocore/constants.js');
var BIGINT = 9223372036854775807;
var storage = require('ocore/storage.js');
var conf = require('ocore/conf.js');
const getAssetNameAndDecimals = require('../helpers/getAssetNameAndDecimals');

async function getAmountForInfoAddress(objTransactions) {
	var arrTransactionsUnits = [], key;
	for (key in objTransactions) {
		if (arrTransactionsUnits.indexOf(objTransactions[key].unit) === -1) arrTransactionsUnits.push(
			objTransactions[key].unit);
	}
	const rowsAmount = await db.query("SELECT inputs.unit, outputs.address, outputs.amount, outputs.asset FROM inputs, outputs \n\
		WHERE inputs.unit IN (?) AND outputs.unit = inputs.src_unit AND outputs.message_index = inputs.src_message_index AND outputs.output_index = inputs.src_output_index",
		[arrTransactionsUnits]);
	const rows = await db.query("SELECT unit, asset, type, serial_number, from_main_chain_index, to_main_chain_index, amount, address \n\
		FROM inputs WHERE unit IN (?) AND (type='issue' OR type='headers_commission' OR type='witnessing')",
		[arrTransactionsUnits]);
	rowsAmount.forEach(function (row) {
		key = row.unit + '_' + row.asset;
		if (objTransactions[key]) objTransactions[key].from.push({
			address: row.address,
			amount: row.amount
		});
	});
	for (let row of rows) {
		if (row.type === 'issue') {
			key = row.unit + '_' + row.asset;
			if (objTransactions[key]) objTransactions[key].from.push({
				issue: true,
				amount: row.amount,
				serial_number: row.serial_number,
				address: row.address
			});
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
				const rowsCommissionOutputs = await db.query("SELECT SUM(amount) AS sum FROM " + tableName + " WHERE address = ? AND main_chain_index >= ? AND main_chain_index <= ? ORDER BY main_chain_index",
					[row.address, row.from_main_chain_index, row.to_main_chain_index]);
				key = row.unit + '_' + row.asset;
				if (objTransactions[key]) objTransactions[key].from.push({
					commissionType: commissionType,
					address: row.address,
					from_mci: row.from_main_chain_index,
					to_mci: row.to_main_chain_index,
					sum: rowsCommissionOutputs[0].sum
				});
			}
		}
	}
	return objTransactions;
}

async function getSpentOutputs(objTransactions) {
	var arrTransactionsUnits = [], key, key2;
	for (key in objTransactions) {
		if (arrTransactionsUnits.indexOf(objTransactions[key].unit) === -1) arrTransactionsUnits.push(objTransactions[key].unit);
	}
	var n = 0, l = arrTransactionsUnits.length - 1;

	async function setSpentOutputs() {
		const rows = await db.query("SELECT outputs.output_id, outputs.message_index, outputs.output_index, outputs.asset, inputs.unit \n \
		FROM outputs, inputs WHERE outputs.unit = ? AND is_spent = 1 AND inputs.src_unit = outputs.unit \n\
		AND inputs.src_message_index = outputs.message_index AND inputs.src_output_index = outputs.output_index",
			[arrTransactionsUnits[n]]);
		rows.forEach(function(row) {
			key = arrTransactionsUnits[n] + '_' + row.asset;
			key2 = row.output_id + '_' + row.message_index + '_' + row.output_index;
			if (objTransactions[key] && objTransactions[key].to[key2]) {
				objTransactions[key].to[key2].spent = row.unit;
			}
		});
		if (n < l) {
			n++;
			return setSpentOutputs();
		}
		else {
			return objTransactions;
		}
	}

	return setSpentOutputs();
}

async function getUnitsForTransactionsAddress(address, lastInputsROWID, lastOutputsROWID, filter, excludeUnits) {
	const strFilterAsset = filter.asset;

	const arrQuerySql = [
		"SELECT inputs.unit, MIN(inputs.ROWID) AS inputsROWID, MIN(outputs.ROWID) AS outputsROWID, timestamp",
		"FROM inputs, outputs, units",
		"WHERE (( units.unit IN (SELECT DISTINCT unit FROM inputs WHERE address = ? AND ROWID < ? " + getStrSqlFilterAssetForSingleTypeOfTransactions(
			strFilterAsset) + " ORDER BY ROWID DESC LIMIT 0, 5))",
		"OR ( units.unit IN (SELECT DISTINCT unit FROM outputs WHERE address = ? AND ROWID < ? AND (is_spent=1 OR is_spent=0) " + getStrSqlFilterAssetForSingleTypeOfTransactions(
			strFilterAsset) + " ORDER BY ROWID DESC LIMIT 0, 5)))",
		"AND inputs.unit = outputs.unit",
		getStrSqlFilterAssetForTransactions(strFilterAsset),
		"AND units.unit = inputs.unit",
		"GROUP BY inputs.unit",
		"ORDER BY units.ROWID DESC LIMIT 0, 5"
	];
	const rows = await db.query(
		arrQuerySql.join(" \n"),
		[address, lastInputsROWID, address, lastOutputsROWID]);
	const lastRow = rows[rows.length - 1] || {};
	const arrUnits = rows.map(function (row) {
		return row.unit;
	}).filter(unit => {
		return !excludeUnits.includes(unit);
	});
	const timestamps = rows.map(row => {
		return row.timestamp;
	});
	const newExcludeUnits = [];

	if (timestamps.length) {
		const unitRows = await db.query(
			"SELECT DISTINCT unit FROM units JOIN inputs USING(unit) JOIN outputs USING(unit) WHERE timestamp IN (?) AND (inputs.address = ? OR outputs.address = ?)",
			[timestamps, address, address]);

		unitRows.forEach(row => {
			if (arrUnits.includes(row.unit)) return;

			if (!newExcludeUnits.includes(row.unit)) {
				newExcludeUnits.push(row.unit);
			}
		});
	}

	return {
		arrUnits: [...arrUnits, ...newExcludeUnits],
		excludeUnits: newExcludeUnits,
		newLastInputsROWID: lastRow.inputsROWID,
		newLastOutputsROWID: lastRow.outputsROWID
	};
}

async function getAndSaveAssetNameAndDecimals(asset, cache) {
	if (asset === 'bytes') return null;
	if (cache[asset] !== undefined) return cache[asset];

	const objResult = await getAssetNameAndDecimals(asset);
	cache[asset] = objResult;
	return objResult;
}

async function getAddressTransactions(address, lastInputsROWID, lastOutputsROWID, filter, excludeUnits) {
	const {
		arrUnits,
		newLastInputsROWID,
		newLastOutputsROWID,
		excludeUnits: newExcludeUnits,
	} = await getUnitsForTransactionsAddress(address, lastInputsROWID, lastOutputsROWID, filter, excludeUnits);
	const unitAssets = {};
	if (arrUnits.length) {
		const objAssetsCache = {};
		const strFilterAsset = filter.asset;

		const arrQuerySql = [
			"SELECT inputs.unit, units.creation_date, inputs.address, outputs.address AS addressTo, outputs.amount, inputs.asset, outputs.asset AS assetTo, outputs.output_id, outputs.message_index, outputs.output_index, inputs.type,\n\
			CASE timestamp \n\
				WHEN 0 THEN " + db.getUnixTimestamp("units.creation_date") + " ELSE timestamp \n\
				END timestamp \n\
				FROM inputs, outputs, units",
			"WHERE units.unit IN (?) AND outputs.unit = inputs.unit",
			getStrSqlFilterAssetForTransactions(strFilterAsset),
			"AND units.unit = inputs.unit",
			"ORDER BY units.timestamp DESC,units.ROWID DESC"
		];

		const rowsTransactions = await db.query(arrQuerySql.join(" \n"), [arrUnits]);
		var key, objTransactions = {};
		if (rowsTransactions.length) {
			for (let k in rowsTransactions) {
				const row = rowsTransactions[k];
				key = row.unit + '_' + row.asset;
				if (!objTransactions[key]) {
					objTransactions[key] = {
						unit: row.unit,
						timestamp: row.timestamp,
						from: [],
						to: {},
						spent: false,
						asset: row.asset,
						output_id: row.output_id
					};
					if (row.asset) {
						const objResult = await getAndSaveAssetNameAndDecimals(row.asset,
							objAssetsCache);
						if (objResult) {
							objTransactions[key].assetName = objResult.name;
							objTransactions[key].assetDecimals = objResult.decimals;
						}
					}
					const unitAssetKey = `${row.unit}_${row.timestamp}`;
					if (!unitAssets[unitAssetKey]) {
						unitAssets[unitAssetKey] = [];
					}

					unitAssets[unitAssetKey].push(row.asset);
				}
				if (objTransactions[key].from.indexOf(row.address) === -1) objTransactions[key].from.push(
					row.address);
				if (!objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index]) {
					objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index] = {
						address: row.addressTo,
						amount: row.amount,
						spent: 0
					};
				}
			}

			for (let key in objTransactions) {
				if (objTransactions[key].from.indexOf(address) !== -1) {
					objTransactions[key].spent = true;
				}
				objTransactions[key].from = [];
			}

			objTransactions = await getAmountForInfoAddress(objTransactions);
			objTransactions = await getSpentOutputs(objTransactions);
			return { objTransactions, newLastInputsROWID, newLastOutputsROWID, excludeUnits: newExcludeUnits, objAssetsCache, unitAssets }
		} else {
			return { objTransactions: null };
		}
	} else {
		return { objTransactions: null };
	}
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

async function getAddressInfo(address, filter) {
	const { objTransactions, newLastInputsROWID, newLastOutputsROWID, excludeUnits, objAssetsCache, unitAssets } = await getAddressTransactions(
		address, BIGINT, BIGINT, filter, []);
	
	const rowsOutputs = await db.query(
		"SELECT * \n\
		FROM outputs \n\
		WHERE address=? and is_spent=0 \n\
		ORDER BY output_id DESC", [address]);
	if (objTransactions !== null || rowsOutputs.length) {
		var strFilterAsset = filter.asset;
		var objBalances = { bytes: { balance: 0 } }, unspent = [];
		if (typeof strFilterAsset === 'undefined') {
			strFilterAsset = 'all';
		} else if (strFilterAsset === 'bytes') {
			strFilterAsset = null;
		}

		for (let k in rowsOutputs) {
			const row = rowsOutputs[k];
			const assetKey = row.asset;
			if (strFilterAsset === 'all' || strFilterAsset === assetKey) {
				if (row.asset) {
					const objResult = await getAndSaveAssetNameAndDecimals(assetKey,
						objAssetsCache);
					if (objResult) {
						row.assetName = objResult.name;
						row.assetDecimals = objResult.decimals;
					}
				}
				unspent.push(row);
			}

			if (assetKey === null) {
				objBalances.bytes.balance += row.amount;
			} else {
				if (!objBalances[assetKey]) {
					const objResult = await getAndSaveAssetNameAndDecimals(assetKey,
						objAssetsCache);
					if (objResult) {
						objBalances[assetKey] = {
							balance: 0,
							assetName: objResult.name,
							assetDecimals: objResult.decimals
						};
					} else {
						objBalances[assetKey] = { balance: 0 };
					}
				}
				objBalances[assetKey].balance += row.amount;
			}
		}
	}
	var end = objTransactions ? Object.keys(objTransactions).length < 5 : null;
	if (isFinite(constants.formulaUpgradeMci)) {
		const rows = await db.query(
			"SELECT definition,storage_size FROM aa_addresses WHERE address=?",
			[address]);
		if (rows.length === 0)
			return findRegularDefinition();
		
		let objStateVars = await storage.readAAStateVars(address);
		for (let key in objStateVars) {
			if (typeof objStateVars[key] !== 'number')
				objStateVars[key] = JSON.stringify(objStateVars[key]);
		}
		objStateVars =  Object.keys(objStateVars).length > 0 ? objStateVars : null;
		const arrAaResponses = await getAaResponses(address);
		const arrAasFromTemplate = await getAasFromTemplate(address);
		
		return {
			objTransactions,
			unspent,
			objBalances,
			end,
			definition: rows[0].definition,
			newLastInputsROWID, 
			newLastOutputsROWID,
			excludeUnits,
			storage_size: rows[0].storage_size,
			objStateVars,
			arrAaResponses,
			arrAasFromTemplate,
			unitAssets,
		};

	} else
		return findRegularDefinition();

	function findRegularDefinition() {
		return new Promise((resolve => {
			storage.readDefinitionByAddress(db, address, 2147483647, {
				ifFound: function (definition) {
					resolve({
						objTransactions,
						unspent,
						objBalances,
						end,
						definition: JSON.stringify(definition),
						newLastInputsROWID, 
						newLastOutputsROWID,
						excludeUnits,
						unitAssets,
					});
				},
				ifDefinitionNotFound: function () {
					resolve({
						objTransactions,
						unspent,
						objBalances,
						end,
						definition: false,
						newLastInputsROWID, 
						newLastOutputsROWID,
						excludeUnits,
						unitAssets,
					});
				}
			});
		}))
	}

}

async function getAaResponses(address) {
	const rows = await db.query("SELECT mci,trigger_address,trigger_unit,bounced,response_unit,response,timestamp \n\
		FROM aa_responses INNER JOIN units ON aa_responses.trigger_unit=units.unit WHERE aa_address = ?\n\
		ORDER BY aa_response_id DESC LIMIT " + conf.aaResponsesListed, [address]);
	return rows.length > 0 ? rows : null;
}

async function getAasFromTemplate(address) {
	const rows = await db.query("SELECT address FROM aa_addresses WHERE base_aa = ? LIMIT " + (conf.aasFromTemplateListed || 50) // failover value for until aa-test-kit conf is updated
		, [address]);
	return rows.length > 0 ? rows : null;
}

async function getUnitsForAssetsTransactions(asset, lastInputsROWID, lastOutputsROWID, excludeUnits) {
	const arrQuerySql = [
		"SELECT inputs.unit, MIN(inputs.ROWID) AS inputsROWID, MIN(outputs.ROWID) AS outputsROWID, timestamp",
		"FROM inputs, outputs, units",
		"WHERE (( units.unit IN (SELECT DISTINCT unit FROM inputs WHERE asset = ? AND ROWID < ? ORDER BY ROWID DESC LIMIT 0, 5))",
		"OR ( units.unit IN (SELECT DISTINCT unit FROM outputs WHERE asset = ? AND ROWID < ? AND (is_spent=1 OR is_spent=0) ORDER BY ROWID DESC LIMIT 0, 5)))",
		"AND inputs.unit = outputs.unit",
		"AND units.unit = inputs.unit",
		"GROUP BY inputs.unit",
		"ORDER BY units.ROWID DESC LIMIT 0, 5"
	];

	const rows = await db.query(
		arrQuerySql.join(" \n"),
		[asset, lastInputsROWID, asset, lastOutputsROWID]);
	
	const lastRow = rows[rows.length - 1] || {};
	const arrUnits = rows.map(function (row) {
		return row.unit;
	}).filter(unit => {
		return !excludeUnits.includes(unit);
	});
	const timestamps = rows.map(row => {
		return row.timestamp;
	});
	const newExcludeUnits = [];

	if (timestamps.length) {
		const unitRows = await db.query(
			"SELECT DISTINCT unit FROM units JOIN inputs USING(unit) JOIN outputs USING(unit) WHERE timestamp IN (?) AND (inputs.asset = ? OR outputs.asset = ?)",
			[timestamps, asset, asset]);

		unitRows.forEach(row => {
			if (arrUnits.includes(row.unit)) return;

			if (!newExcludeUnits.includes(row.unit)) {
				newExcludeUnits.push(row.unit);
			}
		});
	}

	return {
		arrUnits: [...arrUnits, ...newExcludeUnits],
		excludeUnits: newExcludeUnits,
		newLastInputsROWID: lastRow.inputsROWID,
		newLastOutputsROWID: lastRow.outputsROWID
	};
}

async function getAssetTransactions(asset, lastInputsROWID, lastOutputsROWID, excludeUnits) {
	const {
		arrUnits,
		newLastInputsROWID,
		newLastOutputsROWID,
		excludeUnits: newExcludeUnits,
	} = await getUnitsForAssetsTransactions(asset, lastInputsROWID, lastOutputsROWID, excludeUnits);
	if (arrUnits.length) {
		const objAssetsCache = {};

		const arrQuerySql = [
			"SELECT inputs.unit, units.creation_date, inputs.address, outputs.address AS addressTo, outputs.amount, inputs.asset, outputs.asset AS assetTo, outputs.output_id, outputs.message_index, outputs.output_index, inputs.type,\n\
			CASE timestamp \n\
				WHEN 0 THEN " + db.getUnixTimestamp("units.creation_date") + " ELSE timestamp \n\
				END timestamp \n\
				FROM inputs, outputs, units",
			"WHERE units.unit IN (?) AND outputs.unit = inputs.unit",
			getStrSqlFilterAssetForTransactions(asset),
			"AND units.unit = inputs.unit",
			"ORDER BY units.timestamp DESC,units.ROWID DESC"
		];

		const rowsTransactions = await db.query(arrQuerySql.join(" \n"), [arrUnits]);

		var key, objTransactions = {};
		const unitAssets = {};

		if (rowsTransactions.length) {
			for (let k in rowsTransactions) {
				const row = rowsTransactions[k];
				key = row.unit + '_' + row.asset;

				if (!objTransactions[key]) {
					objTransactions[key] = {
						unit: row.unit,
						timestamp: row.timestamp,
						from: [],
						to: {},
						spent: false,
						asset: row.asset,
						output_id: row.output_id
					};
					if (row.asset) {
						const objResult = await getAndSaveAssetNameAndDecimals(row.asset,
							objAssetsCache);
						if (objResult) {
							objTransactions[key].assetName = objResult.name;
							objTransactions[key].assetDecimals = objResult.decimals;
						}
					}

					const unitAssetKey = `${row.unit}_${row.timestamp}`;
					if (!unitAssets[unitAssetKey]) {
						unitAssets[unitAssetKey] = [];
					}

					unitAssets[unitAssetKey].push(row.asset);
				}
				if (objTransactions[key].from.indexOf(row.address) === -1) {
					objTransactions[key].from.push(row.address);
				}

				if (!objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index]) {
					objTransactions[key].to[row.output_id + '_' + row.message_index + '_' + row.output_index] = {
						address: row.addressTo,
						amount: row.amount,
						spent: 0
					};
				}
			}

			for (let key in objTransactions) {
				objTransactions[key].spent = true;
				objTransactions[key].from = [];
			}

			objTransactions = await getAmountForInfoAddress(objTransactions);

			objTransactions = await getSpentOutputs(objTransactions);

			return { objTransactions, newLastInputsROWID, newLastOutputsROWID, excludeUnits: newExcludeUnits, objAssetsCache, unitAssets }
		} else {
			return { objTransactions: null };
		}
	} else {
		return { objTransactions: null };
	}
}

async function getAssetData(asset) {
	const assetData = { assetUnit: asset, holders: [], assetTransactions: [] };
	
	const rows = await db.query(
		"SELECT address, asset, SUM(amount) AS balance \n\
		FROM outputs INDEXED BY outputsIndexByAsset JOIN units USING(unit) \n\
		WHERE is_spent=0 AND asset=? AND sequence='good' \n\
		GROUP BY address, asset	ORDER BY balance DESC", [asset]);

	if (rows.length) {
		const assetNameAndDecimals = await getAssetNameAndDecimals(asset);

		if (assetNameAndDecimals) {
			assetData.name = assetNameAndDecimals.name;
			assetData.decimals = assetNameAndDecimals.decimals;			
		}

		const holders = rows.map(row => {
			return {
				address: row.address,
				asset: row.asset,
				balance: row.balance,
			}
		});
		
		assetData.holders = holders;
		assetData.supply = (holders.reduce((total, holder) => total + holder.balance, 0));
		assetData.transactionsData = await getAssetTransactions(asset, BIGINT, BIGINT, []);
	}

	assetData.end = assetData.assetTransactions.objTransactions ? Object.keys(assetData.assetTransactions.objTransactions).length < 5 : null;

	return assetData;
}

exports.getAddressInfo = getAddressInfo;
exports.getAddressTransactions = getAddressTransactions;
exports.getAssetTransactions = getAssetTransactions;
exports.getAssetData = getAssetData;