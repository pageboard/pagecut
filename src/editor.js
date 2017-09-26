var State = require("prosemirror-state");
var Transform = require("prosemirror-transform");
var View = require("prosemirror-view");
var Model = require("prosemirror-model");
var Input = require("prosemirror-inputrules");
var keymap = require("prosemirror-keymap").keymap;
var Commands = require("prosemirror-commands");
var DropCursor = require("@kapouer/prosemirror-dropcursor").dropCursor;
var History = require("prosemirror-history");

var baseSchema = require("prosemirror-schema-basic").schema;
var listSchema = require("prosemirror-schema-list");
// var tableSchema = require("prosemirror-schema-table");

var UrlRegex = require('url-regex');

var FocusPlugin = require("./focus-plugin");
var KeymapPlugin = require("./keymap-plugin");
var InputPlugin = require("./input-plugin");

var Utils = require("./utils");
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

const mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false

Editor.defaults.mapKeys = {
	"Mod-z": History.undo,
	"Shift-Mod-z": History.redo
};
if (!mac) Editor.defaults.mapKeys["Mod-y"] = History.redo;

module.exports = {
	Editor: Editor,
	View: View,
	Model: Model,
	State: State,
	Transform: Transform,
	Commands: Commands,
	keymap: keymap,
	Viewer: Viewer,
	modules: global.Pagecut && global.Pagecut.modules || {}
};

function Editor(opts) {
	var editor = this;

	this.utils = new Utils(this);

	opts = Object.assign({
		plugins: []
	}, Editor.defaults, opts);

	opts.elements.virtual = {
		name: 'virtual',
		inplace: true,
		virtual: true,
		tag: "div[block-virtual]",
		render: function(doc, block) {
			return doc.dom`<div block-virtual></div>`;
		}
	};

	Viewer.call(this, opts);

	var spec = {
		nodes: opts.nodes,
		marks: opts.marks,
		topNode: opts.topNode
	};
	var views = {};

	for (var i=this.elements.length - 1; i >= 0; i--) {
		Specs.define(editor, this.elements[i], spec, views);
	}

	this.schema = new Model.Schema(spec);

	this.serializer = Model.DOMSerializer.fromSchema(this.schema);
	this.parser = Model.DOMParser.fromSchema(this.schema);

	var cbSerializer = Model.DOMSerializer.fromSchema(new Model.Schema(spec));
	var cbParserRules = Model.DOMParser.schemaRules(this.schema);

	function replaceOutputSpec(fun) {
		return function(node) {
			var out = fun(node);
			Object.assign(out[1], {
				'block-data': node.attrs.block_data
			});
			delete out[1]['block-focused'];
			return out;
		};
	}
	Object.keys(cbSerializer.nodes).forEach(function(name) {
		if (spec.nodes.get(name).typeName != "root") return;
		cbSerializer.nodes[name] = replaceOutputSpec(cbSerializer.nodes[name]);
	});
	Object.keys(cbSerializer.marks).forEach(function(name) {
		if (spec.marks.get(name).typeName != "root") return;
		cbSerializer.marks[name] = replaceOutputSpec(cbSerializer.marks[name]);
	});

	cbParserRules = cbParserRules.map(function(rule) {
		if (rule.mark && spec.marks.get(rule.mark).typeName != "root") return rule;
		if (rule.node && spec.nodes.get(rule.node).typeName != "root") return rule;
		var copy = Object.assign({}, rule);
		copy.getAttrs = function(dom) {
			var id = dom.getAttribute("block-id");
			if (id) {
				var block = editor.blocks.get(id);
				if (block && editor.blocks.domQuery(id)) {
					dom.removeAttribute('block-id');
				}
			}
			var attrs = rule.getAttrs(dom);
			return attrs;
		};
		return copy;
	});
	var cbParser = new Model.DOMParser(this.schema, cbParserRules);

	this.plugins.push(
		KeymapPlugin,
		FocusPlugin,
		InputPlugin,
		this.blocks.idPlugin(),
//		require("./test-plugin"),
//	function(editor) {
//		return Input.inputRules({
//			rules: Setup.buildInputRules(editor.schema)
//		});
//	},
	function(editor, opts) {
		return keymap(opts.mapKeys);
	}, function(editor) {
		return keymap(Commands.baseKeymap);
	}, function() {
		return History.history({
			preserveItems: true // or else cancel does not keep selected node
		});
	}, function(editor, opts) {
		return DropCursor({
			decorate: function($pos) {
				var node = editor.root.createElement("span");
				node.textContent = "\u200b";
				node.style.cssText = "margin-left:-1px; margin-right:-1px; border-left:2px solid black; display: inline-block; pointer-events: none";
				return View.Decoration.widget($pos.pos, node);
			}
		});
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
			schema: this.schema,
			plugins: plugins,
			doc: opts.content ? this.parser.parse(opts.content) : undefined
		}),
		domParser: this.parser,
		clipboardParser: cbParser,
		clipboardSerializer: cbSerializer,
		dispatchTransaction: function(tr) {
			editor.updateState(editor.state.apply(tr));
		},
		nodeViews: views
	});

	place.ownerDocument.execCommand("enableObjectResizing", false, false);

	var rootId = this.dom.getAttribute('block-id');
	if (rootId) {
		this.state.doc.attrs.block_id = rootId;
	}
	var rootType = this.dom.getAttribute('block-type');
	if (rootType) {
		this.state.doc.attrs.block_type = rootType;
	}
}

Object.assign(Editor.prototype, Viewer.prototype, View.EditorView);


Editor.prototype.getPlugin = function(key) {
	return new State.PluginKey(key).get(this.state);
};

