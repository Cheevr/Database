const _ = require('lodash');
const config = require('@cheevr/config');
const Cache = require('@cheevr/cache');
const elasticsearch = require('elasticsearch');
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const Logger = require('@cheevr/logging');
const moment = require('moment');
const path = require('path');
const Stats = require('./stats');


const cwd = process.cwd();
const delOps = {
    delete: true,
    deleteByQuery: true,
    deleteScript: true,
    deleteTemplate: true
};
const addOps = {
    create: true,
    index: true,
    update: true,
    updateByQuery: true
};
const createOps = {
    bulk: true,
    create: true,
    index: true,
    update: true,
    updateByQuery: true
};
const queryOps = {
    count: true,
    countPercolate: true,
    exists: true,
    get: true,
    getScript: true,
    getSource: true,
    getTemplate: true,
    mget: true,
    msearch: true,
    msearchTemplate: true,
    search: true,
    searchShards: true,
    searchTemplate: true,
    suggest: true
};

// TODO series retain option needs to be respected => indices older than that need to be deleted
// TODO Make a mock version available for testing
class Database extends EventEmitter {
    /**
     *
     * @param {object} opts The ElasticSearch options object
     * @param {string} name The name of this instance in the config file
     */
    constructor(opts, name) {
        super();
        this._opts = _.defaultsDeep({}, opts, config.defaults.database.instance);
        this._name = name;
        this._ready = false;
        this._series = {};
        this._setLogging();
        this._log.debug('%s: Attempting connection with host %s', this._name, this._opts.client.host);
        this._client = new elasticsearch.Client(this._opts.client);
        this._stats = new Stats(this._opts.stats);
        this._cache = Cache.instance(opts.cache);
        this.on('ready', () => {
            this._log.debug('%s: Connection Ready', this._name);
            this._ready = true;
        });
        // allow connection to be established
        setTimeout(this._readMappingsFromDisk.bind(this), 100);
    }

    _setLogging() {
        // TODO database logs don't have any information about which instance they belong to. messages should probably be wrapped.
        let log = this._log = Logger[this._opts.logger];
        if (log) {
            function LogToWinston() {
                this.error = log.error.bind(log);
                this.warning = log.warn.bind(log);
                this.info = log.info.bind(log);
                this.debug = log.debug.bind(log);
                this.trace = this.close = () => {
                };
            }
            this._opts.client.log = LogToWinston;
        } else {
            console.log('%s: The configured database logger is missing "%s"', this._name, this._opts.logger);
            this._log = {
                error: console.error,
                warn: console.warn,
                info: console.log,
                debug: console.log
            }
        }
    }

    get config() {
        return this._opts;
    }

    /**
     * Returns an ElasticSearch client that is wrapped by a caching object.
     * @returns {Proxy.<elasticsearch.Client>}
     */
    get client() {
        if (this._proxy) {
            return this._proxy;
        }
        let that = this;

        return this._proxy = new Proxy(this._client, {
            get(target, propKey) {
                let original = target[propKey];
                if (target[propKey] && original.length === 2) {
                    return (params, cb = err => err && that._log.error(err)) => {
                        return new Promise((resolve, reject) => {
                            let cache = params.cache;
                            delete params.cache;
                            if (cache && typeof cache === 'boolean') {
                                cache = params.index + ':' + params.type;
                            }
                            that._stats.request = cache ? cache : params.index + ':' + params.type + ':' + params.key;
                            that._fetch(cache, params.id, async (err, result) => {
                                if (err) {
                                    reject(err);
                                    return cb(err);
                                }
                                if (result) {
                                    resolve(result);
                                    cb(null, result);
                                }
                                if (createOps[propKey]) {
                                    try {
                                        await that._processIndex(params);
                                    } catch (err) {
                                        reject(err);
                                        return cb(err);
                                    }
                                }
                                original.call(target, params, (err, results, status) => {
                                    if (err) {
                                        reject(err, results, status);
                                        return cb(err, results, status);
                                    }
                                    if (delOps[propKey]) {
                                        return that._remove(cache, params.id, () => {
                                            resolve(results, status);
                                            cb(null, results);
                                        });
                                    }
                                    that._store(cache, params.id, addOps[propKey] ? params : results, () => {
                                        resolve(results, status);
                                        cb(null, results, status);
                                    });
                                });
                            });
                        });
                    };
                } else {
                    return original;
                }
            }
        });
    }

    /**
     * Looks up whether this is a payload for a series index and replaced the index names if so. Will also create any
     * missing indices before request.
     * @param {object} payload  The options object passed on to ElasticSearch
     * @private
     */
    async _processIndex(payload) {
        // Deal with bulk requests
        if (!payload.index && Array.isArray(payload.body)) {
            return this._processBulk(payload);
        }
        // Ignore non series indices
        if (this._series[payload.index]) {
            payload.index = await this._createIndex(payload.index, payload.body);
        }
    }

    /**
     * Handles bulk requests when lookg for series indices.
     * @param {object} payload
     * @private
     */
    async _processBulk(payload) {
        for (let prop in payload.body) {
            let entry = payload.body[prop];
            let op = entry.index || entry.update || entry.delete;
            if (!op || !this._series[op._index]) {
                continue;
            }
            op._index = await this._createIndex(op._index, entry);
        }
    }

