var State = require("prosemirror-state");
var Model = require("prosemirror-model");
var Commands = require("prosemirror-commands");
var Slice = Model.Slice;

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
	if (!block.content) {
		console.warn("unsupported case: setting a block dom node that has no content");
		return;
	}
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
	if (this.insertTr(tr, dom, sel) != null) {
		this.view.dispatch(tr);
	}
};

Utils.prototype.insertTr = function(tr, dom, sel) {
	if (!sel) sel = tr.selection;
	if (!(dom instanceof Node)) {
		dom = this.view.render(dom);
	}
	var type = dom.nodeType == Node.ELEMENT_NODE && dom.getAttribute('block-type');
	var opts = {
		context: sel.$to
	};
	var parent = sel.$from.parent;
	var nodeType = type && this.view.state.schema.nodes[type];
	var replaceableInParent = nodeType && this.canInsert(sel.$to, nodeType);
	if (replaceableInParent) {
//		opts.topNode = replaceableInParent;
	}
	var slice = this.parse(dom, opts);

	var from = sel.from;
	var to = sel.to;
	var doc = this.view.state.doc;

	var fromto = from;
	if (from == to || sel.node) {
		var $pos = sel.$to;
		var depth = $pos.resolveDepth();
		if ($pos.parentOffset == $pos.parent.nodeSize - 2 && depth) {
			fromto = to = from = $pos.after();
		} else if ($pos.parentOffset == 0 && depth) {
			fromto = to = from = $pos.before();
		} else if (parent.isTextblock) {
			to = from;
			fromto = from + 1;
		}
	}
	tr.replaceRange(from, to, slice);
	return fromto;
};

function normalizeSiblings(slice, $context) {
	if (slice.content.childCount < 2) return slice
	for (let d = $context.depth; d >= 0; d--) {
		let parent = $context.node(d)
		let match = parent.contentMatchAt($context.index(d))
		let lastWrap, result = []
		slice.content.forEach(node => {
			if (!result) return
			let wrap = match.findWrapping(node.type), inLast
			if (!wrap) return result = null
			if (inLast = result.length && lastWrap.length && addToSibling(wrap, lastWrap, node, result[result.length - 1], 0)) {
				result[result.length - 1] = inLast
			} else {
				if (result.length) result[result.length - 1] = closeRight(result[result.length - 1], lastWrap.length)
				let wrapped = withWrappers(node, wrap)
				result.push(wrapped)
				match = match.matchType(wrapped.type, wrapped.attrs)
				lastWrap = wrap
			}
		})
		if (result) return Slice.maxOpen(Fragment.from(result))
	}
	return slice
}

function withWrappers(node, wrap, from = 0) {
	for (let i = wrap.length - 1; i >= from; i--)
		node = wrap[i].create(null, Fragment.from(node))
	return node
}

// Used to group adjacent nodes wrapped in similar parents by
// normalizeSiblings into the same parent node
function addToSibling(wrap, lastWrap, node, sibling, depth) {
	if (depth < wrap.length && depth < lastWrap.length && wrap[depth] == lastWrap[depth]) {
		let inner = addToSibling(wrap, lastWrap, node, sibling.lastChild, depth + 1)
		if (inner) return sibling.copy(sibling.content.replaceChild(sibling.childCount - 1, inner))
		let match = sibling.contentMatchAt(sibling.childCount)
		if (match.matchType(depth == wrap.length - 1 ? node.type : wrap[depth + 1]))
			return sibling.copy(sibling.content.append(Fragment.from(withWrappers(node, wrap, depth + 1))))
	}
}

function closeRight(node, depth) {
	if (depth == 0) return node
	let fragment = node.content.replaceChild(node.childCount - 1, closeRight(node.lastChild, depth - 1))
	let fill = node.contentMatchAt(node.childCount).fillBefore(Fragment.empty, true)
	return node.copy(fragment.append(fill))
}

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
	var slice = this.view.parser.parseSlice(dom, opts);
	slice = closeIsolatingStart(slice);
	slice = normalizeSiblings(slice, opts.context);

	return slice;
};


