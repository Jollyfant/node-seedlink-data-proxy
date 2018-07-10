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

  this.configuration = configuration;

  // Get process environment variables (Docker)
  var host = process.env.SERVICE_HOST || this.configuration.HOST;
  var port = Number(process.env.SERVICE_PORT) || this.configuration.PORT;

  // Create a websocket server
  this.websocket = new websocket.Server({"host": host, "port": port});

  // When a connection is made to the websocket
  this.websocket.on("connection", function connection(socket) {

    // Message has been received: try parsing JSON
    socket.on("message", function(message) {

      try {
        var json = JSON.parse(message);
        if(json.subscribe) {
          this.subscribe(json.subscribe, socket);
        } else if(json.unsubscribe) {
          this.unsubscribe(json.unsubscribe, socket);
        } else {
          socket.send("Invalid message specified.");
        }

      } catch(exception) {
        socket.send("Invalid JSON message specified."); 
      }

    }.bind(this));
  
    socket.send("Connected to Seedlink.");
 
  }.bind(this));

  // Create all rooms
  this.createSeedlinkProxies();

  callback(configuration.__NAME__, host, port);

}

SeedlinkWebsocket.prototype.createSeedlinkProxies = function() {

  /* Function SeedlinkWebsocket.createSeedlinkProxies
   * Initializes the configured seedlink proxies
   */

  this.rooms = new Object();

  this.configuration.ROOMS.forEach(function(room) {
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
  if(!this.rooms.hasOwnProperty(room)) {
    return socket.send("Invalid unsubscription requested.");
  }

  // Get the particular seedlink proxy
  var seedlinkProxy = this.getSeedlinkProxy(room);

  // Remove the socket from the list
  var index = seedlinkProxy._sockets.indexOf(socket);

  // Does not exist in the list
  if(index === -1) {
    return;
  }

  seedlinkProxy._sockets.splice(index, 1);

  // Disconnect the proxy if no users are present
  if(seedlinkProxy._sockets.length === 0) {
    seedlinkProxy.disconnect();
  }

}

SeedlinkWebsocket.prototype.subscribe = function(room, socket) {

  /* Function SeedlinkWebsocket.subscribe
   * Subscribes from a particular data Seedlink stream
   */

  if(!this.rooms.hasOwnProperty(room)) {
    return socket.send("Invalid subscription requested.");
  }

  var seedlinkProxy = this.getSeedlinkProxy(room);

  // Add the socket to the room (not twice)
  if(!seedlinkProxy._sockets.includes(socket)) {
    seedlinkProxy._sockets.push(socket);
  }

  // Connect if required 
  if(!seedlinkProxy._connected) {
    seedlinkProxy.connect();
  }

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
