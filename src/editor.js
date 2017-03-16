var Setup = require("prosemirror-example-setup");
var State = require("prosemirror-state");
var Transform = require("prosemirror-transform");
var EditorView = require("prosemirror-view").EditorView;
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

var CreatePlugin = require("./plugin");
var Specs = require("./specs");

var Viewer = global.Pagecut && global.Pagecut.Viewer || require("./viewer");

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
	var main = this;
	this.nodeViews = {};

	opts = Object.assign({
		plugins: []
	}, Editor.defaults, opts);

	this.resolvers = opts.resolvers || [];
	Viewer.call(this, opts);

	this.modifiers.push(focusModifier, typeModifier);

	var spec = {
		nodes: opts.nodes,
		marks: opts.marks
	};

	for (var i=0; i < this.elements.length; i++) {
		Specs.define(main, this.elements[i], spec);
	}

	var editSchema = new Model.Schema(spec);

	var viewNodes = spec.nodes;
	spec.nodes.forEach(function(name, node) {
		var vnode = Object.assign({}, node);
		if (vnode.typeName == "root") {
			vnode.toDOM = function(node) {
				var block = Specs.attrToBlock(node.attrs);
				// nodeToContent calls serializeNode calls toDOM so it's recursive
				block.content = Specs.nodeToContent(main.serializers.view, node);
				return main.render(block);
			};
		}
		viewNodes = viewNodes.update(name, vnode);
	});

	var viewSchema = new Model.Schema({
		nodes: viewNodes,
		marks: spec.marks
	});

	this.serializers = {
		edit: Model.DOMSerializer.fromSchema(editSchema),
		view: Model.DOMSerializer.fromSchema(viewSchema)
	};

	this.serializers.view.renderStructure = function(structure, node, options) {
		// patch out view serializer because prosemirror view partly checks DOM output against specs
		// which is bad for us
		// besides that problem, original code is the same
		var ref = Model.DOMSerializer.renderSpec(options.document || window.document, structure);
		var dom = ref.dom;
		var contentDOM = ref.contentDOM;
		if (node) {
			if (contentDOM) {
				if (options.onContent) {
					options.onContent(node, contentDOM, options);
				} else {
					this.serializeFragment(node.content, options, contentDOM);
				}
			}
		}
		return dom;
	};

	this.parsers = {
		edit: Model.DOMParser.fromSchema(editSchema)
	};

	opts.plugins.push(
		CreatePlugin(main, opts),
		Input.inputRules({
			rules: Input.allInputRules.concat(Setup.buildInputRules(editSchema))
		}),
		keymap(Setup.buildKeymap(editSchema, opts.mapKeys)),
		keymap(Commands.baseKeymap),
		history(),
		CreateResolversPlugin(main, opts),
		DropCursor(opts)
	);

	var place = typeof opts.place == "string" ? document.querySelector(opts.place) : opts.place;

	var view = this.view = new EditorView({mount: place}, {
		state: State.EditorState.create({
			schema: editSchema,
			plugins: opts.plugins,
			doc: opts.content ? this.parsers.edit.parse(opts.content) : undefined
		}),
		domParser: this.parsers.edit,
		domSerializer: this.serializers.edit,
		dispatchTransaction: function(tr) {
			if (!opts.update || !opts.update(main, tr)) {
				if (opts.change && tr.docChanged) {
					var changedBlock = actionAncestorBlock(main, tr);
					if (changedBlock) opts.change(main, changedBlock);
				}
				view.updateState(view.state.apply(tr));
				if (main.menu) main.menu.update(view);
			}
		},
		nodeViews: this.nodeViews
	});
}

Object.assign(Editor.prototype, Viewer.prototype);

Editor.prototype.set = function(dom) {
	var content = this.view.state.doc.content;
	this.delete(new State.TextSelection(0, content.offsetAt(content.childCount)));
	this.insert(dom, new State.NodeSelection(this.view.state.doc.resolve(0)));
};

