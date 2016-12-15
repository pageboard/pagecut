module.exports = Cache;

function Cache() {
	this.store = {};
}

Cache.prototype.get = function(url) {
	var data = this.store[url];
	data.url = url;
	return data;
};

Cache.prototype.set = function(data) {
	if (data && data.url) data = [data];
	for (var i = 0; i < data.length; i++) {
		this.store[data[i].url] = data[i];
	}
};

