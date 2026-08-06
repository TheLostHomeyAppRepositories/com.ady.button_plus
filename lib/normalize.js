'use strict';

const normalize = function(topic)
{
    if (typeof topic !== 'string') return undefined;

    return topic
        .split('/')
        .map((name) => name
            .trim()
            .toLowerCase()
            .normalize('NFKC')
            .replace(/[ _]+/g, '-')
            .replace(/[^\p{L}\p{N}-]/gu, '')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, ''))
        .join('/');
};

module.exports = normalize;
