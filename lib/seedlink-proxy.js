/*
 * NodeJS Seedlink Proxy
 *
 * Wrapper class for a single Seedlink proxy
 *
 * Copyright: ORFEUS Data Center, 2019
 * Author: Mathijs Koymans
 * Licensed under MIT
 *
 */

"use strict";

const CONFIG = require("./config");

const SeedlinkProxy = function(options) {

  /*
   * Class SeedlinkProxy
   * Single entity of a Seedlink proxy that can connect to a
   * remote Seedlink server and broadcast unpacked data samples
   */

  const { Socket } = require("net");

  // Class privates
  this.__connected = false;
  this.__clients = new Set();
  this.__buffer = Buffer.alloc(0);

  // Copy the channel configuration options
  this.name = options.name;
  this.host = options.host;
  this.port = Number(options.port) || 18000;
  this.selectors = options.selectors;

  // Create the Seedlink handshake from the selectors
  this.commands = this.getStreamCommands();

  // Create the TCP socket to connect to Seedlink with
  this.seedlinkSocket = new Socket();

  // Attach handlers for Seedlink
  this.attachSocketEvents();

}

SeedlinkProxy.prototype.sliceBuffer = function(offset) {

  /*
   * Function SeedlinkProxy.sliceBuffer
   * Slics the internal buffer to a certain offset
   */

  this.__buffer = this.__buffer.slice(offset);

}

SeedlinkProxy.prototype.extendBuffer = function(data) {

  /*
   * Function SeedlinkProxy.extendBuffer
   * Extends the internal buffer with new data
   */

  this.__buffer = Buffer.concat([this.__buffer, data]);

}

SeedlinkProxy.prototype.attachSocketEvents = function() {

  /*
   * Function SeedlinkProxy.attachSocketEvents
   * Adds listeners to TCP socket callbacks
   */

  // Connection was refused by remote Seedlink server
  this.seedlinkSocket.on("error", (error) => this.broadcast(error));

  // First connect: open a new empty data buffer
  this.seedlinkSocket.on("connect", () => this.__buffer = Buffer.alloc(0));

  // When data is received from the Seedlink TCP socket
  this.seedlinkSocket.on("data", this.handleData.bind(this));
 
  // Socket was closed, set connected to false
  this.seedlinkSocket.on("close", this.handleClose.bind(this));

}

SeedlinkProxy.prototype.handleData = function(data) {

  /*
   * Function SeedlinkProxy.handleData
   * Handles Net.Socket data event
   */

  const SL_OK = this.asCommand("OK");
  const SL_ERR = this.asCommand("ERROR");

  const SL_HEADER_SIZE = 8;
  const SL_PACKET_SIZE = 520;

  // Extend the buffer with newly returned data from Seedlink
  this.extendBuffer(data);

  // Error was received: close the TCP connection
  if(this.__buffer.slice(0, SL_ERR.length).equals(SL_ERR)) {
    return this.disconnect();
  }

  // Continue to communicate the handshake with Seedlink
  if(this.__buffer.slice(0, SL_OK.length).equals(SL_OK)) {

    // Remove the OK prefix from the buffer
    this.sliceBuffer(SL_OK.length);

    if(this.__commands.length) {
      return this.handshake();
    }

  }

  // While there are valid mSEED records in the buffer
  while(this.__buffer.length >= SL_PACKET_SIZE) {

    // We have collected an 8-byte header and 512-byte body
    // which is representative of a full record that can be parsed
    // Create a new record from the returned bytes, skip 8-bytes Seedlink header
    this.broadcast(this.unpackRecord(this.__buffer.slice(SL_HEADER_SIZE, SL_PACKET_SIZE)));

    // Slice buffer beyond the record end
    this.sliceBuffer(SL_PACKET_SIZE);

  }

}

SeedlinkProxy.prototype.handleClose = function() {

  /*
   * Function SeedlinkProxy.handleClose
   * Handles Net.Socket closing event
   */

  this.__connected = false;

  // Stop if we want to auto reconnect after a close
  if(CONFIG.RECONNECT_INTERVAL_MS === 0) {
    return;
  }

  // Schedule next connection
  setTimeout(this.connect.bind(this), CONFIG.RECONNECT_INTERVAL_MS);

}

