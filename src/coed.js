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


var CreateCoedPlugin = require("./plugin");
var Specs = require("./specs");

var nodesSpec = baseSchema.nodeSpec.remove('image');
nodesSpec = listSchema.addListNodes(nodesSpec, "paragraph block*", "block");
// nodesSpec = tableSchema.addTableNodes(nodesSpec, "inline<_>*", "block");

var schemaSpec = {
	nodes: nodesSpec,
	marks: baseSchema.markSpec
};

module.exports = Editor;

function defaultMenu(coed, items) {
	return items.fullMenu;
}

function CreateSetupPlugin(coed, options) {
	var deps = [
		Input.inputRules({
			rules: Input.allInputRules.concat(Setup.buildInputRules(options.schema))
		}),
		keymap(Setup.buildKeymap(options.schema, options.mapKeys)),
		keymap(Commands.baseKeymap)
	];
	if (options.history !== false) deps.push(history());
	var menu = options.menu(coed, Setup.buildMenuItems(options.schema));

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
Editor.plugins = [];
Editor.components = global.Coed && global.Coed.components || [];
Editor.menu = defaultMenu;

function Editor(config, componentsConfig) {
	var me = this;
	this.Model = Model;
	this.State = State;
	this.Transform = Transform;
	this.Menu = Menu;
	this.Commands = Commands;
	this.keymap = keymap;
	this.instances = {};

	var opts = Object.assign({}, Editor, config);

	opts.plugins.push(CreateCoedPlugin(this, opts));

	var nodeViews = {};

	opts.components.forEach(function(Component) {
		var name = Component.prototype.name;
		var inst = new Component(componentsConfig[name]);
		me.instances[name] = inst;
		Specs.define(me, inst, opts.spec, nodeViews, inst.to({}));
		if (inst.plugin) {
			opts.plugins.push(new State.Plugin(inst.plugin(me)));
		}
	});

	if (opts.spec) {
		opts.schema = new Model.Schema(opts.spec);
		delete opts.spec;
	}
	Object.keys(me.instances).forEach(function(name) {
		var type = opts.schema.nodes['root_' + name];
		Object.defineProperty(type, 'isLeaf', {
			get: function() {
				return !!me.exporter;
			}
		});
	});

	opts.plugins.push(CreateSetupPlugin(me, opts));

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
			if (!opts.action || !opts.action(me, action)) {
				if (opts.change) {
					var changedBlock = actionAncestorBlock(coed, action);
					if (changedBlock) opts.change(me, changedBlock);
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

Editor.prototype.replace = function(fragment, regexp, replacer) {
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
			list.push(child.copy(this.replace(child.content, regexp, replacer)));
		}
	}
	return Model.Fragment.fromArray(list);
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
	var component = this.instances[dom.getAttribute('block-type')];
	if (!component) {
		throw new Error("No component matching dom node was found");
	}
	var attrs = Specs.rootAttributes(this, component, dom);
	this.view.props.onAction({
		type: "transform",
		transform: tr.setNodeType(pos, null, attrs)
	});
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
		type = node.type && node.type.spec.coedType;
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

function actionAncestorBlock(coed, action) {
	// returns the ancestor block modified by this action
	if (action.type != "transform") return;
	var steps = action.transform.steps;
	var roots = [];
	steps.forEach(function(step) {
		var parents = coed.parents(coed.view.state.doc.resolve(step.from), true);
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
		if (roots[i].count == steps.length) return wrapBlockNode(coed, roots[i].root);
	}
}

function wrapBlockNode(coed, node) {
	var type = node.type.name.substring(5);
	return {
		get data() {
			return coed.toBlock(node).data;
		},
		get content() {
			return coed.toBlock(node, true).content;
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

function collectContent(view, node, content) {
	var type = node.type.spec.coedType;
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

