const getAAStateVar = require('../helpers/getAAStateVar');

module.exports = async (name) => {
	if (name === 'base') {
		return 'bytes';
	}
	
	const asset = await getAAStateVar('s2a_' + name.toUpperCase());
	if (asset) {
		return asset;
	}
	
	return null;
}

