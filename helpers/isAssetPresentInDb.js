const db = require('ocore/db');

async function checkIsAssetPresentInDb(asset) {
	const rows = await db.query('SELECT unit FROM inputs WHERE asset = ? LIMIT 1', [asset]);
	
	return !!rows.length;
}

module.exports = checkIsAssetPresentInDb;