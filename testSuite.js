var WebSocket = require("ws");
var configuration = require("./config");
var channels = require("./channel-config");

function createWebsocket() {

  /*
   * Function createWebsocket
   * Creates a new websocket connection
   */

  return new WebSocket('ws://' + configuration.HOST + ":" + configuration.PORT);

}

function testRecord(proceed) {

  /*
   * Function testRecord
   * Tests whether an unpacked record is returned after subscription
   */

  const error = new Error("Test failure in " + arguments.callee.name);

  // Open a new websocket
  var websocket = createWebsocket();

  var requestedChannel = channels.map(x => x.name).sort().pop();

  // Write the channel request
  websocket.on("open", function() {
    websocket.send(JSON.stringify({"subscribe": requestedChannel}));
  });

  websocket.on("message", function(data) {

    // Parse the message
    json = JSON.parse(data);

    // Ignore subscription message
    if(json.success) {
      return;
    }

    websocket.close();

    // Assert that a data array is passed
    if(!Array.isArray(json.data)) {
      return proceed(error);
    }

    proceed(false);

  });

}

function testOperationError(proceed) {

  /*
   * Function testOperationError
   * Tests whether an invalid operation returns an error
   */

  const error = new Error("Test failure in " + arguments.callee.name);

  // Open a new websocket
  var websocket = createWebsocket();

  // Write the channel request
  websocket.on("open", function() {
    websocket.send(JSON.stringify({"noop": true}));
  });

  websocket.on("message", function(data) {

    websocket.close();

    if(data !== JSON.stringify({"error": "Invalid operation requested. Expected: subscribe, unsubscribe, channels"})) {
      return proceed(error);
    }

    proceed(false);

  });

}

function testSubscriptionSuccess(proceed) {

  /*
   * Function testSubscriptionSuccess
   * Tests whether a subscription returns a success message
   */

  const error = new Error("Test failure in " + arguments.callee.name);

  // Open a new websocket
  var websocket = createWebsocket();

  var requestedChannel = channels.map(x => x.name).sort().pop();

  // Write the channel request
  websocket.on("open", function() {
    websocket.send(JSON.stringify({"subscribe": requestedChannel})); 
  });

  websocket.on("message", function(data) {

    websocket.close();

    if(data.success && data !== JSON.stringify({"success": "Subscribed to channel " + requestedChannel + "."})) {
      return proceed(error);
    }

    proceed(false);

  });

}

function testChannels(proceed) {

  /*
   * Function testChannels
   * Tests the channel command
   */

  const error = new Error("Test failure in " + arguments.callee.name);

  // Open a new websocket
  var websocket = createWebsocket();

  // Write the channel request
  websocket.on("open", function() {
    websocket.send(JSON.stringify({"channels": true}));
  });

  websocket.on("message", function(data) {

    // Close the remote websocket
    websocket.close();

    // Assert that the response is what we expect
    if(data !== JSON.stringify({"success": channels.map(x => x.name).sort().join(" ")})) {
      return proceed(error);
    }

    proceed(false);

  });

}

module.exports = {
  testChannels,
  testSubscriptionSuccess,
  testOperationError,
  testRecord
}
