var Setup = require("prosemirror-example-setup");
var State = require("prosemirror-state");
var Transform = require("prosemirror-transform");
var View = require("prosemirror-view");
var Model = require("prosemirror-model");
var Input = require("prosemirror-inputrules");
var keymap = require("prosemirror-keymap").keymap;
var Commands = require("prosemirror-commands");
var DropCursor = require("prosemirror-dropcursor").dropCursor;
var history = require("prosemirror-history").history;

var baseSchema = require("prosemirror-schema-basic").schema;
var listSchema = require("prosemirror-schema-list");
// var tableSchema = require("prosemirror-schema-table");

var UrlRegex = require('url-regex');

var FocusPlugin = require("./focus-plugin");
var HandlePlugin = require("./handle-plugin");
var BreakPlugin = require("./break-plugin");

var Specs = require("./specs");

var Viewer = global.Pagecut && global.Pagecut.Viewer || require("./viewer");

Editor.prototype = Object.create(View.EditorView.prototype);
Object.assign(Editor.prototype, Viewer.prototype);

Editor.defaults = {};
Editor.defaults.nodes = baseSchema.spec.nodes.remove('image');
Editor.defaults.nodes = listSchema.addListNodes(
	Editor.defaults.nodes,
	"paragraph block*",
	"block"
);
// Editor.defaults.nodes = tableSchema.addTableNodes(
// 	Editor.defaults.nodes, "inline<_>*", "block"
// );

Editor.defaults.marks = baseSchema.spec.marks;

module.exports = {
	Editor: Editor,
	View: View,
	Model: Model,
	State: State,
	Setup: Setup,
	Transform: Transform,
	Commands: Commands,
	keymap: keymap,
	Viewer: Viewer,
	modules: global.Pagecut && global.Pagecut.modules || {}
};

function Editor(opts) {
	var editor = this;

	opts = Object.assign({
		plugins: []
	}, Editor.defaults, opts);

	this.resolvers = opts.resolvers || [];
	Viewer.call(this, opts);

	this.modifiers.unshift(focusModifier);

	var spec = {
		nodes: opts.nodes,
		marks: opts.marks,
		topNode: opts.topNode
	};

	var nodeViews = {};

	this.elements.forEach(function(el) {
		Specs.define(editor, el, spec);
		if (el.nodeView) nodeViews[el.name] = el.nodeView;
	});

	this.schemas = {};

	this.schemas.edit = new Model.Schema(spec);

	var viewNodes = spec.nodes;
	spec.nodes.forEach(function(name, node) {
		var vnode = Object.assign({}, node);
		if (vnode.typeName == "root") {
			vnode.toDOM = function(node) {
				var block = Specs.attrToBlock(node.attrs);
				// nodeToContent calls serializeNode calls toDOM so it's recursive
				block.content = Specs.nodeToContent(editor.serializers.view, node);
				return editor.render(block);
			};
		}
		viewNodes = viewNodes.update(name, vnode);
	});

	this.schemas.view = new Model.Schema({
		nodes: viewNodes,
		marks: spec.marks,
		topNode: opts.topNode
	});

	this.serializers = {
		edit: Model.DOMSerializer.fromSchema(this.schemas.edit),
		view: Model.DOMSerializer.fromSchema(this.schemas.view)
	};

	this.parsers = {
		edit: Model.DOMParser.fromSchema(this.schemas.edit)
	};

	this.plugins.push(
		BreakPlugin,
		HandlePlugin,
		FocusPlugin,
	function(editor) {
		return Input.inputRules({
			rules: Input.allInputRules.concat(Setup.buildInputRules(editor.schemas.edit))
		});
	}, function(editor, opts) {
		return keymap(Setup.buildKeymap(editor.schemas.edit, opts.mapKeys));
	}, function(editor) {
		return keymap(Commands.baseKeymap);
	}, function() {
		return history();
	}, CreateResolversPlugin, function(editor, opts) {
		return DropCursor(opts);
	});

	var plugins = opts.plugins.map(function(plugin) {
		if (plugin instanceof State.Plugin) return plugin;
		if (typeof plugin == "function") {
			plugin = plugin(editor, opts);
		}
		if (plugin instanceof State.Plugin) return plugin;
		if (plugin.update || plugin.destroy) {
			var obj = plugin;
			plugin = {view: function() {
				return this;
			}.bind(plugin)};
		}
		if (plugin.key && typeof plugin.key == "string") plugin.key = new State.PluginKey(plugin.key);
		return new State.Plugin(plugin);
	});

	var place = typeof opts.place == "string" ? document.querySelector(opts.place) : opts.place;

	View.EditorView.call(this, {mount: place}, {
		state: State.EditorState.create({
			schema: this.schemas.edit,
			plugins: plugins,
			doc: opts.content ? this.parsers.edit.parse(opts.content) : undefined
		}),
		domParser: this.parsers.edit,
		domSerializer: this.serializers.edit,
		dispatchTransaction: function(tr) {
			editor.updateState(editor.state.apply(tr));
		},
		nodeViews: nodeViews
	});
}

