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

    var OPLIST,
        OP,
        global,
        esprima,
        shibuya;

    OPLIST = [
        'LITERAL',
        'TO_OBJECT',
        'GETVALUE',
        'DUPTOP',
        'POP',
        'POP_AND_RET',
        'POP_ENV',
        'PUTVALUE',
        'RESOLVE',
        'BUILD_FUNCTION',
        'ARRAY_SETUP',
        'ARRAY_DEFINE',
        'ARRAY_CLEANUP',
        'BLOCK_SETUP',
        'WITH_SETUP',
        'WITH_CLEANUP',
        'UPDATE',
        'UNARY',
        'THIS',
        'UNDEFINED',
        'RETURN',
        'RETURN_EVAL',
        'JSR',
        'ROTATE',
        'THROW',
        'CALL',
        'CONSTRUCT',
        'ELEMENT',
        'PROPERTY',
        'OBJECT_SETUP',
        'OBJECT_DEFINE',
        'OBJECT_CLEANUP',
        'POP_JUMP',
        'JUMP_POP',
        'DEBUGGER',
        'JUMP',
        'BINDING_VAR',
        'BINDING_LET',
        'BINDING_CONST',
        'CHECK_ABRUPT',
    ];

    OP = OPLIST.reduce(function (ret, key, idx) {
        ret[key] = idx;
        return ret;
    }, {});


    function getOpcodeString(num) {
        return OPLIST[num];
    }

    global = Function('return this')();

    if (typeof process !== 'undefined') {
        esprima = require('./esprima');
        shibuya = require('../shibuya');
    } else {
        esprima = global.esprima;
        shibuya = global.shibuya;
    }

    function Visitor() { }

    Visitor.prototype = {
        constructor: Visitor,
        visit: function (node) {
            return this[node.type](node);
        },
        AssignmentExpression: function (node) { },
        ArrayExpression: function (node) { },
        ArrayPattern: function (node) { },
        BlockStatement: function (node) { },
        BinaryExpression: function (node) { },
        BreakStatement: function (node) { },
        CallExpression: function (node) { },
        CatchClause: function (node) { },
        ConditionalExpression: function (node) { },
        ContinueStatement: function (node) { },
        DoWhileStatement: function (node) { },
        DebuggerStatement: function (node) { },
        EmptyStatement: function (node) { },
        ExportSpecifier: function (node) { },
        ExportSpecifierSet: function (node) { },
        ExportDeclaration: function (node) { },
        ExpressionStatement: function (node) { },
        ForStatement: function (node) { },
        ForInStatement: function (node) { },
        ForOfStatement: function (node) { },
        FunctionDeclaration: function (node) { },
        FunctionExpression: function (node) { },
        Glob: function (node) { },
        Identifier: function (node) { },
        IfStatement: function (node) { },
        ImportDeclaration: function (node) { },
        ImportSpecifier: function (node) { },
        Literal: function (node) { },
        LabeledStatement: function (node) { },
        LogicalExpression: function (node) { },
        MemberExpression: function (node) { },
        ModuleDeclaration: function (node) { },
        NewExpression: function (node) { },
        ObjectExpression: function (node) { },
        ObjectPattern: function (node) { },
        Path:  function (node) { },
        Program: function (node) { },
        Property: function (node) { },
        ProtoExpression: function (node) { },
        ReturnStatement: function (node) { },
        SequenceExpression: function (node) { },
        SwitchStatement: function (node) { },
        SwitchCase: function (node) { },
        ThisExpression: function (node) { },
        ThrowStatement: function (node) { },
        TryStatement: function (node) { },
        UnaryExpression: function (node) { },
        UpdateExpression: function (node) { },
        VariableDeclaration: function (node) { },
        VariableDeclarator: function (node) { },
        WhileStatement: function (node) { },
        WithStatement: function (node) { }
    };

    // StaticSemantics

    function StaticSemantics() {
    }

    StaticSemantics.prototype = shibuya.common.inherit(StaticSemantics, Visitor);

    // BoundNames

    function BoundNamesCollector() {
        this.names = [];
    }

    BoundNamesCollector.prototype = shibuya.common.inherit(BoundNamesCollector, Visitor);

    // FIXME spec bug
    // BoundNames to BindingRestElement

    BoundNamesCollector.prototype.Identifier = function (id) {
        this.names.push(id.name);
    };

    BoundNamesCollector.prototype.ObjectPattern = function (pattern) {
        pattern.properties.forEach(function (property) {
            this.visit(property.value);
        }, this);
    };

    BoundNamesCollector.prototype.ArrayPattern = function (pattern) {
        pattern.elements.forEach(function (element) {
            this.visit(element);
        }, this);
    };

    BoundNamesCollector.prototype.VariableDeclaration = function (decl) {
        decl.declarations.forEach(function (d) {
            this.visit(d.id);
        }, this);
    };

    BoundNamesCollector.prototype.FunctionDeclaration = function (decl) {
        this.visit(decl.id);
    };

    function BoundNames(decl) {
        var collector = new BoundNamesCollector();
        if (Array.isArray(decl)) {
            decl.forEach(function (param) {
                collector.visit(param);
            });
        } else {
            collector.visit(decl);
        }
        return collector.names;
    }

    // ExpectedArgumentCount

    function ExpectedArgumentCountCollector() {
        this.count = 0;
    }

    ExpectedArgumentCountCollector.prototype = shibuya.common.inherit(ExpectedArgumentCountCollector, Visitor);

    ExpectedArgumentCountCollector.prototype.Identifier = function (id) {
        this.count += 1;
    };

    ExpectedArgumentCountCollector.prototype.ObjectPattern = function (pattern) {
        this.count += 1;
    };

    ExpectedArgumentCountCollector.prototype.ArrayPattern = function (pattern) {
        this.count += 1;
    };

    function ExpectedArgumentCount(list) {
        var collector = new ExpectedArgumentCountCollector();
        list.forEach(function (param) {
            collector.visit(param);
        });
        return collector.count;
    }

    // LexicalDeclarations

    function LexicalDeclarations(list) {
        return list.reduce(function (result, decl) {
            if (decl.type === esprima.Syntax.VariableDeclaration) {
                if (decl.kind === 'let' || decl.kind === 'const') {
                    decl.IsConstantDeclaration = decl.kind === 'const';
                    decl.BoundNames = BoundNames(decl);
                    result.push(decl);
                }
            } else if (decl.type === esprima.Syntax.FunctionDeclaration) {
                decl.IsConstantDeclaration = false;
                decl.BoundNames = BoundNames(decl);
                result.push(decl);
            }
            // TODO(Constellation) laster we should add ClassDeclaration
            return result;
        }, []);
    };

    // Code

    function Code(source, tree) {
        this.source = source;
        this.tree = tree;
        this.instructions = [];
        if (tree.type === esprima.Syntax.Program) {
            this.LexicalDeclarations = LexicalDeclarations(tree.body);
            this.body = tree;
        } else {
            this.LexicalDeclarations = LexicalDeclarations(tree.body.body);
            this.body = tree.body;
        }
        this.variables = [];
        this.handlers = [];
        // TODO(Constellation) implement it
        this.kind = 'Normal';
        this.params = tree.params || [];
        this.params.BoundNames = BoundNames(this.params);
        this.params.ExpectedArgumentCount = ExpectedArgumentCount(this.params);
        this.VarDeclaredNames = [];
    }


    // Handler

    function Handler(type, begin, end) {
        this.type = type;
        this.begin = begin;
        this.end = end;
    }

    Handler.ENV = 0;
    Handler.FINALLY = 1;
    Handler.CATCH = 2;


    // Compiler

    function Compiler(options) {
        this.source = null;
        this.tree = null;
        this.code = null;
        this.strict = null;
        this.pending = null;
        this.levelStack = null;
        this.jumpStack = null;
        this.labelSet = null;
        this.options = options || {};
    }

    Compiler.prototype = shibuya.common.inherit(Compiler, Visitor);

    Compiler.prototype.compile = function (source) {
        var code;

        this.source = source;
        this.tree = esprima.parse(source, {
            range: true
        });

        if (this.options.function) {
            this.tree = this.tree.body[0].expression;
            shibuya.common.assert(this.tree.type === esprima.Syntax.FunctionExpression);
        }

        this.pending = [];
        this.levelStack = [];
        this.jumpStack = [];
        this.labelSet = null;

        code = new Code(this.source, this.tree);

        if (this.options.eval) {
            code.Type = 'eval';
        }

        this.pending.push(code);
        while (this.pending.length) {
            this.doCompile(this.pending.pop());
        }
        return code;
    };

    Compiler.prototype.doCompile = function (code) {
        this.code = code;
        this.visit(code.body);
        if (this.code.eval) {
            this.emit({
                opcode: OP.RETURN_EVAL
            });
        } else {
            this.emit({
                opcode: OP.UNDEFINED
            });
            this.emit({
                opcode: OP.RETURN
            });
        }
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

    Compiler.prototype.emitToObject = function (section) {
        this.emit({
            opcode: OP.TO_OBJECT,
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

    Compiler.prototype.emitPutValue = function (section) {
        this.emit({
            opcode: OP.PUTVALUE,
            section: section
        });
    };

    Compiler.prototype.lookupLabel = function (isContinue, label) {
        var name, len, entry;
        if (label) {
            name = label.name;
            len = this.jumpStack.length;
            while (len--) {
                entry = this.jumpStack[len];
                if (shibuya.common.has(entry.labels, name)) {
                    if (isContinue && !entry.continues) {
                        // continue to block
                        throw new SyntaxError('out label');
                    }
                    return entry;
                }
            }
            throw new SyntaxError('label not found');
        } else {
            len = this.jumpStack.length;
            while (len--) {
                entry = this.jumpStack[len];
                if (!isContinue || entry.continues) {
                    return entry;
                }
            }
            throw new SyntaxError('label not found');
        }
    };

    Compiler.prototype.withBreakBlock = function (func) {
        if (this.labelSet) {
            var entry = {
                labels: this.labelSet,
                breaks: [],
                continues: null,
                level: this.levelStack.length
            };
            this.jumpStack.push(entry);
            this.labelSet = {};
            func.call(this, function (b) {
                entry.breaks.forEach(function (instr) {
                    instr.position = b;
                });
            });
            this.jumpStack.pop();
        } else {
            func.call(this, function (b) { });
        }
    };

    Compiler.prototype.withContinue = function (func) {
        var entry = {
            labels: this.labelSet,
            breaks: [],
            continues: [],
            level: this.levelStack.length
        };
        this.jumpStack.push(entry);
        this.labelSet = {};
        func.call(this, function (b, c) {
            entry.breaks.forEach(function (instr) {
                instr.position = b;
            });
            entry.continues.forEach(function (instr) {
                instr.position = c;
            });
        });
        this.jumpStack.pop();
    };

    Compiler.prototype.addEnvironmentHandler = function (func) {
        var begin, end;
        begin = this.code.instructions.length;
        func.call(this);
        end = this.code.instructions.length;
        this.code.handlers.push(new Handler(Handler.ENV, begin, end));
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
            this.emit({
                opcode: OP.BINARY,
                operator: expr.operator
            });
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
                this.emit({
                    opcode: ARRAY_DEFINE,
                    spread: true
                });
            } else {
                this.visit(element);
                this.emitArrayDefine({
                    opcode: ARRAY_DEFINE,
                    spread: false
                });
            }
        }, this);
        this.emit({
            opcode: OP.ARRAY_CLEANUP,
            section: '11.1.4.1'
        });
    };

    Compiler.prototype.BinaryExpression = function (expr) {
        this.visit(expr.left);
        this.emitGetValue();
        this.visit(expr.right);
        this.emitGetValue();
        this.emit({
            opcode: OP.BINARY,
            operator: expr.operator
        });
    };

    Compiler.prototype.BreakStatement = function (stmt) {
        var len, entry, instr;

        entry = this.lookupLabel(false, stmt.label);
        for (len = this.levelStack.length; len > entry.level; --len) {
            level = this.levelStack[len - 1];
            switch (level.type) {
            case Level.FINALLY:
                instr = {
                    opcode: OP.JSR,
                    return: false,
                    position: 0
                };
                this.emit(instr);
                level.entries.push(instr);
                break;
            case Level.WITH:
                this.emit({
                    opcode: OP.POP_ENV
                });
                break;
            case Level.SUBROUTINE:
                this.emitPop(3);
                break;
            case Level.FORIN:
                if (entry.level + 1 != len) {
                    this.emitPop(1);
                }
                break;
            }
        }

        instr = {
            opcode: OP.JUMP,
            position: 0
        };
        this.emit(instr);
        entry.breaks.push(instr);
    };

    Compiler.prototype.BlockStatement = function (block) {
        var instr;
        this.withBreakBlock(function (patch) {
            this.addEnvironmentHandler(function () {
                this.emit({
                    opcode: OP.BLOCK_SETUP,
                    section: '12.1',
                    LexicalDeclarations: LexicalDeclarations(block.body)
                });

                block.body.forEach(function (stmt) {
                    this.visit(stmt);
                }, this);

                this.emit({
                    opcode: OP.POP_ENV,
                    section: '12.1'
                });
            });
            patch(this.current());
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
        this.emit({
            opcode: OP.CALL,
            argc: expr.arguments.length
        });
    };

    Compiler.prototype.CatchClause = function (stmt) {
        UNREACHABLE();
    };

    Compiler.prototype.ConditionalExpression = function (expr) {
        var instr1, instr2;
        this.visit(expr.test);
        this.emitGetValue();
        instr1 = {
            opcode: POP_JUMP,
            test: false,
            position: 0
        };
        this.emit(instr1);
        this.visit(expr.consequent);
        this.emitGetValue();
        instr2 = {
            opcode: JUMP,
            position: 0
        };
        this.emit(instr2);
        instr1.position = this.current();
        this.visit(expr.alternate);
        this.emitGetValue();
        instr2.position = this.current();
    };

    Compiler.prototype.ContinueStatement = function (stmt) {
        var len, entry, instr;

        entry = this.lookupLabel(true, stmt.label);
        for (len = this.levelStack.length; len > entry.level; --len) {
            level = this.levelStack[len - 1];
            switch (level.type) {
            case Level.FINALLY:
                instr = {
                    opcode: OP.JSR,
                    return: false,
                    position: 0
                };
                this.emit(instr);
                level.entries.push(instr);
                break;
            case Level.WITH:
                this.emit({
                    opcode: OP.POP_ENV
                });
                break;
            case Level.SUBROUTINE:
                this.emitPop(3);
                break;
            case Level.FORIN:
                if (entry.level + 1 != len) {
                    this.emitPop(1);
                }
                break;
            }
        }

        instr = {
            opcode: OP.JUMP,
            position: 0
        };
        this.emit(instr);
        entry.continues.push(instr);
    };

    Compiler.prototype.DoWhileStatement = function (stmt) {
        this.withContinue(function (patch) {
            var start, cond;
            start = this.current();
            this.visit(stmt.body);
            cond = this.current();
            this.visit(stmt.test);
            this.emitGetValue();
            this.emit({
                opcode: OP.POP_JUMP,
                test: true,
                position: start
            });
            patch(this.current(), cond);
        });
    };

    Compiler.prototype.DebuggerStatement = function (stmt) {
        this.emit({
            opcode: OP.DEBUGGER
        });
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
        if (this.code.eval) {
            this.emit({
                opcode: POP_AND_RET
            });
        } else {
            this.emitPop(1);
        }
    };

    Compiler.prototype.ForStatement = function (stmt) {
        this.withContinue(function (patch) {
            var instr, cond, update;

            if (stmt.init) {
                if (stmt.init.type === esprima.Syntax.VariableDeclaration) {
                    this.visit(stmt.init);
                } else {
                    this.visit(stmt.init);
                    this.emitGetValue();
                    this.emitPop(1);
                }
            }

            cond = this.current();
            if (stmt.test) {
                this.visit(stmt.test);
                this.emitGetValue();
                instr = {
                    opcode: OP.POP_JUMP,
                    test: false,
                    position: 0
                };
                this.emit(instr);
            }

            this.visit(stmt.body);

            update = this.current();
            if (stmt.update) {
                this.visit(stmt.update);
                this.emitGetValue(stmt.update);
                this.emitPop(1);
            }

            this.emit({
                opcode: OP.JUMP,
                position: cond
            });

            instr.position = this.current();
            patch(this.current(), update);
        });
    };

    Compiler.prototype.ForInStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.ForOfStatement = function (stmt) {
        // TODO(Constellation) implement it
    };

    Compiler.prototype.FunctionDeclaration = function (decl) {
        var code = new Code(this.source, decl);
        decl.Code = code;
        this.pending.push(code);
    };

    Compiler.prototype.FunctionExpression = function (expr) {
        var code = new Code(this.source, expr);
        this.pending.push(code);
        this.emit({
            opcode: OP.BUILD_FUNCTION,
            code: code,
            name: expr.id
        });
    };

    Compiler.prototype.Identifier = function (expr) {
        this.emit({
            opcode: OP.RESOLVE,
            name: expr.name
        });
    };

    Compiler.prototype.IfStatement = function (stmt) {
        var instr;
        this.visit(stmt.test);
        this.emitGetValue();
        instr = {
            opcode: OP.POP_JUMP,
            test: false,
            position: 0
        };
        this.emit(instr);
        this.visit(stmt.consequent);
        instr.position = this.current();
        if (stmt.alternate) {
            instr = {
                opcode: OP.JUMP,
                position: 0
            };
            this.emit(instr);
            this.visit(stmt.alternate);
            instr.position = this.current();
        }
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
            literal: expr
        });
    };

    Compiler.prototype.LabeledStatement = function (stmt) {
        if (!this.labelSet) {
            this.labelSet = {};
        } else if (shibuya.common.has(this.labelSet, label)) {
            throw new SyntaxError('duplicate label');
        }
        this.labelSet[stmt.label.name] = true;
        this.visit(stmt.body);
        this.labelSet = null;
    };

    Compiler.prototype.LogicalExpression = function (expr) {
        var instr;
        this.visit(expr.left);
        this.emitGetValue();
        instr = {
            opcode: OP.JUMP_POP,
            test: expr.operator === '||',
            position: 0
        };
        this.emit(instr);
        this.visit(expr.right);
        this.emitGetValue();
        instr.position = this.current();
    };

    Compiler.prototype.MemberExpression = function (expr) {
        this.visit(expr.object);
        this.emitGetValue();
        if (expr.computed) {
            this.visit(expr.property);
            this.emitGetValue();
            this.emit({
                opcode: OP.ELEMENT
            });
        } else {
            this.emit({
                opcode: OP.PROPERTY,
                name: expr.property.name
            });
        }
    };

    Compiler.prototype.ModuleDeclaration = function (decl) {
        UNREACHABLE();
    };

    Compiler.prototype.NewExpression = function (expr) {
        this.visit(expr.callee);
        this.emitDupTop();
        this.emitGetValue();
        expr.arguments.forEach(function (arg) {
            this.visit(arg);
            this.emitGetValue();
        }, this);
        this.emit({
            opcode: OP.CONSTRUCT,
            argc: expr.arguments.length
        });
    };

    Compiler.prototype.ObjectExpression = function (expr) {
        this.emit({
            opcode: OBJECT_SETUP
        });
        expr.properties.forEach(function (property) {
            this.visit(property);
        }, this);
        this.emit({
            opcode: OBJECT_CLEANUP
        });
    };

    Compiler.prototype.Program = function (program) {
        program.body.forEach(function (stmt) {
            this.visit(stmt);
        }, this);
    };

    Compiler.prototype.Property = function (property) {
        this.visit(property.value);
        this.emitGetValue();
        this.emit({
            opcode: OBJECT_DEFINE,
            name: property.id.name,
            kind: property.kind
        });
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
                instr = {
                    opcode: OP.JSR,
                    return: true,
                    position: 0
                };
                this.emit(instr);
                level.entries.push(instr);
                break;
            case Level.WITH:
                this.emit({
                    opcode: OP.POP_ENV
                });
                break;
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
        this.visit(stmt.argument);
        this.emitGetValue();
        this.emit({
            opcode: OP.THROW
        });
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
        switch (stmt.kind) {
        case 'var':
            stmt.declarations.forEach(function (declarator) {
                if (declarator.init) {
                    this.visit(declarator.init);
                    this.emitGetValue();
                    this.emit({
                        opcode: OP.BINDING_VAR,
                        environment: false,
                        pattern: declarator.id
                    });
                }
                this.code.VarDeclaredNames.push(declarator.id.name);
            }, this);
            break;
        case 'const':
            stmt.declarations.forEach(function (declarator) {
                shibuya.common.assert(declarator.init);
                this.visit(declarator.init);
                this.emitGetValue();
                this.emit({
                    opcode: OP.BINDING_CONST,
                    environment: true,
                    pattern: declarator.id
                });
            }, this);
            break;
        case 'let':
            stmt.declarations.forEach(function (declarator) {
                if (declarator.init) {
                    this.visit(declarator.init);
                    this.emitGetValue();
                } else {
                    this.emit({
                        opcode: OP.UNDEFINED
                    });
                }
                this.emit({
                    opcode: OP.BINDING_LET,
                    environment: true,
                    pattern: declarator.id
                });
            }, this);
            break;
        }
    };

    Compiler.prototype.VariableDeclarator = function (stmt) {
        UNREACHABLE();
    };

    Compiler.prototype.WhileStatement = function (stmt) {
        this.withContinue(function (patch) {
            var instr, start;
            start = this.current();
            this.visit(stmt.test);
            this.emitGetValue();
            instr = {
                opcode: OP.POP_JUMP,
                test: false,
                position: 0
            };
            this.emit(instr);
            this.visit(stmt.body);
            this.emit({
                opcode: OP.JUMP,
                position: start
            });
            instr.position = this.current();
            patch(this.current(), start);
        });
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

    function compile(source, opt) {
        var compiler = new Compiler(opt);
        return compiler.compile(source);
    }

    exports.OP = OP;
    exports.Handler = Handler;
    exports.Code = Code;
    exports.compile = compile;
    exports.getOpcodeString = getOpcodeString;
}(typeof exports === 'undefined' ? (shibuya.compiler = {}) : exports));
/* vim: set sw=4 ts=4 et tw=80 : */
