var Setup = require("prosemirror-example-setup");
var State = require("prosemirror-state");
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


var CreateUrlPlugin = require("./utils/url-plugin");

var CreateCoedPlugin = require("./plugin");

var nodesSpec = baseSchema.nodeSpec;
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
	buildMenu: defaultBuildMenu
};

exports.Editor = Editor;

function defaultBuildMenu(Menu, Commands, items) {
	return items.fullMenu;
}

function CreateSetupPlugin(options) {
	var deps = [
		Input.inputRules({
			rules: Input.allInputRules.concat(Setup.buildInputRules(options.schema))
		}),
		keymap(Setup.buildKeymap(options.schema, options.mapKeys)),
		keymap(Commands.baseKeymap)
	];
	if (options.history !== false) deps.push(history);
	var menu = options.buildMenu(Menu, Commands, Setup.buildMenuItems(options.schema));

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
	this.model = Model;
	var opts = this.opts = Object.assign({}, exports.defaults, config);

	if (!opts.components) opts.components = [];

	opts.plugins.push(CreateUrlPlugin(opts));
	opts.plugins.push(CreateCoedPlugin(this, opts));
	opts.components.forEach(function(component) {
		defineSpec(me, component, opts.spec, component.to({}));
	});

	if (opts.spec) {
		opts.schema = new Model.Schema(opts.spec);
		delete opts.spec;
	}

	opts.plugins.push(CreateSetupPlugin(opts));

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
			if (!opts.action || !opts.action(action)) view.updateState(view.state.applyAction(action));
		}
	});
	var view = this.view = menuBarView.editor;

	opts.components.forEach(function(component) {
		if (component.init) component.init(me);
	});
}

Editor.prototype.set = function(dom, fn) {
	if (fn) this.opts.components.forEach(function(component) {
		component.setfn = fn;
	});
	var view = this.view;
	var newDoc = view.props.domParser.parse(dom);
	var start = State.Selection.atStart(view.state.doc);
	var end = State.Selection.atEnd(view.state.doc);
	var oldDocEnd = view.state.doc.content.offsetAt(view.state.doc.content.childCount);
	var action = view.state.tr.replaceWith(0, oldDocEnd, newDoc.content).action();

	view.updateState(view.state.applyAction(action));
	if (fn) this.opts.components.forEach(function(component) {
		delete component.setfn;
	});
};

Editor.prototype.get = function(fn) {
	this.opts.components.forEach(function(component) {
		component.getfn = fn || true;
	});
	var view = this.view;
	var dom = view.props.domSerializer.serializeFragment(view.state.doc.content);
	this.opts.components.forEach(function(component) {
		delete component.getfn;
	});
	return dom;
};

Editor.prototype.replace = function(stuff) {
	var tr;
	var view = this.view;
	if (typeof stuff == "string") {
		tr = view.state.tr.insertText(stuff);
	} else if (stuff instanceof Node) {
		// TODO the dom parser should be the one created from current parent node content spec
		tr = view.state.tr.replaceSelection(view.props.domParser.parse(stuff));
	}
	view.state.applyAction(tr.scrollAction());
};

Editor.prototype.delete = function() {
	this.view.state.applyAction(this.view.state.tr.deleteSelection().scrollAction());
};

function defineSpec(coed, component, schemaSpecs, dom) {
	var content = [];
	var typeName, type;
	var contentName = dom.getAttribute('content-name');
	var specName, spec, recursive = false;
	if (!component.index) {
		component.index = 1;
		spec = createRootSpec(coed, component, dom);
		specName = typeName = "root_" + component.name;
		recursive = true;
	} else if (contentName) {
		spec = createContentSpec(component, dom);
		spec.content = component.contentSpec[contentName];
		if (!spec.content) throw new Error("Missing component.contentSpec[" + contentName + "]");
		typeName = "content_" + component.name + component.index++;
		specName = typeName + '[content_name="' + contentName + '"]';
	} else if (dom.querySelector('[content-name]')) {
		specName = typeName = "wrap_" + component.name + component.index++;
		spec = createWrapSpec(component, dom);
		recursive = true;
	} else {
		specName = typeName = "hold_" + component.name + component.index++;
		spec = createHoldSpec(component, dom);
	}

	var content = [];
	if (recursive) {
		var childs = dom.childNodes;
		for (var i=0, child; i < childs.length; i++) {
			child = childs.item(i);
			if (child.nodeType != Node.ELEMENT_NODE) continue;
			content.push(defineSpec(coed, component, schemaSpecs, child));
		}
		if (content.length) spec.content = content.join(" ");
	}
	if (spec) {
		schemaSpecs.nodes = schemaSpecs.nodes.addToEnd(typeName, spec);
	}
	return specName;
}

