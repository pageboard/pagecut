const keymap = require("prosemirror-keymap").keymap;
const State = require("prosemirror-state");

module.exports = function(editor, options) {
	return keymap({
		Enter: breakCommand,
		Delete: deleteCommand.bind(null, false),
		Backspace: deleteCommand.bind(null, true)
	});
};


function breakCommand(state, dispatch, view) {
	var tr = state.tr;
	var sel = tr.selection;
	var bef = sel.$from.nodeBefore;
	var parent = sel.$from.parent;
	var isRoot = parent.type.spec.typeName == "root";
	var handled = false;
	if (bef && bef.type.name == "hard_break" && isRoot && parent.isTextblock) {
		if (dispatch) {
			tr.delete(sel.$from.pos - bef.nodeSize, sel.$from.pos).scrollIntoView();
		}
		// ok let's handle the split ourselves
		var elt = view.element(parent.type.name);
		if (elt && !elt.inplace && !elt.inline) {
			// elements with id cannot be split consistently
			// instead an element with the same type must be added after
			if (dispatch) {
				var from = view.utils.splitTr(tr);
				if (from != sel.from) {
					tr.setSelection(State.Selection.near(tr.doc.resolve(from + 1)));
				}
			}
			handled = true;
		}
	} else {
		var hard_break = state.schema.nodes.hard_break;
		handled = true;
		if (view.utils.canInsert(sel.$from, hard_break).node && dispatch) {
			tr.replaceSelectionWith(hard_break.create()).scrollIntoView();
		}
	}
	if (dispatch) dispatch(tr);
	return handled;
}

function deleteCommand(back, state, dispatch, view) {
	var sel = state.tr.selection;
	if (!sel.empty) return false;
	if (!sel.$from.parent.isTextblock) return false;
	// if selection is inside an empty paragraph, remove that paragraph
	var offFrom = back ? -1 : 0;
	var offTo = back ? 0 : 1;
	if (sel.$from.parent.childCount == 1 && sel.$from.parent.firstChild.nodeSize == 1) {
		if (dispatch) {
			dispatch(
				// .setMeta('addToHistory', true) doesn't work
				state.tr.delete(sel.from + offFrom, sel.from + offTo).scrollIntoView()
			);
		}
		return true;
	} else if (sel.$from.parent.childCount == 1 && sel.$from.parent.firstChild.nodeSize == 0) {
		if (dispatch) {
			dispatch(
				// .setMeta('addToHistory', true) doesn't work
				state.tr.delete(sel.$from.before(), sel.$from.after()).scrollIntoView()
			);
		}
		return true;
	} else if (!back) {
		var $to = sel.$to;
		if ($to.parentOffset == $to.parent.nodeSize - 2) {
			var nextNode = $to.doc.resolve($to.after()).nodeAfter;
			if (nextNode && nextNode.isTextblock) {
				if (dispatch) {
					dispatch(state.tr.join(sel.to + 1));
				}
				return true;
			}
		}
	} else {
		var $from = sel.$from;
		if ($from.parentOffset == 0) {
			var prevNode = $from.doc.resolve($from.before()).nodeBefore;
			if (prevNode && prevNode.isTextblock) {
				if (dispatch) {
					dispatch(state.tr.join(sel.from - 1));
				}
				return true;
			}
		}
	}
	return false;
}

