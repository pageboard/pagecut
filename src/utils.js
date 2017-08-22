var State = require("prosemirror-state");
var Model = require("prosemirror-model");
var Commands = require("prosemirror-commands");

module.exports = Utils;

function Utils(view) {
	this.view = view;
}

Utils.prototype.equal = require("esequal");

Utils.prototype.setDom = function(dom) {
	if (dom.nodeType != Node.DOCUMENT_FRAGMENT_NODE) {
		var frag = dom.ownerDocument.createDocumentFragment();
		while (dom.firstChild) {
			frag.appendChild(dom.firstChild);
		}
		dom = frag;
	}
	var state = this.view.state;
	var tr = state.tr;
	this.insertTr(tr, dom, new State.AllSelection(state.doc));
	if (!tr) {
		console.error("Cannot insert", dom);
		return;
	}
	var sel = tr.selection;
	if (!sel.empty) tr.setSelection(State.Selection.atStart(state.doc));
	tr.setMeta('addToHistory', false);
	this.view.dispatch(tr);

	// TODO find a better place to set this
	var id = this.view.dom.getAttribute('block-id');
	var block = this.view.blocks.get(id);
	var content = this.view.dom.getAttribute('block-content') || Object.keys(block.content)[0];
	block.content[content] = this.view.dom;
};

Utils.prototype.getDom = function() {
	// in an offline document
	return this.view.serializer.serializeFragment(this.view.state.doc.content, {
		document: this.view.doc
	});
};

Utils.prototype.insert = function(dom, sel) {
	var tr = this.view.state.tr;
	if (this.insertTr(tr, dom, sel)) {
		this.view.dispatch(tr);
	}
};

Utils.prototype.insertTr = function(tr, dom, sel) {
	if (!sel) sel = tr.selection;
	if (!(dom instanceof Node)) {
		dom = this.view.render(dom);
	}

	var opts = {};
	var parent = sel.$from.parent;
	if (!parent.isTextblock) {
		opts.topNode = parent;
	}
	var frag = this.parse(dom, opts);
	var node;
	if (frag.content.length == 1) {
		node = frag.content[0];
	}

	var from = sel.from;
	var to = sel.to;
	var doc = this.view.state.doc;

	if (from == to) {
		if (parent.isTextblock && sel.$from.parentOffset == 0) {
			from = sel.$from.before();
		}
		// now insert after
		if (sel.$from.nodeAfter) {
			from = from + sel.$from.nodeAfter.nodeSize;
			tr.setSelection(State.TextSelection.create(doc, from));
		}
		tr.replaceRangeWith(from, from, frag);
	} else {
		tr.replaceRangeWith(from, to, frag);
	}
	return true;
};

Utils.prototype.delete = function(sel) {
	var tr = this.view.state.tr;
	this.deleteTr(tr, sel);
	this.view.dispatch(tr);
};

Utils.prototype.deleteTr = function(tr, sel) {
	if (!sel) sel = tr.selection;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	tr.delete(start, end);
};

Utils.prototype.parse = function(dom, opts) {
	if (!dom) return;
	if (dom.nodeType != Node.DOCUMENT_FRAGMENT_NODE) {
		var parent = dom.ownerDocument.createDocumentFragment();
		parent.appendChild(dom);
		dom = parent;
	}
	var node = this.view.parser.parse(dom, opts);
	return node.content;
};

Utils.prototype.refresh = function(dom) {
	var tr = this.refreshTr(this.view.state.tr, dom);
	if (!tr) console.error("Cannot refresh", dom);
	else this.view.dispatch(tr);
};

Utils.prototype.refreshTr = function(tr, dom) {
	var pos = this.posFromDOM(dom);
	if (pos === false) return;
	var id = dom.getAttribute('block-id');
	if (id == null) return;
	var block = this.view.blocks.get(id);
	if (!block) return;
	var attrs = this.blockToAttr(block);
	var type = dom.getAttribute('block-type');
	if (type) attrs.block_type = type; // dom can override block.type
	return tr.setNodeType(pos, null, attrs);
};

Utils.prototype.attrToBlock = function(attrs) {
	var block = {};
	for (var name in attrs) {
		if (name.startsWith('block_')) block[name.substring(6)] = attrs[name];
	}
	if (block.data) block.data = JSON.parse(block.data);
	else block.data = {};
	block.content = {};
	return block;
};

