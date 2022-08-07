/*jslint node: true */
'use strict';

var db = require('ocore/db.js');
var constants = require('ocore/constants.js');
var BIGINT = 9223372036854775807;
var storage = require('ocore/storage.js');
var conf = require('ocore/conf.js');
const { getAndSaveAssetNameAndDecimals } = require('./asset');
const { 
	getStrSqlFilterAssetForSingleTypeOfTransactions,
	getStrSqlFilterAssetForTransactions,
} = require('../helpers/sql');
const {
	getSpentOutputs,
	getAmountForInfoAddress,
} = require('./transactions');

async function getUnitsForTransactionsAddress(address, lastInputsROWID, lastOutputsROWID, filter) {
	const strFilterAsset = filter.asset;
	
	const arrQuerySql = [
		"SELECT inputs.unit, MIN(inputs.ROWID) AS inputsROWID, MIN(outputs.ROWID) AS outputsROWID, timestamp",
		"FROM inputs, outputs, units",
		"WHERE (( units.unit IN (SELECT DISTINCT unit FROM inputs INDEXED BY inputsIndexByAddress WHERE address = ? AND ROWID < ? " + 
		getStrSqlFilterAssetForSingleTypeOfTransactions(strFilterAsset) + " ORDER BY ROWID DESC LIMIT 0, 5))",
		"OR ( units.unit IN (SELECT DISTINCT unit FROM outputs WHERE address = ? AND ROWID < ? AND (is_spent=1 OR is_spent=0) " + getStrSqlFilterAssetForSingleTypeOfTransactions(
			strFilterAsset) + " ORDER BY ROWID DESC LIMIT 0, 5)))",
		"AND inputs.unit = outputs.unit",
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
	});
	
	return {
		arrUnits,
		newLastInputsROWID: lastRow.inputsROWID,
		newLastOutputsROWID: lastRow.outputsROWID
	};
}


function filterTransactionsWithoutMyAddress(objTransactions, address) {
	for (let key in objTransactions) {
		const addressInFrom = objTransactions[key].from.find(t => t.address === address);
		if (addressInFrom) continue;
		
		const addressInTo = Object.values(objTransactions[key].to).find(t => t.address === address);
		if (addressInTo) continue;
		
		delete objTransactions[key];
	}
	return objTransactions;
}

async function getAddressTransactions(address, lastInputsROWID, lastOutputsROWID, filter) {
	const {
		arrUnits,
		newLastInputsROWID,
		newLastOutputsROWID,
	} = await getUnitsForTransactionsAddress(address, lastInputsROWID, lastOutputsROWID, filter);
	const unitAssets = {};
	if (arrUnits.length) {
		const objAssetsCache = {};
		const strFilterAsset = filter.asset;

		const arrQuerySql = [
			"SELECT units.ROWID AS rowid, inputs.unit, units.creation_date, inputs.address, outputs.address AS addressTo, outputs.amount, inputs.asset, outputs.asset AS assetTo, outputs.output_id, outputs.message_index, outputs.output_index, inputs.type,\n\
			CASE timestamp \n\
				WHEN 0 THEN " + db.getUnixTimestamp("units.creation_date") + " ELSE timestamp \n\
				END AS timestamp \n\
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
					const unitAssetKey = `${row.unit}_${row.timestamp}_${row.rowid}`;
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
			objTransactions = filterTransactionsWithoutMyAddress(objTransactions, address);
			objTransactions = await getSpentOutputs(objTransactions);
			return { objTransactions, newLastInputsROWID, newLastOutputsROWID, objAssetsCache, unitAssets }
		} else {
			return { objTransactions: null };
		}
	} else {
		return { objTransactions: null };
	}
}

async function getAddressInfo(address, filter) {
	const { objTransactions, newLastInputsROWID, newLastOutputsROWID, objAssetsCache, unitAssets } = await getAddressTransactions(
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


exports.getAddressInfo = getAddressInfo;
exports.getAddressTransactions = getAddressTransactions;
