const addressService = require('../services/address');

async function getAddressData(data, cb) {
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
	} = await addressService.getAddressInfo(data.address, data.filter || {});

	if (!objTransactions && !definition) {
		cb(null);
		return;
	}

	cb({
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

async function loadNextPageAddressTransactions(data, cb) {
	const {
		objTransactions,
		newLastInputsROWID,
		newLastOutputsROWID,
		unitAssets,
	} = await addressService.getAddressTransactions(data.address, data.lastInputsROWID, data.lastOutputsROWID, data.filter || {});

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