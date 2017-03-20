var State = require("prosemirror-state");

module.exports = function(main, options) {
	var handler = new Handler(main, options);
	return new State.Plugin({
		props: {
			handleClick: handler.click
		},
		state: {
			init: function(config, state) {
				return {};
			},
			apply: handler.action
		}
	});
};

function Handler(main, options) {
	this.main = main;

	this.action = this.action.bind(this);
	this.click = this.click.bind(this);
}

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

function createDOMHandle(doc, attrs) {
	var div = doc.createElement("div");
	div.innerHTML = "+";
	div.className = "block-handle";
	return div;
}

Handler.prototype.focus = function(view, $pos) {
	var parents = this.main.parents($pos);
	var root = parents.root;
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
		while (parents = this.main.parents(root.rpos)) {
			if (!parents.root || parents.root.node == root.node) break;
			root = parents.root;
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

