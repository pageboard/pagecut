var Setup = require("prosemirror-example-setup");
var State = require("prosemirror-state");
var Transform = require("prosemirror-transform");
var Menu = require("prosemirror-menu");
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
var Viewer = require("./viewer");

Object.assign(Editor.prototype, Viewer.prototype);

Editor.defaults = {};
Editor.defaults.nodeSpec = baseSchema.nodeSpec.remove('image');
Editor.defaults.nodeSpec = listSchema.addListNodes(
	Editor.defaults.nodeSpec,
	"paragraph block*",
	"block"
);
// Editor.defaults.nodeSpec = tableSchema.addTableNodes(
// 	Editor.defaults.nodeSpec, "inline<_>*", "block"
// );

Editor.defaults.markSpec = baseSchema.markSpec;


function EditorMenu(opts) {
	this.menubar = opts.menubar;
}

EditorMenu.prototype.init = function(main, schema) {
	var items = Setup.buildMenuItems(schema);
	this.menu = items.fullMenu;
};

EditorMenu.prototype.update = function(view) {
	this.menubar.textContent = ""
	this.menubar.classList.add('ProseMirror-menu');
	this.menubar.appendChild(Menu.renderGrouped(view, this.menu));
};

module.exports = {
	Editor: Editor,
	EditorMenu: EditorMenu,
	Model: Model,
	State: State,
	Setup: Setup,
	Transform: Transform,
	Menu: Menu,
	Commands: Commands,
	keymap: keymap
};

function Editor(opts) {
	var main = this;
	this.nodeViews = {};

	opts = Object.assign({
		plugins: []
	}, Editor.defaults, opts);

	this.resolvers = opts.resolvers || {};
	Viewer.call(this, opts);

	if (!this.modifiers.focus) this.modifiers.focus = focusModifier;

	var spec = {
		nodes: opts.nodeSpec,
		marks: opts.markSpec
	};
	Object.keys(this.elements).forEach(function(k) {
		Specs.define(main, main.elements[k], spec);
	});

	var editSchema = new Model.Schema(spec);

	var viewNodes = spec.nodes;
	spec.nodes.forEach(function(name, node) {
		var vnode = Object.assign({}, node);
		if (vnode.typeName == "root") {
			vnode.toDOM = function(node) {
				var type = node.type.typeName;
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

	var view = this.view = new EditorView(function(viewContent) {
		// this use a prosemirror-view patch that allows us to return content
		return place;
	}, {
		state: State.EditorState.create({
			schema: editSchema,
			plugins: opts.plugins,
			doc: opts.content ? this.parsers.edit.parse(opts.content) : undefined
		}),
		domParser: this.parsers.edit,
		domSerializer: this.serializers.edit,
		dispatchTransaction: function(transaction) {
			if (!opts.update || !opts.update(main, transaction)) {
				if (opts.change) {
					var changedBlock = actionAncestorBlock(main, transaction);
					if (changedBlock) opts.change(main, changedBlock);
				}
				view.updateState(view.state.apply(transaction));
				if (main.menu) main.menu.update(view);
			}
		},
		nodeViews: this.nodeViews
	});

	this.menu = opts.menubar && new module.exports.EditorMenu(opts);
	if (this.menu) {
		this.menu.init(this, editSchema);
		if (!opts.content) this.menu.update(view);
	}
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
	Object.keys(this.resolvers).some(function(k) {
		syncBlock = main.resolvers[k](main, obj, function(err, block) {
			var pos = syncBlock && syncBlock.pos;
			if (pos == null) return;
			delete syncBlock.pos;
			if (err) {
				console.error(err);
				main.remove(pos);
			} else {
				if (syncBlock.focused) block.focused = true;
				else delete block.focused;
				main.replace(pos, block);
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
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	view.dispatch(tr.replaceWith(start, end, this.parse(dom)));
};

Editor.prototype.delete = function(sel) {
	var view = this.view;
	var tr = view.state.tr;
	if (!sel) sel = tr.selection;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	view.dispatch(tr.delete(start, end));
};

Editor.prototype.parse = function(dom) {
	if (!dom) return;
	var frag = dom.ownerDocument.createDocumentFragment();
	frag.appendChild(dom);
	return this.parsers.edit.parseSlice(frag, {
		// TODO topNode: ???
	}).content;
};

Editor.prototype.refresh = function(dom) {
	var pos = this.posFromDOM(dom);
	if (pos === false) return;
	var block = this.resolve(dom);
	if (!block) return;
	var view = this.view;
	view.dispatch(view.state.tr.setNodeType(pos, null, Specs.blockToAttr(block)));
};

Editor.prototype.select = function(dom) {
	var pos = typeof dom == "number" ? dom : this.posFromDOM(dom);
	if (pos === false) return false;
	var $pos = this.view.state.doc.resolve(pos);
	return new this.State.NodeSelection($pos);
};

Editor.prototype.replace = function(src, dst) {
	var sel = this.select(src);
	if (!sel) return false;
	if (!(dst instanceof Node)) {
		dst = this.render(dst, true);
	}
	this.insert(dst, sel);
	return true;
};

Editor.prototype.remove = function(src) {
	var sel = this.select(src);
	if (!sel) return false;
	return this.delete(sel);
};

Editor.prototype.posFromDOM = function(dom) {
	var offset = 0, sib = dom;
	while (sib = sib.previousSibling) offset++;

	var pos;
	try {
		pos = this.view.docView.posFromDOM(dom.parentNode, offset, 0);
	} catch(ex) {
		console.info(ex);
		pos = false;
	}
	return pos;
};

Editor.prototype.parents = function(rpos, all) {
	var node, type, pos, obj, level = rpos.depth, ret = [];
	while (level >= 0) {
		if (!obj) obj = {pos: {}, node: {}};
		node = rpos.node(level);
		type = node.type && node.type.spec.typeName;
		if (type) {
			obj.pos[type] = rpos.before(level);
			obj.node[type] = node;
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

function actionAncestorBlock(main, transaction) {
	// returns the ancestor block modified by this transaction
	if (!transaction.docChanged) return;
	var steps = transaction.steps;
	var roots = [];
	steps.forEach(function(step) {
		var parents = main.parents(main.view.state.doc.resolve(step.from), true);
		parents.forEach(function(obj) {
			var root = obj.node.root;
			if (!root) return;
			var found = false;
			for (var i=0; i < roots.length; i++) {
				if (roots[i].root == root) {
					roots[i].count++;
					found = true;
					break;
				}
			}
			if (!found) roots.push({
				count: 1,
				root: root
			});
		});
	});
	for (var i=0; i < roots.length; i++) {
		if (roots[i].count == steps.length) {
			var node = roots[i].root;
			var block = Specs.attrToBlock(node.attrs);
			Object.defineProperty(block, 'content', {
				get: function() {
					// this operation is not cheap
					return Specs.nodeToContent(main.serializers.edit, node);
				}
			});
			return block;
		}
	}
}

function focusModifier(main, block, dom) {
	if (dom.nodeType == Node.DOCUMENT_NODE) dom = dom.documentElement;
	if (block.focused) dom.setAttribute('block-focused', 'true');
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