function closeIsolatingStart(slice) {
  let closeTo = 0, frag = slice.content
  for (let i = 1; i <= slice.openStart; i++) {
    let node = frag.firstChild
    if (node.type.spec.isolating) { closeTo = i; break }
    frag = node.content
  }

  if (closeTo == 0) return slice
  return new Slice(closeFragment(slice.content, closeTo, slice.openEnd), slice.openStart - closeTo, slice.openEnd)
}

function closeFragment(frag, n, openEnd) {
  if (n == 0) return frag
  let node = frag.firstChild
  let content = closeFragment(node.content, n - 1, openEnd - 1)
  let fill = node.contentMatchAt(0).fillBefore(node.content, openEnd <= 0)
  return frag.replaceChild(0, node.copy(fill.append(content)))
}

Utils.prototype.refresh = function(dom, block) {
	var tr = this.refreshTr(this.view.state.tr, dom, block);
	if (!tr) console.error("Cannot refresh", dom);
	else this.view.dispatch(tr);
};

Utils.prototype.refreshTr = function(tr, dom, block) {
	var pos = this.posFromDOM(dom);
	if (pos === false) return;
	var parent = this.parents(tr, pos);
	if (!parent) return;
	var root = parent.root;
	if (!block) {
		var id = (root.mark || root.node).attrs.block_id;
		if (!id) return;
		block = this.view.blocks.get(id);
		if (!block) return; // nothing to refresh
	}
	var attrs = this.view.blocks.toAttrs(block);
	var type = dom.getAttribute('block-type');
	if (type) attrs.block_type = type; // dom can override block.type
	else type = block.type;
	if (root.mark) {
		var sel = this.selectTr(tr, parent);
		if (!sel) return tr;
		tr.removeMark(sel.from, sel.to, root.mark);
		tr.addMark(sel.from, sel.to, root.mark.type.create(attrs));
	} else {
		var sel = tr.selection;
		var selectedNode = sel.from === pos && sel.node;
		if (!attrs.block_id && root.node.attrs.block_focused) {
			// block.focused cannot be stored here since it is inplace
			attrs.block_focused = root.node.attrs.block_focused;
		}
		tr.setNodeMarkup(pos, null, attrs);
		if (selectedNode) {
			tr.setSelection(new State.NodeSelection(tr.doc.resolve(pos)));
		}
	}
	return tr;
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
	if (obj.root && obj.root.rpos) {
		info = obj;
	} else if (obj instanceof State.Selection) {
		info = this.selectionParents(tr, obj).shift();
	} else {
		if (obj instanceof Model.ResolvedPos) {
			pos = obj.pos;
		} else {
			if (obj instanceof Node) {
				if (obj == this.view.dom) {
					return new State.AllSelection(tr.doc);
				} else if (obj.pmViewDesc) {
					if (textSelection || obj.pmViewDesc.mark) {
						return State.TextSelection.create(tr.doc, obj.pmViewDesc.posAtStart, obj.pmViewDesc.posAtEnd);
					} else {
						return new State.NodeSelection(tr.doc.resolve(obj.pmViewDesc.posBefore));
					}
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
			node = before ? rpos.nodeBefore || rpos.nodeAfter : rpos.nodeAfter || rpos.nodeBefore;
			type = node && node.type.spec.typeName;
			if (!type) {
				// let's see if we have an inline block
				if (node && node.marks.length) {
					for (var k=0; k < node.marks.length; k++) {
						type = node.marks[k].type && node.marks[k].type.spec.typeName;
						if (type) {
							mark = node.marks[k];
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
	var can = sel.$from.depth == 0 ? state.doc.type.allowsMarkType(nodeType) : false;
	state.doc.nodesBetween(sel.from, sel.to, function(node) {
		if (can) return false;
		can = node.inlineContent && node.type.allowsMarkType(nodeType);
	});
	return can;
};

Utils.prototype.canInsert = function($pos, nodeType, attrs) {
	for (var d = $pos.depth; d >= 0; d--) {
		var index = $pos.index(d);
		var node = $pos.node(d);
		if (node.canReplaceWith(index, index, nodeType, attrs)) {
			return node;
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

Utils.prototype.toggleMark = function(nodeType, attrs) {
	return Commands.toggleMark(nodeType, attrs);
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

