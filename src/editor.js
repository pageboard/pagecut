var Setup = require("prosemirror-example-setup");
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
var BreakPlugin = require("./break-plugin");

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


Editor.defaults.mapKeys = {
	// 'Shift-Mod-z': History.redo
};

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

	this.utils = new Utils(this);

	opts = Object.assign({
		plugins: []
	}, Editor.defaults, opts);

	Viewer.call(this, opts);

	var spec = {
		nodes: opts.nodes,
		marks: opts.marks,
		topNode: opts.topNode
	};
	var views = {};

	this.elements.forEach(function(el) {
		Specs.define(editor, el, spec, views);
	});

	this.schema = new Model.Schema(spec);

	this.serializer = Model.DOMSerializer.fromSchema(this.schema);
	this.parser = Model.DOMParser.fromSchema(this.schema);

	this.plugins.push(
		BreakPlugin,
		FocusPlugin,
//		require("./test-plugin"),
		CreatePasteBlock,
	function(editor) {
		return Input.inputRules({
			rules: Input.allInputRules.concat(Setup.buildInputRules(editor.schema))
		});
	}, function(editor, opts) {
		return keymap(Setup.buildKeymap(editor.schema, opts.mapKeys));
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
		domSerializer: this.serializer,
		dispatchTransaction: function(tr) {
			editor.updateState(editor.state.apply(tr));
		},
		nodeViews: views
	});
	var rootId = this.dom.getAttribute('block-id');
	if (rootId) {
		this.state.doc.attrs.block_id = rootId;
	}
}

Object.assign(Editor.prototype, Viewer.prototype, View.EditorView);


Editor.prototype.getPlugin = function(key) {
	return new State.PluginKey(key).get(this.state);
};


/*
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
				editor.replace(block, pos);
			}
		});
		if (syncBlock) return true;
	});
	return syncBlock;
};
*/

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

function CreatePasteBlock(editor) {
	return new State.Plugin({
		props: {
			transformPasted: function(pslice) {
				pslice.content.descendants(function(node) {
					node = editor.pasteNode(node);
				});
				return pslice;
			}
		}
	});
}

function getIdBlockNode(node) {
	var id = node.attrs.block_id;
	if (id == null && node.marks.length > 0) {
		node = node.marks[0];
		id = node.attrs.block_id;
	}
	return {id: id, node: node};
}

Editor.prototype.pasteNode = function(node) {
	var bn = getIdBlockNode(node);
	if (bn.id == null) {
		// a block node must have an id, so it is not one
		return;
	}
	var block = this.blocks.get(bn.id);
	if (!block) {
		// unknown block, let id module deserialize it later
		bn.node.attrs.block_id = this.blocks.genId();
		return;
	}
	if (!block.deleted) {
		// known block already exists, assume copy/paste
		block = this.blocks.copy(block);
		block.id = bn.node.attrs.block_id = this.blocks.genId();
		this.blocks.set(block);
	} else {
		// known block is not in dom, assume cut/paste or drag/drop
	}
};

/*
function CreateResolversPlugin(editor, opts) {
	return new State.Plugin({
		props: {
			transformPasted: function(pslice) {
				var sel = editor.state.tr.selection;
				var frag = fragmentReplace(pslice.content, UrlRegex(), function(str, pos) {
					var block = editor.resolve(str);
					if (block) {
						block.pos = pos + sel.from + 1;
						return main.parse(main.render(block)).firstChild;
					}
				});
				return new Model.Slice(frag, pslice.openStart, pslice.openEnd);
			}
		}
	});
}
*/

