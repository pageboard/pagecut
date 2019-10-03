const State = require("prosemirror-state");
const Model = require("prosemirror-model");
const Commands = require("prosemirror-commands");

module.exports = Utils;

function Utils(view) {
	this.view = view;
}

Utils.prototype.equal = require("fast-deep-equal");

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
	this.insertTr(tr, dom, new State.AllSelection(tr.doc));
	if (!tr) {
		console.error("Cannot insert", dom);
		return;
	}
	var sel = tr.selection;
	if (!sel.empty) tr.setSelection(State.Selection.atStart(tr.doc));
	tr.setMeta('addToHistory', false);
	this.view.dispatch(tr);

	// TODO find a better place to set this
	var id = this.view.dom.getAttribute('block-id');
	var block = this.view.blocks.get(id);
	if (!id) {
		console.error("Missing block-id attribute on", this.view.dom);
		return;
	}
	if (!block) {
		console.error("Root block not found for", this.view.dom);
		return;
	}
	if (!block.content) {
		console.warn("unsupported case: setting a block dom node that has no content");
		return;
	}
	var el = this.view.element(block.type);
	el.contents.set(block, this.view.dom);
};

Utils.prototype.getDom = function() {
	// in an offline document
	return this.view.viewSerializer.serializeFragment(this.view.state.doc.content, {
		document: this.view.doc.cloneNode(false) // offline
	});
};

Utils.prototype.insert = function(dom, sel) {
	var tr = this.view.state.tr;
	if (this.insertTr(tr, dom, sel) != null) {
		this.view.dispatch(tr);
	}
};

Utils.prototype.splitTr = function(tr) {
	// before or inside or after and check we can
	var sel = tr.selection;
	var $pos = sel.$to;
	var type = sel.$from.parent.type;
	var atEnd = $pos.parentOffset == $pos.parent.nodeSize - 2;
	var atStart = $pos.parentOffset == 0;
	var depthStart = this.canInsert($pos, type, true, false).depth;
	var depthEnd = atEnd ? this.canInsert($pos, type, true, true).depth : null;
	var fromto = sel.from;
	var splitto = sel.from;
	if (atStart && depthStart != null) {
		splitto = $pos.start(depthStart + 1);
		fromto = sel.from - 1;
	} else if (depthEnd != null) {
		splitto = fromto = $pos.end(depthEnd + 1);
	} else if (depthStart != null) {
		splitto = fromto = $pos.pos;
	} else {
		return;
	}
	tr.split(splitto);
	return fromto;
};

Utils.prototype.insertTr = function(tr, dom, sel) {
	if (!sel) sel = tr.selection;
	if (!dom.ownerDocument) {
		dom = this.view.render(dom);
	}
	var parent = sel.$from.parent;
	// when replacing current selection, parse sel.$from
	// when appending after selection, parse sel.$to
	var slice = this.parse(dom, sel.node ? sel.$to : sel.$from);

	var from = sel.from;
	var to = sel.to;

	var fromto = from;
	if (slice.content.childCount == 1 && (from == to || sel.node)) {
		var frag = this.fill(slice.content);
		var node = frag.firstChild;
		var atStart = !sel.node && sel.$from.parentOffset == 0;
		var insertPos;
		if (atStart) {
			insertPos = this.insertPoint(tr, from+1, node.type, -1, true);
		}
		if (insertPos == null) {
			insertPos = this.insertPoint(tr, to-1, node.type, 1, true);
		}
		if (insertPos != null) {
			tr.insert(insertPos, node);
			return insertPos;
		}
		if (parent.isTextblock && !node.isInline) {
			tr.split(from);
			fromto = from + 1;
		}
		slice = new Model.Slice(frag, 0, 0);
		to = from = fromto;
	}
	tr.replaceRange(from, to, slice);
	return fromto;
};

Utils.prototype.fill = function(frag) {
	if (!(frag instanceof Model.Fragment)) frag = Model.Fragment.from(frag);
	var list = [];
	frag.forEach((node) => {
		var content = node.content;
		if (content.size) {
			var before = node.type.contentMatch.fillBefore(content);
			if (before) {
				content = before.append(content);
			}
		}
		var match = node.type.contentMatch.matchFragment(content);
		if (match) {
			var after = match.fillBefore(Model.Fragment.empty, true);
			if (after) content = content.append(after);
		}
		list.push(node.copy(this.fill(content)));
	});
	return Model.Fragment.from(list);
};

