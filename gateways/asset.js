const assetService = require('../services/asset');
const getAssetUnit = require("../api/getAssetUnit");
const getAssetsListByNameFromDb = require("../helpers/getAssetsListFromDb");

async function getAssetData(data, cb) {
	const assetData = await assetService.getAssetData(data.asset);
	assetData.testnet = !!process.env.testnet;

	cb(assetData);
}

async function loadNextPageAssetTransactions(data, cb) {
	const assetUnit = await getAssetUnit(data.asset) || data.asset;
	const transactionsData = await assetService.getAssetTransactions(assetUnit, data.lastInputsROWID, data.lastOutputsROWID);

	cb({
		transactionsData,
		end: transactionsData.objTransactions === null || Object.keys(transactionsData.objTransactions).length < 5,
	});
}

async function loadNextPageAssetHolders(data, cb) {
	const assetUnit = await getAssetUnit(data.asset) || data.asset;
	const holders = await assetService.getAssetHolders(assetUnit, data.type, data.offset);

	cb({
		holders,
		end: holders.length < 100,
	});
}

async function fetchAssetNamesList(cb) {
	const assets = await getAssetsListByNameFromDb();
	const assetNames = assets.map(asset => asset.name);

	cb({ assetNames });
}

exports.getAssetData = getAssetData;
exports.loadNextPageAssetTransactions = loadNextPageAssetTransactions;
exports.loadNextPageAssetHolders = loadNextPageAssetHolders;
exports.fetchAssetNamesList = fetchAssetNamesList;