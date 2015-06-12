var os = require('os')
var path = require('path')

var mkdirp = require('mkdirp')
var rimraf = require('rimraf')
var ncp = require('ncp').ncp
var mv = require('mv')
var resourcehacker  = require('resourcehacker')
var common = require('./common')
var spawn = require('child_process').spawn
var tmp = require('tmp')
var fs = require('fs')


module.exports = {
  createApp: function createApp (opts, electronApp, cb) {
    var tmpDir = path.join(os.tmpdir(), 'electron-packager-windows')

    var newApp = path.join(tmpDir, opts.name + '-win32')
    // reset build folders + copy template app
    rimraf(tmpDir, function rmrfd () {
      // ignore errors
      mkdirp(newApp, function mkdirpd () {
        // ignore errors
        // copy app folder and use as template (this is exactly what Atom editor does)
        ncp(electronApp, newApp, function copied (err) {
          if (err) return cb(err)
          // rename electron.exe
          mv(path.join(newApp, 'electron.exe'), path.join(newApp, opts.name + '.exe'), function (err) {
            if (err) return cb(err)

            buildWinApp(opts, cb, newApp)
          })
        })
      })
    })
  }
}

function copy (from, to, cb) {
  rimraf(to, function () {
    mkdirp(to, function () {
      ncp(from, to, function (err) {
        if (err) { return cb(err) }
        cb()
      })
    })
  })
}

function buildWinApp (opts, cb, newApp) {
  var paths = {
    app: path.join(newApp, 'resources', 'app')
  }

  // copy users app into destination path
  ncp(opts.dir, paths.app, {filter: common.userIgnoreFilter(opts, true), dereference: true}, function copied (err) {
    if (err) return cb(err)

    function moveApp () {
      // finally, move app into cwd
      var finalPath = path.join(opts.out || process.cwd(), opts.name + '-win32')
      copy(newApp, finalPath, function moved (err) {
        if (err) return cb(err)
        if (opts.asar) {
          var finalPath = path.join(opts.out || process.cwd(), opts.name + '-win32', 'resources')
          common.asarApp(finalPath, function (err) {
            if (err) return cb(err)
            updateVersionInfo()
          })
        } else {
          updateVersionInfo()
        }
      })
    }

    function convertRCtoRES(resourcefile) {
      var cmdLine,Winreg
      if (process.platform == "win32") {
        Winreg = require('winreg')
        regkey = new Winreg({
          hive : Winreg.HKLM,
          key : '\\SOFTWARE\\Microsoft\\Microsoft SDKs\\Windows'
        })
        regKey.values(function (err, items) {
          if (err)
            console.log('ERROR: '+err);
          else{
            for (var i in items){
              if (items[i].name == 'CurrentInstallFolder'){
                var rcExe = items[i].value
                var tmpObj = tmp.fileSync({postfix:'.res'})
                var args = resourcefile + ' ' + tmpObj.name
                var child = spawn(rcExe,args)
                child.stdout.pipe(process.stdout);
                child.stderr.pipe(process.stderr);
                var stderr = '';
                child.on('error', function(err) {
                  if (callback) {
                    callback(err);
                  }
                });
                child.stderr.on('data', function(data) {
                  stderr += data;
                });
                child.on('close', function(code) {
                  if (code === 0) {
                    if (callback) {
                      callback(null,tmpObj.name);
                    }
                  } else {
                    if (callback) {
                      callback(stderr);
                    }
                  }
                });
              }
            }
          }
        });
      }
    }

    function updateVersionInfo() {
      convertRCtoRES(opts.resourcefile,function(err,resfile){
        if (err) return;
        var exePath = path.join(opts.out || process.cwd(), opts.name + '-win32', opts.name + '.exe')
        var args = '-addoverwrite ' + exePath + ', ' + exePath + ', ' + resfile + ',,,'
        resourcehacker(args,function(function(err){
          if (err) return;
          updateIcon()
        })
      })
    }

    function updateIcon () {
      var finalPath = path.join(opts.out || process.cwd(), opts.name + '-win32')

      if (!opts.icon) {
        return cb(null, finalPath)
      }
      var exePath = path.join(opts.out || process.cwd(), opts.name + '-win32', opts.name + '.exe')
      var args = '-addoverwrite '  + exePath + ', ' + exePath + ', ' + opts.icon + ', ICONGROUP,MAINICON,0'
    }

    common.prune(opts, paths.app, cb, moveApp)
  })
}
