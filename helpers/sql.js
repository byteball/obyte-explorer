const db = require('ocore/db');

function getStrSqlFilterAssetForTransactions(strFilterAsset) {
	if (typeof strFilterAsset === 'undefined' || strFilterAsset === 'all') {
		return "AND (( inputs.asset IS NULL AND outputs.asset IS NULL ) OR (inputs.asset = outputs.asset))";
	} else if (strFilterAsset === 'bytes') {
		return "AND inputs.asset IS NULL AND outputs.asset IS NULL";
	} else {
		var strEscapedFilterAsset = db.escape(strFilterAsset);
		return "AND inputs.asset = " + strEscapedFilterAsset + " AND outputs.asset = " + strEscapedFilterAsset;
	}
}

function getStrSqlFilterAssetForSingleTypeOfTransactions(strFilterAsset) {
	if (typeof strFilterAsset === 'undefined' || strFilterAsset === 'all') {
		return "";
	} else if (strFilterAsset === 'bytes') {
		return "AND asset IS NULL";
	} else {
		return "AND asset = " + db.escape(strFilterAsset);
	}
}

function getStrSQLFilterForIssuerForUnlimitedCap(issuerForUnlimitedCap) {
	if (issuerForUnlimitedCap) {
		return " AND address != " + db.escape(issuerForUnlimitedCap);
	}

	return "";
}

exports.getStrSqlFilterAssetForTransactions = getStrSqlFilterAssetForTransactions;
exports.getStrSqlFilterAssetForSingleTypeOfTransactions = getStrSqlFilterAssetForSingleTypeOfTransactions;
exports.getStrSQLFilterForIssuerForUnlimitedCap = getStrSQLFilterForIssuerForUnlimitedCap;
