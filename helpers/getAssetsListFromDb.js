const db = require('ocore/db');

async function getAssetsListByNameFromDb(searchName) {
	return db.query('SELECT name FROM asset_metadata WHERE name LIKE ?', [`${searchName}%`]);
}

module.exports = getAssetsListByNameFromDb;