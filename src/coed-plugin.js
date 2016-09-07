const {Plugin, NodeSelection} = require("prosemirror/dist/edit");
const {posFromDOM, DOMAfterPos, DOMBeforePos} = require("prosemirror/dist/edit/dompos");
const UrlPlugin = require("./utils/url-plugin");
const {
	Item, Link, Fields, Field, Aside, Thumbnail, Image, Properties, Property
} = require('./edbed-elements');

function EdbedPlugin(pm, options) {
	this.pm = pm;

	this.dragStart = this.dragStart.bind(this);
	this.dragStop = this.dragStop.bind(this);
	this.trackFocus = this.trackFocus.bind(this);
	this.fixChange = this.fixChange.bind(this);

	pm.on.selectionChange.add(this.fixChange);

	pm.content.addEventListener("mousedown", this.dragStart);
	pm.content.addEventListener("mouseup", this.dragStop);
	pm.content.addEventListener("click", this.trackFocus);
}

function selectNode(pm, node) {
	var pos = posFromDOM(node);
	var $pos = pm.doc.resolve(pos.pos);
	var after = $pos.nodeAfter;
	if (!after || !after.type.selectable) return;
	pm.setSelection(new NodeSelection($pos));
}

EdbedPlugin.prototype.detach = function(pm) {
	if (pm.content) {
		pm.content.removeEventListener("mousedown", this.dragStart);
		pm.content.removeEventListener("mouseup", this.dragStop);
		pm.content.removeEventListener("click", this.trackFocus);
	}
	pm.on.selectionChange.remove(this.fixChange);
};

EdbedPlugin.prototype.fixChange = function() {
	var rpos = this.pm.selection.$from;
	var from = rpos.pos;
	if (rpos.nodeAfter && rpos.nodeAfter.type.name == "text") {
		from = from - rpos.parentOffset;
	}
	try {
		var node = DOMAfterPos(this.pm, from);
		if (!node) node = DOMBeforePos(this.pm, from);
		if (!node || !node.nodeName) return;
		var name = node.nodeName.toLowerCase();
		var parent = node.closest("edbed-item");
		if (parent) {
			if (!node.closest("edbed-content")) {
				selectNode(this.pm, nonsel.parentNode);
			}
		}
		this.trackFocus({target: node});
	} catch(ex) {
		console.info(ex);
	}
};

EdbedPlugin.prototype.trackFocus = function(e) {
	if (this.focused) {
		this.focused.classList.toggle("focused", false);
		delete this.focused;
	}
	if (this.dragging) return;
	var node = e.target;
	if (node.nodeType == Node.TEXT_NODE) node = node.parentNode;
	var parent = node.closest('edbed-item');
	if (!parent) return;
	this.focused = parent;
	parent.classList.toggle("focused", true);
};

EdbedPlugin.prototype.dragStart = function(e) {
	this.dragging = false;
	var node = e.target;
	if (node.nodeType == Node.TEXT_NODE) node = node.parentNode;
	var parent = node.closest('edbed-item');
	if (!parent) return;
	if (node.closest('edbed-content')) return;
	this.dragging = true;
	selectNode(this.pm, parent);
};

EdbedPlugin.prototype.dragStop = function(e) {
	this.dragging = false;
};


module.exports = new Plugin(EdbedPlugin);

module.exports.config = function(options) {
	let spec = options.spec;
	// Item, Link, Fields, Field, Aside, Thumbnail, Params, Param
	spec.nodes.edbed_field = {
		type: Field,
		content: "inline<_>*"
	};
	spec.nodes.edbed_fields = {
		type: Fields,
		content: 'edbed_field[name="title"] edbed_field[name="content"]'
	};
	spec.nodes.edbed_image = {
		type: Image
	};
	spec.nodes.edbed_link = {
		type: Link,
		content: 'edbed_image?'
	};
	spec.nodes.edbed_thumbnail = {
		type: Thumbnail,
		content: 'edbed_image?'
	};
	spec.nodes.edbed_properties = {
		type: Properties,
		content: 'edbed_property*'
	};
	spec.nodes.edbed_property = {
		type: Property,
		content: 'inline<_>*'
	};
	spec.nodes.edbed_aside = {
		type: Aside,
		content: 'edbed_properties edbed_thumbnail'
	};
	spec.nodes.edbed_item = {
		type: Item,
		content: 'edbed_link edbed_fields edbed_aside',
		group: 'block'
	};

	if (!options.inspector) options.inspector = function inspectorStub(url, cb) {
		setTimeout(function() {
			cb(null, {
				type: 'link',
				url: url,
				title: url
			});
		});
	};


	let plugin = Plugin.prototype.config.call(module.exports, options);

	options.plugins.push(UrlPlugin.config({
		action: edbedAction.bind(plugin)
	}));

	return plugin;
};