Object.assign(Editor.prototype, Viewer.prototype, View.EditorView);


Editor.prototype.getPlugin = function(key) {
	return new State.PluginKey(key).get(this.state);
};

Editor.prototype.set = function(dom) {
	if (dom.nodeType != Node.DOCUMENT_FRAGMENT_NODE) {
		var frag = dom.ownerDocument.createDocumentFragment();
		while (dom.firstChild) frag.appendChild(dom.firstChild);
		dom = frag;
	}
	this.insert(dom, new State.AllSelection(this.state.doc));
};

Editor.prototype.get = function(edition) {
	// in an offline document
	var serializer = edition ? this.serializers.edit : this.serializers.view;
	return serializer.serializeFragment(this.state.doc.content, {
		document: this.doc
	});
};

Editor.prototype.resolve = function(thing) {
	var obj = {};
	if (typeof thing == "string") obj.url = thing;
	else obj.node = thing;
	var editor = this;
	var syncBlock;
	this.resolvers.some(function(resolver) {
		syncBlock = resolver(editor, obj, function(err, block) {
			var pos = syncBlock && syncBlock.pos;
			if (pos == null) return;
			delete syncBlock.pos;
			if (err) {
				console.error(err);
				editor.remove(pos);
			} else {
				if (syncBlock.focused) block.focused = true;
				else delete block.focused;
				editor.replace(block, pos);
			}
		});
		if (syncBlock) return true;
	});
	return syncBlock;
};

Editor.prototype.insert = function(dom, sel) {
	var tr = this.insertTr(this.state.tr, dom, sel);
	if (!tr) console.error("Cannot insert", dom);
	else this.dispatch(tr);
};

Editor.prototype.insertTr = function(tr, dom, sel) {
	if (!sel) sel = tr.selection;
	if (!(dom instanceof Node)) {
		dom = this.render(dom, true);
	}
	var shouldBeInline = false;
	if (dom.childNodes.length == 0 && dom.hasAttribute('block-content') == false) {
		dom.textContent = '-';
		shouldBeInline = true;
	}

	var opts = {};
	var parent = sel.$from.parent;
	if (!parent.isTextblock || shouldBeInline) {
		opts.topNode = parent;
	}
	var frag = this.parse(dom, opts);
	var node, type;
	if (frag.content.length == 1) {
		node = frag.content[0];
	}

	var from = sel.from;
	var to = sel.to;
	if (shouldBeInline) {
		var mark = node.marks[0];
		if (!mark) return;
		if (this.state.doc.rangeHasMark(from, to, mark.type)) {
			tr = tr.removeMark(from, to, mark.type);
		}
		return tr.addMark(from, to, mark.type.create(mark.attrs));
	} else {
		tr = tr.replaceWith(from, to, frag);
		if (node) {
			if (parent.isTextblock) from = from + 1; // because it splits text block
			sel = this.selectTr(tr, from);
			if (sel) tr = tr.setSelection(sel);
		}
		return tr;
	}
};

