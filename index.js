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

const websocket = require("ws");
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
    this.receivedHeartbeat = true;

  }

  this.configuration = configuration;

  // Get process environment variables (Docker)
  var host = process.env.SERVICE_HOST || this.configuration.HOST;
  var port = Number(process.env.SERVICE_PORT) || this.configuration.PORT;

  // Create a websocket server
  this.websocket = new websocket.Server({"host": host, "port": port});

  this.enableHeartbeat();

  // Create all rooms
  this.createSeedlinkProxies();

  // When a connection is made to the websocket
  this.websocket.on("connection", function connection(socket) {

    socket.receivedHeartbeat = true;

    // Socket was closed: unsubscribe all
    socket.on("close", function() {
      this.unsubscribeAll(socket);
    }.bind(this));

    // Set the pong listener
    socket.on("pong", heartbeat);

    // Message has been received: try parsing JSON
    socket.on("message", function(message) {

      try {
        this.handleIncomingMessage(socket, message);
      } catch(exception) {
        if(this.configuration.__DEBUG__) {
          socket.send(JSON.stringify({"error": exception.stack}));
        } else {
          socket.send(JSON.stringify({"error": exception.message}));
        }
      }

    }.bind(this));
  
    socket.send(JSON.stringify({"success": "Connected to Seedlink Proxy."}));
 
  }.bind(this));

  callback(configuration.__NAME__, host, port);

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

  const HEARTBEAT_INTERVAL_MS = 600;

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
  if(!socket.receivedHeartbeat) {
    return socket.terminate();
  }
  
  // Set up for a new heartbeat
  socket.receivedHeartbeat = false;
  socket.ping();

}

SeedlinkWebsocket.prototype.unsubscribeAll = function(socket) {

  /* Function SeedlinkWebsocket.unsubscribeAll
   * Unsubscribes socket from all rooms
   */

  Object.values(this.rooms).forEach(function(room) {
    this.unsubscribe(room.name, socket);
  }.bind(this));

}

SeedlinkWebsocket.prototype.createSeedlinkProxies = function() {

  /* Function SeedlinkWebsocket.createSeedlinkProxies
   * Initializes the configured seedlink proxies
   */

  this.rooms = new Object();

  // Read the room configuration
  require("./room-config").forEach(function(room) {
    this.rooms[room.name] = new SeedlinkProxy(room);
  }.bind(this));

}

SeedlinkWebsocket.prototype.getSeedlinkProxy = function(room) {

  /* Function SeedlinkWebsocket.getSeedlinkProxy
   * Returns the particular seedlink proxy with an identifier
   */

  return this.rooms[room];

}

SeedlinkWebsocket.prototype.unsubscribe = function(room, socket) {

  /* Function SeedlinkWebsocket.unsubscribe
   * Unsubscribes from a particular data Seedlink stream
   */

  // Sanity check if the room exists
  if(!this.roomExists(room)) {
    return socket.send(JSON.stringify({"error": "Invalid unsubscription requested."}));
  }

  // Get the particular seedlink proxy
  this.getSeedlinkProxy(room).removeSocket(socket);

}

SeedlinkWebsocket.prototype.roomExists = function(room) {

  /* Function SeedlinkWebsocket.roomExists
   * Checks whether a room name has been configured
   */

  return this.rooms.hasOwnProperty(room);

}

SeedlinkWebsocket.prototype.subscribe = function(room, socket) {

  /* Function SeedlinkWebsocket.subscribe
   * Subscribes from a particular data Seedlink stream
   */

  if(!this.roomExists(room)) {
    return socket.send(JSON.stringify({"error": "Invalid subscription requested."}));
  }

  // Add the socket to the room
  this.getSeedlinkProxy(room).addSocket(socket);

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
