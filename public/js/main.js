var _cy;
var nodes, edges;
var firstUnit, lastUnit, phantoms = {}, phantomsTop = {}, notStable = [];
var nextPositionUpdates;
var generateOffset = 0, newOffset = -116, oldOffset;
var activeNode, waitGo;
var notLastUnitUp = false, notLastUnitDown = true;
var lastActiveUnit;
var page, isInit, isStarted = false;
var queueAnimationPanUp = [], animationPlaysPanUp = false;
let testnet = false;
let exchangeRates = {};
let assetNames = [];

function init(_nodes, _edges) {
	nodes = _nodes;
	edges = _edges;
	firstUnit = nodes[0].rowid;
	lastUnit = nodes[nodes.length - 1].rowid;
	phantoms = {};
	phantomsTop = {};
	notStable = [];
	nextPositionUpdates = null;
	generateOffset = 0;
	newOffset = -116;
	notLastUnitUp = false;
	notLastUnitDown = true;
	activeNode = null;
	waitGo = null;
	createCy();
	generate(_nodes, _edges);
	oldOffset = _cy.getElementById(nodes[0].data.unit).position().y + 66;
	_cy.viewport({zoom: 1.01});
	_cy.center(_cy.nodes()[0]);
	page = 'dag';

	var currHash = getUrlHashKey();
	if (currHash && currHash.length == 45) {
		notLastUnitUp = true;
		highlightNode(currHash.substr(1));
	}
	isInit = true;
}

function hideAll() {
	$('#assetInfo').hide();
	$('#addressInfo').hide();
}

function start() {
	var currHash = getUrlHashKey();
	page = 'loading';
	$('.theadForTransactionsList').hide();
	
	if (!isStarted) {
		socket.emit('fetchAssetNamesList');
	}
	
	if (currHash.startsWith('#/asset')) {
		const asset = currHash.slice(8);

		socket.emit('start', {type: 'asset', asset});

		hideAll();
		$('#whiteBlock').show();
		$('.trigger-legend').hide();
		$('#loader').show();
	}
	else if (!currHash || (currHash.length != 45 && currHash.length != 33)) {
		socket.emit('start', {type: 'last'});
	}
	else if (currHash.length == 45) {
		socket.emit('start', {type: 'unit', unit: currHash.substr(1)});
		notLastUnitUp = true;
	}
	else if (currHash.length == 33) {
		var currHashParams = getUrlHashParams();
		var paramAsset = currHashParams.asset;
		socket.emit('start', {
			type: 'address',
			address: currHash.substr(1),
			filter: {
				asset: paramAsset
			}
		});
		hideAll();
		$('#whiteBlock').show();
		$('.trigger-legend').hide();
		$('#loader').show();
	}
}

function createCy() {
	_cy = cytoscape({
		container: document.getElementById('cy'),
		boxSelectionEnabled: false,
		autounselectify: true,
		hideEdgesOnViewport: false,
		layout: {
			name: 'preset'
		},
		style: [
			{
				selector: 'node',
				style: {
					'content': 'data(unit_s)',
					'text-opacity': 1,
					'min-zoomed-font-size': 13,
					'text-valign': 'bottom',
					'text-halign': 'center',
					'font-size': '13px',
					'text-margin-y': '5px',
					'background-color': '#fff',
					'border-width': 1,
					'border-color': '#2980b9',
					//	'border-color': '#333',
					//	'border-style': 'dotted',
					'width': 25,
					'height': 25
				}
			},
			{
				selector: 'node.hover',
				style: {
					'content': 'data(id)',
					'text-opacity': 1,
					'font-weight': 'bold',
					'font-size': '14px',
					'text-background-color': '#fff',
					'text-background-opacity': 1,
					'text-background-shape': 'rectangle',
					'text-border-opacity': 1,
					'text-border-width': 4,
					'text-border-color': '#fff',
					'z-index': 9999
				}
			},
			{
				selector: 'edge',
				style: {
					'width': 2,
					'target-arrow-shape': 'triangle',
					'line-color': '#2980b9',
					'target-arrow-color': '#2980b9',
					'curve-style': 'bezier'
				}
			},
			{
				selector: '.best_parent_unit',
				style: {
					'width': 5,
					'target-arrow-shape': 'triangle',
					'line-color': '#2980b9',
					'target-arrow-color': '#2980b9',
					'curve-style': 'bezier'
				}
			},
			{
				selector: '.is_on_main_chain',
				style: {
					//	'border-width': 4,
					//	'border-style': 'solid',
					//	'border-color': '#2980b9'
					//	'border-color': '#333'
					'background-color': '#9cc0da'
				}
			},
			{
				selector: '.is_stable',
				style: {
					//	'background-color': '#2980b9'
					'border-width': 4,
					'border-style': 'solid',
					'border-color': '#2980b9',
					//	'background-color': '#9cc0da'
				}
			},
			{
				selector: '.active',
				style: {
					//	'background-color': '#2980b9',
					'border-color': '#333',
					'border-width': '4'
				}
			},
			{
				selector: '.finalBad',
				style: {
					'background-color': 'red'
				}
			},
			{
				selector: '.tempBad',
				style: {
					'background-color': 'red'
				}
			}
		],
		elements: {
			nodes: [],
			edges: []
		}
	});

	_cy.on('mouseover', 'node', function() {
		this.addClass('hover');
	});

	_cy.on('mouseout', 'node', function() {
		this.removeClass('hover');
	});

	_cy.on('click', 'node', function(evt) {
		location.hash = '#' + evt.cyTarget.id();
	});

	_cy.on('tap', 'node', function(evt) {
		location.hash = '#' + evt.cyTarget.id();
	});

	_cy.on('pan', function() {
		var ext = _cy.extent();
		if (nextPositionUpdates < ext.y2) {
			getNext();
		}
		else if (notLastUnitUp === true && ext.y2 - (ext.h) < _cy.getElementById(nodes[0].data.unit).position().y) {
			getPrev();
		}
		scroll.scrollTop(convertPosPanToPosScroll());
	});

	$(_cy.container()).on('wheel mousewheel', function(e) {
		var deltaY = e.originalEvent.wheelDeltaY || -e.originalEvent.deltaY;
		if (page == 'dag') {
			e.preventDefault();
			if (deltaY > 0) {
				scrollUp();
			}
			else if (deltaY < 0) {
				_cy.panBy({x: 0, y: -25});
			}
			scroll.scrollTop(convertPosPanToPosScroll());
		}
	});
}

function updListNotStableUnit() {
	if (!_cy) return;
	notStable = [];
	_cy.nodes().forEach(function(node) {
		if (!node.hasClass('is_stable')) {
			notStable.push(node.id());
		}
	});
}

function generate(_nodes, _edges) {
	var newOffset_x, newOffset_y, left = Infinity, right = -Infinity, first = false, generateAdd = [], _node,
		classes = '', pos_iomc;
	var graph = createGraph(_nodes, _edges);
	graph.nodes().forEach(function(unit) {
		_node = graph.node(unit);
		if (_node) {
			if (_node.x < left) left = _node.x;
			if (_node.x > right) right = _node.x;
		}
	});
	graph.nodes().forEach(function(unit) {
		_node = graph.node(unit);
		if (_node) {
			classes = '';
			if (_node.is_on_main_chain) classes += 'is_on_main_chain ';
			if (_node.is_stable) classes += 'is_stable ';
			if (_node.sequence === 'final-bad') classes += 'finalBad';
			if (_node.sequence === 'temp-bad') classes += 'tempBad';
			if (!first) {
				newOffset_x = -_node.x - ((right - left) / 2);
				newOffset_y = generateOffset - _node.y + 66;
				first = true;
			}
			if (phantoms[unit] !== undefined) {
				_cy.remove(_cy.getElementById(unit));
				generateAdd.push({
					group: "nodes",
					data: {id: unit, unit_s: _node.label},
					position: {x: phantoms[unit], y: _node.y + newOffset_y},
					classes: classes
				});
				delete phantoms[unit];
			}
			else {
				pos_iomc = setMaxWidthNodes(_node.x + newOffset_x);
				if (pos_iomc == 0 && _node.is_on_main_chain == 0) {
					pos_iomc += 40;
				}
				generateAdd.push({
					group: "nodes",
					data: {id: unit, unit_s: _node.label},
					position: {x: pos_iomc, y: _node.y + newOffset_y},
					classes: classes
				});
			}
		}
	});
	generateAdd = fixConflicts(generateAdd);
	_cy.add(generateAdd);
	generateOffset = _cy.nodes()[_cy.nodes().length - 1].position().y;
	nextPositionUpdates = generateOffset;
	_cy.add(createEdges());
	updListNotStableUnit();
	updateScrollHeigth();
}


function animationPanUp(distance) {
	if (animationPlaysPanUp) {
		queueAnimationPanUp.push(distance);
	}
	else {
		if (queueAnimationPanUp.length > 1) {
			distance = queueAnimationPanUp.reduce(function(prev, current) {
				return prev + current;
			});
			queueAnimationPanUp = [];
		}
		_cy.stop();
		animationPlaysPanUp = true;
		_cy.animate({
			pan: {
				x: _cy.pan('x'),
				y: _cy.pan('y') + distance
			}
		}, {
			duration: 250,
			complete: function() {
				oldOffset = _cy.getElementById(nodes[0].data.unit).position().y + 66;
				animationPlaysPanUp = false;
				if (queueAnimationPanUp.length) {
					animationPanUp(queueAnimationPanUp[0]);
					queueAnimationPanUp.splice(0, 1);
				}
			}
		});
	}
}

