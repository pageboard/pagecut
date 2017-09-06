var State = require("prosemirror-state");

module.exports = function(view, options) {
	var plugin = new TextInputPlugin(options);
	return {
		props: {
			handleTextInput: plugin.handler
		}
	};
};

function TextInputPlugin(options) {
	this.handler = this.handler.bind(this);
}

TextInputPlugin.prototype.handler = function(view, from, to, text) {
	var tr = view.state.tr;
	// return true to disable default insertion
	var parents = view.utils.selectionParents(tr, {from: from, to: to});
	if (!parents.length) return true;
	var parent = parents[0];
	parent = parent.container || parent.root;
	if (tr.selection.node) {
		// change selection to be inside that node
		view.dispatch(
			tr.setSelection(
				State.Selection.near(tr.selection.$from)
			)
		);
		return false;
	}
	if (parent && (parent.node && parent.node.isTextblock || parent.mark)) {
		// it should be all right then
		return false;
	}
	return true;
};
