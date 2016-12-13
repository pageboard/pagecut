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
var Cache = require("./cache");

Editor.cache = new Cache();

Editor.nodeSpec = baseSchema.nodeSpec.remove('image');
Editor.nodeSpec = listSchema.addListNodes(Editor.nodeSpec, "paragraph block*", "block");
// Editor.nodeSpec = tableSchema.addTableNodes(nodeSpec, "inline<_>*", "block");

Editor.markSpec = baseSchema.markSpec;

module.exports = Editor;

Editor.menu = defaultMenu;
Editor.resolvers = global.Pagecut && global.Pagecut.resolvers || [];
Editor.elements = global.Pagecut && global.Pagecut.elements || [];

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
	this.nodeViews = {};

	opts = Object.assign({plugins: []}, Editor, opts);

	this.cache = opts.cache;
	this.resolvers = opts.resolvers;

	var editSchema = getRendererSchema(main, opts, 'edit');
	var viewSchema = getRendererSchema(main, opts, 'view');

	this.serializers = {
		edit: Model.DOMSerializer.fromSchema(editSchema),
		view: Model.DOMSerializer.fromSchema(viewSchema)
	};

		// this is a trick to be able to serialize to DOM/r and bypass pm schema leaf check
	// là encore, un DOMSerializer basé sur la fonction de rendu "read" résoudrait le pb ?
	// même pas sûr car
	/*
	opts.elements.forEach(function(el) {
		var type = opts.schema.nodes['root_' + el.name];
		Object.defineProperty(type, 'isLeaf', {
			get: function() {
				return !!main.exporter;
			}
		});
	});
	*/

	opts.plugins.push(
		CreatePlugin(main, opts),
		CreateSetupPlugin(main, opts, editSchema),
		CreateResolversPlugin(main, opts),
		DropCursor(opts)
	);

	this.parsers = {
		edit: Model.DOMParser.fromSchema(editSchema)
	};

	var place = typeof opts.place == "string" ? document.querySelector(opts.place) : opts.place;

	var menuBarView = new Menu.MenuBarEditorView(place, {
		state: State.EditorState.create({
			schema: editSchema,
			plugins: opts.plugins,
			doc: opts.content ? this.parsers.edit.parse(opts.content) : undefined
		}),
		domParser: this.parsers.edit,
		domSerializer: this.serializers.edit,
		onAction: function(action) {
			if (!opts.action || !opts.action(main, action)) {
				if (opts.change) {
					var changedBlock = actionAncestorBlock(main, action);
					if (changedBlock) opts.change(main, changedBlock);
				}
				view.updateState(view.state.applyAction(action));
			}
		},
		nodeViews: this.nodeViews
	});
	var view = this.view = menuBarView.editor;
}

function getRendererSchema(main, opts, rendererName) {
	var spec = {
		nodes: opts.nodeSpec,
		marks: opts.markSpec
	};
	opts.elements.forEach(function(el) {
		main.elements[el.name] = el;
		Specs.define(main, el, spec, rendererName);
	});
	console.log(spec);

	return new Model.Schema(spec);
}

Editor.prototype.set = function(dom, name) {
	var content = this.view.state.doc.content;
	this.delete(new State.TextSelection(0, content.offsetAt(content.childCount)));
	this.insert(dom, new State.NodeSelection(this.view.state.doc.resolve(0)));
};

Editor.prototype.get = function(name) {
	if (!name) name = 'edit';
	var serializer = this.serializers[name];
	if (!serializer) throw new Error("No serializer with name " + name);
	var view = this.view;
	return serializer.serializeFragment(view.state.doc.content);
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

Editor.prototype.merge = function(dom, content) {
	if (content) Object.keys(content).forEach(function(name) {
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
		dst = this.render('edit', dst);
	}
	this.insert(dst, sel);
	return true;
};

Editor.prototype.render = function(renderer, block) {
	var type = block.type;
	if (!type) throw new Error("Missing block type");
	var el = this.elements[type];
	if (!el) throw new Error("Missing element " + type);
	var renderFn = el[renderer + 'Render'];
	if (!renderFn) renderFn = el[this.renderers[0] + 'Render'];
	if (!renderFn) throw new Error("No renderer for block type " + type);
	block = Object.assign({}, block);
	if (!block.data) block.data = {};
	if (!block.content) block.content = {};
	var node = renderFn.call(el, this, block);
	if (block.id && node) node.setAttribute('id', block.id);
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
		type: node.attrs.block_type,
		data: data,
		content: content ? collectContent(this.view, node) : null
	};
};

Editor.prototype.resolve = function(thing) {
	var obj = {};
	if (typeof thing == "string") obj.url = thing;
	else obj.node = thing;
	var syncBlock;
	var main = this;
	for (var i=0; i < this.resolvers.length; i++) {
		syncBlock = this.resolvers[i](main, obj, function(err, block) {
			// no scope issue because syncBlock won't change
			var oldDom = document.getElementById(syncBlock.id);
			if (!oldDom) {
				return;
			}
			if (err) {
				console.error(err);
				main.remove(oldDom);
			} else {
				main.replace(oldDom, block);
			}
		});
		if (syncBlock) break;
	}
	if (syncBlock) syncBlock.id = 'id-' + Date.now();
	return syncBlock;
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
			list.push(child.copy(fragmentReplace(child.content, regexp, replacer)));
		}
	}
	return Model.Fragment.fromArray(list);
}

function CreateResolversPlugin(main, opts) {
	var readSpec = {
		nodes: opts.nodeSpec,
		marks: opts.markSpec
	};
	Specs.defineResolvers(main, readSpec, function(dom) {
		var block = main.resolve(dom);
		if (block) {
			var node = main.render('edit', block);
			console.log("might not work at all");
			dom.parentNode.replaceChild(node, dom);
		}
	});

	return new State.Plugin({
		props: {
			transformPasted: function(pslice) {
				console.log("paste");
				var frag = fragmentReplace(pslice.content, UrlRegex(), function(str) {
					console.log("pasted url", str);
					var block = main.resolve(str);
					console.log("resolved to", block);
					if (block) return main.parse(main.render('edit', block)).firstChild;
				});
				return new Model.Slice(frag, pslice.openLeft, pslice.openRight);
			},
			clipboardParser: Model.DOMParser.fromSchema(new Model.Schema(readSpec))
		}
	});
}

function defaultMenu(main, items) {
	return items.fullMenu;
}

function CreateSetupPlugin(main, options, editSchema) {
	var deps = [
		Input.inputRules({
			rules: Input.allInputRules.concat(Setup.buildInputRules(editSchema))
		}),
		keymap(Setup.buildKeymap(editSchema, options.mapKeys)),
		keymap(Commands.baseKeymap)
	];
	if (options.history !== false) deps.push(history());
	var menu = options.menu(main, Setup.buildMenuItems(editSchema));

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

