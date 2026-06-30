const db = require('ocore/db');
const conf = require('ocore/conf');

const {
	HOUR_IN_MS,
} = require('../helpers/time');

class BalanceDumpService {
	async start() {
		const runDump = () => {
			this.startDump().catch(err => {
				console.error('balance dump failed', err);
			});
		};

		setTimeout(runDump, 1000 * 60);
		setInterval(runDump, conf.balanceDumpIntervalInHours * HOUR_IN_MS);
	}

	async startDump() {
		console.log('balance dump: start', new Date());

		const conn = await db.takeConnectionFromPool();
		try {
			await conn.query("BEGIN");
			await conn.query("DELETE FROM balances");
			await conn.query("INSERT INTO balances (address, asset, balance) " +
				"SELECT address, IFNULL(asset, 'base') as asset, SUM(amount) AS balance " +
				"FROM outputs JOIN units USING(unit) " +
				"WHERE is_spent=0 AND sequence='good' " +
				"GROUP BY address, asset");
			await conn.query("COMMIT");
		} catch (e) {
			await conn.query("ROLLBACK");
			throw e;
		} finally {
			conn.release();
		}
		
		console.log('balance dump: done', new Date());
	}
}

module.exports = BalanceDumpService;
