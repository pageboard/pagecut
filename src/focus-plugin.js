var State = require("prosemirror-state");

module.exports = function(view, options) {
	var plugin = new FocusPlugin(view, options);
	return {
		props: {
			handleClick: plugin.click // needed to focus on uneditable dom
		},
		appendTransaction: function(transactions, oldState, newState) {
			// focus once per transaction
			var itr;
			var editorUpdate = false;
			for (var i=0; i < transactions.length; i++) {
				itr = transactions[i];
				if (itr.getMeta('focus-plugin')) {
					return;
				}
				if (itr.getMeta('editor')) {
					editorUpdate = true;
				}
			}
			var tr = newState.tr;
			if (plugin.action(tr, editorUpdate)) {
				return tr;
			}
		}
	};
};

function FocusPlugin(view, options) {
	this.view = view;

	this.click = this.click.bind(this);
}

function hasParent(parent, node) {
	while (node) {
		if (node == parent) return true;
		node = node.parentNode;
	}
	return false;
}

FocusPlugin.prototype.click = function(view, pos, e) {
	var posObj = view.posAtCoords({
		left: e.clientX,
		top: e.clientY
	});
	pos = posObj.inside < 0 ? pos : posObj.inside;
	var dom = view.root.elementFromPoint(e.clientX, e.clientY);
	if (!dom) return;
	var parent = dom;
	var nodeView;
	while (parent) {
		nodeView = parent.pmViewDesc;
		if (nodeView) break;
		parent = parent.parentNode;
	}
	if (!nodeView) return;
	// now find if dom is in view.dom or view.contentDOM
	if (!hasParent(nodeView.dom, dom) || nodeView.contentDOM && hasParent(nodeView.contentDOM, dom)) {
		return;
	}

	var tr = view.state.tr;
	if (this.focus(tr, State.TextSelection.create(view.state.doc, pos))) {
		view.dispatch(tr);
	}
};

FocusPlugin.prototype.action = function(tr, editorUpdate) {
	var sel = tr.selection;
	// avoid unneeded changes
	if (this.view.state.tr.selection.eq(sel) && !editorUpdate) return false;
	return this.focus(tr, sel);
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
		var sel = this.view.utils.selectTr(tr, pos);
		tr.removeMark(sel.from, sel.to, node.type);
		tr.addMark(sel.from, sel.to, node.type.create(attrs));
	} else if (isDoc) {
		// prosemirror doesn't transform doc, we just changed doc.attrs directly
	} else {
		tr.setNodeMarkup(pos, null, attrs);
	}
	return tr;
};

FocusPlugin.prototype.focus = function(tr, sel) {
	// do not unfocus if view or its document has lost focus
	if (!this.view.hasFocus()) {
		return;
	}
	var parents = this.view.utils.selectionParents(tr, sel);
	var root = parents.length && parents[0].root;
	if (root && (root.mark || root.node).attrs.block_focused == "last") {
		// already done
		return;
	}
	var rootPos = root && root.level && root.rpos.before(root.level);
	var selectedRoot = root && tr.selection.node == root.node;

	var me = this;

	var changes = [];

	if (root) {
		changes.push({
			pos: rootPos,
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
		me.focusRoot(tr, change.pos, change.node, change.focus);
	}

	if (selectedRoot) {
		var el = this.view.element((root.mark || root.node).attrs.block_type);
		if (!el.inline) {
			sel = new State.NodeSelection(tr.doc.resolve(rootPos));
			tr.setSelection(sel);
		}
	}
	return tr.setMeta('focus-plugin', parents).setMeta('focus-selection', sel);
};

function isParentOf(parent, node) {
	if (!node) return false;
	while (node) {
		if (parent == node) return true;
		node = node.parentNode;
	}
	return false;
}

