module.exports = function(view) {
	var count = 0;
	setInterval(function() {
		count = 0;
	}, 2000);

	return {
		view: function(view) {
			var tr = view.state.tr;
			if (processStandalone(tr, view.state.doc, 0, false)) {
				view.dispatch(tr);
			}
			return {};
		},
		appendTransaction: function(trs, oldState, newState) {
			var tr = newState.tr;
			if (count++ > 500) {
				console.error("Loop in appendTransaction for id-plugin");
				return;
			}
			if (trs.some(x => x.docChanged) && processStandalone(tr, newState.doc, 0, false)) {
				return tr;
			}
		}
	};
	function processStandalone(tr, root, offset, regen) {
		var modified = false;
		var ids = {};
		var lastMark;
		root.descendants(function(node, pos, parent) {
			pos += offset;
			if (node.type.name == "_" && parent.childCount > 1) {
				tr.delete(pos, pos + 1);
				offset += -1;
				modified = true;
				return false;
			}
			node.marks.forEach(function(mark) {
				if (lastMark && (mark.attrs.id == lastMark.attrs.id || mark.eq(lastMark))) {
					return;
				}
				var attrs = mark.attrs;
				var el = mark.type.spec.element;
				if (!el) return;
				var id = attrs.id;
				if (el.inplace && !id) return;
				lastMark = mark;
				if (id && ids[id] || !el.inplace && !id) {
					// add id attribute to the extended mark
					var block = view.blocks.fromAttrs(attrs);
					delete block.id;
					view.blocks.set(block);
					ids[block.id] = true;
					view.utils.extendUpdateMark(tr, pos, pos, mark, Object.assign({}, attrs, {
						id: block.id
					}));
					modified = true;
				} else if (id && el.inplace) {
					// remove id attribute from the extended mark
					var copy = Object.assign({}, attrs);
					delete copy.id;
					view.utils.extendUpdateMark(tr, pos, pos, mark, copy);
					modified = true;
				} else if (id) {
					ids[id] = true;
				}
			});
			if (!node.marks.length) lastMark = null;

			var attrs = node.attrs;
			var id = attrs.id;
			var type = attrs.type;
			if (!type) {
				var typeName = node.type.spec.typeName;
				if (typeName == "container" || typeName == "wrap") {
					var parentId = parent.type.spec.typeName == "root" ? parent.attrs.id : parent.attrs._id;
					if (parentId != attrs._id) {
						modified = true;
						tr.setNodeMarkup(pos, null, Object.assign({}, attrs, {_id: parentId}));
					}
				}
				return;
			}
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
			var gen = id && forceGen || !standalone && !el.inplace && (!id || ids[id]);
			var rem = id && el.inplace;
			if (gen) {
				var block = view.blocks.fromAttrs(attrs);
				if (knownBlock) {
					// block.type can be overriden by attrs.type
					block.type = knownBlock.type;
				}
				delete block.id;
				view.blocks.set(block);
				var newAttrs = Object.assign({}, attrs, {
					id: block.id
				});
				if (!standalone) {
					delete newAttrs.standalone;
					block.standalone = false;
				}
				tr.setNodeMarkup(pos, null, newAttrs);
				ids[block.id] = true;
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


