const units = require("../services/units");

async function getLastUnit(data, cb) {
	const lastUnits = await units.getLastUnits();

	cb({
		nodes: lastUnits.nodes,
		edges: lastUnits.edges,
		testnet: !!process.env.testnet
	});
}

async function getUnit(data, cb) {
	const rows = await units.getRowIdByUnit(data.unit);

	if (!rows.length) {
		const lastUnits = await units.getLastUnits();

		cb({
			nodes: lastUnits.nodes,
			edges: lastUnits.edges,
			not_found: true,
			testnet: !!process.env.testnet
		});
		return;
	}
	
	const unitsBeforeRowId = await units.getUnitsBeforeRowId(rows[0].rowid + 25, 100);

	cb({
		nodes: unitsBeforeRowId.nodes,
		edges: unitsBeforeRowId.edges,
		testnet: !!process.env.testnet
	})
}

async function nextUnits(data, cb) {
	const arrStableUnits = await units.getUnitsThatBecameStable(data.notStable);
	const unitsBeforeRowId = await units.getUnitsBeforeRowId(data.last, 100);

	cb({
		nodes: unitsBeforeRowId.nodes,
		edges: unitsBeforeRowId.edges,
		arrStableUnits
	});
}

async function prevUnits(data, cb) {
	const arrStableUnits = await units.getUnitsThatBecameStable(data.notStable);

	const unitsAfterRowId = await units.getUnitsAfterRowId(data.first, 100);
	
	cb({
		nodes: unitsAfterRowId.nodes,
		edges: unitsAfterRowId.edges,
		end: nodes.length < 100,
		arrStableUnits
	});
}

async function newUnits(data, cb) {
	const arrStableUnits = await units.getUnitsThatBecameStable(data.notStable);
	const unitsAfterRowId = await units.getUnitsAfterRowId(data.unit, 100);

	cb({
		nodes: unitsAfterRowId.nodes,
		edges: unitsAfterRowId.edges,
		arrStableUnits: arrStableUnits
	});
}


async function info(data, cb) {
	const socket = this;

	const objInfo = await units.getInfoOnUnit(data.unit);

	if (objInfo) {
		cb(objInfo);
		return;
	}

	socket.emit('deleted', data.unit);
}

async function highlightNode(data) {
	const socket = this;
	
	const rows = await units.getRowIdByUnit(data.unit);

	if (rows.length) {
		const rowId = rows[0].rowid;

		if (rowId > data.first && rowId < data.first + 200) {
			const unitsAfterRowId = await units.getUnitsAfterRowId(data.first, 200);

			socket.emit('prev', {
				nodes: unitsAfterRowId.nodes,
				edges: unitsAfterRowId.edges,
				end: unitsAfterRowId.nodes.length < 100
			});

			return;
		}
		
		if (rowId < data.last && rowId > data.last - 200) {
			const unitsBeforeRowId = await units.getUnitsBeforeRowId(data.last, 200);

			socket.emit('next', {
				nodes: unitsBeforeRowId.nodes,
				edges: unitsBeforeRowId.edges
			});

			return;
		}

		const unitsBeforeRowId = await units.getUnitsBeforeRowId(rowId + 25, 100);

		socket.emit('start', {
			nodes: unitsBeforeRowId.nodes,
			edges: unitsBeforeRowId.edges,
			testnet: !!process.env.testnet
		});

		return;
	}

	socket.emit('info');
}

exports.getLastUnit = getLastUnit;
exports.getUnit = getUnit;
exports.nextUnits = nextUnits;
exports.prevUnits = prevUnits;
exports.newUnits = newUnits;
exports.info = info;
exports.highlightNode = highlightNode;
