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

// Global patch the require method
//require("./require");

const __VERSION__ = "1.1.0";

const SeedlinkWebsocket = function(configuration, callback) {

  /* Class SeedlinkWebsocket
   * Websocket server that relays unpacked data from arbitrary
   * Seedlink server to the browser
   */

  const websocket = require("ws");

  this.configuration = configuration;

  // Get process environment variables (Docker)
  var host = process.env.SERVICE_HOST || this.configuration.HOST;
  var port = Number(process.env.SERVICE_PORT) || this.configuration.PORT;

  // Create a websocket server
  this.websocket = new websocket.Server({"host": host, "port": port});

  // Create a logger
  this.logger = this.setupLogger();

  // Create all channels
  this.createSeedlinkProxies();

  // Enable pinging of clients
  this.enableHeartbeat();

  // When a connection is made to the websocket
  this.websocket.on("connection", this.attachSocketHandlers.bind(this));

  // Callback if passed
  if(callback instanceof Function) {
    callback(configuration.__NAME__, host, port);
  }

}

SeedlinkWebsocket.prototype.close = function(callback) {

  /*
   * Function SeedlinkWebsocket.close
   * Attaches listeners to the websocket
   */

  // Clear the heartbeat interval otherwise the process
  clearInterval(this.interval);

  this.websocket.close(callback);

}

SeedlinkWebsocket.prototype.attachSocketHandlers = function(socket, request) {

  /*
   * Function SeedlinkWebsocket.attachSocketHandlers
   * Attaches listeners to the websocket
   */

  function heartbeat() {

    /*
     * Function heartbeat
     * Sets heartbeat state to received
     */

    this._receivedHeartbeat = true;

  }

  // User feedback that connection is ok
  socket.emit("write", "Connected to Seedlink Proxy.");

  socket._receivedHeartbeat = true;

  // Socket was closed: unsubscribe from all rooms
  socket.on("close", () => this.unsubscribeAll(socket));

  // Called when writing to socket
  socket.on("write", function(object) {

    // Map the item to write to a JSON object
    var json = this.mapMessage(object);

    // Write a log for exported mSEED record
    if(!json.success && !json.error) {
      this.logRecordMessage(request, json);
    }

    // Write the data over socket (NOOP callback)
    socket.send(JSON.stringify(json), Function.prototype);

  }.bind(this));

  // Message has been received: try parsing JSON
  socket.on("message", function(message) {

    try {
      this.handleIncomingMessage(socket, message);
    } catch(exception) {
      socket.emit("write", exception);
    }

  }.bind(this));

  // Set the pong listener
  socket.on("pong", heartbeat);

}

SeedlinkWebsocket.prototype.mapMessage = function(object) {

  /*
   * Function SeedlinkWebsocket.mapMessage
   * Maps the socket message to write to a JSON object
   */

  // An error was passed
  if(object instanceof Error) {
    return new Object({"error": (this.configuration.__DEBUG__ ? object.stack : object.message)});
  }

  // String was passed
  if(typeof(object) === "string") {
    return new Object({"success": object});
  }

  // An unpacked mSEED record was passed
  return object;

}
 
SeedlinkWebsocket.prototype.setupLogger = function() {

  /*
   * Function SeedlinkWebsocket.setupLogger
   * Sets up the service logfile
   */

  // Lazy module loading
  const fs = require("fs");
  const path = require("path");

  var logDirectory = path.join(__dirname, "logs");

  // Check if the log directory exists else create it
  fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);
  return fs.createWriteStream(path.join(logDirectory, "service.log"), {"flags": "a"});

}

SeedlinkWebsocket.prototype.logRecordMessage = function(request, json) {

  /*
   * Function SeedlinkWebsocket.logRecordMessage
   * Writes websocket mSEED record messages to logfile
   */

  function extractClientIP(request) {

    /*
     * Function SeedlinkWebsocket.logRecordMessage::extractClientIP
     * Extracts the client IP from the request headers
     */

    return request.connection.remoteAddress || request.headers["x-forwarded-for"] || null;

  }

  var requestLog = {
    "timestamp": new Date().toISOString(),
    "network": json.network,
    "station": json.station,
    "location": json.location,
    "channel": json.channel,
    "nSamples": json.data.length,
    "agent": request.headers["user-agent"] || null,
    "client": extractClientIP(request),
    "version": __VERSION__
  }

  return this.logger.write(JSON.stringify(requestLog) + "\n");

}