function setNew(_nodes, _edges, newUnits) {
	var newOffset_x, newOffset_y, min = Infinity, max = -Infinity, left = Infinity, right = -Infinity, first = false, x,
		y, generateAdd = [], _node, classes = '', pos_iomc;
	var graph = createGraph(_nodes, _edges);
	graph.nodes().forEach(function(unit) {
		_node = graph.node(unit);
		if (_node) {
			y = _node.y;
			if (y < min) min = y;
			if (y > max) max = y;
			if (_node.x < left) left = _node.x;
			if (_node.x > right) right = _node.x;
		}
	});
	graph.nodes().forEach(function(unit) {
		_node = graph.node(unit);
		if (_node) {
			classes = '';
			if (_node.is_on_main_chain) classes += 'is_on_main_chain ';
			if (_node.is_stable) classes += 'is_stable ';
			if (_node.sequence === 'final-bad') classes += 'finalBad';
			if (_node.sequence === 'temp-bad') classes += 'tempBad';
			if (!first) {
				newOffset_x = -_node.x - ((right - left) / 2);
				newOffset_y = newOffset - (max - min) + 66;
				newOffset -= (max - min) + 66;
				first = true;
				if (newUnits && _cy.extent().y1 < oldOffset) {
					animationPanUp(max + 54);
				}
			}
			if (phantomsTop[unit] !== undefined) {
				_cy.remove(_cy.getElementById(unit));
				generateAdd.push({
					group: "nodes",
					data: {id: unit, unit_s: _node.label},
					position: {x: phantomsTop[unit], y: _node.y + newOffset_y},
					classes: classes
				});
				delete phantomsTop[unit];
			} else {
				pos_iomc = setMaxWidthNodes(_node.x + newOffset_x);
				if (pos_iomc == 0 && _node.is_on_main_chain == 0) {
					pos_iomc += 40;
				}
				generateAdd.push({
					group: "nodes",
					data: {id: unit, unit_s: _node.label},
					position: {x: pos_iomc, y: _node.y + newOffset_y},
					classes: classes
				});
			}
		}
	});
	generateAdd = fixConflicts(generateAdd);
	_cy.add(generateAdd);
	_cy.add(createEdges());
	updListNotStableUnit();
	updateScrollHeigth();
}

function createGraph(_nodes, _edges) {
	var graph = new dagre.graphlib.Graph({
		multigraph: true,
		compound: true
	});
	graph.setGraph({});
	graph.setDefaultEdgeLabel(function() {
		return {};
	});
	_nodes.forEach(function(node) {
		graph.setNode(node.data.unit, {
			label: node.data.unit_s,
			width: 32,
			height: 32,
			is_on_main_chain: node.is_on_main_chain,
			is_stable: node.is_stable,
			sequence: node.sequence
		});
	});
	for (var k in _edges) {
		if (_edges.hasOwnProperty(k)) {
			graph.setEdge(_edges[k].data.source, _edges[k].data.target);
		}
	}
	dagre.layout(graph);
	return graph;
}

function setMaxWidthNodes(x) {
	if (x > 500) {
		return x / (x / 500);
	}
	else if (x < -500) {
		return -((x / (x / 500)));
	}
	else {
		return x;
	}
}

function fixConflicts(arr) {
	var conflicts = {}, a, b, l, l2;
	for (a = 0, l = arr.length; a < l; a++) {
		for (b = 0; b < l; b++) {
			if (a != b && ((arr[a].position.x < arr[b].position.x + 10 && arr[a].position.x > arr[b].position.x - 10) && arr[a].position.y == arr[b].position.y)) {
				if (!conflicts[arr[a].position.y]) conflicts[arr[a].position.y] = [];
				conflicts[arr[a].position.y].push(arr[a]);
			}
		}
	}
	for (var k in conflicts) {
		var offset = 0, units = [];
		for (b = 0, l2 = conflicts[k].length; b < l2; b++) {
			for (a = 0; a < l; a++) {
				if (arr[a].data.id == conflicts[k][b].data.id && units.indexOf(arr[a].data.id) == -1) {
					units.push(arr[a].data.id);
					if (arr[a].position.x < 0) {
						offset -= 60;
					}
					else {
						offset += 60;
					}
					arr[a].position.x += offset;
				}
			}
		}
	}
	return arr;
}

function createEdges() {
	var _edges = cloneObj(edges), cyEdges = _cy.edges(), cyEdgesLength = cyEdges.length, k, out = [], position,
		offset = 0, offsetTop = 0, classes = '';
	for (var a = 0, l = cyEdgesLength; a < l; a++) {
		k = cyEdges[a].source() + '_' + cyEdges[a].target();
		if (_edges[k]) delete _edges[k];
	}
	for (k in phantoms) {
		_cy.getElementById(k).position('y', generateOffset + 166);
	}
	for (k in phantomsTop) {
		_cy.getElementById(k).position('y', newOffset - 166);
	}
	for (k in _edges) {
		if (_edges.hasOwnProperty(k)) {
			classes = '';
			classes += _edges[k].best_parent_unit ? 'best_parent_unit' : '';
			if (_cy.getElementById(_edges[k].data.target).length) {
				out.push({group: "edges", data: _edges[k].data, classes: classes});
			}
			else {
				position = _cy.getElementById(_edges[k].data.source).position();
				phantoms[_edges[k].data.target] = position.x + offset;
				out.push({
					group: "nodes",
					data: {id: _edges[k].data.target, unit_s: _edges[k].data.target.substr(0, 7) + '...'},
					position: {x: position.x + offset, y: generateOffset + 166}
				});
				offset += 60;
				out.push({group: "edges", data: _edges[k].data, classes: classes});
			}
			if (!_cy.getElementById(_edges[k].data.source).length) {
				position = _cy.getElementById(_edges[k].data.target).position();
				phantomsTop[_edges[k].data.source] = position.x + offsetTop;
				out.push({
					group: "nodes",
					data: {id: _edges[k].data.source, unit_s: _edges[k].data.source.substr(0, 7) + '...'},
					position: {x: position.x + offsetTop, y: newOffset - 166}
				});
				offsetTop += 60;
				out.push({group: "edges", data: _edges[k].data, classes: classes});
			}
		}
	}
	return out;
}

function setChangesStableUnits(arrStableUnits) {
	if (!arrStableUnits) return;
	var node;
	arrStableUnits.forEach(function(objUnit) {
		node = _cy.getElementById(objUnit.unit);
		if (node) {
			if (!node.hasClass('is_stable')) node.addClass('is_stable');
			if (objUnit.is_on_main_chain === 1 && !node.hasClass('is_on_main_chain')) {
				node.addClass('is_on_main_chain');
			}
			else if (objUnit.is_on_main_chain === 0 && node.hasClass('is_on_main_chain')) {
				node.removeClass('is_on_main_chain');
			}
		}
		notStable.splice(notStable.indexOf(objUnit.unit), 1);
	});
	updListNotStableUnit();
}

function cloneObj(obj) {
	var out = {};
	for (var k in obj) {
		if (obj.hasOwnProperty(k)) {
			out[k] = obj[k];
		}
	}
	return out;
}

function highlightNode(unit) {
	if (!_cy) createCy();
	if (activeNode) _cy.getElementById(activeNode).removeClass('active');
	var el = _cy.getElementById(unit);
	if (el.length && phantoms[unit] === undefined && phantomsTop[unit] === undefined) {
		var extent = _cy.extent();
		var elPositionY = el.position().y;
		lastActiveUnit = getUrlHashKey().substr(1);
		el.addClass('active');
		activeNode = el.id();
		socket.emit('info', {unit: activeNode});
		if (elPositionY < extent.y1 || elPositionY > extent.y2) {
			bWaitingForPrev = true;
			_cy.stop();
			_cy.animate({
				pan: {x: _cy.pan('x'), y: _cy.getCenterPan(el).y},
				complete: function() {
					bWaitingForPrev = false;
				}
			}, {
				duration: 250
			});
		}
		page = 'dag';
	}
	else {
		waitGo = unit;
		getHighlightNode(waitGo);
	}
	return false;
}

function scrollUp() {
	var ext = _cy.extent();
	if ((notLastUnitUp === false && ext.y2 - (ext.h / 2) > _cy.getElementById(nodes[0].data.unit).position().y + 20) ||
		(notLastUnitUp === true && ext.y2 - (ext.h) > _cy.getElementById(nodes[0].data.unit).position().y)
	) {
		_cy.panBy({x: 0, y: 25});
	}
	else if (notLastUnitUp === true) {
		getPrev();
	}
}

function showHideBlock(event, id) {
	if(event.target.nodeName === 'A') return;
	var block = $('#' + id);
	var target;
	if (event.target.classList.contains('infoTitle')) {
		target = $(event.target);
	}
	else {
		target = $(event.target.parentNode);
	}
	if (block.css('display') === 'none') {
		block.show(250);
		target.removeClass('hideTitle');
	}
	else {
		block.hide(250);
		target.addClass('hideTitle');
	}
}

function searchForm(text) {
	if (!text.length) {
		showInfoMessage($('#infoMessagePleaseEnter').text());
		return;
	}
	
	if (text.length == 44 || text.length == 32) {
		location.hash = text;
		return;
	}

	if (autoCompleteJS.feedback.matches.length) {
		autoCompleteJS.select(0);
		return;
	}

	location.hash = `#/asset/${text}`;

	$('#inputSearch').val('');
}

function goToTop() {
	if (notLastUnitUp) {
		socket.emit('start', {type: 'last'});
	} else {
		var el = _cy.getElementById(nodes[0].data.unit);
		_cy.stop();
		_cy.animate({
			pan: {x: _cy.pan('x'), y: _cy.getCenterPan(el).y}
		}, {
			duration: 400
		});
	}
	location.hash = '';
	if (activeNode) _cy.getElementById(activeNode).removeClass('active');
	if (!$('#info').hasClass('hideInfoBlock')) $('#info').addClass('hideInfoBlock');
	if ($('#cy').hasClass('showInfoBlock')) $('#cy, #scroll').removeClass('showInfoBlock');

	$('#defaultInfo').show();
	$('#listInfo').hide();
}

