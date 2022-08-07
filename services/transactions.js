const db = require('ocore/db');

async function getSpentOutputs(objTransactions) {
	var arrTransactionsUnits = [], key, key2;
	for (key in objTransactions) {
		if (arrTransactionsUnits.indexOf(objTransactions[key].unit) === -1) arrTransactionsUnits.push(objTransactions[key].unit);
	}
	var n = 0, l = arrTransactionsUnits.length - 1;

	async function setSpentOutputs() {
		const rows = await db.query("SELECT outputs.output_id, outputs.message_index, outputs.output_index, outputs.asset, inputs.unit \n \
		FROM outputs, inputs WHERE outputs.unit = ? AND is_spent = 1 AND inputs.src_unit = outputs.unit \n\
		AND inputs.src_message_index = outputs.message_index AND inputs.src_output_index = outputs.output_index",
			[arrTransactionsUnits[n]]);
		rows.forEach(function(row) {
			key = arrTransactionsUnits[n] + '_' + row.asset;
			key2 = row.output_id + '_' + row.message_index + '_' + row.output_index;
			if (objTransactions[key] && objTransactions[key].to[key2]) {
				objTransactions[key].to[key2].spent = row.unit;
			}
		});
		if (n < l) {
			n++;
			return setSpentOutputs();
		}
		else {
			return objTransactions;
		}
	}

	return setSpentOutputs();
}

async function getAmountForInfoAddress(objTransactions) {
	var arrTransactionsUnits = [], key;
	for (key in objTransactions) {
		if (arrTransactionsUnits.indexOf(objTransactions[key].unit) === -1) arrTransactionsUnits.push(
			objTransactions[key].unit);
	}
	const rowsAmount = await db.query("SELECT inputs.unit, outputs.address, outputs.amount, outputs.asset FROM inputs, outputs \n\
		WHERE inputs.unit IN (?) AND outputs.unit = inputs.src_unit AND outputs.message_index = inputs.src_message_index AND outputs.output_index = inputs.src_output_index",
		[arrTransactionsUnits]);
	const rows = await db.query("SELECT unit, asset, type, serial_number, from_main_chain_index, to_main_chain_index, amount, address \n\
		FROM inputs WHERE unit IN (?) AND (type='issue' OR type='headers_commission' OR type='witnessing')",
		[arrTransactionsUnits]);
	rowsAmount.forEach(function (row) {
		key = row.unit + '_' + row.asset;
		if (objTransactions[key]) objTransactions[key].from.push({
			address: row.address,
			amount: row.amount
		});
	});
	for (let row of rows) {
		if (row.type === 'issue') {
			key = row.unit + '_' + row.asset;
			if (objTransactions[key]) objTransactions[key].from.push({
				issue: true,
				amount: row.amount,
				serial_number: row.serial_number,
				address: row.address
			});
		} else {
			var tableName, commissionType;
			if (row.type === 'headers_commission') {
				tableName = 'headers_commission_outputs';
				commissionType = 'headers';
			} else if (row.type === 'witnessing') {
				tableName = 'witnessing_outputs';
				commissionType = 'witnessing';
			}
			if (tableName) {
				const rowsCommissionOutputs = await db.query("SELECT SUM(amount) AS sum FROM " + tableName + " WHERE address = ? AND main_chain_index >= ? AND main_chain_index <= ? ORDER BY main_chain_index",
					[row.address, row.from_main_chain_index, row.to_main_chain_index]);
				key = row.unit + '_' + row.asset;
				if (objTransactions[key]) objTransactions[key].from.push({
					commissionType: commissionType,
					address: row.address,
					from_mci: row.from_main_chain_index,
					to_mci: row.to_main_chain_index,
					sum: rowsCommissionOutputs[0].sum
				});
			}
		}
	}
	return objTransactions;
}

exports.getSpentOutputs = getSpentOutputs;
exports.getAmountForInfoAddress = getAmountForInfoAddress;