SeedlinkProxy.prototype.unpackRecord = function(buffer) {

 /*
  * Function SeedlinkProxy.unpackRecord
  * Unpacks binary mSEED record using libmseedjs
  */

  const mSEEDRecord = require("libmseedjs");

  // May fail as a result of invalid mSEED
  try {
    return new mSEEDRecord(buffer).payload();
  } catch(exception) {
    return new Error("Fatal exception occured unpacking mSEED record.");
  }

}

SeedlinkProxy.prototype.broadcast = function(object) {

 /*
  * Function SeedlinkProxy.broadcast
  * Broadcasts a message over all connected sockets
  */

  // Write the unpacked mSEED to all connected clients
  this.__clients.forEach(socket => socket.emit("write", object));

}

SeedlinkProxy.prototype.asCommand = function(command) {

  /*
   * Function SeedlinkProxy.asCommand
   * Converts a string to a Seedlink command by appending CRNL
   */

  // Must be ended with carriage return and new line feed
  const CR = String.fromCharCode(13);
  const NL = String.fromCharCode(10);

  return Buffer.from(command + CR + NL, "ascii");

}

function getPastTime(ms) {

  /*
   * Function SeedlinkProxy.getStreamCommands::getPastTime
   * Returns the time for Seedlink ten minutes in the past
   */

  function padZero(string) {

    // Only pad single digit numbers
    if(string.length === 1) {
      return "0" + string;
    }

    // Pad with a single leading zero
    return string;

  }

  // Subtract ten minutes from now
  const now = new Date(Date.now() - ms);

  // Seedlink format YYYY,MM,DD,HH,MM
  return new Array(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes()
  ).map(String).map(padZero).join(",");

}

SeedlinkProxy.prototype.getStreamCommands = function() {

  /*
   * Function SeedlinkProxy.getStreamCommands
   * Returns list of commands in REVERSE  order to write to Seedlink
   */

  var commands = new Array("END");

  // Correct Seedlink handshake.. set the sequence number to 000000
  this.selectors.forEach(function(stream) {

    // When set to 0 prefilling is disabled
    // Otherwise request data from Seedlink in the past
    if(CONFIG.PREFILL === 0) {
      commands.push("DATA");
    } else {
      commands.push("DATA 000000 " + getPastTime(CONFIG.PREFILL));
    }

    // Continue with multi station select
    commands.push("SELECT " + stream.location + stream.channel);
    commands.push("STATION " + stream.station + " " + stream.network);

  });

  // Convert to Seedlink commands
  return commands.map(this.asCommand);

}

SeedlinkProxy.prototype.disconnect = function() {

  /*
   * Function SeedlinkProxy.disconnect
   * Gracefully disconnects from the remote Seedlink server
   */

  const SL_BYE = this.asCommand("BYE");

  // Disconnect from the socket
  this.seedlinkSocket.write(SL_BYE);
  this.seedlinkSocket.destroy();

}

SeedlinkProxy.prototype.removeSocket = function(socket) {

  /*
   * Function SeedlinkProxy.removeSocket
   * Removes a socket from the list of connected sockets
   */

  // Remove the socket from the set
  this.__clients.delete(socket);

  socket.emit("write", "Unsubscribed from channel " + this.name + ".");

  // Disconnect the proxy if no users are present
  if(this.__connected && this.__clients.size === 0) {
    this.disconnect();
  }

}

SeedlinkProxy.prototype.addSocket = function(socket) {

  /*
   * Function SeedlinkProxy.addSocket
   * If not exists adds listening socket to the proxy
   */

  // Add client to the set
  this.__clients.add(socket);

  socket.emit("write", "Subscribed to channel " + this.name + ".");

  // Attempt to connect to the remote seedlink server
  this.connect();

}

SeedlinkProxy.prototype.connect = function() {

  /*
   * Function SeedlinkProxy.connect
   * Connects to the remote Seedlink server
   */

  // The socket is already connected
  if(this.__connected) {
    return;
  }

  // No clients are connected
  if(this.__clients.size === 0) {
    return;
  }

  // Get the list of commands (make a copy)
  this.__commands = this.commands.map(x => x);

  // Connect to the particular TCP Seedlink socket
  this.seedlinkSocket.connect(this.port, this.host, function() {
    this.__connected = true;
    this.handshake();
  }.bind(this)); 

}

SeedlinkProxy.prototype.handshake = function() {

  /*
   * Function SeedlinkProxy.handshake
   * Initiates the handshake with Seedlink
   */

  // Write the command to proceed with the handshake
  this.seedlinkSocket.write(this.__commands.pop());

}

module.exports = SeedlinkProxy;
