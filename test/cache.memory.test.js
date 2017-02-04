/* globals describe, it, after, afterEach, before, beforeEach */
const expect = require('chai').expect;
const Memory = require('../cache/memory');


describe('Cache/Memory', () => {
    it('should store and delete entries from memory', done => {
        let cache = new Memory({ ttl: [ 1, 's' ] });
        cache.store('test','value', () => {
            cache.fetch('test', (err, data) => {
                expect(data).to.equal('value');
                cache.remove('test', err => {
                    cache.fetch('test', (err, data) => {
                        expect(data).to.be.undefined;
                        done();
                    });
                });
            });
        });
    });

    it('should remove entries from cache after a given ttl', done => {
        let cache = new Memory({ ttl: [ 100, 'ms' ] });
        cache.store('test','value', () => {
            setTimeout(() => {
                cache.fetch('test', (err, data) => {
                    expect(data).to.be.undefined;
                    done();
                });
            }, 150);
        });
    });
});
