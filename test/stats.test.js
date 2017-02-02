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
        })
    });
});
