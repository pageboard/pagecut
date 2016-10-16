var Setup = require("prosemirror-example-setup");
var State = require("prosemirror-state");
var Menu = require("prosemirror-menu");
var EditorView = require("prosemirror-view").EditorView;
var Model = require("prosemirror-model");
var Input = require("prosemirror-inputrules");
var keymap = require("prosemirror-keymap").keymap;
var Commands = require("prosemirror-commands");
var history = require("prosemirror-history").history;
var dompos = require("prosemirror-view/dist/dompos");

var baseSchema = require("prosemirror-schema-basic").schema;
var listSchema = require("prosemirror-schema-list");
// var tableSchema = require("prosemirror-schema-table");


var CreateCoedPlugin = require("./plugin");
var defineSpecs = require("./specs");

var nodesSpec = baseSchema.nodeSpec.remove('image');
nodesSpec = listSchema.addListNodes(nodesSpec, "paragraph block*", "block");
// nodesSpec = tableSchema.addTableNodes(nodesSpec, "inline<_>*", "block");

var schemaSpec = {
	nodes: nodesSpec,
	marks: baseSchema.markSpec
};

exports.defaults = {
	spec: schemaSpec,
	plugins: [],
	components: [],
	menu: defaultMenu
};

exports.Editor = Editor;

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
	if (options.history !== false) deps.push(history);
	var menu = options.menu(coed, Setup.buildMenuItems(options.schema));

	return new State.Plugin({
		props: {
			menuContent: menu.map(function(group) { return group.filter(function(x) {
				// remove undefined items
				return !!x;
			}); }),
			floatingMenu: true
		},
		dependencies: deps
	});
}

function Editor(config) {
	var me = this;
	this.Model = Model;
	this.State = State;
	this.Menu = Menu;
	this.Commands = Commands;
	this.Pos = dompos;
	this.keymap = keymap;

	var opts = Object.assign({}, exports.defaults, config);

	if (!opts.components) opts.components = [];

	this.components = opts.components;

	opts.plugins.push(CreateCoedPlugin(this, opts));
	opts.components.forEach(function(component) {
		defineSpecs(me, component, opts.spec, component.to({}));
		if (component.plugin) {
			opts.plugins.push(new State.Plugin(component.plugin(me)));
		}
	});

	if (opts.spec) {
		opts.schema = new Model.Schema(opts.spec);
		delete opts.spec;
	}

	opts.plugins.push(CreateSetupPlugin(me, opts));

	var domParser = Model.DOMParser.fromSchema(opts.schema);

	var menuBarView = new Menu.MenuBarEditorView(opts.place, {
		state: State.EditorState.create({
			schema: opts.schema,
			plugins: opts.plugins,
			doc: opts.content ? domParser.parse(opts.content) : undefined
		}),
		domParser: domParser,
		domSerializer: Model.DOMSerializer.fromSchema(opts.schema),
		onAction: function(action) {
			if (!opts.action || !opts.action(me, action)) {
				view.updateState(view.state.applyAction(action));
			}
		}
	});
	var view = this.view = menuBarView.editor;
}

Editor.prototype.set = function(dom, fn) {
	if (fn) this.components.forEach(function(component) {
		component.setfn = fn;
	});
	var content = this.view.state.doc.content;
	this.delete(new State.TextSelection(0, content.offsetAt(content.childCount)));
	this.insert(dom, new State.NodeSelection(this.view.state.doc.resolve(0)));
	if (fn) this.components.forEach(function(component) {
		delete component.setfn;
	});
};

Editor.prototype.get = function(fn) {
	this.components.forEach(function(component) {
		component.getfn = fn || true;
	});
	var view = this.view;
	var dom = view.props.domSerializer.serializeFragment(view.state.doc.content);
	this.components.forEach(function(component) {
		delete component.getfn;
	});
	return dom;
};

Editor.prototype.insert = function(dom, sel) {
	var view = this.view;
	var tr = view.state.tr;
	if (!sel) sel = tr.selection;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	var action = tr.replaceWith(start, end, this.parse(dom, sel)).action();
	view.updateState(view.state.applyAction(action));
};

Editor.prototype.delete = function(sel) {
	var view = this.view;
	var tr = view.state.tr;
	if (!sel) sel = tr.selection;
	var start = sel.anchor !== undefined ? sel.anchor : sel.from;
	var end = sel.head !== undefined ? sel.head : sel.to;
	var action = tr.delete(start, end).action();
	view.updateState(view.state.applyAction(action));
};

Editor.prototype.parse = function(dom, sel) {
	if (!dom) return;
	var parser = this.view.someProp("domParser");
	if (!sel) sel = this.view.state.tr.selection;
	var $context = sel.$from || sel.$anchor;
	var frag = dom.ownerDocument.createDocumentFragment();
	frag.appendChild(dom);
	return parser.parseInContext($context, frag).content; // parseInContext returns a Slice
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

