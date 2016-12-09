var Setup = require("prosemirror-example-setup");
var State = require("prosemirror-state");
var Transform = require("prosemirror-transform");
var Menu = require("prosemirror-menu");
var EditorView = require("prosemirror-view").EditorView;
var Model = require("prosemirror-model");
var Input = require("prosemirror-inputrules");
var keymap = require("prosemirror-keymap").keymap;
var Commands = require("prosemirror-commands");
var history = require("prosemirror-history").history;

var baseSchema = require("prosemirror-schema-basic").schema;
var listSchema = require("prosemirror-schema-list");
// var tableSchema = require("prosemirror-schema-table");

var UrlRegex = require('url-regex');

var CreatePlugin = require("./plugin");
var Specs = require("./specs");

var nodesSpec = baseSchema.nodeSpec.remove('image');
nodesSpec = listSchema.addListNodes(nodesSpec, "paragraph block*", "block");
// nodesSpec = tableSchema.addTableNodes(nodesSpec, "inline<_>*", "block");

var schemaSpec = {
	nodes: nodesSpec,
	marks: baseSchema.markSpec
};

module.exports = Editor;

function defaultMenu(main, items) {
	return items.fullMenu;
}

function CreateSetupPlugin(main, options) {
	var deps = [
		Input.inputRules({
			rules: Input.allInputRules.concat(Setup.buildInputRules(options.schema))
		}),
		keymap(Setup.buildKeymap(options.schema, options.mapKeys)),
		keymap(Commands.baseKeymap)
	];
	if (options.history !== false) deps.push(history());
	var menu = options.menu(main, Setup.buildMenuItems(options.schema));

	return new State.Plugin({
		props: {
			menuContent: menu.map(function(group) { return group.filter(function(x) {
				// remove undefined items
				return !!x;
			}); }),
			floatingMenu: true
		}
	});
}

Editor.spec = schemaSpec;
Editor.resolvers = global.Pagecut && global.Pagecut.resolvers || [];
Editor.elements = global.Pagecut && global.Pagecut.elements || [];
Editor.menu = defaultMenu;

function Editor(opts, shared) {
	var main = this;
	this.Model = Model;
	this.State = State;
	this.Transform = Transform;
	this.Menu = Menu;
	this.Commands = Commands;
	this.keymap = keymap;
	this.elements = {};
	this.shared = shared;

	opts = Object.assign({plugins: []}, Editor, opts);
	this.resolvers = opts.resolvers;

	var nodeViews = {};

	opts.elements.forEach(function(el) {
		main.elements[name] = el;
		Specs.define(main, el, opts.spec, nodeViews, el.render(main, { data: {}, content: {} }));
	});

	var schema;

	if (opts.spec) {
		opts.schema = new Model.Schema(opts.spec);
	} if (!opts.schema) {
		throw new Error("Either 'spec' or 'schema' must be specified");
	}
	// this is a trick to be able to serialize to DOM/r and bypass pm schema leaf check
	// là encore, un DOMSerializer basé sur la fonction de rendu "read" résoudrait le pb ?
	// même pas sûr car
	opts.elements.forEach(function(el) {
		var type = opts.schema.nodes['root_' + el.name];
		Object.defineProperty(type, 'isLeaf', {
			get: function() {
				return !!main.exporter;
			}
		});
	});

	opts.plugins.push(
		CreatePlugin(main, opts),
		CreateSetupPlugin(main, opts),
		CreateResolversPlugin(main, opts)
	);

	var domParser = Model.DOMParser.fromSchema(opts.schema);

	var place = typeof opts.place == "string" ? document.querySelector(opts.place) : opts.place;

	var menuBarView = new Menu.MenuBarEditorView(place, {
		state: State.EditorState.create({
			schema: opts.schema,
			plugins: opts.plugins,
			doc: opts.content ? domParser.parse(opts.content) : undefined
		}),
		domParser: domParser,
		domSerializer: Model.DOMSerializer.fromSchema(opts.schema),
		onAction: function(action) {
			if (!opts.action || !opts.action(main, action)) {
				if (opts.change) {
					var changedBlock = actionAncestorBlock(main, action);
					if (changedBlock) opts.change(main, changedBlock);
				}
				view.updateState(view.state.applyAction(action));
			}
		},
		nodeViews: nodeViews
	});
	var view = this.view = menuBarView.editor;
}

Editor.prototype.set = function(dom, fn) {
	this.importer = fn;
	var content = this.view.state.doc.content;
	this.delete(new State.TextSelection(0, content.offsetAt(content.childCount)));
	this.insert(dom, new State.NodeSelection(this.view.state.doc.resolve(0)));
	delete this.importer;
};

