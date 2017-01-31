/* globals describe, it, after, afterEach, before, beforeEach */
const config = require('cheevr-config');
const expect = require('chai').expect;
const nock = require('nock');


const Database = require('../database');

describe('Database', () => {

    describe('Constructor', () => {
        it('should create an instance with the given config', () => {

        });

        it('should set the logger to winston logging', () => {

        });

        it('should trigger creating mappings', () => {

        });
    });

    describe('_processBulk', () => {
        it('should create a series index if it doesn\'t exist yet and replace all bulk entry indices', () => {

        })
    });

    describe('_createIndex', () => {
        it('should create a series index', () => {

        });

        it('should return the series index if it already exists and not create the index', () => {

        });
    });

    describe('createMapping', () => {
        it('should create a standard index if doesn\'t exist yet', () => {

        });

        it('shouldn\'t create the index if it already exists', () => {

        });

        it('should create a series entry for a series index', () => {

        });
    });

    describe('_createMapping', () => {
        it('should create a normal index by default', () => {

        });

        it('should create a series index', () => {

        });

        it('should update index/update/bulk requests with the series index', () => {

        });
    });
});