const constants = require('ocore/constants.js');
const ValidationUtils = require('ocore/validation_utils.js');

function checkIsUnitValid(asset) {
	return ValidationUtils.isValidBase64(asset, constants.HASH_LENGTH);
}

module.exports = checkIsUnitValid;
