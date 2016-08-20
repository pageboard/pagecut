const {ProseMirror} = require("prosemirror/dist/edit");
const {Schema} = require("prosemirror/dist/model");
const basicSchema = require("prosemirror/dist/schema-basic");
const {exampleSetup, buildMenuItems} = require("prosemirror/dist/example-setup");
const {tooltipMenu, menuBar} = require("prosemirror/dist/menu");

const UrlPlugin = require("./url-plugin");
const ComponentPlugin = require("./component-plugin");
const BreaksPlugin = require("./breaks-plugin");

let schemaSpec = {
	nodes: {
		doc: {type: basicSchema.Doc, content: "block+"},
		paragraph: { type: basicSchema.Paragraph, content: "inline<_>*", group: "block" },
		text: {type: basicSchema.Text, group: "inline"},
		hard_break: {type: basicSchema.HardBreak, group: "inline"}
	},
	marks: {
		strong: basicSchema.StrongMark,
		em: basicSchema.EmMark
	}
};

let componentPlugin = ComponentPlugin.config(schemaSpec);

exports.defaults = {
	spec: schemaSpec,
	plugins: [
		BreaksPlugin.config(),
		exampleSetup.config({menuBar: false, tooltipMenu: false}),
		UrlPlugin.config({
			action: function(pm, url, child) {
				var types = pm.schema.nodes;
				return types.component_resource.create({ href: url	});
			}
		}),
		componentPlugin
	]
};

exports.init = function(config) {
	var opts = Object.assign({}, exports.defaults, config);
	if (opts.spec) {
		opts.schema = new Schema(opts.spec);
		delete opts.spec;
	}
	if (opts.content) {
		opts.doc = opts.schema.parseDOM(opts.content);
		delete opts.content;
	}

	let pm = new ProseMirror(opts);
	let menu = buildMenuItems(pm.schema);
	menuBar.config({float: true, content: menu.fullMenu}).attach(pm);
	return pm;
};

