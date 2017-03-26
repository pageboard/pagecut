var State = require("prosemirror-state");

module.exports = function(main, options) {
	var handler = new Handler(main, options);
	return new State.Plugin({
		props: {
			handleClick: handler.click
		},
		appendTransaction: function(transactions, oldState, newState) {
			// focus once per transaction
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
	var tr = this.focus(view.state.tr, pos);
	if (tr) view.dispatch(tr);
};

Handler.prototype.action = function(state) {
	var tr = state.tr;
	if (this.main.dragging) return;
	var sel = tr.selection;
	var pos = null;
	if (sel.node) {
		pos = sel.from;
	} else if (sel.empty) {
		pos = sel.to;
	}
	if (pos === null) return;
	return this.focus(tr, pos);
};

function focusRoot(tr, pos, node, focus) {
	if (node.type.spec.inline) return tr; // if node is a Mark
	var attrs = Object.assign({}, node.attrs);
	if (focus) attrs.block_focused = focus;
	else delete attrs.block_focused;
	tr = tr.setNodeType(pos, null, attrs);
	return tr;
}

Handler.prototype.focus = function(tr, pos) {
	// do not unfocus if view or its document has lost focus
	if (!this.main.view.hasFocus()) {
		return;
	}
	var parents = this.main.parents(tr, pos, true);
	var root = parents.length && parents[0].root;
	var pos = root && root.level && root.rpos.before(root.level);
	var selectedRoot = root && tr.selection.node == root.node;

	tr.doc.descendants(function(node, pos, parent) {
		if (node.attrs.block_focused) tr = focusRoot(tr, pos, node, false);
	});

	if (root) {
		tr = focusRoot(tr, pos, root.node, "last");
		var parent, cur;
		for (var i=1; i < parents.length; i++) {
			parent = parents[i];
			cur = parent.root;
			tr = focusRoot(tr, cur.rpos.before(cur.level), cur.node, i == parents.length - 1 ? "first" : "middle");
		}
	}
	if (selectedRoot) {
		tr = tr.setSelection(this.main.selectTr(tr, root.rpos));
	}
	tr.focus = true;
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

