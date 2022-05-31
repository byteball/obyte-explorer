const constants = require('ocore/constants.js');
const ValidationUtils = require('ocore/validation_utils.js');

function checkIsAssetValid(asset) {
	return (asset === 'bytes' || ValidationUtils.isValidBase64(asset, constants.HASH_LENGTH));
}

module.exports = checkIsAssetValid;