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
	// return true to disable default insertion
	var parents = view.utils.selectionParents(view.state.tr, {from: from, to: to});
	if (!parents.length) return true;
	var parent = parents[0];
	parent = parent.container || parent.root;
	if (parent && (parent.node && parent.node.isTextblock || parent.mark)) return false;
	return true;
};
