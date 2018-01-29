var State = require("prosemirror-state");
var Model = require("prosemirror-model");
var Transform = require("prosemirror-transform");

module.exports = function(view, options) {
	return {
		props: new InputPlugin(view, options)
	};
};

function InputPlugin(view, options) {
	this.clipboardTextParser = this.clipboardTextParser.bind(this);
	this.transformPasted = this.transformPasted.bind(this);
	view.clipboardParser.parseSlice = this.cbParseSlice.bind(this, view);
	this.view = view;
}

InputPlugin.prototype.handleTextInput = function(view, from, to, text) {
	var tr = view.state.tr;
	// return true to disable default insertion
	var parents = view.utils.selectionParents(tr, {from: from, to: to});
	if (!parents.length) return true;
	var parent = parents[0];
	var root = parent.container || parent.root;
	if (tr.selection.node && tr.selection.node.isTextblock) {
		// change selection to be inside that node
		view.dispatch(
			tr.setSelection(
				State.Selection.near(tr.selection.$from)
			)
		);
		return false;
	}
	if (root && root.node && root.node.isTextblock || parent.inline) {
		// it should be all right then
		return false;
	}
	return true;
};

InputPlugin.prototype.transformPasted = function(pslice) {
	var view = this.view;
	var frag = view.utils.fragmentApply(pslice.content, function(node) {
		delete node.attrs.focused;
		var id = node.attrs.id;
		if (!id) return;
		var block = view.blocks.get(id);
		if (!block) return;
		delete block.focused;
	});
	return pslice; // we did not change anything, just removed block focus
//	return new Model.Slice(frag, pslice.openStart, pslice.openEnd);
};

InputPlugin.prototype.clipboardTextParser = function(str, $context) {
	if (str instanceof Model.Slice) {
		return str;
	}
	var dom = HTMLReader.read(str);
	return this.view.someProp("clipboardParser").parseSlice(dom, {
		preserveWhitespace: true,
		context: $context
	});
};

InputPlugin.prototype.cbParseSlice = function(view, dom, opts) {
	// TODO do something if more than one block is being pasted at once
	var blockDom = dom.querySelector('[block-type]');
	var type = blockDom && blockDom.getAttribute("block-type");
	var state = view.state;
	var nodeType = type && state.schema.nodes[type]; // TODO should search schema.marks too ?
	var sel = state.selection;
	var tr = opts.tr || state.tr;
	if (!sel.empty) {
		tr.delete(sel.from, sel.to);
	}
	if (nodeType) {
		var from = sel.from;
		var pos = view.utils.insertPoint(tr.doc, from - 1, nodeType, 1);
		if (pos == null) {
			pos = view.utils.insertPoint(tr.doc, from, nodeType, -1);
		}
		if (pos == null) {
			return Model.Slice.empty;
		} else if (pos != from) {
			opts.context = tr.doc.resolve(pos);
		}
	}
	return Model.DOMParser.prototype.parseSlice.call(view.clipboardParser, dom, opts);
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

