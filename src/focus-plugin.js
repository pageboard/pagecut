module.exports = function(editor, options) {
	var plugin = new FocusPlugin(editor, options);
	return {
		props: {
			handleClick: plugin.click
		},
		appendTransaction: function(transactions, oldState, newState) {
			// focus once per transaction, also do some focus on command (used by calls to replaceTr)
			var please;
			var itr;
			for (var i=0; i < transactions.length; i++) {
				itr = transactions[i];
				if (itr.getMeta('focus-plugin')) {
					return;
				}
				please = itr.getMeta('focus-please');
			}
			var tr = newState.tr;
			var newTr;
			if (please != null) {
				newTr = plugin.focus(tr, please);
			} else {
				newTr = plugin.action(tr);
			}
			if (newTr) return newTr;
		}
	};
};

function FocusPlugin(editor, options) {
	this.editor = editor;

	this.click = this.click.bind(this);
}

FocusPlugin.prototype.click = function(view, pos, e) {
	this.editor.handleDragging = false;
	var tr = this.focus(view.state.tr, pos);
	if (tr) view.dispatch(tr);
};

FocusPlugin.prototype.action = function(tr) {
	if (this.editor.handleDragging) return;
	var sel = tr.selection;
	// avoid unneeded changes
	if (this.editor.state.tr.selection.eq(sel)) return;
	var pos = null;
	if (sel.node) {
		pos = sel.from;
	} else if (sel.empty) {
		pos = sel.to;
	} else {
		// TODO not sure about that
		console.log("Focusing non-empty TextSelection must be defined properly");
		pos = sel.from;
	}
	if (pos === null) return;
	return this.focus(tr, pos);
};

FocusPlugin.prototype.focusRoot = function(tr, pos, node, focus) {
	var isDoc = node.type.name == tr.doc.type.name;
	// TODO create a new Step that updates doc.attrs
	var attrs = isDoc ? node.attrs : Object.assign({}, node.attrs);
	var prev = attrs.block_focused;
	if (prev == focus) {
		return tr;
	}
	if (focus) attrs.block_focused = focus;
	else delete attrs.block_focused;
	if (node.type.spec.inline) {
		var sel = this.editor.selectTr(tr, pos);
		tr = tr.removeMark(sel.from, sel.to, node.type);
		tr = tr.addMark(sel.from, sel.to, node.type.create(attrs));
	} else if (isDoc) {
		// prosemirror doesn't transform doc, we just changed doc.attrs directly
	} else {
		tr = tr.setNodeType(pos, null, attrs);
	}
	return tr;
};

FocusPlugin.prototype.focus = function(tr, pos) {
	// do not unfocus if view or its document has lost focus
	if (!this.editor.hasFocus()) {
		return;
	}
	var parents = this.editor.parents(tr, pos, true);
	var root = parents.length && parents[0].root;
	if (root && (root.mark || root.node).attrs.block_focused == "last") {
		// already done
		// return;
	}
	var pos = root && root.level && root.rpos.before(root.level);
	var selectedRoot = root && tr.selection.node == root.node;

	var me = this;

	var changes = [];

	var newtr;
	if (root) {
		changes.push({
			pos: pos,
			node: root.mark || root.node,
			focus: "last"
		});
		var parent, cur;
		for (var i=1; i < parents.length; i++) {
			parent = parents[i];
			cur = parent.root;
			if (!cur.level) continue;
			changes.push({
				pos: cur.rpos.before(cur.level),
				node: cur.mark || cur.node,
				focus: i == parents.length - 1 ? "first" : "middle"
			});
		}
	}
	function hasChanged(node, pos) {
		if (node.type.spec.typeName == "root") {
			// node is good
		} else if (node.marks.length && node.marks[0].type.spec.typeName == "root") {
			node = node.marks[0];
		} else {
			return;
		}
		var changed = false;
		for (var i=0; i < changes.length; i++) {
			if (node == changes[i].node) {
				changed = true;
				break;
			}
		}
		if (!changed) changes.unshift({pos:pos, node:node, focus: false});
	}
	hasChanged(tr.doc);
	tr.doc.descendants(hasChanged);

	var change;
	for (var i=0; i < changes.length; i++) {
		change = changes[i];
		tr = me.focusRoot(tr, change.pos, change.node, change.focus);
	}

	if (selectedRoot) {
		tr = tr.setSelection(this.editor.selectTr(tr, root.rpos));
	}
	return tr.setMeta('focus-plugin', parents);
};

function isParentOf(parent, node) {
	if (!node) return false;
	while (node) {
		if (parent == node) return true;
		node = node.parentNode;
	}
	return false;
}

