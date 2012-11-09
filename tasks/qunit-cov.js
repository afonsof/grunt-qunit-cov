/*
 * grunt
 * https://github.com/cowboy/grunt
 *
 * Copyright (c) 2012 "Cowboy" Ben Alman
 * Licensed under the MIT license.
 * http://benalman.com/about/license/
 */

 // Nodejs libs.
var fs = require('fs');
var path = require('path');
var wrench = require('wrench');

module.exports = function(grunt)
{
    var status = {failed: 0, passed: 0, total: 0, duration: 0, coverage: {}};

    // Keep track of the last-started module, test and status.
    var currentModule, currentTest;
    // Keep track of the last-started test(s).
    var unfinished = {};

    // Allow an error message to retain its color when split across multiple lines.
    function formatMessage(str)
    {
        return String(str).split('\n').map(function(s) { return s.magenta; }).join('\n');
    }

    // Keep track of failed assertions for pretty-printing.
    var failedAssertions = [];
    function logFailedAssertions()
    {
        var assertion;
        // Print each assertion error.
        while (assertion = failedAssertions.shift())
        {
            grunt.verbose.or.error(assertion.testName);
            grunt.log.error('Message: ' + formatMessage(assertion.message));
            if (assertion.actual !== assertion.expected)
            {
                grunt.log.error('Actual: ' + formatMessage(assertion.actual));
                grunt.log.error('Expected: ' + formatMessage(assertion.expected));
            }
            if (assertion.source)
            {
                grunt.log.error(assertion.source.replace(/ {4}(at)/g, '  $1'));
            }
            grunt.log.writeln();
        }
    }

    // Handle methods passed from PhantomJS, including QUnit hooks.
    var phantomHandlers = 
    {
        // QUnit hooks.
        moduleStart: function(name)
        {
            unfinished[name] = true;
            currentModule = name;
        },
        moduleDone: function(name, failed, passed, total)
        {
            delete unfinished[name];
        },
        log: function(result, actual, expected, message, source)
        {
            if (!result)
            {
                failedAssertions.push({
                    actual: actual, expected: expected, message: message, source: source,
                    testName: currentTest
                });
            }
        },
        testStart: function(name)
        {
            currentTest = (currentModule ? currentModule + ' - ' : '') + name;
            grunt.verbose.write(currentTest + '...');
        },
        testDone: function(name, failed, passed, total)
        {
            // Log errors if necessary, otherwise success.
            if (failed > 0)
            {
                // list assertions
                if (grunt.option('verbose'))
                {
                    grunt.log.error();
                    logFailedAssertions();
                }
                else 
                {
                    grunt.log.write('F'.red);
                }
            }
            else 
            {
                grunt.verbose.ok().or.write('.');
            }
        },
        done: function(failed, passed, total, duration, coverage)
        {
            status.failed += failed;
            status.passed += passed;
            status.total += total;
            status.duration += duration;
          
            if( coverage )
            {
                for(var key in coverage)
                {
                    if(!status.coverage[key])
                    {
                        status.coverage[key] = coverage[key];
                    }
                    else
                    {
                        var globalCoverage = status.coverage[key];
                        var localCoverage = coverage[key];
                        
                        for(var i = 0; i < localCoverage.length; i++)
                        {
                            if(localCoverage[i] !== null && globalCoverage[i] !== null)
                            {
                                globalCoverage[i] += localCoverage[i];
                            }
                        }
                    }
                }
            }   
      
            // Print assertion errors here, if verbose mode is disabled.
            if (!grunt.option('verbose'))
            {
                if (failed > 0) 
                {
                    grunt.log.writeln();
                    logFailedAssertions();
                } 
                else
                {
                    grunt.log.ok();
                }
            }
        },
        // Error handlers.
        done_fail: function(url) 
        {
            grunt.verbose.write('Running PhantomJS...').or.write('...');
            grunt.log.error();
            grunt.warn('PhantomJS unable to load "' + url + '" URI.', 90);
        },
        done_timeout: function()
        {
            grunt.log.writeln();
            grunt.warn('PhantomJS timed out, possibly due to a missing QUnit start() call.', 90);
        },
        // console.log pass-through.
        console: console.log.bind(console),
        // Debugging messages.
        debug: grunt.log.debug.bind(grunt.log, 'phantomjs')
    };

    // ==========================================================================
    // TASKS
    // ==========================================================================

    grunt.registerMultiTask('qunit-cov', 'Run QUnit unit tests in a headless PhantomJS instance.', function()
    {
        // This task is asynchronous.
        var done = this.async();

        minimum = this.data.minimum ? this.data.minimum : 0.8;
        srcDir = this.data.srcDir;
        outDir = this.data.outDir;
        depDirs = this.data.depDirs;
        testFiles = this.data.testFiles;
        baseDir = this.data.baseDir;
        // Reset status.
        
        if(fs.existsSync(outDir))
        {
            wrench.rmdirSyncRecursive(outDir);
        }
        if(!fs.existsSync(outDir))
        {
            fs.mkdirSync(outDir);
        }
        if(!fs.existsSync(outDir + '/in/'))
        {
            fs.mkdirSync(outDir + '/in/');
            if(baseDir) {
                fs.mkdirSync(outDir + '/in/' + baseDir + '/');
            }
        }
        
        for(var i = 0; i < depDirs.length; i++)
        {
            var dir = depDirs[i];
            grunt.verbose.writeln('Copy dir ' + dir + ' to ' + outDir + '/in/' + dir);
            wrench.mkdirSyncRecursive(outDir + '/in/' + dir);
            wrench.copyDirSyncRecursive(dir, outDir + '/in/' + dir, {preserve: true});
        }
    
        grunt.log.write('Instrumenting folder \'' + srcDir + '\' to ' + outDir + '/in/' + srcDir + '...');
            
        grunt.helper('jscoverage',
        {
            code: 90,
            args: [
                    srcDir,
                    outDir + '/in/' + srcDir
                ],
            done: function(err)
            {
                grunt.log.ok();
               
                // Get files as URLs.
                var urls = grunt.file.expandFileURLs(outDir + '/in/' + testFiles);

                // Process each filepath in-order.
                grunt.utils.async.forEachSeries(urls, function(url, next)
                {
                    var basename = path.basename(url);
                    grunt.verbose.subhead('Testing ' + basename).or.write('Testing ' + basename);

                    // Create temporary file to be used for grunt-phantom communication.
                    var tempfile = outDir + '/out/out.temp';
                    if(fs.existsSync(tempfile))
                    {
                        fs.unlinkSync(tempfile);
                    }
                    grunt.file.write(tempfile, "");
                    // Timeout ID.
                    var id;
                    // The number of tempfile lines already read.
                    var n = 0;

                    // Reset current module.
                    currentModule = null;

                    // Clean up.
                    function cleanup()
                    {
                        clearTimeout(id);
                    }

                    // It's simple. As QUnit tests, assertions and modules begin and complete,
                    // the results are written as JSON to a temporary file. This polling loop
                    // checks that file for new lines, and for each one parses its JSON and
                    // executes the corresponding method with the specified arguments.
                    (function loopy()
                    {
                        // Disable logging temporarily.
                        grunt.log.muted = true;
                        // Read the file, splitting lines on \n, and removing a trailing line.
                        var lines = grunt.file.read(tempfile).split('\n').slice(0, -1);
                        // Re-enable logging.
                        grunt.log.muted = false;
                        // Iterate over all lines that haven't already been processed.
                        var done = lines.slice(n).some(function(line)
                        {
                            // Get args and method.
                            var args = JSON.parse(line);
                            var method = args.shift();
                            // Execute method if it exists.
                            if (phantomHandlers[method])
                            {
                                phantomHandlers[method].apply(null, args);
                            }
                            // If the method name started with test, return true. Because the
                            // Array#some method was used, this not only sets "done" to true,
                            // but stops further iteration from occurring.
                            return (/^done/).test(method);
                        });

                        if (done)
                        {
                            // All done.
                            cleanup();
                            next();
                        }
                        else 
                        {
                            // Update n so previously processed lines are ignored.
                            n = lines.length;
                            // Check back in a little bit.
                            id = setTimeout(loopy, 100);
                        }
                    }());
                    
                    // Launch PhantomJS.
                    grunt.helper('phantomjs',
                    {
                        code: 90,
                        args: [
                                grunt.task.getFile('qunit-cov/phantom.js'),
                                tempfile,
                                grunt.task.getFile('qunit-cov/qunit.js'),
                                url,
                                '--config=' + grunt.task.getFile('qunit-cov/phantom.json')
                            ],
                        done: function(err)
                        {
                            if (err)
                            {
                                cleanup();
                                done();
                            }
                        }
                    });
                },
            
                function(err)
                {
                    // All tests have been run.
                    PrintCoverage(status.coverage, minimum, srcDir, outDir);
                    
                    // Log results.
                    if (status.failed > 0)
                    {
                        grunt.warn(status.failed + '/' + status.total + ' assertions failed (' +
                        status.duration + 'ms)', Math.min(99, 90 + status.failed));
                    }
                    else 
                    {
                        grunt.verbose.writeln();
                        grunt.log.ok(status.total + ' assertions passed (' + status.duration + 'ms)');
                    }
                    // All done!
                    done();
                });
            }
        });
    });

    // ==========================================================================
    // HELPERS
    // ==========================================================================

    grunt.registerHelper('phantomjs', function(options)
    {
        return grunt.utils.spawn(
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
    });
    
    grunt.registerHelper('jscoverage', function(options)
    {
        return grunt.utils.spawn(
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
    });
    
    function PrintCoverage(coverageInfo, minimum, srcDir, outDir)
    {
        var totalCovered = 0, totalUncovered = 0;
        var coverageBase = grunt.file.read(grunt.task.getFile('qunit-cov/cov.tmpl')).toString();
        
        var filesCoverage = {};        
        
        var files = grunt.file.expandFiles(srcDir + '/**/*.js');
            
        for(var i=0; i < files.length; i++)
        {
            var file = files[i];
            var relativeFile = file.substr(srcDir.length + 1);
            
            grunt.log.writeln('reading ' + file);
            
            var colorized = '';
            var covered = 0;
            var uncovered = 0;
            var lineCoverage = coverageInfo[relativeFile];
            var fileLines = grunt.file.read(file).split(/\r?\n/);
            
            for (var idx=0; idx < fileLines.length; idx++)
            {
                var hitmiss = ' nottested';
                if(lineCoverage)
                {
                    //+1: coverage lines count from 1.
                    var cvg = lineCoverage[idx + 1];
                    var hitmiss = '';
                    if (typeof cvg === 'number')
                    {
                        if( cvg > 0 )
                        {
                            hitmiss = ' hit';
                            covered++;
                        }
                        else
                        {
                            hitmiss = ' miss';
                            uncovered++;
                        }
                    }
                    else
                    {
                        hitmiss = ' undef';
                    }
                }
                var htmlLine = fileLines[idx].replace('<', '&lt;').replace('>', '&gt;');
                colorized += '<div class="code' + hitmiss + '">' + htmlLine + '</div>\n';
                filesCoverage[relativeFile] = { covered: covered, uncovered: uncovered };
            }
            
            grunt.log.writeln(covered + " - " + uncovered);
            
            colorized = coverageBase.replace('COLORIZED_LINE_HTML', colorized);            
            var coverageOutputFile = outDir + '/out/' + relativeFile + '.html';
            grunt.file.write(coverageOutputFile, colorized);
            
            totalCovered += covered;
            totalUncovered += uncovered;
            
            if (grunt.option('verbose'))
            {
                grunt.log.writeln('Coverage for ' + key + ' in ' + coverageOutputFile);            
            }
        }
        var totalPercent = totalCovered / (totalCovered + totalUncovered);
        grunt.log.writeln(totalCovered + " - " + totalUncovered);
        
        var html = '<h2>Total Coverage</h2><table>';
        html += printCoverageLine('', totalCovered, totalUncovered, true);       
        html += '</table>';
        
        html += '<h2>Detailed Coverage</h2><table>';
        
        var covHtml = '';
        var uncovHtml = '';
        
        for(var key in filesCoverage)
        {
            var fileCoverage = filesCoverage[key];
            
            if(fileCoverage.covered == 0 && fileCoverage.uncovered == 0)
            {
                uncovHtml+= printCoverageLine(key, fileCoverage.covered, fileCoverage.uncovered);
            }
            else
            {
                covHtml+= printCoverageLine(key, fileCoverage.covered, fileCoverage.uncovered);
            }
        }
        html += covHtml + '</table><table><h2>Uncovered Files</h2>' + uncovHtml + '</table>';
        

        
        grunt.file.write(outDir + '/out/coverage.html', html);
        
        
        grunt.log.writeln('Coverage in ' + parseInt(totalPercent*100, 10) + '%');
        if( totalPercent < minimum)
        {
            grunt.warn('Error: Coverage don\'t reach ' + (minimum*100) + '%');  
        }
    }
    
    function printCoverageLine(file, covered, uncovered, doNotShowLink)
    {
        var percent = parseInt(100 * covered / (covered + uncovered), 10);
        
        var link = file;
        if(!doNotShowLink)
        {
            link = '<a href="' + file + '.html">' + file +'</a>';
        }
        if( covered == 0 && uncovered == 0 )
        {
            return '<tr><td width="150" bgcolor="#990000"></td><td width="right" align="left"><strong>0%</strong></td><td>' + link +'</td></tr>';
        }
        return '<tr><td width="150"><table width="100%" border="0" cellpadding="0" cellspacing="0"><tbody><tr><td width="' + percent + '%" bgcolor="#00CC33">&nbsp;</td><td width=" '+ 100 + percent + '%" bgcolor="#990000"></td></tr></tbody></table></td><td width="25" align="right"><strong>' + percent+ '%</strong></td><td>' + link + '</td></tr>';
    }



}
