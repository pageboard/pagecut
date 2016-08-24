const {Plugin, NodeSelection} = require("prosemirror/dist/edit");
const {posFromDOM, DOMAfterPos, DOMBeforePos} = require("prosemirror/dist/edit/dompos");
const {
	ComponentResource,
	ComponentWidget,
	ComponentField,
	ComponentFields
} = require('./component-resource');

function ComponentPlugin(pm, options) {
	this.pm = pm;

	this.fixDrag = this.fixDrag.bind(this);
	this.trackFocus = this.trackFocus.bind(this);
	this.fixChange = this.fixChange.bind(this);

	pm.on.selectionChange.add(this.fixChange);

	pm.content.addEventListener("mousedown", this.fixDrag);
	pm.content.addEventListener("click", this.trackFocus);
}

function selectNode(pm, node) {
	var pos = posFromDOM(node);
	var $pos = pm.doc.resolve(pos.pos);
	var after = $pos.nodeAfter;
	if (!after || !after.type.selectable) return;
	pm.setSelection(new NodeSelection($pos));
}

ComponentPlugin.prototype.detach = function(pm) {
	if (pm.content) {
		pm.content.removeEventListener("mousedown", this.fixDrag);
		pm.content.removeEventListener("click", this.trackFocus);
	}
	pm.on.selectionChange.remove(this.fixChange);
};

ComponentPlugin.prototype.fixChange = function() {
	var rpos = this.pm.selection.$from;
	var from = rpos.pos;
	if (rpos.nodeAfter && rpos.nodeAfter.type.name == "text") {
		from = from - rpos.parentOffset;
	}
	try {
		var node = DOMAfterPos(this.pm, from);
		if (!node) node = DOMBeforePos(this.pm, from);
		if (!node || !node.nodeName) return;
		if (node.nodeName.toLowerCase() == "component-widget") selectNode(this.pm, node.parentNode);
		this.trackFocus({target: node});
	} catch(ex) {
	}
};

ComponentPlugin.prototype.trackFocus = function(e) {
	if (this.focused) {
		this.focused.classList.toggle("focused", false);
		delete this.focused;
	}
	var node = e.target;
	if (node.nodeType == Node.TEXT_NODE) node = node.parentNode;
	var parent = node.closest('component-resource');
	if (!parent) return;
	this.focused = parent;
	parent.classList.toggle("focused", true);
};

ComponentPlugin.prototype.fixDrag = function(e) {
	this.dragging = false;
	var node = e.target;
	if (node.nodeType == Node.TEXT_NODE) node = node.parentNode;
	var parent = node.closest('component-resource');
	if (!parent) return;
	if (node.closest('component-field')) return;
	this.dragging = true;
	selectNode(this.pm, parent);
};

module.exports = new Plugin(ComponentPlugin);

module.exports.config = function(options) {
	let schema = options.schema;
	schema.nodes.component_field = {
		type: ComponentField,
		content: "inline<_>*"
	};
	schema.nodes.component_fields = {
		type: ComponentFields,
		content: 'component_field[name="title"] component_field[name="description"]'
	};
	schema.nodes.component_widget = {
		type: ComponentWidget
	};
	schema.nodes.component_resource = {
		type: ComponentResource,
		content: 'component_widget[type="begin"] component_fields component_widget[type="end"]'
	};
	schema.nodes.doc.content = "(block|component_resource)+";

	if (!options.inspector) options.inspector = function inspectorStub(url, cb) {
		setTimeout(function() {
			cb(null, {
				type: 'link',
				title: url,
				url: url
			});
		});
	};
	let plugin = Plugin.prototype.config.call(module.exports, options);
	plugin.action = componentUrlAction.bind(plugin);
	return plugin;
};


function componentUrlAction(pm, url) {
	var types = pm.schema.nodes;
	var loadingId = 'id' + Math.round(Math.random() * 1e9);
	var loadingNode = types.component_resource.create({
		href: url,
		id: loadingId
	});
	this.options.inspector(url, function(err, obj) {
		// find node
		var node = document.getElementById(loadingId);
		if (!node) {
			console.error('problem no node with id', loadingId);
		}
		var pos = posFromDOM(node);
		var begin = pos.pos;
		var $pos = pm.doc.resolve(begin);
		var end = begin + $pos.nodeAfter.nodeSize;

		if (err) {
			console.error(err);
			pm.tr.delete(begin, end).apply();
			return;
		}

		var titleField = types.component_field.create({
			name: "title"
		}, pm.schema.text(obj.title || obj.href));

		var descriptionField = types.component_field.create({
			name: "description"
		}, obj.description ? pm.schema.text(obj.description) : null);

		var fields = types.component_fields.create({}, [titleField, descriptionField]);

		pm.tr.replaceWith(begin, end, types.component_resource.createAndFill({
			type: obj.type,
			href: obj.url,
			icon: obj.icon,
			thumbnail: obj.thumbnail
		}, [fields])).apply();
	});
	return loadingNode;
}

