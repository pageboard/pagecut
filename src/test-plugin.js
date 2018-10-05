module.exports = function(editor, options) {
	// a full block must be selected when dragging some dom element
	// and selection must be restored if it wasn't dragging
	// problems:
	// - if mousedown on a non-editable element, it shouldn't change selection
	console.log("DISABLED");
	return {
		props: {
			handleClick: function(view) {
				if (!this.selection) return;
				// restore selection because only a click happened, not a drag and drop
				var tr = view.state.tr.setSelection(this.selection);
				tr.setMeta('addToHistory', false);
				view.dispatch(tr);
				delete this.selection;
				return true;
			},
			handleDOMEvents: {
				mousedown: function(view, e) {
					var dom = e.target.closest('[block-id],[block-content]');
					if (!dom || dom.hasAttribute('block-content')) return;
					var pos = view.utils.posFromDOM(dom);
					if (pos === false) return;
					if (dom != e.target) {
						this.selection = view.state.tr.selection;
						e.target.draggable = false;
						dom.draggable = true;
					} else {
						delete this.target;
					}
					var tr = view.state.tr;
					tr = tr.setSelection(view.utils.selectTr(tr, pos));
					tr.setMeta('addToHistory', false);
					view.dispatch(tr);
					return true;
				},
				mouseup: function(view, e) {
					delete this.selection;
					return true;
				}
			}
		}
	};
};

/*
function CreatePasteBlock(editor) {
	return new State.Plugin({
		props: {
			transformPasted: function(pslice) {
				var frag = editor.utils.fragmentApply(pslice.content, editor.pasteNode.bind(editor));
				return new Model.Slice(frag, pslice.openStart, pslice.openEnd);
			}
		}
	});
}
*/

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


// TODO move this to utils
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
				node = replacer(str, pos) || "";
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

