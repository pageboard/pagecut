

module.exports = CoLink;

// tag: the tag name (the same name is used for pm or dom node, for the sake of simplicity)
// attrs: the attributes known by pm, with default values
// contents: the contents specs by name
// from: function(dom) -> props
// to: function(props) -> dom
// where props is an object with attributes and serialized contents




function CoLink(options) {
	this.tag = "co-link";
	this.name = "link";
	this.dataSpec = {
		id: "",
		type:  "none",
		url: "",
		description: "",
		icon: "",
		thumbnail: "",
		size: "",
		width: "",
		height: "",
		duration: "",
		site: "",
		html: ""
	};
	this.contentSpec = {
		title: "inline<_>*",
		content: "inline<_>*"
	};

	if (options.inspector) this.inspector = options.inspector;
}

CoLink.prototype.init = function(pm) {
	pm.content.addEventListener('click', function(e) {
		var target = e.target;
		var root = target.closest('co-link');
		if (!root) return;
		if (!target.closest('[name="preview"]')) return;
		e.preventDefault();
		var data = this.from(root);
		console.log("will preview", data);
	}.bind(this));
};

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

CoLink.prototype.fill = function(parent, props) {
	parent.innerHTML = "";
	Object.keys(props).forEach(function(name) {
		var val = props[name];
		parent.appendChild(val);
	});
};

CoLink.prototype.formatDimensions = function(w, h) {
	if (!w) return;
	if (!h) return w + 'px';
	return w + 'x' + h;
};

CoLink.prototype.parseDimensions = function(obj, dim) {
	if (!dim) return;
	if (/px$/.test(dim)) {
		obj.width = parseInt(dim);
	} else if (/^\d+x\d+$/.test(dim)) {
		dim = dim.split('x');
		obj.width = parseInt(dim[0]);
		obj.height = parseInt(dim[1]);
	}
};

CoLink.prototype.formatDuration = function(d) {
	return d;
};

CoLink.prototype.formatSize = function(s) {
	if (!s) return;
	return Math.round(s / 1000) + "KB";
};

CoLink.prototype.parseSize = function(obj, s) {
	if (!s) return;
	if (/^\d+KB$/.test(s)) obj.size = parseInt(s) * 1000;
};

CoLink.prototype.to = function(data, content) {
	var me = this;
	var node = document.createElement(me.tag);
	node.innerHTML = '<header><a name="type"></a><a title="" target="_blank"></a><a name="preview"></a></header><div>\
<div coed-name="title"></div><div coed-name="content"></div>\
</div><aside><div><div></div><p></p></div><figure></figure></aside><script type="text/html"></script>';
	var link = node.querySelector('header > a[title]');

	link.setAttribute("title", data.site || "");
	if (data.type) node.setAttribute("type", data.type);
	if (data.id) node.setAttribute("id", data.id);
	if (data.url) link.setAttribute("href", data.url);
	if (data.icon) me.ensure(link, 'img', { src: data.icon });
	if (data.thumbnail) me.ensure(node.querySelector('figure'), 'img', { src: data.thumbnail });
	if (data.html) me.ensure(node, 'script', {type: 'text/html'}).textContent = data.html || '';

	var obj = {
		dimensions: me.formatDimensions(data.width, data.height),
		duration: me.formatDuration(data.duration),
		size: me.formatSize(data.size)
	};
	Object.keys(obj).forEach(function(key) {
		var span = document.createElement('span');
		span.setAttribute('title', key);
		span.innerHTML = obj[key] || "";
		obj[key] = span;
	});
	node.querySelector('aside > div > p').innerHTML = data.description || "";

	me.fill(node.querySelector('aside > div > div'), obj);

	if (content) Object.keys(content).forEach(function(name) {
		node.querySelector('[coed-name="'+name+'"]').innerHTML = content[name];
	});

	return node;
};

CoLink.prototype.from = function(node) {
	var me = this;
	var data = {};
	data.type = node.getAttribute('type') || 'none';
	data.id = node.getAttribute('id') || undefined;

	var link = node.querySelector("header > a[href]");
	if (link) {
		data.url = link.getAttribute('href');
		data.site = link.getAttribute('title');
		var icon = link.querySelector("img");
		if (icon) data.icon = icon.getAttribute('src');
	}
	var html = node.querySelector('script[type="text/html"]');
	if (html) data.html = html.textContent;
	var thumb = node.querySelector('aside > figure > img');
	if (thumb) {
		data.thumbnail = thumb.getAttribute('src');
	}
	var i;
	var asides = node.querySelectorAll('aside > div > span');
	var aside, title, val;
	for (i=0; i < asides.length; i++) {
		aside = asides.item(i);
		title = aside.getAttribute('title');
		val = aside.innerHTML;
		if (title == 'size') me.parseSize(data, val);
		else if (title == 'dimensions') me.parseDimensions(data, val);
		else data[title] = val;
	}
	var description = node.querySelector('aside > div > p');
	if (description) data.description = description.innerHTML;
	return data;
};

CoLink.prototype.input = function(node) {
	var me = this;

	var loadingId = 'id-colink-' + Date.now();

	var info = {};

	if (typeof node == "string") {
		info.title = node;
		info.url = node;
	} else {
		info.title = node.innerText;
		info.fragment = node;
	}

	function parseDom(node) {
		var div = document.createElement("div");
		div.appendChild(node);
		var newNode = pm.schema.parseDOM(div);
		return newNode.firstChild;
	}

	me.inspector(info, function(err, props) {
		var oldnode = document.getElementById(loadingId);
		if (!oldnode) {
			return;
		}
		var pos = pm.posFromDOM(oldnode);
		var begin = pos.pos;
		var $pos = pm.doc.resolve(begin);
		var end = begin + $pos.nodeAfter.nodeSize;

		if (err) {
			console.error(err);
			pm.tr.delete(begin, end).apply();
			return;
		}
		var dom = me.to(props, {
			title: props.title
		});

		pm.tr.replaceWith(begin, end, parseDom(dom)).apply();
	});

	var loadingNode = me.to({
		type: "none",
		id: loadingId
	}, {
		title: info.title
	});

	return parseDom(loadingNode);
}

CoLink.prototype.output = function(data) {
	if (data.html) {
		var div = document.createElement('div');
		div.innerHTML = data.html;
		return div;
	} else {
		return this.to(data);
	}
};
