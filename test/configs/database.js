const path = require('path');


module.exports = {
    custom: {
        client: {
            host: 'somehost:9200'
        },
        indices: path.join(__dirname, './indices'),
    }
};
