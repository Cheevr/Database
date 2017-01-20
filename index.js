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

// TODO series retain option needs to be respected => indices older than that need to be deleted
class Database extends EventEmitter {
    /**
     *
     * @param {object} opts The ElasticSearch options object
     * @param {string} dir  The file or directory with the mappings for all the indices
     */
    constructor(opts = config.elasticsearch, dir = config.paths.schemas) {
        super();
        if (dir) {
            this._dir = path.isAbsolute(dir) ? dir : path.join(cwd, dir);
        }
        this._opts = opts;
        this._ready = false;
        this._series = {};
        this._setLogging();
        this._client = new elasticsearch.Client(this._opts.client);
        this._stats = new Stats();
        this._cache = new (require('./cache/' + config.cache.type))(this._stats);
        // allow connection to be established
        setTimeout(this._createMappings.bind(this), 100);
    }

    _setLogging() {
        let log = Logger[this._opts.logger];
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
        }
    }

    middleware() {
        this.once('ready', () => {
            async.forEachOfSeries(config.elasticsearch.mappings, (value, key, cb) => {
                this.createMapping(key, value, cb)
            });
        });
        return (req, res, next) => {
            req.es = this.client;
            req.es.ready = this.ready;
            next();
        }
    }

    /**
     * Returns an ElasticSearch client that is wrapped by a caching object.
     * @returns {Proxy.<elasticsearch.Client>}
     */
    get client() {
        const that = this;
        return new Proxy(this._client, {
            get(target, propKey) {
                let original = target[propKey];
                if (target[propKey]) {
                    let delData = ['delete', 'deleteByQuery', 'update', 'updateByQuery'].reduce((status, entry) => {
                        return status || entry == propKey;
                    }, false);
                    let addData = ['create', 'index', 'update', 'updateByQuery'].reduce((status, entry) => {
                        return status || entry == propKey;
                    }, false);
                    let createIndex = addData || ['bulk'].reduce((status, entry) => {
                        return status || entry == propKey;
                    }, false);

                    return (params, cb) => {
                        let cache = params.cache;
                        delete params.cache;
                        that._stats.request = cache ? cache : params.index + ':' + params.type + ':' + params.key;
                        that._fetch(cache, (err, result) => {
                            if (err || result) {
                                return cb(err, result);
                            }
                            that._processIndex(params, !createIndex, err => {
                                if (err) {
                                    return cb(err);
                                }
                                original.call(target, params, (err, results) => {
                                    if (err) {
                                        return cb(err, results);
                                    }
                                    if (delData) {
                                        return that._remove(cache, cb);
                                    }
                                    that._store(cache, addData ? params.body : results, cb);
                                });
                            });
                        });
                    };
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
            if (!entry.index || !this._series[entry.index]) {
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
            return;
        }
        this._client.indices.exists({index}, (err, exists) => {
            if (exists || err) {
                return cb(err);
            }
            err || console.log('Creating new index', index);
            this._client.indices.create({index, body: schema}, cb);
        });
    }

    _createMappings() {
        this._client.cluster.health({
            waitForStatus: 'yellow',
            waitForEvents: 'normal'
        }, err => {
            if (err) {
                return console.log('Unable to connect to ElasticSearch cluster', err);
            }
            if (!fs.existsSync(this._dir)) {
                this._ready = true;
                return this.emit('ready');
            }
            let files;
            let tasks = [];
            if (fs.statSync(this._dir).isDirectory()) {
                files = fs.readdirSync(this._dir);
                for (let file of files) {
                    let ext = path.extname(file);
                    let index = this._opts.index || path.basename(file, ext);
                    let schema = require(path.join(this._dir, file));
                    tasks.push(cb => this.createMapping(index, schema, cb));
                }
            } else {
                let ext = path.extname(this._dir);
                let index = this._opts.index || path.basename(this._dir, ext);
                let schema = require(this._dir);
                tasks.push(cb => this.createMapping(index, schema, cb));
            }
            async.parallel(tasks, err => {
                if (err) {
                    return console.log('There was an error setting the mapping for ElasticSearch', err);
                }
                this._ready = true;
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
