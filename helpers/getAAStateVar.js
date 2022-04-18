const storage = require('ocore/storage.js');
const conf = require('ocore/conf');

async function getAAStateVar(name) {
	return storage.readAAStateVar(conf.tokenRegistryAA, name);
}

module.exports = getAAStateVar;