Editor.prototype.delete = function(sel) {
	var tr = this.deleteTr(this.state.tr, sel);
	if (!tr) console.error("Cannot delete", sel);
	else this.dispatch(tr);
};

Editor.prototype.deleteTr = function(tr, sel) {
	if (!sel) sel = tr.selection;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	return tr.delete(start, end);
};

Editor.prototype.parse = function(dom, opts) {
	if (!dom) return;
	if (dom.nodeType != Node.DOCUMENT_FRAGMENT_NODE) {
		var parent = dom.ownerDocument.createDocumentFragment();
		parent.appendChild(dom);
		dom = parent;
	}
	var node = this.parsers.edit.parse(dom, opts);
	return node.content;
};

Editor.prototype.refresh = function(dom) {
	var tr = this.refreshTr(this.state.tr, dom);
	if (!tr) console.error("Cannot refresh", dom);
	else this.dispatch(tr);
};

Editor.prototype.refreshTr = function(tr, dom) {
	var pos = this.posFromDOM(dom);
	if (pos === false) return;
	var block = this.resolve(dom);
	if (!block) return;
	return tr.setNodeType(pos, null, Specs.blockToAttr(block));
};


Editor.prototype.select = function(obj, textSelection) {
	return this.selectTr(this.state.tr, obj, textSelection);
};

