const wallet = require('ocore/wallet');
const getAAStateVar = require('../helpers/getAAStateVar');

function getNameAndDecimalsFromDBAndHub(asset) {
	return new Promise(resolve => {
		wallet.readAssetMetadata([asset], assocAssetMetadata => {
			if (assocAssetMetadata[asset]) {
				return resolve({ name: assocAssetMetadata[asset].name, decimals: assocAssetMetadata[asset].decimals });
			}
			
			return resolve(null);
		});
	});
}

async function getNameAndDecimalsFromAA(asset) {
	const name = await getAAStateVar('a2s_' + asset);
	const desc = await getAAStateVar('current_desc_' + asset);

	if (name && desc) {
		const decimals = await getAAStateVar('decimals_' + desc);
		if (decimals !== undefined) {
			return { name, decimals };
		}
	}

	return null;
}

module.exports = async (asset) => {
	const nameAndDecimals = await getNameAndDecimalsFromDBAndHub(asset);
	if (nameAndDecimals) {
		return nameAndDecimals;
	}
	
	return getNameAndDecimalsFromAA(asset);
}

