function CreateCoedPlugin(coed, options) {
	var coedHandler = new CoedHandler(coed, options);
	return new coed.State.Plugin({
		props: {
			handleClick: coedHandler.click,
			handleDOMEvent: coedHandler.event
		},
		state: {
			init: function(config, state) {
				return {};
			},
			applyAction: coedHandler.action
		}
	});
}

function CoedHandler(coed, options) {
	this.coed = coed;

	this.event = this.event.bind(this);
	this.action = this.action.bind(this);
	this.click = this.click.bind(this);

	this.command = this.command.bind(this);

	options.plugins.unshift(coed.keymap({
		Enter: this.command
	}));
}

CoedHandler.prototype.command = function(state, onAction, view) {
	var bef = state.tr.selection.$to.nodeBefore;

	if (bef && bef.type.name == "hard_break") {
		this.coed.Commands.deleteCharBefore(state, onAction);
		// just let other plugins split the block properly
		return false;
	} else {
		onAction(state.tr.replaceSelection(state.schema.nodes.hard_break.create()).scrollAction());
		return true;
	}
};

CoedHandler.prototype.event = function(view, e) {
	if (e.type == "mousedown") {
		return this.mousedown(view, e);
	} else if (e.type == "mouseup" || e.type == "drop") {
		return this.mouseup(view, e);
	}
};

CoedHandler.prototype.click = function(view, pos, e) {
	this.focus(view, view.state.doc.resolve(pos));
};

CoedHandler.prototype.action = function(action) {
	if (action.type != "selection") return;
	if (this.dragging) return;
	var sel = action.selection;
	if (!sel.empty) return;
	this.focus(this.coed.view, sel.$from);
};

CoedHandler.prototype.focus = function(view, $pos) {
	var parents = this.coed.parents($pos);
	var pos = parents.pos.root;
	var node = parents.node.root;
	var me = this;
	var dom = node && posToNode(this.coed, view, pos);
	var flist = [];
	var foc;
	var fitems = this.coed.view.content.querySelectorAll('[block-focused]');
	for (var i=0; i < fitems.length; i++) {
		foc = fitems.item(i);
		if (!dom || !isParentOf(foc, dom)) {
			foc.removeAttribute('block-focused');
			flist.push(foc);
		}
	}
	flist.forEach(function(foc) {
		me.coed.refresh(foc);
	});
	if (dom) {
		dom.setAttribute('block-focused', '');
		this.coed.refresh(dom);
	}
};

CoedHandler.prototype.mousedown = function(view, e) {
	this.dragging = true;
	var dom = e.target;
	if (dom.nodeType == Node.TEXT_NODE) dom = dom.parentNode;
	var pos = this.coed.posFromDOM(dom);
	if (pos === false) {
		return;
	}
	var cobj = this.coed.parents(view.state.tr.doc.resolve(pos));
	var cpos = cobj.pos;
	if (cpos.root == null || cpos.content != null || cpos.wrap != null) {
		return;
	}
	e.target.draggable = false;

	var $root = view.state.tr.doc.resolve(cpos.root);

	var action = view.state.tr.setSelection(new this.coed.State.NodeSelection($root)).action();
	view.updateState(view.state.applyAction(action));

	var dom = posToNode(this.coed, view, cpos.root);
	if (dom) dom = dom.querySelector('[block-handle]');
	if (dom) {
		dom.draggable = true;
		this.dragTarget = dom;
	} else {
		//return true; // let pm handle that for now...
	}
};

CoedHandler.prototype.mouseup = function(view, e) {
	if (this.dragging) {
		this.dragging = false;
		if (this.dragTarget) {
			this.dragTarget.draggable = false;
			delete this.dragTarget;
			// this is a workaround
			setTimeout(function() {
				var action = view.state.tr.setSelection(new coed.State.TextSelection(view.state.tr.selection.$from)).action();
				view.updateState(view.state.applyAction(action));
			});
		}
	}
};

function posToNode(coed, view, pos) {
	if (pos == null) return;
	try {
		var fromPos = coed.view.docView.domFromPos(pos);
		if (fromPos) {
			var dom = fromPos.node;
			var offset = fromPos.offset;
			if (dom.nodeType == 1 && offset < dom.childNodes.length) {
				dom = dom.childNodes.item(offset);
			}
			return dom;
		}
	} catch(ex) {
		return false;
	}
}

function isParentOf(parent, node) {
	if (!node) return false;
	while (node) {
		if (parent == node) return true;
		node = node.parentNode;
	}
	return false;
}

module.exports = CreateCoedPlugin;

