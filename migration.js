const db = require('ocore/db');

async function start(){
	await db.query("CREATE INDEX IF NOT EXISTS unitsByTimestamp ON units(timestamp)");
	await db.query("CREATE TABLE IF NOT EXISTS balances (" +
		"address CHAR(32) NOT NULL," +
		"asset CHAR(44) NOT NULL," +
		"balance BIGINT NOT NULL," +
		"last_update timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
		"PRIMARY KEY (address,asset)" +
		")");
	await db.query("CREATE INDEX IF NOT EXISTS balancesByAssetBalances ON balances(asset, balance DESC)");
	console.log('done')
}

start();