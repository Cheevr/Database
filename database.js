const _ = require('lodash');
const async = require('async');
const config = require('cheevr-config');
const elasticsearch = require('elasticsearch');
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const Logger = require('cheevr-logging');
const moment = require('moment');
const path = require('path');
const Stats = require('./stats');


const cwd = process.cwd();
config.addDefaultConfig(path.join(__dirname, 'config'));

// TODO series retain option needs to be respected => indices older than that need to be deleted
class Database extends EventEmitter {
    /**
     *
     * @param {object} opts The ElasticSearch options object
     */
    constructor(opts) {
        super();
        this._opts = _.cloneDeep(opts);
        this._ready = false;
        this._series = {};
        this._setLogging();
        this._client = new elasticsearch.Client(this._opts.client);
        this._stats = new Stats(this._opts.stats);
        this._cache = new (require('./cache/' + this._opts.cache.type))(this._stats);
        this.on('ready', () => this._ready = true);
        // allow connection to be established
        setTimeout(this._createMappings.bind(this), 100);
    }

    _setLogging() {
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
            console.log('The configured database logger is missing:', this._opts.logger);
            this._log = {
                error: console.error,
                warn: console.warn,
                info: console.log,
                debug: console.log
            }
        }
    }

    /**
     * Returns an ElasticSearch client that is wrapped by a caching object.
     * @returns {Proxy.<elasticsearch.Client>}
     */
    get client() {
        let that = this;
        let delOps = {
            delete: true,
            deleteByQuery: true,
            deleteScript: true,
            deleteTemplate: true
        };
        let addOps = {
            create: true,
            index: true,
            update: true,
            updateByQuery: true
        };
        let createIndexOp = {
            bulk: true,
            create: true,
            index: true,
            update: true,
            updateByQuery: true
        };
        let queryOps = {
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

        return new Proxy(this._client, {
            get(target, propKey) {
                let original = target[propKey];
                if (target[propKey] && original.length == 2) {
                    return (params, cb = err => err && that._log.error(err)) => {
                        let cache = queryOps[propKey] && params.cache;
                        delete params.cache;
                        that._stats.request = cache ? cache : params.index + ':' + params.type + ':' + params.key;
                        that._fetch(cache, (err, result) => {
                            if (err || result) {
                                return cb(err, result);
                            }
                            that._processIndex(params, !createIndexOp[propKey], err => {
                                if (err) {
                                    return cb(err);
                                }
                                original.call(target, params, (err, results) => {
                                    if (err) {
                                        return cb(err, results);
                                    }
                                    if (delOps[propKey]) {
                                        return that._remove(cache, cb);
                                    }
                                    that._store(cache, addOps[propKey] ? params.body : results, cb);
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
     * @param {boolean} skip    Whether to just skip this step
     * @param {function} cb
     * @private
     */
    _processIndex(payload, skip, cb) {
        if (skip) {
            return cb();
        }
        // Deal with bulk requests
        if (!payload.index && Array.isArray(payload.body)) {
            return this._processBulk(payload, cb);
        }
        // Ignore non series indices
        if (!this._series[payload.index]) {
            return cb();
        }
        this._createIndex(payload.index, (err, seriesIndex) => {
            payload.index = seriesIndex || payload.index;
            cb(err);
        });
    }

    /**
     * Handles bulk requests when lookg for series indices.
     * @param {object} payload
     * @param {function} cb
     * @private
     */
    _processBulk(payload, cb) {
        async.eachSeries(payload.body, (entry, cb) => {
            if (!entry.index || !this._series[entry.index._index]) {
                return cb();
            }
            this._createIndex(entry.index._index, (err, seriesIndex) => {
                entry.index._index = seriesIndex;
                cb(err);
            });
        }, cb);
    }

    /**
     * Will return the series index and create it if necessary.
     * @todo try to make this smarter so we don't generate a date object on every insert
     * @param {string} index    The index prefix without date (e.g. logstash)
     * @param {function} cb
     * @private
     */
    _createIndex(index, cb) {
        let series = this._series[index];
        let date = new Date();
        let day = date.getDate();
        day = day > 9 ? day : '0' + day;
        let month = date.getMonth() + 1;
        month = month.length == 2 ? month : '0' + month;
        let year = date.getFullYear();
        let seriesIndex = `${index}-${year}.${month}.${day}`;
        if (seriesIndex != series.lastIndex) {
            series.lastIndex = seriesIndex;
            return this.createMapping(seriesIndex, series.schema, err => cb(err, seriesIndex));
        }
        cb(null, seriesIndex);
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
     * @param cb
     */
    createMapping(index, schema, cb) {
        if (schema.series) {
            this._series[index] = {
                retain: moment.duration(...schema.series.retain),
                schema: schema,
                lastIndex: false
            };
            delete schema.series;
            return cb();
        }
        this._client.indices.exists({index}, (err, exists) => {
            if (exists || err) {
                return cb(err);
            }
            err || this._log.info('Creating new index', index);
            this._client.indices.create({index, body: schema}, cb);
        });
    }

    _createMappings() {
        this._client.cluster.health({
            waitForStatus: 'yellow',
            waitForEvents: 'normal'
        }, err => {
            if (err) {
                return this._log.error('Unable to connect to ElasticSearch cluster', err);
            }

            // Read all mappings either from config or from file
            let mappings = this._opts.indices;
            if (typeof mappings == 'string') {
                let dir = path.isAbsolute(mappings) ? mappings : path.join(cwd, mappings);
                mappings = {};
                if (fs.existsSync(dir)) {
                    let files = fs.readdirSync(dir);
                    for (let file of files) {
                        let basename = path.basename(file, path.extname(file));
                        mappings[basename] = require(path.join(dir, file));
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
                tasks.push(cb => this.createMapping(index, indexConfig, cb));
            }

            // Execute the queued up tasks
            async.parallel(tasks, err => {
                if (err) {
                    return this._log.error('There was an error setting the mapping for ElasticSearch', err);
                }
                this.emit('ready');
            });
        });
    }

    _fetch(cache, cb) {
        if (!cache) {
            return cb();
        }
        this._cache.fetch(cache, cb);
    }

    _store(cache, data, cb) {
        if (!cache) {
            return cb(null, data);
        }
        this._cache.store(cache, data, cb);
    }

    _remove(cache, cb) {
        if (!cache) {
            return cb();
        }
        this._cache.remove(cache, data, cb);
    }
}

module.exports = Database;

