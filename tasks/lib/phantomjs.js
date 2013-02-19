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

    exports.phantomjs = function(options)
    {
        return grunt.util.spawn(
            {
                cmd: 'phantomjs',
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
                grunt.log.write('Running PhantomJS...').error();
                if (code === 127)
                {
                    grunt.log.errorlns(
                        'In order for this task to work properly, PhantomJS must be ' +
                            'installed and in the system PATH (if you can run "phantomjs" at' +
                            ' the command line, this task should work). Unfortunately, ' +
                            'PhantomJS cannot be installed automatically via npm or grunt. ' +
                            'See the grunt FAQ for PhantomJS installation instructions: ' +
                            'https://github.com/cowboy/grunt/blob/master/docs/faq.md'
                    );
                    grunt.warn('PhantomJS not found.', options.code);
                }
                else
                {
                    result.split('\n').forEach(grunt.log.error, grunt.log);
                    grunt.warn('PhantomJS exited unexpectedly with exit code ' + code + '.', options.code);
                }
                options.done(code);
            });
    };

    return exports;
};