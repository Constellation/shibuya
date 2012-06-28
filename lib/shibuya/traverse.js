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
/*global shibuya:true, exports:true */

(function (exports) {
    'use strict';

    var VisitorKeys,
        VisitorOption;

    // simple visitor implementation

    VisitorKeys = {
        AssignmentExpression: ['left', 'right'],
        ArrayExpression: ['elements'],
        ArrayPattern: ['elements'],
        ArrowFunctionExpression: ['id', 'params', 'body'],
        BlockStatement: ['body'],
        BinaryExpression: ['left', 'right'],
        BreakStatement: ['label'],
        CallExpression: ['callee', 'arguments'],
        CatchClause: ['param', 'body'],
        ConditionalExpression: ['test', 'consequent', 'alternate'],
        ClassBody: ['body'],
        ClassDeclaration: ['id', 'subclassOf', 'body'],
        ClassExpression: ['id', 'subclassOf', 'body'],
        MethodDefinition: ['key', 'value'],
        ContinueStatement: ['label'],
        DoWhileStatement: ['body', 'test'],
        DebuggerStatement: [],
        EmptyStatement: [],
        ExpressionStatement: ['expression'],
        ForStatement: ['init', 'test', 'update', 'body'],
        ForInStatement: ['left', 'right', 'body'],
        ForOfStatement: ['left', 'right', 'body'],
        FunctionDeclaration: ['id', 'params', 'body'],
        FunctionExpression: ['id', 'params', 'body'],
        Identifier: [],
        IfStatement: ['test', 'consequent', 'alternate'],
        Literal: [],
        LabeledStatement: ['label', 'body'],
        LogicalExpression: ['left', 'right'],
        MemberExpression: ['object', 'property'],
        ModuleDeclaration: ['id', 'from', 'body'],
        NewExpression: ['callee', 'arguments'],
        ObjectExpression: ['properties'],
        ObjectPattern: ['properties'],
        Program: ['body'],
        Property: ['key', 'value'],
        ReturnStatement: ['argument'],
        SequenceExpression: ['expressions'],
        SwitchStatement: ['descriminant', 'cases'],
        SwitchCase: ['test', 'consequent'],
        ThisExpression: [],
        ThrowStatement: ['argument'],
        TryStatement: ['block', 'handlers', 'finalizer'],
        UnaryExpression: ['argument'],
        UpdateExpression: ['argument'],
        VariableDeclaration: ['declarations'],
        VariableDeclarator: ['id', 'init'],
        WhileStatement: ['test', 'body'],
        WithStatement: ['object', 'body'],
        YieldExpression: ['argument']
    };

    VisitorOption = {
        Break: 1,
        Skip: 2
    };

    function traverse(top, visitor) {
        var worklist, leavelist, node, ret, current, current2, candidates, candidate;

        worklist = [ top ];
        leavelist = [];

        while (worklist.length) {
            node = worklist.pop();

            if (node) {
                if (visitor.enter) {
                    ret = visitor.enter(node);
                } else {
                    ret = undefined;
                }

                if (ret === VisitorOption.Break) {
                    return;
                }

                worklist.push(null);
                leavelist.push(node);

                if (ret !== VisitorOption.Skip) {
                    candidates = VisitorKeys[node.type];
                    current = candidates.length;
                    while ((current -= 1) >= 0) {
                        candidate = node[candidates[current]];
                        if (candidate) {
                            if (Array.isArray(candidate)) {
                                current2 = candidate.length;
                                while ((current2 -= 1) >= 0) {
                                    if (candidate[current2]) {
                                        worklist.push(candidate[current2]);
                                    }
                                }
                            } else {
                                worklist.push(candidate);
                            }
                        }
                    }
                }
            } else {
                node = leavelist.pop();
                if (visitor.leave) {
                    ret = visitor.leave(node);
                } else {
                    ret = undefined;
                }
                if (ret === VisitorOption.Break) {
                    return;
                }
            }
        }
    }

    exports.traverse = traverse;
    exports.traverse.Break = VisitorOption.Break;
    exports.traverse.Skip = VisitorOption.Skip;

}(typeof exports === 'undefined' ? (typeof shibuya.traverse === 'undefined' ? shibuya.traverse = {} : shibuya.traverse) : exports));
/* vim: set sw=4 ts=4 et tw=80 : */
