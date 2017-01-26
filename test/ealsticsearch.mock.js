const nock = require('nock');

class Mock {
    constructor(host = /.*/) {
        nock(host)
            .get('')
            .replyWithFile(200, __dirname + '/responses/index.json');
        nock(host)
            .get('/_cluster/health')
            .query(true)
            .replyWithFile(200, __dirname + '/responses/cluster.health.json');
    }

    clean() {

    }
}

module.exports = host => {
    return new Mock(host);
};
