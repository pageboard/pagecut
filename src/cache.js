module.exports = Cache;

function Cache() {
	this.store = {};
}

Cache.prototype.get = function(key) {
	return this.store[key];
};

Cache.prototype.set = function(key, data) {
	this.store[key] = data;
};