Utils.prototype.delete = function(sel) {
	var tr = this.view.state.tr;
	this.deleteTr(tr, sel);
	this.view.dispatch(tr);
};

Utils.prototype.deleteTr = function(tr, sel) {
	if (!sel) sel = tr.selection;
	if (sel.empty) return;
	if (sel.node && sel.node.type.name == "_") return;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	tr.delete(start, end);
	return true;
};

Utils.prototype.parse = function(dom, $pos) {
	return this.view.parseFromClipboard(dom, $pos);
};

Utils.prototype.refresh = function(dom, block) {
	var tr = this.refreshTr(this.view.state.tr, dom, block);
	if (!tr) console.error("Cannot refresh", dom);
	else this.view.dispatch(tr);
};

Utils.prototype.refreshTr = function(tr, dom, block) {
	var pos;
	if (dom instanceof Model.ResolvedPos) {
		pos = dom.pos;
		dom = null;
	} else {
		pos = this.posFromDOM(dom);
	}
	if (pos === false) return;
	var parent = this.parents(tr, pos);
	if (!parent) return;
	var root = parent.root;
	if (!block) {
		var id = (parent.inline && parent.inline.node.marks.find(function(mark) {
			return mark.attrs.id != null;
		}) || root.node).attrs.id;
		if (!id) return;
		block = this.view.blocks.get(id);
		if (!block) return; // nothing to refresh
	}
	var attrs = this.view.blocks.toAttrs(block);
	var type = dom && dom.getAttribute('block-type');
	if (type) attrs.type = type; // dom can override block.type
	else type = block.type;

	var sel = tr.selection;
	var node;

	if (parent.inline) {
		node = parent.inline.node;
		if (sel.empty) node.marks.forEach(function(mark) {
			if (attrs.id && attrs.id != mark.attrs.id) return;
			var markType = mark.attrs.type;
			if (!markType || type != markType) return;
			if (mark.attrs.focused) {
				// block.focused cannot be stored here since it is inplace
				attrs.focused = mark.attrs.focused;
			}
			let [exFrom, exTo] = this.extendUpdateMark(tr, sel.from, sel.to, mark, attrs);
			tr.setSelection(State.TextSelection.create(tr.doc, exFrom, exTo));
		}, this);
		else {
			var markType = this.view.schema.marks[type];
			if (markType) tr.addMark(sel.from, sel.to, markType.create(attrs));
		}
	}
	node = parent.root.node;
	if (!attrs.id && node.attrs.focused) {
		// block.focused cannot be stored here since it is inplace
		attrs.focused = node.attrs.focused;
	}
	if (attrs.id && attrs.id != node.attrs.id) return tr;
	var selectedNode = sel.from === pos && sel.node;
	try {
		tr.setNodeMarkup(pos, null, attrs);
	} catch(ex) {
		// ignore
		selectedNode = false;
	}
	if (selectedNode) {
		tr.setSelection(new State.NodeSelection(tr.doc.resolve(pos)));
	}
	return tr;
};

