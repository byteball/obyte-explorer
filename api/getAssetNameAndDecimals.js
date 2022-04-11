const getAAStateVars = require('../helpers/getAAStateVars');

module.exports = async (asset) => {
	const name = await getAAStateVars('a2s_' + asset);
	const desc = await getAAStateVars('current_desc_' + asset);

	if (name && desc) {
		const decimals = await getAAStateVars('decimals_' + desc);
		if (decimals !== undefined) {
			return {name, decimals};
		}
	}
	return null;
}

