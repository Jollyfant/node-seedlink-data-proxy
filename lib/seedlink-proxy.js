/*
 * NodeJS Seedlink Proxy
 *
 * Wrapper class for a single Seedlink proxy
 *
 * Copyright: ORFEUS Data Center, 2018
 * Author: Mathijs Koymans
 * Licensed under MIT
 *
 */

"use strict";

// Native lib
const network = require("net");

// Library for reading mSEED records
const mSEEDRecord = require("libmseedjs");

const SeedlinkProxy = function(options) {

  /* Class SeedlinkProxy
   * Single entity of a Seedlink proxy that can connect to a
   * remote Seedlink server and broadcast unpacked data samples
   */

  // Privates
  this._connected = false;
  this._sockets = new Array();

  // Copy channel options
  this.name = options.name;
  this.host = options.host;
  this.port = options.port;
  this.commands = this.getStreamCommands(options.selectors); 

  // Create the TCP socket
  this.seedlinkSocket = new network.Socket();

  // Attach handlers for Seedlink
  this.attachSeedlinkHandlers();

}

SeedlinkProxy.prototype.attachSeedlinkHandlers = function() {

  /* Function SeedlinkProxy.attachSeedlinkHandlers
   * Adds listeners to TCP socket callbacks
   */

  const SEEDLINK_OK = this.convertCommand("OK");
  const SL_RECORD_SIZE = 520;

  var message, buffer;

  // Connection refused by remote Seedlink server
  this.seedlinkSocket.on("error", function(error) {
    this.broadcast({"error": error})
  }.bind(this));

  // First connect: open a new empty data buffer
  this.seedlinkSocket.on("connect", function() {
    buffer = new Buffer(0);
  }.bind(this));

  // When data is received from the Seedlink TCP socket
  this.seedlinkSocket.on("data", function(data) {

    // Communicate the handshake with Seedlink
    if(data.equals(SEEDLINK_OK) && this._commands.length) {
      return this.handshake();
    }

    // Extend the buffer with newly returned data from Seedlink
    buffer = Buffer.concat([buffer, data]);

    // We have collected an 8-byte header and 512-byte body
    // which is representative of a full record that can be parsed
    if(buffer.length >= SL_RECORD_SIZE) {

      // Create a new record from the returned bytes, skip 8-bytes Seedlink header
      try {
        message = new mSEEDRecord(buffer.slice(8, SL_RECORD_SIZE)).payload();
      } catch(exception) {
        message = {"error": "Error unpacking mSEED record"};
      }

      // Broadcast the message to all connected sockets
      this.broadcast(message);

      // Slice buffer beyond the record end
      buffer = buffer.slice(SL_RECORD_SIZE);

    }

  }.bind(this));
 
  // Socket was closed, set connected to false
  this.seedlinkSocket.on("close", function() {
    this._connected = false;
  }.bind(this));

}

SeedlinkProxy.prototype.broadcast = function(object) {

 /* Function SeedlinkProxy.broadcast
  * Broadcasts a message over all connected sockets
  */

  // Write the unpacked mSEED to all connected sockets
  this._sockets.forEach(function(socket) {
    socket.emit("write", object);
  });

}

SeedlinkProxy.prototype.convertCommand = function(command) {

  /* Function SeedlinkProxy.convertCommand
   * Converts a string to a Seedlink command by appending CRNL
   */

  const CR = String.fromCharCode(13);
  const NL = String.fromCharCode(10);

  return new Buffer(command + CR + NL, "ascii");

}

SeedlinkProxy.prototype.getStreamCommands = function(selectors) {

  /* Function SeedlinkProxy.getStreamCommands
   * Returns list of commands in reverse order to write to Seedlink
   */

  var commands = new Array("END");

  // Correct Seedlink handshake
  selectors.forEach(function(stream) {
    commands.push("DATA");
    commands.push("SELECT " + stream.location + stream.channel + ".D");
    commands.push("STATION " + stream.station + " " + stream.network);
  });

  // Convert to Seedlink commands
  return commands.map(this.convertCommand);

}

SeedlinkProxy.prototype.disconnect = function() {

  /* Function SeedlinkProxy.disconnect
   * Gracefully disconnects from the remote Seedlink server
   */

  const SEEDLINK_BYE = this.convertCommand("BYE");

  this.seedlinkSocket.write(SEEDLINK_BYE);
  this.seedlinkSocket.destroy();

}

SeedlinkProxy.prototype.removeSocket = function(socket) {

  /* Function SeedlinkProxy.removeSocket
   * Removes a listening socket from the proxy
   */

  if(this._sockets.length === 0) {
    return;
  }

  // Remove the socket from the list
  var index = this._sockets.indexOf(socket);

  // Does not exist in the list
  if(index === -1) {
    return;
  }

  this._sockets.splice(index, 1);

  socket.emit("write", {"success": "Unsubscribed from channel " + this.name + "."});

  // Disconnect the proxy if no users are present
  if(this._connected && this._sockets.length === 0) {
    this.disconnect();
  }

}

SeedlinkProxy.prototype.addSocket = function(socket) {

  /* Function SeedlinkProxy.addSocket
   * If not exists adds listening socket to the proxy
   */

  if(!this._sockets.includes(socket)) {
    this._sockets.push(socket);
  }

  socket.emit("write", {"success": "Subscribed to channel " + this.name + "."});

  // Attempt to connect
  this.connect();

}

SeedlinkProxy.prototype.connect = function() {

  /* Function SeedlinkProxy.connect
   * Connects to the remote Seedlink server
   */

  // Do not connect twice
  if(this._connected) {
    return;
  }

  this._connected = true;

  // Get the list of commands (copy in memory)
  this._commands = this.commands.map(x => x);

  // Connect to the particular TCP Seedlink socket
  this.seedlinkSocket.connect(this.port, this.host, this.handshake.bind(this)); 

}

SeedlinkProxy.prototype.handshake = function() {

  /* Function SeedlinkProxy.handshake
   * Initiates the handshake with Seedlink
   */

  // Write command as handshake
  this.seedlinkSocket.write(this._commands.pop());

}

module.exports = SeedlinkProxy;
