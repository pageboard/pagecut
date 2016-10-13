var State = require("prosemirror-state");
var Model = require("prosemirror-model");
var keymap = require("prosemirror-keymap").keymap;
var Commands = require("prosemirror-commands");
var dompos = require("prosemirror-view/dist/dompos");

function CreateCoedPlugin(coed, options) {
	var coedHandler = new CoedHandler(coed, options);
	return new State.Plugin({
		props: {
			handleClick: coedHandler.click,
			handleDOMEvent: coedHandler.event
		},
		stateFields: {
			coed: {
				init: function(config, state) {
					return {};
				},
				applyAction: coedHandler.change
			}
		}
	});
}

function CoedHandler(coed, options) {
	this.coed = coed;
	coed.posFromDOM = dompos.posFromDOM;

	this.event = this.event.bind(this);
	this.change = this.change.bind(this);
	this.click = this.click.bind(this);

	this.command = this.command.bind(this);

	options.plugins.unshift(keymap({
		Enter: this.command
	}));
}

CoedHandler.prototype.command = function(state, onAction, view) {
	var sel = state.selection;
	var bef = sel.$to.nodeBefore;
	var aft = sel.$from.nodeAfter;

	if (sel.empty && (!bef || !aft)) {
		var fam = nodeParents(sel.$to);
		if (fam.pos.root != null) {
			var npos = fam.pos.root + (bef ? fam.node.root.nodeSize : 0);
			var rpos = state.doc.resolve(npos);
			if (!bef) {
				if (rpos.nodeBefore && rpos.nodeBefore.isTextblock) return true;
			}
			if (!aft) {
				if (rpos.nodeAfter && rpos.nodeAfter.isTextblock) return true;
			}
			if (onAction) {
				onAction(state.tr.insertText("\n", npos).scrollAction());
			}
			return true;
		}
	}

	if (bef && bef.type.name == "hard_break") {
		Commands.deleteCharBefore(state, onAction);
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
	var cpos = nodeParents(view.state.doc.resolve(pos)).pos;
	this.focus(view, cpos.root);
};

CoedHandler.prototype.change = function(state, action) {
	if (action.type != "selection") return;
	if (this.dragging) return;
	var sel = action.selection;
	if (!sel.empty) return;
	var cpos = nodeParents(sel.$from).pos;
	this.focus(this.coed.view, cpos.root);
};

CoedHandler.prototype.focus = function(view, pos) {
	var dom = posToNode(view, pos);
	if (this.focused && this.focused != dom && dom !== false) {
		var fparent = this.focused;
		while (fparent && fparent.nodeType == Node.ELEMENT_NODE) {
			if (dom && isParentOf(fparent, dom)) {
				// do not remove attribute
			} else {
				fparent.removeAttribute('coed-focused');
			}
			fparent = fparent.parentNode;
		}
		delete this.focused;
	}
	if (dom) {
		dom.setAttribute("coed-focused", 1);
		this.focused = dom;
	}
};

CoedHandler.prototype.mousedown = function(view, e) {
	this.dragging = true;
	var dom = e.target;
	if (dom.nodeType == Node.TEXT_NODE) dom = dom.parentNode;
	var pos;
	try { pos = dompos.posFromDOM(dom); } catch(ex) {
		console.info(ex);
		return;
	}
	var cpos = nodeParents(view.state.tr.doc.resolve(pos.pos)).pos;
	if (cpos.root == null || cpos.content != null || cpos.wrap != null) {
		return;
	}
	e.target.draggable = false;

	var $root = view.state.tr.doc.resolve(cpos.root);

	var action = view.state.tr.setSelection(new State.NodeSelection($root)).action();
	view.updateState(view.state.applyAction(action));

	var dom = posToNode(view, cpos.root);
	if (dom) dom = dom.querySelector('*'); // select first child element
	if (dom) {
		dom.draggable = true;
		this.dragTarget = dom;
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
				var action = view.state.tr.setSelection(new State.TextSelection(view.state.tr.selection.$from)).action();
				view.updateState(view.state.applyAction(action));
			});
		}
	}
};

function nodeParents(rpos) {
	var level = rpos.depth, node, type, pos;
	var obj = {pos: {}, node: {}};
	while (level >= 0) {
		node = rpos.node(level);
		type = node.type && node.type.spec.coedType;
		if (type) {
			obj.pos[type] = rpos.before(level);
			obj.node[type] = node;
		}
		if (type == "root") break;
		level--;
	}
	return obj;
}

function posToNode(view, pos) {
	if (pos == null) return;
	try {
		var fromPos = dompos.DOMFromPos(view, pos);
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
	while (node = node.parentNode) {
		if (parent == node) return true;
	}
	return false;
}

module.exports = CreateCoedPlugin;



