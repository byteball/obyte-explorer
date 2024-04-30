const db = require("ocore/db");

async function fetchData(url) {
	try {
		return await fetch(url, { signal: AbortSignal.timeout(3000) });
	} catch (e) {
		return null;
	}
}

async function getAaDescriptionFromDb(address) {
	return db.query("SELECT description FROM aa_descriptions WHERE address = ?", [address]);
}

async function saveAaDescriptionToDb(address, docUrl = null, description = null) {
	await db.query("INSERT INTO aa_descriptions (address, doc_url, description) VALUES (?, ?, ?)", [address, docUrl, description]);
}

async function fetchAaDescription(address, docUrl) {
	const response = await fetchData(docUrl);

	if (!response) {
		return null;
	}

	try {
		const aaDoc = await response.json();

		return aaDoc.description;
	} catch (e) {
		return null
	}
}

async function getAaDescription(address, definition, baseAA) {
	const descriptionRows = await getAaDescriptionFromDb(address);

	if (descriptionRows.length) {
		return descriptionRows[0].description;
	}

	const docUrl = definition[1].doc_url;

	if (docUrl) {
		const description = await fetchAaDescription(address, docUrl);

		if (description) {
			await saveAaDescriptionToDb(address, docUrl, description);
		}

		return description;
	}

	if (baseAA) {
		const rows = await db.query("SELECT definition FROM aa_addresses WHERE address = ?", [baseAA]);

		const baseAaDefinition = rows[0].definition;

		return getAaDescription(baseAA, baseAaDefinition);
	}

	await saveAaDescriptionToDb(address);

	return null;
}

module.exports = getAaDescription;