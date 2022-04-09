const db = require('ocore/db.js');
const storage = require('ocore/storage.js');

module.exports = async (asset) => {
	return new Promise((resolve) => {
		storage.readJoint(db, asset, {
			ifFound: (objJoint) => {
				resolve(objJoint);
			},
			ifNotFound: () => {
				resolve(null);	
			}			
		})
	})	
}