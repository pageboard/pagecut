const {Plugin, NodeSelection} = require("prosemirror/dist/edit");
const {posFromDOM, DOMFromPos} = require("prosemirror/dist/edit/dompos");

function CoedPlugin(pm, options) {
	this.pm = pm;
	pm.posFromDOM = posFromDOM;

	this.dragStart = this.dragStart.bind(this);
	this.dragStop = this.dragStop.bind(this);
	this.change = this.change.bind(this);
	this.click = this.click.bind(this);

	pm.on.selectionChange.add(this.change);
	pm.on.click.add(this.click);

	pm.content.addEventListener("mousedown", this.dragStart, true);
	pm.content.addEventListener("mouseup", this.dragStop);
}

CoedPlugin.prototype.click = function(pos, e) {
	var cpos = coedPos(this.pm.doc.resolve(pos));
	if (cpos.root == null) return;
	var dom = posToNode(this.pm, cpos.root);
	if (dom) {
		this.focus(dom);
	}
};

CoedPlugin.prototype.detach = function(pm) {
	if (pm.content) {
		pm.content.removeEventListener("mousedown", this.dragStart, true);
		pm.content.removeEventListener("mouseup", this.dragStop);
	}
	pm.on.selectionChange.remove(this.change);
	pm.on.click.remove(this.click);
};

CoedPlugin.prototype.change = function() {
	if (this.dragging) return;
	var sel = this.pm.selection;
	if (!sel.empty) return;
	var cpos = coedPos(sel.$from);
	if (cpos.root == null) return;
	var dom = posToNode(this.pm, cpos.root);
	if (dom) {
		this.focus(dom);
	}
};

CoedPlugin.prototype.focus = function(dom) {
	if (this.focused && this.focused != dom) {
		var fparent = this.focused;
		while (fparent && fparent.nodeType == Node.ELEMENT_NODE) {
			if (dom && isParentOf(fparent, dom)) {
				// do not remove attribute
			} else {
				fparent.removeAttribute('coed-focused');
			}
			fparent = fparent.parentNode;
		}
		delete this.focused;
	}
	if (dom) {
		dom.setAttribute("coed-focused", 1);
		this.focused = dom;
	}
};

CoedPlugin.prototype.dragStart = function(e) {
	this.pm.focus();
	this.dragging = true;
	var dom = e.target;
	if (dom.nodeType == Node.TEXT_NODE) dom = dom.parentNode;
	var pos;
	try { pos = posFromDOM(dom); } catch(ex) {
		return;
	}
	var cpos = coedPos(this.pm.doc.resolve(pos.pos));
	if (cpos.root == null || cpos.content != null || cpos.wrap != null) {
		return;
	}
	e.target.draggable = false;
	this.pm.setNodeSelection(cpos.root);
	var dom = posToNode(this.pm, cpos.root);
	if (dom) dom = dom.querySelector('*'); // select first child element
	if (dom) {
		dom.draggable = true;
		this.dragTarget = dom;
	}
};

CoedPlugin.prototype.dragStop = function(e) {
	if (this.dragging) {
		this.dragging = false;
		if (this.dragTarget) {
			this.dragTarget.draggable = false;
			delete this.dragTarget;
		}
	}
};

function coedPos(rpos) {
	var level = rpos.depth, node, type, pos;
	var obj = {};
	while (level >= 0) {
		node = rpos.node(level);
		type = node.type && node.type.coedType;
		if (type) obj[type] = pos = rpos.before(level);
		if (type == "root") break;
		level--;
	}
	return obj;
}

function posToNode(pm, pos) {
	try {
		var fromPos = DOMFromPos(pm, pos);
		if (fromPos) {
			var dom = fromPos.node;
			var offset = fromPos.offset;
			if (dom.nodeType == 1 && offset < dom.childNodes.length) {
				dom = dom.childNodes.item(offset);
			}
			return dom;
		}
	} catch(ex) {
		return false;
	}
}

function isParentOf(parent, node) {
	while (node = node.parentNode) {
		if (parent == node) return true;
	}
	return false;
}

module.exports = new Plugin(CoedPlugin);



