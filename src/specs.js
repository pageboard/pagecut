module.exports = defineSpecs;

function defineSpecs(coed, component, schemaSpecs, dom) {
	var content = [];
	var typeName, type;
	var contentName = dom.getAttribute('block-content');
	var specName, spec, recursive = false;
	if (!component.index) {
		component.index = 1;
		spec = createRootSpec(coed, component, dom);
		specName = typeName = "root_" + component.name;
		recursive = true;
	} else if (contentName) {
		spec = createContentSpec(component, dom);
		spec.content = component.contentSpec[contentName];
		if (!spec.content) throw new Error("Missing component.contentSpec[" + contentName + "]");
		typeName = "content_" + component.name + component.index++;
		specName = typeName + '[block_content="' + contentName + '"]';
	} else if (dom.querySelector('[block-content]')) {
		specName = typeName = "wrap_" + component.name + component.index++;
		spec = createWrapSpec(component, dom);
		recursive = true;
	} else {
		specName = typeName = "hold_" + component.name + component.index++;
		spec = createHoldSpec(component, dom);
	}

	var content = [];
	if (recursive) {
		var childs = dom.childNodes;
		for (var i=0, child; i < childs.length; i++) {
			child = childs.item(i);
			if (child.nodeType != Node.ELEMENT_NODE) continue;
			content.push(defineSpecs(coed, component, schemaSpecs, child));
		}
		if (content.length) spec.content = content.join(" ");
	}
	if (spec) {
		schemaSpecs.nodes = schemaSpecs.nodes.addToEnd(typeName, spec);
	}
	return specName;
}

function createRootSpec(coed, component, dom) {
	var defaultAttrs = tagAttrs(dom);
	var defaultSpecAttrs = specAttrs(Object.assign({id: ""}, defaultAttrs));

	return {
		coedType: "root",
		group: component.group || "block",
		inline: component.inline || false,
		attrs: (function() {
			var dataSpec = component.dataSpec, specVal, attOpt;
			var attrs = {};
			for (var k in dataSpec) {
				specVal = dataSpec[k];
				attOpt = {};
				if (typeof specVal == "string") {
					attOpt.default = specVal;
				} else {
					attOpt.default = specVal.default || "";
				}
				attrs['data-' + k] = attOpt;
			}
			return Object.assign({}, defaultSpecAttrs, attrs);
		})(),
		parseDOM: [{
			tag: defaultAttrs.tag,
			getAttrs: function(dom) {
				var attrs = tagAttrs(dom);
				var data;
				if (component.setfn) data = component.setfn(component, dom);
				if (data == null) data = component.from(dom);
				for (var k in data) {
					attrs['data-' + k] = data[k];
				}
				dom.coedType = "root";
				prepareDom(dom);
				return attrs;
			}
		}],
		toDOM: function(node) {
			var dom, ex;
			if (component.getfn) {
				ex = exportNode(coed.view, node, true);
				if (component.getfn !== true) {
					dom = component.getfn(component, ex.data, ex.content);
				}
				if (dom == null && component.output) {
					dom = component.output(ex.data, ex.content);
				}
				return dom;
			} else {
				ex = exportNode(coed.view, node);
				dom = component.to(ex.data);
				prepareDom(dom);
				return [dom.nodeName, nodeAttrs(dom), 0];
			}
		}
	};
}

function createWrapSpec(component, dom) {
	var defaultAttrs = tagAttrs(dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	return {
		coedType: "wrap",
		attrs: defaultSpecAttrs,
		parseDOM: [{
			tag: domSelector(defaultAttrs),
			getAttrs: function(dom) {
				if (dom.coedType != "wrap") return false;
				return tagAttrs(dom);
			}
		}],
		toDOM: function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		}
	};
}

function createContentSpec(component, dom) {
	var defaultAttrs = tagAttrs(dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	return {
		coedType: "content",
		attrs: defaultSpecAttrs,
		parseDOM: [{
			tag: defaultAttrs.tag + '[block-content="'+defaultAttrs.block_content+'"]',
			getAttrs: function(dom) {
				if (dom.coedType != "content") return false;
				return tagAttrs(dom);
			}
		}],
		toDOM: function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		}
	};
}

function createHoldSpec(component, dom) {
	var defaultAttrs = tagAttrs(dom);
	var sel = domSelector(defaultAttrs);
	var defaultSpecAttrs = specAttrs(Object.assign(defaultAttrs, {
		html: dom.outerHTML
	}));

	return {
		coedType: "hold",
		selectable: false,
		readonly: true,
		attrs: defaultSpecAttrs,
		parseDOM: [{ tag: sel, getAttrs: function(dom) {
			if (dom.coedType != "hold") return false;
			var attrs = tagAttrs(dom);
			attrs.html = dom.outerHTML;
			if (defaultSpecAttrs.block_handle) dom.setAttribute('block-handle', '');
			return attrs;
		}}],
		toDOM: function(node) {
			var div = document.createElement("div");
			div.innerHTML = node.attrs.html;
			var elem = div.querySelector('*');
			if (!elem) throw new Error("Wrong html on HoldType", node, defaultAttrs);
			if (defaultSpecAttrs.block_handle) elem.setAttribute('block-handle', '');
			return elem;
		}
	};
}

function exportNode(view, node, content) {
	var data = {};
	for (var k in node.attrs) {
		if (k.indexOf('data-') == 0) {
			data[k.substring(5)] = node.attrs[k];
		}
	}
	return {
		data: data,
		content: content ? collectContent(view, node) : null
	};
}

function prepareDom(dom) {
	var name;
	for (var i=0, child; i < dom.childNodes.length; i++) {
		child = dom.childNodes.item(i);
		if (child.nodeType != Node.ELEMENT_NODE) continue;
		name = child.getAttribute('block-content');
		if (name) {
			child.coedType = "content";
		} else if (child.querySelector('[block-content]')) {
			child.coedType = "wrap";
			prepareDom(child);
		} else {
			child.coedType = "hold";
		}
	}
}

function collectContent(view, node, content) {
	var type = node.type.spec.coedType;
	if (type == "content") {
		content[node.attrs.block_content] = view.props.domSerializer.serializeNode(node);
	} else if (type != "root" || !content) {
		if (!content) content = {};
		node.forEach(function(child) {
			collectContent(view, child, content);
		});
	}
	return content;
}

function domAttrs(attrs) {
	var obj = {};
	Object.keys(attrs).forEach(function(k) {
		if (k == 'tag' || k == 'html') return;
		obj[k.replace(/_/g, '-')] = attrs[k];
	});
	return obj;
}

function tagAttrs(dom) {
	var obj = nodeAttrs(dom, true);
	obj.tag = dom.nodeName.toLowerCase();
	return obj;
}

function specAttrs(atts) {
	var obj = {};
	for (var k in atts) {
		obj[k] = {
			'default': atts[k]
		};
	}
	return obj;
}

function nodeAttrs(node, convert) {
	var obj = {};
	var atts = node.attributes;
	var att, name;
	for (var i=0; i < atts.length; i++) {
		att = atts[i];
		name = att.name;
		if (convert) name = name.replace(/-/g, '_');
		obj[name] = att.value;
	}
	return obj;
}

function domSelector(attrs) {
	var sel = attrs.tag;
	var className = attrs.class;
	if (className) sel += "." + className.split(' ').join('.');
	return sel;
}
