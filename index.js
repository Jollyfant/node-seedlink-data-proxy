/*
 * nodejs-seedlink-data-proxy
 *
 * Seedlink server proxy written for NodeJS. Connects to 
 * multiple seedlink servers and broadcasts unpacked data samples
 * over HTML5 websockets.
 *
 * Copyright: ORFEUS Data Center, 2018
 * Author: Mathijs Koymans
 * Licensed under MIT
 *
 */

"use strict";

// Native libs
const fs = require("fs");
const path = require("path");

// Third party libs
const websocket = require("ws");

// Application libs
const SeedlinkProxy = require("./lib/seedlink-proxy");

const __VERSION__ = "1.0.0";

const SeedlinkWebsocket = function(configuration, callback) {

  /* Class SeedlinkWebsocket
   * Websocket server that relays unpacked data from arbitrary
   * Seedlink server to the browser
   */

  function heartbeat() {

    /* function heartbeat
     * Sets heartbeat state to received
     */
    this.__receivedHeartbeat = true;

  }

  this.configuration = configuration;

  // Get process environment variables (Docker)
  var host = process.env.SERVICE_HOST || this.configuration.HOST;
  var port = Number(process.env.SERVICE_PORT) || this.configuration.PORT;

  // Create a websocket server
  this.websocket = new websocket.Server({"host": host, "port": port});

  this.logger = this.setupLogger();
  this.enableHeartbeat();

  // Create all channels
  this.createSeedlinkProxies();

  // When a connection is made to the websocket
  this.websocket.on("connection", function(socket, request) {

    // Attach some metadata to the socket
    socket.__receivedHeartbeat = true;

    // Socket was closed: unsubscribe all
    socket.on("close", function() {
      this.unsubscribeAll(socket);
    }.bind(this));

    // Set the pong listener
    socket.on("pong", heartbeat);

    // Called when writing to socket
    socket.on("write", function(json) {

      const __noop = () => {}

      // Skip succes, error messages to clients
      if(!json.success && !json.errror) {
        this.logMessage(request, json);
      }

      // Write data over socket
      socket.send(JSON.stringify(json), __noop);

    }.bind(this));

    // Message has been received: try parsing JSON
    socket.on("message", function(message) {

      try {
        this.handleIncomingMessage(socket, message);
      } catch(exception) {
        if(this.configuration.__DEBUG__) {
          socket.emit("write", {"error": exception.stack});
        } else {
          socket.emit("write", {"error": exception.message});
        }
      }

    }.bind(this));
  
    socket.emit("write", {"success": "Connected to Seedlink Proxy."});
 
  }.bind(this));

  callback(configuration.__NAME__, host, port);

}

SeedlinkWebsocket.prototype.setupLogger = function() {

  /* Function SeedlinkWebsocket.setupLogger
   * Sets up the service logfile
   */

  fs.existsSync(path.join(__dirname, "logs")) || fs.mkdirSync(path.join(__dirname, "logs"));
  return fs.createWriteStream(path.join(__dirname, "logs", "service.log"), {"flags": "a"});

}

SeedlinkWebsocket.prototype.logMessage = function(request, json) {

  /* Function SeedlinkWebsocket.logMessage
   * Writes websocket mSEED record messages to logfile
   */

  this.logger.write(JSON.stringify({
    "timestamp": new Date().toISOString(),
    "network": json.network,
    "station": json.station,
    "location": json.location,
    "channel": json.channel,
    "nSamples": json.data.length,
    "agent": request.headers["user-agent"] || null,
    "client": request.connection.remoteAddress || request.headers["x-forwarded-for"] 
  }) + "\n");

}

SeedlinkWebsocket.prototype.handleIncomingMessage = function(socket, message) {

  /* Function SeedlinkWebsocket.handleIncomingMessage
   * Code to handle messages send to the server over the websocket
   */

  var json = JSON.parse(message);

  if(json.subscribe) {
    this.subscribe(json.subscribe, socket);
  } else if(json.unsubscribe) {
    this.unsubscribe(json.unsubscribe, socket);
  } else {
    throw new Error("Invalid JSON message specified.");
  }

}

SeedlinkWebsocket.prototype.enableHeartbeat = function() {

  /* Function SeedlinkWebsocket.enableHeartbeat
   * Enable heartbeat polling each connected websocket
   */

  const HEARTBEAT_INTERVAL_MS = 60000;

  setInterval(function() {
    this.websocket.clients.forEach(this.checkHeartbeat);
  }.bind(this), HEARTBEAT_INTERVAL_MS);

}

SeedlinkWebsocket.prototype.checkHeartbeat = function(socket) {

  /* Function SeedlinkWebsocket.checkHeartbeat
   * Checks whether the socket is still alive and responds
   * to ping messages
   */

  // Socket did not response to heartbeat since last check
  if(!socket.__receivedHeartbeat) {
    return socket.terminate();
  }
  
  // Set up for a new heartbeat
  socket.__receivedHeartbeat = false;
  socket.ping();

}

SeedlinkWebsocket.prototype.unsubscribeAll = function(socket) {

  /* Function SeedlinkWebsocket.unsubscribeAll
   * Unsubscribes socket from all channels
   */

  Object.values(this.channels).forEach(function(channel) {
    this.unsubscribe(channel.name, socket);
  }.bind(this));

}

SeedlinkWebsocket.prototype.createSeedlinkProxies = function() {

  /* Function SeedlinkWebsocket.createSeedlinkProxies
   * Initializes the configured seedlink proxies
   */

  this.channels = new Object();

  // Read the channel configuration
  require("./channel-config").forEach(function(channel) {
    this.channels[channel.name] = new SeedlinkProxy(channel);
  }.bind(this));

}

SeedlinkWebsocket.prototype.getSeedlinkProxy = function(channel) {

  /* Function SeedlinkWebsocket.getSeedlinkProxy
   * Returns the particular seedlink proxy with an identifier
   */

  return this.channels[channel];

}

SeedlinkWebsocket.prototype.unsubscribe = function(channel, socket) {

  /* Function SeedlinkWebsocket.unsubscribe
   * Unsubscribes from a particular data Seedlink stream
   */

  // Sanity check if the channel exists
  if(!this.channelExists(channel)) {
    return socket.emit("write", {"error": "Invalid unsubscription requested."});
  }

  // Get the particular seedlink proxy
  this.getSeedlinkProxy(channel).removeSocket(socket);

}

SeedlinkWebsocket.prototype.channelExists = function(channel) {

  /* Function SeedlinkWebsocket.channelExists
   * Checks whether a channel name has been configured
   */

  return this.channels.hasOwnProperty(channel);

}

SeedlinkWebsocket.prototype.subscribe = function(channel, socket) {

  /* Function SeedlinkWebsocket.subscribe
   * Subscribes from a particular data Seedlink stream
   */

  if(!this.channelExists(channel)) {
    return socket.emit("write", {"error": "Invalid subscription requested."});
  }

  // Add the socket to the channel
  this.getSeedlinkProxy(channel).addSocket(socket);

}

// Expose the class
module.exports.server = SeedlinkWebsocket;
module.exports.__VERSION__ = __VERSION__;

if(require.main === module) {

  const CONFIG = require("./config");

  // Start the microservice
  new module.exports.server(CONFIG, function(name, host, port) {
    console.log(name + " microservice has been started on " + host + ":" + port);
  });

}
