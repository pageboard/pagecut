var State = require("prosemirror-state");
var keymap = require("prosemirror-keymap").keymap;

function CreatePlugin(main, options) {
	var handler = new Handler(main, options);
	return new State.Plugin({
		props: {
			handleClick: handler.click,
			handleDOMEvents: {
				mousedown: handler.mousedown.bind(handler),
				mouseup: handler.mouseup.bind(handler),
				drop: handler.mouseup.bind(handler)
			}
		},
		state: {
			init: function(config, state) {
				return {};
			},
			apply: handler.action
		}
	});
}

function Handler(main, options) {
	this.main = main;

	this.action = this.action.bind(this);
	this.click = this.click.bind(this);

	this.command = this.command.bind(this);

	options.plugins.unshift(keymap({
		Enter: this.command
	}));
}

Handler.prototype.command = function(state, dispatch, view) {
	var sel = state.tr.selection;
	var bef = sel.$to.nodeBefore;
	if (bef && bef.type.name == "hard_break") {
		if (sel.empty && dispatch) {
			dispatch(state.tr.delete(sel.$to.pos - 1, sel.$to.pos).scrollIntoView());
		}
		// do not split root blocks
		var parent = sel.$to.parent;
		if (parent && parent.type.spec.typeName == "root") return true;
		// fall through
		return false;
	} else {
		if (dispatch) dispatch(state.tr.replaceSelectionWith(state.schema.nodes.hard_break.create()).scrollIntoView());
		// stop here
		return true;
	}
};

Handler.prototype.click = function(view, pos, e) {
	this.dragging = false;
	this.focus(view, view.state.doc.resolve(pos));
};

Handler.prototype.action = function(action) {
	if (action.type != "selection") return;
	if (this.dragging) return;
	var sel = action.selection;
	if (!sel.empty) return;
	this.focus(this.main.view, sel.$to);
};

function focusRoot(view, pos, node, focus) {
	var attrs = Object.assign({}, node.attrs);
	if (focus) attrs.block_focused = true;
	else delete attrs.block_focused;

	var tr = view.state.tr.setNodeType(pos, null, attrs);
	tr.addToHistory = false;

	view.dispatch(tr);
}

Handler.prototype.focus = function(view, $pos) {
	var parents = this.main.parents($pos);
	var root = parents.root;
	var pos = root && root.rpos.before(root.level);
	var dom = root && posToNode(view, pos);
	var existing = view.dom.querySelectorAll('[block-focused]');
	var blurs = [];
	// reverse on purpose here
	for (var i = existing.length - 1; i >= 0; i--) {
		var blur = existing.item(i);
		if (!dom || !isParentOf(blur, dom)) {
			var posBlur = this.main.posFromDOM(blur);
			var nodeBlur = view.state.tr.doc.resolve(posBlur).nodeAfter;
			focusRoot(view, posBlur, nodeBlur, false);
		}
	}

	if (root && !root.node.attrs.block_focused) {
		focusRoot(view, pos, root.node, true);
		while (parents = this.main.parents(root.rpos)) {
			if (!parents.root || parents.root.node == root.node) break;
			root = parents.root;
			focusRoot(view, root.rpos.before(root.level), root.node, true);
		}
	}
};

Handler.prototype.mousedown = function(view, e) {
	this.dragging = true;
	var dom = e.target;
	if (dom.nodeType == Node.TEXT_NODE) dom = dom.parentNode;
	var pos = this.main.posFromDOM(dom);
	if (pos === false) {
		return;
	}
	var cobj = this.main.parents(view.state.tr.doc.resolve(pos));
	var root = cobj.root;
	if (root == null || cobj.content != null || cobj.wrap != null) {
		return;
	}
	e.target.draggable = false;

	var posBefore = root.rpos.before(root.level);
	var rposBefore = view.state.doc.resolve(posBefore);

	var dom = posToNode(view, posBefore);

	if (dom) dom = dom.querySelector('[block-handle]');
	if (dom) {
		var tr = view.state.tr.setSelection(new State.NodeSelection(rposBefore));
		tr.addToHistory = false;
		view.dispatch(tr);
		dom.draggable = true;
		this.dragTarget = dom;
	} else {
		//return true; // let pm handle that for now...
	}
};

Handler.prototype.mouseup = function(view, e) {
	var main = this.main;
	if (this.dragging) {
		this.dragging = false;
		if (this.dragTarget) {
			this.dragTarget.draggable = false;
			delete this.dragTarget;
		}
	}
};

function posToNode(view, pos) {
	if (pos == null) return;
	try {
		var fromPos = view.docView.domFromPos(pos);
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
	if (!node) return false;
	while (node) {
		if (parent == node) return true;
		node = node.parentNode;
	}
	return false;
}

module.exports = CreatePlugin;