Editor.prototype.get = function(edition) {
	// in an offline document
	var serializer = edition ? this.serializers.edit : this.serializers.view;
	return serializer.serializeFragment(this.view.state.doc.content, {
		document: this.doc
	});
};

Editor.prototype.resolve = function(thing) {
	var obj = {};
	if (typeof thing == "string") obj.url = thing;
	else obj.node = thing;
	var main = this;
	var syncBlock;
	this.resolvers.some(function(resolver) {
		syncBlock = resolver(main, obj, function(err, block) {
			var pos = syncBlock && syncBlock.pos;
			if (pos == null) return;
			delete syncBlock.pos;
			if (err) {
				console.error(err);
				main.remove(pos);
			} else {
				if (syncBlock.focused) block.focused = true;
				else delete block.focused;
				main.replace(block, pos);
			}
		});
		if (syncBlock) return true;
	});
	return syncBlock;
};

Editor.prototype.insert = function(dom, sel) {
	var view = this.view;
	var tr = view.state.tr;
	if (!sel) sel = tr.selection;
	if (!(dom instanceof Node)) {
		dom = this.render(dom, true);
	}
	var shouldBeInline = false;
	if (dom.childNodes.length == 0 && dom.hasAttribute('block-content') == false) {
		dom.textContent = '-';
		shouldBeInline = true;
	}
	var frag = this.parse(dom, {
		topNode: sel.$from.parent
	});
	var root, type;
	if (frag.content.length == 1) {
		root = frag.content[0];
		if (root) type = root.type || {};
	}

	var from = sel.from;
	var to = sel.to;
	if (type && type.isInline) {
		if (!shouldBeInline) console.warn('Node rendered as block but parsed as inline', dom);
		var mark = root.marks[0];
		if (!mark) return;
		if (view.state.doc.rangeHasMark(from, to, mark.type)) {
			tr = tr.removeMark(from, to, mark.type);
		}
		view.dispatch(tr.addMark(from, to, mark.type.create(mark.attrs)));
	} else {
		if (shouldBeInline) console.warn('Node rendered as inline but parsed as block', dom);
		view.dispatch(tr.replaceWith(from, to, frag));
	}
};

Editor.prototype.delete = function(sel) {
	var view = this.view;
	var tr = view.state.tr;
	if (!sel) sel = tr.selection;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	view.dispatch(tr.delete(start, end));
};

Editor.prototype.parse = function(dom, opts) {
	if (!dom) return;
	var parent = dom.ownerDocument.createDocumentFragment();
	parent.appendChild(dom);
	var node = this.parsers.edit.parse(parent, opts);
	return node.content;
};

Editor.prototype.refresh = function(dom) {
	var pos = this.posFromDOM(dom);
	if (pos === false) return;
	var block = this.resolve(dom);
	if (!block) return;
	var view = this.view;
	view.dispatch(view.state.tr.setNodeType(pos, null, Specs.blockToAttr(block)));
};

Editor.prototype.select = function(obj) {
	var $pos, pos, root;
	var state = this.view.state;
	if (obj instanceof State.Selection) {
		var infos = this.selectionParents(obj);
		if (infos.length) {
			root = infos[0].root;
			$pos = root.rpos;
		}
	} else {
		if (obj instanceof Model.ResolvedPos) {
			$pos = obj;
		} else {
			if (obj instanceof Node) pos = this.posFromDOM(obj);
			else pos = obj;
			if (typeof pos == "number") $pos = state.doc.resolve(pos);
			else return false;
		}
		var info = this.parents($pos, false, true);
		root = info && info.root;
	}
	if (!root) {
		return false;
	}
	var sel;
	if (root.node instanceof Model.Mark) {
		var nodeBefore = root.rpos.nodeBefore;
		var nodeAfter = root.rpos.nodeAfter;

		var start = root.rpos.pos;
		if (nodeBefore && Model.Mark.sameSet(nodeBefore.marks, [root.node])) {
			start = start - root.rpos.nodeBefore.nodeSize;
		}
		var end = root.rpos.pos;
		if (nodeAfter && Model.Mark.sameSet(nodeAfter.marks, [root.node])) {
			end = end + root.rpos.nodeAfter.nodeSize;
		}
		return State.TextSelection.create(state.doc, start, end);
	} else {
		return new State.NodeSelection($pos);
	}
};

