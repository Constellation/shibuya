/*
  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/*jslint bitwise:true */
/*global shibuya:true, exports:true, $ReturnIfAbrupt:true, $BreakIfAbrupt:true*/
(function (exports) {
    'use strict';

    var global, shibuya, assert;

    global = Function('return this')();

    if (typeof process !== 'undefined') {
        shibuya = require('../shibuya');
        assert = require('assert');
        exports.assert = assert.ok.bind(assert);
    } else {
        shibuya = global.shibuya;
        exports.assert = function (cond) {
            if (!cond) {
                throw Error(cond);
            }
        };
    }

    function inherit(constructor, parent) {
        var proto = Object.create(parent.prototype);
        proto.constructor = constructor;
        return proto;
    }

    exports.inherit = inherit;
    exports.slice = Array.prototype.slice;
    exports.has = Function.call.bind(Object.hasOwnProperty);
}(typeof exports === 'undefined' ? (shibuya.common = {}) : exports));
/* vim: set sw=4 ts=4 et tw=80 : */
