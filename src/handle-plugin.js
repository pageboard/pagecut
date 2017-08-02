module.exports = function(editor, options) {
	return {
		props: {
			handleDOMEvents: {
				mousedown: function(view, e) {
					var dom = e.target.closest('[block-id],[block-content]');
					if (!dom || dom.hasAttribute('block-content')) return;
					var pos = view.utils.posFromDOM(dom);
					if (pos === false) return;
					if (dom != e.target) {
						e.target.draggable = false;
						dom.draggable = true;
					}
					var tr = view.state.tr;
					tr = tr.setSelection(view.utils.selectTr(tr, pos));
					tr.setMeta('addToHistory', false);
					view.dispatch(tr);
				}
			}
		}
	};
};

