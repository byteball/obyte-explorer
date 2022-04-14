const db = require('ocore/db');
const conf = require('ocore/conf');

const {
	HOUR_IN_MS,
	timeToHours,
	convertDateToTime
} = require('../helpers/time');

class BalanceDumpService {
	interval;

	async start() {
		const hours = await BalanceDumpService.getTimeBeforeDumpInHours();

		if (hours === 0 || hours >= conf.balanceDumpIntervalInHours) {
			return this.startDump();
		}

		const hoursBeforeDump = conf.balanceDumpIntervalInHours - hours;
		this.interval = setInterval(this.startDump, hoursBeforeDump * HOUR_IN_MS);
	}

	async startDump() {
		if (this.interval) {
			clearInterval(this.interval);
		}
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
		this.interval = setInterval(this.startDump, conf.balanceDumpIntervalInHours * HOUR_IN_MS);
	}

	static async getTimeBeforeDumpInHours() {
		const time = await BalanceDumpService.getTimeBeforeDump();

		return timeToHours(time);
	}

	static async getTimeBeforeDump() {
		const rows = await db.query("SELECT last_update FROM balances LIMIT 0, 1")
		if (!rows.length) {
			return 0;
		}

		const lastTime = convertDateToTime(rows[0].last_update);

		return Date.now() - lastTime;
	}
}

module.exports = BalanceDumpService;
