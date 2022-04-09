const storage = require('ocore/storage.js');

async function getAAStateVars(name) {
	const r = await storage.readAAStateVars("O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ",
		name,
		name,
		2000);

	return r[name];
}

module.exports = async (name) => {
	const asset = await getAAStateVars('s2a_' + name.toUpperCase());

	if (asset) {
		return asset;
	}
	
	return null;
}