Utils.prototype.blockToAttr = function(block) {
	var attrs = {};
	if (!block) return attrs;
	if (block.id != null) attrs.block_id = block.id;
	if (block.type != null) attrs.block_type = block.type;
	if (block.data) attrs.block_data = JSON.stringify(block.data);
	if (block.focused) attrs.block_focused = block.focused;
	if (attrs.block_data == "{}") delete attrs.block_data;
	return attrs;
};

Utils.prototype.selectDom = function(node) {
	var pos = this.posFromDOM(node);
	var tr = this.view.state.tr;
	var $pos = tr.doc.resolve(pos);
	var sel;
	if (node.nodeType != Node.ELEMENT_NODE) {
		sel = new State.TextSelection($pos);
	} else {
		if (!$pos.nodeAfter) {
			if (node.parentNode && node.parentNode != this.view.dom) this.selectDom(node.parentNode);
			else console.warn("cannot select node", node);
			return;
		}
		sel = new State.NodeSelection($pos);
	}
	this.view.dispatch(tr.setSelection(sel));
};

Utils.prototype.select = function(obj, textSelection) {
	return this.selectTr(this.view.state.tr, obj, textSelection);
};

Utils.prototype.selectTr = function(tr, obj, textSelection) {
	var info, pos;
	if (obj instanceof State.Selection) {
		info = this.selectionParents(tr, obj).shift();
	} else {
		if (obj instanceof Model.ResolvedPos) {
			pos = obj.pos;
		} else {
			if (obj instanceof Node) {
				if (obj == this.view.dom) {
					return new State.AllSelection(tr.doc);
				} else {
					pos = this.posFromDOM(obj);
				}
			} else {
				pos = obj;
			}
		}
		if (typeof pos != "number") return;
		info = this.parents(tr, pos);
	}
	if (!info) {
		return false;
	}
	var root = info.root;
	if (!root) {
		return false;
	}
	var $pos = root.rpos;
	var $rootPos = root.level ? tr.doc.resolve(root.rpos.before(root.level)) : root.rpos;

	var sel;
	if (!$pos.nodeAfter) textSelection = true;
	if (root.mark) {
		var nodeBefore = root.rpos.nodeBefore;
		var nodeAfter = root.rpos.nodeAfter;

		var start = root.rpos.pos;
		if (nodeBefore && Model.Mark.sameSet(nodeBefore.marks, [root.mark])) {
			start = start - root.rpos.nodeBefore.nodeSize;
		}
		var end = root.rpos.pos;
		if (nodeAfter && Model.Mark.sameSet(nodeAfter.marks, [root.mark])) {
			end = end + root.rpos.nodeAfter.nodeSize;
		}
		return State.TextSelection.create(tr.doc, start, end);
	} else if (textSelection) {
		if (tr.selection.node) {
			return State.TextSelection.create(tr.doc, $pos.pos, $pos.pos);
		} else {
			return tr.selection;
		}
	} else {
		if (root.node == this.view.state.doc) {
			return new State.AllSelection(root.node);
		} else {
			return new State.NodeSelection($rootPos);
		}
	}
};

Utils.prototype.replace = function(by, sel) {
	var tr = this.replaceTr(this.view.state.tr, by, sel);
	if (!tr) console.error("Cannot replace", sel);
	else this.view.dispatch(tr);
};

Utils.prototype.replaceTr = function(tr, by, sel, textSelection) {
	// sel can be ResolvedPos or pos or dom node or a selection
	sel = this.selectTr(tr, sel, textSelection);
	if (!sel) return false;
	return this.insertTr(tr, by, sel);
};

Utils.prototype.remove = function(src) {
	var tr = this.removeTr(src);
	if (!tr) console.error("Cannot remove", src);
	else this.view.dispatch(tr);
};

Utils.prototype.removeTr = function(src) {
	var sel = this.selectTr(tr, src);
	if (!sel) return false;
	return this.deleteTr(tr, sel);
};

