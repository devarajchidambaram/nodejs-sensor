'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../../src/tracing/index').supportedVersion;
var agentControls = require('../../apps/agentStubControls');
var IoRedisControls = require('./controls');
var config = require('../../config');
var utils = require('../../utils');

describe('tracing/ioredis', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }
  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  var ioRedisControls = new IoRedisControls({
    agentControls: agentControls
  });
  ioRedisControls.registerTestHooks();

  it('must trace set/get calls', function() {
    return ioRedisControls.sendRequest({
      method: 'POST',
      path: '/values',
      qs: {
        key: 'price',
        value: 42
      }
    })
    .then(function() {
      return ioRedisControls.sendRequest({
        method: 'GET',
        path: '/values',
        qs: {
          key: 'price'
        }
      });
    })
    .then(function(response) {
      expect(String(response)).to.equal('42');

      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('POST');
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(writeEntrySpan.t);
            expect(span.p).to.equal(writeEntrySpan.s);
            expect(span.n).to.equal('redis');
            expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.redis.connection).to.equal(process.env.REDIS);
            expect(span.data.redis.command).to.equal('set');
          });

          var readEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(readEntrySpan.t);
            expect(span.p).to.equal(readEntrySpan.s);
            expect(span.n).to.equal('redis');
            expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.data.redis.connection).to.equal(process.env.REDIS);
            expect(span.data.redis.command).to.equal('get');
          });
        });
      });
    });
  });

  it('must trace failed redis calls', function() {
    return ioRedisControls.sendRequest({
      method: 'GET',
      path: '/failure'
    })
    .catch(function() {
      // ignore errors
    })
    .then(function() {
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(writeEntrySpan.t);
            expect(span.p).to.equal(writeEntrySpan.s);
            expect(span.n).to.equal('redis');
            expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(true);
            expect(span.ec).to.equal(1);
            expect(span.data.redis.connection).to.equal(process.env.REDIS);
            expect(span.data.redis.command).to.equal('get');
            expect(span.data.redis.error).to.be.a('string');
          });
        });
      });
    });
  });

  it('must trace multi calls', function() {
    return ioRedisControls.sendRequest({
      method: 'GET',
      path: '/multi'
    })
    .then(function() {
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(writeEntrySpan.t);
            expect(span.p).to.equal(writeEntrySpan.s);
            expect(span.n).to.equal('redis');
            expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.ec).to.equal(0);
            expect(span.b.s).to.equal(2);
            expect(span.b.u).to.equal(false);
            expect(span.data.redis.connection).to.equal(process.env.REDIS);
            expect(span.data.redis.command).to.equal('multi');
            expect(span.data.redis.subCommands).to.deep.equal([
              'hset',
              'hget'
            ]);
          });
        });
      });
    });
  });

  it('must trace failed multi calls', function() {
    return ioRedisControls.sendRequest({
      method: 'GET',
      path: '/multiFailure'
    })
    .catch(function() {
      // ignore errors
    })
    .then(function() {
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(writeEntrySpan.t);
            expect(span.p).to.equal(writeEntrySpan.s);
            expect(span.n).to.equal('redis');
            expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(true);
            expect(span.ec).to.equal(2);
            expect(span.b.s).to.equal(2);
            expect(span.b.u).to.equal(false);
            expect(span.data.redis.connection).to.equal(process.env.REDIS);
            expect(span.data.redis.command).to.equal('multi');
            expect(span.data.redis.subCommands).to.deep.equal([
              'hset',
              'hget'
            ]);
            expect(span.data.redis.error).to.be.a('string');
          });
        });
      });
    });
  });

  it('must trace pipeline calls', function() {
    return ioRedisControls.sendRequest({
      method: 'GET',
      path: '/pipeline'
    })
    .then(function() {
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(writeEntrySpan.t);
            expect(span.p).to.equal(writeEntrySpan.s);
            expect(span.n).to.equal('redis');
            expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.ec).to.equal(0);
            expect(span.b.s).to.equal(3);
            expect(span.b.u).to.equal(false);
            expect(span.data.redis.connection).to.equal(process.env.REDIS);
            expect(span.data.redis.command).to.equal('pipeline');
            expect(span.data.redis.subCommands).to.deep.equal([
              'hset',
              'hset',
              'hget'
            ]);
          });
        });
      });
    });
  });

  it('must trace partially failed pipeline calls', function() {
    return ioRedisControls.sendRequest({
      method: 'GET',
      path: '/pipelineFailure'
    })
    .then(function() {
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(writeEntrySpan.t);
            expect(span.p).to.equal(writeEntrySpan.s);
            expect(span.n).to.equal('redis');
            expect(span.f.e).to.equal(String(ioRedisControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(true);
            expect(span.ec).to.equal(1);
            expect(span.b.s).to.equal(3);
            expect(span.b.u).to.equal(false);
            expect(span.data.redis.connection).to.equal(process.env.REDIS);
            expect(span.data.redis.command).to.equal('pipeline');
            expect(span.data.redis.subCommands).to.deep.equal([
              'hset',
              'hset',
              'hget'
            ]);
            expect(span.data.redis.error).to.be.a('string');
          });
        });
      });
    });
  });
});
