/* globals describe, it, after, afterEach, before, beforeEach */
const config = require('cheevr-config');
const expect = require('chai').expect;
const Logger = require('cheevr-logging');
const nock = require('nock');


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

    function getInstance(config = {}, done) {
        nock('http://localhost:9200')
            .get('/_cluster/health')
            .query(true)
            .reply(200, () => {
                done && process.nextTick(done);
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
        }, config));
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
                trace: () => {}
            };

            let instance = getInstance({
                logger: 'TestLogger'
            }, () => {
                delete Logger.TestLogger;
                done();
            });
            expect(instance._opts.client.log).to.be.an('object');
        });
    });

    describe('_processBulk', () => {
        it('should create a series index if it doesn\'t exist yet and replace all bulk entry indices', done => {
            done();
        });
    });

    describe('_createIndex', () => {
        it('should create a series index', done => {
            done();
        });

        it('should return the series index if it already exists and not create the index', done => {
            done();
        });
    });

    describe('createMapping', () => {
        it('should create a standard index if doesn\'t exist yet', done => {
            done();
        });

        it('shouldn\'t create the index if it already exists', done => {
            done();
        });

        it('should create a series entry for a series index', done => {
            done();
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

            let instance = getInstance({
                indices: {
                    seriesIndex: mapping
                }
            });

            // Create Index requests

            nock('http://localhost:9200')
                .head('/' + getSeries('seriesIndex'))
                .reply(404);

            nock('http://localhost:9200')
                .put('/' + getSeries('seriesIndex'), { mappings: mapping.mappings })
                .reply(200);

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

        it('should update index/update/bulk requests with the series index', done => {
            done();
        });
    });
});
