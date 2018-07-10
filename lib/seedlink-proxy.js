"use strict";

const network = require("net");
const mSEEDRecord = require("libmseedjs");

const SeedlinkProxy = function(options) {

  /* Class SeedlinkProxy
   * Single entity of a Seedlink proxy that can connect to a
   * remote Seedlink server and broadcast unpacked data samples
   */

  const SEEDLINK_OK = this.convertCommand("OK");

  // Privates
  this._connected = false;
  this._sockets = new Array();

  // Save a reference to the particular room

  // Copy options
  this.name = options.name;
  this.host = options.host;
  this.port = options.port;
  this.selectors = options.selectors;

  this.bufferedDisconnect = null;
  this.buffer = new Buffer(0);

  // Create the TCP socket
  this.socket = new network.Socket();

  // Connection refused
  this.socket.on("error", function(error) {
    console.log("error");
  });

 // When data is received from the Seedlink TCP socket
 this.socket.on("data", function(data) {

   // Communicate the handshake with Seedlink
   if(data.equals(SEEDLINK_OK) && this.commands.length) {
     return this.socket.write(this.commands.pop());
   }

   // Extend the buffer with newly returned data from Seedlink
   this.buffer = Buffer.concat([this.buffer, data]);

   // We have collected an 8-byte header and 512-byte body
   // which is representative of a full record that can be parsed
   if(this.buffer.length >= 520) {

     // Create a new record from the returned bytes, skip 8-header bytes
     try {
       this.broadcast(new mSEEDRecord(this.buffer.slice(8, 520)).Payload());
     } catch(exception) {
       this.buffer = new Buffer(0);
     }

     this.buffer = this.buffer.slice(520);

   }

 }.bind(this));
 
 // Socket was closed, set conneced to false
 this.socket.on("close", function() {
   this._connected = false;
 }.bind(this));

}

SeedlinkProxy.prototype.broadcast = function(json) {

 // Write the unpacked mSEED to all connected sockets
 this._sockets.forEach(function(socket) {
   socket.send(JSON.stringify(json));
 });

}

SeedlinkProxy.prototype.convertCommand = function(command) {

  /* Function SeedlinkProxy.convertCommand
   * Converts a string to a Seedlink command by appending CRNL
   */

  return new Buffer(command + String.fromCharCode(13) + String.fromCharCode(10), "ascii");

}

SeedlinkProxy.prototype.getStreamCommands = function() {

  /* Function SeedlinkProxy.getStreamCommands
   * Returns list of commands in reverse order to write to Seedlink
   */

  var commands = new Array("END");

  this.selectors.forEach(function(stream) {
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

  this.socket.write(SEEDLINK_BYE);
  this.socket.destroy();

}

SeedlinkProxy.prototype.connect = function() {

  /* Function SeedlinkProxy.connect
   * Connects to the remote Seedlink server
   */

  // Connect to the particular TCP Seedlink socket
  this.socket.connect(this.port, this.host, function() {

    this._connected = true;

    // Get a list of commands to write to Seedlink
    this.commands = this.getStreamCommands();

    // Write the first command
    this.socket.write(this.commands.pop());

  }.bind(this));

}

module.exports = SeedlinkProxy;
