/* globals describe, it, after, afterEach, before, beforeEach */
const config = require('cheevr-config');
const expect = require('chai').expect;
const mockEs = require('./ealsticsearch.mock');
const nock = require('nock');
const path = require('path');

const db = require('..');



describe('Database', () => {
    config.addDefaultConfig(path.join(__dirname, './configs'));

    afterEach(() => {
        db.reset();
    });

    describe('Factory', () => {
        it('should not create any instances on its own', () => {
            expect(Object.keys(db._instances).length).to.equal(0);
        });

        it('should prevent creating instances with internal names', () => {
            expect(db.factory.bind(db, '_reserved')).to.throw();
        });

        it('should create an instance with the default configuration', done => {
            let mock = mockEs('http://localhost:9200');
            let inst = db.factory('notConfigured');
            expect(inst).itself.to.respondTo('search');
            expect(inst.transport._config.host).to.equal('localhost:9200');
            setTimeout(done, 100);
            mock.clean();
        });

        it('should return the same instance for the same name', done => {
            let mock = mockEs('http://localhost:9200');
            let a = db.factory('unique');
            let b = db.factory('unique');
            expect(a).to.be.equal(b);
            setTimeout(done, 100);
            mock.clean();
        });

        it('should use the custom configuration from file', done => {
            let mock = mockEs('http://somehost:9200');
            nock.recorder.rec();
            let inst = db.factory('custom');
            expect(inst).itself.to.respondTo('search');
            expect(inst.transport._config.host).to.equal('somehost:9200');
            setTimeout(done, 100);
            mock.clean();
        });
    });

    describe('Middleware', () => {
        it('should create one database as the default database and others as properties on the req object', done => {
            let req = {};
            let res = {};
            db.middleware()(req, res, () => {
                expect(req.db).itself.to.respondTo('search');
                expect(req.db.custom).itself.to.respondTo('search');
                done();
            });
        });

        it('should use a database as default if there is only one defined', done => {
            let req = {};
            let res = {};
            db.middleware()(req, res, () => {
                expect(req.db).to.be.equal(req.db.custom);
                expect(req.db.transport._config.host).to.equal('somehost:9200');
                done();
            });
        });
    });
});
