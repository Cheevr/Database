/* globals describe, it, after, afterEach, before, beforeEach */
const expect = require('chai').expect;

const Stats = require('../stats');

describe('Database', () => {
    it('should record all types of hits in the metrics', () => {
        let stats = new Stats({
            interval: [ 1, 'm'],
            threshold: 1
        });

        stats.request = 'key1';
        stats.hit = 'key2';
        stats.miss = 'key3';

        expect(stats.snapshot).to.deep.equal({
            source: '_default_',
            total: 2,
            hit: {
                count: 1,
                ratio: 0.5
            },
            miss: {
                count: 1,
                ratio: 0.5
            },
            keys: [ {
                hit: 0,
                key: 'key1',
                miss: 0,
                request: 1
            }, {
                hit: 1,
                key: 'key2',
                miss: 0,
                request: 1
            }, {
                hit: 0,
                key: 'key3',
                miss: 1,
                request: 1
            }]
        });
    });

    it('should not include keys below the threshold', () => {
        let stats = new Stats({
            interval: [ 1, 'm'],
            threshold: 3
        });

        stats.hit = 'key1';
        stats.hit = 'key1';
        stats.hit = 'key1';
        stats.miss = 'key2';
        stats.miss = 'key2';

        expect(stats.snapshot).to.deep.equal({
            source: '_default_',
            total: 5,
            hit: {
                count: 3,
                ratio: 0.6
            },
            miss: {
                count: 2,
                ratio: 0.4
            },
            keys: [ {
                hit: 3,
                key: 'key1',
                miss: 0,
                request: 3
            }]
        });
    });

    it('should remove stats after the interval has expired', done => {
        let stats = new Stats({
            interval: [ 100, 'ms'],
            threshold: 10
        });

        stats.hit = 'key1';

        expect(stats.snapshot).to.deep.equal({
            source: '_default_',
            total: 1,
            hit: {
                count: 1,
                ratio: 1            },
            miss: {
                count: 0,
                ratio: 0
            }
        });
        setTimeout(() => {
            expect(stats.snapshot).to.be.null;
            done();
        }, 150);
    });
});
