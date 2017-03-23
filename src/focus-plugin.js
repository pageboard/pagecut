var State = require("prosemirror-state");

module.exports = function(main, options) {
	var handler = new Handler(main, options);
	return new State.Plugin({
		props: {
			handleClick: handler.click
		},
		appendTransaction: function(transactions, oldState, newState) {
			// find out if we have a focus already
			for (var i=0; i < transactions.length; i++) {
				if (transactions[i].focus) return;
			}
			return handler.action(newState);
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
	var tr = this.focus(view.state.tr, view.state.doc.resolve(pos));
	view.dispatch(tr);
};

Handler.prototype.action = function(state) {
	var tr = state.tr;
	if (this.main.dragging) return;
	var sel = tr.selection;
	var rpos;
	if (sel.node) {
		rpos = sel.$from;
	} else if (sel.empty) {
		rpos = sel.$to;
	}
	if (rpos == null) return;
	tr = this.focus(tr, rpos);
	tr.addToHistory = false;
	tr.focus = true;
	return tr;
};

function focusRoot(tr, pos, node, focus) {
	if (node.type.spec.inline) return tr; // if node is a Mark
	var attrs = Object.assign({}, node.attrs);
	if (focus) attrs.block_focused = focus;
	else delete attrs.block_focused;
	tr = tr.setNodeType(pos, null, attrs);
	return tr;
}

Handler.prototype.focus = function(tr, $pos) {
	// do not unfocus if view or its document has lost focus
	if (!this.main.view.hasFocus()) {
		return tr;
	}
	var parents = this.main.parents($pos, true);
	var root = parents.length && parents[0].root;
	var pos = root && root.level && root.rpos.before(root.level);

	// problem here - those functions are out of sync with current state
	var dom = root && this.main.posToDOM(pos);
	var restoreSelection = dom && dom.classList && dom.classList.contains('ProseMirror-selectednode');
	var existing = this.main.view.dom.querySelectorAll('[block-focused]');

	var blurs = [];
	// reverse on purpose here
	for (var i = existing.length - 1; i >= 0; i--) {
		var blur = existing.item(i);
		if (!dom || !isParentOf(blur, dom)) {
			var posBlur = this.main.posFromDOM(blur);
			var nodeBlur = tr.doc.resolve(posBlur).nodeAfter;
			tr = focusRoot(tr, posBlur, nodeBlur, false);
		}
	}

	if (root && !root.node.attrs.block_focused) {
		tr = focusRoot(tr, pos, root.node, "last");
		var parent;
		for (var i=1; i < parents.length; i++) {
			parent = parents[i];
			root = parent.root;
			tr = focusRoot(tr, root.rpos.before(root.level), root.node, i == parents.length - 1 ? "first" : "middle");
		}
	}
	if (restoreSelection) {
		var sel = this.main.selectTr(tr, pos);
		if (sel) tr = tr.setSelection(sel);
	}
	return tr;
};

function isParentOf(parent, node) {
	if (!node) return false;
	while (node) {
		if (parent == node) return true;
		node = node.parentNode;
	}
	return false;
}

