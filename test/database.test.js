/* globals describe, it, after, afterEach, before, beforeEach */
const expect = require('chai').expect;
const Logger = require('cheevr-logging');
const nock = require('nock');


process.on('unhandledRejection', function (err) {
    throw err;
});

const Database = require('../database');

describe('Database', () => {
    Logger.elasticsearch = {
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {}
    };

    function getSeries(index) {
        let date = new Date();
        let day = date.getDate();
        day = day > 9 ? day : '0' + day;
        let month = date.getMonth() + 1;
        month = month.length == 2 ? month : '0' + month;
        let year = date.getFullYear();
        return `${index}-${year}.${month}.${day}`;
    }

    function getInstance(config = {}, done = config) {
        nock('http://localhost:9200', {"encodedQueryParams":true})
            .get('/_cluster/health')
            .query({"wait_for_status":"yellow","wait_for_events":"normal"})
            .reply(200, () => {
                typeof done =='function' && process.nextTick(done);
                return require(__dirname + '/responses/cluster.health.json');
            });

        return new Database(Object.assign({
            logger: 'elasticsearch',
            client: {
                host: 'localhost:9200'
            },
            cache: {
                type: 'memory'
            }
        }, config)).clearCache();
    }

    describe('Constructor', () => {
        it('should create an instance with the given config', done => {
            let instance = getInstance({}, done);
            expect(instance.client).to.be.an('object');
            expect(instance.client).itself.to.respondTo('search');
        });

        it('should set the logger to winston logging', done => {
            Logger.TestLogger = {
                error: () => {},
                warn: () => {},
                info: () => {},
                debug: () => {},
                trace: () => {done()}
            };

            let instance = getInstance({
                logger: 'TestLogger'
            }, () => {
                delete Logger.TestLogger;
            });
            expect(instance._opts.client.log).to.be.an('object');
            instance._log.trace('calling done');
        });
    });

    describe('_processBulk', () => {
        it('should create a series index if it doesn\'t exist yet and replace all bulk entry indices', done => {
            let instance = getInstance({
                indices: {
                    bulkSeries: {
                        series: {
                            retain: [ 30, 'd' ],
                        },
                        mappings: {
                            testType: {
                                properties: {
                                    someProp: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            });

            nock('http://localhost:9200')
                .head('/' + getSeries('bulkSeries'))
                .reply(200);

            nock('http://localhost:9200')
                .post('/_bulk', body => {
                    expect(body).to.equal(
                        '{"index":{"_index":"' + getSeries('bulkSeries') + '","type":"testType"}}' +
                        '{"someProp":"indexValue"}' +
                        '{"update":{"_index":"' + getSeries('bulkSeries') + '","type":"testType"}}' +
                        '{"someProp":"updateValue"}' +
                        '{"delete":{"_index":"' + getSeries('bulkSeries') + '","type":"testType"}}' +
                        '{"someProp":"deleteValue"}');
                    return true;
                })
                .reply(200, () => done());

            instance.on('ready', () => {
                instance.client.bulk({
                    body: [
                        { index: { _index: 'bulkSeries', type: 'testType' }},
                        { someProp: 'indexValue' },
                        { update: { _index: 'bulkSeries', type: 'testType' }},
                        { someProp: 'updateValue' },
                        { delete: { _index: 'bulkSeries', type: 'testType' }},
                        { someProp: 'deleteValue' }

                    ]
                });
            });
        });
    });

    describe('_getDateFromEntry', () => {
        const now = new Date();

        it('should create a default date if the entry is null', () => {
            let result = Database._getDateFromEntry(null);
            expect(result.getTime()).to.be.at.least(now.getTime());
        });

        it('should use existing date objects', () => {
            let result = Database._getDateFromEntry({ date: now });
            expect(result.getTime()).to.be.at.least(now.getTime());
        });

        it('should convert timestamp to date objects', () => {
            let timestamp = 1300000000000;
            let result = Database._getDateFromEntry({ timestamp });
            expect(result.getTime()).to.equal(timestamp);
        });

        it('should ignore timestamps that are too small', () => {
            let timestamp = 13000000;
            let result = Database._getDateFromEntry({ timestamp });
            expect(result.getTime()).to.be.at.least(now.getTime());
        });

        it('should automatically detect ms vs s precision in timestamps', () => {
            let timestamp = 130000000;
            let result = Database._getDateFromEntry({ timestamp });
            expect(result.getTime()).to.be.at.least(timestamp * 1000);
        });

        it('should convert valid strings to date objects', () => {
            let timestamp = '2011-03-13T07:06:40.000';
            let result = Database._getDateFromEntry({ '@timestamp': timestamp });
            expect(result.getTime()).to.be.at.least(1300000000000);
        });

        it('should ignore invalid strings and return the current date', () => {

        });
    });

    describe('_createIndex', () => {
        it('should create a series index', done => {
            let instance = getInstance({
                indices: {
                    test: {
                        series: {
                            retain: [ 30, 'd' ],
                        },
                        mappings: {
                            testType: {
                                properties: {
                                    someProp: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            });

            nock('http://localhost:9200')
                .head('/' + getSeries('test'))
                .reply(200);

            instance.on('ready', async () => {
                let index = await instance._createIndex('test', null);
                expect(index).to.equal(getSeries('test'));
                done();
            });
        });

        it('should return the series index if it already exists and not create the index', done => {
            let instance = getInstance({
                indices: {
                    test: {
                        series: {
                            retain: [ 30, 'd' ],
                        },
                        mappings: {
                            testType: {
                                properties: {
                                    someProp: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            });

            instance.on('ready', async () => {
                instance._series.test.lastIndex = getSeries('test');

                let index = await instance._createIndex('test', null);
                expect(index).to.equal(getSeries('test'));
                done();
            });
        });
    });

    describe('_createMapping', () => {
        it('should create a normal index by default', done => {
            let mapping = {
                mappings: {
                    testType: {
                        properties: {
                            testProp: { type: 'string' }
                        }
                    }
                }
            };

            nock('http://localhost:9200')
                .head('/testIndex')
                .reply(404);

            nock('http://localhost:9200')
                .put('/testIndex')
                .reply(204, (uri, body) => {
                    expect(body).to.deep.equal(mapping);
                    done();
                });

            getInstance({
                indices: {
                    testIndex: mapping
                }
            });
        });

        it('should create a series index', done => {
            let mapping = {
                series: {
                    retain: [ 30, 'd' ],
                },
                mappings: {
                    testType: {
                        properties: {
                            testProp: { type: 'string' }
                        }
                    }
                }
            };

            // Create Index requests

            nock('http://localhost:9200')
                .head('/' + getSeries('seriesIndex'))
                .reply(404);

            nock('http://localhost:9200')
                .put('/' + getSeries('seriesIndex'), { mappings: mapping.mappings })
                .reply(200);

            let instance = getInstance({
                indices: {
                    seriesIndex: mapping
                }
            });

            // Index document request

            nock('http://localhost:9200')
                .post('/' + getSeries('seriesIndex') + '/testType', { testProp: 'this is a test' })
                .reply(200, () => done());

            instance.on('ready', () => {
                instance.client.index({
                    index: 'seriesIndex',
                    type: 'testType',
                    body: {
                        testProp: 'this is a test'
                    }
                });
            });
        });
    });

    describe('store', () => {
        it('should store a value in the database using callbacks', done => {

            nock('http://localhost:9200', {"encodedQueryParams":true})
                .post('/TestIndex/TestType/1', {"prop":"This is a test"})
                .replyWithFile(201, __dirname + '/responses/put.json');

            let instance = getInstance({}, () => {
                instance.client.index({
                    index: 'TestIndex',
                    type: 'TestType',
                    id: 1,
                    body: {
                        prop: 'This is a test'
                    }
                }, err => {
                    expect(err).to.be.not.ok;
                    done();
                });
            });
        });

        it.skip('should store a value in the database using promises', done => {
            let response = nock('http://localhost:9200', {"encodedQueryParams":true})
                .post('/TestIndex/TestType/1', {"prop":"This is a test"})
                .replyWithFile(201, __dirname + '/responses/put.json');

            let instance = getInstance({}, async () => {
                await instance.client.index({
                    index: 'TestIndex',
                    type: 'TestType',
                    id: 1,
                    body: {
                        prop: 'This is a test'
                    }
                });
                response.done();
                done();
            });
        });
    });

    describe('query', () => {
        it('should fetch a value from the database using callbacks', done => {
            nock('http://localhost:9200', { 'encodedQueryParams': true })
                .get('/TestIndex/TestType/2')
                .reply(200, {
                    _index: 'TestIndex',
                    _type: 'TestType',
                    _id: 2,
                    _version: 1,
                    found: true,
                    _source:{
                        prop: "This is a test"
                    }
                });

            let instance = getInstance(() => {
                instance.client.get({
                    index: 'TestIndex',
                    type: 'TestType',
                    id: 2
                }, (err, result) => {
                    expect(err).to.be.not.ok;
                    expect(result._source).to.deep.equal({
                        prop: 'This is a test'
                    });
                    done();
                });
            });
        });

        it.skip('should fetch a value from the database using promises', done => {
            nock('http://localhost:9200', {"encodedQueryParams":true})
                .get('/TestIndex/TestType/3')
                .reply(200, {
                    _index: 'TestIndex',
                    _type: 'TestType',
                    _id: 3,
                    _version: 1,
                    found: true,
                    _source:{
                        prop: "This is a test"
                    }
                });

            let instance = getInstance({}, async () => {
                let result = await instance.client.get({
                    index: 'TestIndex',
                    type: 'TestType',
                    id: 3
                });
                expect(result._source).to.deep.equal({
                    prop: 'This is a test'
                });
                done();
            });
        });
    });

    describe.skip('Cache', () => {
        it('should store and fetch a value from cache', done => {
            nock('http://localhost:9200', {"encodedQueryParams":true})
                .post('/TestIndex/TestType/5', {"prop":"This is a test"})
                .replyWithFile(201, __dirname + '/responses/put.json');

            let instance = getInstance({}, () => {
                instance.client.index({
                    index: 'TestIndex',
                    type: 'TestType',
                    id: 5,
                    cache: true,
                    body: {
                        prop: 'This is a test'
                    }
                }, err => {
                    expect(err).to.be.not.ok;
                    instance.client.get({
                        index: 'TestIndex',
                        type: 'TestType',
                        cache: true,
                        id: 5
                    }, (err, response) => {
                        expect(err).to.be.not.ok;
                        expect(response._source).to.deep.equal({
                            prop: 'This is a test'
                        });
                        done();
                    });
                });
            });
        });

        it('should remove an item from cache after a given ttl', done => {
            nock('http://localhost:9200', {"encodedQueryParams":true})
                .post('/TestIndex/TestType/6', {"prop":"This is a test"})
                .replyWithFile(201, __dirname + '/responses/put.json');

            let mock = nock('http://localhost:9200', {"encodedQueryParams":true})
                .get('/TestIndex/TestType/6')
                .reply(200, {
                    _index: 'TestIndex',
                    _type: 'TestType',
                    _id: 6,
                    _version: 1,
                    found: true,
                    _source:{
                        prop: "This is a test"
                    }
                });

            let instance = getInstance({
                cache: {
                    ttl: 100
                }
            }, () => {
                instance.client.index({
                    index: 'TestIndex',
                    type: 'TestType',
                    id: 6,
                    cache: true,
                    body: {
                        prop: 'This is a test'
                    }
                }, err => {
                    expect(err).to.be.not.ok;
                    setTimeout(() => {
                        instance.client.get({
                            index: 'TestIndex',
                            type: 'TestType',
                            id: 6
                        }, (err, response) => {
                            expect(err).to.be.not.ok;
                            expect(response._source).to.deep.equal({
                                prop: 'This is a test'
                            });
                            mock.done();
                            done();
                        });
                    }, 150);
                });
            });
        });
    });
});
