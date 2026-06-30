function getInvalidAssetResponse() {
	return {
		error: 'invalid_asset',
		message: 'Invalid asset',
		statusCode: 400,
	};
}

module.exports = getInvalidAssetResponse;
