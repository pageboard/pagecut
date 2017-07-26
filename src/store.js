module.exports = Store;

function Store(editor) {
	this.blocks = {};
	this.editor = editor;
	editor.elements.push(Store.element);


}

Store.element = {
	name: 'id',
	view: function(doc, block) {
		return doc.createElement("div");
	}
};
/*
function mutateNodes(fragment, fn) {
	var len = fragment.childCount;
	var child, childFragment;
	for (var i=0; i < len; i++) {
		child = fragment.child(i);
		childFragment = mutateNodes(child.content, fn);
		var attrs = fn(child);
		if (attrs) {
			child = child.copy(childFragment);
			child.attrs = attrs;
			fragment = fragment.replaceChild(i, child);
		}
	}
	return fragment;
}
*/

