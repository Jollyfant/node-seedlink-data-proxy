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

if(require.main === module) {

  var Seedlink = require("./index");
  var configuration = require("./config");

  // Set debug to false
  configuration.__DEBUG__ = false;

  var SeedlinkSocket = new Seedlink.server(configuration);

  // Run all tests and close the socket at the end
  runTests(Object.values(require("./testSuite")), SeedlinkSocket.close.bind(SeedlinkSocket));

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

      if(error) {
        throw(currentTest.name + " " + error.stack);
      }

      console.log(currentTest.name + " succesfully completed in " + (Date.now() - start) + "ms.");

      // Proceed with the next test
      next();

    });

  })();

}
