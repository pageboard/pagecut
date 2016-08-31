const {Plugin, NodeSelection} = require("prosemirror/dist/edit");
const {posFromDOM, DOMAfterPos, DOMBeforePos} = require("prosemirror/dist/edit/dompos");
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
		var nonsel = node.closest("edbed-link,edbed-aside");
		if (nonsel) selectNode(this.pm, nonsel.parentNode);
		this.trackFocus({target: node});
	} catch(ex) {
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
	if (node.closest('edbed-field')) return;
	this.dragging = true;
	selectNode(this.pm, parent);
};

EdbedPlugin.prototype.dragStop = function(e) {
	this.dragging = false;
};


module.exports = new Plugin(EdbedPlugin);

module.exports.config = function(options) {
	let schema = options.schema;
	// Item, Link, Fields, Field, Aside, Thumbnail, Params, Param
	schema.nodes.edbed_field = {
		type: Field,
		content: "inline<_>*"
	};
	schema.nodes.edbed_fields = {
		type: Fields,
		content: 'edbed_field*'
	};
	schema.nodes.edbed_image = {
		type: Image
	};
	schema.nodes.edbed_link = {
		type: Link,
		content: 'edbed_image?'
	};
	schema.nodes.edbed_thumbnail = {
		type: Thumbnail,
		content: 'edbed_image?'
	};
	schema.nodes.edbed_properties = {
		type: Properties,
		content: 'edbed_property*'
	};
	schema.nodes.edbed_property = {
		type: Property
	};
	schema.nodes.edbed_aside = {
		type: Aside,
		content: 'edbed_thumbnail edbed_properties'
	};
	schema.nodes.edbed_item = {
		type: Item,
		content: 'edbed_link edbed_fields edbed_aside',
		group: 'block'
	};

	if (!options.inspector) options.inspector = function inspectorStub(url, cb) {
		setTimeout(function() {
			cb(null, {
				type: 'link',
				href: url,
				title: url
			});
		});
	};
	let plugin = Plugin.prototype.config.call(module.exports, options);
	plugin.action = edbedAction.bind(plugin);
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

function setProperties(me, obj) {
	var propNames = {
		duration: true,
		dimensions: true,
		size: true
	};

	var fields = me.querySelector('edbed-fields');
	fields.innerHTML = "";
	var props = me.querySelector('edbed-props');
	props.innerHTML = "";
	var link = me.querySelector('edbed-link');
	link.innerHTML = "";
	var thumb = me.querySelector('edbed-aside > edbed-thumbnail');
	thumb.innerHTML = "";

	Object.keys(obj).forEach(function(name) {
		var val = obj[name];
		if (name == "type" || name == "id") {
			me.setAttribute(name, val);
		} else if (name == "href") {
			link.setAttribute('href', val);
		} else if (name == "icon") {
			ensureImg(link).setAttribute('src', val);
		} else if (name == "thumbnail") {
			ensureImg(thumb).setAttribute('src', val);
		} else if (propNames[name]) {
			var propNode = document.createElement('edbed-prop');
			propNode.setAttribute('name', name);
			propNode.setAttribute('value', val);
			props.appendChild(propNode);
		} else {
			var fieldNode = document.createElement('edbed-field');
			fieldNode.setAttribute('name', name);
			fieldNode.innerHTML = val;
			fields.appendChild(fieldNode);
		}
	});
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

		// remove domt template marks
		var fields = node.querySelector('edbed-fields');
		if (fields.firstChild.nodeType == Node.COMMENT_NODE) fields.removeChild(fields.firstChild);
		if (fields.lastChild.nodeType == Node.COMMENT_NODE) fields.removeChild(fields.lastChild);

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

