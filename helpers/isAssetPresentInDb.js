const db = require('ocore/db');

async function checkIsAssetPresentInDb(asset) {
	const rows = await db.query('SELECT 1 FROM assets WHERE unit = ? LIMIT 1', [asset]);
	
	return !!rows.length;
}

module.exports = checkIsAssetPresentInDb;