const getAAStateVar = require('../helpers/getAAStateVar');

module.exports = async (asset) => {
	const name = await getAAStateVar('a2s_' + asset);
	const desc = await getAAStateVar('current_desc_' + asset);

	if (name && desc) {
		const decimals = await getAAStateVar('decimals_' + desc);
		if (decimals !== undefined) {
			return {name, decimals};
		}
	}
	return null;
}

