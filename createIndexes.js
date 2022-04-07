const db = require('ocore/db');

async function start(){
	await db.query("CREATE INDEX IF NOT EXISTS unitsByTimestamp ON units(timestamp)");
	console.log('done')
}

start();