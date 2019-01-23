var State = require("prosemirror-state");

module.exports = function(view, options) {
	return new FocusPlugin(view, options);
};

function FocusPlugin(view, options) {
	this.editor = view;
	this.click = this.click.bind(this);
	this.appendTransaction = this.appendTransaction.bind(this);
	this.props = {
		handleClick: this.click
	};
}

function hasParent(parent, node) {
	while (node) {
		if (node == parent) return true;
		node = node.parentNode;
	}
	return false;
}

FocusPlugin.prototype.appendTransaction = function(transactions, oldState, newState) {
	// focus once per transaction
	var itr;
	var editorUpdate = false;
	for (var i=0; i < transactions.length; i++) {
		itr = transactions[i];
		if (itr.getMeta('focus')) {
			return;
		}
		if (itr.getMeta('editor')) {
			editorUpdate = true;
		}
	}
	var tr = newState.tr;
	if (this.action(tr, editorUpdate)) {
		return tr;
	}
};

FocusPlugin.prototype.click = function(view, pos, e) {
	var posObj = view.posAtCoords({
		left: e.clientX,
		top: e.clientY
	});

	pos = posObj.inside < 0 ? pos : posObj.inside;

	var tr = view.state.tr;
	/* this behavior poses more problems than it solves
	var root = view.utils.parents(tr, pos);
	if (root) {
		var rpos = tr.doc.resolve(pos);
		if (tr.selection.node) {
			tr.setSelection(new State.TextSelection(rpos));
			view.dispatch(tr);
		}
	}
	tr = view.state.tr;
	*/

	var dom = view.root.elementFromPoint(e.clientX, e.clientY);
	if (!dom) {
		return;
	}
	var parent = dom;
	var nodeView;
	while (parent) {
		nodeView = parent.pmViewDesc;
		if (nodeView) break;
		parent = parent.parentNode;
	}
	if (!nodeView) {
		return;
	}
	// now find if dom is in view.dom or view.contentDOM
	if (!(
		hasParent(nodeView.dom, dom) || nodeView.contentDOM && hasParent(nodeView.contentDOM, dom)
	)) {
		return;
	}
	if (this.focus(tr, State.TextSelection.create(tr.doc, pos))) {
		view.dispatch(tr);
	}
};

FocusPlugin.prototype.action = function(tr, editorUpdate) {
	var sel = tr.selection;
	// avoid unneeded changes
	if (this.editor.state.tr.selection.eq(sel) && !editorUpdate) return false;
	return this.focus(tr, sel);
};

FocusPlugin.prototype.focusRoot = function(tr, pos, node, focus) {
	var isDoc = node.type.name == tr.doc.type.name;
	// TODO create a new Step that updates doc.attrs
	var attrs = isDoc ? node.attrs : Object.assign({}, node.attrs);
	var prev = attrs.focused;
	if (prev == focus) {
		return;
	}
	if (focus) attrs.focused = focus;
	else delete attrs.focused;
	if (node.type.spec.inline && node.type.spec.element.contents) {
		var sel = this.editor.utils.selectTr(tr, pos);
		tr.removeMark(sel.from, sel.to, node.type);
		tr.addMark(sel.from, sel.to, node.type.create(attrs));
	} else if (isDoc) {
		// prosemirror doesn't transform doc, we just changed doc.attrs directly
	} else {
		tr.setNodeMarkup(pos, null, attrs);
	}
};

FocusPlugin.prototype.focus = function(tr, sel) {
	// do not unfocus if view or its document has lost focus
	if (!this.editor.hasFocus()) {
		return;
	}
	var parents = this.editor.utils.selectionParents(tr, sel);
	var firstParent = parents.length && parents[0];
	var root = firstParent.root;
	var container = firstParent.container;
	var rootPos = root && root.level && root.rpos.before(root.level);
	var selectedRoot = rootPos !== undefined &&
		(
			(root && tr.selection.node == root.node)
			||
			(!root.node.isTextblock && (!container || !container.node.isTextblock))
		);

	var me = this;

	var changes = [];

	if (root) {
		changes.push({
			pos: rootPos,
			node: root.node,
			focus: "last"
		});
		var parent, cur;
		for (var i=1; i < parents.length; i++) {
			parent = parents[i];
			cur = parent.root;
			if (!cur.level) continue;
			changes.push({
				pos: cur.rpos.before(cur.level),
				node: cur.node,
				focus: i == parents.length - 1 ? "first" : "middle"
			});
		}
	}
	function hasChanged(node, pos) {
		if (node.type.spec.typeName == "root") {
			// node is good
		//	} else if (node.marks.length && node.marks[0].type.spec.typeName == "root") {
		//node = node.marks[0]; // disabled for now
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
		if (!changed && node.attrs.focused) changes.unshift({pos:pos, node:node, focus: false});
	}
	hasChanged(tr.doc);
	tr.doc.descendants(hasChanged);

	var change;
	for (var j=0; j < changes.length; j++) {
		change = changes[j];
		try {
			me.focusRoot(tr, change.pos, change.node, change.focus);
		} catch(ex) {
			console.error(ex);
		}
	}

	if (selectedRoot) {
		if (!root.node.isInline || root.node.isLeaf) {
			sel = new State.NodeSelection(tr.doc.resolve(rootPos));
			tr.setSelection(sel);
		}
	}
	return tr.setMeta('focus', true);
};

