/*!
MIT Licensed
https://github.com/DavisReef/depth-reader-js
XDM 1.0 spec: https://software.intel.com/en-us/articles/the-extensible-device-metadata-xdm-specification-version-10
Copyright (c)2015 Intel Corporation
*/
(function() {
  'use strict';

  var root = this // _window_ if in browser
    , xhrResType
    , Promise
    , XMLHttpRequest
    , DOMParser
    , Canvas
    , Image;

  if ('object' === typeof exports) { // Node.js
    xhrResType     = 'buffer';
    Promise        = require('rsvp').Promise;
    XMLHttpRequest = require('xhr2');
    DOMParser      = require('xmldom').DOMParser;
    Canvas         = require('canvas');
    Image          = Canvas.Image;
  } else { // browser
    xhrResType     = 'arraybuffer';
    Promise        = root.Promise ||
                     root.RSVP.Promise;
    XMLHttpRequest = root.XMLHttpRequest;
    DOMParser      = root.DOMParser;
    Image          = root.Image;
  }

  var DepthReader = function() {
    this.isXDM    = false;
    this.revision = 0;
    this.device   = {
      vendor: {
        manufacturer: ''
      , model:        ''
      }
    , pose: {
        latitude:  0
      , longitude: 0
      , altitude:  0
      }
    };
    this.camera = {
      vendor: {
        manufacturer: ''
      , model:        ''
      }
    , pose: {
        positionX:     0
      , positionY:     0
      , positionZ:     0
      , rotationAxisX: 0
      , rotationAxisY: 0
      , rotationAxisZ: 0
      , rotationAngle: 0
      }
    };
    this.perspective = { // XDM
      focalLengthX:    0
    , focalLengthY:    0
    , principalPointX: 0
    , principalPointY: 0
    };
    this.focus = { // Lens Blur
      focalPointX:    0
    , focalPointY:    0
    , focalDistance:  0
    , blurAtInfinity: 0
    };
    this.image = {
      mime: ''
    , data: null // data URI
    };
    this.depth = {
      metric: false // unit is meter if true
    , format: '' // RangeInverse/RangeLinear
    , near:   0
    , far:    0
    , mime:   ''
    , data:   null // data URI
    };
    this.confidence = {
      mime: ''
    , data: null // data URI
    };
  };

  /*
  parse XDM/LensBlur JPEG given its ArrayBuffer
  (function is synchronous and returns nothing;
  exception will be raised if parsing fails)
  */
  DepthReader.prototype.parseFile = function(buffer) {
    var bytes = new Uint8Array(buffer);
    if (bytes[0] !== 0xff ||
        bytes[1] !== 0xd8) { // JPEG start-of-image
      throw new Error('file is not JPEG image');
    }
    var xmpXapXml = ''
      , xmpExtXml = ''
      , payload
      , header
      , i = 0;

    while (-1 < (i = findMarker(bytes, i))) {
      i += 2; // skip marker to segment start

      if ((header = getHeader(bytes, i))) {
        // payload start = segment start + header length
        //               + sizeof word + null-terminator
        // if extension: + 32-byte HasExtendedXMP UUID
        //               +  8-byte "I don't know/care"
        var isXap = xmpXapNS === header
          , extra = header.length + (isXap ? 3 : 43)
          , size  = (bytes[i  ] << 8)
                  +  bytes[i+1]
                      - extra
          , start = i + extra;
        i = start + size;

        payload = baToStr(bytes, start, size);
        if (isXap) {
          xmpXapXml += payload;
        } else {
          xmpExtXml += payload;
        }
      }
    }
    if (this.debug) {
      // expose for inspection
      this.xmpXapXml = xmpXapXml;
      this.xmpExtXml = xmpExtXml;
    }

    var xapDescElt = parseRDF(xmpXapXml)
      , extDescElt = parseRDF(xmpExtXml)
      , imageNS    = getNS(extDescElt, 'Image') ||
                     getNS(extDescElt, 'GImage');

     this.isXDM = /xdm\.org/.test(imageNS);
    (this.isXDM ? parseXDM : parseLensBlur).call(
      null, this, imageNS, xapDescElt, extDescElt);

    makeDataURI(this.image);
    makeDataURI(this.depth);
    makeDataURI(this.confidence);
  };

  function parseXDM(self, imageNS, xapDescElt, extDescElt) {
    /*
    XDM metadata are usually encoded using the Adobe XMP Toolkit,
    but the XMP serializer, for reasons not entirely understood--
    perhaps for compression, sometimes encodes properties as XML
    attributes instead of child elements; so we must handle both
    structural forms.
    */
    var   vendorNS = getNS(extDescElt, 'VendorInfo')
      ,  devPoseNS = getNS(extDescElt, 'DevicePose') ||
                     getNS(xapDescElt, 'DevicePose')
      ,  camPoseNS = getNS(extDescElt, 'CameraPose')
      ,   deviceNS = getNS(extDescElt, 'Device') ||
                     getNS(xapDescElt, 'Device')
      ,   cameraNS = getNS(extDescElt, 'Camera')
      ,    depthNS = getNS(extDescElt, 'Depthmap')
      ,    noiseNS = getNS(extDescElt, 'NoiseModel')
      , perspectNS = getNS(extDescElt, 'PerspectiveModel');

    var  xdmRevElt = findChild(xapDescElt, deviceNS, 'Revision')
      , devVendElt = findChild(extDescElt, deviceNS, 'VendorInfo') ||
                     findChild(xapDescElt, deviceNS, 'VendorInfo')
      , camVendElt = findChild(extDescElt, cameraNS, 'VendorInfo')
      , devPoseElt = findChild(extDescElt, deviceNS, 'Pose') ||
                     findChild(xapDescElt, deviceNS, 'Pose')
      , camPoseElt = findChild(extDescElt, cameraNS, 'Pose')
      , imagingElt = lastDesc(
                     findChild(extDescElt, cameraNS, 'ImagingModel'))
      ,   imageElt = findChild(extDescElt, cameraNS, 'Image')
      ,   depthElt = lastDesc(
                     findChild(extDescElt, cameraNS, 'DepthMap'))
      ,  confidElt = findChild(  depthElt,  noiseNS, 'Reliability');

    self.revision = +attrValue(extDescElt, deviceNS, 'Revision') ||
                   +childValue( xdmRevElt, deviceNS, 'Revision') ||
                    +elemValue( xdmRevElt);

    self.device.vendor.manufacturer = attrValue(devVendElt, vendorNS, 'Manufacturer') ||
                                     childValue(devVendElt, vendorNS, 'Manufacturer');
    self.camera.vendor.manufacturer = attrValue(camVendElt, vendorNS, 'Manufacturer') ||
                                     childValue(camVendElt, vendorNS, 'Manufacturer');
    self.device.vendor.model        = attrValue(devVendElt, vendorNS, 'Model') ||
                                     childValue(devVendElt, vendorNS, 'Model');
    self.camera.vendor.model        = attrValue(camVendElt, vendorNS, 'Model') ||
                                     childValue(camVendElt, vendorNS, 'Model');

    self.device.pose.latitude  = +attrValue(devPoseElt, devPoseNS, 'Latitude') ||
                                +childValue(devPoseElt, devPoseNS, 'Latitude');
    self.device.pose.longitude = +attrValue(devPoseElt, devPoseNS, 'Longitude') ||
                                +childValue(devPoseElt, devPoseNS, 'Longitude');
    self.device.pose.altitude  = +attrValue(devPoseElt, devPoseNS, 'Altitude') ||
                                +childValue(devPoseElt, devPoseNS, 'Altitude');

    self.camera.pose.positionX = +attrValue(camPoseElt, camPoseNS, 'PositionX') ||
                                +childValue(camPoseElt, camPoseNS, 'PositionX');
    self.camera.pose.positionY = +attrValue(camPoseElt, camPoseNS, 'PositionY') ||
                                +childValue(camPoseElt, camPoseNS, 'PositionY');
    self.camera.pose.positionZ = +attrValue(camPoseElt, camPoseNS, 'PositionZ') ||
                                +childValue(camPoseElt, camPoseNS, 'PositionZ');

    self.camera.pose.rotationAxisX = +attrValue(camPoseElt, camPoseNS, 'RotationAxisX') ||
                                    +childValue(camPoseElt, camPoseNS, 'RotationAxisX');
    self.camera.pose.rotationAxisY = +attrValue(camPoseElt, camPoseNS, 'RotationAxisY') ||
                                    +childValue(camPoseElt, camPoseNS, 'RotationAxisY');
    self.camera.pose.rotationAxisZ = +attrValue(camPoseElt, camPoseNS, 'RotationAxisZ') ||
                                    +childValue(camPoseElt, camPoseNS, 'RotationAxisZ');
    self.camera.pose.rotationAngle = +attrValue(camPoseElt, camPoseNS, 'RotationAngle') ||
                                    +childValue(camPoseElt, camPoseNS, 'RotationAngle');

    self.perspective.focalLengthX    = +attrValue(imagingElt, perspectNS, 'FocalLengthX') ||
                                      +childValue(imagingElt, perspectNS, 'FocalLengthX');
    self.perspective.focalLengthY    = +attrValue(imagingElt, perspectNS, 'FocalLengthY') ||
                                      +childValue(imagingElt, perspectNS, 'FocalLengthY');
    self.perspective.principalPointX = +attrValue(imagingElt, perspectNS, 'PrincipalPointX') ||
                                      +childValue(imagingElt, perspectNS, 'PrincipalPointX');
    self.perspective.principalPointY = +attrValue(imagingElt, perspectNS, 'PrincipalPointY') ||
                                      +childValue(imagingElt, perspectNS, 'PrincipalPointY');

    self.depth.metric = parseBool(
                         attrValue(depthElt, depthNS, 'Metric') ||
                        childValue(depthElt, depthNS, 'Metric'));
    self.depth.format =  attrValue(depthElt, depthNS, 'Format') ||
                        childValue(depthElt, depthNS, 'Format');
    self.depth.near   = +attrValue(depthElt, depthNS, 'Near') ||
                       +childValue(depthElt, depthNS, 'Near');
    self.depth.far    = +attrValue(depthElt, depthNS, 'Far') ||
                       +childValue(depthElt, depthNS, 'Far');

    self.image.mime      = attrValue( imageElt, imageNS, 'Mime') ||
                          childValue( imageElt, imageNS, 'Mime');
    self.depth.mime      = attrValue( depthElt, depthNS, 'Mime') ||
                          childValue( depthElt, depthNS, 'Mime');
    self.confidence.mime = attrValue(confidElt, imageNS, 'Mime') ||
                          childValue(confidElt, imageNS, 'Mime');
    self.image.data      = attrValue( imageElt, imageNS, 'Data') ||
                          childValue( imageElt, imageNS, 'Data');
    self.depth.data      = attrValue( depthElt, depthNS, 'Data') ||
                          childValue( depthElt, depthNS, 'Data');
    self.confidence.data = attrValue(confidElt, imageNS, 'Data') ||
                          childValue(confidElt, imageNS, 'Data');
  }

  function parseLensBlur(self, imageNS, xapDescElt, extDescElt) {
    var depthNS = getNS(extDescElt, 'GDepth')
      , focusNS = getNS(xapDescElt, 'GFocus');

    self.focus.focalPointX    = +attrValue(xapDescElt, focusNS, 'FocalPointX');
    self.focus.focalPointY    = +attrValue(xapDescElt, focusNS, 'FocalPointY');
    self.focus.focalDistance  = +attrValue(xapDescElt, focusNS, 'FocalDistance');
    self.focus.blurAtInfinity = +attrValue(xapDescElt, focusNS, 'BlurAtInfinity');

    self.depth.format =  attrValue(xapDescElt, depthNS, 'Format');
    self.depth.near   = +attrValue(xapDescElt, depthNS, 'Near');
    self.depth.far    = +attrValue(xapDescElt, depthNS, 'Far');

    self.image.mime = attrValue(xapDescElt, imageNS, 'Mime');
    self.depth.mime = attrValue(xapDescElt, depthNS, 'Mime');
    self.image.data = attrValue(extDescElt, imageNS, 'Data');
    self.depth.data = attrValue(extDescElt, depthNS, 'Data');
  }

  function getNS(elt, name) {
    return elt && elt.getAttribute('xmlns:' + name) || '';
  }

  // parse given XML and return x:xmpmeta
  // -> rdf:RDF -> rdf:Description element
  function parseRDF(xmpXml) {
    try {
      var parser = new DOMParser
        , xmlDoc = parser.parseFromString(xmpXml, 'application/xml');
      return lastDesc(firstChild(xmlDoc.documentElement));
    } catch (err) {
      throw new Error('cannot parse XMP XML');
    }
  }

  // get child rdf:Description;
  // return parent if not found
  function lastDesc(parent) {
    // XDM may contain multiple rdf:Description
    // elements where last contains useful info
    var elts = parent && parent.childNodes || [];

    for (var i = elts.length - 1; i >= 0; i--) {
      if ('rdf:Description' === elts[i].nodeName) {
        return elts[i];
      }
    }
    return parent;
  }

  function firstChild(parent) {
    var elt = parent && parent.firstChild;
    for (; elt && 1 !== elt.nodeType;
           elt = elt.nextSibling) {
      // skip #text node if needed
    }
    return elt || null;
  }

  function findChild(parent, ns, name) {
    var elts = parent && parent.getElementsByTagNameNS(ns, name);
    return elts && elts[0] || null;
  }

  function childValue(parent, ns, name) {
    return elemValue(findChild(parent, ns, name));
  }

  function elemValue(elt) {
    return elt && elt.textContent || '';
  }

  function attrValue(elt, ns, name) {
    return elt && elt.getAttributeNS(ns, name) || '';
  }

  // make image.data a data URI
  function makeDataURI(image) {
    if (image.mime && image.data) {
      image.data =   'data:'  + image.mime
                 + ';base64,' + image.data;
    }
  }

  /*
  get index of next APP1 marker
  pos: starting index within buf
  return: index; -1 if not found
  */
  function findMarker(buf, pos) {
    for (var i = pos; i < buf.length; i++) {
      if (0xff === buf[i  ] &&
          0xe1 === buf[i+1]) {
        return i;
      }
    }
    return -1;
  }

  /*
  get XMP segment header string
  pos: starting index of segment
  return: header; '' if not found
  */
  function getHeader(arr, pos) {
    pos += 2; // skip segment size
    return hasHeader(xmpXapNS) ? xmpXapNS :
           hasHeader(xmpExtNS) ? xmpExtNS : '';

    function hasHeader(header) {
      var str = baToStr(arr, pos, header.length);
      return header === str;
    }
  }
  var xmpXapNS = 'http://ns.adobe.com/xap/1.0/'
    , xmpExtNS = 'http://ns.adobe.com/xmp/extension/';

  // convert sub-Uint8Array to string
  function baToStr(arr, pos, len) {
    arr = arr.subarray(pos, pos + len);
    try {
      return String.fromCharCode.apply(null, arr);
    } catch (err) {
      // workaround PhantomJS bug:
      // https://github.com/ariya/phantomjs/issues/11172
      var i = -1
        , j = arr.length
        , a = new Array(j);
      while (++i < j) {
        a[i] = arr[i];
      }
      return String.fromCharCode.apply(null, a);
    }
  }

  // parse '1'/'true'/'yes'
  function parseBool(str) {
    return !!String(str).match(/^\s*1|true|yes\s*$/i);
  }

  /*
  load XDM/LensBlur image given JPEG file URL
  (parseFile() will be invoked automatically)
  return: Promise to be fulfilled with _this_
  */
  DepthReader.prototype.loadFile = function(fileUrl) {
    var self = this;

    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest;
      xhr.responseType = xhrResType;
      xhr.open('GET', fileUrl);

      xhr.onload = function() {
        if (this.response) {
          try { // parsing is synchronous
            self.fileData = this.response;
            self.parseFile.call(self, self.fileData);
            resolve(self);
          } catch (err) {
            reject(err);
          }
        } else {
          var msg = 'cannot load file [' + this.status + ']';
          reject(new Error(msg));
        }
      };
      xhr.send();
    });
  };

  /*
  normalize the depthmap so that depth
  values are scaled between 1 and 255
  (overwrites the original depth.data)
  bias: shift depth values (brightness)
  */
  DepthReader.prototype.normalizeDepthmap = function(bias) {
    if (!this.depth.data ||
         this.depth._normalized) {
      return;
    }
    var canvas
      , image = new Image;
    image.src = this.depth.data;
    var w = image.width
      , h = image.height;

    if (Canvas) { // Node.js
      canvas = new Canvas(w, h);
    } else { // browser
      canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
    }
    var ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    var pixels = ctx.getImageData(0, 0, w, h)
      , data   = pixels.data
      , len    = data.length
      , min    = 255
      , max    = 0
      , val, norm, prev, i, j;

    // get min/max depth values
    for (i = 0; i < len; i += 4) {
      val = data[i];
      if (val > max) {max = val;}
      if (val < min) {min = val;}
    }
    // --min so all values > 0
    var spread = max - (--min);
    for (i = 0; i < len; i += 4) {
      val = data[i];
      if (prev !== val) {
        norm = Math.round((val - min) / spread * 255 + bias|0);
        norm = Math.max(0, Math.min(255, norm));
        prev = val;
      }
      // modify R,G,B not alpha
      for (j = 0; j < 3; j++) {
        data[i + j] = norm;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    this.depth.data = canvas.toDataURL();
    this.depth._normalized = true;
  };

  if ('object' === typeof exports) {
    module.exports   = DepthReader;
  } else { // browser
    root.DepthReader = DepthReader;
  }
}).call(this);
