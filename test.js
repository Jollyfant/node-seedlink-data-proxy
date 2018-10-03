"use strict";

if(require.main === module) {

  var Seedlink = require("./index");
  var configuration = require("./config");

  // Set debug to false
  configuration.__DEBUG__ = false;

  var SeedlinkSocket = new Seedlink.server(configuration, function(name, host, port) {
    console.log(name + " microservice has been started on " + host + ":" + port);
  });

  // Run all tests
  runTests(Object.values(require("./testSuite")), finish);

}

function runTests(tests, callback) {

  /*
   * Function runTests
   * Runs an array of asynchronous tests in sequence
   */

  var next;
  var nTests = tests.length;
  var start = Date.now();

  (next = function() {

    // No more tests to run
    if(tests.length === 0) {
      return finish(nTests, Date.now() - start);
    }

    tests.pop()(function(error) {

      if(error) {
        throw(error);
      }

      // Proceed with the next test
      next();

    });

  })();

}

function finish(n, time) {

  /*
   * Function finish
   * Finishes the test suite
   */

  SeedlinkSocket.close(function() {
    console.log("The test suite has succesfully ran " + n + " tests in " + time + "ms.");
  });

}
