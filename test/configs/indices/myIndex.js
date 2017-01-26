module.exports = {
    mappings: {
        mytype: {
            '@timestamp': {type: 'date', format: 'strict_date_optional_time||epoch_millis'},
            '@version': {type: 'string', index: 'not_analyzed'},
        }
    }
};
