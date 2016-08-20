const {Plugin, NodeSelection} = require("prosemirror/dist/edit");
const {posFromDOM} = require("prosemirror/dist/edit/dompos");
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
	this.fixDrop = this.fixDrop.bind(this);
	this.select = this.select.bind(this);

	pm.content.addEventListener("mousedown", this.fixDrag, true);
	pm.content.addEventListener("click", this.select, true);
	document.addEventListener("dragend", this.fixDrop);
	document.addEventListener("mouseup", this.fixDrop);
	document.addEventListener("drop", this.fixDrop);
}

ComponentPlugin.prototype.detach = function(pm) {
	document.removeEventListener("dragend", this.fixDrop);
	document.removeEventListener("mouseup", this.fixDrop);
	document.removeEventListener("drop", this.fixDrop);
	if (pm.content) {
		pm.content.removeEventListener("mousedown", this.fixDrag, true);
		pm.content.removeEventListener("click", this.select, true);
	}
};

ComponentPlugin.prototype.select = function(e) {
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

ComponentPlugin.prototype.fixDrop = function(e) {
	if (!this.dragging) return;
	this.dragging = false;
	var sel = this.pm.selection;
	if (!sel.$from) return;
	sel = sel.$from;
	if (!sel.nodeAfter || sel.nodeAfter.type.name == "component_widget") return;
	this.pm.setNodeSelection(sel.pos + 1);
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
		group: "block",
		content: 'component_widget component_field[name="title"] component_field[name="description"]'
	};
	return Plugin.prototype.config.call(module.exports);
};

