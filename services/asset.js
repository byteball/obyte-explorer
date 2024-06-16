const db = require('ocore/db');
const constants = require('ocore/constants');
const conf = require('ocore/conf');
const getAssetUnit = require('../api/getAssetUnit');
const storage = require('ocore/storage');
const getAssetNameAndDecimals = require('../api/getAssetNameAndDecimals');
const {
	getSpentOutputs,
	getAmountForInfoAddress,
} = require('./transactions');
const {
	getStrSqlFilterAssetForSingleTypeOfTransactions,
	getStrSqlFilterAssetForTransactions,
	getStrSQLFilterForIssuerForUnlimitedCap,
} = require('../helpers/sql');
const checkIsAssetValid = require('../helpers/isValidAsset');
const checkIsAssetPresentInDb = require('../helpers/isAssetPresentInDb');
const { getTriggerUnit } = require("./units");

const BIGINT = 9223372036854775807;

async function getAndSaveAssetNameAndDecimals(asset, cache) {
	if (asset === 'bytes') return null;
	if (cache[asset] !== undefined) return cache[asset];

	const objResult = await getAssetNameAndDecimals(asset);
	cache[asset] = objResult;
	return objResult;
}

async function getUnitsForAssetsTransactions(asset, lastInputsROWID, lastOutputsROWID) {
	const arrQuerySql = [
		"SELECT inputs.unit, MIN(inputs.ROWID) AS inputsROWID, MIN(outputs.ROWID) AS outputsROWID, timestamp",
		"FROM inputs, outputs, units",
		"WHERE (( units.unit IN (SELECT DISTINCT unit FROM inputs WHERE ROWID < ? " + getStrSqlFilterAssetForSingleTypeOfTransactions(asset) + " ORDER BY ROWID DESC LIMIT 0, 5))",
		"OR ( units.unit IN (SELECT DISTINCT unit FROM outputs WHERE ROWID < ? " + getStrSqlFilterAssetForSingleTypeOfTransactions(asset) + " AND (is_spent=1 OR is_spent=0) ORDER BY ROWID DESC LIMIT 0, 5)))",
		"AND inputs.unit = outputs.unit",
		"AND units.unit = inputs.unit",
		"GROUP BY inputs.unit",
		"ORDER BY units.ROWID DESC LIMIT 0, 5"
	];

	const rows = await db.query(
		arrQuerySql.join(" \n"),
		[lastInputsROWID, lastOutputsROWID]);

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

async function getAssetTransactions(asset, lastInputsROWID, lastOutputsROWID) {
	const {
		arrUnits,
		newLastInputsROWID,
		newLastOutputsROWID,
	} = await getUnitsForAssetsTransactions(asset, lastInputsROWID, lastOutputsROWID);
	if (arrUnits.length) {
		const objAssetsCache = {};

		const arrQuerySql = [
			"SELECT units.ROWID AS rowid, inputs.unit, units.creation_date, inputs.address, outputs.address AS addressTo, outputs.amount, inputs.asset, outputs.asset AS assetTo, outputs.output_id, outputs.message_index, outputs.output_index, inputs.type,\n\
			CASE timestamp \n\
				WHEN 0 THEN " + db.getUnixTimestamp("units.creation_date") + " ELSE timestamp \n\
				END timestamp \n\
				FROM inputs INDEXED BY sqlite_autoindex_inputs_1, outputs, units",
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

					const unitAssetKey = `${row.unit}_${row.timestamp}_${row.rowid}`;
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

			return { objTransactions, newLastInputsROWID, newLastOutputsROWID, objAssetsCache, unitAssets }
		} else {
			return { objTransactions: null };
		}
	} else {
		return { objTransactions: null };
	}
}

async function getAssetHolders(asset, type, offset, issuerForUnlimitedCap) {
	const lAsset = asset === 'bytes' ? 'base' : asset;
	if (!offset) {
		offset = 0;
	}

	if (type === 'large') {
		const rowsBalances = await db.query(
			"SELECT * FROM balances \n\
			WHERE asset = ? " + getStrSQLFilterForIssuerForUnlimitedCap(issuerForUnlimitedCap) + " ORDER BY balance DESC LIMIT " + offset + ", 100", [lAsset]);

		return rowsBalances.map(row => {
			return {
				address: row.address,
				asset: row.asset === 'base' ? 'bytes' : row.asset,
				balance: row.balance,
			}
		});
	}

	const rowsBalances = await db.query(
		"SELECT address, asset, SUM(amount) AS balance \n\
		FROM outputs INDEXED BY outputsIndexByAsset JOIN units USING(unit) \n\
		WHERE is_spent=0 " + getStrSqlFilterAssetForSingleTypeOfTransactions(asset) + getStrSQLFilterForIssuerForUnlimitedCap(issuerForUnlimitedCap) + " AND sequence='good' \n\
		GROUP BY address, asset	ORDER BY balance DESC LIMIT " + offset + ", 100");

	return rowsBalances.map(row => {
		return {
			address: row.address,
			asset: row.asset || 'bytes',
			balance: row.balance,
		}
	});
}

async function getSupplyForSmallAsset(asset, issuerForUnlimitedCap) {
	const rows = await db.query(
		"SELECT SUM(amount) AS supply \n\
		FROM outputs INDEXED BY outputsIndexByAsset JOIN units USING(unit) \n\
		WHERE is_spent=0 " + getStrSqlFilterAssetForSingleTypeOfTransactions(asset) + getStrSQLFilterForIssuerForUnlimitedCap(issuerForUnlimitedCap) + " AND sequence='good'");

	return rows[0].supply;
}

async function getAssetHoldersAndSupply(asset, offset = 0, issuerForUnlimitedCap) {
	const lAsset = asset === 'bytes' ? 'base' : asset;
	const rowsBalancesForLength = await db.query(
		"SELECT COUNT(*) AS count, SUM(balance) AS supply FROM balances \n\
		WHERE asset = ?" + getStrSQLFilterForIssuerForUnlimitedCap(issuerForUnlimitedCap), [lAsset]);
	const count = rowsBalancesForLength[0].count;
	let supply = rowsBalancesForLength[0].supply;
	const type = count > 1000 ? 'large' : 'small';
	let holders = await getAssetHolders(asset, type, offset, issuerForUnlimitedCap);

	if(type === 'small') {
		supply = await getSupplyForSmallAsset(asset, issuerForUnlimitedCap);
	}

	return {
		holders,
		type,
		supply,
	}
}

async function getMetaOfPrivateAsset(asset) {
	if (asset.toUpperCase() === 'GBB') {
		asset = constants.BLACKBYTES_ASSET
	}
	
	const rows = await db.query("SELECT unit, cap FROM assets WHERE is_private = 1 AND unit = ?", [asset]);
	
	if (rows.length) {
		return rows[0];
	}

	return false;
}

function getAssetDataForPrivateAsset(metaOfPrivateAsset) {
	const assetData = { isPrivate: true };
	assetData.assetUnit = metaOfPrivateAsset.unit;
	assetData.cap = metaOfPrivateAsset.cap;
	assetData.end = true;
	if (metaOfPrivateAsset.unit === constants.BLACKBYTES_ASSET) {
		assetData.name = 'GBB';
		assetData.decimals = 9;
	}

	return assetData;
}

async function getURLAndNameByAssetUnit(assetUnit) {
	const rows = await db.query("SELECT asset, registry_address, name FROM asset_metadata WHERE asset = ?", [assetUnit]);
	if (rows.length) {
		if (conf.supportedRegistries[rows[0].registry_address]) {
			const registryMeta = conf.supportedRegistries[rows[0].registry_address];
			let url = registryMeta.url;

			if (registryMeta.type === 'unit') {
				if (rows[0].registry_address === 'AM6GTUKENBYA54FYDAKX2VLENFZIMXWG') {
					url += rows[0].asset.replace(/\//g, '~2F');
				} else {
					url += encodeURIComponent(rows[0].asset);
				}
			}
			if (registryMeta.type === 'symbol') {
				url += rows[0].name;
			}

			return { url, name: registryMeta.name };
		}
	}

	return null;
}

const tokenRegistry = 'O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ';

async function getMessageByApp(messages, app) {
	return messages.find(msg => msg.app === app);
}

async function getAADefinition(address) {
	return db.query("SELECT definition FROM aa_addresses WHERE address=?", [address]);
}

async function getUnitAuthor(unit) {
	return db.query('SELECT * FROM unit_authors WHERE unit = ?', [unit]);
}

async function getAssetInfo(assetUnit) {
	const assetInfo = {
		author: '',
		data: null
	}

	const rows = await db.query("SELECT metadata_unit, registry_address FROM asset_metadata WHERE asset = ?", [assetUnit]);

	if (rows[0].registry_address !== tokenRegistry) {
		const metadataUnit = await storage.readUnit(rows[0].metadata_unit);

		assetInfo.author = metadataUnit.authors[0].address;

		assetInfo.data = metadataUnit.data;
	}

	const triggerUnit = await getTriggerUnit(assetUnit);

	if (!triggerUnit) {
		const triggerUnitOfMetadataUnit = await getTriggerUnit(rows[0].metadata_unit);

		const triggerUnit = await storage.readUnit(triggerUnitOfMetadataUnit);

		const triggerUnitDataMessage = await getMessageByApp(triggerUnit.messages, 'data');

		console.error('mu trigger messages', triggerUnitDataMessage);

		assetInfo.author = triggerUnit.authors[0].address;
		assetInfo.data = triggerUnitDataMessage.payload;

		return assetInfo;
	}

	console.error('trigger', triggerUnit);	

	// используем автора триггер юнита как автора
	const triggerUnitAuthor = await getUnitAuthor(triggerUnit);

	const triggerUnitPayload = await storage.readUnit(triggerUnit);
	
	console.error('tp', triggerUnitPayload);
	
	const triggerUnitDefinitionMessage = await getMessageByApp(triggerUnitPayload.messages, 'definition');

	console.error('triggerUnitDefinitionMessage', triggerUnitDefinitionMessage);

	if (!triggerUnitDefinitionMessage) {
		assetInfo.author = triggerUnitAuthor[0].address;
		// - if no definition - then mark trigger_unit author as author
		// *ideally check if author is AA, and if it is AA then show its meta, if no show just its address 
		console.error('triggerUnitAuthor', triggerUnitAuthor[0]);

		// ToDo: ???
		const authorDefinitionRows = await getAADefinition(triggerUnitAuthor[0].address);
		
		console.error('authorDefinitionRows', authorDefinitionRows);

		if (authorDefinitionRows.length) {
			const authorDefinition = JSON.parse(authorDefinitionRows[0].definition);

			if(authorDefinition[0] === 'autonomous agent') {
				assetInfo.authorDefinition = authorDefinitionRows[0].definition;

				if(authorDefinitionRows[0].definition)
				
				assetInfo.authorDefinition = authorDefinitionRows[0].definition;
			}
		}

		return assetInfo;
	}

	const triggerUnitDefinition = triggerUnitDefinitionMessage.payload.definition[1];

	console.error('triggerUnitDefinition', triggerUnitDefinition);

	if (triggerUnitDefinition.base_aa) {
		assetInfo.author = triggerUnitDefinition.base_aa;
		
		const authorDefinitionRows = await getAADefinition(triggerUnitDefinition.base_aa);
		
		if (authorDefinitionRows.length) {

			const authorDefinition = JSON.parse(authorDefinitionRows[0].definition);

			console.error('base authorDefinition', authorDefinition);

			if(authorDefinition[0] === 'autonomous agent') {
				assetInfo.authorDefinition = authorDefinitionRows[0].definition;
			}
		}

		return assetInfo;
	}

	assetInfo.author = triggerUnitDefinition.base_aa;

	// if definition have no base_aa - return author as trigger unit author
	const authorDefinitionRows = await getAADefinition(triggerUnitAuthor[0].address);

	if(authorDefinitionRows.length) {
		const authorDefinition = JSON.parse(authorDefinitionRows[0].definition);

		console.error('not-base authorDefinition', authorDefinition);

		if(authorDefinition[0] === 'autonomous agent') {
			assetInfo.authorDefinition = authorDefinitionRows[0].definition;
		}	
	}

	return assetInfo;
}

async function getAssetData(asset) {
	const metaOfPrivateAsset = await getMetaOfPrivateAsset(asset);
	if (metaOfPrivateAsset) {
		return getAssetDataForPrivateAsset(metaOfPrivateAsset);
	}

	let assetUnit = await getAssetUnit(asset) || asset;

	const isValidAsset = checkIsAssetValid(assetUnit);

	if (!isValidAsset) {
		return { notFound: true };
	}

	const isAssetPresentInDb = await checkIsAssetPresentInDb(assetUnit);

	if (assetUnit !== 'bytes' && !isAssetPresentInDb) {
		return { notFound: true };
	}

	const assetData = { assetUnit };

	const unit = await storage.readUnit(assetUnit);

	const assetInfo = await getAssetInfo(assetUnit);

	console.error('assetInfo', assetInfo);
	
	let isLimitedCap = false;

	if (assetUnit !== 'bytes') {
		if (!unit) {
			return { notFound: true };
		}
		const message = unit.messages.find(msg => msg.app === 'asset');
		if (message && message.payload.cap) {
			isLimitedCap = true;
		}
	} else {
		isLimitedCap = true;
	}

	if (assetUnit !== 'bytes') {
		const assetNameAndDecimals = await getAssetNameAndDecimals(assetUnit);
		if (assetNameAndDecimals) {
			assetData.name = assetNameAndDecimals.name;
			assetData.decimals = assetNameAndDecimals.decimals;

			const urlAndName = await getURLAndNameByAssetUnit(assetUnit);
			if (urlAndName) {
				assetData.url = urlAndName.url;
				assetData.urlName = urlAndName.name;
			}
		}
	} else {
		assetData.name = 'Bytes';
		assetData.decimals = 0;
	}

	let issuerForUnlimitedCap = null;
	if (!isLimitedCap) {
		issuerForUnlimitedCap = unit.authors[0].address;
	}

	let { holders, type, supply } = await getAssetHoldersAndSupply(assetUnit, 0, issuerForUnlimitedCap);

	assetData.holders = holders;
	assetData.typeOfHolders = type;
	assetData.offsetForHolders = 100;
	assetData.endHolders = holders.length < 100;
	assetData.supply = supply;
	assetData.transactionsData = await getAssetTransactions(assetUnit, BIGINT, BIGINT, []);

	assetData.assetInfo = assetInfo;

	assetData.end = assetData.transactionsData.objTransactions ? Object.keys(assetData.transactionsData.objTransactions).length < 5 : false;

	return assetData;
}

exports.getAndSaveAssetNameAndDecimals = getAndSaveAssetNameAndDecimals;
exports.getAssetTransactions = getAssetTransactions;
exports.getAssetData = getAssetData;
exports.getAssetHolders = getAssetHolders;
