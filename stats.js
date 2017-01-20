const config = require('cheevr-config');
const moment = require('moment');


/**
 * The statistics object that is returned by the cache with information about how many hits/misses we've had in the
 * last minute.
 * @typedef {object} CacheStats
 * @property {number} total                     Total number of requests made to the cache service
 * @property {object} hit                       Tells us how many hits we've had
 * @property {number} hit.count                 The number of cache hits
 * @property {number} hit.ratio                 The ratio of hits out of all cache look ups
 * @property {number} miss                      Tells us how many misses we've had
 * @property {number} miss.count                The number of cache misses
 * @property {number} miss.ratio                The ratio of misses out of all cache look ups
 * @property {object<string, KeyStats>} [keys]  Individual key stats that give details information on hits and misses
 */

/**
 * Holds stats for individual keys.
 * @typedef {object} KeyStats
 * @property {string} key       The name of the key used store values in cache
 * @property {number} request   Number of total requests
 * @property {number} hit       Tells us how many hits we've had
 * @property {number} miss      Tells us how many misses we've had
 */


class Stats {
    constructor() {
        let interval = Array.isArray(config.cache.stats.interval) ? config.cache.stats.interval : [config.cache.stats.interval];
        this._interval = moment.duration(...interval).asMilliseconds();
        this._threshold = config.cache.stats.threshold;
        this._keys = {};
        this._hits = 0;
        this._misses = 0;
    }

    /**
     * Record a request for a key independent of whether cache is used or not
     * @param key
     */
    set request(key) {
        if (this._threshold) {
            this._keys[key] = this._keys[key] || { request: 0, hit: 0, miss: 0 };
            this._keys[key].request++;
            setTimeout(() => this._keys[key].request--, this._interval);
        }
    }

    /**
     * Record a hit for a given key
     * @param {string} key
     */
    set hit(key) {
        this._hits++;
        setTimeout(() => this._hits--, this._interval);
        if (this._threshold) {
            this._keys[key].hit++;
            setTimeout(() => this._keys[key].hit--, this._interval);
        }
    }

    /**
     * Record a miss for a given key
     * @param {string} key
     */
    set miss(key) {
        this._misses++;
        setTimeout(() => this._misses--, this._interval);
        if (this._threshold) {
            this._keys[key].miss++;
            setTimeout(() => this._keys[key].miss--, this._interval);
        }
    }

    /**
     * Returns a snapshot of the current cache stats with numbers of the last recording interval (set in cache config).
     * If no data has been recorded the function will return null.
     * @returns CacheStats | null
     */
    get snapshot() {
        let total = this._hits + this._misses;
        if (total == 0) {
            return null;
        }
        let stats = {
            total,
            hit: {
                count: this._hits,
                ratio: this._hits / total
            },
            miss: {
                count: this._misses,
                ratio: this._misses / total,
            }
        };
        if (this._keys) {
            let keys = [];
            for (let key in this._keys) {
                if (this._keys[key].request >= this._threshold) {
                    keys.push({
                        key,
                        request: this._keys[key].request,
                        hit: this._keys[key].hit,
                        miss: this._keys[key].miss,
                    });
                }
            }
            if (keys.length) {
                stats.keys = keys;
            }
        }
        return stats;
    }
}

module.exports = Stats;
