const storage = require('ocore/storage.js');

async function getAAStateVars(name) {
	const r = await storage.readAAStateVars("O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ",
		name,
		name,
		2000);
	return r[name];
}

module.exports = async (asset) => {
	const name = await getAAStateVars('a2s_' + asset);
	const desc = await getAAStateVars('current_desc_' + asset);

	if (name && desc) {
		const decimals = await getAAStateVars('decimals_' + desc);
		if (decimals !== undefined) {
			return {name, decimals};
		}
	}
	return null;
}

