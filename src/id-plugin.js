module.exports = function(view) {
	return {
		appendTransaction: function(trs, oldState, newState) {
			var ids = {};
			var tr = newState.tr;
			var modified = false;
			newState.doc.descendants(function(node, pos) {
				var attrs = node.attrs;
				var id = attrs.block_id;
				var type = attrs.block_type;
				if (!type) return;
				var el = view.element(type);
				if (!el) return;
				var gen = !el.inplace && (!id || ids[id]);
				var rem = id && el.inplace;
				if (gen) {
					var newId = view.blocks.genId();
					var block = view.blocks.fromAttrs(attrs);
					block.id = newId;
					view.blocks.set(block);
					tr.setNodeMarkup(pos, null, Object.assign({}, attrs, {
						block_id: newId
					}));
					ids[newId] = true;
					modified = true;
				} else if (rem) {
					var copy = Object.assign({}, attrs);
					delete copy.block_id;
					tr.setNodeMarkup(pos, null, copy);
					modified = true;
				} else if (id) {
					ids[id] = true;
				}
			});
			if (modified) return tr;
		}
	};
};

