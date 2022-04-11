const storage = require('ocore/storage.js');
const conf = require('ocore/conf');

async function getAAStateVar(name) {
	const r = await storage.readAAStateVars(conf.tokenRegistryAA,
		name,
		name,
		2000);
	return r[name];
}

module.exports = getAAStateVar;