const {Plugin, NodeSelection} = require("prosemirror/dist/edit");
const {posFromDOM, DOMAfterPos, DOMBeforePos} = require("prosemirror/dist/edit/dompos");

function CoedPlugin(pm, options) {
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

CoedPlugin.prototype.detach = function(pm) {
	if (pm.content) {
		pm.content.removeEventListener("mousedown", this.dragStart);
		pm.content.removeEventListener("mouseup", this.dragStop);
		pm.content.removeEventListener("click", this.trackFocus);
	}
	pm.on.selectionChange.remove(this.fixChange);
};

CoedPlugin.prototype.fixChange = function() {
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
		var parent = node.closest('[coed="root"]');
		if (parent) {
			if (!node.closest('[coed="content"]')) {
				selectNode(this.pm, parent);
			}
		}
		this.trackFocus({target: node});
	} catch(ex) {
		console.info(ex);
	}
};

CoedPlugin.prototype.trackFocus = function(e) {
	if (this.focused) {
		this.focused.removeAttribute("coed-focused");
		delete this.focused;
	}
	if (this.dragging) return;
	var node = e.target;
	if (node.nodeType == Node.TEXT_NODE) node = node.parentNode;
	var parent = node.closest('[coed="root"]');
	if (!parent) return;
	this.focused = parent;
	parent.setAttribute("coed-focused", "1");
	parent.classList.toggle("focused", true);
};

CoedPlugin.prototype.dragStart = function(e) {
	this.dragging = false;
	var node = e.target;
	if (node.nodeType == Node.TEXT_NODE) node = node.parentNode;
	var parent = node.closest('[coed="root"]');
	if (!parent) return;
	if (node.closest('[coed="content"]')) return;
	this.dragging = true;
	selectNode(this.pm, parent);
};

CoedPlugin.prototype.dragStop = function(e) {
	this.dragging = false;
};

module.exports = new Plugin(CoedPlugin);



