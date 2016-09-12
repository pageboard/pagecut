const UrlPlugin = require("./utils/url-plugin");

module.exports = CoLink;

// tag: the tag name (the same name is used for pm or dom node, for the sake of simplicity)
// attrs: the attributes known by pm, with default values
// contents: the contents specs by name
// from: function(dom) -> props
// to: function(props) -> dom
// where props is an object with attributes and serialized contents




function CoLink(options) {
	this.tag = 'co-link';
	this.attrs = {
		id: "",
		type:  "none",
		url: "",
		description: "",
		icon: "",
		thumbnail: "",
		size: "",
		width: "",
		height: "",
		duration: ""
	};
	this.contents = {
		title: "inline<_>*",
		content: "inline<_>*"
	};

	if (options.inspector) this.inspector = options.inspector;
	options.plugins.push(UrlPlugin.config({
		action: this.handle.bind(this)
	}));
}

CoLink.prototype.inspector = function(info, cb) {
	setTimeout(function() {
		info = Object.assign({}, info);
		info.type = 'link';
		cb(null, info);
	});
};

CoLink.prototype.ensure = function(parent, tag, atts) {
	var childs = parent.childNodes;
	var r = new RegExp("^" + tag + "$", "i");
	var node, child;
	for (var i=0; i < childs.length; i++) {
		child = childs[i];
		if (child.nodeType == Node.ELEMENT_NODE && r.test(child.nodeName)) {
			node = child;
			break;
		}
	}
	if (!node) {
		node = document.createElement(tag);
		parent.appendChild(node);
	}
	if (atts) Object.keys(atts).forEach(function(key) {
		node.setAttribute(key, atts[key]);
	});
	return node;
};

CoLink.prototype.fill = function(parent, tag, props) {
	parent.innerHTML = "";
	Object.keys(props).forEach(function(name) {
		var val = props[name];
		if (typeof val != "string") return;
		var node = document.createElement(tag);
		node.setAttribute('name', name);
		node.innerHTML = val;
		parent.appendChild(node);
	});
};

CoLink.prototype.formatDimensions = function(w, h) {
	if (!w) return;
	if (!h) return '→ ' + w + ' ←';
	return w + 'x' + h;
};

CoLink.prototype.formatDuration = function(d) {
	return d;
};

CoLink.prototype.formatSize = function(s) {
	var str = "";
	if (s) str += Math.round(s / 1000) + "KB";
	return str;
};

CoLink.prototype.to = function(attrs, contents) {
	var me = this;
	var node = document.createElement(me.tag);

	var link = me.ensure(node, 'a');
	link.innerHTML = "";
	var thumb = node.querySelector('aside > figure');
	thumb.innerHTML = "";
	if (attrs.type) node.setAttribute("type", attrs.type);
	if (attrs.id) node.setAttribute("type", attrs.id);
	if (attrs.url) link.setAttribute("href", attrs.url);
	if (attrs.icon) me.ensure(link, 'img', { src: attrs.icon });
	if (attrs.thumbnail) me.ensure(thumb, 'img', { src: attrs.thumbnail });

	var obj = {
		description: attrs.description,
		dimensions: me.formatDimensions(attrs.width, attrs.height),
		duration: me.formatDuration(attrs.duration),
		size: me.formatSize(attrs.size)
	};

	me.fill(node.querySelector('aside > div'), 'span', obj);
	me.fill(node.querySelector('div'), 'div', contents);
	return node;
};

CoLink.prototype.from = function(node) {
	var attrs = {};
	var contents = {};
	attrs.type = node.getAttribute('type') || 'none';
	attrs.id = node.getAttribute('id') || undefined;

	var link = node.querySelector("a");
	if (link) {
		attrs.url = link.getAttribute('href');
		var icon = link.querySelector("img");
		if (icon) attrs.icon = icon.getAttribute('src');
	}
	var thumb = node.querySelector('aside > figure > img');
	if (thumb) {
		attrs.thumbnail = thumb.getAttribute('src');
	}
	var i;
	var asides = node.querySelectorAll('aside > div > span');
	var aside;
	for (i=0; i < asides.length; i++) {
		aside = asides.item(i);
		attrs[aside.getAttribute('title')] = aside.innerHTML; // TODO innerText ?
	}

	var divs = node.querySelectorAll('div > div');
	var div;
	for (i=0; i < divs.length; i++) {
		div = divs.item(i);
		contents[div.getAttribute('name')] = div;
	}
	return {
		attrs: attrs,
		contents: contents
	};
};

CoLink.prototype.handle = function(pm, info) {
	var me = this;

	var loadingId = 'id-colink-' + Date.now();

	if (!info.title) {
		if (info.url) info.title = info.url;
		else if (info.fragment) info.title = info.fragment.firstChild.innerText;
	}

	me.inspector(info, function(err, props) {
		var oldnode = document.getElementById(loadingId);
		if (!oldnode) {
			return;
		}
		var pos = posFromDOM(oldnode);
		var begin = pos.pos;
		var $pos = pm.doc.resolve(begin);
		var end = begin + $pos.nodeAfter.nodeSize;

		if (err) {
			console.error(err);
			pm.tr.delete(begin, end).apply();
			return;
		}
		var node = me.to(props, {
			title: props.title
		});

		pm.tr.replaceWith(begin, end, pm.parseDomNode(node)).apply();
	});

	var loadingNode = me.to({
		type: "none",
		id: loadingId
	}, {
		title: info.title
	});

	return pm.parseDomNode(loadingNode);
}

