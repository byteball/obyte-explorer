const assetService = require('../services/asset');
const getAssetUnit = require("../api/getAssetUnit");
const getAssetsListByNameFromDb = require("../helpers/getAssetsListFromDb");
const getInvalidAssetResponse = require('../helpers/getInvalidAssetResponse');

async function getAssetData(data, cb) {
	data = data || {};

	const assetData = await assetService.getAssetData(data.asset);
	assetData.testnet = !!process.env.testnet;

	cb(assetData);
}

async function loadNextPageAssetTransactions(data, cb) {
	data = data || {};
	if (typeof data.asset !== 'string') {
		return cb(getInvalidAssetResponse());
	}

	const assetUnit = await getAssetUnit(data.asset) || data.asset;
	const transactionsData = await assetService.getAssetTransactions(assetUnit, data.lastInputsROWID, data.lastOutputsROWID);

	cb({
		transactionsData,
		end: transactionsData.objTransactions === null || Object.keys(transactionsData.objTransactions).length < 5,
	});
}

function normalizeHoldersType(type) {
	if (type === 'large' || type === 'small') {
		return { value: type };
	}

	return {
		error: 'invalid_type',
		message: 'Invalid holders type',
		statusCode: 400,
	};
}

function normalizeOffset(offset) {
	if (offset === undefined || offset === null || offset === '') {
		return { value: 0 };
	}

	const value = Number(offset);
	if (!Number.isInteger(value) || value < 0) {
		return {
			error: 'invalid_offset',
			message: 'Invalid offset',
			statusCode: 400,
		};
	}

	return { value };
}

async function loadNextPageAssetHolders(data, cb) {
	data = data || {};
	if (typeof data.asset !== 'string') {
		return cb(getInvalidAssetResponse());
	}

	const normalizedType = normalizeHoldersType(data.type);
	if (normalizedType.error) {
		return cb(normalizedType);
	}

	const normalizedOffset = normalizeOffset(data.offset);
	if (normalizedOffset.error) {
		return cb(normalizedOffset);
	}

	const assetUnit = await getAssetUnit(data.asset) || data.asset;
	const holders = await assetService.getAssetHolders(assetUnit, normalizedType.value, normalizedOffset.value);

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
