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
					if (!dom || dom.hasAttribute('block-content')) return;
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

