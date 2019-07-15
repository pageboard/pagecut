const State = require("prosemirror-state");
const Model = require("prosemirror-model");

module.exports = function(view, options) {
	return {
		props: new InputPlugin(view, options)
	};
};

function InputPlugin(view, options) {
	this.clipboardTextParser = this.clipboardTextParser.bind(this);
	this.transformPasted = this.transformPasted.bind(this);
	this.view = view;
}

InputPlugin.prototype.handleTextInput = function(view, from, to, text) {
	var tr = view.state.tr;
	// return true to disable default insertion
	var parents = view.utils.selectionParents(tr, {from: from, to: to});
	if (!parents.length) return true;
	var parent = parents[0];
	var root = parent.container || parent.root;
	if (tr.selection.node && tr.selection.node.isTextblock) {
		// change selection to be inside that node
		view.dispatch(
			tr.setSelection(
				State.Selection.near(tr.selection.$from)
			)
		);
		return false;
	}
	if (root && root.node && (root.node.isTextblock || root.node.type.name == "_") || parent.inline) {
		// it should be all right then
		return false;
	}
	return true;
};

InputPlugin.prototype.transformPasted = function(slice) {
	var view = this.view;
	view.utils.fragmentApply(slice.content, function(node) {
		var focusable = node.type.defaultAttrs.focused === null;
		if (focusable) node.attrs.focused = null;
		var id = node.attrs.id;
		if (!id) return; // keep id so standalones children can keep their id
		var block = view.blocks.get(id);
		if (block && focusable) {
			delete block.focused;
		}
	});
	slice.content = view.utils.fill(slice.content);
	return slice;
};

InputPlugin.prototype.clipboardTextParser = function(str, $context) {
	if (str instanceof Model.Slice) {
		return str;
	}
	var dom = this.view.utils.parseHTML(str);
	return this.view.someProp("clipboardParser").parseSlice(dom, {
		preserveWhitespace: true,
		context: $context
	});
};