Editor.prototype.selectTr = function(tr, obj, textSelection) {
	var info, pos;
	if (obj instanceof State.Selection) {
		info = this.selectionParents(tr, obj).shift();
	} else {
		if (obj instanceof Model.ResolvedPos) {
			pos = obj.pos;
		} else {
			if (obj instanceof Node) {
				if (obj == this.dom) {
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
		if (root.node == this.state.doc) {
			return new State.AllSelection(root.node);
		} else {
			return new State.NodeSelection($rootPos);
		}
	}
};

Editor.prototype.replace = function(by, sel) {
	var tr = this.replaceTr(this.state.tr, by, sel);
	if (!tr) console.error("Cannot replace", sel);
	else this.dispatch(tr);
};

Editor.prototype.replaceTr = function(tr, by, sel) {
	// sel can be ResolvedPos or pos or dom node or a selection
	sel = this.selectTr(tr, sel);
	if (!sel) return false;
	return this.insertTr(tr, by, sel);
};

Editor.prototype.remove = function(src) {
	var tr = this.removeTr(src);
	if (!tr) console.error("Cannot remove", src);
	else this.dispatch(tr);
};

Editor.prototype.removeTr = function(src) {
	var sel = this.selectTr(tr, src);
	if (!sel) return false;
	return this.deleteTr(tr, sel);
};

Editor.prototype.posFromDOM = function(dom) {
	var offset = 0;
	if (dom != this.dom) {
		var sib = dom;
		while (sib = sib.previousSibling) offset++;
		dom = dom.parentNode;
	}
	var pos;
	try {
		pos = this.docView.posFromDOM(dom, offset, 0);
	} catch(ex) {
		console.info(ex);
		pos = false;
	}
	return pos;
};

Editor.prototype.posToDOM = function(pos) {
	if (pos == null) return;
	try {
		var fromPos = this.docView.domFromPos(pos);
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

Editor.prototype.parents = function(tr, pos, all, before) {
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
		if (level != depth && node && node.attrs.block_content) {
			if (!obj.content) obj.content = obj.root || {};
			obj.content.name = node.attrs.block_content;
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

Editor.prototype.selectionParents = function(tr, sel) {
	if (!sel) sel = tr.selection;
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

Editor.prototype.nodeToBlock = function(node) {
	var block = Specs.attrToBlock(node.attrs);
	var editor = this;
	if (node instanceof Model.Mark) return block;
	Object.defineProperty(block, 'content', {
		get: function() {
			// this operation is not cheap
			return Specs.nodeToContent(editor.serializers.edit, node);
		}
	});
	return block;
};

Editor.prototype.canMark = function(state, nodeType) {
	var can = state.doc.contentMatchAt(0).allowsMark(nodeType);
	var sel = state.tr.selection;
	state.doc.nodesBetween(sel.from, sel.to, function(node) {
		if (can) return false;
		can = node.isTextblock && node.contentMatchAt(0).allowsMark(nodeType);
	});
	return can;
};

Editor.prototype.canInsert = function(state, nodeType, attrs) {
	var $from = state.selection.$from;
	for (var d = $from.depth; d >= 0; d--) {
		var index = $from.index(d);
		var node = $from.node(d);
		if (node.canReplaceWith(index, index, nodeType, attrs)) {
			return true;
		} else {
			if (node.type.spec.typeName) break; // we only check one parent block
		}
	}
	return false;
};

Editor.prototype.markActive = function(state, type) {
	var sel = state.selection;
	if (sel.empty) {
		return type.isInSet(state.storedMarks || sel.$from.marks());
	}	else {
		return state.doc.rangeHasMark(sel.from, sel.to, type);
	}
};

function actionAncestorBlock(editor, tr) {
	// returns the ancestor block modified by this transaction
	var steps = tr.steps;
	var roots = [];
	steps.forEach(function(step) {
		var parents = editor.parents(tr, step.from, true);
		parents.forEach(function(obj) {
			var root = obj.root;
			if (!root) return;
			var found = false;
			for (var i=0; i < roots.length; i++) {
				if (roots[i].root == root.node) {
					roots[i].count++;
					found = true;
					break;
				}
			}
			if (!found) roots.push({
				count: 1,
				root: root.node
			});
		});
	});
	var rootNode;
	roots.some(function(root) {
		if (root.count != steps.length) return;
		rootNode = root.root;
		return true;
	});
	if (rootNode) {
		block = editor.nodeToBlock(rootNode);
	} else {
		block = {
			type: 'fragment',
			content: {}
		};
		Object.defineProperty(block.content, 'fragment', {
			get: function() {
				// this operation is not cheap
				return editor.serializers.edit.serializeFragment(editor.state.doc);
			}
		});
	}
	return block;
}

function focusModifier(editor, block, dom) {
	if (block.focused) dom.setAttribute('block-focused', block.focused);
	else dom.removeAttribute('block-focused');
}

function fragmentReplace(fragment, regexp, replacer) {
	var list = [];
	var child, node, start, end, pos, m, str;
	for (var i = 0; i < fragment.childCount; i++) {
		child = fragment.child(i);
		if (child.isText) {
			pos = 0;
			while (m = regexp.exec(child.text)) {
				start = m.index;
				end = start + m[0].length;
				if (start > 0) list.push(child.copy(child.text.slice(pos, start)));
				str = child.text.slice(start, end);
				node = replacer(str, pos) || "";
				list.push(node);
				pos = end;
			}
			if (pos < child.text.length) list.push(child.copy(child.text.slice(pos)));
		} else {
			list.push(child.copy(fragmentReplace(child.content, regexp, replacer)));
		}
	}
	return Model.Fragment.fromArray(list);
}

function CreateResolversPlugin(editor, opts) {
	return new State.Plugin({
		props: {
			transformPasted: function(pslice) {
				var sel = editor.state.tr.selection;
				var frag = fragmentReplace(pslice.content, UrlRegex(), function(str, pos) {
					var block = editor.resolve(str);
					if (block) {
						block.pos = pos + sel.from + 1;
						return main.parse(main.render(block, true)).firstChild;
					}
				});
				return new Model.Slice(frag, pslice.openLeft, pslice.openRight);
			}
		}
	});
}