Editor.prototype.get = function(fn) {
	this.exporter = fn || true;
	var view = this.view;
	var dom = view.props.domSerializer.serializeFragment(view.state.doc.content);
	delete this.exporter;
	return dom;
};

Editor.prototype.insert = function(dom, sel) {
	var view = this.view;
	var tr = view.state.tr;
	if (!sel) sel = tr.selection;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	var action = tr.replaceWith(start, end, this.parse(dom, sel)).action();
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

Editor.prototype.parse = function(dom, sel) {
	if (!dom) return;
	var parser = this.view.someProp("domParser");
	if (!sel) sel = this.view.state.tr.selection;
	var $context = sel.$from || sel.$anchor;
	var frag = dom.ownerDocument.createDocumentFragment();
	frag.appendChild(dom);
	return parser.parseSlice(frag, {
		// TODO topNode: ???
	}).content;
};

Editor.prototype.merge = function(dom, content) {
	Object.keys(content).forEach(function(name) {
		var contentNode = dom.querySelector('[block-content="'+name+'"]');
		if (!contentNode) return;
		var val = content[name];
		if (!val.nodeType) contentNode.innerHTML = val;
		else contentNode.parentNode.replaceChild(val, contentNode);
	});
	return dom;
};

Editor.prototype.refresh = function(dom) {
	var tr = new this.Transform.Transform(this.view.state.tr.doc);
	var pos = this.posFromDOM(dom);
	if (pos === false) return;
	var element = this.elements[dom.getAttribute('block-type')];
	if (!element) {
		throw new Error("No element matching dom node was found");
	}
	var attrs = Specs.rootAttributes(this, element, dom);
	this.view.props.onAction({
		type: "transform",
		transform: tr.setNodeType(pos, null, attrs)
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
		dst = this.render(dst);
	}
	this.insert(dst, sel);
	return true;
};

Editor.prototype.render = function(block) {
	var type = block.type;
	if (!type) throw new Exception("Missing block type");
	var el = this.elements[type];
	if (!el) throw new Exception("Missing element " + type);
	var node = el.render(this, block);
	if (block.id) node.setAttribute('id', block.id);
	return node;
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

function actionAncestorBlock(main, action) {
	// returns the ancestor block modified by this action
	if (action.type != "transform") return;
	var steps = action.transform.steps;
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
		if (roots[i].count == steps.length) return wrapBlockNode(main, roots[i].root);
	}
}

function wrapBlockNode(main, node) {
	var type = node.type.name.substring(5);
	return {
		get data() {
			return main.toBlock(node).data;
		},
		get content() {
			return main.toBlock(node, true).content;
		},
		type: type,
		node: node
	};
}

Editor.prototype.toBlock = function(node, content) {
	var data = {};
	for (var k in node.attrs) {
		if (k.indexOf('data-') == 0) {
			data[k.substring(5)] = node.attrs[k];
		}
	}
	return {
		data: data,
		content: content ? collectContent(this.view, node) : null
	};
};

Editor.prototype.resolve = function(thing) {
	var obj = {};
	if (typeof thing == "string") obj.url = thing;
	else obj.node = thing;
	var block;
	for (var i=0; i < this.resolvers.length; i++) {
		block = this.resolvers[i](this, obj);
		if (block) break;
	}
	return block;
};

function collectContent(view, node, content) {
	var type = node.type.spec.typeName;
	if (type == "content") {
		content[node.attrs.block_content] = view.props.domSerializer.serializeNode(node);
	} else if (type != "root" || !content) {
		if (!content) content = {};
		node.forEach(function(child) {
			collectContent(view, child, content);
		});
	}
	return content;
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
			list.push(child.copy(resolveFragment(child.content, regexp, replacer)));
		}
	}
	return Model.Fragment.fromArray(list);
}

function CreateResolversPlugin(main, opts) {
	var readSpec = {
		nodes: opts.schema.nodeSpec,
		marks: opts.schema.markSpec
	};
	Specs.defineResolvers(main, readSpec, function(dom) {
		var block = main.resolve(dom);
		if (block) {
			var node = main.render(block);
			console.log("might not work at all");
			dom.parentNode.replaceChild(node, dom);
		}
	});

	return new State.Plugin({
		props: {
			transformPasted: function(pslice) {
				return fragmentReplace(pslice, UrlRegex(), function(str) {
					var block = main.resolve(str);
					if (block) return main.parse(main.render(block)).firstChild;
				});
			},
			clipboardParser: Model.DOMParser.fromSchema(new Model.Schema(readSpec))
		}
	});
}

