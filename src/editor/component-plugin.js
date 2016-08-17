const {Plugin, NodeSelection} = require("prosemirror/dist/edit");
const {posFromDOM} = require("prosemirror/dist/edit/dompos");
const {ComponentResource, ComponentWidget} = require('./component-resource');

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

	pm.content.addEventListener("mousedown", this.fixDrag);
	document.addEventListener("dragend", this.fixDrop);
	document.addEventListener("mouseup", this.fixDrop);
	document.addEventListener("drop", this.fixDrop);
}

ComponentPlugin.prototype.fixDrag = function(e) {
	this.dragging = false;
	var node = e.target;
	if (node.nodeType == Node.TEXT_NODE) node = node.parentNode;
	node = node.closest('component-resource');
	if (!node) return;
	this.dragging = true;
	this.pm.selectNode(node);
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
	schema.nodes.component_widget = {
		type: ComponentWidget
	};
	schema.nodes.component_resource = {
		type: ComponentResource,
		group: "block",
		content: "component_widget"
	};
	return Plugin.prototype.config.call(module.exports);
};

