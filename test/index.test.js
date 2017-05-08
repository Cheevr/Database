/* globals describe, it, after, afterEach, before, beforeEach */
const async = require('async');
const config = require('@cheevr/config');
const expect = require('chai').expect;
const nock = require('nock');
const path = require('path');


const db = require('..');

describe('index', () => {
    config.addDefaultConfig(path.join(__dirname, './configs'));

    afterEach(() => db.reset());

    describe('Factory', () => {
        it('should not create any instances on its own', () => {
            expect(Object.keys(db._instances).length).to.equal(0);
        });

        it('should prevent creating instances with internal names', () => {
            expect(db.factory.bind(db, '_reserved')).to.throw();
        });

        it('should create an instance with the default configuration', done => {
            nock('http://localhost:9200')
                .get('/_cluster/health')
                .query(true)
                .reply(200, () => {
                    process.nextTick(done);
                    return require(__dirname + '/responses/cluster.health.json');
                });
            let inst = db.factory('notConfigured');
            expect(inst).itself.to.respondTo('search');
            expect(inst.transport._config.host).to.equal('localhost:9200');
        });

        it('should return the same instance for the same name', done => {
            nock('http://localhost:9200')
                .get('/_cluster/health')
                .query(true)
                .reply(200, () => {
                    process.nextTick(done);
                    return require(__dirname + '/responses/cluster.health.json');
                });
            let a = db.factory('unique');
            let b = db.factory('unique');
            expect(a).to.equal(b);
        });

        it('should use the custom configuration from file', done => {
            nock('http://somehost:9200')
                .get('/_cluster/health')
                .query(true)
                .replyWithFile(200, __dirname + '/responses/cluster.health.json');
            nock('http://somehost:9200')
                .head('/myIndex')
                .query(true)
                .reply(200, () => process.nextTick(done));
            let inst = db.factory('custom');
            expect(inst).itself.to.respondTo('search');
            expect(inst.transport._config.host).to.equal('somehost:9200');
        });

        it('should mark the manager as ready once all instances have reported ready', done => {
            nock('http://localhost:9200')
                .get('/_cluster/health')
                .query(true)
                .times(2)
                .replyWithFile(200, __dirname + '/responses/cluster.health.json');
            db.factory('notConfigured1');
            db.factory('notConfigured2');
            db.once('ready', done)
        });

        it('should list all known instances', () => {
            nock('http://localhost:9200')
            .get('/_cluster/health')
            .query(true)
            .times(2)
            .replyWithFile(200, __dirname + '/responses/cluster.health.json');
            let inst1 = db.factory('notConfigured1');
            let inst2 = db.factory('notConfigured2');
            let list = db.list();
            expect(Object.keys(list).length).to.equal(2);
            expect(list.notConfigured1.client).to.equal(inst1);
            expect(list.notConfigured2.client).to.equal(inst2);
        });
    });

    describe('Middleware', () => {
        it('should create one database as the default database and others as properties on the req object', done => {
            nock('http://somehost:9200')
                .get('/_cluster/health')
                .query(true)
                .reply(200, () => {
                    return require(__dirname + '/responses/cluster.health.json');
                });
            nock('http://somehost:9200')
                .head('/myIndex')
                .query(true)
                .reply(200, () => process.nextTick(done));

            let req = {};
            let res = {};
            db.middleware()(req, res, () => {
                expect(req.db).itself.to.respondTo('search');
                expect(req.db.custom).itself.to.respondTo('search');
            });
        });

        it('should use a database as default if there is only one defined', done => {
            nock('http://somehost:9200')
                .get('/_cluster/health')
                .query(true)
                .reply(200, () => {
                    return require(__dirname + '/responses/cluster.health.json');
                });
            nock('http://somehost:9200')
                .head('/myIndex')
                .query(true)
                .reply(200, () => process.nextTick(done));

            let req = {};
            let res = {};
            db.middleware()(req, res, () => {
                expect(req.db).to.be.equal(req.db.custom);
                expect(req.db.transport._config.host).to.equal('somehost:9200');
            });
        });
    });
});
