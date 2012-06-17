#!/usr/bin/env node
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

/*jslint node:true */

var fs = require('fs');
var filename = 'lib/shibuya/runtime.js';
var content = fs.readFileSync(filename, 'utf-8');

content = content.split('\n').map(function(line) {
    return line
    .replace(/^(\s*)\$ReturnIfAbrupt\(([^)]+)\);/g, '$1// expanded ReturnIfAbrupt by preprocess.js\n$1if (isAbruptCompletion($2)) { return $2; } else if ($2 instanceof Completion) { $2 = $2.value; }')
    .replace(/^(\s*)\$BreakIfAbrupt\(([^)]+)\);/g, '$1// expanded BreakIfAbrupt by preprocess.js\n$1if (isAbruptCompletion($2)) {\n$1    err = $2.value;\n$1    break;\n$1} else if ($2 instanceof Completion) {\n$1    $2 = $2.value;\n$1}');
}).join('\n');

fs.writeFileSync(filename, content, 'utf-8');
/* vim: set sw=4 ts=4 et tw=80 : */
