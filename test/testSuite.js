/*
 * NodeJS Seedlink Proxy testSuite
 *
 * Wrapper for the test suite for this application
 *
 * Copyright: ORFEUS Data Center, 2018
 * Author: Mathijs Koymans
 * Licensed under MIT
 *
 */

"use strict";

var WebSocket = require("ws");
var configuration = require("./config");
var channels = require("./channel-config");

const WS_NORMAL_CLOSURE = 1000; 
const WS_ABNORMAL_CLOSURE = 1011;

function createWebsocket(proceed) {

  /*
   * Function createWebsocket
   * Creates a new websocket connection that can be used for a single test
   * The proceed callback must be passed and will be executed after the test finished
   * and the websocket was closed
   */

  var websocket = new WebSocket("ws://" + configuration.HOST + ":" + configuration.PORT);

  // Wait for the websocket to close before proceeding
  websocket.on("close", function(code) {

    switch(code) {
      case WS_NORMAL_CLOSURE:
        return proceed(false);
      case WS_ABNORMAL_CLOSURE:
        return proceed(new Error("Fatal exception occured in test."));
      default:
        return proceed(new Error("Unknown websocket error code."));
    }

  });

  return websocket;

}

function testRecord(proceed) {

  /*
   * Function testRecord
   * Tests whether an unpacked record is returned after subscription
   */

  // Open a new websocket
  var websocket = createWebsocket(proceed);

  var requestedChannel = channels.map(x => x.name).sort().pop();

  // Write the channel request
  websocket.on("open", function() {
    websocket.send(JSON.stringify({"subscribe": requestedChannel}));
  });

  websocket.on("message", function(data) {

    // Parse the message
    var json = JSON.parse(data);

    // Ignore subscription message
    if(json.success) {
      return;
    }

    // Assert that a data array is passed
    if(!Array.isArray(json.data)) {
      return websocket.close(WS_ABNORMAL_CLOSURE);
    }

    websocket.close(WS_NORMAL_CLOSURE);

  });

}

function testOperationError(proceed) {

  /*
   * Function testOperationError
   * Tests whether an invalid operation returns an error
   */

  // Open a new websocket
  var websocket = createWebsocket(proceed);

  // Write the channel request
  websocket.on("open", function() {
    websocket.send(JSON.stringify({"noop": true}));
  });

  websocket.on("message", function(data) {

    if(data !== JSON.stringify({"error": "Invalid operation requested. Expected: subscribe, unsubscribe, channels, info"})) {
      return websocket.close(WS_ABNORMAL_CLOSURE);
    }

    websocket.close(WS_NORMAL_CLOSURE);

  });

}

function testSubscriptionSuccess(proceed) {

  /*
   * Function testSubscriptionSuccess
   * Tests whether a subscription returns a success message
   */

  // Open a new websocket
  var websocket = createWebsocket(proceed);

  var requestedChannel = channels.map(x => x.name).sort().pop();

  // Write the channel request
  websocket.on("open", function() {
    websocket.send(JSON.stringify({"subscribe": requestedChannel})); 
  });

  websocket.on("message", function(data) {

    if(data !== JSON.stringify({"success": "Subscribed to channel " + requestedChannel + "."})) {
      return websocket.close(WS_ABNORMAL_CLOSURE);
    }

    websocket.close(WS_NORMAL_CLOSURE);

  });

}

function testChannels(proceed) {

  /*
   * Function testChannels
   * Tests the channel command
   */

  // Open a new websocket
  var websocket = createWebsocket(proceed);

  // Write the channel request
  websocket.on("open", function() {
    websocket.send(JSON.stringify({"channels": true}));
  });

  websocket.on("message", function(data) {

    // Assert that the response is what we expect
    if(data !== JSON.stringify({"success": channels.map(x => x.name).sort().join(" ")})) {
      return websocket.close(WS_ABNORMAL_CLOSURE);
    }

    return websocket.close(WS_NORMAL_CLOSURE);

  });

}

module.exports = {
  testChannels,
  testSubscriptionSuccess,
  testOperationError,
  testRecord
}
