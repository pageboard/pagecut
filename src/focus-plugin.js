module.exports = function(main, options) {
	var plugin = new FocusPlugin(main, options);
	return {
		props: {
			handleClick: plugin.click
		},
		appendTransaction: function(transactions, oldState, newState) {
			// focus once per transaction
			for (var i=0; i < transactions.length; i++) {
				if (transactions[i].focus) return;
			}
			return plugin.action(newState);
		}
	};
};

function FocusPlugin(main, options) {
	this.main = main;

	this.click = this.click.bind(this);
}

FocusPlugin.prototype.click = function(view, pos, e) {
	this.main.dragging = false;
	var tr = this.focus(view.state.tr, pos);
	if (tr) view.dispatch(tr);
};

FocusPlugin.prototype.action = function(state) {
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

FocusPlugin.prototype.focusRoot = function(tr, pos, node, focus) {
	if (node.type.spec.inline) {
		var sel = this.main.selectTr(tr, pos);
		var attrs = Object.assign({}, node.attrs);
		if (focus) attrs.block_focused = focus;
		else delete attrs.block_focused;
		tr = tr.removeMark(sel.from, sel.to, node.type);
		tr = tr.addMark(sel.from, sel.to, node.type.create(attrs));
	} else {
		var attrs = Object.assign({}, node.attrs);
		if (focus) attrs.block_focused = focus;
		else delete attrs.block_focused;
		tr = tr.setNodeType(pos, null, attrs);
	}
	return tr;
};

FocusPlugin.prototype.focus = function(tr, pos) {
	// do not unfocus if view or its document has lost focus
	if (!this.main.view.hasFocus()) {
		return;
	}
	var parents = this.main.parents(tr, pos, true);
	var root = parents.length && parents[0].root;
	var pos = root && root.level && root.rpos.before(root.level);
	var selectedRoot = root && tr.selection.node == root.node;

	var me = this;

	tr.doc.descendants(function(node, pos, parent) {
		if (node.attrs.block_focused) {
			tr = me.focusRoot(tr, pos, node, false);
		} else if (node.marks.length && node.marks[0].attrs.block_focused) {
			tr = me.focusRoot(tr, pos, node.marks[0], false);
		}
	});

	if (root) {
		tr = me.focusRoot(tr, pos, root.mark || root.node, "last");
		var parent, cur;
		for (var i=1; i < parents.length; i++) {
			parent = parents[i];
			cur = parent.root;
			tr = me.focusRoot(tr, cur.rpos.before(cur.level), cur.mark || cur.node, i == parents.length - 1 ? "first" : "middle");
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
