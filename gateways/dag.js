const units = require("../services/units");

async function getLastUnits(cb) {
	if (!cb) return;
	const lastUnits = await units.getLastUnits();

	cb({
		nodes: lastUnits.nodes,
		edges: lastUnits.edges,
		testnet: !!process.env.testnet
	});
}

async function getUnit(data, cb) {
	if (!cb) return;
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
	if (!cb) return;
	const arrStableUnits = await units.getUnitsThatBecameStable(data.notStable);
	const { nodes, edges } = await units.getUnitsBeforeRowId(data.last, 100);

	cb({
		nodes: nodes,
		edges: edges,
		arrStableUnits
	});
}

async function prevUnits(data, cb) {
	if (!cb) return;
	const arrStableUnits = await units.getUnitsThatBecameStable(data.notStable);

	const { nodes, edges } = await units.getUnitsAfterRowId(data.first, 100);
	
	cb({
		nodes: nodes,
		edges: edges,
		end: nodes.length < 100,
		arrStableUnits
	});
}

async function newUnits(data, cb) {
	if (!cb) return;
	const arrStableUnits = await units.getUnitsThatBecameStable(data.notStable);
	const { nodes, edges } = await units.getUnitsAfterRowId(data.unit, 100);

	cb({
		nodes: nodes,
		edges: edges,
		arrStableUnits: arrStableUnits
	});
}


async function info(unit) {
	const objInfo = await units.getInfoOnUnit(unit);

	if (objInfo) {
		return objInfo;
	}

	return { deleted: true };
}

async function highlightNode(data, cb) {
	if (!cb) cb = () => {
	};
	
	const rows = await units.getRowIdByUnit(data.unit);
	
	if (rows.length) {
		const rowId = rows[0].rowid;
		
		if (rowId > data.first && rowId < data.first + 200) {
			const unitsAfterRowId = await units.getUnitsAfterRowId(data.first, 200);
			
			cb({
				type: 'prevUnits', data: {
					nodes: unitsAfterRowId.nodes,
					edges: unitsAfterRowId.edges,
					end: unitsAfterRowId.nodes.length < 100
				}
			});
			
			return;
		}
		
		if (rowId < data.last && rowId > data.last - 200) {
			const unitsBeforeRowId = await units.getUnitsBeforeRowId(data.last, 200);
			
			cb({
				type: 'nextUnits', data: {
					nodes: unitsBeforeRowId.nodes,
					edges: unitsBeforeRowId.edges
				}
			});
			
			return;
		}
		
		const unitsBeforeRowId = await units.getUnitsBeforeRowId(rowId + 25, 100);
		
		cb({
			type: 'start', data: {
				nodes: unitsBeforeRowId.nodes,
				edges: unitsBeforeRowId.edges,
				testnet: !!process.env.testnet
			}
		});
		
		return;
	}
	
	cb({ type: 'notFound' });
}

exports.getLastUnits = getLastUnits;
exports.getUnit = getUnit;
exports.nextUnits = nextUnits;
exports.prevUnits = prevUnits;
exports.newUnits = newUnits;
exports.info = info;
exports.highlightNode = highlightNode;
