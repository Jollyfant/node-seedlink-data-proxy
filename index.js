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

require("./require");

if(require.main === module) {

  const { Server } = require("./lib/seedlink-websocket");
  const configuration = require("./config");

  // Start the microservice
  new Server(configuration, function() {
    console.log(this.name + " microservice has been started on " + this.host + ":" + this.port);
  });

}
