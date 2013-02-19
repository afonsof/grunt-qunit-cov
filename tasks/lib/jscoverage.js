/*
 * grunt
 * https://github.com/cowboy/grunt
 *
 * Copyright (c) 2012 "Cowboy" Ben Alman
 * Licensed under the MIT license.
 * http://benalman.com/about/license/
 */

exports.init = function (grunt) {
    var exports = {};

    exports.jscoverage = function(options)
    {
        return grunt.util.spawn(
            {
                cmd: 'jscoverage',
                args: options.args
            },

            function(err, result, code)
            {
                if (!err)
                {
                    return options.done(null);
                }
                // Something went horribly wrong.
                grunt.verbose.or.writeln();
                grunt.log.write('Running JsCoverage...').error();
                if (code === 127)
                {
                    grunt.log.errorlns(
                        'In order for this task to work properly, JsCoverage must be ' +
                            'installed and in the system PATH (if you can run "jscoverage" at' +
                            ' the command line, this task should work)'
                    );
                    grunt.warn('JsCoverage not found.', options.code);
                }
                else
                {
                    result.split('\n').forEach(grunt.log.error, grunt.log);
                    grunt.warn('JsCoverage exited unexpectedly with exit code ' + code + '.', options.code);
                }
                options.done(code);
            });
    };

    return exports;
};