Utils.prototype.posFromDOM = function(dom) {
	var offset = 0;
	if (dom != this.view.dom) {
		var sib = dom;
		while (sib = sib.previousSibling) {
			offset++;
		}
		dom = dom.parentNode;
	}
	if (!dom) {
		console.warn("FIXME", "cannot find posFromDOM of a dom node without parent", dom);
		return false;
	}
	var pos;
	try {
		pos = this.view.docView.posFromDOM(dom, offset, 0);
	} catch(ex) {
		console.info(ex);
		pos = false;
	}
	return pos;
};

Utils.prototype.posToDOM = function(pos) {
	if (pos == null) return;
	try {
		var fromPos = this.view.docView.domFromPos(pos);
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
};

Utils.prototype.parents = function(tr, pos, all, before) {
	var rpos = tr.doc.resolve(pos);
	var depth = rpos.depth + 1;
	var mark, node, type, obj, level = depth, ret = [];
	var jumped = false;
	while (level >= 0) {
		mark = null;
		if (!obj) obj = {};
		if (level == depth) {
			node = before ? rpos.nodeBefore : rpos.nodeAfter;
			type = node && node.type.spec.typeName;
			if (!type) {
				// let's see if we have an inline block
				var marks = rpos.marks(!before);
				if (marks.length) {
					for (var k=0; k < marks.length; k++) {
						type = marks[k].type && marks[k].type.spec.typeName;
						if (type) {
							mark = marks[k];
							break;
						}
					}
				}
			}
		} else {
			node = rpos.node(level);
			type = node.type && node.type.spec.typeName;
		}
		if (type) {
			obj[type] = {rpos: rpos, level: level, node: node};
			if (mark) obj[type].mark = mark;
		}
		if ((type == "container" || level != depth) && node && node.attrs.block_content) {
			if (!obj.container) obj.container = obj.root || {};
			obj.container.name = node.attrs.block_content;
		}
		if (type == "root") {
			if (!all) break;
			ret.push(obj);
			obj = null;
		}
		level--;
	}
	if (all) return ret;
	else return obj;
};

Utils.prototype.selectionParents = function(tr, sel) {
	if (!sel) sel = tr.selection;
	if (sel instanceof State.AllSelection) {
		return [{root: {node: this.view.state.doc}}];
	}
	var fromParents = this.parents(tr, sel.from, true, false);
	if (sel.empty) return fromParents;
	var toParents = this.parents(tr, sel.to, true, true);
	var parents = [];
	var from, to;
	for (var i = 1; i <= fromParents.length && i <= toParents.length; i++) {
		from = fromParents[fromParents.length - i];
		to = toParents[toParents.length - i];
		if (from.root.node == to.root.node) parents.unshift(from);
		else break;
	}
	return parents;
};

Utils.prototype.canMark = function(sel, nodeType) {
	var state = this.view.state;
	var can = sel.$from.depth == 0 ? state.doc.contentMatchAt(0).allowsMark(nodeType) : false;
	state.doc.nodesBetween(sel.from, sel.to, function(node) {
		if (can) return false;
		can = node.inlineContent && node.contentMatchAt(0).allowsMark(nodeType);
	});
	return can;
};

Utils.prototype.canInsert = function($pos, nodeType, attrs) {
	for (var d = $pos.depth; d >= 0; d--) {
		var index = $pos.index(d);
		var node = $pos.node(d);
		if (node.canReplaceWith(index, index, nodeType, attrs)) {
			return true;
		} else if (!node.isTextblock) {
			if (node.type.spec.typeName) break; // we only check one parent block
		}
	}
	return false;
};

Utils.prototype.markActive = function(sel, nodeType) {
	var state = this.view.state;
	if (sel.empty) {
		return nodeType.isInSet(state.storedMarks || sel.$from.marks());
	}	else {
		return state.doc.rangeHasMark(sel.from, sel.to, nodeType);
	}
};

Utils.prototype.toggleMark = function(nodeType) {
	return Commands.toggleMark(nodeType);
};

Utils.prototype.fragmentApply = fragmentApply;

function fragmentApply(frag, fun) {
	var list = [];
	frag.forEach(function(child) {
		var copy;
		if (child.isText) {
			copy = child.copy(child.text.slice());
		} else {
			copy = child.copy(fragmentApply(child.content, fun));
		}
		var added = fun(copy, list);
		if (!added) {
			list.push(copy);
		}
	});
	return Model.Fragment.fromArray(list);
}

