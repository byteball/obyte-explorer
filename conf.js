/*jslint node: true */
"use strict";

exports.port = null;
//exports.myUrl = 'wss://mydomain.com/bb';
exports.bServeAsHub = false;
exports.bLight = false;

exports.webPort = 4000;

exports.storage = 'sqlite';

exports.aaResponsesListed = 10;
exports.aasFromTemplateListed = 50;
exports.balanceDumpIntervalInHours = 12;

exports.CHECK_BALANCES_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

exports.tokenRegistryAA = 'O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ';

exports.selectedLanguage = 'en';
exports.languagesAvailable = {
	en: {name: "English", file: "en"},
	da: {name: "Dansk", file: "explorer_da-DK"},
	zh: {name: "中文", file: "explorer_zh-CN"}
};

exports.initial_witnesses = !process.env.testnet ? [
	'DXYWHSZ72ZDNDZ7WYZXKWBBH425C6WZN',
	'2TO6NYBGX3NF5QS24MQLFR7KXYAMCIE5',
	'FOPUBEUPBC6YLIQDLKL6EW775BMV7YOH',
	'GFK3RDAPQLLNCMQEVGGD2KCPZTLSG3HN',
	'JMFXY26FN76GWJJG7N36UI2LNONOGZJV',
	'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT',
	'4GDZSXHEFVFMHCUCSHZVXBVF5T2LJHMU',
	'JPQKPRI5FMTQRJF4ZZMYZYDQVRD55OTC',
	'APABTE2IBKOIHLS2UNK6SAR4T5WRGH2J',
	'FAB6TH7IRAVHDLK2AAWY5YBE6CEBUACF',
	'TKT4UESIKTTRALRRLWS4SENSTJX6ODCW',
	'UE25S4GRWZOLNXZKY4VWFHNJZWUSYCQC'
]
: [
	'2FF7PSL7FYXVU5UIQHCVDTTPUOOG75GX',
	'2GPBEZTAXKWEXMWCTGZALIZDNWS5B3V7',
	'4H2AMKF6YO2IWJ5MYWJS3N7Y2YU2T4Z5',
	'DFVODTYGTS3ILVOQ5MFKJIERH6LGKELP',
	'ERMF7V2RLCPABMX5AMNGUQBAH4CD5TK4',
	'F4KHJUCLJKY4JV7M5F754LAJX4EB7M4N',
	'IOF6PTBDTLSTBS5NWHUSD7I2NHK3BQ2T',
	'O4K4QILG6VPGTYLRAI2RGYRFJZ7N2Q2O',
	'OPNUXBRSSQQGHKQNEPD2GLWQYEUY5XLD',
	'PA4QK46276MJJD5DBOLIBMYKNNXMUVDP',
	'RJDYXC4YQ4AZKFYTJVCR5GQJF5J6KPRI',
	'WELOXP3EOA75JWNO6S5ZJHOO3EYFKPIR'
];

exports.initial_peers = [
	process.env.testnet ? 'wss://obyte.org/bb-test' : (process.env.devnet ? 'ws://localhost:6611' : 'wss://obyte.org/bb')
];

exports.supportedRegistries = {
	'AM6GTUKENBYA54FYDAKX2VLENFZIMXWG': { 
		name: 'obyte.app', 
		url: 'https://obyte.app/#!/assets/', 
		type: 'unit' 
	},
	'O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ': { 
		name: 'tokens.ooo', 
		url: process.env.testnet ? 'https://testnet.tokens.ooo/' : 'https://tokens.ooo/',
		type: 'symbol' 
	},
};

console.log('finished explorer conf');