Editor.prototype.replace = function(by, sel) {
	// sel can be ResolvedPos or pos or dom node or a selection
	sel = this.select(sel);
	if (!sel) return false;
	this.insert(by, sel);
	return true;
};

Editor.prototype.remove = function(src) {
	var sel = this.select(src);
	if (!sel) return false;
	return this.delete(sel);
};

Editor.prototype.posFromDOM = function(dom) {
	var offset = 0;
	if (dom != this.view.dom) {
		var sib = dom;
		while (sib = sib.previousSibling) offset++;
		dom = dom.parentNode;
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

Editor.prototype.parents = function(rpos, all, marksAfter) {
	var node, type, obj, level = rpos.depth, ret = [];
	while (level >= 0) {
		if (!obj) obj = {};
		node = rpos.node(level);
		type = node.type && node.type.spec.typeName;
		if (!type && level == rpos.depth) {
			// let's see if we have an inline block
			var marks = rpos.marks(!!marksAfter);
			if (marks.length) {
				for (var k=0; k < marks.length; k++) {
					type = marks[k].type && marks[k].type.spec.typeName;
					if (type) {
						node = marks[k];
						break;
					}
				}
			}
		}
		if (type) {
			obj[type] = {rpos: rpos, level: level, node: node};
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

Editor.prototype.selectionParents = function(sel) {
	var fromParents = this.parents(sel.$from, true, true);
	if (sel.empty) return fromParents;
	var toParents = this.parents(sel.$to, true, false);
	var parents = [];
	var from, to;
	for (var i = 1; i <= fromParents.length && i < toParents.length; i++) {
		from = fromParents[fromParents.length - i];
		to = toParents[toParents.length - i];
		if (from.root.node == to.root.node) parents.unshift(from);
		else break;
	}
	return parents;
};

Editor.prototype.nodeToBlock = function(node) {
	var block = Specs.attrToBlock(node.attrs);
	var main = this;
	if (node instanceof Model.Mark) return block;
	Object.defineProperty(block, 'content', {
		get: function() {
			// this operation is not cheap
			return Specs.nodeToContent(main.serializers.edit, node);
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
		if ($from.node(d).canReplaceWith(index, index, nodeType, attrs)) {
			return true;
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

function actionAncestorBlock(main, tr) {
	// returns the ancestor block modified by this transaction
	var steps = tr.steps;
	var roots = [];
	steps.forEach(function(step) {
		var parents = main.parents(main.view.state.doc.resolve(step.from), true);
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
		block = main.nodeToBlock(rootNode);
	} else {
		block = {
			type: 'fragment',
			content: {}
		};
		Object.defineProperty(block.content, 'fragment', {
			get: function() {
				// this operation is not cheap
				return main.serializers.edit.serializeFragment(main.view.state.doc);
			}
		});
	}
	return block;
}

function focusModifier(main, block, dom) {
	if (block.focused) dom.setAttribute('block-focused', 'true');
	else dom.removeAttribute('block-focused');
}

function typeModifier(main, block, dom) {
	if (!dom.hasAttribute('block-type')) dom.setAttribute('block-type', block.type);
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

function CreateResolversPlugin(main, opts) {
	return new State.Plugin({
		props: {
			transformPasted: function(pslice) {
				var sel = main.view.state.selection;
				var frag = fragmentReplace(pslice.content, UrlRegex(), function(str, pos) {
					var block = main.resolve(str);
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

