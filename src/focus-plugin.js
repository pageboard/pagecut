var State = require("prosemirror-state");

module.exports = function(main, options) {
	var handler = new Handler(main, options);
	return new State.Plugin({
		props: {
			handleClick: handler.click
		},
		view: function(view) {
			return {
				update: handler.action.bind(handler)
			}
		}
	});
};

function Handler(main, options) {
	this.main = main;

	this.action = this.action.bind(this);
	this.click = this.click.bind(this);
}

Handler.prototype.click = function(view, pos, e) {
	this.main.dragging = false;
	this.focus(view, view.state.doc.resolve(pos));
};

Handler.prototype.action = function(view, state) {
	if (this.main.dragging) return;
	var sel = view.state.tr.selection;
	var rpos;
	if (sel.node) {
		rpos = sel.$from;
	} else if (sel.empty) {
		rpos = sel.$to;
	}
	if (rpos == null) return;
	this.focus(view, rpos);
};

function focusRoot(view, pos, node, focus) {
	if (node.type.spec.inline) return; // if node is a Mark
	var attrs = Object.assign({}, node.attrs);
	if (focus) attrs.block_focused = true;
	else delete attrs.block_focused;
	var tr = view.state.tr.setNodeType(pos, null, attrs);
	tr.addToHistory = false;

	view.dispatch(tr);
}

Handler.prototype.focus = function(view, $pos) {
	// do not unfocus if view or its document has lost focus
	if (!view.hasFocus()) {
		return;
	}
	var parents = this.main.parents($pos, true);
	var root = parents.length && parents[0].root;
	var pos = root && root.level && root.rpos.before(root.level);
	var dom = root && this.main.posToDOM(pos);
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
		var parent;
		for (var i=1; i < parents.length; i++) {
			parent = parents[i];
			root = parent.root;
			focusRoot(view, root.rpos.before(root.level), root.node, true);
		}
	}
};

function isParentOf(parent, node) {
	if (!node) return false;
	while (node) {
		if (parent == node) return true;
		node = node.parentNode;
	}
	return false;
}

