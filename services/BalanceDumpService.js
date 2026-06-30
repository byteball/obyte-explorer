const db = require('ocore/db');
const conf = require('ocore/conf');

const {
	HOUR_IN_MS,
} = require('../helpers/time');

class BalanceDumpService {
	async start() {
		setTimeout(this.startDump.bind(this), 1000 * 60);
		setInterval(this.startDump.bind(this), conf.balanceDumpIntervalInHours * HOUR_IN_MS);
	}

	async startDump() {
		console.log('balance dump: start', new Date());

		const conn = await db.takeConnectionFromPool();
		conn.query("BEGIN");
		await conn.query("DELETE FROM balances");
		await conn.query("INSERT INTO balances (address, asset, balance) " +
			"SELECT address, IFNULL(asset, 'base') as asset, SUM(amount) AS balance " +
			"FROM outputs JOIN units USING(unit) " +
			"WHERE is_spent=0 AND sequence='good' " +
			"GROUP BY address, asset");
		conn.query("COMMIT");
		conn.release();
		
		console.log('balance dump: done', new Date());
	}
}

module.exports = BalanceDumpService;
