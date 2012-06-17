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

    var OP,
        global,
        esprima,
        shibuya;

    OP = {
        LITERAL: 0,
        GETVALUE: 1,
        DUPTOP: 2,
        POP: 3,
        POP_AND_RET: 4,
        PUTVALUE: 5,
        RESOLVE: 6,
        BUILD_FUNCTION: 7,
        ARRAY_SETUP: 8,
        ARRAY_CLEANUP: 9,
        BLOCK_SETUP: 10,
        BLOCK_CLEANUP: 11,
        WITH_SETUP: 12,
        WITH_CLEANUP: 13,
        UPDATE: 14,
        UNARY: 15,
        THIS: 16,
        UNDEFINED: 17,
        RETURN: 18,
        JSR: 19,
        ROTATE: 20
    };

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

    function Code(source, tree) {
        this.source = source;
        this.tree = tree;
        this.instructions = [];
        this.declarations = [];
        this.variables = [];
    }

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
        this.pending = null;
    }

    Compiler.prototype = Object.create(Visitor.prototype);

    Compiler.prototype.compile = function (source) {
        var code;

        this.source = source;
        this.tree = esprima.parse(source, {
            range: true
        });

        this.pending = [];

        code = new Code(this.source, this.tree);
        this.pending.push(code);
        while (this.pending.length) {
            this.doCompile(this.pending.pop());
        }
        return code;
    };

    Compiler.prototype.doCompile = function (code) {
        this.code = code;
        this.visit(code.tree);
        return code;
    };

    Compiler.prototype.current = function () {
        return this.code.instructions.length;
    };

    Compiler.prototype.emit = function (instr) {
        this.code.instructions.push(instr);
    };

    Compiler.prototype.emitGetValue = function (section) {
        this.emit({
            opcode: OP.GETVALUE,
            section: section
        });
    };

    Compiler.prototype.emitDupTop = function () {
        this.emit({
            opcode: OP.DUPTOP
        });
    };

    Compiler.prototype.emitRotate = function (n) {
        this.emit({
            opcode: OP.ROTATE,
            number: n
        });
    };

    Compiler.prototype.emitPop = function (n) {
        this.emit({
            opcode: OP.POP,
            number: n
        });
    };

    Compiler.prototype.emitPopAndRet = function () {
        this.emit({
            opcode: OP.POP_AND_RET
        });
    };

    Compiler.prototype.emitPutValue = function (section) {
        this.emit({
            opcode: OP.PUTVALUE,
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
            opcode: OP.ARRAY_SETUP,
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
            opcode: OP.ARRAY_CLEANUP,
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

    Compiler.prototype.BlockStatement = function (block) {
        this.addEnvironmentHandler(function () {
            this.emit({
                opcode: OP.BLOCK_SETUP,
                section: '12.1'
            });

            block.body.forEach(function (stmt) {
                this.visit(stmt);
            }, this);

            this.emit({
                opcode: OP.BLOCK_CLEANUP,
                section: '12.1'
            });
        });
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
            this.emitPopAndRet();
        } else {
            this.emitPop(1);
        }
    };

    Compiler.prototype.ForStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.ForInStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.ForOfStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.FunctionDeclaration = function (decl) {
        var code = new Code(this.source, decl);
        this.pending.push(code);
        this.code.declarations.push(code);
    };

    Compiler.prototype.FunctionExpression = function (expr) {
        var code = new Code(this.source, expr);
        this.pending.push(code);
        this.emit({
            opcode: OP.BUILD_FUNCTION,
            code: code
        });
    };

    Compiler.prototype.Identifier = function (expr) {
        this.visitResolve({
            opcode: OP.RESOLVE,
            name: expr.name
        });
    };

    Compiler.prototype.IfStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.ImportDeclaration = function (decl) {
        throw new SyntaxError('currently not support import specifier');
    };

    Compiler.prototype.ImportSpecifier = function (spec) {
        throw new SyntaxError('currently not support import specifier');
    };

    Compiler.prototype.Literal = function (expr) {
        this.emit({
            opcode: OP.LITERAL,
            expression: expr
        });
    };

    Compiler.prototype.Program = function (program) {
        program.body.forEach(function (stmt) {
            this.visit(stmt);
        }, this);
    };

    Compiler.prototype.Property = function (property) {
        UNREACHABLE();
    };

    Compiler.prototype.ReturnStatement = function (stmt) {
        var len, level;
        if (stmt.argument) {
            this.visit(stmt.argument);
            this.emitGetValue();
        } else {
            this.emit({
                opcode: UNDEFINED
            });
        }

        for (len = this.levelStack.length; len > 0; --len) {
            level = this.levelStack[len - 1];
            switch (level.type) {
            case Level.FINALLY:
                // TODO(Constellation) implement JSR
                this.emit({
                    opcode: OP.JSR,
                    return: true,
                    position: this.current()
                });
            case Level.WITH:
                this.emit({
                    opcode: OP.POPENV
                });
            case Level.SUBROUTINE:
                this.emitRotate(4);
                this.emitPop(4);
                break;
            case Level.FORIN:
                this.emitRotate(2);
                this.emitPop(1);
                break;
            }
        }
        this.emit({
            opcode: OP.RETURN
        });
    };

    Compiler.prototype.SequenceExpression = function (expr) {
        var i, len;
        for (i = 0, len = expr.expressions.length; i < len; ++i) {
            this.visit(expr.expressions[i]);
            this.emitGetValue();
            this.emitPop(1);
        }
        // last
        this.visit(expr.expressions[i]);
        this.emitGetValue();
    };

    Compiler.prototype.SwitchStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.SwitchCase = function (clause) {
        UNREACHABLE();
    };

    Compiler.prototype.ThisExpression = function (expr) {
        this.emit({
            opcode: OP.THIS
        });
    };

    Compiler.prototype.ThrowStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.TryStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.UnaryExpression = function (expr) {
        this.visit(expr.argument);
        this.emit({
            opcode: OP.UNARY,
            operator: expr.operator
        });
    };

    Compiler.prototype.UpdateExpression = function (expr) {
        if (expr.prefix) {
            this.visit(expr.argument);
            this.emit({
                opcode: OP.UPDATE,
                prefix: true,
                increment: expr.operator === '++'
            });
        } else {
            this.visit(expr.argument);
            this.emit({
                opcode: OP.UPDATE,
                prefix: false,
                increment: expr.operator === '++'
            });
        }
    };

    Compiler.prototype.VariableDeclaration = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.VariableDeclarator = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.WhileStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.WithStatement = function (stmt) {
        this.visit(stmt.object);
        this.emitGetValue('12.10-2');
        this.emitToObject('12.10-2');
        this.addEnvironmentHandler(function () {
            this.emit({
                opcode: OP.WITH_SETUP,
            });

            this.visit(stmt.body);

            this.emit({
                opcode: OP.WITH_CLEANUP,
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

    exports.OP = OP;
    exports.Handler = Handler;
    exports.Code = Code;
    exports.compile = compile;
}(typeof exports === 'undefined' ? (shibuya.compiler = {}) : exports));
/* vim: set sw=4 ts=4 et tw=80 : */
