var State = require("prosemirror-state");
var Transform = require("prosemirror-transform");
var View = require("prosemirror-view");
var Model = require("prosemirror-model");
var Input = require("prosemirror-inputrules");
var keymap = require("prosemirror-keymap").keymap;
var Commands = require("prosemirror-commands");
var Setup = require("prosemirror-example-setup");
var DropCursor = require("@kapouer/prosemirror-dropcursor").dropCursor;
var History = require("prosemirror-history");

var baseSchema = require("prosemirror-schema-basic").schema;
var listSchema = require("prosemirror-schema-list");
// var tableSchema = require("prosemirror-schema-table");

var UrlRegex = require('url-regex');

var IdPlugin = require("./id-plugin");
var FocusPlugin = require("./focus-plugin");
var KeymapPlugin = require("./keymap-plugin");
var InputPlugin = require("./input-plugin");

var Utils = require("./utils");
var Specs = require("./specs");

var Viewer = global.Pagecut && global.Pagecut.Viewer || require("./viewer");

Editor.prototype = Object.create(View.EditorView.prototype);
Object.assign(Editor.prototype, Viewer.prototype);

Editor.defaults = {
	nodes: listSchema.addListNodes(
		baseSchema.spec.nodes,
		"paragraph block*",
		"block"
	),
	marks: baseSchema.spec.marks
};
// Editor.defaults.nodes = tableSchema.addTableNodes(
// 	Editor.defaults.nodes, "inline<_>*", "block"
// );

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

	opts.elements._ = {
		priority: -Infinity,
		group: "block",
		inplace: true,
		render: function(doc) {
			return doc.createElement('pagecut-placeholder');
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

	this.clipboardSerializer = filteredSerializer(spec, function(node, out) {
		if (node.type.name == "_") return "";
		Object.assign(out[1], {
			'block-data': node.attrs.data
		});
		delete out[1]['block-focused'];
		if (node.attrs.standalone) out[1]['block-standalone'] = 'true';
	});

	this.clipboardParser = new Model.DOMParser(
		this.schema,
		Model.DOMParser.schemaRules(this.schema)
	);

	this.viewSerializer = filteredSerializer(spec, function(node, out) {
		if (node.type.name == "_") return "";
		var obj = out[1];
		if (typeof obj != "object") return;
		delete obj['block-focused'];
		delete obj['block-root_id'];
		delete obj['block-data'];
		delete obj['style'];
	});

	this.plugins.push(
		IdPlugin,
		KeymapPlugin,
		FocusPlugin,
		InputPlugin,
//		require("./test-plugin"),
	function(editor) {
		return Input.inputRules({
			rules: Setup.buildInputRules(editor.schema)
		});
	},
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
		clipboardParser: this.clipboardParser,
		clipboardSerializer: this.clipboardSerializer,
		dispatchTransaction: function(tr) {
			editor.updateState(editor.state.apply(tr));
		},
		nodeViews: views,
		genId: opts.genId
	});

	place.ownerDocument.execCommand("enableObjectResizing", false, false);

	var rootId = this.dom.getAttribute('block-id');
	if (rootId) {
		this.state.doc.attrs.id = rootId;
	}
	var rootType = this.dom.getAttribute('block-type');
	if (rootType) {
		this.state.doc.attrs.type = rootType;
	}
}

Object.assign(Editor.prototype, Viewer.prototype, View.EditorView);


Editor.prototype.getPlugin = function(key) {
	return new State.PluginKey(key).get(this.state);
};

function filteredSerializer(spec, obj) {
	if (typeof obj == "function") obj = {filter: obj};
	var ser = Model.DOMSerializer.fromSchema(new Model.Schema(spec));
	function replaceOutputSpec(fun) {
		return function(node) {
			var out = fun(node);
			var mod = obj.filter(node, out);
			if (mod !== undefined) out = mod;
			return out;
		};
	}
	Object.keys(ser.nodes).forEach(function(name) {
		if (spec.nodes.get(name).typeName == null) return;
		ser.nodes[name] = replaceOutputSpec(ser.nodes[name]);
	});
	Object.keys(ser.marks).forEach(function(name) {
		if (spec.marks.get(name).typeName == null) return;
		ser.marks[name] = replaceOutputSpec(ser.marks[name]);
	});
	return ser;
}

