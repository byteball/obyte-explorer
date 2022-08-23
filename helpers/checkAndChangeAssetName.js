const renameAssetList = {
	MBYTE: "GBYTE",
	KBYTE: "GBYTE",
	byte: "GBYTE",
	bytes: "GBYTE",
	blackbytes: "GBB",
};

function checkAndChangeAssetName(asset) {
	if (renameAssetList[asset]) {
		return renameAssetList[asset];
	}
	
	return asset;
}

module.exports = {
	checkAndChangeAssetName,
}
