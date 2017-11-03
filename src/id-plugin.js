module.exports = function(view) {
	return {
		appendTransaction: function(trs, oldState, newState) {
			var tr = newState.tr;
			if (processStandalone(tr, newState.doc)) {
				return tr;
			}
		}
	};
	function processStandalone(tr, root) {
		var modified = false;
		var ids = {};
		root.descendants(function(node, pos, parent) {
			var attrs = node.attrs;
			var id = attrs.block_id;
			var type = attrs.block_type;
			if (!type) return;
			var el = view.element(type);
			if (!el) return;
			if (attrs.block_standalone) {
				if (processStandalone(tr, node)) {
					modified = true;
				}
				return false;
			}
			var gen = !attrs.block_standalone && !el.inplace && (!id || ids[id]);
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
		return modified;
	}
};