function createRootSpec(coed, component, dom) {
	var defaultAttrs = specAttrs(Object.assign({id: ""}, tagAttrs(dom)));

	return {
		coedType: "root",
		group: component.group || "block",
		inline: component.inline || false,
		attrs: (function() {
			var dataSpec = component.dataSpec, specVal, attOpt;
			var attrs = {};
			for (var k in dataSpec) {
				specVal = dataSpec[k];
				attOpt = {};
				if (typeof specVal == "string") {
					attOpt.default = specVal;
				} else {
					attOpt.default = specVal.default || "";
				}
				attrs['data-' + k] = attOpt;
			}
			return Object.assign({}, defaultAttrs, attrs);
		})(),
		parseDOM: [{ tag: defaultAttrs.tag.default, getAttrs: function(dom) {
			var attrs = tagAttrs(dom);
			var data;
			if (component.setfn) data = component.setfn(component, dom);
			if (data == null) data = component.from(dom);
			for (var k in data) {
				attrs['data-' + k] = data[k];
			}
			dom.coedType = "root";
			prepareDom(dom);
			return attrs;
		}}],
		toDOM: function(node) {
			var dom, ex;
			if (component.getfn) {
				ex = exportNode(coed.view, node, true);
				if (component.getfn !== true) {
					dom = component.getfn(component, ex.data, ex.content);
				}
				if (dom == null && component.output) {
					dom = component.output(ex.data, ex.content);
				}
				return dom;
			} else {
				ex = exportNode(coed.view, node);
				dom = component.to(ex.data);
				prepareDom(dom);
				return [dom.nodeName, nodeAttrs(dom), 0];
			}
		}
	};
}


function createWrapSpec(component, dom) {
	var defaultAttrs = specAttrs(tagAttrs(dom));

	return {
		coedType: "wrap",
		attrs: defaultAttrs,
		parseDOM: [{ tag: defaultAttrs.tag.default, getAttrs: function(dom) {
			if (dom.coedType != "wrap") return false;
			return tagAttrs(dom);
		}}],
		toDOM: function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		}
	};
}

function createContentSpec(component, dom) {
	var defaultAttrs = specAttrs(tagAttrs(dom));

	return {
		coedType: "content",
		attrs: defaultAttrs,
		parseDOM: [{ tag: defaultAttrs.tag.default + '[content-name]', getAttrs: function(dom) {
			if (dom.coedType != "content") return false;
			return tagAttrs(dom);
		}}],
		toDOM: function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		}
	};
}

function createHoldSpec(component, dom) {
	var defaultAttrs = specAttrs(Object.assign(tagAttrs(dom), {
		html: dom.outerHTML
	}));

	var sel = defaultAttrs.tag.default;
	var selClass = defaultAttrs.class;
	if (selClass && selClass.default) sel += "." + selClass.default;

	return {
		coedType: "hold",
		selectable: false,
		readonly: true,
		attrs: defaultAttrs,
		parseDOM: [{ tag: sel, getAttrs: function(dom) {
			if (dom.coedType != "hold") return false;
			var attrs = tagAttrs(dom);
			attrs.html = dom.outerHTML;
			return attrs;
		}}],
		toDOM: function(node) {
			var div = document.createElement("div");
			div.innerHTML = node.attrs.html;
			var elem = div.querySelector('*');
			if (!elem) throw new Error("Wrong html on HoldType", node, defaultAttrs);
			return elem;
		}
	};
}

function exportNode(view, node, content) {
	var data = {};
	for (var k in node.attrs) {
		if (k.indexOf('data-') == 0) {
			data[k.substring(5)] = node.attrs[k];
		}
	}
	return {
		data: data,
		content: content ? collectContent(view, node) : null
	};
}

function prepareDom(dom) {
	var name;
	for (var i=0, child; i < dom.childNodes.length; i++) {
		child = dom.childNodes.item(i);
		if (child.nodeType != Node.ELEMENT_NODE) continue;
		name = child.getAttribute('content-name');
		if (name) {
			child.coedType = "content";
		} else if (child.querySelector('[content-name]')) {
			child.coedType = "wrap";
			prepareDom(child);
		} else {
			child.coedType = "hold";
		}
	}
}

function collectContent(view, node, content) {
	var type = node.type.spec.coedType;
	if (type == "content") {
		content[node.attrs.content_name] = view.props.domSerializer.serializeNode(node);
	} else if (type != "root" || !content) {
		if (!content) content = {};
		node.forEach(function(child) {
			collectContent(view, child, content);
		});
	}
	return content;
}

function domAttrs(attrs) {
	var obj = {};
	Object.keys(attrs).forEach(function(k) {
		if (k == 'tag' || k == 'html') return;
		obj[k.replace(/_/g, '-')] = attrs[k];
	});
	return obj;
}

function tagAttrs(dom) {
	var obj = nodeAttrs(dom, true);
	obj.tag = dom.nodeName.toLowerCase();
	return obj;
}

function specAttrs(atts) {
	var obj = {};
	for (var k in atts) {
		obj[k] = {
			'default': atts[k]
		};
	}
	return obj;
}

function nodeAttrs(node, convert) {
	var obj = {};
	var atts = node.attributes;
	var att, name;
	for (var i=0; i < atts.length; i++) {
		att = atts[i];
		name = att.name;
		if (convert) name = name.replace(/-/g, '_');
		obj[name] = att.value;
	}
	return obj;
}
