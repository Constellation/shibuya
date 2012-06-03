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

    var NativeBrand = {
        NativeFunction: 'NativeFunction',
        NativeArray: 'NativeArray',
        StringWrapper: 'StringWrapper',
        BooleanWrapper: 'BooleanWrapper',
        NumberWrapper: 'NumberWrapper',
        NativeMath: 'NativeMath',
        NativeDate: 'NativeDate',
        NativeRegExp: 'NativeRegExp',
        NativeError: 'NativeError',
        NativeJSON: 'NativeJSON',
        NativeArguments: 'NativeArguments',
        NativePrivateName: 'NativePrivateName'
    };

    function List() {
        return [];
    }

    function Internalize(str) {
        return '[[' + str + ']]';
    }

    var slice = Array.prototype.slice;

    function Completion(type, value, target) {
        this.type = type;
        this.value = value;
        this.target = target;
    }

    Completion.Type = {
        normal: 'normal',
        break: 'break',
        continue: 'continue',
        return: 'return',
        throw: 'throw'
    };

    Completion.Target = {
        empty: 0
    };

    function NormalCompletion(value) {
        return new Completion(Completion.Type.normal, value, Completion.Empty);
    }

    function ThrowCompletion(error) {
        return new Completion(Completion.Type.throw, error, Completion.Empty);
    }

    // Abstract Operation Completion wrapper
    function AbstractOperation(func) {
        function EntryPoint() {
            var ret;
            try {
                ret = func.apply(this, arguments);
                if (ret instanceof Completion) {
                    return ret;
                }
                return NormalCompletion(ret);
            } catch (e) {
                return ThrowCompletion(e);
            }
        }
        EntryPoint.AO = true;
        return EntryPoint;
    }

    // ReturnIfAbrupt
    //   if (isAbruptCompletion(v)) { return v; } else if (v instanceof Completion) { v = v.value; }

    function Type(x) {
        if (x instanceof Reference) {
            return 'Reference';
        }
        if (x instanceof JSObject) {
            return 'Object';
        }
        if (x === null) {
            return 'null';
        }
        return typeof x;
    }

    function isAbruptCompletion(completion) {
        return completion instanceof Completion && completion.type !== Completion.Type.normal;
    }

    // 8.9 The Reference Specification Type

    function Reference(base, name, strict) {
        this.base = base;
        this.name = name;
        this.strict = strict;
    }

    function GetBase(V) {
        return V.base;
    }

    function GetReferencedName(V) {
        return V.name;
    }

    function IsStrictReference(V) {
        return V.strict;
    }

    function HasPrimitiveBase(V) {
        var type = typeof V.base;
        return type === 'string' || type === 'boolean' || type === 'number';
    }

    function IsPropertyReference(V) {
        return V.base instanceof JSObject || HasPrimitiveBase(V)
    }

    function IsUnresolvableReference(V) {
        return V.base === undefined;
    }

    function IsSuperReference(V) {
        return V.hasOwnProperty('thisValue');
    }

    // 8.9.1 GetValue (V)
    var GetValue = AbstractOperation(function (V) {
        var base, get;

        // 8.9.1-1
        // ReturnIfAbrupt
        if (isAbruptCompletion(V)) { return V; } else if (V instanceof Completion) { V = V.value; }

        // 8.9.1-2
        if (Type(V) === 'Reference') {
            return V;
        }

        // 8.9.1-3
        base = GetBase(V);

        // 8.9.1-4
        if (IsUnresolvableReference(V)) {
            throw new ReferenceError('8.9.1-4');
        }

        // 8.9.1-5
        if (IsPropertyReference(V)) {
            // 8.9.1-5-a
            if (!HasPrimitiveBase(V)) {
                get = base.Get;
            } else {
                get = SpecialGet;
            }

            // 8.9.1-5-b
            if (isSuperReference(V)) {
                // 8.9.1-5-b-i
                return get.call(base, GetReferencedName(V));
            } else {  // 8.9.1-5-c
                // 8.9.1-5-c-i
                return get.call(base, GetReferencedName(V), ThisValue(V));
            }
        } else {  // 8.9.1-6
            // base must be an environment record
            // 8.9.1-6-a
            return base.GetBindingValue(GetReferencedName(V), IsStrictReference(V));
        }
    });

    var SpecialGet = AbstractOperation(function (P, accessorThisValue) {
        var base, O, desc, getter;
        // remove wrapper
        base = this.valueOf();

        O = ToObject(base);
        desc = O.GetProperty(P);
        if (desc === undefined) {
            return undefined;
        }

        if (IsDataDescriptor(desc)) {
            return desc.Value;
        } else {
            assert(IsAccessorDescriptor(desc));
            getter = desc.Get;
        }

        if (getter === undefined) {
            return undefined;
        }

        if (arguments.length === 1) {
            accessorThisValue = base;
        }

        return getter.Call(accessorThisValue, []);
    });

    // 8.9.2 PutValue (V, W)
    var PutValue = AbstractOperation(function (V, W) {
        var base;

        // ReturnIfAbrupt
        if (isAbruptCompletion(V)) { return V; } else if (V instanceof Completion) { V = V.value; }

        // ReturnIfAbrupt
        if (isAbruptCompletion(W)) { return W; } else if (W instanceof Completion) { W = W.value; }

        if (Type(V) !== 'Reference') {
            throw new ReferenceError('8.9.2-3');
        }

        base = GetBase(V);

        if (IsUnresolvableReference(V)) {
            if (IsStrictReference(V)) {
                throw new ReferenceError('8.9.2-5-a-i');
            }
            return global.Put(GetReferencedName(V), W, false);
        } else if (IsPropertyReference(V)) {
            if (!HasPrimitiveBase(V)) {
                put = base.Put;
            } else {
                put = SpecialPut;
            }
            if (!IsSuperReference(V)) {
                return put.call(base, GetReferencedName(V), W, IsStrictReference(V));
            } else {
                return put.call(base, GetReferencedName(V), W, IsStrictReference(V), ThisValue(V));
            }
        } else {
            // base must be an environment record
            return base.SetMutableBinding(GetReferencedName(V), W, IsStrictReference(V));
        }
        return undefined;
    });

    var SpecialPut = AbstractOperation(function (P, W, Throw, accessorThisValue) {
        var base, O, desc;
        // remove wrapper
        base = this.valueOf();

        O = ToObject(base);

        // FIXME(Constellation) inserted
        // ReturnIfAbrupt
        if (isAbruptCompletion(O)) { return O; } else if (O instanceof Completion) { O = O.value; }

        if (base.CanPut(P)) {
        }
        desc = O.GetProperty(P);
        if (desc === undefined) {
            return undefined;
        }

        if (IsDataDescriptor(desc)) {
            return desc.Value;
        } else {
            assert(IsAccessorDescriptor(desc));
            getter = desc.Get;
        }

        if (getter === undefined) {
            return undefined;
        }

        if (arguments.length === 1) {
            accessorThisValue = base;
        }

        return getter.Call(accessorThisValue, []);
    });

    var GetThisValue = AbstractOperation(function (V) {
        // ReturnIfAbrupt
        if (isAbruptCompletion(V)) { return V; } else if (V instanceof Completion) { V = V.value; }

        if (Type(V) !== 'Reference') {
            return V;
        }

        if (IsUnresolvableReference(V)) {
            throw new ReferenceError('8.9.3-3');
        }

        if (IsSuperReference(V)) {
            return V.thisValue;
        }

        return GetBase(V);
    });

    // 8.10.1 IsAccessorDescriptor(Desc)
    function IsAccessorDescriptor(Desc) {
        if (Desc === undefined) {
            return false;
        }
        if (!Desc.hasOwnProperty('Get') && !Desc.hasOwnProperty('Set')) {
            return false;
        }
        return true;
    }

    // 8.10.2 IsDataDescriptor(Desc)
    function IsDataDescriptor(Desc) {
        if (Desc === undefined) {
            return false;
        }
        if (!Desc.hasOwnProperty('Value') && !Desc.hasOwnProperty('Writable')) {
            return false;
        }
        return true;
    }

    // 8.10.2 IsGenericDescriptor(Desc)
    function IsGenericDescriptor(Desc) {
        if (Desc === undefined) {
            return false;
        }
        if (!IsAccessorDescriptor(Desc) && !IsDataDescriptor(Desc)) {
            return true;
        }
        return false;
    }

    // 8.10.4 FromPropertyDescriptor(Desc)
    function FromPropertyDescriptor(Desc) {
        var obj;

        if (Desc === undefined) {
            return undefined;
        }

        obj = ObjectCreate();  // TODO(Constellation) this is abstract operation

        if (IsDataDescriptor(Desc)) {
            obj.DefineOwnProperty('value', {
                Value: Desc.Value,
                Writable: true,
                Enumerable: true,
                Configurable: true
            }, false);
            obj.DefineOwnProperty('writable', {
                Value: Desc.Writable,
                Writable: true,
                Enumerable: true,
                Configurable: true
            }, false);
        } else if (IsAccessorDescriptor(Desc)) {
            obj.DefineOwnProperty('get', {
                Value: Desc.Get,
                Writable: true,
                Enumerable: true,
                Configurable: true
            }, false);
            obj.DefineOwnProperty('set', {
                Value: Desc.Set,
                Writable: true,
                Enumerable: true,
                Configurable: true
            }, false);
        }

        obj.DefineOwnProperty('enumerable', {
            Value: Desc.Enumerable,
            Writable: true,
            Enumerable: true,
            Configurable: true
        }, false);

        obj.DefineOwnProperty('configurable', {
            Value: Desc.Configurable,
            Writable: true,
            Enumerable: true,
            Configurable: true
        }, false);

        return obj;
    }


    // 8.10.5 ToPropertyDescriptor(Desc)
    var ToPropertyDescriptor = AbstractOperation(function (Obj) {
        var desc, enumerable, conf, value, writable, getter, setter;

        ReturnIfAbrupt(Obj);

        if (Type(Obj) !== 'Object') {
            throw new TypeError('8.10.5-2');
        }

        desc = { };

        if (Obj.HasProperty('enumerable')) {
            enumerable = Obj.Get('enumerable');
            ReturnIfAbrupt(enumerable);
            desc.Enumerable = ToBoolean(enumerable);
        }

        if (Obj.HasProperty('configurable')) {
            conf = Obj.Get('configurable');
            ReturnIfAbrupt(conf);
            desc.Configurable = ToBoolean(conf);
        }

        if (Obj.HasProperty('value')) {
            value = Obj.Get('value');
            ReturnIfAbrupt(value);
            desc.Value = value;
        }

        if (Obj.HasProperty('writable')) {
            writable = Obj.Get('writable');
            ReturnIfAbrupt(writable);
            desc.Writable = ToBoolean(writable);
        }

        if (Obj.HasProperty('get')) {
            getter = Obj.Get('get');
            ReturnIfAbrupt(getter);
            if (!IsCallable(getter) && getter !== undefined) {
                throw new TypeError('8.10.5-8-c');
            }
            desc.Get = getter;
        }

        if (Obj.HasProperty('set')) {
            setter = Obj.Get('set');
            ReturnIfAbrupt(setter);
            if (!IsCallable(setter) && setter !== undefined) {
                throw new TypeError('8.10.5-9-c');
            }
            desc.Set = setter;
        }

        if (desc.hasOwnProperty('Get') || desc.hasOwnProperty('Set')) {
            if (desc.hasOwnProperty('Value') || desc.hasOwnProperty('Writable')) {
                throw new TypeError('8.10.5-10-a');
            }
        }

        return desc;
    });

    // 9 Abstract Operations

    // 9.1.1
    var ToPrimitive = AbstractOperation(function (argument, PreferredType) {
        var type, defaultValue;

        if (argument instanceof Completion) {
            if (isAbruptCompletion(argument)) {
                return argument;
            }
            return ToPrimitive(argument.value);
        }

        if (argument === undefined) {
            return argument;
        }

        if (argument === null) {
            return argument;
        }

        type = typeof argument;

        if (type === 'boolean') {
            return argument;
        }

        if (type === 'number') {
            return argument;
        }

        if (type === 'string') {
            return argument;
        }

        assert(type === 'object');
        defaultValue = argument.DefaultValue(PreferredType);
        return ToPrimitive(defaultValue);
    });

    // no error
    // 9.1.2
    function ToBoolean(argument) {
        var type;

        if (argument instanceof Completion) {
            if (isAbruptCompletion(argument)) {
                return argument;
            }
            return ToBoolean(argument.value);
        }

        if (argument === undefined) {
            return false;
        }

        if (argument === null) {
            return false;
        }

        type = typeof argument;

        if (type === 'boolean') {
            return argument;
        }

        if (type === 'number') {
            return !!argument;
        }

        if (type === 'string') {
            return argument.length !== 0;
        }

        assert(type === 'object');
        return true;
    }

    // 9.1.3
    var ToNumber = AbstractOperation(function (argument) {
        var type, primValue;

        if (argument instanceof Completion) {
            if (isAbruptCompletion(argument)) {
                return argument;
            }
            return ToNumber(argument.value);
        }

        if (argument !== null && typeof argument === 'object') {
            primValue = ToPrimitive(argument, 'Number');
            return ToNumber(primValue);
        } else {
            return Number(argument);
        }
    });

    // 9.1.4
    var ToInteger = AbstractOperation(function (argument) {
        var number;

        number = ToNumber(argument);
        ReturnIfAbrupt(number);
        if (isNaN(number)) {
            return 0;
        }

        if (number === 0 || !isFinite(number)) {
            return number;
        }

        return ((number < 0) ? -1 : 1) * Math.floor(Math.abs(number));
    });

    // 9.1.5
    var ToInt32 = AbstractOperation(function (argument) {
        var number;
        number = ToNumber(argument);
        ReturnIfAbrupt(number);
        return number >> 0;
    });

    // 9.1.6
    var ToUint32 = AbstractOperation(function (argument) {
        var number;
        number = ToNumber(argument);
        ReturnIfAbrupt(number);
        return number >>> 0;
    });

    // 9.1.7
    var ToUint16 = AbstractOperation(function (argument) {
        var number;
        number = ToNumber(argument);
        ReturnIfAbrupt(number);
        return (number >>> 0) % (1 << 16);
    });

    // 9.1.8
    var ToString = AbstractOperation(function (argument) {
        var type, primValue;

        if (argument instanceof Completion) {
            if (isAbruptCompletion(argument)) {
                return argument;
            }
            return ToString(argument.value);
        }

        if (argument !== null && typeof argument === 'object') {
            primValue = ToPrimitive(argument, 'String');
            return ToString(primValue);
        } else {
            return String(argument);
        }
    });

    // 9.1.9
    var ToObject = AbstractOperation(function (argument) {
        var type, primValue;

        if (argument instanceof Completion) {
            if (isAbruptCompletion(argument)) {
                return argument;
            }
            return ToObject(argument.value);
        }

        if (argument == null) {
            // null or undefined
            throw new TypeError('9.1.9');
        }

        switch (typeof argument) {
            case 'object':
                return argument;
            case 'string':
                return StringObjectCreate(argument);
            case 'number':
                return NumberObjectCreate(argument);
            case 'boolean':
                return BooleanObjectCreate(argument);
        }
    });

    // 9.1.10
    var ToPropertyKey = AbstractOperation(function (argument) {
        ReturnIfAbrupt(argument);
        if (Type(argument) === 'Object') {
            if (argument.NativeBrand === NativeBrand.NativePrivateName) {
                return argument;
            }
        }
        return ToString(argument);
    });

    // 9.2.1
    var CheckObjectCoercible = AbstractOperation(function (argument) {
        var type, primValue;

        if (argument instanceof Completion) {
            if (isAbruptCompletion(argument)) {
                return argument;
            }
            return CheckObjectCoercible(argument.value);
        }

        if (argument == null) {
            // null or undefined
            throw new TypeError('9.2.1');
        }

        return argument;
    });

    // no error
    function IsCallable(argument) {
        var type, primValue;

        if (argument instanceof Completion) {
            if (isAbruptCompletion(argument)) {
                return argument;
            }
            return IsCallable(argument.value);
        }

        if (argument !== null && typeof argument === 'object') {
            return argument.hasOwnProperty('Call');
        }

        return false;
    }

    function SameValue(x, y) {
        ReturnIfAbrupt(x);
        ReturnIfAbrupt(y);

        if (Type(x) !== Type(y)) {
            return false;
        }

        if (Type(x) === 'number') {
            if (isNaN(x) && isNaN(y)) {
                return true;
            }
            if (x === 0 && (1 / x) === Infinity && y === 0 && (1 / y) === -Infinity) {
                return false;
            }
            if (x === 0 && (1 / x) === -Infinity && y === 0 && (1 / y) === Infinity) {
                return false;
            }
        }

        return x === y;
    }

    // 9.3.1
    var Invoke = AbstractOperation(function (P, O, args) {
        var obj, func;
        obj = ToObject(O);
        ReturnIfAbrupt(obj);
        func = obj.Get(P);
        ReturnIfAbrupt(func);
        if (!IsCallable(func)) {
            throw new TypeError('9.3.1-5');
        }
        return func.Call(O, args);
    });


    function DeclarativeEnvironmentRecords() {
        this.__Record = {};
    }

    // no error
    // 10.2.1.1.1
    DeclarativeEnvironmentRecords.prototype.HasBinding = function (N) {
        if (this.__Record.hasOwnProperty(N)) {
            return true;
        }
        return false;
    };

    // 10.2.1.1.2
    DeclarativeEnvironmentRecords.prototype.CreateMutableBinding = AbstractOperation(function (N, D) {
        assert(!this.__Record.hasOwnProperty(N));
        this.__Record[N] = {
            initialised: false,
            mutable: D
        };
    });

    // 10.2.1.1.3
    DeclarativeEnvironmentRecords.prototype.SetMutableBinding = AbstractOperation(function (N, V, S) {
        var binding;
        assert(this.__Record.hasOwnProperty(N));
        assert(this.__Record[N].initialised);

        binding = this.__Record[N];
        if (binding.mutable) {
            binding.value = V;
        } else if (!binding.initialised) {  // FIXME this is draft bug
            throw new ReferenceError('10.2.1.1.3-5');
        } else {
            if (S) {
                throw new TypeError('10.2.1.1.3-6');
            }
        }
    });

    // no error
    // 10.2.1.1.4
    DeclarativeEnvironmentRecords.prototype.GetBindingValue = function (N, S) {
        var binding;
        assert(this.__Record.hasOwnProperty(N));

        binding = this.__Record[N];
        if (!binding.initialised) {
            if (!S) {
                return undefined;
            }
            throw new ReferenceError('10.2.1.1.4-3-a');
        } else {
            return binding.value;
        }
    };

    // no error
    // 10.2.1.1.5
    DeclarativeEnvironmentRecords.prototype.DeleteBinding  = function (N) {
        var binding;
        if (!this.__Record.hasOwnProperty(N)) {
            return true;
        }
        binding = this.__Record[N];
        if (!binding.mutable) {
            return false;
        }
        delete this.__Record[N];
        return true;
    };

    // no error
    // 10.2.1.1.6
    DeclarativeEnvironmentRecords.prototype.CreateVarBinding = function (N, D) {
        return this.CreateMutableBinding(N, D);
    };

    // no error
    // 10.2.1.1.7
    DeclarativeEnvironmentRecords.prototype.HasThisBinding = function () {
        return false;
    };

    // no error
    // 10.2.1.1.8
    DeclarativeEnvironmentRecords.prototype.HasSuperBinding = function () {
        return false;
    };

    // no error
    // 10.2.1.1.9
    DeclarativeEnvironmentRecords.prototype.WithBaseObject = function () {
        return undefined;
    };

    // no error
    // 10.2.1.1.10
    DeclarativeEnvironmentRecords.prototype.CreateImmutableBinding = function (N) {
        assert(!this.__Record.hasOwnProperty(N));
        this.__Record[N] = {
            initialised: false,
            mutable: false
        };
    };

    // no error
    // 10.2.1.1.11
    DeclarativeEnvironmentRecords.prototype.InitializeBinding = function (N, V) {
        var binding;
        assert(this.__Record.hasOwnProperty(N));
        assert(!this.__Record[N].initialised);
        binding = this.__Record[N];
        binding.value = V;
        binding.initialised = true;
    };

    // 10.2.1.2
    function ObjectEnvironmentRecords(object) {
        this.__bindings = object;
    }

    // no error
    // 10.2.1.2.1
    ObjectEnvironmentRecords.prototype.HasBinding = function (N) {
        return this.__bindings.HasProperty(N);
    };

    // no error
    // 10.2.1.2.2
    ObjectEnvironmentRecords.prototype.CreateMutableBinding = function (N, D) {
        var configValue;
        assert(!this.HasBinding(N));  // makes this method no error
        if (D) {
            configValue = true;
        } else {
            configValue = false;
        }
        this.__bindings.DefineOwnProperty(N, {
            Value: undefined,
            Writable: true,
            Enumerable: true,
            COnfigurable: configValue
        }, true);
    };

    // 10.2.1.2.3
    ObjectEnvironmentRecords.prototype.SetMutableBinding = AbstractOperation(function (N, V, S) {
        // FIXME draft bug, should return completion
        return this.__bindings.Put(N, V, S);
    });

    // 10.2.1.2.4
    ObjectEnvironmentRecords.prototype.GetBindingValue = AbstractOperation(function (N, S) {
        var value;
        value = this.__bindings.HasProperty(N);
        if (!value) {
            if (!S) {
                return undefined;
            } else {
                throw new ReferenceError('10.2.1.2.4-4-a');
            }
        }
        return this.__bindings.Get(N);
    });

    // no error
    // 10.2.1.1.5
    ObjectEnvironmentRecords.prototype.DeleteBinding  = function (N) {
        return this.__bindings.Delete(N, false);
    };

    // TODO!
    // no error
    // 10.2.1.1.6
    ObjectEnvironmentRecords.prototype.CreateVarBinding = function (N, D) {
        return this.__decl.CreateMutableBinding(N, D);
    };

    // no error
    // 10.2.1.1.7
    ObjectEnvironmentRecords.prototype.HasThisBinding = function () {
        return false;
    };

    // no error
    // 10.2.1.1.8
    ObjectEnvironmentRecords.prototype.HasSuperBinding = function () {
        return false;
    };

    // no error
    // 10.2.1.1.9
    ObjectEnvironmentRecords.prototype.WithBaseObject = function () {
        if (this.withEnvironment) {
            return this.__bindings;
        } else {
            return undefined;
        }
    };

    // 10.2.1.3
    function MethodEnvironmentRecords() {
        DeclarativeEnvironmentRecords.call(this);
    }

    MethodEnvironmentRecords.prototype = Object.create(DeclarativeEnvironmentRecords.prototype);

    // 10.2.1.3.1
    MethodEnvironmentRecords.prototype.HasThisBinding = function() {
        return true;
    };

    // 10.2.1.3.2
    MethodEnvironmentRecords.prototype.HasSuperBinding = function() {
        if (this.HomeObject === undefined) {
            return false;
        } else {
            return true;
        }
    };

    // 10.2.1.3.3
    MethodEnvironmentRecords.prototype.GetThisBinding = function() {
        return this.thisValue;
    };

    // 10.2.1.3.4
    MethodEnvironmentRecords.prototype.GetHomeBinding = function() {
        return this.HomeObject;
    };

    // 10.2.1.3.5
    MethodEnvironmentRecords.prototype.GetMethodName = function() {
        return this.MethodName;
    };


    // TODO implement
    // 10.2.1.4
    function GlobalEnvironmentRecords() {
    }

    // 10.2.2.1
    function GetIdentifierReference(lex, name, strict) {
        var exists, outer;
        if (lex === null) {
            return new Reference(undefined, name, strict);
        }
        exists = lex.HasBinding(N);
        if (exists) {
            return new Reference(lex, name, strict);
        } else {
            outer = lex.outer;
            return GetIdentifierReference(outer, name, strict);
        }
    }

    // 10.2.2.2
    function NewDeclarativeEnvironment(E) {
        var env;
        env = new DeclarativeEnvironmentRecords();
        env.outer = E;
        return env;
    }

    // 10.2.2.3
    function NewObjectEnvironment(O, E) {
        var env;
        env = new ObjectEnvironmentRecords(O);
        env.outer = E;
        return env;
    }

    // 10.2.2.4
    function NewMethodEnvironment(F, T) {
        var env;
        env = new MethodEnvironmentRecords();
        env.thisValue = T;
        if (F.hasOwnProperty('Home')) {
            env.HomeObject = F.Home;
            env.MethodName = F.MethodName;
        }
        env.outer = F.Scope;
        return env;
    }

    // TODO
    // 10.3
    function Realm(debug) {
        this.intrinsics = null;
        this.this = null;
        this.globalEnv = null;
        this.loader = null;
    }

    // 10.4
    function ExecutionContext(state, PreviousContext, Realm, LexicalEnvironment, VariableEnvironment) {
        this.state = state;
        this.PreviousContext = PreviousContext;
        this.Realm = Realm;
        this.LexicalEnvironment = LexicalEnvironment;
        this.VariableEnvironment = VariableEnvironment;
    }


    // 10.4.2
    function IdentifierResolution(ctx, name, strict) {
        var env = ctx.LexicalEnvironment;
        return GetIdentifierReference(env, name, strict);
    }

    // 10.4.3
    function GetThisEnvironment(ctx) {
        var lex, exists;
        lex = ctx.LexicalEnvironment;
        while (true) {
            exists = lex.HasThisBinding();
            if (exists) {
                return lex;
            }
            lex = lex.outer;
        }
    }

    // 10.4.4
    function ThisResolution(ctx) {
        var env;
        env = GetThisEnvironment(ctx);
        return env.GetThisBinding();
    }

    function JSObject() {
        this.Prototype = null;
        this.Extensible = true;
        this.__Record = {};
    }

    // 8.12.2
    JSObject.prototype.Get = AbstractOperation(function Get(P, accessorThisValue) {
        var desc, getter;
        desc = this.GetProperty(P);
        if (desc === undefined) {
            return undefined;
        }
        if (IsDataDescriptor(desc)) {
            return desc.Value;
        } else {
            assert(IsAccessorDescriptor(desc));
            getter = desc.Get;
        }
        if (getter === undefined) {
            return undefined;
        }
        if (arguments.length === 1) {
            accessorThisValue = this;
        }
        return getter.Call(accessorThisValue, []);
    });

    // no error
    // 8.12.1
    JSObject.prototype.GetOwnProperty = function GetOwnProperty(P) {
        var D, X;
        if (!this.__Record.hasOwnProperty(P)) {
            return undefined;
        }
        D = {};
        X = this.__Record[P];
        if (IsDataDescriptor(X)) {
            D.Value = X.Value;
            D.Writable = X.Writable;
        } else if (IsAccessorDescriptor(X)) {
            D.Get = X.Get;
            D.Set = X.Set;
        }
        D.Enumerable = X.Enumerable;
        D.Configurable = X.Configurable;
        return D;
    };

    // no error
    // 8.12.2
    JSObject.prototype.GetProperty = function GetProperty(P) {
        var prop, proto;
        prop = this.GetOwnProperty(P);
        if (prop === undefined) {
            return prop;
        }
        proto = this.Prototype;
        if (proto === null) {
            return undefined;
        }
        return proto.GetProperty(P);
    };

    // 8.12.5
    JSObject.prototype.Put = AbstractOperation(function Put(P, V, Throw, accessorThisValue) {
        var ownDesc, valueDesc, desc, setter, newDesc;
        if (!this.CanPut(P)) {
            if (Throw) {
                throw new TypeError('8.12.5-1-a');
            } else {
                return undefined;
            }
        }
        ownDesc = this.GetOwnProperty(P);
        if (IsDataDescriptor(ownDesc)) {
            valueDesc = { Value: V };
            return this.DefineOwnProperty(P, valueDesc, Throw);
        }
        desc = this.GetProperty(P);
        if (IsAccessorDescriptor(desc)) {
            setter = desc.Set;
            assert(setter !== undefined);
            if (arguments.length === 4) {
                accessorThisValue = this;
            }
            // FIXME draft is bug!
            return setter.Call(accessorThisValue, [V]);
        } else {
            newDesc = { Value: V, Writable: true, Enumerable: true, Configurable: true };
            return this.DefineOwnProperty(P, newDesc, Throw);
        }
    });

    // no error
    // 8.12.4
    JSObject.prototype.CanPut = function CanPut(P) {
        var desc, proto, inherited;
        desc = this.GetOwnProperty(P);
        if (desc !== undefined) {
            if (IsAccessorDescriptor(desc)) {
                if (desc.Set === undefined) {
                    return false;
                } else {
                    return true;
                }
            } else {
                assert(IsDataDescriptor(desc));
                return desc.Writable;
            }
        }
        proto = this.Prototype;
        if (proto === null) {
            return this.Extensible;
        }
        inherited = proto.GetProperty(P);
        if (inherited === undefined) {
            return this.Extensible;
        }
        if (IsAccessorDescriptor(inherited)) {
            if (inherited.Set === undefined) {
                return false;
            } else {
                return true;
            }
        } else {
            assert(IsDataDescriptor(inherited));
            if (!this.Extensible) {
                return false;
            } else {
                return inherited.Writable;
            }
        }
    };

    // no error
    // 8.12.4
    JSObject.prototype.HasProperty = function HasProperty(P) {
        var desc;
        desc = this.GetProperty(P);
        if (desc === undefined) {
            return false;
        } else {
            return true;
        }
    };

    // 8.12.7
    JSObject.prototype.Delete = AbstractOperation(function Delete(P, Throw) {
        var desc;
        desc = this.GetOwnProperty(P);
        if (desc === undefined) {
            return true;
        }
        if (desc.Configurable === true) {
            delete this.__Record[P];
            return true;
        } else {
            if (Throw) {
                throw new TypeError('8.12.7-4');
            }
        }
        return false;
    });

    JSObject.prototype.DefaultValue = AbstractOperation(function DefaultValue(hint) {
        var toString, str, valueOf, val;
        if (hint === 'String') {
            toString = this.Get('toString');
            ReturnIfAbrupt(toString);
            if (IsCallable(toString)) {
                str = toString.Call(this, []);
                ReturnIfAbrupt(str);
                if (IsPrimitiveValue(str)) {
                    return str;
                }
            }
            valueOf = this.Get('valueOf');
            ReturnIfAbrupt(valueOf);
            if (IsCallable(valueOf)) {
                val = valueOf.Call(this, []);
                ReturnIfAbrupt(val);
                if (IsPrimitiveValue(val)) {
                    return val;
                }
            }
        } else {
            valueOf = this.Get('valueOf');
            ReturnIfAbrupt(valueOf);
            if (IsCallable(valueOf)) {
                val = valueOf.Call(this, []);
                ReturnIfAbrupt(val);
                if (IsPrimitiveValue(val)) {
                    return val;
                }
            }
            toString = this.Get('toString');
            ReturnIfAbrupt(toString);
            if (IsCallable(toString)) {
                str = toString.Call(this, []);
                ReturnIfAbrupt(str);
                if (IsPrimitiveValue(str)) {
                    return str;
                }
            }
        }
        throw new TypeError('8.12.8-7');
    });

    JSObject.prototype.DefineOwnProperty = AbstractOperation(function DefineOwnProperty(P, Desc, Throw) {
        var current, extensible, names;

        function Reject(str) {
            if (Throw) {
                throw new TypeError(str);
            }
            return false;
        }

        function DefaultDataDescriptor(desc) {
            var result = {
                Configurable: false,
                Enumerable: false,
                Writable: false,
                Value: undefined
            };
            if (desc.hasOwnProperty('Configurable')) {
                result.Configurable = desc.Configurable;
            }
            if (desc.hasOwnProperty('Enumerable')) {
                result.Enumerable = desc.Enumerable;
            }
            if (desc.hasOwnProperty('Writable')) {
                result.Writable = desc.Writable;
            }
            if (desc.hasOwnProperty('Value')) {
                result.Value = desc.Value;
            }
            return result;
        }

        function DefaultAccessorDescriptor(desc) {
            var result = {
                Configurable: false,
                Enumerable: false,
                Get: undefined,
                Set: undefined
            };
            if (desc.hasOwnProperty('Configurable')) {
                result.Configurable = desc.Configurable;
            }
            if (desc.hasOwnProperty('Enumerable')) {
                result.Enumerable = desc.Enumerable;
            }
            if (desc.hasOwnProperty('Get')) {
                result.Get = desc.Get;
            }
            if (desc.hasOwnProperty('Set')) {
                result.Set = desc.Set;
            }
            return result;
        }

        current = this.GetOwnProperty(P);
        extensible = this.Extensible;
        if (current === undefined && !extensible) {
            return Reject('8.12.9-3');
        }
        if (current === undefined && extensible) {
            if (IsGenericDescriptor(Desc) || IsDataDescriptor(Desc)) {
                this.__Record[P] = DefaultDataDescriptor(Desc);
            } else {
                this.__Record[P] = DefaultAccessorDescriptor(Desc);
            }
            return true;
        }

        names = Object.getOwnPropertyNames(Desc);
        if (names.length === 0) {
            return true;
        }

        if (names.every(function(name) {
            if (!current.hasOwnProperty(name)) {
                return false;
            }
            if (!SameValue(Desc[name], current[name])) {
                return false;
            }
            return true;
        })) {
            return true;
        }

        if (!current.Configurable) {
            if (Desc.Configurable) {
                return Reject('8.12.9-7-a');
            }
            if (Desc.hasOwnProperty('Enumerable') && Desc.Enumerable !== current.Enumerable) {
                return Reject('8.12.9-7-b');
            }
        }

        if (IsGenericDescriptor(Desc)) {
        } else if (IsDataDescriptor(current) !== IsDataDescriptor(Desc)) {
            if (!current.Configurable) {
                return Reject('8.12.9-9-a');
            }
            if (IsDataDescriptor(current)) {
                this.__Record[P] = DefaultAccessorDescriptor({
                    Configurable: current.Configurable,
                    Enumerable: current.Enumerable
                });
            } else {
                this.__Record[P] = DefaultDataDescriptor({
                    Configurable: current.Configurable,
                    Enumerable: current.Enumerable
                });
            }
        } else if (IsDataDescriptor(current)) {
            if (!current.Configurable) {
                if (!current.Writable && Desc.Writable) {
                    return Reject('8.12.9-10-a-i');
                }
                if (!current.Writable) {
                    if (Desc.hasOwnProperty('Value') && !SameValue(Desc.Value, current.Value)) {
                        return Reject('8.12.9-10-a-ii-1');
                    }
                }
            }
        } else {
            if (!current.Configurable) {
                if (Desc.hasOwnProperty('Set') && !SameValue(Desc.Set, current.Set)) {
                    return Reject('8.12.9-11-a-i');
                }
                if (Desc.hasOwnProperty('Get') && !SameValue(Desc.Get, current.Get)) {
                    return Reject('8.12.9-11-a-ii');
                }
            }
        }

        Object.getOwnPropertyNames(Desc).forEach(function (name) {
            this.__Record[P][name] = Desc[name];
        }, this);

        return true;
    });

    // no error
    // 8.12.10
    JSObject.prototype.Enumerate = function Enumerate(includePrototype, onlyEnumerable) {
        var obj, proto, propList;
        obj = this;
        proto = this.Prototype;
        if (!includePrototype || proto === null) {
            propList = [];
        } else {
            propList = proto.Enumerable(true, onlyEnumerable);
        }
        Object.getOwnPropertyNames(this.__Record).forEach(function (name) {
            var desc, index;
            desc = this.GetOwnProperty(name);
            index = propList.indexOf(name);
            if (index !== -1) {
                propList.splice(index, 1);
            }
            if (!onlyEnumerable || desc.Enumerable) {
                propList.push(name);
            }
        }, this);
        propList.sort();
        return propList;
    };

    // FIXME error or not?
    JSObject.prototype.Iterate = AbstractOperation(function Iterate() {
        var itr;
        itr = Iterator(this, []);
        return itr;
    });

    function JSArray() {
    }

    JSArray.prototype = Object.create(JSObject.prototype);

    JSArray.prototype.DefineOwnProperty = AbstractOperation(function DefineOwnProperty() {
    });


    exports.JSObject = JSObject;
    exports.Realm = Realm;
}(typeof exports === 'undefined' ? (shibuya = {}) : exports));
/* vim: set sw=4 ts=4 et tw=80 : */