Utils.prototype.selectDom = function(node, textSelection) {
	var pos = this.posFromDOM(node);
	var tr = this.view.state.tr;
	var $pos = tr.doc.resolve(pos);
	var sel;
	if (node.nodeType != Node.ELEMENT_NODE || textSelection) {
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
	var parent, pos;
	if (obj.root && obj.root.rpos) {
		parent = obj;
	} else if (obj instanceof State.Selection) {
		parent = this.selectionParents(tr, obj).shift();
	} else {
		if (obj instanceof Model.ResolvedPos) {
			pos = obj.pos;
		} else {
			if (obj.ownerDocument == this.view.dom.ownerDocument) {
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
		parent = this.parents(tr, pos);
	}
	if (!parent) {
		return false;
	}
	var root = parent.root;
	if (!root) {
		return false;
	}
	var $pos = root.rpos;
	var $rootPos = root.level ? tr.doc.resolve(root.rpos.before(root.level)) : root.rpos;

	if (!$pos.nodeAfter) textSelection = true;
	if (parent.inline && !parent.inline.node.isLeaf) {
		var nodeBefore = root.rpos.nodeBefore;
		var nodeAfter = root.rpos.nodeAfter;

		var start = root.rpos.pos;
		if (nodeBefore && Model.Mark.sameSet(nodeBefore.marks, parent.inline.node.marks)) {
			start = start - root.rpos.nodeBefore.nodeSize;
		}
		var end = root.rpos.pos;
		if (nodeAfter && Model.Mark.sameSet(nodeAfter.marks, parent.inline.node.marks)) {
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
		if (root.node == tr.doc) {
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
	var tr = this.removeTr(this.view.state.tr, src);
	if (!tr) console.error("Cannot remove", src);
	else this.view.dispatch(tr);
};

Utils.prototype.removeTr = function(tr, src) {
	var sel = this.selectTr(tr, src);
	if (!sel) return false;
	return this.deleteTr(tr, sel);
};

Utils.prototype.posFromDOM = function(dom) {
	var offset = 0;
	if (dom != this.view.dom) {
		var sib = dom;
		while ((sib = sib.previousSibling)) {
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
		pos = this.view.posAtDOM(dom, offset, 0);
	} catch(ex) {
		console.info(ex);
		pos = false;
	}
	return pos;
};

Utils.prototype.posToDOM = function(pos) {
	if (pos == null) return;
	try {
		return this.view.nodeDOM(pos);
	} catch(ex) {
		return false;
	}
};

Utils.prototype.parents = function(tr, pos, all, before) {
	var rpos = tr.doc.resolve(pos);
	var depth = rpos.depth + 1;
	var node, type, obj, level = depth, ret = [];
	while (level >= 0) {
		if (!obj) obj = {};
		if (level == depth) {
			node = rpos.node(level);
			if (!node) {
				if (before) {
					node = rpos.nodeBefore;
				} else {
					node = rpos.nodeAfter;
				}
			}
			type = node && node.type.spec.typeName;
		} else {
			node = rpos.node(level);
			type = node.type && node.type.spec.typeName;
		}
		if (type && type != "const") {
			obj[type] = {rpos: rpos, level: level, node: node};
		}
		if (node) {
			if (node.marks && node.marks.length) {
				obj.inline = {
					node: node,
					rpos: rpos
				};
			}
			if ((type == "container" || level != depth) && node.attrs.content) {
				if (!obj.container) obj.container = obj.root || {};
				obj.container.name = node.attrs.content;
			}
			if (type == "root") {
				var el = node.type.spec.element;
				if (!el.inline && el.contents.firstId) {
					if (!obj.container) obj.container = obj.root || {};
					obj.container.name = el.contents.firstId;
				}
			}
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
		return [{root: {node: tr.doc}}];
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
	try {
		state.doc.nodesBetween(sel.from, sel.to, function(node) {
			if (can) return false;
			can = node.inlineContent && node.type.allowsMarkType(nodeType);
		});
	} catch(ex) {
		// can fail in some circumstances
	}
	return can;
};

Utils.prototype.canInsert = function($pos, nodeType, all, after) {
	var context = parseContext(nodeType.spec.element && nodeType.spec.element.context);
	var contextOk = !context;
	var found = false;
	var ret = {};
	for (var d = $pos.depth; d >= 0; d--) {
		var index = after ? $pos.indexAfter(d) : $pos.index(d);
		var to = index;
		var node = $pos.node(d);
		if (!found) {
			if ($pos.nodeAfter && d == $pos.depth && $pos.nodeAfter.type.name == "_") {
				to += 1;
			}
			if (node.canReplaceWith(index, to, nodeType)) {
				// check context
				found = true;
				ret.node = node;
				ret.depth = d;
				if (!context) {
					contextOk = true;
					break;
				}
			} else if (!all && !node.isTextblock) {
				if (node.type.spec.typeName) break; // we only check one parent block
			}
		}
		if (found && context) {
			if (checkContext(context, node.type, $pos, d)) {
				contextOk = true;
				break;
			}
		}
	}
	if (!contextOk || !found) return {};
	return ret;
};

function parseContext(context) {
	if (!context) return;
	var list = context.split('|').map(function(str) {
		var pc = str.trim().split('/');
		pc.pop();
		return pc;
	});
	return list;
}

function checkContext(list, type, $pos, d) {
	// does not check nested contexts
	var cands = type.spec.group ? type.spec.group.split(' ') : [];
	cands.push(type.name);
	return list.some(function(pc) {
		var last = pc[pc.length - 1];
		if (!last) {
			if (pc.length == 2 && cands.includes(pc[0])) {
				return true;
			} else {
				return false;
			}
		} else {
			if (cands.includes(last) && d >= $pos.depth - 1) return true;
			else return false;
		}
	});
}

Utils.prototype.insertPoint = function(tr, from, nodeType, dir, jump) {
	from = from + dir;
	var depth;
	var $pos;
	var doc = tr.doc;
	var docSize = doc.content.size;
	while (from >= 0 && from <= docSize) {
		$pos = doc.resolve(from);
		depth = this.canInsert($pos, nodeType, true, dir > 0).depth;
		if (depth != null && depth >= 0) break;
		if (!jump) {
			if (dir == 1 && $pos.nodeAfter) break;
			else if (dir == -1 && $pos.nodeBefore) break;
		}
		from = from + dir;
	}
	if (depth == null) return;
	var npos = dir == 1 ? $pos.after(depth + 1) : $pos.before(depth + 1);
	return npos;
};

Utils.prototype.move = function(tr, dir) {
	var sel = tr.selection;
	var node = sel.node;
	if (!node) return;
	if (node.type.name == "_") return;
	tr.delete(sel.from, sel.to);
	var npos = this.insertPoint(tr, sel.from, node.type, dir, true);
	if (npos == null) return;
	node = node.cut(0);
	tr.insert(npos, node);
	if (tr.doc.content.size > 0) {
		var $npos = tr.doc.resolve(npos);
		if ($npos.nodeAfter) tr.setSelection(new State.NodeSelection($npos));
	}
	return tr;
};

Utils.prototype.markActive = function(sel, nodeType) {
	var state = this.view.state;
	if (sel.empty) {
		return nodeType.isInSet(state.storedMarks || sel.$from.marks());
	}	else {
		return state.doc.rangeHasMark(sel.from, sel.to, nodeType);
	}
};

Utils.prototype.toggleMark = function(type, attrs) {
	return Commands.toggleMark(type, attrs);
};

Utils.prototype.extendUpdateMark = function(tr, from, to, mark, attrs) {
	var hadIt = false;
	if (from != to && tr.doc.rangeHasMark(from, to, mark.type)) {
		hadIt = true;
	}
	while (tr.doc.rangeHasMark(from - 1, from, mark.type)) {
		hadIt = true;
		from--;
	}
	while (tr.doc.rangeHasMark(to, to + 1, mark.type)) {
		hadIt = true;
		to++;
	}
	if (hadIt) {
		tr.removeMark(from, to, mark);
		mark = mark.type.create(attrs);
		tr.addMark(from, to, mark);
	}
	return [from, to];
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

Utils.prototype.serializeHTML = function(dom, children) {
	var html;
	if (dom instanceof Node) {
		if (children || dom instanceof DocumentFragment) {
			html = "";
			var child;
			for (var i=0; i < dom.childNodes.length; i++) {
				child = dom.childNodes[i];
				if (child.nodeType == Node.TEXT_NODE) html += child.nodeValue;
				else html += child.outerHTML;
			}
		} else {
			html = dom.outerHTML;
		}
	} else {
		html = dom;
	}
	return html;
};

Utils.wrapMap = {
	thead: ["table"],
	colgroup: ["table"],
	col: ["table", "colgroup"],
	tr: ["table", "tbody"],
	td: ["table", "tbody", "tr"],
	th: ["table", "tbody", "tr"]
};

Utils.offdoc = document.cloneNode(false);

Utils.prototype.parseHTML = function(html) {
	var metas = /(\s*<meta [^>]*>)*/.exec(html);
	if (metas) {
		html = html.slice(metas[0].length);
	}
	var firstTag = /(?:<meta [^>]*>)*<([a-z][^>\s]+)/i.exec(html);
	var elt = Utils.offdoc.createElement("div");
	var wrap;
	var depth = 0;

	if ((wrap = firstTag && Utils.wrapMap[firstTag[1].toLowerCase()])) {
		html = wrap.map(function(n) {
			return "<" + n + ">";
		}).join("") + html + wrap.map(function(n) {
			return "</" + n + ">";
		}).reverse().join("");
		depth = wrap.length;
	}
	elt.innerHTML = html;
	for (var i = 0; i < depth; i++) {
		elt = elt.firstChild;
	}
	return elt;
};

