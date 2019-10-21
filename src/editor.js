const State = require("prosemirror-state");
const Transform = require("prosemirror-transform");
const View = require("prosemirror-view");
const Model = require("prosemirror-model");
const keymap = require("prosemirror-keymap").keymap;
const Commands = require("prosemirror-commands");
const Setup = require("prosemirror-example-setup");
const DropCursor = require("prosemirror-dropcursor").dropCursor;
const History = require("prosemirror-history");
const OrderedMap = require("orderedmap");

const baseSchema = require("prosemirror-schema-basic");
const listSchema = require("prosemirror-schema-list");
// var tableSchema = require("prosemirror-schema-table");

const IdPlugin = require("./id-plugin");
const FocusPlugin = require("./focus-plugin");
const KeymapPlugin = require("./keymap-plugin");
const InputPlugin = require("./input-plugin");

const Utils = require("./utils");
const Specs = require("./specs");
const BlocksEdit = require('./blocks-edit');
const SetDocAttr = require("./SetDocAttr");


const Viewer = global.Pagecut && global.Pagecut.Viewer || require("./viewer");

Transform.Transform.prototype.docAttr = function(key, value) {
	return this.step(new SetDocAttr(key, value));
};

Editor.prototype = Object.create(View.EditorView.prototype);
Object.assign(Editor.prototype, Viewer.prototype);

Editor.defaults = {
	nodes: listSchema.addListNodes(
		OrderedMap.from(baseSchema.nodes), "paragraph block*", "block"
	),
	marks: OrderedMap.from(baseSchema.marks)
};

const mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false;

Editor.defaults.mapKeys = {
	"Mod-z": History.undo,
	"Shift-Mod-z": History.redo
};
if (!mac) Editor.defaults.mapKeys["Mod-y"] = History.redo;

Editor.defaults.elements = {
	_: {
		priority: -Infinity,
		title: "Empty",
		group: "block",
		inplace: true,
		draggable: false,
		render: function(block, scope) {
			return scope.$doc.createElement('pagecut-placeholder');
		}
	},
	text: { // NB inline group is text + leaf inline nodes - hard_break, imageInline, rating...
		inline: true,
		group: 'inline'
	}
};

module.exports = {
	Editor: Editor,
	View: View,
	Model: Model,
	State: State,
	Transform: Transform,
	Commands: Commands,
	keymap: keymap,
	Viewer: Viewer
};

Editor.prototype.to = function(blocks) {
	return this.blocks.to(blocks);
};

function Editor(opts) {
	var editor = this;
	if (opts.scope) editor.scope = opts.scope;
	if (opts.explicit) editor.explicit = true;

	this.utils = new Utils(this);
	var defaultElts = Editor.defaults.elements;

	opts = Object.assign({}, Editor.defaults, opts);

	for (var name in defaultElts) {
		opts.elements[name] = Object.assign({}, defaultElts[name], opts.elements[name]);
	}

	Viewer.call(this, opts);

	this.cssChecked = true;

	this.parseFromClipboard = (html, $pos) => {
		if (typeof html != "string") {
			html = this.utils.serializeHTML(html);
		}
		return View.__parseFromClipboard(this, null, html, null, $pos);
	};

	var BlocksViewProto = Object.getPrototypeOf(this.blocks);
	Object.assign(BlocksViewProto.constructor, BlocksEdit);
	Object.assign(BlocksViewProto, BlocksEdit.prototype);

	var plugins = opts.plugins || [];

	var spec = {
		nodes: opts.topNode ? opts.nodes.remove('doc') : opts.nodes,
		marks: opts.marks,
		topNode: opts.topNode
	};
	var views = {};

	var elements = this.elements;
	var elemsList = Object.values(elements).sort(function(a, b) {
		return (a.priority || 0) - (b.priority || 0);
	});

	for (var i = elemsList.length - 1; i >= 0; i--) {
		Specs.define(editor, elemsList[i], spec, views);
	}

	this.schema = new Model.Schema(spec);

	this.serializer = Model.DOMSerializer.fromSchema(this.schema);
	this.parser = Model.DOMParser.fromSchema(this.schema);

	this.clipboardSerializer = filteredSerializer(spec, (node, out) => {
		if (node.type.name == "_") return "";
		var attrs = out[1];
		if (node.attrs.data) attrs['block-data'] = node.attrs.data;
		if (node.attrs.expr) attrs['block-expr'] = node.attrs.expr;
		if (node.attrs.lock) attrs['block-lock'] = node.attrs.lock;
		if (node.attrs.standalone) attrs['block-standalone'] = 'true';
		delete attrs['block-focused'];
	});

	this.clipboardParser = Model.DOMParser.fromSchema(this.schema);

	this.viewSerializer = filteredSerializer(spec, function(node, out) {
		if (node.type.name == "_") return "";
		var obj = out[1];
		if (typeof obj != "object") return;
		// delete obj['block-root_id'];
	});

	plugins.unshift(
		IdPlugin,
		KeymapPlugin,
		FocusPlugin,
		InputPlugin,
		function(editor) {
			return Setup.buildInputRules(editor.schema);
		},
		function(editor, opts) {
			return keymap(opts.mapKeys);
		}, function(editor) {
			return keymap(Commands.baseKeymap);
		}, function() {
			return History.history({
				preserveItems: true // or else cancel does not keep selected node
			});
		},
		DropCursor({
			width: 2,
			class: 'ProseMirror-dropcursor'
		})
	);

	var pluginKeys = {};

	plugins = plugins.map(function(plugin) {
		if (plugin instanceof State.Plugin) return plugin;
		if (typeof plugin == "function") {
			plugin = plugin(editor, opts);
		}
		if (plugin instanceof State.Plugin) return plugin;
		if (plugin.update || plugin.destroy) {
			plugin = {view: function() {
				return this;
			}.bind(plugin)};
		}
		if (plugin.key && typeof plugin.key == "string") {
			plugin.key = pluginKeys[plugin.key] = new State.PluginKey(plugin.key);
		}
		return new State.Plugin(plugin);
	});
	this.plugins = pluginKeys;

	var place = typeof opts.place == "string" ? document.querySelector(opts.place) : opts.place;

	var stateDoc;
	if (opts.jsonContent) stateDoc = this.schema.nodeFromJSON(opts.jsonContent);
	else if (opts.content) stateDoc = this.parser.parse(opts.content);

	View.EditorView.call(this, {mount: place}, {
		state: State.EditorState.create({
			schema: this.schema,
			plugins: plugins,
			doc: stateDoc
		}),
		domParser: this.parser,
		clipboardParser: this.clipboardParser,
		clipboardSerializer: this.clipboardSerializer,
		dispatchTransaction: function(tr) {
			editor.updateState(editor.state.apply(tr));
		},
		nodeViews: views
	});
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