SeedlinkWebsocket.prototype.handleIncomingMessage = function(socket, message) {

  /*
   * Function SeedlinkWebsocket.handleIncomingMessage
   * Code to handle messages send to the server over the websocket
   */

  const OPERATIONS = new Array(
    "subscribe",
    "unsubscribe",
    "channels"
  );

  function isAllowed(x) {

    /*
     * Function SeedlinkWebsocket.handleIncomingMessage::isAllowed
     * Returns whether a requested operation is allowed by the websocket server
     */

    return OPERATIONS.includes(x);

  }

  var json = JSON.parse(message);

  // Confirm that the operation is allowed
  if(!Object.keys(json).every(isAllowed)) {
    throw new Error("Invalid operation requested. Expected: " + OPERATIONS.join(", "));
  }

  // Handle the requested operations
  if(json.subscribe) {
    this.subscribe(json.subscribe, socket);
  }

  if(json.unsubscribe) {
    this.unsubscribe(json.unsubscribe, socket);
  }

  // Request to show the available channels
  if(json.channels) {
    socket.emit("write", Object.keys(this.channels).sort().join(" "));
  }

}

SeedlinkWebsocket.prototype.enableHeartbeat = function() {

  /*
   * Function SeedlinkWebsocket.enableHeartbeat
   * Enable heartbeat polling each connected websocket
   */

  const HEARTBEAT_INTERVAL_MS = 60000;

  this.interval = setInterval(function() {
    this.websocket.clients.forEach(this.checkHeartbeat);
  }.bind(this), HEARTBEAT_INTERVAL_MS);

}

SeedlinkWebsocket.prototype.checkHeartbeat = function(socket) {

  /*
   * Function SeedlinkWebsocket.checkHeartbeat
   * Checks whether the socket is still alive and responds to ping messages with pong
   */

  // Socket did not response to heartbeat since last check
  if(!socket._receivedHeartbeat) {
    return socket.terminate();
  }
  
  // Set up for a new heartbeat
  socket._receivedHeartbeat = false;
  socket.ping();

}

SeedlinkWebsocket.prototype.unsubscribeAll = function(socket) {

  /*
   * Function SeedlinkWebsocket.unsubscribeAll
   * Unsubscribes socket from all channels
   */

  // Go over all channels and unsubscribe the socket
  Object.values(this.channels).forEach(function(channel) {
    this.unsubscribe(channel.name, socket);
  }.bind(this));

}

SeedlinkWebsocket.prototype.createSeedlinkProxies = function() {

  /*
   * Function SeedlinkWebsocket.createSeedlinkProxies
   * Initializes the configured seedlink proxies
   */

  const SeedlinkProxy = require("./lib/seedlink-proxy");

  // Create a map for the available channels
  this.channels = new Object();

  // Read the channel configuration and create new sleeping proxies
  require("./channel-config").forEach(function(channel) {
    this.channels[channel.name] = new SeedlinkProxy(channel);
  }.bind(this));

}

SeedlinkWebsocket.prototype.getSeedlinkProxy = function(channel) {

  /*
   * Function SeedlinkWebsocket.getSeedlinkProxy
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
    return socket.emit("write", new Error("Invalid channel unsubscription requested: " + channel));
  }

  // Get the particular seedlink proxy
  this.getSeedlinkProxy(channel).removeSocket(socket);

}

SeedlinkWebsocket.prototype.channelExists = function(channel) {

  /*
   * Function SeedlinkWebsocket.channelExists
   * Checks whether a channel name has been configured
   */

  return this.channels.hasOwnProperty(channel);

}

SeedlinkWebsocket.prototype.subscribe = function(channel, socket) {

  /*
   * Function SeedlinkWebsocket.subscribe
   * Subscribes from a particular data Seedlink stream
   */

  if(!this.channelExists(channel)) {
    return socket.emit("write", new Error("Invalid channel subscription requested: " + channel)); 
  }

  // Add the socket to the channel
  this.getSeedlinkProxy(channel).addSocket(socket);

}

// Expose the class
module.exports.server = SeedlinkWebsocket;
module.exports.__VERSION__ = __VERSION__;

if(require.main === module) {

  const configuration = require("./config");

  // Start the microservice
  new module.exports.server(configuration, function(name, host, port) {
    console.log(name + " microservice has been started on " + host + ":" + port);
  });

}
