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
			if (processStandalone(tr, newState.doc, 0, false)) {
				return tr;
			}
		}
	};
	function processStandalone(tr, root, offset, regen) {
		var modified = false;
		var ids = {};
		root.descendants(function(node, pos, parent) {
			pos += offset;
			if (node.type.name == "_" && parent.childCount > 1) {
				tr.delete(pos, pos + 1);
				offset += -1;
				modified = true;
				return false;
			}
			var attrs = node.attrs;
			var id = attrs.id;
			var type = attrs.type;
			if (!type) return;
			var el = view.element(type);
			if (!el) return;
			var standalone = attrs.standalone == "true";
			var forceGen = regen;
			var knownBlock = view.blocks.get(id);
			// Important: RootSpec parser.getAttrs works in combination with id-plugin
			if (!standalone && knownBlock && knownBlock.standalone) {
				// user changes a block to become not standalone
				forceGen = true;
			}
			if (standalone && id && ids[id]) {
				// two instances of the same standalone block are not yet supported
				standalone = false;
				forceGen = true;
			}
			var gen = id && forceGen || !standalone && !el.inplace && (!id || ids[id]);
			var rem = id && el.inplace;
			if (gen) {
				var newId = view.blocks.genId();
				var block = view.blocks.fromAttrs(attrs);
				block.id = newId;
				view.blocks.set(block);
				var newAttrs = Object.assign({}, attrs, {
					id: newId
				});
				if (!standalone) {
					delete newAttrs.standalone;
					block.standalone = false;
				}
				tr.setNodeMarkup(pos, null, newAttrs);
				ids[newId] = true;
				modified = true;
			} else if (rem) {
				var copy = Object.assign({}, attrs);
				delete copy.id;
				tr.setNodeMarkup(pos, null, copy);
				modified = true;
			} else if (id) {
				ids[id] = true;
			}
			if (node.childCount && (standalone || forceGen)) {
				if (processStandalone(tr, node, pos + 1, forceGen)) {
					modified = true;
				}
				return false;
			}
		});
		return modified;
	}
};

