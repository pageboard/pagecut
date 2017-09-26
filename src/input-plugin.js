var State = require("prosemirror-state");
var Model = require("prosemirror-model");

module.exports = function(view, options) {
	return {
		props: new InputPlugin(view, options)
	};
};

function InputPlugin(view, options) {
	for (var name in InputPlugin.prototype) {
		this[name] = this[name].bind(this);
	}
	this.view = view;
}

InputPlugin.prototype.handleTextInput = function(view, from, to, text) {
	var tr = view.state.tr;
	// return true to disable default insertion
	var parents = view.utils.selectionParents(tr, {from: from, to: to});
	if (!parents.length) return true;
	var parent = parents[0];
	parent = parent.container || parent.root;
	if (tr.selection.node && tr.selection.node.isTextblock) {
		// change selection to be inside that node
		view.dispatch(
			tr.setSelection(
				State.Selection.near(tr.selection.$from)
			)
		);
		return false;
	}
	if (parent && (parent.node && parent.node.isTextblock || parent.mark)) {
		// it should be all right then
		return false;
	}
	return true;
};

InputPlugin.prototype.transformPasted = function(pslice) {
	var view = this.view;
	var frag = view.utils.fragmentApply(pslice.content, function(node) {
		delete node.attrs.block_focused;
		var id = node.attrs.block_id;
		if (!id) return;
		var block = view.blocks.get(id);
		if (!block) return;
		delete block.focused;
	});
	return new Model.Slice(frag, pslice.openStart, pslice.openEnd);
};

InputPlugin.prototype.clipboardTextParser = function(str, $context) {
	var dom = HTMLReader.read(str);
	// TODO do something if more than one block is being pasted at once
	var blockDom = dom.querySelector('[block-type]');
	var type = blockDom && blockDom.getAttribute("block-type");
	var state = this.view.state;
	var nodeType = type && state.schema.nodes[type];
	var opts = {
		preserveWhitespace: true,
		context: $context
	};
	if (nodeType) {
		var from = state.selection.from;
		var pos = Transform.insertPoint(state.doc, state.selection.from, nodeType);
		if (pos == null) return Model.Slice.empty;
		if (pos != from) {
			var sel = State.TextSelection.create(state.doc, pos);
			this.view.dispatch(state.tr.setSelection(sel));
			opts.context = sel.$from;
		}
	} else if (dom.nodeType == 1) {
		if (dom.nodeName != "IFRAME") return; // default handlers
	} else {
		return; // default handlers
	}
	var parser = this.view.someProp("clipboardParser")
		|| this.view.someProp("domParser")
		|| Model.DOMParser.fromSchema(state.schema);
	return parser.parseSlice(dom, opts);
};

var HTMLReader = {
	doc: document.cloneNode(false),
	wrapMap: {
		thead: ["table"],
		colgroup: ["table"],
		col: ["table", "colgroup"],
		tr: ["table", "tbody"],
		td: ["table", "tbody", "tr"],
		th: ["table", "tbody", "tr"]
	},
	read: function(html) {
		var metas = /(\s*<meta [^>]*>)*/.exec(html);
		if (metas) {
			html = html.slice(metas[0].length);
		}
		var firstTag = /(?:<meta [^>]*>)*<([a-z][^>\s]+)/i.exec(html);
		var elt = HTMLReader.doc.createElement("div");
		var wrap;
		var depth = 0;

		if (wrap = firstTag && HTMLReader.wrapMap[firstTag[1].toLowerCase()]) {
			html = wrap.map(function(n) {
				return "<" + n + ">";
			}).join("") + html + wrap.map(function(n) {
				return "</" + n + ">";
			}).reverse().join("");
			depth = wrap.length;
		}
		elt.innerHTML = html;
		for (var i = 0; i < depth; i++) {
			elt = elt.firstChild;
		}
		return elt;
	}
}