function itemFromDom(pm, node) {
	var div = document.createElement("div");
	div.appendChild(node);
	var newNode = pm.schema.parseDOM(div);
	return newNode.firstChild;
}

function ensureImg(node) {
	var img = node.querySelector('* > img');
	if (!img) {
		img = document.createElement('img');
		node.appendChild(img);
	}
	return img;
}

function fillInside(parent, tag, props, keepEmpty) {
	parent.innerHTML = "";
	Object.keys(props).forEach(function(name) {
		var val = props[name];
		if (val === true || (!val && !keepEmpty)) return;
		var node = document.createElement(tag);
		node.setAttribute('name', name);
		node.innerHTML = val;
		parent.appendChild(node);
	});
}

function formatDimensions(w, h) {
	if (!w) return;
	if (!h) return '→ ' + w + ' ←';
	return w + 'x' + h;
}
function formatDuration(d) {
	return d;
}
function formatSize(s) {
	var str = "";
	if (s) str += Math.round(s / 1000) + "KB";
	return str;
}

function setProperties(me, obj) {
	var propNames = {
		duration: true,
		size: true,
		dimensions: true,
		description: true
	};
	var fieldNames = {
		title: true,
		content: true
	};

	obj = Object.assign({}, obj);
	obj.dimensions = formatDimensions(obj.width, obj.height);
	obj.duration = formatDuration(obj.duration);
	obj.size = formatSize(obj.size);

	var link = me.querySelector('a');
	link.innerHTML = "";
	var thumb = me.querySelector('edbed-thumbnail');
	thumb.innerHTML = "";

	Object.keys(obj).forEach(function(name) {
		var val = obj[name];
		if (val == null) val = "";
		if (name == "type" || name == "id") {
			me.setAttribute(name, val);
		} else if (name == "url") {
			link.setAttribute('href', val);
		} else if (name == "icon") {
			if (val) ensureImg(link).setAttribute('src', val);
		} else if (name == "thumbnail") {
			if (val) ensureImg(thumb).setAttribute('src', val);
		} else if (propNames[name]) {
			propNames[name] = val;
		} else if (fieldNames[name]) {
			fieldNames[name] = val;
		} else {
			console.warn("Unknown edbed item property", name);
		}
	});
	fillInside(me.querySelector('edbed-props'), 'edbed-prop', propNames);
	fillInside(me.querySelector('edbed-fields'), 'edbed-field', fieldNames, true);
}

function edbedAction(pm, info) {
	var edbedItem = pm.schema.nodes.edbed_item;

	var loadingId = 'id-edbed-' + Date.now();

	if (info.url) info.title = info.url;
	else if (info.fragment) info.title = info.fragment.firstChild.innerText;

	this.options.inspector(info, function(err, props) {
		// find node
		var oldnode = document.getElementById(loadingId);
		if (!oldnode) {
			return;
		}
		var pos = posFromDOM(oldnode);
		var begin = pos.pos;
		var $pos = pm.doc.resolve(begin);
		var end = begin + $pos.nodeAfter.nodeSize;

		if (err) {
			console.error(err);
			pm.tr.delete(begin, end).apply();
			return;
		}
		var node = edbedItem.createAndFill().toDOM();
		setProperties(node, props);

		pm.tr.replaceWith(begin, end, itemFromDom(pm, node)).apply();
	});

	var loadingNode = edbedItem.createAndFill().toDOM();

	setProperties(loadingNode, {
		type: "none",
		id: loadingId,
		title: info.title
	});

	return itemFromDom(pm, loadingNode);
}

