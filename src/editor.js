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
var Viewer = require("./viewer")
Object.assign(Editor.prototype, Viewer.prototype);

Editor.nodeSpec = baseSchema.nodeSpec.remove('image');
Editor.nodeSpec = listSchema.addListNodes(Editor.nodeSpec, "paragraph block*", "block");
// Editor.nodeSpec = tableSchema.addTableNodes(nodeSpec, "inline<_>*", "block");

Editor.markSpec = baseSchema.markSpec;

Editor.menu = defaultMenu;

module.exports = Editor;

function Editor(opts, shared) {
	var main = this;
	this.Model = Model;
	this.State = State;
	this.Transform = Transform;
	this.Menu = Menu;
	this.Commands = Commands;
	this.keymap = keymap;
	this.shared = shared;
	this.nodeViews = {};

	var viewer = new Viewer(opts);
	Object.assign(this, viewer);

	opts = Object.assign({
		plugins: []
	}, Editor, opts);

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
				block.content = nodeToContent(main, node);
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
		CreateMenuPlugin(main, opts, editSchema),
		CreateResolversPlugin(main, opts),
		DropCursor(opts)
	);

	var place = typeof opts.place == "string" ? document.querySelector(opts.place) : opts.place;

	var menuBarView = new Menu.MenuBarEditorView(place, {
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
			}
		},
		nodeViews: this.nodeViews
	});
	var view = this.view = menuBarView.editor;
}

Editor.prototype.set = function(dom) {
	var content = this.view.state.doc.content;
	this.delete(new State.TextSelection(0, content.offsetAt(content.childCount)));
	this.insert(dom, new State.NodeSelection(this.view.state.doc.resolve(0)));
};

Editor.prototype.get = function() {
	return this.serializers.view.serializeFragment(this.view.state.doc.content);
};

Editor.prototype.insert = function(dom, sel) {
	var view = this.view;
	var tr = view.state.tr;
	if (!sel) sel = tr.selection;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	var action = tr.replaceWith(start, end, this.parse(dom)).action();
	view.props.onAction(action);
};

Editor.prototype.delete = function(sel) {
	var view = this.view;
	var tr = view.state.tr;
	if (!sel) sel = tr.selection;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	var action = tr.delete(start, end).action();
	view.props.onAction(action);
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
	var tr = new this.Transform.Transform(this.view.state.tr.doc);
	var pos = this.posFromDOM(dom);
	if (pos === false) return;
	var block = this.resolve(dom);
	if (!block) return;
	console.log("not sure this still works");
	this.view.props.onAction({
		type: "transform",
		transform: tr.setNodeType(pos, null, Specs.blockToAttr(block))
	});
};

Editor.prototype.select = function(dom) {
	var pos = this.posFromDOM(dom);
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

Editor.prototype.remove = function(dom) {
	var sel = this.select(dom);
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

function nodeToContent(main, node, content) {
	var type = node.type.spec.typeName;
	if (type == "content") {
		content[node.attrs.block_content] = main.serializers.view.serializeNode(node);
	} else if (type != "root" || !content) {
		if (!content) content = {};
		node.forEach(function(child) {
			nodeToContent(main, child, content);
		});
	}
	return content;
}

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
			block.content = nodeToContent(main, node);
			return block;
		}
	}
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
				node = replacer(str) || "";
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
				var frag = fragmentReplace(pslice.content, UrlRegex(), function(str) {
					var block = main.resolve(str);
					if (block) return main.parse(main.render(block, true)).firstChild;
				});
				return new Model.Slice(frag, pslice.openLeft, pslice.openRight);
			}
		}
	});
}

function defaultMenu(main, items) {
	return items.fullMenu;
}

function CreateMenuPlugin(main, opts, editSchema) {
	var menu = opts.menu(main, Setup.buildMenuItems(editSchema)).map(function(group) {
		return group.filter(function(x) {
			// remove undefined items
			return !!x;
		});
	});

	return new State.Plugin({
		props: {
			menuContent: menu,
			floatingMenu: true
		}
	});
}

