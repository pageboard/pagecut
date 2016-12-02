exports.define = defineSpecs;
exports.rootAttributes = rootAttributes;

function defineSpecs(coed, component, schemaSpecs, nodeViews, dom) {
	var content = [];
	var typeName, type;
	var contentName = dom.getAttribute('block-content');
	var specName, spec, recursive = false;
	if (!component.index) {
		component.index = 1;
		spec = createRootSpec(coed, component, nodeViews, dom);
		specName = spec.typeName;
		recursive = true;
	} else if (contentName) {
		spec = createContentSpec(component, nodeViews, dom);
		spec.content = component.specs[contentName];
		if (!spec.content) throw new Error("Missing component.specs[" + contentName + "]");
		specName = spec.typeName + '[block_content="' + contentName + '"]';
	} else if (dom.querySelector('[block-content]')) {
		spec = createWrapSpec(component, nodeViews, dom);
		specName = spec.typeName;
		recursive = true;
	} else {
		spec = createHoldSpec(component, nodeViews, dom);
		specName = spec.typeName;
	}

	var content = [];
	if (recursive) {
		var childs = dom.childNodes;
		for (var i=0, child; i < childs.length; i++) {
			child = childs.item(i);
			if (child.nodeType != Node.ELEMENT_NODE) continue;
			content.push(defineSpecs(coed, component, schemaSpecs, nodeViews, child));
		}
		if (content.length) spec.content = content.join(" ");
	}
	if (spec) {
		schemaSpecs.nodes = schemaSpecs.nodes.addToEnd(spec.typeName, spec);
	}
	return specName;
}

function createRootSpec(coed, component, nodeViews, dom) {
	var defaultAttrs = tagAttrs(dom);
	var defaultSpecAttrs = specAttrs(Object.assign({
		id: null,
		block_focused: null,
		block_type: component.name
	}, defaultAttrs));

	return {
		typeName: "root_" + component.name,
		coedType: "root",
		group: component.group,
		inline: !!component.inline,
		defining: true,
		attrs: Object.assign({}, defaultSpecAttrs, specAttrs(component.properties, "data-")),
		parseDOM: [{
			tag: defaultAttrs.tag,
			getAttrs: function(dom) {
				var attrs = rootAttributes(coed, component, dom);
				prepareDom(component, dom);
				return attrs;
			}
		}],
		toDOM: function(node) {
			var dom, ex;
			if (coed.exporter) {
				ex = coed.toBlock(node, true);
				if (component.output) {
					dom = component.output(coed, ex.data, ex.content);
				} else {
					dom = component.to(ex.data);
					coed.merge(dom, ex.content);
				}
				if (coed.exporter !== true) {
					coed.exporter(component, dom, ex.data, ex.content);
				}
				return dom;
			} else {
				ex = coed.toBlock(node);
				dom = component.to(ex.data);
				prepareDom(component, dom);
				var attrs = Object.assign(domAttrs(node.attrs), nodeAttrs(dom));
				return [dom.nodeName, attrs, 0];
			}
		}
	};
}

function rootAttributes(coed, component, dom) {
	var attrs = tagAttrs(dom);
	var data;
	if (coed.importer) data = coed.importer(component, dom);
	if (data == null) data = component.from(dom);
	for (var k in data) {
		attrs['data-' + k] = data[k];
	}
	return attrs;
}

function createWrapSpec(component, nodeViews, dom) {
	var defaultAttrs = tagAttrs(dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	return {
		typeName: "wrap_" + component.name + component.index++,
		coedType: "wrap",
		attrs: defaultSpecAttrs,
		parseDOM: [{
			tag: domSelector(defaultAttrs),
			getAttrs: function(dom) {
				if (dom.coedName != component.name || dom.coedType != "wrap") return false;
				return tagAttrs(dom);
			}
		}],
		toDOM: function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		}
	};
}

function createContentSpec(component, nodeViews, dom) {
	var defaultAttrs = tagAttrs(dom);
	var defaultSpecAttrs = specAttrs(defaultAttrs);

	return {
		typeName: "content_" + component.name + component.index++,
		coedType: "content",
		attrs: defaultSpecAttrs,
		parseDOM: [{
			tag: defaultAttrs.tag + '[block-content="'+defaultAttrs.block_content+'"]',
			getAttrs: function(dom) {
				if (dom.coedName != component.name || dom.coedType != "content") return false;
				return tagAttrs(dom);
			}
		}],
		toDOM: function(node) {
			return [node.attrs.tag, domAttrs(node.attrs), 0];
		}
	};
}

function createHoldSpec(component, nodeViews, dom) {
	var defaultAttrs = tagAttrs(dom);
	var sel = domSelector(defaultAttrs);
	var defaultSpecAttrs = specAttrs(Object.assign(defaultAttrs, {
		html: dom.outerHTML
	}));

	return {
		typeName: "hold_" + component.name + component.index++,
		coedType: "hold",
		selectable: false,
		isLeaf: true, // replaces readonly patch
		attrs: defaultSpecAttrs,
		parseDOM: [{ tag: sel, getAttrs: function(dom) {
			if (dom.coedName != component.name || dom.coedType != "hold") return false;
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
			elem.setAttribute('contenteditable', 'false');
			return elem;
		}
	};
}

function prepareDom(component, dom) {
	var name;
	for (var i=0, child; i < dom.childNodes.length; i++) {
		child = dom.childNodes.item(i);
		if (child.nodeType != Node.ELEMENT_NODE) continue;
		child.coedName = component.name;
		name = child.getAttribute('block-content');
		if (name) {
			child.coedType = "content";
		} else if (child.querySelector('[block-content]')) {
			child.coedType = "wrap";
			prepareDom(component, child);
		} else {
			child.coedType = "hold";
		}
	}
}

function domAttrs(attrs) {
	var obj = {};
	Object.keys(attrs).forEach(function(k) {
		if (k == 'tag' || k == 'html' || k.indexOf('data-') == 0) return;
		obj[k.replace(/_/g, '-')] = attrs[k];
	});
	return obj;
}

function tagAttrs(dom) {
	var obj = nodeAttrs(dom, true);
	obj.tag = dom.nodeName.toLowerCase();
	return obj;
}

function specAttrs(atts, prefix) {
	var obj = {};
	prefix = prefix || "";
	var val;
	for (var k in atts) {
		val = atts[k];
		if (val && val.default !== undefined) val = val.default;
		else if (typeof val != "string") val = null;
		obj[prefix + k] = {
			'default': val
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
