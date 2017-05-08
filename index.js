const _ = require('lodash');
const config = require('@cheevr/config').addDefaultConfig(__dirname, 'config');
const Database = require('./database');
const EventEmitter = require('events').EventEmitter;


class Manager extends EventEmitter {
    constructor() {
        super();
        this._instances = {};
        this._ready = 0;
    }

    /**
     * Returns the database with the given name and performs all set up operations if necessary.
     * @param {string} [name]           Get the names database instance (or return the default database if empty)
     * @param {object} [instanceConfig] Override the database configuration (or use the default/named config from files)
     *                                  If there's a config for a database with this name, the configurations will be
     *                                  merged
     */
    factory(name = '_default_', instanceConfig) {
        if (name.startsWith('_') && name != '_default_') {
            throw new Error('Invalid database name ("_" prefix is reserved for internal functions)');
        }
        if (!this[name]) {
            this.ready && this.emit('unavailable');
            this._ready--;
            this._instances[name] = new Database(_.defaultsDeep({}, instanceConfig, config.database[name]), name);
            this._instances[name].on('ready', () =>  {
                this._ready++;
                this.ready && this.emit('ready');
            });
            this[name] = this._instances[name].client;
        }
        return this[name];
    }

    /**
     * Returns a map with all the known database instances.
     * @returns {Object<String, Object>}
     */
    list() {
        let clients = {};
        for (let name in this._instances) {
            clients[name] = this._instances[name];
        }
        return clients;
    }

    /**
     * Will remove all previously created instances.
     */
    reset() {
        for (let name in this._instances) {
            this[name].close();
            delete this[name];
            delete this._instances[name];
        }
    }

    get ready() {
        return this._ready == 0;
    }

    /**
     * This middleware will initialize all database instances configured in file. The database will be accessible
     * through the req.db object, which itself will give access to the default client. Named clients are all available
     * as req.db.<name>. It is advised to not overwrite any standard elasticsearch.js properties with the same name.
     * @returns {function(ClientRequest, ServerResponse, function)} Standard express request handler function
     */
    middleware() {
        let defaultName;
        for (let name in config.database) {
            if (!defaultName || config.database[name].default) {
                defaultName = name;
            }
        }
        // database object will always be the default instance
        let db = this.factory(defaultName);
        for (let name in config.database) {
            if (config.database.hasOwnProperty(name) && name != '_default_') {
                db[name] = this.factory(name);
            }
        }
        // TODO delay next() call until all dbs are ready
        return (req, res, next) => {
            req.db = db;
            next();
        }
    }
}

module.exports = new Manager();
