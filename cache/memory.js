const moment = require('moment');


class Memory {
    constructor(config) {
        let ttl = Array.isArray(config.ttl) ? config.ttl : [ config.ttl ];
        this._ttl = moment.duration(...ttl).asMilliseconds();
        this._map = {};
        this._timeouts = {};
    }

    /**
     * Returns the key if it exists in this cache.
     * @param {string} key
     * @param {function} cb
     */
    fetch(key, cb) {
        cb(null, this._map[key]);
    }

    /**
     * Stores data in this cache.
     * @param {string} key
     * @param {object} data
     * @param {function} cb
     */
    store(key, data, cb) {
        this._map[key] = data;
        this._timeouts[key] && clearTimeout(this._timeouts[key]);
        this._timeouts[key] = setTimeout(() => {
            delete this._map[key];
            delete this._timeouts[key];
        }, this._ttl);
        cb(null, data);
    }

    /**
     * Removes the key if it exists in this cache and returns it via callback.
     * @param {string} key
     * @param {function} cb
     */
    remove(key, cb) {
        let value = this._map[key];
        delete this._map[key];
        this._timeouts[key] && clearTimeout(this._timeouts[key]);
        delete this._timeouts[key];
        cb(null, value);
    }

    /**
     * Clears all stored cache entries from memory.
     */
    clear() {
        this._map = {};
        for (let prop in this._timeouts) {
            clearTimeout(this._timeouts[prop])
        }
        this._timeouts = {};
    }
}

module.exports = Memory;
