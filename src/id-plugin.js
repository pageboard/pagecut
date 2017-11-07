module.exports = function(view) {
	var count = 0;
	setInterval(function() {
		count = 0;
	}, 2000);
	return {
		appendTransaction: function(trs, oldState, newState) {
			var tr = newState.tr;
			var itr;
			var standaloned = false;
			if (count++ > 500) {
				console.error("Loop in appendTransaction for id-plugin");
				return;
			}
			if (processStandalone(tr, newState.doc)) {
				return tr;
			}
		}
	};
	function processStandalone(tr, root, offset) {
		var modified = false;
		if (!offset) offset = 0;
		var ids = {};
		root.descendants(function(node, pos, parent) {
			var attrs = node.attrs;
			pos += offset;
			var id = attrs.block_id;
			var type = attrs.block_type;
			if (!type) return;
			var el = view.element(type);
			if (!el) return;
			var standalone = attrs.block_standalone == "true";
			var gen = false;
			if (standalone && id && ids[id]) {
				standalone = false;
			}
			var gen = !standalone && !el.inplace && (!id || ids[id]);
			var rem = id && el.inplace;
			if (gen) {
				var newId = view.blocks.genId();
				var block = view.blocks.fromAttrs(attrs);
				block.id = newId;
				view.blocks.set(block);
				var newAttrs = Object.assign({}, attrs, {
					block_id: newId
				});
				if (!standalone) {
					delete newAttrs.block_standalone;
					block.standalone = false;
				}
				tr.setNodeMarkup(pos, null, newAttrs);
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
			if (standalone) {
				if (processStandalone(tr, node, pos + 1)) {
					modified = true;
				}
				return false;
			}
		});
		return modified;
	}
};

