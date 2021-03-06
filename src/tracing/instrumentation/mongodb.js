'use strict';

var logger = require('../../logger').getLogger('tracing/mongodb');
var requireHook = require('../../util/requireHook');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
var cls = require('../cls');

var isActive = false;

// operation ID + request ID => {
//   span
// }
var requests = {};


exports.init = function() {
  requireHook.on('mongodb', instrument);
};


function instrument(mongodb) {
  if (!mongodb.instrument) {
    logger.info('Cannot instrument the MongoDB driver as it is lacking APM support.');
    return;
  }

  var listener = mongodb.instrument({
    operationIdGenerator: {
      next: function() {
        return {};
      }
    },

    timestampGenerator: {
      current: function() {
        return Date.now();
      },

      duration: function(start, end) {
        return end - start;
      }
    }
  }, function(error) {
    if (error) {
      logger.warn('Failed to instrument MongoDB', {error: error});
    }
  });

  listener.on('started', onStarted);
  listener.on('succeeded', onSucceeded);
  listener.on('failed', onFailed);
}


function onStarted(event) {
  if (!isActive || !cls.isTracing()) {
    return;
  }

  var parentSpan = cls.getCurrentSpan();
  var span = null;
  if (event.operationId.traceId && event.operationId.parentSpanId) {
    span = cls.startSpan('mongo', event.operationId.traceId, event.operationId.parentSpanId);
  } else {
    span = cls.startSpan('mongo');
  }
  cls.setCurrentSpan(parentSpan);

  var host = event.connectionId.host;
  var port = event.connectionId.port;
  var database = event.databaseName;
  var collection = event.command.collection || event.command[event.commandName];
  // using the Mongodb instrumentation API, it is not possible to gather stack traces. Getting started
  // without stack traces at first.
  span.stack = [];
  span.data = {
      peer: {
        hostname: host,
        port: port
      },
      mongo: {
        command: event.commandName,
        service: host + ':' + port,
        namespace: database + '.' + collection,
        filter: stringifyWhenNecessary(event.command.filter),
        query: stringifyWhenNecessary(event.command.query)
      }
    };

  event.operationId.traceId = span.t;
  event.operationId.parentSpanId = span.p;

  requests[getUniqueRequestId(event)] = {
    span: span
  };
}


function stringifyWhenNecessary(obj) {
  if (obj == null) {
    return undefined;
  } else if (typeof obj === 'string') {
    return tracingUtil.shortenDatabaseStatement(obj);
  }
  return tracingUtil.shortenDatabaseStatement(JSON.stringify(obj));
}


function onSucceeded(event) {
  if (!isActive) {
    cleanup(event);
    return;
  }

  var spanData = requests[getUniqueRequestId(event)];
  if (!spanData) {
    return;
  }

  spanData.span.d = Date.now() - spanData.span.ts;
  spanData.span.error = false;
  transmission.addSpan(spanData.span);

  cleanup(event);
}


function onFailed(event) {
  if (!isActive) {
    cleanup(event);
    return;
  }

  var spanData = requests[getUniqueRequestId(event)];
  if (!spanData) {
    return;
  }

  spanData.span.d = Date.now() - spanData.span.ts;
  spanData.span.error = true;
  spanData.span.ec = 1;
  transmission.addSpan(spanData.span);

  cleanup(event);
}


function getUniqueRequestId(event) {
  return event.operationId + '_' + event.requestId;
}


function cleanup(event) {
  var requestId = getUniqueRequestId(event);
  delete requests[requestId];
}


exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};
