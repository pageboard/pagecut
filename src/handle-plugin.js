var State = require("prosemirror-state");

module.exports = function(main, options) {
	var handler = new Handler(main, options);
	return new State.Plugin({
		props: {
			handleClick: handler.click,
			handleDOMEvents: {
				mousedown: handler.mousedown.bind(handler),
				mouseup: handler.mouseup.bind(handler),
				drop: handler.mouseup.bind(handler)
			}
		}
	});
};

function Handler(main, options) {
	this.main = main;
}



function createDOMHandle(doc, attrs) {
	var div = doc.createElement("div");
	div.innerHTML = "+";
	div.className = "block-handle";
	return div;
}


Handler.prototype.mousedown = function(view, e) {
	this.dragging = true;
	var dom = e.target;
	if (dom.nodeType == Node.TEXT_NODE) dom = dom.parentNode;
	// get root node
	var pos = this.main.posFromDOM(dom);
	if (pos === false) {
		return;
	}
	var cobj = this.main.parents(view.state.tr.doc.resolve(pos));
	var root = cobj.root;
	if (root == null || cobj.content != null || cobj.wrap != null) {
		return;
	}

	// find root DOM node
	var posBefore = root.level ? root.rpos.before(root.level) : root.rpos.pos;
	var rposBefore = view.state.doc.resolve(posBefore);
	var rootDom = this.main.posToDOM(posBefore);

	if (!rootDom) return;

	var handleDom = rootDom.querySelector('[block-handle]');

	if (handleDom) {
		// either rootDom has a handle, in which case e.target must be descendant of it (or it)
		if (!isParentOf(handleDom, e.target)) return;
		// select root node
		var tr = view.state.tr.setSelection(new State.NodeSelection(rposBefore));
		tr.addToHistory = false;
		view.dispatch(tr);
		// drag handle
		e.target.draggable = false;
		handleDom.draggable = true;
		this.dragTarget = handleDom;
	} else if (rootDom.classList.has('ProseMirror-selectednode')) {
		// rootDom is selected
		// drag root
		e.target.draggable = false;
		rootDom.draggable = true;
		this.dragTarget = rootDom;
	} else {
		// let it be handled by pm
	}
};


Handler.prototype.mouseup = function(view, e) {
	if (this.dragging) {
		this.dragging = false;
		if (this.dragTarget) {
			this.dragTarget.draggable = false;
			delete this.dragTarget;
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
