const getAAStateVars = require('../helpers/getAAStateVars');

module.exports = async (name) => {
	const asset = await getAAStateVars('s2a_' + name.toUpperCase());

	if (asset) {
		return asset;
	}
	
	return null;
}

