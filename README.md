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

## Caching calls

The module expands the [default options on elasticsearch.js](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-conventions.html)
requests with a _cache_ property that allows the module to automatically cache calls and hopefully improve
performance like that. The cache property supports either a boolean value or a string. A boolean value will
use the index, type and built in id for key look ups, while the string options lets you specify which key
to use for caching operations:

```JavaScript
const Database = require('@cheevr/database');
const mydb = Database.factory('myDatabase');

mydb.index({
    index: 'myIndex',
    type: 'myType',
    cache: 'myKey'
}, (err, result) => {});

// subsequent calls can be executed with the cache property:
mydb.get({
    index: 'myIndex',
    type: 'myType',
    id: '1',
    cache: 'myKey'         // Will return the value from memory by default if it was cached
}, (err, result) => {});
```

Note that you should change the default in memory cache to a distributed cache service such as Redis if you
planning on running multiple instance of the same server.


# Configuration

The meat of this module's functionality is specified using the configuration file. We use
[@cheevr/config](https://github.com/cheevr/config) for all out configuration. The database configuration
supports multiple named instance, so the configuration is nested under keys that can later be referenced
in code. Check the file in the example to see what that would look like.

## database.<name>.logger {string = 'elasticsearch'}

This module makes use of [@cheevr/logging](https://github.com/cheevr/logging) for it's logging configuration.
This property specifies which logging instance to use for all database logging output. If you want to pipe it
to a different logger instance you can use this property. Alternatively you can change settings for the
_elasticsearch_ logger instance to your liking (see the logging module documentation for details).

## database.<name>.cache {string = 'databaseDefault'}

This module allows to automatically cache requests made to elasticsearch using various implementations (e.g.
redis). The default configuration will store calls in memory for up to 1 hour. For more details on how to
configure the caching properties check out [@cheevr/cache](https://github.com/cheevr/cache). This module
defines _databaseDefault_ as an in memory instance.

## database.<name>.client {object = { host: 'localhost:9200', log: 'info' }}

This is the elasticsearch client configuration passed onto elasticsearch.js. To see all the options that are
supported check out the
[official documentation](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html#config-options).

## database.<name>.stats {object = { interval: \[ 1, 'm' \], threshold: 10 }

This allows to configure how statistics on cache hits will be collected. The default setting will collect
averages over the last minute (_interval_ setting). The statistics include per key analytics, but those will
only be reported if at least 10 calls to that particular key have been made.

Since it is possible that you will have many unique keys and don't want them to clutter your memory, you
disable this feature by setting the threshold to something the evaluates to false.

## database.<name>.indices {string = 'config/schemas'}

The module support automatically creating indices with your specific mapping before an entry is created.
This sets a path in which to look for .json/.js files, relative to the working directory that have index
mapping data.

Mapping files themselves include the _mappings_ and _settings_ sections of your standard elasticsearch
mapping configuration while the filename represents the index name in which a particular mapping is created.

Example:
```JSON
// config/schemas/myIndex.json
{
    "mappings": {
        "myType": {
            "properties": {
                "aProperty": {
                    "type": "keyword"
                }
            }
        }
    }
}
```

This will create an index of name _myIndex_ with a type named _myType_ and a property on that type named
_aProperty_. The index or type will be created at server startup if it doesn't exist yet.

This module add a special property to the mapping configuration that allows to specify an index as being
part of a daily rotated series. With this configuration the module will automatically detect when an index
needs to have a day suffix and as such it will only be created when data is written on a day when no data
has been written yet (as opposed to on server launch). The configuration looks like this:

```JSON
// config/schemas/mySeries.json
{
    "series": {
        "retain": [ 30, 'd' ]
    },
    "mappings": {}
}
```

This would tell the database that the series should be retained for 30 days and that all queries and searches
with index _mySeries_ will automatically be converted to e.g. _mySeries-2017.09.30_. The module does not yet
support deleting outdated indices, but expect it be implemented shortly.

## database.<name>.indices { object }

Alternatively you can specify indices and their respective mappings directly in the config file instead of
using separate schema files. Map index names as direct properties on the _indices_ property and specify your
mapping nested there under each key.


# Future Features for Consideration

* Support for multiple database implementations both SQL and NoSQL, if those will not be implemented
* Simple CRUD API that works across all databases
* Automatically delete outdated series indices
* Support more granular series configuration than just _daily_
