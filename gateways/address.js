const addressService = require('../services/address');
const getInvalidAssetResponse = require('../helpers/getInvalidAssetResponse');

function normalizeFilter(data) {
	if (data.asset) {
		if (typeof data.asset !== 'string') {
			return getInvalidAssetResponse();
		}
		return { filter: { asset: data.asset } };
	}

	const filter = data.filter || {};
	if (filter.asset && typeof filter.asset !== 'string') {
		return getInvalidAssetResponse();
	}

	return { filter };
}

async function getAddressData(data, cb) {
	data = data || {};

	const normalized = normalizeFilter(data);
	if (normalized.error) {
		return cb(normalized);
	}

	const {
		objTransactions,
		unspent,
		objBalances,
		objAddressAssets,
		end,
		definition,
		newLastInputsROWID,
		newLastOutputsROWID,
		storage_size,
		objStateVars,
		arrAaResponses,
		arrAasFromTemplate,
		unitAssets,
		baseAaDefinition,
		tpsFeesBalance
	} = await addressService.getAddressInfo(data.address, normalized.filter);

	if (!objTransactions && !definition) {
		return cb({ notFound: true });
	}

	cb({
		address: data.address,
		objTransactions: objTransactions,
		unspent: unspent,
		objBalances: objBalances,
		objAddressAssets: objAddressAssets,
		end: end,
		definition: definition,
		newLastInputsROWID,
		newLastOutputsROWID,
		storage_size: storage_size,
		objStateVars: objStateVars,
		arrAaResponses: arrAaResponses,
		arrAasFromTemplate: arrAasFromTemplate,
		unitAssets,
		...(baseAaDefinition ? { baseAaDefinition } : {}),
		tpsFeesBalance,
		testnet: !!process.env.testnet
	});
}

async function loadNextPageAddressTransactions(data, cb) {
	data = data || {};

	const normalized = normalizeFilter(data);
	if (normalized.error) {
		return cb(normalized);
	}

	const {
		objTransactions,
		newLastInputsROWID,
		newLastOutputsROWID,
		unitAssets,
	} = await addressService.getAddressTransactions(data.address, data.lastInputsROWID, data.lastOutputsROWID, normalized.filter);

	cb({
		address: data.address,
		objTransactions: objTransactions,
		end: objTransactions === null || Object.keys(objTransactions).length < 5,
		newLastInputsROWID,
		newLastOutputsROWID,
		unitAssets,
	});
}

exports.getAddressData = getAddressData;
exports.loadNextPageAddressTransactions = loadNextPageAddressTransactions;