    /**
     * Will return the series index and create it if necessary.
     * @todo try to make this smarter so we don't generate a date object on every insert
     * @param {string} index    The index prefix without date (e.g. logstash)
     * @param {object} entry
     * @private
     */
    async _createIndex(index, entry) {
        let series = this._series[index];
        if (!series) {
            this._log.warn('%s: Trying to get dynamic index name for non-series index "%s"', this._name, index);
            return index;
        }
        let date = Database._getDateFromEntry(entry);
        let day = date.getDate();
        day = day > 9 ? day : '0' + day;
        let month = date.getMonth() + 1;
        month = month.length === 2 ? month : '0' + month;
        let year = date.getFullYear();
        let seriesIndex = `${index}-${year}.${month}.${day}`;
        if (seriesIndex !== series.lastIndex) {
            series.lastIndex = seriesIndex;
            try {
                await this.createMapping(seriesIndex, series.schema);
            } catch (err) {
                this._log.error('%s: There was an error trying to create the series mapping for index', this._name, seriesIndex);
            }
        }
        return seriesIndex;
    }

    /**
     * Searches a given object for a number of date properties and uses that to createa a date object. Supports using
     * timestamp, standard time strings and date objects. If no date is found this method will return the current date
     * instead.
     * @param {object} [entry]
     * @returns {Date}
     * @private
     */
    static _getDateFromEntry(entry) {
        if (!entry) {
            return new Date();
        }
        for (let field of ['timestamp', '@timestamp', 'time', 'date']) {
            let value = entry[field];
            if (value) {
                if (value instanceof Date) {
                    return value;
                }
                // Assuming timestamp should not be in the 70's
                if (!isNaN(value) && value > 100000000) {
                    // not millisecond precision
                    if (value < 100000000000) {
                        value *= 1000;
                    }
                    return new Date(value);
                }
                // Date Strings have a minimum length
                if (value instanceof String && value.length > 18) {
                    let response = new Date(value);
                    // Only valid dates are finite
                    if (isFinite(response)) {
                        return response;
                    }
                }
            }
        }
        return new Date();
    }

    /**
     * Returns true of the database is ready to be used.
     * @returns {boolean}
     */
    get ready() {
        return this._ready;
    }

    /**
     * Returns the current statistics for cache hits and misses.
     * @returns {CacheStats|null}
     */
    get stats() {
        return this._stats.snapshot;
    }

    /**
     * Creates the mapping and index if they don't already exist.
     * @param index
     * @param schema
     */
    async createMapping(index, schema) {
        if (schema.series) {
            this._series[index] = {
                retain: moment.duration(...schema.series.retain),
                schema: schema,
                lastIndex: false
            };
            delete schema.series;
            return index;
        }
        try {
            let exists = await this._client.indices.exists({index});
            if (!exists) {
                this._log.info('%s: Creating new index "%s"', this._name, index);
                return this._client.indices.create({index, body: schema});
            }
        } catch (err) {
            this._log.error('%s: There was an error when checking whether an index already exists:', this._name, index);
        }
        return index;
    }

    async _readMappingsFromDisk() {
        try {
            await this._client.cluster.health({
                waitForStatus: 'yellow',
                waitForEvents: 'normal'
            });

            // Read all mappings either from config or from file
            let mappings = this._opts.indices;
            if (typeof mappings === 'string') {
                let dir = path.isAbsolute(mappings) ? mappings : path.join(cwd, mappings);
                mappings = {};
                if (fs.existsSync(dir)) {
                    let files = fs.readdirSync(dir);
                    for (let file of files) {
                        let fullPath = path.join(dir, file);
                        if (fs.statSync(fullPath).isFile()) {
                            let basename = path.basename(file, path.extname(file));
                            mappings[basename] = require(fullPath);
                        }
                    }
                }
            }
            if (!mappings || !Object.keys(mappings).length) {
                return this.emit('ready');
            }

            // Apply default mappings from global config and create tasks to run them in parallel
            let defaults = {
                mappings: this._opts.defaultMappings,
                settings: this._opts.defaultSettings
            };
            let tasks = [];
            for (let index in mappings) {
                let indexConfig = Object.assign({}, defaults, mappings[index]);
                tasks.push(this.createMapping(index, indexConfig));
            }

            // Execute the queued up tasks
            await Promise.all(tasks);
            this.emit('ready');
        } catch (err) {
            this._log.error('%s: There was an error setting the mapping for ElasticSearch\n%s', this._name, err)
        }
    }

    /**
     * Retrieve data from cache using the given key
     * @param {string} key  The key used to lookup the data in cache
     * @param {function} cb The callback function to call when completed
     * @returns {*}
     * @private
     */
    _fetch(key, id, cb) {
        if (!key) {
            return cb();
        }
        this._cache.fetch(key, id, (err, result) => {
            result !== undefined ? this._stats.hit = key : this._stats.miss = key;
            cb(err, result);
        });
    }

    /**
     * Will store the results of a request in the cache implementation
     * @param {string} key  The key under which to store the data
     * @param {object} data The response form the database
     * @param {function} cb The callback function to call when completed
     * @returns {*}
     * @private
     */
    _store(key, id,  data, cb) {
        if (!key) {
            return cb(null, data);
        }
        if (data.id) {
            // convert to response format
            data = {
                _index: data.index,
                _type: data.type,
                _id: data.id,
                _source: data.body
            }
        }
        this._cache.store(key, id, data, cb);
    }

    /**
     * Removes an entry from cache.
     * @param {string} key  The key used to lookup teh data
     * @param {function} cb The function to call when the operation completed
     * @returns {*}
     * @private
     */
    _remove(key, id, cb) {
        if (!key) {
            return cb();
        }
        this._cache.remove(key, id, cb);
    }

    clearCache() {
        this._cache.clear && this._cache.clear();
        return this;
    }
}

module.exports = Database;
