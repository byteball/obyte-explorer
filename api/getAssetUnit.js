const db = require('ocore/db');
const getAAStateVar = require('../helpers/getAAStateVar');

async function getAssetFromDBByName(name) {
	const rows = await db.query("SELECT asset FROM asset_metadata WHERE name = ?", [name]);
	if (rows.length) {
		return rows[0].asset;
	}
	
	return null;
}

module.exports = async (name) => {
	if (name === 'base' || name.toLowerCase() === 'gbyte') {
		return 'bytes';
	}
	
	let asset = await getAssetFromDBByName(name);
	if (asset) {
		return asset;
	}
	
	asset = await getAAStateVar('s2a_' + name);
	if (asset) {
		return asset;
	}
	
	return null;
}

