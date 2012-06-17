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
/*global shibuya:true, exports:true*/

(function (exports) {
    'use strict';

    var global,
        esprima,
        shibuya;

    global = Function('return this')();

    if (typeof process !== 'undefined') {
        esprima = require('./esprima');
        shibuya = require('../shibuya');
    } else {
        esprima = global.esprima;
        shibuya = global.shibuya;
    }

    function Visitor() { }

    Visitor.prototype.visit = function (node) {
        return this[node.type](node);
    };


    function StaticSemantics() {
    }

    StaticSemantics.prototype = Object.create(Visitor.prototype);


    function Handler(type, begin, end) {
        this.type = type;
        this.begin = begin;
        this.end = end;
    }

    Handler.ENV = 0;
    Handler.FINALLY = 1;
    Handler.CATCH = 2;

    function Compiler() {
        this.source = null;
        this.tree = null;
        this.code = null;
        this.strict = null;
        this.pending = [];
    }

    Compiler.prototype = Object.create(Visitor.prototype);

    Compiler.prototype.compile = function (source) {
        this.source = source;
        this.tree = esprima.parse(source, {
            range: true
        });
        this.visit(tree);
    };

    Compiler.prototype.emit = function (instr) {
        this.code.instructions.push(instr);
    };

    Compiler.prototype.emitGetValue = function (section) {
        this.emit({
            opcode: OP.GETVALUE
            section: section
        });
    };

    Compiler.prototype.emitDupTop = function () {
        this.emit({
            opcode: OP.DUPTOP
        });
    };

    Compiler.prototype.emitPopTop = function () {
        this.emit({
            opcode: OP.POPTOP
        });
    };

    Compiler.prototype.emitPopTopAndRet = function () {
        this.emit({
            opcode: OP.POPTOP_AND_RET
        });
    };

    Compiler.prototype.emitPutValue = function (section) {
        this.emit({
            opcode: OP.PUTVALUE
            section: section
        });
    };

    Compiler.prototype.AssignmentExpression = function (expr) {
        if (expr.operator === '=') {
            if (expr.left.type !== esprima.Syntax.ObjectPattern || expr.left.type !== esprima.Syntax.ArrayPattern) {
                this.visit(expr.left);
                this.visit(expr.right);
                this.emitGetValue('11.13-1-d');
                this.emitPutValue('11.13-1-e');
            } else {
                this.visit(expr.right);
                this.emitDestructuringAssignment(expr.left);
            }
        } else {
            this.visit(expr.left);
            this.emitDupTop();
            this.emitGetValue('11.13-2');
            this.visit(expr.right);
            this.emitGetValue('11.13-5');
            this.emitBinaryOperation(expr.operator);
            this.emitPutValue('11.13-9');
        }
    };

    Compiler.prototype.ArrayExpression = function (expr) {
        this.emit({
            opcode: OP.BUILD_ARRAY
            section: '11.1.4.1'
        });
        expr.elements.forEach(function (element) {
            if (element.type === esprima.Syntax.SpreadElement) {
                this.visit(element.argument);
                this.emitArrayDefine(true);
            } else {
                this.visit(element);
                this.emitArrayDefine(false);
            }
        }, this);
        this.emit({
            opcode: OP.FINISH_ARRAY
            section: '11.1.4.1'
        });
    };

    Compiler.prototype.BinaryExpression = function (expr) {
        if (expr.operator !== '||' && expr.operator !== '&&') {
            this.visit(expr.left);
            this.emitGetValue();
            this.visit(expr.right);
            this.emitGetValue();
            this.emitBinaryOperation(expr.operator);
        } else {
            // TODO(Constellation) implement it
            this.visit(expr.left);
            this.emitGetValue();
            this.visit(expr.right);
            this.emitGetValue();
            this.emitBinaryOperation(expr.operator);
        }
    };

    Compiler.prototype.BreakStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.CallExpression = function (expr) {
        this.visit(expr.callee);
        this.emitDupTop();
        this.emitGetValue();
        expr.arguments.forEach(function (arg) {
            this.visit(arg);
            this.emitGetValue();
        }, this);
        this.emitCall();
    };

    Compiler.prototype.CatchClause = function (stmt) {
        UNREACHABLE();
    };

    Compiler.prototype.ConditionalExpression = function (expr) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.ContinueStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.DoWhileStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.DebuggerStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.EmptyStatement = function (stmt) {
    };

    Compiler.prototype.ExportSpecifier = function (stmt) {
        throw new SyntaxError('currently not support export specifier');
    };

    Compiler.prototype.ExportSpecifierSet = function (stmt) {
        throw new SyntaxError('currently not support export specifier');
    };

    Compiler.prototype.ExportDeclaration = function (decl) {
        throw new SyntaxError('currently not support export specifier');
    };

    Compiler.prototype.ExpressionStatement = function (stmt) {
        this.visit(stmt.expression);
        this.emitGetValue();
        if (this.eval) {
            this.emitPopTopAndRet();
        } else {
            this.emitPopTop();
        }
    };

    Compiler.prototype.BlockStatement = function (block) {
        this.addEnvironmentHandler(function () {
            this.emit({
                opcode: OP.BLOCK_START,
                section: '12.1'
            });

            block.body.forEach(function (stmt) {
                this.visit(stmt);
            }, this);

            this.emit({
                opcode: OP.BLOCK_END,
                section: '12.1'
            });
        });
    };

    Compiler.prototype.addEnvironmentHandler = function (func) {
        var begin, end;
        begin = this.code.instructions.length;
        func.call(this);
        end = this.code.instructions.length;
        this.code.handlers.push(new Handler(Handler.ENV, begin, end));
    };

    function compile(source) {
        var compiler = new Compiler();
        return compiler.compile(source);
    }

    exports.compile = compile;
    exports.Handler = Handler;
}(typeof exports === 'undefined' ? (shibuya.compiler = {}) : exports));
/* vim: set sw=4 ts=4 et tw=80 : */
