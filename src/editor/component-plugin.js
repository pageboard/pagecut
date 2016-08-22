const {Plugin, NodeSelection} = require("prosemirror/dist/edit");
const {posFromDOM, DOMAfterPos, DOMBeforePos} = require("prosemirror/dist/edit/dompos");
const {ComponentResource, ComponentWidget, ComponentField} = require('./component-resource');

function ComponentPlugin(pm, options) {
	this.pm = pm;

	pm.posFromDOM = posFromDOM;

	pm.getNodeSelection = function(node) {
		var pos = posFromDOM(node);
		var $pos = this.doc.resolve(pos.pos);
		return new NodeSelection($pos);
	}.bind(pm);

	pm.selectNode = function(node) {
		var pos = posFromDOM(node);
		var $pos = this.doc.resolve(pos.pos);
		var after = $pos.nodeAfter;
		if (!after || !after.type.selectable) return;
		this.setSelection(new NodeSelection($pos));
	}.bind(pm);

	this.fixDrag = this.fixDrag.bind(this);
	this.trackFocus = this.trackFocus.bind(this);
	this.fixChange = this.fixChange.bind(this);

	pm.on.selectionChange.add(this.fixChange);

	pm.content.addEventListener("mousedown", this.fixDrag);
	pm.content.addEventListener("click", this.trackFocus);
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
		if (node.nodeName.toLowerCase() == "component-widget") this.pm.selectNode(node.parentNode);
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
	this.pm.selectNode(parent);
};

module.exports = new Plugin(ComponentPlugin);

module.exports.config = function(schema) {
	schema.nodes.component_field = {
		type: ComponentField,
		content: "inline<_>*"
	};
	schema.nodes.component_widget = {
		type: ComponentWidget
	};
	schema.nodes.component_resource = {
		type: ComponentResource,
		content: 'component_widget component_field[name="title"] component_field[name="description"]'
	};
	schema.nodes.doc.content = "(block|component_resource)+";
	return Plugin.prototype.config.call(module.exports);
};

