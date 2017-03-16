module.exports = {
    cache: {
        memory: {
            max: '1000',
            ttl: [ 1, 'h' ]
        }
    },
    instance: {
        logger: 'elasticsearch',
        /**
         * Elasticsearch.js client configuration
         */
        client: {
            host:'localhost:9200',
            log: 'info'
        },
        /**
         * Cashing driver and config
         */
        cache: {
            type: 'memory',
            max: '1000',
            ttl: [ 1, 'h' ]
        },
        /**
         * Caching (and possibly other future) stats
         */
        stats: {
            interval: [ 1, 'm' ],
            /**
             * Sets the number of requests to the same key required to make into the keys list.
             * If set to something false, it will disabled key statistics
             */
            threshold: 10
        },
        /**
         * Location (dir) from where to load additional mapping schemas, relative to the cwd of the server, or a direct
         * json object with the mapping for each index/type
         */
        indices: 'config/schemas',
    },
    mapping: {
        _all: {
            enabled: true,
            omit_norms: true
        },
        dynamic_templates: [{
            string_fields: {
                mapping: {
                    fielddata: {
                        format: 'disabled'
                    },
                    index: 'analyzed',
                    omit_norms: true,
                    type: 'string',
                    fields: {
                        raw: {
                            ignore_above: 256,
                            index: 'not_analyzed',
                            type: 'string',
                            doc_values: true
                        }
                    }
                },
                match: '*',
                match_mapping_type: 'string'
            }
        }, {
            float_fields: {
                mapping: {
                    type: 'float',
                    doc_values: true
                },
                match: '*',
                match_mapping_type: 'float'
            }
        }, {
            double_fields: {
                mapping: {
                    type: 'double',
                    doc_values: true
                },
                match: '*',
                match_mapping_type: 'double'
            }
        }, {
            byte_fields: {
                mapping: {
                    type: 'byte',
                    doc_values: true
                },
                match: '*',
                match_mapping_type: 'byte'
            }
        }, {
            short_fields: {
                mapping: {
                    type: 'short',
                    doc_values: true
                },
                match: '*',
                match_mapping_type: 'short'
            }
        }, {
            integer_fields: {
                mapping: {
                    type: 'integer',
                    doc_values: true
                },
                match: '*',
                match_mapping_type: 'integer'
            }
        }, {
            long_fields: {
                mapping: {
                    type: 'long',
                    doc_values: true
                },
                match: '*',
                match_mapping_type: 'long'
            }
        }, {
            date_fields: {
                mapping: {
                    type: 'date',
                    doc_values: true
                },
                match: '*',
                match_mapping_type: 'date'
            }
        }, {
            geo_point_fields: {
                mapping: {
                    type: 'geo_point',
                    doc_values: true
                },
                match: '*',
                match_mapping_type: 'geo_point'
            }
        }]
    },
    settings: {
        analysis: {
            filter: {
                ngram_filter: {
                    type: 'nGram',
                    min_gram: 2,
                    max_gram: 50
                }
            },
            analyzer: {
                ngram_analyzer: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: ['lowercase', 'ngram_filter']
                }
            }
        },
        index: {
            number_of_shards: 8,
            search: {
                slowlog: {
                    threshold: {
                        query: {
                            warn: '10s',
                            info: '5s',
                            debug: '2s'
                        },
                        fetch: {
                            warn: '1s',
                            info: '800ms',
                            debug: '500ms'
                        }
                    }
                }
            },
            indexing: {
                slowlog: {
                    threshold: {
                        index: {
                            warn: '10s',
                            info: '5s',
                            debug: '2s'
                        }
                    }
                }
            }
        }
    }
};
