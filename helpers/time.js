const HOUR_IN_MS = 1000 * 60 * 60;

function timeToHours(time) {
	return Math.floor((time / HOUR_IN_MS));
}

function convertDateToTime(date) {
	date = date.replace(' ', 'T') + 'Z';

	return (new Date(date)).getTime();
}

module.exports = {
	HOUR_IN_MS,
	timeToHours,
	convertDateToTime
}
