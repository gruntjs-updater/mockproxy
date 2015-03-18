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
    globalConfig.backendUrl = "http://172.30.99.66:8080";
    globalConfig.portnr = "8081";
    globalConfig.portnrConfig = "8082";

    var fs=require("fs");
    var q = require("q");
    var express = require("express");
    var bodyParser = require("body-parser");
    var app = express();
    var appConfig = express();
    var httpProxy = require("http-proxy");
    var proxy = httpProxy.createProxyServer({});
    var _ = require("underscore-node");

    var formidable = require("formidable");
    var postbucket = {};
    var putbucket = {};

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
          portnrConfig: "8082"
        });

    globalConfig.portnr = options.portnr;
    globalConfig.portnrConfig = options.portnrConfig;
    globalConfig.backendUrl = options.backendUrl;


    var argPortnr = getParameter(process.argv, "portnr");
    var argPortnrConfig = getParameter(process.argv, "portnrConfig");
    var argBackendUrl = getParameter(process.argv, "backendUrl");
    if (argPortnr !== undefined) {
      globalConfig.portnr = argPortnr;
    }
    if (argPortnrConfig !== undefined) {
      globalConfig.portnrConfig = argPortnrConfig;
    }
    if (argBackendUrl !== undefined) {
      globalConfig.backendUrl = argBackendUrl;
    }



    function CreateMockDatabase () {
      var listeners = [];
      var mockData = { "GET": {},"POST": {},"PUT": {}};

      this.getMock = function (path, method) {
        console.log("Get mock for ", method);
        if(mockData[method][path]!==undefined) {
          return mockData[method][path];
        }
        else {
          var returndata;
          _.each(mockData[method], function(value){
            try {
              var regex = new RegExp(value.path);
              if(regex.test(path)) {
                returndata = value;
              }
            } catch(e) {
              console.log(e);
            }
          });
          return returndata;
        }
      };
      this.getAllMocks = function () {
        return mockData;
      };
      this.setMock = function (path, method, mock, execListeners) {
        if(mockData[method]===undefined) { mockData[method]={}; }
        mockData[method][path] = mock;
        console.log("Mock added for " + path);
        if(execListeners !== false) {
          this.execListeners();
        }
      };
      this.updateMock = function (path, method, mock, execListeners) {
        if(mockData[method]===undefined) { mockData[method]={}; }
        mockData[method][path] = mock;
        console.log("Mock updated for " + method + ": " + path);
        if(execListeners !== false) {
          this.execListeners();
        }
      };
      this.addListener = function (listener) {
        listeners.push(listener);
      };
      this.execListeners = function() {
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

      for (var i = 0, len = result.length; i < len; i++) {
        if (q.isPromise(result[i])) {
          var mockdata = result[i].valueOf();
          mockDatabase.setMock(mockdata.path, mockdata.method, mockdata, false);
        }
      }

      mockDatabase.execListeners();

      app.post("*", function(req, res){

        var form = new formidable.IncomingForm();

        form.parse(req, function(err, fields) {
          postbucket[encodeURIComponent(req.path)] = fields;
          fs.writeFile("mockdata/postbucket/" + encodeURIComponent(req.path) + "-" + Date.now() + ".json", JSON.stringify(fields, null, "\t"), function(err) {
            if(err) {
              console.log(err);
            } else {
              console.log("Postbucket file written.");
            }
          });
        });

        var mock = mockDatabase.getMock(req.url, "POST");

        console.log("Post request: ", req.url);

        if(mock!==undefined && mock.passThrough !== true) {
          setTimeout(function () {

            if(mock.useAlternative!== undefined && mock.useAlternative!== null) {
              res.header("Data source", "proxy server / " + mock.method + " / " + mock.useAlternative );
              res.json(mock.alternatives[mock.useAlternative]);
              console.log("Response ( alternative " + mock.method + "'" + mock.useAlternative + "'): ", req.url);

            } else {
              res.header("Data source", "proxy server / " + mock.method + " / normal" );
              res.json(mock.responseData);
              console.log("Response: ", req.url);
            }
          }, mock.delay);

          console.log("Delay answer", mock.delay);
        } else {
          console.log("Proxy request:", req.url);
          res.header("Data source", "passthrough");
          proxy.web(req, res, { target: globalConfig.backendUrl });
        }
      });

      app.put("*", function(req, res){

        console.log("puuuuuuut");

        var form = new formidable.IncomingForm();

        console.log();

        form.parse(req, function(err, fields) {
          putbucket[encodeURIComponent(req.path)] = fields;
          fs.writeFile("mockdata/putbucket/" + encodeURIComponent(req.path) + "-" + Date.now() + ".json", JSON.stringify(fields, null, "\t"), function(err) {
            if(err) {
              console.log(err);
            } else {
              console.log("Putbucket file written.");
            }
          });
        });

        var mock = mockDatabase.getMock(req.url, "PUT");

        console.log("Put request: ", req.url);

        if(mock!==undefined && mock.passThrough !== true) {
          setTimeout(function () {

            if(mock.useAlternative!== undefined && mock.useAlternative!== null) {
              res.header("Data source", "proxy server / " + mock.method + " / " + mock.useAlternative );
              res.json(mock.alternatives[mock.useAlternative]);
              console.log("Response ( alternative " + mock.method + " '" + mock.useAlternative + "'): ", req.url);

            } else {
              res.header("Data source", "proxy server / " + mock.method + " / normal" );
              res.json(mock.responseData);
              console.log("Response: ", req.url);
            }
          }, mock.delay);

          console.log("Delay answer", mock.delay);
        } else {
          console.log("Proxy request:", req.url);
          res.header("Data source", "passthrough");
          proxy.web(req, res, { target: globalConfig.backendUrl });
        }
      });


      // This code logs the log data in the temporary folder, so that this can be used to create mocking files
      if(!fs.existsSync("mockdata/tmp")){
        fs.mkdirSync("mockdata/tmp", "0766", function(err){
          if(err){
            console.log(err);
            console.log("ERROR! Can't make the mockdata/tmp directory! \n");    // echo the result back
          }
        });
      }
      if(!fs.existsSync("mockdata/postbucket")){
        fs.mkdirSync("mockdata/postbucket", "0766", function(err){
          if(err){
            console.log(err);
            console.log("ERROR! Can't make the mockdata/postbucket directory! \n");    // echo the result back
          }
        });
      }
      if(!fs.existsSync("mockdata/putbucket")){
        fs.mkdirSync("mockdata/putbucket", "0766", function(err){
          if(err){
            console.log(err);
            console.log("ERROR! Can't make the mockdata/putbucket directory! \n");    // echo the result back
          }
        });
      }


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

          var writedata = {
            "path":req.path,
            "passThrough": false,
            "delay": 0,
            "responseData": JSON.parse(body),
            "alternatives":{},
            "useAlternative": null
          };

          fs.writeFile("mockdata/tmp/" + encodeURIComponent(req.path) + ".json", JSON.stringify(writedata, null, "\t"), function(err) {
            if(err) {
              console.log(err);
            } else {
              console.log("Temp mock file written.");
            }
          });

          oldEnd.apply(res, arguments);
        };


      });





      app.get("*", function(req, res){

        var mock = mockDatabase.getMock(req.url, "GET");


        console.log("Get request: ", req.url);

        if(mock!==undefined && mock.passThrough !== true) {
          setTimeout(function () {

            if(mock.useAlternative!== undefined && mock.useAlternative!== null) {
              res.header("Data source", "proxy server / " + mock.method + " / " + mock.useAlternative );
              if(mock.alternatives[mock.useAlternative].status === "404") {
                res.sendStatus(404);
              }
              res.json(mock.alternatives[mock.useAlternative].responseData);
              console.log("Response ( alternative " + mock.method + " '" + mock.useAlternative + "'): ", req.url);

            } else {
              res.header("Data source", "proxy server / " + mock.method + " / normal" );
              res.json(mock.responseData);
              console.log("Response: ", req.url);
            }
          }, mock.delay);

          console.log("Delay answer", mock.delay);
        } else {
          console.log("Proxy request:", req.url);
          res.header("Data source", "passthrough");
          proxy.web(req, res, { target: globalConfig.backendUrl });


        }
        
      });


      // Config server routes

      var allowCrossDomain = function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Content-Length, X-Requested-With");

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




      appConfig.post("/ngp/mockapi/", function(req, res){

        var mockdata = req.body;
        if(mockdata.path!==undefined && mockdata.method!==undefined && mockdata.delay!==undefined && mockdata.passThrough!==undefined && mockdata.useAlternative!==undefined  ) {
          var oldversion = mockDatabase.getMock(mockdata.path, mockdata.method);

          console.log("set passthrough", mockdata.passThrough);

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
          res.json({ responseData: currentmock.alternatives[currentmock.useAlternative].responseData });
          console.log("Response ( alternative '" + currentmock.useAlternative + "'): ", req.url);

        } else {
          res.header("Data source", "proxy server / normal" );
          res.json({ responseData: currentmock.responseData });
          console.log("Response: ", req.url);
        }

      });



      appConfig.get("/ngp/mockapi/list", function(req, res){
        res.json(mockDatabase.getAllMocks());
      });

      appConfig.get("/ngp/mockapi/*", function(req, res){
        res.json(mockDatabase.getMock(req.param("path")));
      });

      appConfig.get("/ngp/postbucket", function(req, res){
        res.json(postbucket[encodeURIComponent(req.param("path"))]);
      });

      appConfig.get("/ngp/putbucket", function(req, res){
        console.log(putbucket);

        res.json(putbucket[encodeURIComponent(req.param("path"))]);
      });



      // Listen to ports

      app.listen(globalConfig.portnr);
      appConfig.listen(globalConfig.portnrConfig);
      console.log("Listening on port " + globalConfig.portnr);
      console.log("Listening on port " + globalConfig.portnrConfig);

      app.close();
      appConfig.close();


    });
  });

};