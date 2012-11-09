/*global module:false*/
module.exports = function(grunt) {
  "use strict";

  // Project configuration.
  grunt.initConfig({
    "qunit-cov": {
      test:{
        minimum: 0.9,
        srcDir: 'examples/src',
        depDirs: ['examples/lib', 'examples/test'],
        outDir: 'examples/cov',
        testFiles: ['examples/test/*.html']
      }
    }
  });

  // Default task.
  grunt.loadTasks('tasks');
  grunt.registerTask('default', 'qunit-cov');

};
