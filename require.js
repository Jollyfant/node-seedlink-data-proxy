/*
 * NodeJS Require Patch 
 *
 * Patches the default require function to support
 * relative imports from the root directory
 *
 * Author: Mathijs Koymans, 2018
 * Copyright: ORFEUS Data Center
 * License: MIT
 *
 */

const path = require("path");

// Capture the require function in a closure
module.constructor.prototype.require = (function(closure) {

  // Relative ("./lib/something") or native module (e.g. http)
  // Skip all node_modules includes from dependencies
  return function(importPath) {
    if(!this.filename.includes("node_modules") && importPath.startsWith(".")) {
      return closure.call(this, path.join(__dirname, importPath));
    } else {
      return closure.call(this, importPath);
    }
  }

})(module.constructor.prototype.require);
