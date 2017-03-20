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
	// do not drag the target
	e.target.draggable = false;

	// get the root dom node and the handle in it
	var posBefore = root.level ? root.rpos.before(root.level) : root.rpos.pos;
	var rposBefore = view.state.doc.resolve(posBefore);
	var rootDom = this.main.posToDOM(posBefore);
	var handleDom = rootDom && rootDom.querySelector('[block-handle]');

	// this works because the handle is draggable
	// TODO also check e.target has closest('[block-handle]')
	if (handleDom) {
		// select the whole node
		var tr = view.state.tr.setSelection(new State.NodeSelection(rposBefore));
		tr.addToHistory = false;
		view.dispatch(tr);
		// drag the handle only
		handleDom.draggable = true;
		this.dragTarget = handleDom;
	} else {
		//return true; // let pm handle that for now...
	}
};

Handler.prototype.mouseup = function(view, e) {
	var main = this.main;
	if (this.dragging) {
		this.dragging = false;
		if (this.dragTarget) {
			this.dragTarget.draggable = false;
			delete this.dragTarget;
		}
	}
};