function prettifyJson(json_object) {
	return htmlEscape(JSON.stringify(json_object, null, '    ').replace(/\\n/g, '\n').replace(/\\t/g, '    ').replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
}

function addLinksToAddresses(text){
	return text
	.replace(/&quot;([A-Z0-9]{32})&quot;/g, function (match, p1) {
		return '&quot;<a href="/#' + p1 + '">' + p1 + '</a>&quot;';
	})
}

//events
window.addEventListener('hashchange', function() {
	var currHash = getUrlHashKey();
	page = 'loading';
	$('.theadForTransactionsList').hide();
	
	if (currHash.startsWith('#/asset')) {
		const asset = currHash.slice(8);

		socket.emit('start', {type: 'asset', asset});

		hideAll();
		$('#whiteBlock').show();
		$('.trigger-legend').hide();
		$('#loader').show();
	}
	else if (currHash.length === 45) {
		highlightNode(currHash.substr(1));
		hideAll();
		$('#whiteBlock').hide();
		$('.trigger-legend').show();
	}
	else if (currHash.length === 33) {
		var currHashParams = getUrlHashParams();
		var paramAsset = currHashParams.asset;
		socket.emit('start', {
			type: 'address',
			address: currHash.substr(1),
			filter: {
				asset: paramAsset,
			},
		});
		hideAll();
		$('#whiteBlock').show();
		$('.trigger-legend').hide();
		$('#loader').show();
	}
});

window.addEventListener('keydown', function(e) {
	if (page == 'dag') {
		if (e.keyCode == 38) {
			e.preventDefault();
			scrollUp();
		}
		else if (e.keyCode == 40) {
			e.preventDefault();
			_cy.panBy({x: 0, y: -25});
		}
	}
}, true);

$(window).scroll(function() {
	if (($(window).scrollTop() + $(window).height()) + 200 >= $(document).height()) {
		if (!nextPageTransactionsEnd) {
			getNextPageTransactions();
		}
	}
});

//websocket
var socket = io.connect(location.href);
var bWaitingForNext = false, bWaitingForNew = false, bHaveDelayedNewRequests = false, bWaitingForPrev = false,
	bWaitingForHighlightNode = false, bWaitingForNextPageTransactions = false;
var nextPageTransactionsEnd = false, lastInputsROWID = 0, lastOutputsROWID = 0;

socket.on('connect', function() {
	start();
});

socket.on('start', function(data) {
	init(data.nodes, data.edges);
	if (data.not_found) showInfoMessage($('#infoMessageUnitNotFound').text());
	notLastUnitDown = true;
	if (bWaitingForHighlightNode) bWaitingForHighlightNode = false;
	testnet = data.testnet;
});

socket.on('next', function(data) {
	if (notLastUnitDown) {
		if (bWaitingForHighlightNode) bWaitingForHighlightNode = false;
		nodes = nodes.concat(data.nodes);
		for (var k in data.edges) {
			if (data.edges.hasOwnProperty(k)) {
				edges[k] = data.edges[k];
			}
		}
		lastUnit = nodes[nodes.length - 1].rowid;
		generate(data.nodes, data.edges);
		bWaitingForNext = false;
		if (waitGo) {
			highlightNode(waitGo);
			waitGo = false;
		}
		if (data.nodes.length === 0) {
			notLastUnitDown = false;
		}
		setChangesStableUnits(data.arrStableUnits);
	}
});

socket.on('prev', function(data) {
	if (bWaitingForHighlightNode) bWaitingForHighlightNode = false;
	if (data.nodes.length) {
		nodes = [].concat(data.nodes, nodes);
		for (var k in data.edges) {
			if (data.edges.hasOwnProperty(k)) {
				edges[k] = data.edges[k];
			}
		}
		firstUnit = data.nodes[0].rowid;
		setNew(data.nodes, data.edges);
	}
	bWaitingForPrev = false;
	if (data.end === true) {
		notLastUnitUp = false;
	}
	if (waitGo) {
		highlightNode(waitGo);
		waitGo = false;
	}
	setChangesStableUnits(data.arrStableUnits);
});

socket.on('deleted', function(unit) { // happens when uncovered non serial units are deleted
	if (!_cy) return;
	var el = _cy.getElementById(unit);
	if (activeNode == el.id())
		activeNode = null;
	nodes = nodes.filter(function(node){
		return node.data.unit != unit;
	});
	for (var k in edges){
	 if(k.indexOf(unit) > -1)
		delete edges[k]
	}
	_cy.remove(el);
	$('#defaultInfo').show();
	$('#listInfo').hide();
	showInfoMessage($('#infoMessageUnitDeleted').text());
});

socket.on('rates_updated', function(data) {
	console.log('rates_updated: ', data);
	exchangeRates = { ...exchangeRates, ...data };
})

socket.on('updateAssetsList', function (data) {
	isStarted = true;	
	assetNames = data.assetNames;
})

const autoCompleteJS = new autoComplete({
	selector: "#inputSearch",
	submit: true,
	data: {
		src: async () => {
			return assetNames;
		},
	},
	resultsList: {
		maxResults: 20
	},
	resultItem: {
		highlight: true
	},
	events: {
		input: {
			selection: (event) => {
				autoCompleteJS.input.value = event.detail.selection.value;

				location.hash = `#/asset/${event.detail.selection.value}`;
			}
		}
	}
});

function generateAaResponsesInfo(aa_responses){
	var html = '', blockId =0 ;
	aa_responses.forEach(function(aa_response){
		html += '<div class="message">';
		html += '<div class="message_app infoTitleChild" onclick="showHideBlock(event, \'aa_response_' + blockId + '\')">'+ $('#from').text()+ ' ' + aa_response.aa_address + '</div></div>';
		html += '<div class="messagesInfo" id="aa_response_' + (blockId) + '">';
		html += '<div><ul><li>'+ $('#aaAdress').text() + ': <a href="#' + aa_response.aa_address + '">' + aa_response.aa_address + '</a></li>';
		html += '<li>'+(aa_response.bounced === 1 ? $('#bounced').text() : $('#notBounced').text()) + '</li>' +
		(aa_response.response ? ('<li>'+ $('#response').text() +' <span class="payload">' + prettifyJson(JSON.parse(aa_response.response)) + '</span></li>') : "") +
		(aa_response.response_unit ? ('<li>'+ $('#responseUnit').text() +': <a href="#' + aa_response.response_unit + '">' + aa_response.response_unit + '</a></li>') : "" )+
		'</ul></div></div>';
		blockId++;
	});
	return html;
}

function getUsdText(byteAmount) {
	if(!exchangeRates['GBYTE_USD']) {
		return '';
	}

	const usdAmount = byteAmount * Number(exchangeRates['GBYTE_USD']) * 1e-9;

	if(usdAmount >= 0.1) {
		return ` ≈ $<span>${usdAmount.toFixed(2)}</span>`;
	}

	return ` ≈ $<span>${usdAmount.toPrecision(2)}</span>`;
}

function getFormattedText(amount, bytePayment, decimals) {
		return '<span class="numberFormat">' + formatAmountUsingDecimalFormat(amount, decimals) + '</span>' +
			(bytePayment ? ` bytes${getUsdText(amount)}` : '');
}

function generatePaymentMessageForTransfersView(messages, outputsUnit, authors){
	let i = 0;
	let html = 
		'<div class="message">' +
		'<div class="message_app infoTitleChild" onclick="showHideBlock(event, \'message_payment\')">Payments</div><div class="messagesInfo" id="message_payment">';
	
	messages.forEach(message => {
		const asset = message.payload.asset || 'null';
		let assetName = message.payload.asset || 'bytes';
		let assetDecimals = 0;
		if(message.payload.assetName) {
			assetName = `<a href="#/asset/${message.payload.assetName}">${message.payload.assetName}</a>`;
			assetDecimals = message.payload.assetDecimals;
		}
		outputsUnit[asset].forEach(output => {
			if (authors.includes(output.address)) {
				return;
			}
			html += '<div class="outputs_div">';
			html += '<div> <a href="#' + output.address + '">' + output.address + '</a><br><span style="">' + 
				getFormattedText(output.amount, asset === 'null', assetDecimals) +
				(asset !== 'null' ? ' ' + assetName : '') +
				'</span></div>';
			html += '</div>';
			i++;
		});
	})
	html += '</div></div>';

	if (!i) return '';
	return html;
}

function generateMessageInfo(messages, transfersInfo, outputsUnit, assocCommissions, is_stable, unit, authors) {
	var messagesOut = '', blockId = 0, key, asset, assetName, assetDecimals, shownHiddenPayments = false;
	if (!localStorage.getItem('UTXO')) {
		const _messages = [];
		messages = messages.filter(message => {
			if(message.app === 'payment') {
				_messages.push(message);
				return false;
			}
			return true;
		});
		messagesOut += generatePaymentMessageForTransfersView(_messages, outputsUnit, authors);
		if (!messages.length && messagesOut === '') {
			messagesOut = '<div class="messagesInfo">none</div>';
		}
	}
	messages.forEach(function(message) {
		if (message.payload) {
			asset = message.payload.asset || 'null';
			assetName = message.payload.asset || 'bytes';
			assetDecimals = 0;
			if(message.payload.assetName) {
				assetName = `<a href="#/asset/${message.payload.assetName}">${message.payload.assetName}</a>`;
				assetDecimals = message.payload.assetDecimals;
			}
			messagesOut +=
				'<div class="message">' +
				'<div class="message_app infoTitleChild" title="' + (asset !== 'null' ? asset : '') + '" onclick="showHideBlock(event, \'message_' + blockId + '\')">';
			switch (message.app) {
				case 'payment':
					messagesOut += $('#appTypePayment').text() + ' (' + assetName + ')';
					break;
				case 'asset':
					messagesOut += $('#appTypeAsset').text();
					break;
				case 'data':
					messagesOut += $('#appTypeData').text();
					break;
				case 'data_feed':
					messagesOut += $('#appTypeDataFeed').text();
					break;
				case 'profile':
					messagesOut += $('#appTypeProfile').text();
					break;
				case 'attestation':
					messagesOut += $('#appTypeAttestation').text();
					break;
				case 'poll':
					messagesOut += $('#appTypePoll').text();
					break;
				case 'vote':
					messagesOut += $('#appTypeVote').text();
					break;
				case 'text':
					messagesOut += $('#appTypeText').text();
					break;
				default:
					messagesOut += message.app.substr(0, 1).toUpperCase() + message.app.substr(1);
					break;
			}
			messagesOut += '</div>' +
				'<div class="messagesInfo" id="message_' + (blockId++) + '">';

			switch (message.app) {
				case 'payment':
					if (message.payload) {
						messagesOut += '<div class="message_inputs"><div class="infoTitleInputs" onclick="showHideBlock(event, \'message_' + blockId + '\')">'+ $('#labelInputs').text() +'</div>' +
							'<div class="inputsInfo" id="message_' + (blockId++) + '">';

						message.payload.inputs.forEach(function(input) {
							if (input.type && input.type == 'issue') {
								messagesOut +=
									'<div class="infoTitleInput" onclick="showHideBlock(event, \'message_' + blockId + '\')">Issue</div>' +
									'<div class="inputInfo" id="message_' + (blockId++) + '">' +
									'<div>Serial number: ' + input.serial_number + '</div>' +
									'<div>Amount: ' + getFormattedText(input.amount, asset === 'null', assetDecimals) + '</div>' +
									'</div>';
							}
							else if (input.output_index !== undefined) {
								key = input.unit + '_' + input.output_index + '_' + (asset);
								messagesOut += '<div>' + getFormattedText(transfersInfo[key].amount, asset === 'null', assetDecimals) + ' from ' +
									'<a href="#' + transfersInfo[key].unit + '">' + transfersInfo[key].unit + '</a></div>';
							} else if (input.type === 'headers_commission' || input.type === 'witnessing') {
								key = input.from_main_chain_index + '_' + input.to_main_chain_index;
								var objName = (input.type === 'headers_commission' ? 'headers' : (input.type === 'witnessing' ? 'witnessing' : false));
								if (objName) {
									messagesOut += '<div>' + getFormattedText(assocCommissions[objName][key].sum, asset === 'null', assetDecimals) + ' of ' + objName + ' commissions on <a href="#' + assocCommissions[objName][key].address + '">' + assocCommissions[objName][key].address + '</a>' +
										' from mci ' + assocCommissions[objName][key].from_mci + ' to mci ' + assocCommissions[objName][key].to_mci + '</div>';
								}
							}
						});

						messagesOut += '</div></div>' +
							'<div class="message_outputs"><div class="infoTitleInputs" onclick="showHideBlock(event, \'message_' + blockId + '\')">'+ $('#labelOutputs').text() +'</div>' +
							'<div class="inputsInf" id="message_' + (blockId++) + '">';

						outputsUnit[asset].forEach(function(output) {
							messagesOut += '<div class="outputs_div">';
							if (output.is_spent) {
								messagesOut += '<div>' + getFormattedText(output.amount, asset === 'null', assetDecimals) + ' to <a href="#' + output.address + '">' + output.address + '</a><br> ' +
									'(spent in <a href="#' + output.spent + '">' + output.spent + '</a>)</div>';
							}
							else {
								messagesOut += '<div>' + getFormattedText(output.amount, asset === 'null', assetDecimals) + ' to <a href="#' + output.address + '">' + output.address + '</a><br> (not spent)</div>';
							}
							messagesOut += '</div>';
						});

						messagesOut += '</div></div>';
					}
					break;
				case 'text':
					// <pre>  is used to display the text with fixed-width font (for example ASCII art)
					messagesOut += '<pre class="payload">' + htmlEscape(message.payload) + '</pre>';
					break;
				case 'definition':
					messagesOut += '<div><label>address:</label> ';
					messagesOut += '<span class="address">';
					messagesOut += is_stable ? '<a href="#' + message.payload.address + '">' + message.payload.address + '</a>' : message.payload.address;
					messagesOut += '</span>';
					messagesOut += '</div>';
					messagesOut += '<div><label>definition:</label> ';
					messagesOut += '<span class="payload">';
					messagesOut +=  prettifyJson(message.payload.definition);
					messagesOut += '</span>';
					messagesOut += '</div>';
					break;
				default:
					for (var key_payload in message.payload) {
						if (typeof message.payload[key_payload] === "object") {
							messagesOut += '<div class="payload"><label>' + htmlEscape(key_payload) + ':</label> ';
							messagesOut += '<span>';
							messagesOut += prettifyJson(message.payload[key_payload]);
							messagesOut += '</span>';
							messagesOut += '</div>';
						} else {
							messagesOut += '<div class="payload"><label>' + htmlEscape(key_payload) + ':</label> ';
							messagesOut += '<span>';
							messagesOut += htmlEscape(message.payload[key_payload]);
							messagesOut += '</span>';
							messagesOut += '</div>';
						}
					}
					if (message.app === 'asset') {
						messagesOut += '<div><a href="#/asset/' + unit + '">Asset info</a></div>';
					}
					break;
			}
			messagesOut += '</div></div>';
		} else if (message.app == 'payment' && message.payload_location == 'none' && !shownHiddenPayments) {
			messagesOut += '<div class="message childNotSpoiler">' + $('#hiddenPayments').text() + '</div>';
			shownHiddenPayments = true;
		}
	});
	return messagesOut;
}

socket.on('info', function(data) {
	if (bWaitingForHighlightNode) bWaitingForHighlightNode = false;
	if (data) {
		var childOut = '', parentOut = '', authorsOut = '', witnessesOut = '';
		data.child.forEach(function(unit) {
			childOut += '<div><a href="#' + unit + '">' + unit + '</a></div>';
		});
		data.parents.forEach(function(unit) {
			parentOut += '<div><a href="#' + unit + '">' + unit + '</a></div>';
		});
		var incAuthors = 0;
		const authors = data.authors.map(author => author.address);
		data.authors.forEach(function(author) {
			authorsOut += '<div><a href="#' + author.address + '">' + author.address + '</a>';
			if (author.definition) {
				authorsOut += '<span class="infoTitle hideTitle" class="definitionTitle" onclick="showHideBlock(event, \'definition' + incAuthors + '\')">'+ $('#labelDefinition').text() +'<div class="infoTitleImg"></div></span>' +
					'<div id="definition' + (incAuthors++) + '" class="payload" style="display: none">' + prettifyJson(JSON.parse(author.definition)) + '</div>';

			}
			authorsOut += '</div>';
		});
		data.witnesses.forEach(function(witness) {
			witnessesOut += '<div><a href="#' + witness + '">' + witness + '</a></div>';
		});

		$('#unit').html(data.unit);
		$('#children').html(childOut);
		$('#parents').html(parentOut);
		$('#authors').html(authorsOut);
		$('#received').html(moment.unix(data.timestamp).format('DD.MM.YYYY HH:mm:ss'));
		if (data.full_node_confirmation_delay){
			$('#confDelayFull').html(moment.duration(data.full_node_confirmation_delay , "seconds").format("h[h] m[m] s[s]"));
			$('#confDelayFullDiv').show();
		} else
			$('#confDelayFullDiv').hide();
		if (data.light_node_confirmation_delay){
			$('#confDelayLight').html(moment.duration(data.light_node_confirmation_delay , "seconds").format("h[h] m[m] s[s]"));
			$('#confDelayLightDiv').show();
		} else
			$('#confDelayLightDiv').hide();

		$('#messages').html(data.sequence === 'final-bad' ? '' : generateMessageInfo(data.messages, data.transfersInfo, data.outputsUnit, data.assocCommissions, data.is_stable, data.unit, authors));

		$('#fees').html(getFormattedText(parseInt(data.headers_commission) + parseInt(data.payload_commission), true) + ' (<span class="numberFormat">' + data.headers_commission + '</span> '+ $('#labelHeaders').text() +', <span class="numberFormat">' + data.payload_commission + '</span> '+ $('#labelPayload').text() +')');
		$('#last_ball_unit').html('<a href="#'+data.last_ball_unit+'">'+data.last_ball_unit+'</a>');
		$('#level').html(data.level);
		$('#witnessed_level').html(data.witnessed_level);
		$('#main_chain_index').html(data.main_chain_index);
		$('#latest_included_mc_index').html(data.latest_included_mc_index);
		$('#is_stable').html(data.is_stable ? $('#statusFinal').text() : $('#statusNotStable').text());
		$('#witnesses').html(witnessesOut);
		if ($('#listInfo').css('display') === 'none') {
			$('#defaultInfo').hide();
			$('#listInfo').show();
		}
		if (data.sequence === 'final-bad') {
			$('#divTitleMessage,#divFees').hide();
		} else {
			$('#divTitleMessage,#divFees').show();
		}
		if (data.arrAaResponses) {
			$('#aaResponses').html(generateAaResponsesInfo(data.arrAaResponses));
			$('#divTitleAaResponse,#aaResponses').show();
		} else {
			$('#divTitleAaResponse,#aaResponses').hide();
		}
		if (data.trigger_unit) {
			$('#triggerUnit').html('<div><a href="#' + data.trigger_unit + '">' + data.trigger_unit + '</a></div>');
			$('#divTitleTriggerUnit,#triggerUnit').show();
		} else {
			$('#divTitleTriggerUnit,#triggerUnit').hide();
		}
		adaptiveShowInfo();
		formatAllNumbers();
	}
	else {
		showInfoMessage($('#infoMessageUnitNotFound').text());
	}
});

socket.on('update', getNew);

function addTransactionInListTransactions(type, transactionsMeta, transaction, i) {
	if (transactionsMeta.length === i + 1) {
		$(type === 'address' ? '#listUnits' :'#listAssetUnits').append(transaction.html);
	} else {
		const beforeBlock = transactionsMeta[i + 1];
		$(`#lt_${beforeBlock.timestamp}_${beforeBlock.rowid}`).before(transaction.html);
	}
}

const assetInfoContent = {
	data: {},
	name: '',
	dollarPrice: null,
	marketCap: null,
	holdersIndex: 0,
	transactionsMeta: [],

	setTitle: function () {
		let nameConditionalBlock = this.data.assetUnit;
		const htmlIfNotNameOrUrl = '<span style="font-weight: normal"> - view <a href="#' + this.data.assetUnit + '">definition</a></span>';
		if (this.data.name) {
			nameConditionalBlock = this.data.name;
			if (this.data.url) {
				nameConditionalBlock += '<span style="font-weight: normal"> - view on <a href="' + this.data.url + '" target="_blank"> ' + this.data.urlName + ' </a></span>';
				nameConditionalBlock += `<span style="font-weight: normal"> and <a href="#${this.data.assetUnit}">definition</a></span>`;
			} else {
				 nameConditionalBlock += htmlIfNotNameOrUrl;
			}
		} else {
			nameConditionalBlock += htmlIfNotNameOrUrl;
		}
		
		if (this.data.assetUnit === 'bytes') {
			nameConditionalBlock = `${this.data.name} <span style="font-weight: normal"> - native asset</span>`;
		}
		
		let resultStr = '<div title="' + this.data.assetUnit + '">'+ nameConditionalBlock + '</div>';

		$('#asset').html(resultStr);
	},

	setStatsInfo: function () {
		if (!this.data.supply) {
			$('#assetData').html('');
			return;
		}
		const supply = formatAmountUsingDecimalFormat(this.data.supply, this.data.decimals);
		let name = this.name;
		if (this.name === 'Bytes') {
			name = 'GBYTE';
		}
		if (this.name === 'GBB') {
			name = 'GBB';
		}
		let resultStr =`<div>Total supply: <span class="numberFormat">${supply}</span> ${name}</div>`;
		
		if (this.dollarPrice !== null) {
			resultStr += `<div>Price: $<span class="numberFormat">${Number(this.dollarPrice.toPrecision(6))}</span></div>`;
			resultStr += `<div>Marketcap: $<span class="numberFormat">${Number(this.marketCap.toFixed(2))}</span></div>`;
		}

		$('#assetData').html(resultStr);
	},
	
	getHTMLCodeForHolders(holders) {
		let listHolders = '';
		const assetName = `<span>${this.name}</span>`;
		
		holders.forEach((row) => {
			this.holdersIndex++;
			const place = `${this.holdersIndex}. `;
			const balance = formatAmountUsingDecimalFormat(row.balance, this.data.decimals);
			listHolders += [
				`<div>${place}`,
				`<a href="#${row.address}">${row.address}</a> `,
				`(<span class="numberFormat">${balance}</span> `,
				`${assetName})`,
				`</div>`
			].join('');
		});
		
		return listHolders;
	},

	setTopAddresses: function () {
		const listHolders = this.getHTMLCodeForHolders(this.data.holders);
		
		$('#topHoldersList').html(listHolders);

		if (listHolders !== '') {
			$('#blockListTopHolders').show();
			return;
		}
		
		$('#blockListTopHolders').hide();
	},

	setTransactions: function () {
		let transactionsList = generateTransactionsList(
			this.data.transactionsData.objTransactions,
			null,
			null,
			this.data.transactionsData.unitAssets);

		if (transactionsList) {
			let html = '';
			transactionsList = transactionsList.sort((a, b) => {
				return b.timestamp - a.timestamp || b.rowid - a.rowid;
			});
			transactionsList.forEach(transaction => {
				html += transaction.html;
				this.transactionsMeta.push({
					timestamp: transaction.timestamp,
					rowid: transaction.rowid,
				})
			});
			$('#listAssetUnits').html(html);
			$('#titleListAssetTransactions').show();
			return;
		}
		
		$('#listAssetUnits').html('');
		$('#titleListAssetTransactions').hide();		
	},

	setAdditionalData: function () {
		lastInputsROWID = this.data.transactionsData.newLastInputsROWID;
		lastOutputsROWID = this.data.transactionsData.newLastOutputsROWID;
		nextPageTransactionsEnd = this.data.end;
	},

	appendAdditionalData: function (data) {
		if (data.transactionsData.newLastInputsROWID) {
			lastInputsROWID = data.transactionsData.newLastInputsROWID;
			lastOutputsROWID = data.transactionsData.newLastOutputsROWID;
		}
		nextPageTransactionsEnd = data.end;
	},
	
	appendTransactions: function (data) {
		this.appendAdditionalData(data);
		const transactionsList = generateTransactionsList(data.transactionsData.objTransactions, null, null, data.transactionsData.unitAssets, true);
		if (transactionsList.length) {
			for (let transaction of transactionsList) {
				for (let i = this.transactionsMeta.length - 1; i >= 0; i--) {
					if (this.transactionsMeta[i].timestamp > transaction.timestamp) {
						addTransactionInListTransactions('asset', this.transactionsMeta, transaction, i);
						this.transactionsMeta.splice(i + 1, 0, transaction);
						break;
					} else if(this.transactionsMeta[i].timestamp === transaction.timestamp) {
						if (this.transactionsMeta[i].rowid > transaction.rowid) {
							addTransactionInListTransactions('asset', this.transactionsMeta, transaction, i);
							this.transactionsMeta.splice(i + 1, 0, transaction);
							break;
						}
					}
				}
			}
			$('.new_transaction').show(1500);
		}
	},

	showInfoAboutPrivateAsset: function (isShow) {
		if (isShow) {
			$("#infoAboutPrivateAsset").show();
		} else {
			$("#infoAboutPrivateAsset").hide();
		}
	},

	setAssetInfoContent: function (data) {
		this.holdersIndex = 0;
		this.dollarPrice = null; 
		this.marketCap = null;
		this.data = data;
		this.name = this.data.name ? this.data.name : this.data.assetUnit;
		
		if (this.data.assetUnit === 'bytes') {
			if (exchangeRates[`GBYTE_USD`]) {
				this.data.supply = this.data.supply / 10 ** 9;
				this.dollarPrice = exchangeRates[`GBYTE_USD`];
				this.marketCap = this.dollarPrice * this.data.supply;
			}
		} else if (this.data.name && this.data.name === 'GBB') {
			if (exchangeRates[`GBB_USD`]) {
				this.data.supply = this.data.cap;
				this.dollarPrice = exchangeRates[`GBB_USD`];
				this.marketCap = this.dollarPrice * (this.data.supply / 10 ** 9);
			}
		} else if (this.data.isPrivate) {
			if (this.data.cap) {
				this.data.supply = this.data.cap;
				if (exchangeRates[`${this.data.assetUnit}_USD`]) {
					this.dollarPrice = exchangeRates[`${this.data.assetUnit}_USD`];
					this.marketCap = this.dollarPrice * this.data.supply;
				}
			}
		} else {
			if (exchangeRates[`${this.data.assetUnit}_USD`]) {
				this.dollarPrice = exchangeRates[`${this.data.assetUnit}_USD`];
				
				if(!this.data.decimals) this.data.decimals = 0;
				
				this.marketCap = this.dollarPrice * (this.data.supply / 10 ** this.data.decimals);
			}
		}
		
		this.setTitle();
		this.setStatsInfo();

		if (this.data.isPrivate) {
			$('#listAssetUnits').html('');
			$('#titleListAssetTransactions').hide();
			$('#blockListTopHolders').hide();
			this.showInfoAboutPrivateAsset(true);
			formatAllNumbers();
			return;
		}

		if (this.data.holders.length) {
			this.setTopAddresses();
			if (this.data.endHolders) {
				$('#showMoreHolders').hide();
			} else {
				$('#showMoreHolders').show();
			}
		}
		
		if (Object.keys(this.data.transactionsData.objTransactions).length) {
			this.setTransactions();
			this.setAdditionalData();
		}
		this.showInfoAboutPrivateAsset(false);
		formatAllNumbers();
	},

	getMoreHolders: function () {
		$('#showMoreHolders').hide();
		const currHash = getUrlHashKey();
		socket.emit('nextPageAssetHolders', {
			asset: currHash.slice(8),
			type: this.data.typeOfHolders,
			offset: this.holdersIndex,
		});
	},
	setMoreHolders: function (holders, end) {
		const listHolders = this.getHTMLCodeForHolders(holders);
		$('#topHoldersList').append(listHolders);

		if (end) {
			$('#showMoreHolders').hide();
		} else {
			$('#showMoreHolders').show();
		}
		formatAllNumbers();
	}
}

function showMoreHolders() {
	assetInfoContent.getMoreHolders();
}

socket.on('assetInfo', (data) => {
	$(window).scrollTop(0);
	$('#loader').hide();
	$(`${pageBlockNames.address.info}`).hide();
	$(`${pageBlockNames.address.blockList}`).hide();
	$('#whiteBlock').hide();
	
	if (data && data.notFound) {
		showInfoMessage($('#infoMessageAssetNotFound').text());
	} else if (data && (data.isPrivate || data.holders.length)) {
		page = 'asset';
		testnet = data.testnet;
		assetInfoContent.setAssetInfoContent(data);

		$('#assetInfo').show();
		$('.trigger-legend').hide();
		formatAllNumbers()
	} else {
		showInfoMessage($('#infoMessageAssetNotFound').text());
	}

	bWaitingForNextPageTransactions = false;
	
	if (!nextPageTransactionsEnd && $('#tableListAssetTransactions').height() < $(window).height()) getNextPageTransactions();
})

socket.on('nextPageAssetHolders', function (data) {
	assetInfoContent.setMoreHolders(data.holders, data.end);
});

socket.on('new', function(data) {
	if (data.nodes.length) {
		nodes = [].concat(data.nodes, nodes);
		for (var k in data.edges) {
			if (data.edges.hasOwnProperty(k)) {
				edges[k] = data.edges[k];
			}
		}
		firstUnit = nodes[0].rowid;
		setNew(data.nodes, data.edges, true);
		if (bHaveDelayedNewRequests) {
			bHaveDelayedNewRequests = false;
			getNew();
		}
		if (data.nodes.length >= 100) {
			notLastUnitUp = true;
		}
	}
	bWaitingForNew = false;
	setChangesStableUnits(data.arrStableUnits);
});

function generateAaResponsesList(arrAaResponses){

	var listAaResponses = '';
	arrAaResponses.forEach(function(aa_response){
		listAaResponses+= '<tr>' +
		'<th class="transactionUnit" colspan="2" align="left">' +
		'<div>'+ $('#triggerUnitID').text() +': <a href="#' + aa_response.trigger_unit + '">' + aa_response.trigger_unit + '</a></div>' +
		'</th><th class="transactionUnit" colspan="1" align="right"><div style="font-weight: normal">' + moment.unix(aa_response.timestamp).format('DD.MM.YYYY HH:mm:ss') + '</div></th>' +
		'</tr>' +
		'<tr><th colspan="3"><div style="margin: 5px"></div></th></tr><tr><td colspan="3"><div>'+
		'<ul>' +
		'<li>'+ $('#triggerAddress').text() +': <a href="#' + aa_response.trigger_address + '">' + aa_response.trigger_address + '</a></li>' +
		'<li>MCI : ' + aa_response.mci + '</li>' +
		'<li>'+(aa_response.bounced === 1 ? $('#bounced').text() : $('#notBounced').text()) + '</li>' +
		(aa_response.response_unit ? ('<li>'+ $('#responseUnit').text() +': <a href="#' + aa_response.response_unit + '">' + aa_response.response_unit + '</a></li>') : "" )+
		(aa_response.response ? ('<li>'+ $('#response').text() +' <span class="payload">' + prettifyJson(JSON.parse(aa_response.response)) + '</span></li>') : "") +
		'</ul></div></td></tr>';
	})
	listAaResponses += '<tr><th colspan="3"><div style="margin: 10px"></div></th></tr>';
 	return	listAaResponses;
}

function generateAasFromTemplateList(arrAasFromTemplate){
	var listAasFromTemplate = "<ul>"
	arrAasFromTemplate.forEach(function(aaFromTemplate){
		listAasFromTemplate+='<li><a href="#' + aaFromTemplate.address + '">' + aaFromTemplate.address + '</a></li>';
	});
	listAasFromTemplate+="</ul>";
	return listAasFromTemplate;
}

function getHTMLBlocksForAddresses(addresses, myAddress) {
	let html = '';
	
	addresses.forEach((address, i) => {
		let addressHTML = `<a href="#${address}">${address}</a>`;
		let color = 'color: #2e81b9;';
		if (address === myAddress) {
			addressHTML = address;
			color = '';
		}
		html += `<div class="trunc" style="max-width: 240px;${color}${i > 0 ? 'margin-top:8px': ''}">
			${addressHTML}
		</div>`;
	});
	
	return html;
}

function getHTMLBlockForAmounts(amounts, assetName) {
	let html = '';
	
	amounts.forEach((amount, i) => {
		html += `<div style="${i > 0 ? 'margin-top:8px': ''}"><span class="numberFormat">${amount}</span> ${assetName}</div>`
	});
	
	return html;
}

function generateTransfersView(objTransactions, address, filter, unitAssets, isNew) {
	filter = filter || {};
	const listTransactions = [];
	const filterAssetKey = filter.asset;
	let transaction;

	for(let key in unitAssets) {
		const unit = key.split('_')[0];
		const timestamp = parseInt(key.split('_')[1]);
		const rowid = parseInt(key.split('_')[2]);
		const date = moment.unix(timestamp).format('DD.MM.YYYY HH:mm:ss');
		
		let html = '';
		unitAssets[key]
		.filter(asset => {
			const transactionKey = `${unit}_${asset}`;
			transaction = objTransactions[transactionKey];
			if (!transaction) {
				return false;
			}
			
			const transactionAssetKey = transaction.asset || 'bytes';
			if (filterAssetKey && filterAssetKey !== 'all' && transactionAssetKey !== filterAssetKey) {
				return false;
			}
			
			return true;
		})
		.forEach((asset, index, arr) => {
			const transactionKey = `${unit}_${asset}`;
			transaction = objTransactions[transactionKey];
			const transactionAssetKey = transaction.asset || 'bytes';
			let assetName = transactionAssetKey;

			if (transactionAssetKey === 'bytes') {
				transaction.assetName = 'GBYTE';
				transaction.assetDecimals = 9;
			}
			
			if (transaction.assetName) {
				assetName = transaction.assetName;
			}
			
			if (address) {
				assetName = `<a class="trunc" href="#/asset/${assetName}">${assetName}</a>`;
			}

			const id = index === 0 ? 'lt_' + timestamp + '_' + rowid : 'lt_' + timestamp + '_' + rowid + '_' + index;
			const lUnit = index === 0 ? `<a class="trunc" href="#${unit}">${unit}</a>` : '';
			const lDate = index === 0 ? date : '';
			const isLastUnit = arr.length - 1 === index;
			const assetDecimals = transaction.assetDecimals;
			const fromAddresses = [...new Set(transaction.from.map(t => t.address))];
			let to = Object.values(transaction.to).filter(t => !fromAddresses.includes(t.address));
			let toAddresses = {};
			if (to.length) {
				to.forEach(v => {
					if (!toAddresses[v.address]) {
						toAddresses[v.address] = 0;
					}
					toAddresses[v.address] += v.amount;
				});
				for (let key in toAddresses) {
					toAddresses[key] = formatAmountUsingDecimalFormat(toAddresses[key], assetDecimals)
				}
			} else {
				if (asset === null && unitAssets[key].length > 1) {
					html += `<tr id="${id}" class="${(isNew ? 'new_transaction' : '')}" style="${isLastUnit ? 'border-bottom: 1px solid #ccc' : ''}"><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
					return; 
				}
				toAddresses[fromAddresses[0]] = 0;
			}
			let type = '<span style="color: #f34a4a">out</span>';
			if (address && !fromAddresses.includes(address)) {
				type = '<span style="color: #50d046">in</span>';
			}
			
			
			html += `<tr id="${id}" class="${(isNew ? 'new_transaction' : '')}" style="${isLastUnit ? 'border-bottom: 1px solid #ccc' : ''}">`;
			html += `<td class="td_in_table">
				<div class="trunc" style="max-width: 240px; color: #2e81b9" title="${unit}">${lUnit}</div>
			</td>`;
			html += `<td class="td_in_table" style="width: 180px;text-align: center"><div>${lDate}</div></td>`
			html += `<td class="td_in_table">
				<div>
					${getHTMLBlocksForAddresses(fromAddresses, address)}
				</div>
			</td>`;
			html += address ? `<td class="td_in_table" style="width: 40px"><div>${type}</div></td>` : '';
			html += `<td class="td_in_table">
				<div>
					${getHTMLBlocksForAddresses(Object.keys(toAddresses), address)}
				</div>
			</td>`
			html += `<td class="td_in_table" style="max-width: 250px"><div>${getHTMLBlockForAmounts(Object.values(toAddresses), assetName)}</div></td>`
			html += '</tr>';
		});
		listTransactions.push({
			timestamp,
			rowid,
			html
		});
	}
	return listTransactions;
}

function setCSSForTransfersView() {
	$('.transactionListType').val('transfers_view');
	$('.theadForTransactionsList').show();
	$('#blockListUnspent').hide();
	$('.tableForTransactions').css('min-width', '1200px');
}

function setCSSForUTXOView() {
	$('.transactionListType').val('UTXO');
	$('.theadForTransactionsList').hide();
	$('#blockListUnspent').show();
	$('.tableForTransactions').css('min-width', '');
}

function generateTransactionsList(objTransactions, address, filter, unitAssets, isNew) {
	if (!localStorage.getItem('UTXO')) {
		setCSSForTransfersView();
		return generateTransfersView(objTransactions, address, filter, unitAssets, isNew);
	}
	setCSSForUTXOView();
	filter = filter || {};
	var transaction, addressOut, _addressTo, listTransactions = [];
	var filterAssetKey = filter.asset;

	for(let key in unitAssets) {
		const unit = key.split('_')[0];
		const timestamp = parseInt(key.split('_')[1]);
		const rowid = parseInt(key.split('_')[2]);
		
		let html = '';
		
		html += '<tr id="lt_'+ timestamp +'_'+ rowid +'" class="'+ (isNew ? 'new_transaction' : '') +'">' +
			'<th class="transactionUnit" colspan="2" align="left">' +
			'<div>'+ $('#unitID').text() +' <a href="#' + unit + '">' + unit + '</a></div>' +
			'</th><th class="transactionUnit" colspan="1" align="right"><div style="font-weight: normal">' + moment.unix(timestamp).format('DD.MM.YYYY HH:mm:ss') + '</div></th>' +
			'</tr>' +
			'<tr><th colspan="3"><div style="margin: 5px"></div></th></tr>';

		unitAssets[key].forEach(asset => {
			html += '<tr class="utxo '+ (isNew ? 'new_transaction' : '') +'"><td>';
				
			const key = `${unit}_${asset}`;
			transaction = objTransactions[key];
			if (!transaction) return;
			const transactionAssetKey = transaction.asset || 'bytes';
			let assetName = transactionAssetKey;

			if (filterAssetKey && filterAssetKey !== 'all' && transactionAssetKey !== filterAssetKey) {
				return;
			}
			
			if (transaction.assetName) {
				assetName = `<a href="#/asset/${transaction.assetName}">${transaction.assetName}</a>`;
			}
			
			const assetDecimals = transaction.assetDecimals;

			transaction.from.forEach(function(objFrom) {	
				const amount = formatAmountUsingDecimalFormat(objFrom.amount, assetDecimals);
				var addressOut = objFrom.address == address  && page === 'address' ? '<span class="thisAddress">' + objFrom.address + '</span>' : '<a href="#' + objFrom.address + '">' + objFrom.address + '</a>';
				if (objFrom.issue) {
					html += '<div class="transactionUnitListAddress">' +
						'<div>' + addressOut + '</div>' +
						'<div>Issue <span class="numberFormat">' + amount + '</span> <span class="unit">' + assetName + '</span></div>' +
						'<div>serial number: ' + objFrom.serial_number + '</div></div>';
				} else if (objFrom.commissionType && (objFrom.commissionType === 'headers' || objFrom.commissionType === 'witnessing')) {
					var commissionName = (objFrom.commissionType === 'headers' ? 'headers' : (objFrom.commissionType === 'witnessing' ? 'witnessing' : false));
					if (commissionName) {
						html += '<div class="transactionUnitListAddress">' +
							'<div>' + addressOut + ' ' + commissionName + ' commissions from mci ' + objFrom.from_mci +
							' to mci ' + objFrom.to_mci + '.' +
							' Sum: <span class="numberFormat">' + objFrom.sum + '</span> bytes</div>' +
							'</div>';
					}
				} else {					
					html += '<div class="transactionUnitListAddress"><div>' + addressOut + '</div>' +
						'<div>(<span class="numberFormat">' + amount + '</span> ' + assetName + ')</div></div>';
				}
			});
			
			html += '</td><td><img width="32" src="' + (transaction.spent ? '/img/red_right2.png' : '/img/green_right2.png') + '"></td><td>';
			
			for (var k in transaction.to) {
				_addressTo = transaction.to[k];
				const amount = formatAmountUsingDecimalFormat(_addressTo.amount, assetDecimals);

				addressOut = _addressTo.address == address && page === 'address' ? '<span class="thisAddress">' + _addressTo.address + '</span>' : '<a href="#' + _addressTo.address + '">' + _addressTo.address + '</a>';

				html += '<div class="transactionUnitListAddress"><div>' + addressOut + '</div>' +
					'<div>(<span class="numberFormat">' + amount + '</span> <span class="unit">' + assetName + '</span>, ' +
					(_addressTo.spent === 0 ? 'not spent' : 'spent in ' + '<a href="#' + _addressTo.spent + '">' + _addressTo.spent + '</a>') +
					')</div></div>';
			}

			html += '</td></tr><tr><th colspan="3"><div style="margin: 10px"></div></th></tr>'
		});
		listTransactions.push({
			timestamp,
			rowid,
			html
		});
	}
	
	return listTransactions;
}

function parseJSONForStateVars(obj) {
	const v = JSON.parse(obj);
	if (!v || typeof v !== 'object') {
		throw new Error('is not json');
	}
	
	return v;
}

var addressInfoContent = {
	currAddress: null,
	currAssetKey: null,
	transactionsMeta: [],
	
	setAddress: function (data) {
		this.currAddress = data.address;

		$('#address').html(data.address);
	},
	setBalance: function (data) {
		var objBalances = data.objBalances;
		var resultStr = '';

		for (var assetKey in objBalances) {
			var objBalance = objBalances[assetKey];
			if (assetKey === 'bytes') {
				resultStr += '<div><span class="numberFormat">' + objBalance.balance + '</span> bytes</div>';
			}
			else {
				if (objBalance.assetName) {
					const balance = formatAmountUsingDecimalFormat(objBalance.balance, objBalance.assetDecimals);
					resultStr += '<div title="' + assetKey + '"><span class="numberFormat">' + balance + '</span> <a href="#/asset/' + objBalance.assetName + '">' + objBalance.assetName + '</a></div>';
				} else {
					resultStr += '<div><span class="numberFormat">' + objBalance.balance + '</span> of <a href="#/asset/' + assetKey + '">' + assetKey + '</a></div>';
				}
			}
		}

		$('#balance').html(resultStr);
	},
	changeAsset: function (newAssetKey) {
		updateUrlHashWithParams({asset: newAssetKey});
	},
	setAssets: function (data) {
		var objBalances = data.objBalances;
		var assetsOptions = '<option value="all" ' + (this.currAssetKey==='all' ? 'selected' : '') + '>'+ $('#labelAll').text() +'</option>';

		for (var assetKey in objBalances) {
			const assetName = objBalances[assetKey].assetName ? objBalances[assetKey].assetName : assetKey;
			assetsOptions += [
				'<option value="' + assetKey + '" ' + (assetKey === this.currAssetKey ? 'selected' : '') + '>',
				assetName,
				'</option>'
			].join('');
		}

		$('#filterAddressAssets').html(assetsOptions);
		$('#addressAssets').show();
	},
	setDefinition: function (data) {
		if (data.definition) {
			$('#definitionTitleInAddress').show();
			$('#definition').html('<div class="payload">' + addLinksToAddresses(prettifyJson(JSON.parse(data.definition))) + '</div>');
		} else {
			$('#definition').hide();
			if (!$('#definitionTitleInAddress').hasClass('hideTitle')) {
				$('#definitionTitleInAddress').addClass('hideTitle');
			}
			$('#definitionTitleInAddress').hide();
		}
	},
	setStateVars: function (data) {
		if (data.objStateVars) {
			var max_displayed = 30;
			$('#stateVarsTitleInAddress').show();
			if (Object.keys(data.objStateVars).length > max_displayed)
				$('#stateVarsFilterInputDiv').show();
			else
				$('#stateVarsFilterInputDiv').hide();

			$('#stateVarsFilterInput').on('input',function(e){
				filterAndRefresh()
			});

			filterAndRefresh();
			$('#stateVarsstorageSize').html($('#storageSize').text() + ": " + data.storage_size + " bytes");

			function filterAndRefresh(){
				var html = "<ul>", count = 0;
				for (var key in data.objStateVars){
					if (count === max_displayed)
						break;
					if (!$('#stateVarsFilterInput').val()
						|| key.includes($('#stateVarsFilterInput').val())
						|| String(data.objStateVars[key]).includes($('#stateVarsFilterInput').val())
					) {
						let stateVars;
						try {
							stateVars = "<div><span class='payload'>" + 
								prettifyJson(parseJSONForStateVars(data.objStateVars[key])) + 
								"</span></div>";
						} catch(e) {
							stateVars = htmlEscape(data.objStateVars[key]);
						}
						
						html+="<li>" + htmlEscape(key) + ": " + stateVars + "</li>" ;
						count++;
					}
				}
				html+="</ul>";
				$('#stateVars').html(html);
			}

		} else {
			$('#stateVarsDiv').hide();
			if (!$('#stateVarsTitleInAddress').hasClass('hideTitle')) {
				$('#stateVarsTitleInAddress').addClass('hideTitle');
			}
			$('#stateVarsTitleInAddress').hide();
		}
	},
	setAaResponses: function (data) {
		if (data.arrAaResponses) {
			$('#aaResponsesTitleInAddress').show();
			$('#lastAaResponses').html(generateAaResponsesList(data.arrAaResponses));
		} else {
			$('#lastAaResponses').hide();
			if (!$('#aaResponsesTitleInAddress').hasClass('hideTitle')) {
				$('#aaResponsesTitleInAddress').addClass('hideTitle');
			}
			$('#aaResponsesTitleInAddress').hide();
		}
	},
	setAasFromTemplate: function (data) {
		if (data.arrAasFromTemplate) {
			$('#aasFromTemplateTitleInAddress').show();
			$('#aasFromTemplate').html(generateAasFromTemplateList(data.arrAasFromTemplate));
		} else {
			$('#aasFromTemplate').hide();
			if (!$('#aasFromTemplateTitleInAddress').hasClass('hideTitle')) {
				$('#aasFromTemplateTitleInAddress').addClass('hideTitle');
			}
			$('#aasFromTemplateTitleInAddress').hide();
		}
	},
	setUnspent: function (data) {
		var currAssetKey = this.currAssetKey;
		var listUnspent = '';

		if(data.unspent) {
			data.unspent.forEach(function (row) {
				var rowAssetKey = row.asset || 'bytes';
				if (currAssetKey !== 'all' && rowAssetKey !== currAssetKey) {
					return;
				}

				const amount = formatAmountUsingDecimalFormat(row.amount, row.assetDecimals);
				let assetName = row.asset == null ? 'bytes' : row.asset;
				if(row.assetName) {
					assetName = `<a href="#/asset/${row.assetName}">${row.assetName}</a>`;
				}

				listUnspent += [
					'<div>',
					'<a href="#' + row.unit + '">' + row.unit + '</a> ',
					'(<span class="numberFormat">' + amount + '</span> ',
					assetName + ')',
					'</div>'
				].join('');
			});
		}

		$('#listUnspent').html(listUnspent);

		if (listUnspent !== '') {
			$('#blockListUnspent').show();
		} else {
			$('#blockListUnspent').hide();
		}
	},
	setTransactions: function (data) {
		var transactionsList = generateTransactionsList(data.objTransactions, data.address, {
			asset: this.currAssetKey,
		}, data.unitAssets);
		if (transactionsList) {
			let html = '';
			transactionsList = transactionsList.sort((a, b) => {
				return b.timestamp - a.timestamp || b.rowid - a.rowid;
			});
			transactionsList.forEach(transaction => {
				html += transaction.html;
				this.transactionsMeta.push({
					timestamp: transaction.timestamp,
					rowid: transaction.rowid,
				})
			});
			$('#listUnits').html(html);
			$('#titleListTransactions').show();
		} else {
			$('#listUnits').html('');
			$('#titleListTransactions').hide();
		}
	},
	setAdditionalData: function (data) {
		lastInputsROWID = data.newLastInputsROWID;
		lastOutputsROWID = data.newLastOutputsROWID;
		nextPageTransactionsEnd = data.end;
	},
	appendTransactions: function (data) {
		this.appendAdditionalData(data);
		var transactionsList = generateTransactionsList(data.objTransactions, data.address, {
			asset: this.currAssetKey,
		}, data.unitAssets, true);
		if (transactionsList) {
			if (transactionsList.length) {
				for (let transaction of transactionsList) {
					for (let i = this.transactionsMeta.length - 1; i >= 0; i--) {
						if (this.transactionsMeta[i].timestamp > transaction.timestamp) {
							addTransactionInListTransactions('address', this.transactionsMeta, transaction, i);
							this.transactionsMeta.splice(i + 1, 0, transaction);
							break;
						} else if(this.transactionsMeta[i].timestamp === transaction.timestamp) {
							if (this.transactionsMeta[i].rowid > transaction.rowid) {
								addTransactionInListTransactions('address', this.transactionsMeta, transaction, i);
								this.transactionsMeta.splice(i + 1, 0, transaction);
								break;
							}
						}
					}
				}
				$('.new_transaction').show(1500);
			}
		}
	},
	appendAdditionalData: function (data) {
		if (data.newLastOutputsROWID && data.newLastOutputsROWID) {
			lastInputsROWID = data.newLastInputsROWID;
			lastOutputsROWID = data.newLastOutputsROWID;
		}
		nextPageTransactionsEnd = data.end;
	},
	setNew: function (assetKey, data) {
		this.currAssetKey = assetKey;
		this.setAddress(data);
		this.setBalance(data);
		this.setDefinition(data);
		this.setStateVars(data);
		this.setAaResponses(data);
		this.setAasFromTemplate(data);
		this.setAssets(data);
		this.setAdditionalData(data);
		this.setUnspent(data);
		this.setTransactions(data);
	}
};

function changeAsset(sel) {
	addressInfoContent.changeAsset(sel.value);
}

socket.on('addressInfo', function(data) {
	$(window).scrollTop(0);
	$('#loader').hide();
	$(`${pageBlockNames.asset.info}`).hide();
	$(`${pageBlockNames.asset.blockList}`).hide();
	$('#whiteBlock').hide();
		
	if (data) {
		page = 'address';
		testnet = data.testnet;
		var currHashParams = getUrlHashParams();
		var currAssetKey = currHashParams.asset || 'all';
		addressInfoContent.setNew(currAssetKey, data);

		$('#addressInfo').show();
		$('.trigger-legend').hide();
		formatAllNumbers()
	}
	else {
		showInfoMessage($('#infoMessageAddressNotFound').text());
	}
	bWaitingForNextPageTransactions = false;
	if (!nextPageTransactionsEnd && $('#tableListTransactions').height() < $(window).height()) getNextPageTransactions();
});

socket.on('nextPageTransactions', function(data) {
	if (data) {
		if (page !== 'address' && page !== 'asset') return;
		
		const infoContent = page === 'address' ? addressInfoContent : assetInfoContent;
		
		infoContent.appendTransactions(data);
		formatAllNumbers();
	}
	
	bWaitingForNextPageTransactions = false;
	
	if (!nextPageTransactionsEnd) {
		if (
			(page === 'address' && $('#tableListTransactions').height() < $(window).height()) || 
			(page === 'asset' && $('#tableListAssetTransactions').height() < $(window).height())
		) {
			getNextPageTransactions();
		}
	}
});

function getNew() {
	if (notLastUnitUp) return;

	if (!bWaitingForNew) {
		socket.emit('new', {unit: firstUnit, notStable: notStable});
		bWaitingForNew = true;
	}
	else {
		bHaveDelayedNewRequests = true;
	}
}

function getNext() {
	if (!bWaitingForNext && isInit) {
		socket.emit('next', {last: lastUnit, notStable: notStable});
		bWaitingForNext = true;
	}
}

function getPrev() {
	if (!bWaitingForPrev && isInit) {
		socket.emit('prev', {first: firstUnit, notStable: notStable});
		bWaitingForPrev = true;
	}
}

function getHighlightNode(unit) {
	if (!bWaitingForHighlightNode) {
		socket.emit('highlightNode', {first: firstUnit, last: lastUnit, unit: unit});
		bWaitingForHighlightNode = true;
	}
}

function getNextPageTransactions() {
	var currHash = getUrlHashKey();
	if (!bWaitingForNextPageTransactions) {
		var currHashParams = getUrlHashParams();
		var paramAsset = currHashParams.asset;
		
		if (page === 'address') {
			socket.emit('nextPageTransactions', {
				address: currHash.substr(1),
				lastInputsROWID,
				lastOutputsROWID,
				filter: {
					asset: paramAsset,
				},
			});
			bWaitingForNextPageTransactions = true;
		} else if (page === 'asset') {
			socket.emit('nextPageAssetTransactions', {
				asset: currHash.slice(8),
				lastInputsROWID,
				lastOutputsROWID,
			});
			bWaitingForNextPageTransactions = true;
		}
	}
}

//adaptive
function adaptiveShowInfo() {
	$('#cy, #scroll, #goToTop, .trigger-legend').addClass('showInfoBlock');
	$('#info').removeClass('hideInfoBlock');
}

function closeInfo() {
	$('#info').addClass('hideInfoBlock');
	$('#cy, #scroll, #goToTop, .trigger-legend').removeClass('showInfoBlock');
}


const pageBlockNames = {
	address: {
		blockList: '#blockListUnspent',
		info: '#addressInfo',
		transactions: '#tableListTransactions'
	},
	asset: {
		blockList: '#blockListTopHolders',
		info: '#assetInfo',
		transactions: '#tableListAssetTransactions'
	}
}

function closePage(currentPage) {
	$(`${pageBlockNames[currentPage].info}`).hide();
	$(`${pageBlockNames[currentPage].blockList}`).hide();
	$('#whiteBlock').hide();
	
	$('.trigger-legend').show();
	
	if (!_cy || !lastActiveUnit) {
		$('#cy, #scroll, #goToTop').show();
		socket.emit('start', {type: 'last'});
		location.hash = '';
	} else {
		location.hash = lastActiveUnit;
	}
	
	page = 'dag';
}


//infoMessage
var timerInfoMessage;

function showInfoMessage(text, timeMs) {
	if (!timeMs) timeMs = 3000;
	if (timerInfoMessage) clearTimeout(timerInfoMessage);

	$('#infoMessage').html(text).show(350);
	timerInfoMessage = setTimeout(function() {
		$('#infoMessage').hide(350).html('');
	}, timeMs);
}

function hideInfoMessage() {
	if (timerInfoMessage) clearTimeout(timerInfoMessage);
	$('#infoMessage').hide(350).html('');
}


//scroll
var scroll = $('#scroll');
var scrollTopPos = 0, scrollLowPos;

function updateScrollHeigth() {
	var unitTopPos = _cy.getCenterPan(_cy.getElementById(nodes[0].data.unit)).y;
	var unitLowPos = _cy.getCenterPan(_cy.getElementById(nodes[nodes.length - 1].data.unit)).y;
	scrollTopPos = convertPosPanToPosScroll(unitTopPos, 0);
	scrollLowPos = convertPosPanToPosScroll(unitLowPos) + (scroll.height()) + 116;
	$('#scrollBody').height(convertPosPanToPosScroll(unitLowPos - unitTopPos, 0) + (scroll.height() / 2));
	setTimeout(function() {
		scroll.scrollTop(convertPosPanToPosScroll());
	}, 1);
}

scroll.scroll(function(e) {
	e.preventDefault();
	_cy.pan('y', convertPosScrollToPosPan());
});

$(window).resize(function() {
	if (_cy) scroll.scrollTop(convertPosPanToPosScroll());
});

function convertPosScrollToPosPan(posTop) {
	if (!posTop) posTop = scroll.scrollTop();
	return ((scroll.height() / 2) - scrollTopPos) - posTop;
}

function convertPosPanToPosScroll(posY, topPos) {
	if (!posY) posY = _cy.pan('y');
	if (topPos === undefined) topPos = scrollTopPos;
	return ((scroll.height() / 2) - topPos) - posY;
}

//Numbers
function formatAmountUsingDecimalFormat(amount, decimal) {
	if (decimal) {
		return amount / (10 ** decimal);
	} else {
		return amount;
	}
}

function numberFormat(number) {
	var decimal = '';
	if (number.includes('.')) {
		var s = number.split('.');
		number = s[0];
		decimal = '.' + s[1];
	}
	return (number.replace(new RegExp("^(\\d{" + (number.length % 3 ? number.length % 3 : 0) + "})(\\d{3})", "g"), "$1 $2")
		.replace(/(\d{3})+?/gi, "$1 ").trim()
		.replace(/\s/gi, ",")) + decimal;
}

function formatAllNumbers() {
	var numbersSpan = $('.numberFormat').not('.format');
	$.each(numbersSpan, function(a, v) {
		$(numbersSpan[a]).addClass('format').html(numberFormat(v.innerHTML));
	})
}

$(document).on('mousedown', '.numberFormat', function(e) {
	var self = $(this);
	if (self.hasClass('format')) {
		self.html(self.html().replace(/\,/g, '')).removeClass('format');
	}
});
$(document).on('touchstart', '.numberFormat', function() {
	var self = $(this);
	if (self.hasClass('format')) {
		self.html(self.html().replace(/\,/g, '')).removeClass('format');
	}
});
$(document).on('mouseout', '.numberFormat', function() {
	var self = $(this);
	if (!self.hasClass('format')) {
		self.addClass('format');
		setTimeout(function() {
			self.html(numberFormat(self.html()));
		}, 250);
	}
});


//escape
function htmlEscape(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

//Url hash history
function getUrlHashKey() {
	var currHash = window.location.hash;
	var currHashPrefix = '';
	if (currHash) {
		var currHashParts = currHash.split('?');
		currHashPrefix = currHashParts[0].replace(/%20/g, ' ');
	}
	return currHashPrefix;
}

function getUrlHashParams() {
	var currHash = window.location.hash;
	var currHashParams = {};
	if (currHash) {
		var currHashParts = currHash.split('?');
		if (currHashParts.length >= 2) {
			currHashParams = parseQueryParamsStrToObj(currHashParts[1]);
		}
	}
	return currHashParams;
}

function updateUrlHashWithParams(params) {
	var currHash = getUrlHashKey();
	var currHashParams = getUrlHashParams();

	var objResultParams = Object.assign({}, currHashParams, params);
	var strResultParams = stringifyQueryParamsObjToStr(objResultParams);

	var resultUrl = currHash + (strResultParams.length ? ('?' + strResultParams) : '');

	window.location.hash = resultUrl;
}

function parseQueryParamsStrToObj(str) {
	return JSON.parse('{"' + decodeURIComponent(decodeURI(str).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"')) + '"}');
}

function stringifyQueryParamsObjToStr(obj) {
	return Object.keys(obj).map(function (k) {
		return encodeURIComponent(k) + "=" + encodeURIComponent(obj[k]);
	}).join('&');
}

var modal = document.querySelector(".modal");
var trigger = document.querySelector(".trigger-legend");
var closeButton = document.querySelector(".close-button");

function toggleModal() {
    modal.classList.toggle("show-modal");
}

function windowOnClick(event) {
    if (event.target === modal) {
        toggleModal();
    }
}

function viewChanged(event) {
	if (event.target.value === 'UTXO') {
		localStorage.setItem('UTXO', '1');
		$('.transactionListType').val('UTXO');
	} else {
		localStorage.removeItem('UTXO');
		$('.transactionListType').val('transfers_view');
	}
	start();
}

trigger.addEventListener("click", toggleModal);
closeButton.addEventListener("click", toggleModal);
window.addEventListener("click", windowOnClick);
