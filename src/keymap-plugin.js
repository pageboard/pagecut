var keymap = require("prosemirror-keymap").keymap;

module.exports = function(editor, options) {
	return keymap({
		Enter: breakCommand,
		Delete: deleteCommand
	});
};


function breakCommand(state, dispatch, view) {
	var tr = state.tr;
	var sel = tr.selection;
	var bef = sel.$to.nodeBefore;
	if (bef && bef.type.name == "hard_break") {
		if (sel.empty && dispatch) {
			dispatch(
				tr.delete(sel.$to.pos - 1, sel.$to.pos).scrollIntoView()
			);
		}
		// do not split root blocks
		var parent = sel.$to.parent;
		if (parent && parent.type.spec.typeName == "root") return true;
		// fall through
		return false;
	} else {
		if (dispatch) {
			dispatch(
				tr.replaceSelectionWith(state.schema.nodes.hard_break.create()).scrollIntoView()
			);
		}
		// stop here
		return true;
	}
}

function deleteCommand(state, dispatch, view) {
	var sel = state.tr.selection;
	if (!sel.empty) return false;
	var nodeAfter = state.doc.resolve(sel.$from.pos + 1).nodeAfter;
	if (!nodeAfter || nodeAfter.type.spec.typeName != "root") return false;
	// if selection is inside an empty paragraph, remove that paragraph
	if (sel.$from.parent.isTextblock && sel.$from.parent.childCount == 0) {
		if (dispatch) {
			dispatch(
				state.tr.delete(sel.$from.before(), sel.$from.after()).scrollIntoView().setMeta('addToHistory', true)
			);
		}
		return true;
	}
	return false;
}

