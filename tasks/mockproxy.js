/*
 * mockproxy
 * 
 *
 * Copyright (c) 2015 Kristof Konings
 * Licensed under the MIT license.
 */

"use strict";

module.exports = function(grunt) {

  
  grunt.registerMultiTask("mockproxy", "mockproxy", function() {
    var globalConfig = {};
    globalConfig.backendUrl = "http://172.30.99.31:8080";
    globalConfig.portnr = "8081";
    globalConfig.portnrConfig = "8082";
    globalConfig.passThroughAll = false;

    var fs=require("fs");
    var q = require("q");
    var express = require("express");
    var bodyParser = require("body-parser");
    var app = express();
    var appConfig = express();
    var httpProxy = require("http-proxy");
    var proxy = httpProxy.createProxyServer({});
    var _ = require("underscore-node");
    var winston = require('winston');

    if(!fs.existsSync("mockdata/log")){
      fs.mkdirSync("mockdata/log", "0766", function(err){
        if(err){
          winston.error("ERROR! Can't make the mockdata/log directory! \n");
          cwinston.error(err);
        }
      });
    }

    var formidable = require("formidable");
    var postbucket = {};
    var putbucket = {};
    var deletebucket = {};

    function getParameter(args, name) {
      name = name + "=";
      if( name === undefined || name === "") { return undefined; }
      var returnValue;
      _.each(args, function(arg) {
        if(arg.substr(0,name.length) === name) {
          returnValue = arg.substr(name.length);
        }
      });
      return returnValue;
    }

    var configPortnr = grunt.config.get("portnr");
    var options = this.options({
          backendUrl: "http://172.30.99.66:8080",
          portnr: "8081",
          portnrConfig: "8082",
          passThroughAll: false
        });

    globalConfig.portnr = options.portnr;
    globalConfig.portnrConfig = options.portnrConfig;
    globalConfig.backendUrl = options.backendUrl;
    globalConfig.passThroughAll = options.passThroughAll;


    var argPortnr = getParameter(process.argv, "portnr");
    var argPortnrConfig = getParameter(process.argv, "portnrConfig");
    var argBackendUrl = getParameter(process.argv, "backendUrl");
    var argPassThroughAll = getParameter(process.argv, "passThroughAll");
    if (argPortnr !== undefined) {
      globalConfig.portnr = argPortnr;
    }
    if (argPortnrConfig !== undefined) {
      globalConfig.portnrConfig = argPortnrConfig;
    }
    if (argBackendUrl !== undefined) {
      globalConfig.backendUrl = argBackendUrl;
    }

    winston.add(winston.transports.File, { filename: 'mockdata/log/log-' + Date.now() + '-' + globalConfig.portnr + '.log' });

    if (argPassThroughAll !== undefined) {
      globalConfig.passThroughAll = argPassThroughAll;
    }

    winston.info("PassTroughAll: " + globalConfig.passThroughAll);

    function CreateMockDatabase () {
      var listeners = [];
      var mockData = { "GET": {},"POST": {},"PUT": {}};

      this.getMock = function (path, method) {
        path = path.replace(/(\?|\&)?noCache\=(.*)/g, "");
        winston.info("MockDatabase: getMock(): Get mock for " + method + " " + path);

        if(mockData[method][path]!==undefined) {
          winston.info("MockDatabase: getMock(): Return exact match for " + method + " " + path);
          return mockData[method][path];
        }
        else {
          var returndata;
          _.each(mockData[method], function(value){
            try {
              var regex = new RegExp(value.path);
              winston.info("MockDatabase: getMock(): Return regex match for " + method + " " + path + ": " + value.path);
              if(regex.test(path)) {
                returndata = value;
              }
            } catch(e) {
              console.log(e);
            }
          });

          if(returndata == undefined) {
              winston.error("MockDatabase: getMock(): No match for " + method + " " + path);
          }
          
          return returndata;
        }
      };
      this.getAllMocks = function () {
        winston.info("MockDatabase: getAllMocks()");
        return mockData;
      };
      this.setMock = function (path, method, mock, execListeners) {
        if(mockData[method]===undefined) { mockData[method]={}; }
        mockData[method][path] = mock;
        winston.info("MockDatabase: setMock(): Mock added for " + method + " " + path);
        if(execListeners !== false) {
          this.execListeners();
        }
      };
      this.updateMock = function (path, method, mock, execListeners) {
        if(mockData[method]===undefined) { mockData[method]={}; }
        mockData[method][path] = mock;
        winston.info("MockDatabase: updateMock(): Mock updated for " + method + " " + path);
        if(execListeners !== false) {
          this.execListeners();
        }
      };
      this.addListener = function (listener) {
        winston.info("MockDatabase: addListener(): Added listener");
        listeners.push(listener);
      };
      this.execListeners = function() {
        winston.info("MockDatabase: execListeners(): Execute " + listeners.length + " listeners");
        _.each(listeners, function(listener) {
          listener(mockData);
        });
      };
    }

    var mockDatabase = new CreateMockDatabase();











    function readMockdata () {

      var listofPromisses = [];
      var deferredReaddir = q.defer();

      listofPromisses.push(deferredReaddir.promise);

      fs.readdir("mockdata/",function (err, files){
        if(err) { throw err; }
        files.forEach(function(file){
          fs.stat("mockdata/" + file, function (err, stats) {
            if(stats.isFile(file)) {
              var deferredReadfile = q.defer();

              fs.readFile("mockdata/" + file, "utf8", function (err, data) {
                if (err) {
                  console.log("Error: " + err);
                  return;
                }
                deferredReadfile.resolve(JSON.parse(data));

              });
              fs.watchFile("mockdata/" + file, function(){
                console.log("Change:","File " + file + " changed.");
                fs.readFile("mockdata/" + file, "utf8", function (err, data) {
                  if (err) {
                    console.log("Error: " + err);
                    return;
                  }
                  data = JSON.parse(data);
                  mockDatabase.updateMock(data.path, data.method, data);

                });
              });
              listofPromisses.push(deferredReadfile.promise);
            }
          });
        });

        setTimeout(function() { deferredReaddir.resolve("done"); }, 100 );

      });

      return q.all(listofPromisses);

    }





    readMockdata().then(function(result) {


      // This code logs the log data in the temporary folder, so that this can be used to create mocking files
      if(!fs.existsSync("mockdata/tmp")){
        fs.mkdirSync("mockdata/tmp", "0766", function(err){
          if(err){
            winston.error("ERROR! Can't make the mockdata/tmp directory! \n");
            cwinston.error(err);
          }
        });
      }
      if(!fs.existsSync("mockdata/postbucket")){
        fs.mkdirSync("mockdata/postbucket", "0766", function(err){
          if(err){
            winston.error("ERROR! Can't make the mockdata/postbucket directory! \n");
            cwinston.error(err);
          }
        });
      }
      if(!fs.existsSync("mockdata/putbucket")){
        fs.mkdirSync("mockdata/putbucket", "0766", function(err){
          if(err){
            winston.error("ERROR! Can't make the mockdata/putbucket directory! \n");
            cwinston.error(err);
          }
        });
      }
      if(!fs.existsSync("mockdata/deletebucket")){
        fs.mkdirSync("mockdata/deletebucket", "0766", function(err){
          if(err){
            winston.error("ERROR! Can't make the mockdata/deletebucket directory! \n");
            cwinston.error(err);
          }
        });
      }



      winston.info("Mock data readed");

      for (var i = 0, len = result.length; i < len; i++) {
        if (q.isPromise(result[i])) {
          var mockdata = result[i].valueOf();
          mockDatabase.setMock(mockdata.path, mockdata.method, mockdata, false);
        }
      }

      mockDatabase.execListeners();



      app.delete("*", function(req, res){
        winston.info("Delete '" + req.path + "'");
        var form = new formidable.IncomingForm();

        form.parse(req, function(err, fields) {
          deletebucket[encodeURIComponent(req.path)] = fields;
          var datenow = Date.now();
          fs.writeFile("mockdata/deletebucket/" + encodeURIComponent(req.path) + "-" + datenow + ".json", JSON.stringify(fields, null, "\t"), function(err) {
            if(err) {
              console.log(err);
            } else {
              winston.info("Delete '" + req.path + "': Deletebucket file written: " + encodeURIComponent(req.path) + "-" + datenow + ".json");
            }
          });
        });

        var mock = mockDatabase.getMock(req.url, "DELETE");

        if(mock!==undefined && globalConfig.passThroughAll != true && mock.passThrough !== true) {
          winston.info("Delete '" + req.path + "': Going to mock call.");

          setTimeout(function () {
            winston.info("Delete '" + req.path + "': Delay = " + mock.delay);

            if(mock.useAlternative!== undefined && mock.useAlternative!== null) {
              res.header("Data source", "proxy server / " + mock.method + " / " + mock.useAlternative );
              res.header("Proxy source", globalConfig.portnr );
              if(mock.alternatives[mock.useAlternative].status !== undefined) {
                res.sendStatus(mock.alternatives[mock.useAlternative].status);
              }
              res.json(mock.alternatives[mock.useAlternative].responseData);
              winston.info("Delete '" + req.path + "': Response ( alternative " + mock.method + "'" + mock.useAlternative + "'): " +  req.url);

            } else {
              res.header("Data source", "proxy server / " + mock.method + " / normal" );
              res.header("Proxy source", globalConfig.portnr );
              res.json(mock.responseData);
              winston.info("Delete '" + req.path + "': Response ( normal ): " +  req.url);
            }
          }, mock.delay);

        } else {
          winston.info("Delete '" + req.path + "': Proxy request: " +  req.url + " to " + globalConfig.backendUrl);
          res.header("Data source", "passthrough");
          res.header("Proxy source", globalConfig.portnr );
          proxy.web(req, res, { target: globalConfig.backendUrl });
        }
      });

      app.post("*", function(req, res){
        winston.info("Post '" + req.path + "'");

        var form = new formidable.IncomingForm();

        form.parse(req, function(err, fields) {
          postbucket[encodeURIComponent(req.path)] = fields;
          var datenow = Date.now();
          fs.writeFile("mockdata/postbucket/" + encodeURIComponent(req.path) + "-" + datenow + ".json", JSON.stringify(fields, null, "\t"), function(err) {
            if(err) {
              console.log(err);
            } else {
              winston.info("Post '" + req.path + "': Postbucket file written: " + encodeURIComponent(req.path) + "-" + datenow + ".json");
            }
          });
        });

        var mock = mockDatabase.getMock(req.url, "POST");

        if(mock!==undefined && globalConfig.passThroughAll != true && mock.passThrough !== true) {
          winston.info("Post '" + req.path + "': Going to mock call.");

          setTimeout(function () {
            winston.info("Post '" + req.path + "': Delay = " + mock.delay);

            if(mock.useAlternative!== undefined && mock.useAlternative!== null) {
              res.header("Data source", "proxy server / " + mock.method + " / " + mock.useAlternative );
              res.header("Proxy source", globalConfig.portnr );
              if(mock.alternatives[mock.useAlternative].status !== undefined) {
                res.sendStatus(mock.alternatives[mock.useAlternative].status);
              }
              res.json(mock.alternatives[mock.useAlternative].responseData);
              winston.info("Post '" + req.path + "': Response ( alternative " + mock.method + "'" + mock.useAlternative + "'): " +  req.url);

            } else {
              res.header("Data source", "proxy server / " + mock.method + " / normal" );
              res.header("Proxy source", globalConfig.portnr );
              res.json(mock.responseData);
              winston.info("Post '" + req.path + "': Response ( normal ): " +  req.url);
            }
          }, mock.delay);

        } else {
          winston.info("Post '" + req.path + "': Proxy request: " +  req.url + " to " + globalConfig.backendUrl);
          res.header("Data source", "passthrough");
          res.header("Proxy source", globalConfig.portnr );
          proxy.web(req, res, { target: globalConfig.backendUrl });
        }
      });

      app.put("*", function(req, res){

        winston.info("Put '" + req.path + "'");

        var form = new formidable.IncomingForm();

        form.parse(req, function(err, fields) {
          putbucket[encodeURIComponent(req.path)] = fields;
          var datenow = Date.now();
          fs.writeFile("mockdata/putbucket/" + encodeURIComponent(req.path) + "-" + datenow + ".json", JSON.stringify(fields, null, "\t"), function(err) {
            if(err) {
              console.log(err);
            } else {
              winston.info("Put '" + req.path + "': Putbucket file written: " + encodeURIComponent(req.path) + "-" + datenow + ".json");
            }
          });
        });

        var mock = mockDatabase.getMock(req.url, "PUT");

        if(mock!==undefined && globalConfig.passThroughAll != true && mock.passThrough !== true) {
          setTimeout(function () {
            winston.info("Put '" + req.path + "': Delay = " + mock.delay);

            if(mock.useAlternative!== undefined && mock.useAlternative!== null) {
              res.header("Data source", "proxy server / " + mock.method + " / " + mock.useAlternative );
              res.header("Proxy source", globalConfig.portnr );
              if(mock.alternatives[mock.useAlternative].status !== undefined) {
                res.sendStatus(mock.alternatives[mock.useAlternative].status);
              }
              res.json(mock.alternatives[mock.useAlternative].responseData);
              winston.info("Put '" + req.path + "': Response ( alternative " + mock.method + "'" + mock.useAlternative + "'): " +  req.url);

            } else {
              res.header("Data source", "proxy server / " + mock.method + " / normal" );
              res.header("Proxy source", globalConfig.portnr );
              res.json(mock.responseData);
              winston.info("Put '" + req.path + "': Response ( normal ): " +  req.url);
            }
          }, mock.delay);

        } else {
          winston.info("Put '" + req.path + "': Proxy request: " +  req.url + " to " + globalConfig.backendUrl);
          res.header("Data source", "passthrough");
          res.header("Proxy source", globalConfig.portnr );
          proxy.web(req, res, { target: globalConfig.backendUrl });
        }
      });

      proxy.on("proxyReq", function(proxyReq, req, res) {
        var oldWrite = res.write,
            oldEnd = res.end;

        var chunks = [];

        res.write = function (chunk) {
          chunks.push(chunk);

          oldWrite.apply(res, arguments);
        };

        res.end = function (chunk) {
          if (chunk) {
            chunks.push(chunk);
          }

          var body = Buffer.concat(chunks).toString("utf8");


          var json;

          try
          {
            json = JSON.parse(body);
          }
          catch(e)
          {
             json = body;
          }


          var writedata = {
            "path":req.path,
            "passThrough": false,
            "delay": 0,
            "responseData": json,
            "alternatives":{},
            "useAlternative": null
          };

          fs.writeFile("mockdata/tmp/" + encodeURIComponent(req.path) + ".json", JSON.stringify(writedata, null, "\t"), function(err) {
            if(err) {
              console.log(err);
            } else {
              var datenow = Date.now();
              winston.info("Proxy request log on " +  encodeURIComponent(req.path) + "-" + datenow + ".json");
            }
          });


          oldEnd.apply(res, arguments);
        };


      });





      app.get("*", function(req, res){

        winston.info("Get '" + req.path + "'");

        var mock = mockDatabase.getMock(req.url, "GET");

        if(mock!==undefined && globalConfig.passThroughAll != true &&  mock.passThrough !== true) {
          setTimeout(function () {
            winston.info("Get '" + req.path + "': Delay = " + mock.delay);

            if(mock.useAlternative!== undefined && mock.useAlternative!== null) {
              res.header("Data source", "proxy server / " + mock.method + " / " + mock.useAlternative );
              res.header("Proxy source", globalConfig.portnr );
              if(mock.alternatives[mock.useAlternative].status !== undefined) {
                res.sendStatus(mock.alternatives[mock.useAlternative].status);
              }
              res.json(mock.alternatives[mock.useAlternative].responseData);
              winston.info("Get '" + req.path + "': Response ( alternative " + mock.method + "'" + mock.useAlternative + "'): " +  req.url);

            } else {
              res.header("Data source", "proxy server / " + mock.method + " / normal" );
              res.header("Proxy source", globalConfig.portnr );
              res.json(mock.responseData);
              winston.info("Get '" + req.path + "': Response ( normal ): " +  req.url);
            }
          }, mock.delay);

        } else {
          winston.info("Get '" + req.path + "': Proxy request: " +  req.url + " to " + globalConfig.backendUrl);
          res.header("Data source", "passthrough");
          res.header("Proxy source", globalConfig.portnr );
          proxy.web(req, res, { target: globalConfig.backendUrl });


        }
        
      });


      // Config server routes

      var allowCrossDomain = function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Content-Length, X-Requested-With, Pragma, Cache-Control, If-Modified-Since");

        // intercept OPTIONS method
        if ("OPTIONS" === req.method) {
          res.status(200).end();
        }
        else {
          next();
        }
      };

      appConfig.use(allowCrossDomain);
      appConfig.use(bodyParser.urlencoded({ extended: false }));
      appConfig.use(bodyParser.json({strict: false}));
      appConfig.use(bodyParser.json({ type: "application/vnd.api+json" }));




      appConfig.post("/services/mockapi/", function(req, res){

        var mockdata = req.body;
        if(mockdata.path!==undefined && mockdata.method!==undefined && mockdata.delay!==undefined && mockdata.passThrough!==undefined && mockdata.useAlternative!==undefined  ) {
          var oldversion = mockDatabase.getMock(mockdata.path, mockdata.method);

          winston.info("Config mock: " + oldversion.method + " " + mockdata.path + ": passThrough = " + mockdata.passThrough + ", delay = " + mockdata.delay + ", useAlternative" + mockdata.useAlternative);

          mockDatabase.updateMock(mockdata.path, oldversion.method, {
            path: mockdata.path,
            method: oldversion.method,
            passThrough: mockdata.passThrough,
            delay: mockdata.delay,
            useAlternative: mockdata.useAlternative,
            responseData: oldversion.responseData,
            alternatives: oldversion.alternatives
          });
        }
        var currentmock = mockDatabase.getMock(mockdata.path, mockdata.method);


        if(currentmock.useAlternative!== undefined && currentmock.useAlternative!== null) {
          res.header("Data source", "proxy server / " + currentmock.useAlternative );
          res.header("Proxy source", globalConfig.portnr );
          res.json({ responseData: currentmock.alternatives[currentmock.useAlternative].responseData, testData: currentmock.alternatives[currentmock.useAlternative].testData });
        } else {
          res.header("Data source", "proxy server / normal" );
          res.header("Proxy source", globalConfig.portnr );
          res.json({ responseData: currentmock.responseData, testData: currentmock.testData });
        }

      });



      appConfig.get("/services/mockapi/list", function(req, res){
        winston.info("Config mock: get all mocks");
        res.json(mockDatabase.getAllMocks());
      });

      appConfig.get("/services/mockapi/*", function(req, res){
        winston.info("Config mock: get mock" + req.param("path") + ": " + JSON.stringify(mockDatabase.getMock(req.param("path"))));
        res.json(mockDatabase.getMock(req.param("path")));
      });

      appConfig.get("/services/postbucket", function(req, res){
        winston.info("Config mock: get postbucket" + req.param("path") + ": " + JSON.stringify(postbucket[encodeURIComponent(req.param("path"))]) );
        res.json(postbucket[encodeURIComponent(req.param("path"))]);
      });

      appConfig.get("/services/putbucket", function(req, res){
        winston.info("Config mock: get putbucket" + req.param("path") + ": " + JSON.stringify(putbucket[encodeURIComponent(req.param("path"))]) );
        res.json(putbucket[encodeURIComponent(req.param("path"))]);
      });



      // Listen to ports

      app.listen(globalConfig.portnr);
      appConfig.listen(globalConfig.portnrConfig);
      winston.info("Listening on port " + globalConfig.portnr);
      winston.info("Listening on port " + globalConfig.portnrConfig);

      app.close();
      appConfig.close();


    });
  });

};
