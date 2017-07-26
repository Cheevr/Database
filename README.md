# Cheevr-Database
[![npm version](https://badge.fury.io/js/%40cheevr%2Fdatabase.svg)](https://badge.fury.io/js/%40cheevr%2Fdatabase)
[![Build Status](https://travis-ci.org/Cheevr/Database.svg?branch=master)](https://travis-ci.org/Cheevr/Database)
[![Coverage Status](https://coveralls.io/repos/Cheevr/Database/badge.svg?branch=master&service=github)](https://coveralls.io/github/Cheevr/Database?branch=master)
[![Dependency Status](https://david-dm.org/Cheevr/Database.svg)](https://david-dm.org/Cheevr/Database)

# About

This module is designed to make interaction with elasticsearch simpler by offering an automatic mapping
and regular (e.g. daily) rotation functions. In addition it integrates with a logging and caching system
as well as it records statistics for metrics collection. The entire system is configurable via a tiered
config file system that you can read more about at [@cheevr/config](https://github.com/cheevr/config).


# Installation

```Bash
npm i @cheevr/database
```


# Example

To use the module you first need to create a configuration file that specifies how to reference the
elasticsearch cluster. Create a file in your project directory under **config/development.js**:

```JavaScript
module.exports = {
    myDatabase: {
        // can be omitted since this is the default setting
        client: {
            host: 'localhost:9200'
        }
    }
}
```

With this configuration file in place you can now access the database ready to use from within your project:

```JavaScript
const Database = require('@cheevr/database');
const mydb = Database.factory('myDatabase');

mydb.get({
    // use your standard elasticsearch.js client options here
}, (err, result) => {});
```

With this you will have a reference to the
[elasticsearch.js](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html)
client and can run all operations on it that you could usually run if you had used the client directly.

# API

The APi itself is very limited since all configuration is done via the above describe config files, which we
will go into deeper further down below.

## Database.factory({string} \[name\], {object} \[config\])

This method will return database instances based on the given name, and configuration. Both parameters are
optional. If no name is given, the default database reference will be used (see configuration for details on
how to specify a default database). Any configuration that is passed in will override any previously configured
default or static file configurations set.

## Database.list()

Returns a map with configured database names as keys and the database root object as value.

## Database.reset()

Makes the database forget all existing database instances and reinitalizes the system.

## Data.middleware()

Return a middleware helper for express that will make database references available on the req object.
Handlers further down the process chain can access the configured databases through the db property,
with db itself being the default database and other named instances being properties:

```JavaScript
const expres = require('express');
const database = require('@cheevr/database');

const app = express();
app.use(database.middleware());

app.get('/test', (req, res) => {
    req.db.get({}, (err, result) => {});    // The default database
    req.db.mydb.get({}, (err, result) => {});   The database instance named mydb, configured via config files
});
```

# Configuration



# Future Features for Consideration

* Support for multiple database implementations both SQL and NoSQL, if those will not be implemented
* simple CRUD API that works across all databases
