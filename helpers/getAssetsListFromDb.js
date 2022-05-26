const db = require('ocore/db');

async function getAssetsListByNameFromDb() {
	return db.query('SELECT name FROM asset_metadata');
}

module.exports = getAssetsListByNameFromDb;