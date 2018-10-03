/*
 * NodeJS Seedlink Proxy test
 *
 * Code that initializes the test suite
 *
 * Copyright: ORFEUS Data Center, 2018
 * Author: Mathijs Koymans
 * Licensed under MIT
 *
 */

"use strict";

require("./require");

if(require.main === module) {

  var { Server } = require("./lib/seedlink-websocket");
  var configuration = require("./config");

  // Set debug to false
  configuration.__DEBUG__ = false;

  new Server(configuration, function() {

    console.log(this.name + " microservice has been started on " + this.host + ":" + this.port);

    // Run all tests and close the socket at the end
    runTests(Object.values(require("./test/testSuite")), this.close.bind(this));

  });

}

function runTests(testSuite, callback) {

  /*
   * Function runTests
   * Runs an array of asynchronous tests in sequence
   */

  var next, currentTest;
  var nTests = testSuite.length;

  console.log("Begin running test suite with " + nTests + " tests.");

  (next = function() {

    var start = Date.now();

    // No more tests to run
    if(testSuite.length === 0) {
      return callback();
    }

    // Pop the next test off the stack and execute
    currentTest = testSuite.pop();

    currentTest(function(error) {

      // One test has failed
      if(error) {
        throw(currentTest.name + " " + error.stack);
      }

      console.log(currentTest.name + " succesfully completed in " + (Date.now() - start) + "ms.");

      // Proceed with the next test
      next();

    });

  })();

}
