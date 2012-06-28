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

    var NativeBrand,
        GetValue,
        SpecialGet,
        PutValue,
        SpecialPut,
        EvaluateCall,
        global,
        shibuya,
        esprima,
        slice,
        realm;

    global = Function('return this')();

    if (typeof process !== 'undefined') {
        esprima = require('./esprima');
        shibuya = require('../shibuya');
    } else {
        esprima = global.esprima;
        shibuya = global.shibuya;
    }

    NativeBrand = {
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

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function copy(obj) {
        return Object.keys(obj).reduce(function (result, key) {
            result[key] = obj[key];
        }, {});
    }

    // Fatal error

    function FatalError(args) {
        this.args = args;
        try {
            throw new Error('out');
        } catch (e) {
            console.error(e.stack);
        }
        Error.call(this, args[0]);
    }

    FatalError.prototype = shibuya.common.inherit(FatalError, Error);

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
                if (e instanceof FatalError) {
                    throw e;
                }
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
        if (x instanceof Completion) {
            if (isAbruptCompletion(x)) {
                return x;
            }
            return Type(x.value);
        }
        if (x === null) {
            return 'Null';
        }
        return capitalize(typeof x);
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
        return V.base instanceof JSObject || HasPrimitiveBase(V);
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
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(V)) { return V; } else if (V instanceof Completion) { V = V.value; }

        // 8.9.1-2
        if (Type(V) !== 'Reference') {
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
            if (!IsSuperReference(V)) {
                // 8.9.1-5-b-i
                return get.call(base, GetReferencedName(V));
            } else {  // 8.9.1-5-c
                // 8.9.1-5-c-i
                // FIXME spec bug. ThisValue is typo of GetThisValue
                return get.call(base, GetReferencedName(V), GetThisValue(V));
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
        // FIXME inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(O)) { return O; } else if (O instanceof Completion) { O = O.value; }
        desc = O.GetProperty(P);
        if (desc === undefined) {
            return undefined;
        }

        if (IsDataDescriptor(desc)) {
            return desc.Value;
        } else {
            shibuya.common.assert(IsAccessorDescriptor(desc));
            getter = desc.Get;
        }

        if (getter === undefined) {
            return undefined;
        }

        if (arguments.length !== 2) {
            accessorThisValue = base;
        }

        return getter.Call(accessorThisValue, []);
    });

    // 8.9.2 PutValue (V, W)
    var PutValue = AbstractOperation(function (V, W) {
        var base;

        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(V)) { return V; } else if (V instanceof Completion) { V = V.value; }
        // expanded ReturnIfAbrupt by preprocess.js
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
        // expanded ReturnIfAbrupt by preprocess.js
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
            shibuya.common.assert(IsAccessorDescriptor(desc));
            getter = desc.Get;
        }

        if (getter === undefined) {
            return undefined;
        }

        if (arguments.length !== 4) {
            accessorThisValue = base;
        }

        return getter.Call(accessorThisValue, []);
    });

    var GetThisValue = AbstractOperation(function (V) {
        // expanded ReturnIfAbrupt by preprocess.js
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

        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(Obj)) { return Obj; } else if (Obj instanceof Completion) { Obj = Obj.value; }

        if (Type(Obj) !== 'Object') {
            throw new TypeError('8.10.5-2');
        }

        desc = { };

        if (Obj.HasProperty('enumerable')) {
            enumerable = Obj.Get('enumerable');
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(enumerable)) { return enumerable; } else if (enumerable instanceof Completion) { enumerable = enumerable.value; }
            desc.Enumerable = ToBoolean(enumerable);
        }

        if (Obj.HasProperty('configurable')) {
            conf = Obj.Get('configurable');
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(conf)) { return conf; } else if (conf instanceof Completion) { conf = conf.value; }
            desc.Configurable = ToBoolean(conf);
        }

        if (Obj.HasProperty('value')) {
            value = Obj.Get('value');
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(value)) { return value; } else if (value instanceof Completion) { value = value.value; }
            desc.Value = value;
        }

        if (Obj.HasProperty('writable')) {
            writable = Obj.Get('writable');
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(writable)) { return writable; } else if (writable instanceof Completion) { writable = writable.value; }
            desc.Writable = ToBoolean(writable);
        }

        if (Obj.HasProperty('get')) {
            getter = Obj.Get('get');
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(getter)) { return getter; } else if (getter instanceof Completion) { getter = getter.value; }
            if (!IsCallable(getter) && getter !== undefined) {
                throw new TypeError('8.10.5-8-c');
            }
            desc.Get = getter;
        }

        if (Obj.HasProperty('set')) {
            setter = Obj.Get('set');
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(setter)) { return setter; } else if (setter instanceof Completion) { setter = setter.value; }
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

        shibuya.common.assert(type === 'object');
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

        shibuya.common.assert(type === 'object');
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
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(number)) { return number; } else if (number instanceof Completion) { number = number.value; }
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
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(number)) { return number; } else if (number instanceof Completion) { number = number.value; }
        return number >> 0;
    });

    // 9.1.6
    var ToUint32 = AbstractOperation(function (argument) {
        var number;
        number = ToNumber(argument);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(number)) { return number; } else if (number instanceof Completion) { number = number.value; }
        return number >>> 0;
    });

    // 9.1.7
    var ToUint16 = AbstractOperation(function (argument) {
        var number;
        number = ToNumber(argument);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(number)) { return number; } else if (number instanceof Completion) { number = number.value; }
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
                return StringCreate(argument);
            case 'number':
                return NumberCreate(argument);
            case 'boolean':
                return BooleanCreate(argument);
        }
    });

    // 9.1.10
    var ToPropertyKey = AbstractOperation(function (argument) {
        // 9.1.10-1
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(argument)) { return argument; } else if (argument instanceof Completion) { argument = argument.value; }

        // 9.1.10-2
        if (Type(argument) === 'Object') {
            // 9.1.10-2-a
            if (argument.NativeBrand === NativeBrand.NativePrivateName) {
                // 9.1.10-2-a-i
                return argument;
            }
        }

        // 9.1.10-3
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
    // 9.2.2
    function IsCallable(argument) {
        var type, primValue;

        if (argument instanceof Completion) {
            if (isAbruptCompletion(argument)) {
                return argument;
            }
            return IsCallable(argument.value);
        }

        if (argument !== null && typeof argument === 'object') {
            return 'Call' in argument;
        }

        return false;
    }

    // 9.2.3
    function SameValue(x, y) {
        // 9.2.3-1
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(x)) { return x; } else if (x instanceof Completion) { x = x.value; }
        // 9.2.3-2
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(y)) { return y; } else if (y instanceof Completion) { y = y.value; }

        // 9.2.3-3
        if (Type(x) !== Type(y)) {
            return false;
        }

        // bellow is using ECMAScript system.
        if (Type(x) === 'Number') {
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

    function StrictEqual(x, y) {
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(x)) { return x; } else if (x instanceof Completion) { x = x.value; }
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(y)) { return y; } else if (y instanceof Completion) { y = y.value; }
        return x === y;
    }

    // 9.3.1
    var Invoke = AbstractOperation(function (P, O, args) {
        var obj, func;

        // 9.3.1-1
        obj = ToObject(O);

        // 9.3.1-2
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(obj)) { return obj; } else if (obj instanceof Completion) { obj = obj.value; }

        // 9.3.1-3
        func = obj.Get(P);

        // 9.3.1-4
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(func)) { return func; } else if (func instanceof Completion) { func = func.value; }

        // 9.3.1-5
        if (!IsCallable(func)) {
            throw new TypeError('9.3.1-5');
        }

        // 9.3.1-6
        return func.Call(O, args);
    });

    // 15.4
    function isArrayIndex(P) {
        shibuya.common.assert(typeof P === 'string');
        var num = Number(P) >>> 0;
        if (String(num) === P && num !== 0xFFFFFFFF) {
            return true;
        }
        return false;
    }

    function DeclarativeEnvironmentRecords() {
        this.__record = Object.create(null);
    }

    // no error
    // 10.2.1.1.1
    DeclarativeEnvironmentRecords.prototype.HasBinding = function (N) {
        if (shibuya.common.has(this.__record, N)) {
            return true;
        }
        return false;
    };

    // 10.2.1.1.2
    DeclarativeEnvironmentRecords.prototype.CreateMutableBinding = AbstractOperation(function (N, D) {
        shibuya.common.assert(!shibuya.common.has(this.__record, N));
        this.__record[N] = {
            initialised: false,
            mutable: true,
            configurable: D
        };
    });

    // 10.2.1.1.3
    DeclarativeEnvironmentRecords.prototype.SetMutableBinding = AbstractOperation(function (N, V, S) {
        var binding;
        shibuya.common.assert(shibuya.common.has(this.__record, N));
        shibuya.common.assert(this.__record[N].initialised);

        binding = this.__record[N];
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
        shibuya.common.assert(shibuya.common.has(this.__record, N));

        binding = this.__record[N];
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
        if (!shibuya.common.has(this.__record, N)) {
            return true;
        }
        binding = this.__record[N];
        if (!binding.configurable) {
            return false;
        }
        delete this.__record[N];
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
        shibuya.common.assert(!shibuya.common.has(this.__record, N));
        this.__record[N] = {
            initialised: false,
            mutable: false
        };
    };

    // no error
    // 10.2.1.1.11
    DeclarativeEnvironmentRecords.prototype.InitializeBinding = function (N, V) {
        var binding;
        shibuya.common.assert(shibuya.common.has(this.__record, N));
        shibuya.common.assert(!this.__record[N].initialised);
        binding = this.__record[N];
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
        shibuya.common.assert(!this.HasBinding(N));  // makes this method no error
        if (D) {
            configValue = true;
        } else {
            configValue = false;
        }
        this.__bindings.DefineOwnProperty(N, {
            Value: undefined,
            Writable: true,
            Enumerable: true,
            Configurable: configValue
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

    MethodEnvironmentRecords.prototype = shibuya.common.inherit(MethodEnvironmentRecords, DeclarativeEnvironmentRecords);

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
    MethodEnvironmentRecords.prototype.GetHomeObject = function() {
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
        exists = lex.HasBinding(name);
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

    function BindingInitialisation(pattern, value, environment) {
        var name, env, lhs;
        if (Array.isArray(pattern)) {
            // This is parameters pattern
            // We should enumlate ArrayPattern
            pattern = {
                type: esprima.Syntax.ArrayPattern,
                elements: pattern
            };
        }
        if (pattern.type === esprima.Syntax.Identifier) {
            // 12.2.1
            if (environment !== undefined) {
                name = pattern.name;
                env = environment;
                env.InitializeBinding(name, value);
                return NormalCompletion(undefined);
            } else {
                lhs = IdentifierResolution(pattern.name);
                return PutValue(lhs, value);
            }
        } else if (pattern.type === esprima.Syntax.ArrayPattern) {
            // 13.1
            return IndexedBindingInitialisation(pattern, value, 0, environment);
        } else if (pattern.type === esprima.Syntax.ObjectPattern) {
            // TODO(Constellation): implement it
        }
    }

    // TODO(Constellation) fix for spec
    // 12.2.4
    function IndexedBindingInitialisation(pattern, array, nextIndex, environment) {
        var i, len, target, P, exists, v;
        for (i = nextIndex, len = pattern.elements.length; i < len; ++i) {
            target = pattern.elements[i];
            P = String(i);
            // 12.2.4-2
            exists = array.HasProperty(P);

            // 12.2.4-3
            if (exists) {
                v = array.Get(P);
            } else {
                // TODO(Constellation) initialiser is not allowed
                v = undefined;
            }
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(v)) { return v; } else if (v instanceof Completion) { v = v.value; }
            BindingInitialisation(target, v, environment);
        }
    }

    // 10.3
    function Realm(opt) {
        this.intrinsics = null;
        this.this = null;
        this.globalEnv = null;
        this.loader = null;

        this.__opt = (opt || {});

        this.with(function () {
            this.ObjectPrototype = ObjectCreate(null);

            this.FunctionPrototype = null;

            // 15.4.4
            this.ArrayPrototype = new JSArray();
            this.ArrayPrototype.Prototype = this.ObjectPrototype;
            this.ArrayPrototype.NativeBrand = NativeBrand.NativeArray;
            this.ArrayPrototype.Extensible = true;
            JSObject.prototype.DefineOwnProperty.call(this.ArrayPrototype, 'length', {
                Value: 0,
                Writable: true,
                Enumerable: false,
                Configurable: false
            }, false);

            this.StringPrototype = null;
            this.BooleanPrototype = null;
            this.NumberPrototype = null;
            this.ThrowTypeError = null;

            this.this = ObjectCreate();
            this.globalEnv = NewObjectEnvironment(this.this, null);

            this.executionContext = null;

            this.EmptyConstructor = new shibuya.compiler.compile('(function constructor() { })', { function: true });

            this.EmptyConstructor.Strict = true;
            this.EmptyConstructor.kind = 'method';
        });
    }

    Realm.prototype.FATAL = function (msg) {
        if (this.__opt.debug) {
            this.__opt.debug.apply(this, arguments);
        }
        console.error(msg);
        throw new FatalError(arguments);
    };

    Realm.prototype.DEBUG = function () {
        if (this.__opt.debug) {
            this.__opt.debug.apply(this, arguments);
        }
    };

    Realm.prototype.run = function (code) {
        return this.with(function () {
            var calleeContext, ret, status;

            calleeContext = new ExecutionContext();
            calleeContext.PreviousContext = this.executionContext;
            calleeContext.Realm = this;
            calleeContext.LexicalEnvironment = this.globalEnv;
            calleeContext.VariableEnvironment = this.globalEnv;
            calleeContext.code = code;
            this.executionContext = calleeContext;

            status = TopLevelDeclarationInstantiation(calleeContext, code);
            if (isAbruptCompletion(status)) {
                this.executionContext = calleeContext.PreviousContext;
                return status;
            }

            ret = this.executionContext.run(code);

            this.executionContext = calleeContext.PreviousContext;

            return ret;
        });
    };

    Realm.prototype.with = function (func) {
        var previousRealm, ret;

        previousRealm = realm;
        realm = this;
        try {
            ret = func.call(this);
        } finally {
            realm = previousRealm;
        }
        return ret;
    };

    // 11.2.2
    var EvaluateConstruct = AbstractOperation(function (func, args) {
        if (Type(func) !== 'Object') {
            throw TypeError('11.2.2-6');
        }

        if (!('Construct' in func)) {
            throw TypeError('11.2.2-7');
        }

        return func.Construct(args);
    });

    // 11.2.3
    var EvaluateCall = AbstractOperation(function (ref, func, args) {
        var thisValue;
        // starts with step 8
        if (Type(func) !== 'Object') {
            throw TypeError('11.2.3-8');
        }

        if (!IsCallable(func)) {
            throw TypeError('11.2.3-9');
        }

        if (Type(ref) === 'Reference') {
            if (IsPropertyReference(ref)) {
                thisValue = GetThisValue(ref);
            } else {
                thisValue = GetBase(ref).WithBaseObject();
            }
        } else {
            thisValue = undefined;
        }

        return func.Call(thisValue, args);
    });

    // 10.5.1
    var TopLevelDeclarationInstantiation = AbstractOperation(function (ctx, code) {
        var env, configurableBindings, strict, varNames;

        // 10.5.1-1
        env = ctx.VariableEnvironment;

        // 10.5.1-2
        if (code.Type === 'eval') {
            configurableBindings = true;
        } else {
            configurableBindings = false;
        }

        // 10.5.1-3
        if (code.Strict) {
            strict = true;
        } else {
            strict = false;
        }

        // 10.5.1-4
        code.LexicalDeclarations
            .filter(function (d) { return d.type === esprima.Syntax.FunctionDeclaration; })
            .forEach(function (f) {
            var fn, fo, funcAlreadyDeclared, go, existingProp;

            // 10.5.1-4-a
            fn = f.id.name;

            // 10.5.1-4-b
            fo = InstantiateFunctionDeclaration(f);

            // 10.5.1-4-c
            funcAlreadyDeclared = env.HasBinding(fn);

            // 10.5.1-4-d
            if (funcAlreadyDeclared) {
                // reported
                // https://mail.mozilla.org/pipermail/es-discuss/2012-June/023811.html
                //
                // 10.5.1-4-d-i
                // FIXME spec bug typo CreateMutableVarBinding
                env.CreateMutableBinding(fn, configurableBindings);

                // 10.5.1-4-d-ii
                // FIXME spec bug?
                // global environment doesn't have InitializeBinding
                // env.InitializeBinding(fn, undefined);
            }
            // 10.5.1-4-e
            else if (env === realm.globalEnv) {
                // 10.5.1-4-e-i
                go = realm.this;

                // 10.5.1-4-e-ii
                existingProp = go.GetOwnProperty(fn);

                // 10.5.1-4-e-iii
                if (existingProp === undefined) {
                    // 10.5.1-4-e-iii-1
                    go.DefineOwnProperty(fn, {
                        Value: undefined,
                        Writable: true,
                        Enumerable: true,
                        Configurable: configurableBindings
                    }, true);
                }
                // 10.5.1-4-e-iv
                else if (IsAccessorDescriptor(existingProp) || (!existingProp.Writable && !existingProp.Enumerable)) {
                    throw new TypeError('10.5.1-4-e-iv-1');
                }
            }

            // 10.5.1-4-f
            env.SetMutableBinding(fn, fo, strict);
        });

        // 10.5.1-5
        // FIXME spec now not defined it. old
        // So we assume like FunctionDeclarationInstantiation
        varNames = code.VarDeclaredNames;
        varNames.forEach(function (varName) {
            var alreadyDeclared, go, existingProp;

            alreadyDeclared = env.HasBinding(varName);

            if (!alreadyDeclared) {
                env.CreateMutableBinding(varName, configurableBindings);
                // FIXME spec bug?
                // global environment doesn't have InitializeBinding
                // env.InitializeBinding(varName, undefined);
                env.SetMutableBinding(varName, undefined, strict);
            } else if (env === realm.globalEnv) {
                go = realm.this;

                existingProp = go.GetOwnProperty(varName);

                if (existingProp === undefined) {
                    go.DefineOwnProperty(varName, {
                        Value: undefined,
                        Writable: true,
                        Enumerable: true,
                        Configurable: configurableBindings
                    }, true);
                }
            }
        });
    });

    // 10.5.2
    // Module Declaration Instantiation

    // 10.5.3
    var FunctionDeclarationInstantiation = AbstractOperation(function (func, argumentsList, env) {
        var code, strict, fromals, parameterNames, declarations, ao, formals, formalStatus, names, argumentsAlreadyDeclared, varNames, initializedFunctions;

        // 10.5.3-1
        code = func.Code;

        // 10.5.3-2
        strict = func.Strict;

        // 10.5.3-3
        // FIXME spec bug.
        // FormalParameterList is used.
        // This may be typo of FormalParameters.
        formals = func.FormalParameters;

        // 10.5.3-4
        parameterNames = formals.BoundNames;

        // 10.5.3-5
        parameterNames.forEach(function (argName) {
            var alreadyDeclared;
            // 10.5.3-5-a
            alreadyDeclared = env.HasBinding(argName);

            // 10.5.3-5-b
            // NOTE duplicate parameter names can only occur in non-strict Normal functions

            // 10.5.3-5-c
            if (!alreadyDeclared) {
                // 10.5.3-5-c-i
                env.CreateMutableBinding(argName);

                // 10.5.3-5-c-ii
                if (!strict) {

                    // 10.5.3-5-c-ii-1
                    env.InitializeBinding(argName, undefined);
                }
            }
        });

        // 10.5.3-6
        declarations = code.LexicalDeclarations;

        // 10.5.3-7
        if (strict) {
            // 10.5.3-7-a
            ao = CreateStrictArgumentsObject(argumentsList);

            // 10.5.3-7-b
            formalStatus = BindingInitialisation(formals, ao, env);
        } else {
            // 10.5.3-8-a
            names = formals.BoundNames;

            // 10.5.3-8-b
            // NOTE Because F is a none strict function it is not extended code.
            // Hence formals does not cotain the names of any destructuring
            // BindingProperties, rest parameters, or parameters with default
            // value initialisers.

            // 10.5.3-8-c
            ao = CreateMappedArgumentsObject(names, env, argumentsList, func);

            // 10.5.3-8-d
            // FIXME spec bug => ACCEPTED
            // This always has no effect.
            // Reported at
            //   https://mail.mozilla.org/pipermail/es-discuss/2012-June/023693.html
            // formalStatus = BindingInitialisation(formals, ao, undefined);
            formalStatus = BindingInitialisation(formals, CreateStrictArgumentsObject(argumentsList), undefined);
        }

        // 10.5.3-9
        // NOTE Binding Initialisation for formals is performed prior to
        // instantiating any non-parameter declarations in order to ensure that
        // any such local declarations are not visible to any parameter
        // Initialisation(FIXME typo) code that may be evaluated

        // 10.5.3-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(formalStatus)) { return formalStatus; } else if (formalStatus instanceof Completion) { formalStatus = formalStatus.value; }

        // 10.5.3-11
        declarations.forEach(function (d) {
            // 10.5.3-11-a
            d.BoundNames.forEach(function (dn) {
                var alreadyDeclared;
                // 10.5.3-11-a-i
                alreadyDeclared = env.HasBinding(dn);

                // 10.5.3-11-a-ii
                if (!alreadyDeclared) {
                    // 10.5.3-11-a-ii-1
                    if (d.IsConstantDeclaration) {
                        env.CreateImmutableBinding(dn);
                    }
                    // 10.5.3-11-a-ii-1
                    else {
                        env.CreateMutableBinding(dn, false);
                    }
                }
            });
        });

        // 10.5.3-12
        argumentsAlreadyDeclared = env.HasBinding('arguments');

        // 10.5.3-13
        // NOTE if argumentsAlreadyDeclared is true then the value of ao is not
        // directly observable to ECMAScript code and need not actually exist.
        // In that case its use in the above steps is strictly as a device for
        // specifying formal parameter initialisation semantics.

        // 10.5.3-14
        if (!argumentsAlreadyDeclared) {
            // 10.5.3-14-a
            if (strict) {
                // 10.5.3-14-a-i
                env.CreateImmutableBinding('arguments');
            }
            // 10.5.3-14-b
            else {
                // 10.5.3-14-b-i
                env.CreateMutableBinding('arguments');
            }
            // 10.5.3-14-c
            env.InitializeBinding('arguments', ao);
        }

        // 10.5.3-15
        varNames = code.VarDeclaredNames;

        // 10.5.3-16
        varNames.forEach(function (varName) {
            var alreadyDeclared;

            // 10.5.3-16-a
            alreadyDeclared = env.HasBinding(varName);

            // 10.5.3-16-b
            // NOTE A VarDeclaredNames is only instantiated and initialised
            // (FIXME typo) here if it is not also the name of a formal
            // parameter or a FunctionDeclarations. Such duplicate declarations
            // may only occur in non-extended code.

            // 10.5.3-16-c
            if (!alreadyDeclared) {
                // 10.5.3-16-c-i
                env.CreateMutableBinding(varName);

                // 10.5.3-16-c-ii
                // FIXME spec typo. not fn!
                env.InitializeBinding(varName, undefined);
            }
        });

        // 10.5.3-17
        initializedFunctions = {};

        // 10.5.3-18
        declarations
            .filter(function (d) { return d.type === esprima.Syntax.FunctionDeclaration; })
            .forEach(function (f) {
            var fn, fo;
            // 10.5.3-18-a
            // NOTE If there are multiple FunctionDeclarations for the same
            // name, the last declaration is used. Mutliple
            // FunctionDeclarations for the same name is only valid in
            // non-extended code.

            // 10.5.3-18-b
            fn = f.BoundNames;

            // 10.5.3-18-c
            if (!shibuya.common.has(initializedFunctions, fn)) {
                // 10.5.3-18-c-i
                initializedFunctions[fn] = true;

                // 10.5.3-18-c-ii
                fo = InstantiateFunctionDeclaration(f);

                // 10.5.3-18-c-iii
                env.InitializeBinding(fn, fo);
            }
        });

        // 10.5.3-19
        return NormalCompletion();
    });

    // 10.5.4
    function BlockDeclarationInstantiation(code, env) {
        var declarations;

        // 10.5.4-1
        declarations = code.LexicalDeclarations;

        // 10.5.4-2
        declarations.forEach(function (d) {
            // 10.5.4-2-a
            d.BoundNames.forEach(function (dn) {
                // 10.5.4-2-a-i
                if (d.IsConstantDeclaration) {
                    // 10.5.4-2-a-i-1
                    env.CreateImmutableBinding(dn);
                }
                // 10.5.4-2-a-ii
                else {
                    // 10.5.4-2-a-ii-1
                    env.CreateMutableBinding(dn, false);
                }
            });
        });

        // 10.5.4-3
        declarations
            .filter(function (d) { return d.type === esprima.Syntax.FunctionDeclaration; })
            .forEach(function (f) {
            var fn, fo;

            // 10.5.4-3-a
            fn = f.BoundNames[0];

            // 10.5.4-3-b
            fo = InstantiateFunctionDeclaration(f);

            // 10.5.4-3-c
            env.InitializeBinding(fn, fo);
        });
    }

    // 13.1
    function InstantiateFunctionDeclaration(decl) {
        var code, strict, scope, F;
        code = decl.Code;
        strict = code.Strict;
        scope = realm.executionContext.LexicalEnvironment;
        F = FunctionCreate('Normal', code.params, code, scope, strict);
        MakeConstructor(F);
        return F;
    }

    var ClassDefinitionEvaluation = AbstractOperation(function ClassDefinitionEvaluation(instr, superclass) {
        var protoParent, constructorParent, proto, strict, lex, scope, envRec, constructor, F, desc, methods;

        // FIXME spec bug
        // constructorParent is not used.
        // and, HomeObject is specifying the Class, not parent

        if (superclass === undefined) {
            // FIXME spec bug, typo, let is small case
            protoParent = realm.ObjectPrototype;
            constructorParent = realm.FunctionPrototype;
        } else {
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(superclass)) { return superclass; } else if (superclass instanceof Completion) { superclass = superclass.value; }
            if (superclass === null) {
                protoParent = null;
                constructorParent = realm.FunctionPrototype;
            }
            else if (Type(superclass) !== 'Object') {
                throw new TypeError('ClassDefinitionEvaluation 2-e');
            }
            else if (!('Construct' in superclass)) {
                protoParent = superclass;
                constructorParent = realm.FunctionPrototype;
            }
            else {
                protoParent = superclass.Get('prototype');
                // expanded ReturnIfAbrupt by preprocess.js
                if (isAbruptCompletion(protoParent)) { return protoParent; } else if (protoParent instanceof Completion) { protoParent = protoParent.value; }
                if (Type(protoParent) !== 'Object' && Type(protoParent) !== 'Null') {
                    throw new TypeError('ClassDefinitionEvaluation 2-f-iii');
                }
                constructorParent = superclass;
            }
        }
        // FIXME spec bug, proto is missing.
        // probably, protoParent
        proto = ObjectCreate(protoParent);
        // FIXME spec bug. FunctionBody is missing.
        strict = realm.executionContext.code.Strict;
        lex = realm.executionContext.LexicalEnvironment;

        if (instr.name) {
            scope = NewDeclarativeEnvironment(lex);
            envRec = scope;
            envRec.CreateImmutableBinding(instr.name);
            realm.executionContext.LexicalEnvironment = scope;
        }

        constructor = instr.constructor;

        if (!constructor) {
            constructor = realm.EmptyConstructor;
        }
        F = PropertyDefinitionEvaluation('method', proto, 'constructor', constructor);
        // FIXME spec bug
        // prototype setter is inserted
        F.Prototype = constructorParent;
        // FIXME inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(F)) { return F; } else if (F instanceof Completion) { F = F.value; }

        MakeConstructor(F, false, proto);

        desc = {
            Writable: false,
            Configurable: false
        };

        // FIXME spec bug, object is not defined.
        proto.DefineOwnProperty('constructor', desc, false);

        methods = instr.methods;

        methods.forEach(function (method) {
            PropertyDefinitionEvaluation(method.kind, proto, method.name, method.code);
        });

        realm.executionContext.LexicalEnvironment = lex;

        return F;
    });

    // 10.6
    function CreateStrictArgumentsObject(args) {
        var len, obj, indx, val, thrower;

        // 10.6-1
        len = args.length;

        // 10.6-2
        obj = InstantiateArgumentsObject(len);

        // 10.6-3
        indx = len - 1;

        // 10.6-4
        while (indx >= 0) {
            // 10.6-4-a
            val = args[indx];

            // 10.6-4-b
            obj.DefineOwnProperty(String(indx), {
                Value: val,
                Writable: true,
                Enumerable: true,
                Configurable: true
            }, false);

            // 10.6-4-c
            indx -= 1;
        }

        // 10.6-5
        thrower = realm.ThrowTypeError;

        // 10.6-6
        obj.DefineOwnProperty('caller', {
            Get: thrower,
            Set: thrower,
            Enumerable: false,
            Configurable: false
        }, false);

        // 10.6-7
        obj.DefineOwnProperty('caller', {
            Get: thrower,
            Set: thrower,
            Enumerable: false,
            Configurable: false
        }, false);

        // 10.6-8
        return obj;
    }

    // 10.6
    // FIXME spec bug. func is missing.
    function CreateMappedArgumentsObject(names, env, args, func) {
        var len, obj, map, mappedNames, indx, val, name, g, p;

        // 10.6-1
        len = args.length;

        // 10.6-2
        obj = InstantiateArgumentsObject(len);

        // 10.6-3
        // 10.6-4
        map = ObjectCreate();

        // 10.6-5
        mappedNames = {};

        // 10.6-6
        indx = len - 1;

        // 10.6-7
        while (indx >= 0) {
            // 10.6-7-a
            val = args[indx];

            // 10.6-7-b
            obj.DefineOwnProperty(String(indx), {
                Value: val,
                Writable: true,
                Enumerable: true,
                Configurable: true
            }, false);

            // 10.6-7-c
            if (indx < names.length) {
                // 10.6-7-c-i
                name = names[indx];

                // 10.6-7-c-ii
                if (!shibuya.common.has(mappedNames, name)) {
                    // 10.6-7-c-ii-1
                    mappedNames[name] = true;

                    // 10.6-7-c-ii-2
                    g = MakeArgGetter(name, env);

                    // 10.6-7-c-ii-3
                    p = MakeArgSetter(name, env);

                    // 10.6-7-c-ii-4
                    map.DefineOwnProperty(String(indx), {
                        Set: p,
                        Get: g,
                        Configurable: true
                    }, false);
                }
            }

            // 10.6-7-d
            indx -= 1;
        }

        // 10.6-8
        if (Object.getOwnPropertyNames(mappedNames).length) {
            // 10.6-8-a
            obj.ParameterMap = map;

            // 10.6-8-b
            obj.Get = MappedArgumentsObjectGet;
            obj.GetOwnProperty = MappedArgumentsObjectGetOwnProperty;
            obj.DefineOwnProperty = MappedArgumentsObjectDefineOwnProperty;
            obj.Delete = MappedArgumentsObjectDelete;
        }

        // 10.6-9
        obj.DefineOwnProperty('callee', {
            Value: func,
            Writable: true,
            Enumerable: false,
            Configurable: true
        }, false);

        // 10.6-10
        return obj;
    }

    // 10.6
    function InstantiateArgumentsObject(len) {
        // FIXME new ECMAScript object is ambiguous
        var obj;

        // 10.6-1
        // 10.6-2
        obj = ObjectCreate();

        // 10.6-3
        obj.NativeBrand = NativeBrand.NativeArguments;

        // 10.6-4
        obj.Prototype = realm.ObjectPrototype;

        // 10.6-5
        obj.DefineOwnProperty('length', {
            Value: len,
            Writable: true,
            Enumerable: false,
            Configurable: true
        }, false);

        // 10.6-6
        return obj;
    }

    // 10.6
    function MakeArgGetter(name, env) {
        var bodyText, body;

        // 10.6-1
        bodyText = 'return ' + name + ';';

        // 10.6-2
        body = shibuya.compiler.compile('(function () {\n' + bodyText + '\n})', {
            function: true
        });

        // 10.6-3
        // FIXME spec bug, kind is missing
        return FunctionCreate(body.kind, body.params, body, env, true);
    }

    // 10.6
    function MakeArgSetter(name, env) {
        var paramText, bodyText, body;

        // 10.6-1
        // 10.6-2
        paramText = '_arg';

        // 10.6-3
        bodyText = name + ' = ' + paramText;

        // 10.6-4
        body = shibuya.compiler.compile('(function (' + paramText + ') {\n' + bodyText + '\n})', {
            function: true
        });

        // 10.6-5
        // FIXME spec bug, kind is missing
        return FunctionCreate(body.kind, body.params, body, env, true);
    }

    // 10.6
    //
    // FIXME spec bug.
    // function test(ttt) {
    // }
    // test(10)
    // then, ttt is undefined. Because BindingInitialisation uses arguments, and
    // this returns mapped value, undefined.
    var MappedArgumentsObjectGet = AbstractOperation(function MappedArgumentsObjectGet(P) {
        var map, isMapped, v;

        // 10.6-1
        map = this.ParameterMap;

        // 10.6-2
        isMapped = map.GetOwnProperty(P);

        // 10.6-3
        if (isMapped === undefined) {
            // 10.6-3-a
            v = JSObject.prototype.Get.call(this, P);

            // 10.6-3-b
            // FIXME spec bug. ambiguous v.
            if (P === 'caller' && IsCallable(v) && v.Strict) {
                throw new TypeError('10.6-3-b');
            }

            // 10.6-3-c
            return v;
        }
        // 10.6-4
        else {
            return map.Get(P);
        }
    });

    // 10.6
    var MappedArgumentsObjectGetOwnProperty = function MappedArgumentsObjectGetOwnProperty(P) {
        var desc, map, isMapped;

        // 10.6-1
        desc = JSObject.prototype.GetOwnProperty.call(this, P);

        // 10.6-2
        if (desc === undefined) {
            return desc;
        }

        // 10.6-3
        map = this.ParameterMap;

        // 10.6-4
        isMapped = map.GetOwnProperty(P);

        // 10.6-5
        if (isMapped !== undefined) {
            // 10.6-5-a
            desc.Value = map.Get(P);
        }

        // 10.6-6
        return desc;
    };

    // 10.6
    var MappedArgumentsObjectDefineOwnProperty = AbstractOperation(function MappedArgumentsObjectDefineOwnProperty(P, Desc, Throw) {
        var map, isMapped, allowed;

        // 10.6-1
        map = this.ParameterMap;

        // 10.6-2
        isMapped = map.GetOwnProperty(P);

        // 10.6-3
        allowed = JSObject.prototype.DefineOwnProperty.call(this, P, Desc, false);

        // 10.6-4
        if (!allowed) {
            // 10.6-4-a
            if (Throw) {
                throw new TypeError('10.6-4-a');
            }
        }

        // 10.6-5
        if (isMapped !== undefined) {
            // 10.6-5-a
            if (IsAccessorDescriptor(Desc)) {
                // 10.6-5-a-i
                map.Delete(P, false);
            }
            // 10.6-5-b
            else {
                // 10.6-5-a-i
                if (Desc.hasOwnProperty('Value')) {
                    // 10.6-5-a-i-1
                    map.Put(P, Desc.Value, Throw);
                }

                // 10.6-5-a-ii
                if (Desc.hasOwnProperty('Writable')) {
                    // 10.6-5-a-ii-1
                    map.Delete(P, false);
                }
            }
        }

        // 10.6-6
        return true;
    });

    // 10.6
    var MappedArgumentsObjectDelete = AbstractOperation(function MappedArgumentsObjectDelete(P, Throw) {
        var map, isMapped, result;

        // 10.6-1
        map = this.ParameterMap;

        // 10.6-2
        isMapped = map.GetOwnProperty(P);

        // 10.6-3
        result = JSObject.prototype.Delete.call(this, P, Throw);

        // FIXME inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(result)) { return result; } else if (result instanceof Completion) { result = result.value; }

        // 10.6-4
        if (result && isMapped !== undefined) {
            // 10.6-4-a
            map.Delete(P, false);
        }

        return result;
    });

    // 10.4
    function ExecutionContext() {
        this.state = null;
        this.PreviousContext = null;
        this.Realm = null;
        this.LexicalEnvironment = null;
        this.VariableEnvironment = null;
        this.code = null;

        // below is internals
        this.__previous_pc = 0;
        this.__stack = [];
    }


    // This is Stack VM main loop
    // Basic logic is based on iv / lv5 / railgun 0.0.1 Stack VM
    ExecutionContext.prototype.run = AbstractOperation(function ExecutionContextRun() {
        var instr, pc, code, err, i, len, lex, handler, first, second, env, ret, ref, func, args, evalReturn, scope, closure, funcEnv, name, oldEnv, newEnv, obj, object, propValue, desc, status, padding, pad, array, initResult, initValue, val, res, superclass, rval, lval, actualThis, OP;

        OP = shibuya.compiler.OP;
        code = this.code;

        MAIN: for (pc = 0; pc < code.instructions.length;) {
            // fetch opcode phase
            instr = code.instructions[pc++];

            // execute body phase
            DISPATCH: switch (instr.opcode) {
            case OP.CALL_SUPER_SETUP:
                // 11.2.4
                ref = CallSuperSetup();
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(ref)) {
                    err = ref.value;
                    break DISPATCH;
                } else if (ref instanceof Completion) {
                    ref = ref.value;
                }
                this.__stack.push(ref);
                continue MAIN;

            case OP.SUPER_GUARD:
                status = SuperGuard();
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(status)) {
                    err = status.value;
                    break DISPATCH;
                } else if (status instanceof Completion) {
                    status = status.value;
                }
                continue MAIN;

            case OP.ELEMENT_SUPER:
                res = ElementSuper(this.__stack.pop());
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue MAIN;

            case OP.PROPERTY_SUPER:
                res = ElementSuper(instr.name);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue MAIN;

            case OP.CLASS_EXPR:
                if (instr.super) {
                    superclass = this.__stack.pop();
                }
                res = ClassDefinitionEvaluation(instr, superclass);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }

                this.__stack.push(res);
                continue MAIN;

            case OP.CLASS_DECL:
                if (instr.super) {
                    superclass = this.__stack.pop();
                }
                res = ClassDefinitionEvaluation(instr, superclass);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }

                status = BindingInitialisation(instr.pattern, res, this.LexicalEnvironment);

                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(status)) {
                    err = status.value;
                    break DISPATCH;
                } else if (status instanceof Completion) {
                    status = status.value;
                }
                continue MAIN;

            case OP.SWITCH_CASE:
                first = this.__stack.pop();
                second = this.__stack[this.__stack.length - 1];
                status = StrictEqualityComparison(first, second);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(status)) {
                    err = status.value;
                    break DISPATCH;
                } else if (status instanceof Completion) {
                    status = status.value;
                }
                if (status) {
                    this.__stack.pop();
                    pc = instr.position;
                }
                continue MAIN;

            case OP.SWITCH_DEFAULT:
                this.__stack.pop();
                pc = instr.position;
                continue MAIN;

            case OP.DEBUGGER:
                debugger;
                continue MAIN;

            case OP.THROW:
                err = this.__stack.pop();
                break DISPATCH;

            case OP.ROTATE:
                val = [];
                for (i = 0, len = instr.number; i < len; ++i) {
                    val.push(this.__stack.pop());
                }
                first = val.unshift();
                val.push(first);
                for (i = instr.number; i--;) {
                    this.__stack.push(val[i]);
                }
                continue MAIN;

            case OP.UNARY:
                val = this.__stack.pop();
                res = UnaryOperation(instr.operator, val);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue;

            case OP.ELEMENT:
                res = Element(this.__stack.pop(), this.__stack.pop());
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue MAIN;

            case OP.PROPERTY:
                res = Element(instr.name, this.__stack.pop());
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue MAIN;

            case OP.DUPTOP:
                this.__stack.push(this.__stack[this.__stack.length - 1]);
                continue;

            case OP.THIS:
                res = PrimaryThis();
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue;

            case OP.LITERAL:
                res = PrimaryLiteral(instr.literal);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue;

            case OP.REGEXP:
                this.__stack.push(RegExpCreate(instr.literal));
                continue MAIN;

            case OP.OBJECT_SETUP:
                this.__stack.push(ObjectCreate());
                continue;

            case OP.OBJECT_DEFINE:
                propValue = this.__stack.pop();
                status = DefineProperty(this.__stack[this.__stack.length - 1], instr.name, propValue);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(status)) {
                    err = status.value;
                    break DISPATCH;
                } else if (status instanceof Completion) {
                    status = status.value;
                }
                continue MAIN;

            case OP.OBJECT_DEFINE_METHOD:
                object = this.__stack[this.__stack.length - 1];
                status = PropertyDefinitionEvaluation(instr.kind, object, instr.name, instr.code);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(status)) {
                    err = status.value;
                    break DISPATCH;
                } else if (status instanceof Completion) {
                    status = status.value;
                }
                continue MAIN;

            case OP.ARRAY_SETUP:
                // 11.1.4.1-1
                array = ArrayCreate(0);
                pad = 0;
                this.__stack.push(array);
                this.__stack.push(pad);
                continue MAIN;

            case OP.ARRAY_DEFINE:
                if (instr.empty) {
                    this.__stack[this.__stack.length - 1] += 1;
                } else if (instr.spread) {
                    // TODO(Constellation) spread operation is not defined yet
                } else {
                    // 11.1.4.1-2
                    initResult = this.__stack.pop();
                    // 11.1.4.1-1
                    padding = this.__stack.pop();
                    // 11.1.4.1-3
                    initValue = GetValue(initResult);
                    // 11.1.4.1-4
                    // expanded BreakIfAbrupt by preprocess.js
                    if (isAbruptCompletion(initValue)) {
                        err = initValue.value;
                        break DISPATCH;
                    } else if (initValue instanceof Completion) {
                        initValue = initValue.value;
                    }
                    // 11.1.4.1-5
                    // FIXME return if abrupt is needed
                    this.__stack[this.__stack.length - 1].DefineOwnProperty(String(padding), {
                        Value: initValue,
                        Writable: true,
                        Enumerable: true,
                        Configurable: true
                    }, false);
                    this.__stack.push(padding + 1);
                }
                continue MAIN;

            case OP.ARRAY_CLEANUP:
                len = this.__stack.pop();
                this.__stack[this.__stack.length - 1].Put('length', len);
                continue MAIN;

            case OP.GETVALUE:
                first = GetValue(this.__stack.pop());

                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(first)) {
                    err = first.value;
                    break DISPATCH;
                } else if (first instanceof Completion) {
                    first = first.value;
                }

                this.__stack.push(first);
                continue;

            case OP.PUTVALUE:
                first = this.__stack.pop();
                second = this.__stack.pop();
                ret = PutValue(second, first);

                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(ret)) {
                    err = ret.value;
                    break DISPATCH;
                } else if (ret instanceof Completion) {
                    ret = ret.value;
                }

                this.__stack.push(first);
                continue;

            case OP.TO_OBJECT:
                first = ToObject(this.__stack.pop());

                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(first)) {
                    err = first.value;
                    break;
                } else if (first instanceof Completion) {
                    first = first.value;
                }

                this.__stack.push(first);
                continue;

            case OP.WITH_SETUP:
                // 12.10-1
                val = this.__stack.pop();

                // 12.10-2
                obj = ToObject(GetValue(val));

                // 12.10-3
                // FIXME: spec bug inserted name changing
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(obj)) {
                    err = obj.value;
                    break DISPATCH;
                } else if (obj instanceof Completion) {
                    obj = obj.value;
                }

                // 12.10-4
                oldEnv = this.LexicalEnvironment;

                // 12.10-5
                newEnv = NewObjectEnvironment(obj, oldEnv);

                // 12.10-6
                newEnv.withEnvironment = true;

                // 12.10-7
                newEnv.outer = this.LexicalEnvironment;
                this.LexicalEnvironment = newEnv;
                continue;

            case OP.POP:
                this.__stack.length -= instr.number;
                continue;

            case OP.POP_AND_RET:
                evalReturn = this.__stack.pop();
                continue;

            case OP.POP_JUMP:
                first = this.__stack.pop();
                if (instr.test === ToBoolean(first)) {
                    pc = instr.position;
                }
                continue;

            case OP.JUMP_POP:
                first = this.__stack[this.__stack.length - 1];
                if (instr.test === ToBoolean(first)) {
                    pc = instr.position;
                } else {
                    this.__stack.pop();
                }
                continue;

            case OP.BLOCK_SETUP:
                this.LexicalEnvironment = NewDeclarativeEnvironment(this.LexicalEnvironment);
                BlockDeclarationInstantiation(instr, this.LexicalEnvironment);
                continue;

            case OP.POP_ENV:
                this.LexicalEnvironment = this.LexicalEnvironment.outer;
                continue;

            case OP.BINDING_VAR:
            case OP.BINDING_LET:
            case OP.BINDING_CONST:
                env = (instr.environment) ? this.LexicalEnvironment : undefined;
                BindingInitialisation(instr.pattern, this.__stack.pop(), env);
                continue;

            case OP.UNDEFINED:
                this.__stack.push(undefined);
                continue;

            case OP.RETURN:
                first = this.__stack.pop();
                return first;

            case OP.RETURN_EVAL:
                return evalReturn;

            case OP.RESOLVE:
                this.__stack.push(IdentifierResolution(instr.name));
                continue;

            case OP.BUILD_FUNCTION:
                if (instr.name) {
                    first = instr.code;
                    funcEnv = NewDeclarativeEnvironment(this.LexicalEnvironment);
                    name = instr.name.name;
                    funcEnv.CreateImmutableBinding(name);
                    closure = FunctionCreate(first.kind, first.params, first, funcEnv, first.Strict);
                    MakeConstructor(closure);
                    // FIXME spec bug.
                    // InitializeImmutableBinding is not defined in spec
                    funcEnv.InitializeBinding(name, closure);
                    this.__stack.push(closure);
                } else {
                    first = instr.code;
                    scope = this.LexicalEnvironment;
                    closure = FunctionCreate(first.kind, first.params, first, scope, first.Strict);
                    MakeConstructor(closure);
                    this.__stack.push(closure);
                }
                continue;

            case OP.CALL:
                // FIXME spec bug,
                // insert return if abrupt to member expression result
                ref = this.__stack[(this.__stack.length - 1) - instr.argc - 1];
                func = this.__stack[(this.__stack.length - 1) - instr.argc];
                args = this.__stack.slice((this.__stack.length) - instr.argc);
                this.__stack.length -= (2 + instr.argc);
                res = EvaluateCall(ref, func, args);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue;

            case OP.CONSTRUCT:
                // FIXME spec bug,
                // insert return if abrupt to member expression result
                func = this.__stack[(this.__stack.length - 1) - instr.argc];
                args = this.__stack.slice((this.__stack.length) - instr.argc);
                this.__stack.length -= (1 + instr.argc);
                res = EvaluateConstruct(func, args);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue;

            case OP.JUMP:
                pc = instr.position;
                continue;

            case OP.ABRUPT_CHECK:
                val = this.__stack[this.__stack.length - 1];
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(val)) {
                    err = val.value;
                    break DISPATCH;
                } else if (val instanceof Completion) {
                    val = val.value;
                }
                continue;

            case OP.BINARY:
                rval = this.__stack.pop();
                lval = this.__stack.pop();
                res = BinaryOperation(instr.operator, lval, rval);
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue;

            case OP.UPDATE:
                if (instr.prefix) {
                    if (instr.increment) {
                        res = PrefixIncrement(this.__stack.pop());
                    } else {
                        res = PrefixDecrement(this.__stack.pop());
                    }
                } else {
                    if (instr.increment) {
                        res = PostfixIncrement(this.__stack.pop());
                    } else {
                        res = PostfixDecrement(this.__stack.pop());
                    }
                }
                // expanded BreakIfAbrupt by preprocess.js
                if (isAbruptCompletion(res)) {
                    err = res.value;
                    break DISPATCH;
                } else if (res instanceof Completion) {
                    res = res.value;
                }
                this.__stack.push(res);
                continue MAIN;

            default:
                console.log(instr);
                this.Realm.FATAL("unknown opcode " + shibuya.compiler.getOpcodeString(instr.opcode));
                break;
            }

            // error check phase
            for (i = 0, len = code.handlers.length; i < len; ++i) {
                handler = code.handlers[i];
                if (handler.begin < pc && pc <= handler.end) {
                    switch (handler.type) {
                    case shibuya.compiler.Handler.ENV:
                        this.LexicalEnvironment = this.LexicalEnvironment.outer;
                        break;

                    default:
                        this.__stack.length = handler.unwindStack(this);
                        if (handler.type === shibuya.compiler.Handler.FINALLY) {
                            this.__stack.push(JSEmpty);
                            this.__stack.push(err);
                            this.__stack.push(shibuya.compiler.Handler.FINALLY);
                        } else {
                            this.__stack.push(err);
                        }
                        pc = handler.end;
                        continue MAIN;
                    }
                }
            }
            throw err;
        }
        this.Realm.FATAL('UNREACHABLE');
    });

    ExecutionContext.prototype.restore = function () {
        this.Realm.executionContext = this;
    };


    // 11.2.4
    var CallSuperSetup = AbstractOperation(function () {
        var env, actualThis, baseValue, propertyKey, strict, ref, ret;
        // 11.2.4-1
        env = GetThisEnvironment();
        // 11.2.4-2
        if (!env.HasSuperBinding()) {
            throw new ReferenceError('11.2.4-2');
        }
        // 11.2.4-3
        actualThis = env.GetThisBinding();
        // 11.2.4-4
        baseValue = env.GetHomeObject();
        // 11.2.4-5
        ret = CheckObjectCoercible(baseValue);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(ret)) { return ret; } else if (ret instanceof Completion) { ret = ret.value; }
        // 11.2.4-6
        propertyKey = env.GetMethodName();
        // 11.2.4-7
        strict = realm.executionContext.code.Strict;
        // 11.2.4-8
        // FIXME spec bug.
        // strict is not specified, thisValue is ambiguous in
        // MemberExpression:super .IdentifierName and CallExpression:super Arguments
        // And we use baseValue.[[Prototype]]
        ref = new Reference(baseValue.Prototype, propertyKey, strict);
        ref.thisValue = actualThis;
        return ref;
    });

    // 11.2.4
    var SuperGuard = AbstractOperation(function () {
        var env;
        // 11.2.4-1
        env = GetThisEnvironment();
        // 11.2.4-2
        if (!env.HasSuperBinding()) {
            throw new ReferenceError('11.2.4-2');
        }
        // following is executed by ELEMENT_SUPER / PROPERTY_SUPER
    });

    // 11.2.4
    var ElementSuper = AbstractOperation(function (propertyNameValue) {
        var env, actualThis, baseValue, propertyKey, strict, ret, ref;

        // They are duplicated parts
        // 11.2.4-1
        env = GetThisEnvironment();
        // 11.2.4-2
        if (!env.HasSuperBinding()) {
            throw new ReferenceError('11.2.4-2');
        }
        // 11.2.4-3
        actualThis = env.GetThisBinding();
        // 11.2.4-4
        baseValue = env.GetHomeObject();
        // 11.2.4-5,6  is executed already

        // 11.2.4-7
        ret = CheckObjectCoercible(baseValue);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(ret)) { return ret; } else if (ret instanceof Completion) { ret = ret.value; }

        // 11.2.4-8
        propertyKey = ToPropertyKey(propertyNameValue);
        // FIXME spec bug. inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(propertyKey)) { return propertyKey; } else if (propertyKey instanceof Completion) { propertyKey = propertyKey.value; }

        // 11.2.4-9
        strict = realm.executionContext.code.Strict;

        // 11.2.4-10
        // FIXME spec bug. using baseValue.[[Prototype]]
        ref = new Reference(baseValue.Prototype, propertyKey, strict);
        ref.thisValue = actualThis;
        return ref;
    });

    // 11.1.1
    var PrimaryThis = AbstractOperation(function () {
        // FIXME spec bug.
        // Probably, use ThisResolution in 10.4.4
        // var env;
        // 11.1.1-1
        // env = GetThisEnvironment();
        // 11.1.1-2
        // return env.GetThisBinding();
        return ThisResolution();
    });

    // 11.1.3
    var PrimaryLiteral = AbstractOperation(function (value) {
        return value;
    });

    // 11.2.1
    var Element = AbstractOperation(function (propertyNameValue, baseValue) {
        var res, propertyNameString, strict;
        // FIXME spec bug.
        // we should insert abrupt changing to baseValue and propertyNameValue

        // 11.2.1-7
        res = CheckObjectCoercible(baseValue);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(res)) { return res; } else if (res instanceof Completion) { res = res.value; }

        // 11.2.1-8
        propertyNameString = ToString(propertyNameValue);

        // FIXME spec bug. inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(propertyNameString)) { return propertyNameString; } else if (propertyNameString instanceof Completion) { propertyNameString = propertyNameString.value; }

        // 11.2.1-9
        strict = realm.executionContext.code.Strict;

        // 11.2.1-10
        return new Reference(baseValue, propertyNameString, strict);
    });

    // 11.4
    var UnaryOperation = AbstractOperation(function (operator, val) {
        switch (operator) {
        // 11.4.1
        case 'delete':
            return UnaryDelete(val);

        // 11.4.2
        case 'void':
            return UnaryVoid(val);

        // 11.4.3
        case 'typeof':
            return UnaryTypeof(val);

        // 11.4.6
        case '+':
            return UnaryPositive(val);

        // 11.4.7
        case '-':
            return UnaryNegative(val);

        // 11.4.8
        case '~':
            return UnaryBitwiseNOT(val);

        // 11.4.9
        case '!':
            return UnaryLogicalNOT(val);
        }
    });

    // 11.4.1
    var UnaryDelete = AbstractOperation(function (ref) {
        var ref, obj, bindings;

        // 11.4.1-1

        // 11.4.1-2
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(ref)) { return ref; } else if (ref instanceof Completion) { ref = ref.value; }

        // 11.4.1-3
        if (Type(ref) !== 'Reference') {
            return true;
        }

        // 11.4.1-4
        if (IsUnresolvableReference(ref)) {
            // 11.4.1-4-a
            if (IsStrictReference(ref)) {
                throw new SyntaxError('11.4.1-4-a');
            }
            // 11.4.1-4-b
            else {
                return true;
            }
        }

        // 11.4.1-5
        if (IsPropertyReference(ref)) {
            // 11.4.1-5-a
            if (IsSuperReference(ref)) {
                throw new ReferenceError('11.4.1-5-a');
            }
            // 11.4.1-5-b
            else {
                obj = ToObject(GetBase(ref))

                // FIXME spec bug. inserted
                // expanded ReturnIfAbrupt by preprocess.js
                if (isAbruptCompletion(obj)) { return obj; } else if (obj instanceof Completion) { obj = obj.value; }

                return obj.Delete(GetReferencedName(ref, IsStrictReference(ref)));
            }
        }
        // 11.4.1-6
        else {
            // 11.4.1-6-a
            bindings = GetBase(ref);

            // 11.4.1-6-b
            return bindings.DeleteBinding(GetReferencedName(ref));
        }
    });

    // 11.4.2
    var UnaryVoid = AbstractOperation(function (expr) {
        var ref;
        // 11.4.2-1

        // 11.4.2-2
        // FIXME spec bug. get 'ref'
        ref = GetValue(expr);

        // 11.4.2-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(ref)) { return ref; } else if (ref instanceof Completion) { ref = ref.value; }

        // 11.4.2-4
        return undefined;
    });

    // 11.4.3
    var UnaryTypeof = AbstractOperation(function (val) {
        // 11.4.3-1

        // 11.4.3-2
        if (Type(val) === 'Reference') {
            // 11.4.3-2-a
            if (IsUnresolvableReference(val)) {
                return 'undefined';
            }

            // 11.4.3-2-b
            val = GetValue(val);
        }

        // 11.4.3-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(val)) { return val; } else if (val instanceof Completion) { val = val.value; }

        // 11.4.3-4
        switch (Type(val)) {
        case 'Undefined':
            return 'undefined';

        case 'Null':
            return 'object';

        case 'Boolean':
            return 'boolean';

        case 'Number':
            return 'number';

        case 'String':
            return 'string';

        case 'Object':
            if ('Call' in val) {
                return 'function';
            } else {
                return 'object';
            }
        }
    });

    // 11.4.4
    var PrefixIncrement = AbstractOperation(function (expr) {
        var oldValue, newValue, status;
        // 11.4.4-1

        // 11.4.4-2
        oldValue = ToNumber(GetValue(expr));

        // 11.4.4-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.4-4
        newValue = oldValue + 1;

        // 11.4.4-5
        status = PutValue(expr, newValue);

        // 11.4.4-6
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }

        // 11.4.4-7
        return newValue;
    });

    // 11.4.5
    var PrefixDecrement = AbstractOperation(function (expr) {
        var oldValue, newValue, status;
        // 11.4.5-1

        // 11.4.5-2
        oldValue = ToNumber(GetValue(expr));

        // 11.4.5-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.5-4
        newValue = oldValue - 1;

        // 11.4.5-5
        status = PutValue(expr, newValue);

        // 11.4.5-6
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }

        // 11.4.5-7
        return newValue;
    });

    // 11.4.6
    var UnaryPositive = AbstractOperation(function (expr) {
        // 11.4.6-1

        // 11.4.6-2
        return ToNumber(GetValue(expr));
    });

    // 11.4.7
    var UnaryNegative = AbstractOperation(function (expr) {
        var oldValue;
        // 11.4.7-1

        // 11.4.7-2
        oldValue = ToNumber(GetValue(expr));

        // 11.4.7-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.7-4
        if (isNaN(oldValue)) {
            return NaN;
        }

        // 11.4.7-5
        return -oldValue;
    });

    // 11.4.8
    var UnaryBitwiseNOT = AbstractOperation(function (expr) {
        var oldValue;
        // 11.4.8-1

        // 11.4.8-2
        oldValue = ToInt32(GetValue(expr));

        // 11.4.8-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.8-4
        return ~oldValue;
    });

    // 11.4.9
    var UnaryLogicalNOT = AbstractOperation(function (expr) {
        var oldValue;
        // 11.4.9-1

        // 11.4.9-2
        oldValue = ToBoolean(GetValue(expr));

        // 11.4.9-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.9-4
        if (oldValue) {
            return false;
        }

        // 11.4.9-5
        return true;
    });

    // 11.3.1
    var PostfixIncrement = AbstractOperation(function (lhs) {
        var oldValue, newValue, status;
        // 11.3.1-1

        // 11.3.1-2
        oldValue = ToNumber(GetValue(lhs));

        // 11.3.1-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.3.1-4
        newValue = oldValue + 1;

        // 11.3.1-5
        status = PutValue(lhs, newValue);

        // 11.3.1-6
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }

        // 11.3.1-7
        return oldValue;
    });

    // 11.3.2
    var PostfixDecrement = AbstractOperation(function (lhs) {
        var oldValue, newValue, status;
        // 11.3.2-1

        // 11.3.2-2
        oldValue = ToNumber(GetValue(lhs));

        // 11.3.2-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.3.2-4
        newValue = oldValue - 1;

        // 11.3.2-5
        status = PutValue(lhs, newValue);

        // 11.3.2-6
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }

        // 11.3.2-7
        return oldValue;
    });

    var BinaryOperation = AbstractOperation(function (operator, lval, rval) {
        switch (operator) {
            case '*':
            case '*=':
                return BinaryMultiplication(lval, rval);
            case '/':
            case '/=':
                return BinaryDivision(lval, rval);
            case '%':
            case '%=':
                return BinaryModulo(lval, rval);
            case '+':
            case '+=':
                return BinaryAddition(lval, rval);
            case '-':
            case '-=':
                return BinarySubtraction(lval, rval);
            case '<<':
            case '<<=':
                return BinaryLeftShift(lval, rval);
            case '>>':
            case '>>=':
                return BinarySignedRightShift(lval, rval);
            case '>>>':
            case '>>>=':
                return BinaryUnsignedRightShift(lval, rval);
            case '<':
                return BinaryLessThan(lval, rval);
            case '>':
                return BinaryGreaterThan(lval, rval);
            case '<=':
                return BinaryLessThanEqual(lval, rval);
            case '>=':
                return BinaryGreaterThanEqual(lval, rval);
            case 'in':
                return BinaryIn(lval, rval);
            case 'instanceof':
                return BinaryInstanceof(lval, rval);
            case 'is':
                return BinaryIs(lval, rval);
            case 'isnt':
                return BinaryIsnt(lval, rval);
            case '==':
                return BinaryAbstractEqual(lval, rval);
            case '!=':
                return BinaryAbstractNotEqual(lval, rval);
            case '===':
                return BinaryStrictEqual(lval, rval);
            case '!==':
                return BinaryStrictNotEqual(lval, rval);
            case '&':
            case '&=':
                return BinaryBitwiseAND(lval, rval);
            case '|':
            case '|=':
                return BinaryBitwiseOR(lval, rval);
            case '^':
            case '^=':
                return BinaryBitwiseXOR(lval, rval);
        }
    });

    // 11.5
    var BinaryMultiplication = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.5
        // TODO leftValue is typo of lval

        // 11.5-6
        lnum = ToNumber(lval);
        // 11.5-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.5-8
        rnum = ToNumber(rval);
        // 11.5-9
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.5-10
        return rnum * lnum;
    });

    // 11.5
    var BinaryDivision = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.5
        // TODO leftValue is typo of lval

        // 11.5-6
        lnum = ToNumber(lval);
        // 11.5-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.5-8
        rnum = ToNumber(rval);
        // 11.5-9
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.5-10
        return rnum / lnum;
    });

    // 11.5
    var BinaryModulo = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.5
        // TODO leftValue is typo of lval

        // 11.5-6
        lnum = ToNumber(lval);
        // 11.5-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.5-8
        rnum = ToNumber(rval);
        // 11.5-9
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.5-10
        return rnum % lnum;
    });

    // 11.6.1
    var BinaryAddition = AbstractOperation(function (lval, rval) {
        var lprim, rprim;
        // 11.6.1-7
        lprim = ToPrimitive(lval);
        // 11.6.1-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lprim)) { return lprim; } else if (lprim instanceof Completion) { lprim = lprim.value; }
        // 11.6.1-9
        rprim = ToPrimitive(rval);
        // 11.6.1-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rprim)) { return rprim; } else if (rprim instanceof Completion) { rprim = rprim.value; }
        // 11.6.1-11
        if (Type(lprim) === 'String' || Type(rprim) === 'String') {
            // 11.6.1-11-a
            // FIXME spec bug. ReturnIfAbrupt is inserted
            lprim = ToString(lprim);
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(lprim)) { return lprim; } else if (lprim instanceof Completion) { lprim = lprim.value; }
            rprim = ToString(rprim);
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(rprim)) { return rprim; } else if (rprim instanceof Completion) { rprim = rprim.value; }
            return lprim + rprim;
        }
        // 11.6.1-12
        // FIXME spec bug. ReturnIfAbrupt is inserted
        lprim = ToNumber(lprim);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lprim)) { return lprim; } else if (lprim instanceof Completion) { lprim = lprim.value; }
        rprim = ToNumber(rprim);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rprim)) { return rprim; } else if (rprim instanceof Completion) { rprim = rprim.value; }
        return lprim + rprim;
    });

    // 11.6.2
    var BinarySubtraction = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.6.2-7
        lnum = ToNumber(lval);
        // 11.6.2-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.6.2-9
        rnum = ToNumber(rval);
        // 11.6.2-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.6.1-11
        return lnum - rnum;
    });

    // 11.7.1
    var BinaryLeftShift = AbstractOperation(function (lval, rval) {
        var lnum, rnum, shiftCount;
        // 11.7.1-7
        lnum = ToInt32(lval);
        // 11.7.1-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.7.1-9
        rnum = ToUint32(rval);
        // 11.7.1-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.7.1-11
        shiftCount = rnum & 0x1F;
        // 11.7.1-12
        return lnum << shiftCount;
    });

    // 11.7.2
    var BinarySignedRightShift = AbstractOperation(function (lval, rval) {
        var lnum, rnum, shiftCount;
        // 11.7.2-7
        lnum = ToInt32(lval);
        // 11.7.2-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.7.2-9
        rnum = ToUint32(rval);
        // 11.7.2-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.7.2-11
        shiftCount = rnum & 0x1F;
        // 11.7.2-12
        return lnum >> shiftCount;
    });

    // 11.7.3
    var BinaryUnsignedRightShift = AbstractOperation(function (lval, rval) {
        var lnum, rnum, shiftCount;
        // 11.7.3-7
        lnum = ToUint32(lval);
        // 11.7.3-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.7.3-9
        rnum = ToUint32(rval);
        // 11.7.3-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.7.3-11
        shiftCount = rnum & 0x1F;
        // 11.7.3-12
        return lnum >>> shiftCount;
    });

    // 11.8.1
    var AbstractRelationalComparison = AbstractOperation(function (x, y, LeftFirst) {
        var px, py, nx, ny;
        if (LeftFirst === undefined) {
            LeftFirst = true;
        }

        // 11.8.1-1
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(x)) { return x; } else if (x instanceof Completion) { x = x.value; }
        // 11.8.1-2
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(y)) { return y; } else if (y instanceof Completion) { y = y.value; }

        // 11.8.1-3
        if (LeftFirst) {
            // 11.8.1-3-a
            px = ToPrimitive(x, 'Number');
            // 11.8.1-3-b
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(px)) { return px; } else if (px instanceof Completion) { px = px.value; }
            // 11.8.1-3-c
            py = ToPrimitive(y, 'Number');
            // 11.8.1-3-d
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(py)) { return py; } else if (py instanceof Completion) { py = py.value; }
        }
        // 11.8.1-4
        else {
            // 11.8.1-4-a
            py = ToPrimitive(y, 'Number');
            // 11.8.1-4-b
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(py)) { return py; } else if (py instanceof Completion) { py = py.value; }
            // 11.8.1-4-c
            px = ToPrimitive(x, 'Number');
            // 11.8.1-4-d
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(px)) { return px; } else if (px instanceof Completion) { px = px.value; }
        }

        // 11.8.1-5
        if (Type(px) !== 'String' || Type(py) !== 'String') {
            // 11.8.1-5-a
            nx = ToNumber(px);
            // FIXME spec bug inserted
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(nx)) { return nx; } else if (nx instanceof Completion) { nx = nx.value; }
            // 11.8.1-5-b
            ny = ToNumber(py);
            // FIXME spec bug inserted
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(ny)) { return ny; } else if (ny instanceof Completion) { ny = ny.value; }
            // 11.8.1-5-c
            if (isNaN(nx)) {
                return undefined;
            }
            // 11.8.1-5-d
            if (isNaN(ny)) {
                return undefined;
            }
            // 11.8.1-5-e, f, g, h, i, j, k, l
            // Abstract Compare
            return nx < ny;
        }
        // 11.8.1-6
    });

    // 11.1.1
    var PrimaryThis = AbstractOperation(function () {
        // FIXME spec bug.
        // Probably, use ThisResolution in 10.4.4
        // var env;
        // 11.1.1-1
        // env = GetThisEnvironment();
        // 11.1.1-2
        // return env.GetThisBinding();
        return ThisResolution();
    });

    // 11.1.3
    var PrimaryLiteral = AbstractOperation(function (value) {
        return value;
    });

    // 11.2.1
    var Element = AbstractOperation(function (propertyNameValue, baseValue) {
        var res, propertyNameString, strict;
        // FIXME spec bug.
        // we should insert abrupt changing to baseValue and propertyNameValue

        // 11.2.1-7
        res = CheckObjectCoercible(baseValue);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(res)) { return res; } else if (res instanceof Completion) { res = res.value; }

        // 11.2.1-8
        propertyNameString = ToString(propertyNameValue);

        // FIXME spec bug. inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(propertyNameString)) { return propertyNameString; } else if (propertyNameString instanceof Completion) { propertyNameString = propertyNameString.value; }

        // 11.2.1-9
        if (realm.executionContext.code.Strict) {
            strict = true;
        } else {
            strict = false;
        }

        // 11.2.1-10
        return new Reference(baseValue, propertyNameString, strict);
    });

    // 11.4
    var UnaryOperation = AbstractOperation(function (operator, val) {
        switch (operator) {
        // 11.4.1
        case 'delete':
            return UnaryDelete(val);

        // 11.4.2
        case 'void':
            return UnaryVoid(val);

        // 11.4.3
        case 'typeof':
            return UnaryTypeof(val);

        // 11.4.6
        case '+':
            return UnaryPositive(val);

        // 11.4.7
        case '-':
            return UnaryNegative(val);

        // 11.4.8
        case '~':
            return UnaryBitwiseNOT(val);

        // 11.4.9
        case '!':
            return UnaryLogicalNOT(val);
        }
    });

    // 11.4.1
    var UnaryDelete = AbstractOperation(function (ref) {
        var ref, obj, bindings;

        // 11.4.1-1

        // 11.4.1-2
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(ref)) { return ref; } else if (ref instanceof Completion) { ref = ref.value; }

        // 11.4.1-3
        if (Type(ref) !== 'Reference') {
            return true;
        }

        // 11.4.1-4
        if (IsUnresolvableReference(ref)) {
            // 11.4.1-4-a
            if (IsStrictReference(ref)) {
                throw new SyntaxError('11.4.1-4-a');
            }
            // 11.4.1-4-b
            else {
                return true;
            }
        }

        // 11.4.1-5
        if (IsPropertyReference(ref)) {
            // 11.4.1-5-a
            if (IsSuperReference(ref)) {
                throw new ReferenceError('11.4.1-5-a');
            }
            // 11.4.1-5-b
            else {
                obj = ToObject(GetBase(ref))

                // FIXME spec bug. inserted
                // expanded ReturnIfAbrupt by preprocess.js
                if (isAbruptCompletion(obj)) { return obj; } else if (obj instanceof Completion) { obj = obj.value; }

                return obj.Delete(GetReferencedName(ref, IsStrictReference(ref)));
            }
        }
        // 11.4.1-6
        else {
            // 11.4.1-6-a
            bindings = GetBase(ref);

            // 11.4.1-6-b
            return bindings.DeleteBinding(GetReferencedName(ref));
        }
    });

    // 11.4.2
    var UnaryVoid = AbstractOperation(function (expr) {
        var ref;
        // 11.4.2-1

        // 11.4.2-2
        // FIXME spec bug. get 'ref'
        ref = GetValue(expr);

        // 11.4.2-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(ref)) { return ref; } else if (ref instanceof Completion) { ref = ref.value; }

        // 11.4.2-4
        return undefined;
    });

    // 11.4.3
    var UnaryTypeof = AbstractOperation(function (val) {
        // 11.4.3-1

        // 11.4.3-2
        if (Type(val) === 'Reference') {
            // 11.4.3-2-a
            if (IsUnresolvableReference(val)) {
                return 'undefined';
            }

            // 11.4.3-2-b
            val = GetValue(val);
        }

        // 11.4.3-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(val)) { return val; } else if (val instanceof Completion) { val = val.value; }

        // 11.4.3-4
        switch (Type(val)) {
        case 'Undefined':
            return 'undefined';

        case 'Null':
            return 'object';

        case 'Boolean':
            return 'boolean';

        case 'Number':
            return 'number';

        case 'String':
            return 'string';

        case 'Object':
            if ('Call' in val) {
                return 'function';
            } else {
                return 'object';
            }
        }
    });

    // 11.4.4
    var PrefixIncrement = AbstractOperation(function (expr) {
        var oldValue, newValue, status;
        // 11.4.4-1

        // 11.4.4-2
        oldValue = ToNumber(GetValue(expr));

        // 11.4.4-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.4-4
        newValue = oldValue + 1;

        // 11.4.4-5
        status = PutValue(expr, newValue);

        // 11.4.4-6
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }

        // 11.4.4-7
        return newValue;
    });

    // 11.4.5
    var PrefixDecrement = AbstractOperation(function (expr) {
        var oldValue, newValue, status;
        // 11.4.5-1

        // 11.4.5-2
        oldValue = ToNumber(GetValue(expr));

        // 11.4.5-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.5-4
        newValue = oldValue - 1;

        // 11.4.5-5
        status = PutValue(expr, newValue);

        // 11.4.5-6
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }

        // 11.4.5-7
        return newValue;
    });

    // 11.4.6
    var UnaryPositive = AbstractOperation(function (expr) {
        // 11.4.6-1

        // 11.4.6-2
        return ToNumber(GetValue(expr));
    });

    // 11.4.7
    var UnaryNegative = AbstractOperation(function (expr) {
        var oldValue;
        // 11.4.7-1

        // 11.4.7-2
        oldValue = ToNumber(GetValue(expr));

        // 11.4.7-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.7-4
        if (isNaN(oldValue)) {
            return NaN;
        }

        // 11.4.7-5
        return -oldValue;
    });

    // 11.4.8
    var UnaryBitwiseNOT = AbstractOperation(function (expr) {
        var oldValue;
        // 11.4.8-1

        // 11.4.8-2
        oldValue = ToInt32(GetValue(expr));

        // 11.4.8-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.8-4
        return ~oldValue;
    });

    // 11.4.9
    var UnaryLogicalNOT = AbstractOperation(function (expr) {
        var oldValue;
        // 11.4.9-1

        // 11.4.9-2
        oldValue = ToBoolean(GetValue(expr));

        // 11.4.9-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.4.9-4
        if (oldValue) {
            return false;
        }

        // 11.4.9-5
        return true;
    });

    // 11.3.1
    var PostfixIncrement = AbstractOperation(function (lhs) {
        var oldValue, newValue, status;
        // 11.3.1-1

        // 11.3.1-2
        oldValue = ToNumber(GetValue(lhs));

        // 11.3.1-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.3.1-4
        newValue = oldValue + 1;

        // 11.3.1-5
        status = PutValue(lhs, newValue);

        // 11.3.1-6
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }

        // 11.3.1-7
        return oldValue;
    });

    // 11.3.2
    var PostfixDecrement = AbstractOperation(function (lhs) {
        var oldValue, newValue, status;
        // 11.3.2-1

        // 11.3.2-2
        oldValue = ToNumber(GetValue(lhs));

        // 11.3.2-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(oldValue)) { return oldValue; } else if (oldValue instanceof Completion) { oldValue = oldValue.value; }

        // 11.3.2-4
        newValue = oldValue - 1;

        // 11.3.2-5
        status = PutValue(lhs, newValue);

        // 11.3.2-6
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }

        // 11.3.2-7
        return oldValue;
    });

    var BinaryOperation = AbstractOperation(function (operator, lval, rval) {
        switch (operator) {
            case '*':
            case '*=':
                return BinaryMultiplication(lval, rval);
            case '/':
            case '/=':
                return BinaryDivision(lval, rval);
            case '%':
            case '%=':
                return BinaryModulo(lval, rval);
            case '+':
            case '+=':
                return BinaryAddition(lval, rval);
            case '-':
            case '-=':
                return BinarySubtraction(lval, rval);
            case '<<':
            case '<<=':
                return BinaryLeftShift(lval, rval);
            case '>>':
            case '>>=':
                return BinarySignedRightShift(lval, rval);
            case '>>>':
            case '>>>=':
                return BinaryUnsignedRightShift(lval, rval);
            case '<':
                return BinaryLessThan(lval, rval);
            case '>':
                return BinaryGreaterThan(lval, rval);
            case '<=':
                return BinaryLessThanEqual(lval, rval);
            case '>=':
                return BinaryGreaterThanEqual(lval, rval);
            case 'in':
                return BinaryIn(lval, rval);
            case 'instanceof':
                return BinaryInstanceof(lval, rval);
            case 'is':
                return BinaryIs(lval, rval);
            case 'isnt':
                return BinaryIsnt(lval, rval);
            case '==':
                return BinaryAbstractEqual(lval, rval);
            case '!=':
                return BinaryAbstractNotEqual(lval, rval);
            case '===':
                return BinaryStrictEqual(lval, rval);
            case '!==':
                return BinaryStrictNotEqual(lval, rval);
            case '&':
            case '&=':
                return BinaryBitwiseAND(lval, rval);
            case '|':
            case '|=':
                return BinaryBitwiseOR(lval, rval);
            case '^':
            case '^=':
                return BinaryBitwiseXOR(lval, rval);
        }
    });

    // 11.5
    var BinaryMultiplication = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.5
        // TODO leftValue is typo of lval

        // 11.5-6
        lnum = ToNumber(lval);
        // 11.5-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.5-8
        rnum = ToNumber(rval);
        // 11.5-9
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.5-10
        return rnum * lnum;
    });

    // 11.5
    var BinaryDivision = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.5
        // TODO leftValue is typo of lval

        // 11.5-6
        lnum = ToNumber(lval);
        // 11.5-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.5-8
        rnum = ToNumber(rval);
        // 11.5-9
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.5-10
        return rnum / lnum;
    });

    // 11.5
    var BinaryModulo = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.5
        // TODO leftValue is typo of lval

        // 11.5-6
        lnum = ToNumber(lval);
        // 11.5-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.5-8
        rnum = ToNumber(rval);
        // 11.5-9
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.5-10
        return rnum % lnum;
    });

    // 11.6.1
    var BinaryAddition = AbstractOperation(function (lval, rval) {
        var lprim, rprim;
        // 11.6.1-7
        lprim = ToPrimitive(lval);
        // 11.6.1-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lprim)) { return lprim; } else if (lprim instanceof Completion) { lprim = lprim.value; }
        // 11.6.1-9
        rprim = ToPrimitive(rval);
        // 11.6.1-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rprim)) { return rprim; } else if (rprim instanceof Completion) { rprim = rprim.value; }
        // 11.6.1-11
        if (Type(lprim) === 'String' || Type(rprim) === 'String') {
            // 11.6.1-11-a
            // FIXME spec bug. ReturnIfAbrupt is inserted
            lprim = ToString(lprim);
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(lprim)) { return lprim; } else if (lprim instanceof Completion) { lprim = lprim.value; }
            rprim = ToString(rprim);
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(rprim)) { return rprim; } else if (rprim instanceof Completion) { rprim = rprim.value; }
            return lprim + rprim;
        }
        // 11.6.1-12
        // FIXME spec bug. ReturnIfAbrupt is inserted
        lprim = ToNumber(lprim);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lprim)) { return lprim; } else if (lprim instanceof Completion) { lprim = lprim.value; }
        rprim = ToNumber(rprim);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rprim)) { return rprim; } else if (rprim instanceof Completion) { rprim = rprim.value; }
        return lprim + rprim;
    });

    // 11.6.2
    var BinarySubtraction = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.6.2-7
        lnum = ToNumber(lval);
        // 11.6.2-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.6.2-9
        rnum = ToNumber(rval);
        // 11.6.2-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.6.1-11
        return lnum - rnum;
    });

    // 11.7.1
    var BinaryLeftShift = AbstractOperation(function (lval, rval) {
        var lnum, rnum, shiftCount;
        // 11.7.1-7
        lnum = ToInt32(lval);
        // 11.7.1-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.7.1-9
        rnum = ToUint32(rval);
        // 11.7.1-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.7.1-11
        shiftCount = rnum & 0x1F;
        // 11.7.1-12
        return lnum << shiftCount;
    });

    // 11.7.2
    var BinarySignedRightShift = AbstractOperation(function (lval, rval) {
        var lnum, rnum, shiftCount;
        // 11.7.2-7
        lnum = ToInt32(lval);
        // 11.7.2-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.7.2-9
        rnum = ToUint32(rval);
        // 11.7.2-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.7.2-11
        shiftCount = rnum & 0x1F;
        // 11.7.2-12
        return lnum >> shiftCount;
    });

    // 11.7.3
    var BinaryUnsignedRightShift = AbstractOperation(function (lval, rval) {
        var lnum, rnum, shiftCount;
        // 11.7.3-7
        lnum = ToUint32(lval);
        // 11.7.3-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.7.3-9
        rnum = ToUint32(rval);
        // 11.7.3-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.7.3-11
        shiftCount = rnum & 0x1F;
        // 11.7.3-12
        return lnum >>> shiftCount;
    });

    // 11.8.1
    var AbstractRelationalComparison = AbstractOperation(function (x, y, LeftFirst) {
        var px, py, nx, ny;
        if (LeftFirst === undefined) {
            LeftFirst = true;
        }

        // 11.8.1-1
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(x)) { return x; } else if (x instanceof Completion) { x = x.value; }
        // 11.8.1-2
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(y)) { return y; } else if (y instanceof Completion) { y = y.value; }

        // 11.8.1-3
        if (LeftFirst) {
            // 11.8.1-3-a
            px = ToPrimitive(x, 'Number');
            // 11.8.1-3-b
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(px)) { return px; } else if (px instanceof Completion) { px = px.value; }
            // 11.8.1-3-c
            py = ToPrimitive(y, 'Number');
            // 11.8.1-3-d
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(py)) { return py; } else if (py instanceof Completion) { py = py.value; }
        }
        // 11.8.1-4
        else {
            // 11.8.1-4-a
            py = ToPrimitive(y, 'Number');
            // 11.8.1-4-b
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(py)) { return py; } else if (py instanceof Completion) { py = py.value; }
            // 11.8.1-4-c
            px = ToPrimitive(x, 'Number');
            // 11.8.1-4-d
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(px)) { return px; } else if (px instanceof Completion) { px = px.value; }
        }

        // 11.8.1-5
        if (Type(px) !== 'String' || Type(py) !== 'String') {
            // 11.8.1-5-a
            nx = ToNumber(px);
            // FIXME spec bug inserted
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(nx)) { return nx; } else if (nx instanceof Completion) { nx = nx.value; }
            // 11.8.1-5-b
            ny = ToNumber(py);
            // FIXME spec bug inserted
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(ny)) { return ny; } else if (ny instanceof Completion) { ny = ny.value; }
            // 11.8.1-5-c
            if (isNaN(nx)) {
                return undefined;
            }
            // 11.8.1-5-d
            if (isNaN(ny)) {
                return undefined;
            }
            // 11.8.1-5-e, f, g, h, i, j, k, l
            // Abstract Compare
            return nx < ny;
        }
        // 11.8.1-6
        else {
            // 11.8.1-6-a, b, c, d, e, f
            return px < py;
        }
    });

    // 11.8.1
    var BinaryLessThan = AbstractOperation(function (lval, rval) {
        var r;
        // 11.8.1-6
        r = AbstractRelationalComparison(lval, rval);
        // 11.8.1-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(r)) { return r; } else if (r instanceof Completion) { r = r.value; }
        // 11.8.1-8
        if (r === undefined) {
            return false;
        } else {
            return r;
        }
    });

    // 11.8.1
    var BinaryGreaterThan = AbstractOperation(function (lval, rval) {
        var r;
        // 11.8.1-6
        r = AbstractRelationalComparison(rval, lval, false);
        // 11.8.1-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(r)) { return r; } else if (r instanceof Completion) { r = r.value; }
        // 11.8.1-8
        if (r === undefined) {
            return false;
        } else {
            return r;
        }
    });

    // 11.8.1
    var BinaryLessThanEqual = AbstractOperation(function (lval, rval) {
        var r;
        // 11.8.1-6
        r = AbstractRelationalComparison(rval, lval, false);
        // 11.8.1-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(r)) { return r; } else if (r instanceof Completion) { r = r.value; }
        // 11.8.1-8
        if (r === true || r === undefined) {
            return false;
        } else {
            return true;
        }
    });

    // 11.8.1
    var BinaryGreaterThanEqual = AbstractOperation(function (lval, rval) {
        var r;
        // 11.8.1-6
        r = AbstractRelationalComparison(lval, rval);
        // 11.8.1-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(r)) { return r; } else if (r instanceof Completion) { r = r.value; }
        // 11.8.1-8
        if (r === true || r === undefined) {
            return false;
        } else {
            return true;
        }
    });

    // 11.8.1
    var BinaryIn = AbstractOperation(function (lval, rval) {
        // 11.8.1-7
        if (Type(rval) !== 'Object') {
            throw new TypeError('11.8.1-7');
        }
        // 11.8.1-8
        if (!('HasInstance' in rval)) {
            throw new TypeError('11.8.1-8');
        }
        // 11.8.1-9
        return rval.HasInstance(lval);
    });

    // 11.8.1
    var BinaryInstanceof = AbstractOperation(function (lval, rval) {
        // 11.8.1-7
        if (Type(rval) !== 'Object') {
            throw new TypeError('11.8.1-7');
        }
        // 11.8.1-8
        // FIXME spec bug. inserted
        lval = ToString(lval);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lval)) { return lval; } else if (lval instanceof Completion) { lval = lval.value; }
        return rval.HasProperty(lval);
    });

    // 11.9.1
    var AbstractEqualityComparison = AbstractOperation(function (x, y) {
        // 11.9.1-1
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(x)) { return x; } else if (x instanceof Completion) { x = x.value; }
        // 11.9.1-2
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(y)) { return y; } else if (y instanceof Completion) { y = y.value; }
        // 11.9.1-3
        if (Type(x) === Type(y)) {
            // 11.9.1-3-a
            if (Type(x) === 'Undefined') {
                return true;
            }
            // 11.9.1-3-b
            if (Type(x) === 'Null') {
                return true;
            }
            // 11.9.1-3-c
            if (Type(x) === 'Number') {
                // 11.9.1-3-c-i
                if (isNaN(x)) {
                    return false;
                }
                // 11.9.1-3-c-ii
                if (isNaN(y)) {
                    return false;
                }
                // 11.9.1-3-c-iii, iv, v, vi
                return x === y;
            }
            // 11.9.1-3-d
            if (Type(x) === 'String') {
                return x === y;
            }
            // 11.9.1-3-e
            if (Type(x) === 'Boolean') {
                return x === y;
            }
            // 11.9.1-3-f
            return x === y;
        }
        // 11.9.1-4
        if (x === null && y === undefined) {
            return true;
        }
        // 11.9.1-5
        if (x === undefined && y === null) {
            return true;
        }
        // 11.9.1-6
        if (Type(x) === 'Number' || Type(y) === 'String') {
            return AbstractEqualityComparison(x, ToNumber(y));
        }
        // 11.9.1-7
        if (Type(x) === 'String' || Type(y) === 'Number') {
            return AbstractEqualityComparison(ToNumber(x), y);
        }
        // 11.9.1-8
        if (Type(x) === 'Boolean') {
            return AbstractEqualityComparison(ToNumber(x), y);
        }
        // 11.9.1-9
        if (Type(y) === 'Boolean') {
            return AbstractEqualityComparison(x, ToNumber(y));
        }
        // 11.9.1-10
        if ((Type(x) === 'String' || Type(x) === 'Number') && Type(y) === 'Object') {
            return AbstractEqualityComparison(x, ToPrimitive(y));
        }
        // 11.9.1-11
        if (Type(x) === 'Object' && (Type(y) === 'Number' || Type(y) === 'Object')) {
            return AbstractEqualityComparison(ToPrimitive(x), y);
        }
        return false;
    });

    // 11.9.1
    var StrictEqualityComparison = AbstractOperation(function (x, y) {
        // 11.9.1-1
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(x)) { return x; } else if (x instanceof Completion) { x = x.value; }
        // 11.9.1-2
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(y)) { return y; } else if (y instanceof Completion) { y = y.value; }
        // 11.9.1-3
        if (Type(x) !== Type(y)) {
            return false;
        }
        // 11.9.1-4
        if (Type(x) === 'Undefined') {
            return true;
        }
        // 11.9.1-5
        if (Type(x) === 'Null') {
            return true;
        }
        // 11.9.1-6
        if (Type(x) === 'Number') {
            // 11.9.1-6-a
            if (isNaN(x)) {
                return false;
            }
            // 11.9.1-6-b
            if (isNaN(y)) {
                return false;
            }
            // 11.9.1-6-c,d,e,f
            return x === y;
        }
        // 11.9.1-7,8,9
        return x === y;
    });

    // 11.9.1
    var BinaryAbstractEqual = AbstractOperation(function (lval, rval) {
        // 11.9.1-6
        return AbstractEqualityComparison(rval, lval);
    });

    // 11.9.1
    var BinaryAbstractNotEqual = AbstractOperation(function (lval, rval) {
        var r;
        // 11.9.1-7
        r = AbstractEqualityComparison(rval, lval);
        // FIXME inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(r)) { return r; } else if (r instanceof Completion) { r = r.value; }
        // 11.9.1-8
        // FIXME spec bug. use Else instead of Otherwise
        if (r) {
            return false;
        } else {
            return true;
        }
    });

    // 11.9.1
    var BinaryStrictEqual = AbstractOperation(function (lval, rval) {
        // 11.9.1-6
        return StrictEqualityComparison(rval, lval);
    });

    // 11.9.1
    var BinaryStrictNotEqual = AbstractOperation(function (lval, rval) {
        var r;
        // 11.9.1-7
        r = StrictEqualityComparison(rval, lval);
        // FIXME inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(r)) { return r; } else if (r instanceof Completion) { r = r.value; }
        // 11.9.1-8
        // FIXME spec bug. use Else instead of Otherwise
        if (r) {
            return false;
        } else {
            return true;
        }
    });

    // 11.9.1
    var BinaryIs = AbstractOperation(function (lval, rval) {
        // 11.9.1-6
        return SameValue(rval, lval);
    });

    // 11.9.1
    var BinaryIsnt = AbstractOperation(function (lval, rval) {
        var r;
        // 11.9.1-6
        r = SameValue(rval, lval);
        // 11.9.1-7
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(r)) { return r; } else if (r instanceof Completion) { r = r.value; }
        // 11.9.1-8
        // FIXME spec bug. use Else instead of Otherwise
        if (r) {
            return false;
        } else {
            return true;
        }
    });

    // 11.10
    var BinaryBitwiseAND = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.10-7
        lnum = ToInt32(lval);
        // 11.10-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.10-9
        rnum = ToInt32(rval);
        // 11.10-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.10-11
        return lnum & rnum;
    });

    // 11.10
    var BinaryBitwiseXOR = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.10-7
        lnum = ToInt32(lval);
        // 11.10-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.10-9
        rnum = ToInt32(rval);
        // 11.10-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.10-11
        return lnum ^ rnum;
    });

    // 11.10
    var BinaryBitwiseOR = AbstractOperation(function (lval, rval) {
        var lnum, rnum;
        // 11.10-7
        lnum = ToInt32(lval);
        // 11.10-8
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(lnum)) { return lnum; } else if (lnum instanceof Completion) { lnum = lnum.value; }
        // 11.10-9
        rnum = ToInt32(rval);
        // 11.10-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(rnum)) { return rnum; } else if (rnum instanceof Completion) { rnum = rnum.value; }
        // 11.10-11
        return lnum | rnum;
    });

    // 10.4.2
    function IdentifierResolution(name) {
        var env, strict;
        // 10.4.2-1
        env = realm.executionContext.LexicalEnvironment;

        // 10.4.2-2
        strict = realm.executionContext.code.Strict;

        // 10.4.2-3
        return GetIdentifierReference(env, name, strict);
    }

    // 10.4.3
    function GetThisEnvironment() {
        var lex, exists, outer;

        // 10.4.3-1
        lex = realm.executionContext.LexicalEnvironment;

        // 10.4.3-2
        while (true) {
            // 10.4.3-2-b
            exists = lex.HasThisBinding();

            // 10.4.3-2-c
            if (exists) {
                return lex;
            }

            // 10.4.3-2-d
            outer = lex.outer;

            // 10.4.3-2-e
            lex = outer;
        }
    }

    // 10.4.4
    function ThisResolution() {
        var env;

        // 10.4.4-1
        env = GetThisEnvironment();

        // 10.4.4-2
        return env.GetThisBinding();
    }

    function JSObject() {
        this.Prototype = null;
        this.Extensible = true;
        this.__record = Object.create(null);
    }

    function ObjectCreate(proto) {
        var obj;
        if (proto === undefined) {
            proto = realm.ObjectPrototype;
        }
        obj = new JSObject();
        obj.Prototype = proto;
        obj.Extensible = true;
        return obj;
    }

    // no error
    // 8.12.1
    JSObject.prototype.GetOwnProperty = function GetOwnProperty(P) {
        var D, X;

        // 8.12.1-1
        if (!shibuya.common.has(this.__record, P)) {
            return undefined;
        }

        // 8.12.1-2
        D = {};

        // 8.12.1-3
        X = this.__record[P];

        // 8.12.1-4
        if (IsDataDescriptor(X)) {
            // 8.12.1-4-a
            D.Value = X.Value;

            // 8.12.1-4-b
            D.Writable = X.Writable;
        }
        // 8.12.1-5
        else {
            shibuya.common.assert(IsAccessorDescriptor(X));

            // 8.12.1-5-a
            D.Get = X.Get;

            // 8.12.1-5-b
            D.Set = X.Set;
        }

        // 8.12.1-6
        D.Enumerable = X.Enumerable;

        // 8.12.1-7
        D.Configurable = X.Configurable;

        // 8.12.1-8
        return D;
    };

    // no error
    // 8.12.2
    JSObject.prototype.GetProperty = function GetProperty(P) {
        var prop, proto;

        // 8.12.2-1
        prop = this.GetOwnProperty(P);

        // 8.12.2-2
        if (prop !== undefined) {
            return prop;
        }

        // 8.12.2-3
        proto = this.Prototype;

        // 8.12.2-4
        if (proto === null) {
            return undefined;
        }

        // 8.12.2-5
        return proto.GetProperty(P);
    };

    // 8.12.3
    JSObject.prototype.Get = AbstractOperation(function Get(P, accessorThisValue) {
        var desc, getter;

        // 8.12.3-1
        desc = this.GetProperty(P);

        // 8.12.3-2
        if (desc === undefined) {
            return undefined;
        }

        // 8.12.3-3
        if (IsDataDescriptor(desc)) {
            return desc.Value;
        }
        // 8.12.3-4
        // FIXME spec bug. why 'otherwise'. should use 'Else'
        else {
            shibuya.common.assert(IsAccessorDescriptor(desc));
            getter = desc.Get;
        }

        // 8.12.3-5
        if (getter === undefined) {
            return undefined;
        }

        // 8.12.3-6
        if (arguments.length !== 2) {
            accessorThisValue = this;
        }

        // 8.12.3-7
        return getter.Call(accessorThisValue, []);
    });

    // no error
    // 8.12.4
    JSObject.prototype.CanPut = function CanPut(P) {
        var desc, proto, inherited;

        // 8.12.4-1
        desc = this.GetOwnProperty(P);

        // 8.12.4-2
        if (desc !== undefined) {
            // 8.12.4-2-a
            if (IsAccessorDescriptor(desc)) {
                // 8.12.4-2-a-i
                if (desc.Set === undefined) {
                    return false;
                }
                // 8.12.4-2-a-ii
                else {
                    return true;
                }
            }
            // 8.12.4-2-b
            else {
                shibuya.common.assert(IsDataDescriptor(desc));
                return desc.Writable;
            }
        }

        // 8.12.4-3
        proto = this.Prototype;

        // 8.12.4-4
        if (proto === null) {
            return this.Extensible;
        }

        // 8.12.4-5
        inherited = proto.GetProperty(P);

        // 8.12.4-6
        if (inherited === undefined) {
            return this.Extensible;
        }

        // 8.12.4-7
        if (IsAccessorDescriptor(inherited)) {
            // 8.12.4-7-a
            if (inherited.Set === undefined) {
                return false;
            }
            // 8.12.4-7-b
            else {
                return true;
            }
        }
        // 8.12.4-8
        else {
            shibuya.common.assert(IsDataDescriptor(inherited));

            // 8.12.4-8-a
            if (!this.Extensible) {
                return false;
            }
            // 8.12.4-8-b
            else {
                return inherited.Writable;
            }
        }
    };

    // 8.12.5
    JSObject.prototype.Put = AbstractOperation(function Put(P, V, Throw, accessorThisValue) {
        var ownDesc, valueDesc, desc, setter, newDesc;

        // 8.12.5-1
        if (!this.CanPut(P)) {
            // 8.12.5-1-a
            if (Throw) {
                throw new TypeError('8.12.5-1-a');
            }
            // 8.12.5-1-b
            else {
                return undefined;
            }
        }

        // 8.12.5-2
        ownDesc = this.GetOwnProperty(P);

        // 8.12.5-3
        if (IsDataDescriptor(ownDesc)) {
            // 8.12.5-3-a
            valueDesc = { Value: V };

            // 8.12.5-3-b
            return this.DefineOwnProperty(P, valueDesc, Throw);
        }

        // 8.12.5-4
        desc = this.GetProperty(P);

        // 8.12.5-5
        if (IsAccessorDescriptor(desc)) {
            // 8.12.5-5-a
            setter = desc.Set;
            shibuya.common.assert(setter !== undefined);

            // 8.12.5-5-b
            // TODO(Constellation) this check is not good.
            if (arguments.length !== 4) {
                accessorThisValue = this;
            }

            // 8.12.5-5-c
            // FIXME draft is bug! 'thisValue' is not defined.
            return setter.Call(accessorThisValue, [V]);
        }
        // 8.12.5-6
        else {
            // 8.12.5-6-a
            newDesc = { Value: V, Writable: true, Enumerable: true, Configurable: true };

            // 8.12.5-6-b
            return this.DefineOwnProperty(P, newDesc, Throw);
        }
    });

    // no error
    // 8.12.6
    JSObject.prototype.HasProperty = function HasProperty(P) {
        var desc;

        // 8.12.6-1
        desc = this.GetProperty(P);

        // 8.12.6-2
        if (desc === undefined) {
            return false;
        }
        // 8.12.6-3
        else {
            return true;
        }
    };

    // 8.12.7
    JSObject.prototype.Delete = AbstractOperation(function Delete(P, Throw) {
        var desc;

        // 8.12.7-1
        desc = this.GetOwnProperty(P);

        // 8.12.7-2
        if (desc === undefined) {
            return true;
        }

        // 8.12.7-3
        if (desc.Configurable === true) {
            // 8.12.7-3-a
            delete this.__record[P];

            // 8.12.7-3-b
            return true;
        }
        // 8.12.7-4
        else if (Throw) {
            // FIXME spec bug. should write 'Throw is true'
            throw new TypeError('8.12.7-4');
        }

        // 8.12.7-5
        return false;
    });

    // 8.12.8
    JSObject.prototype.DefaultValue = AbstractOperation(function DefaultValue(hint) {
        var toString, str, valueOf, val;

        if (hint === 'String') {
            // 8.12.8-1
            toString = this.Get('toString');

            // 8.12.8-2
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(toString)) { return toString; } else if (toString instanceof Completion) { toString = toString.value; }

            // 8.12.8-3
            if (IsCallable(toString)) {
                // 8.12.8-3-a
                str = toString.Call(this, []);

                // 8.12.8-3-b
                // expanded ReturnIfAbrupt by preprocess.js
                if (isAbruptCompletion(str)) { return str; } else if (str instanceof Completion) { str = str.value; }
                // 8.12.8-3-c
                if (IsPrimitiveValue(str)) {
                    return str;
                }
            }

            // 8.12.8-4
            valueOf = this.Get('valueOf');

            // 8.12.8-5
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(valueOf)) { return valueOf; } else if (valueOf instanceof Completion) { valueOf = valueOf.value; }

            // 8.12.8-6
            if (IsCallable(valueOf)) {
                // 8.12.8-6-a
                val = valueOf.Call(this, []);

                // 8.12.8-6-b
                // expanded ReturnIfAbrupt by preprocess.js
                if (isAbruptCompletion(val)) { return val; } else if (val instanceof Completion) { val = val.value; }
                // 8.12.8-6-c
                if (IsPrimitiveValue(val)) {
                    return val;
                }
            }

            // 8.12.8-7
            throw new TypeError('8.12.8-7');
        } else {
            // 8.12.8-1
            valueOf = this.Get('valueOf');

            // 8.12.8-2
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(valueOf)) { return valueOf; } else if (valueOf instanceof Completion) { valueOf = valueOf.value; }

            // 8.12.8-3
            if (IsCallable(valueOf)) {
                // 8.12.8-3-a
                val = valueOf.Call(this, []);

                // 8.12.8-3-b
                // expanded ReturnIfAbrupt by preprocess.js
                if (isAbruptCompletion(val)) { return val; } else if (val instanceof Completion) { val = val.value; }
                // 8.12.8-3-c
                if (IsPrimitiveValue(val)) {
                    return val;
                }
            }

            // 8.12.8-4
            toString = this.Get('toString');

            // 8.12.8-5
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(toString)) { return toString; } else if (toString instanceof Completion) { toString = toString.value; }

            // 8.12.8-6
            if (IsCallable(toString)) {
                // 8.12.8-6-a
                str = toString.Call(this, []);

                // 8.12.8-6-b
                // expanded ReturnIfAbrupt by preprocess.js
                if (isAbruptCompletion(str)) { return str; } else if (str instanceof Completion) { str = str.value; }

                // 8.12.8-6-c
                if (IsPrimitiveValue(str)) {
                    return str;
                }
            }

            // 8.12.8-7
            throw new TypeError('8.12.8-7');
        }
    });

    // 8.12.9
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

        // 8.12.9-1
        current = this.GetOwnProperty(P);

        // 8.12.9-2
        extensible = this.Extensible;

        // 8.12.9-3
        if (current === undefined && !extensible) {
            return Reject('8.12.9-3');
        }

        // 8.12.9-4
        if (current === undefined && extensible) {
            // 8.12.9-4-a
            if (IsGenericDescriptor(Desc) || IsDataDescriptor(Desc)) {
                // 8.12.9-4-a-i
                this.__record[P] = DefaultDataDescriptor(Desc);
            }
            // 8.12.9-4-b
            else {
                // 8.12.9-4-b-i
                this.__record[P] = DefaultAccessorDescriptor(Desc);
            }
            // 8.12.9-4-c
            return true;
        }

        // 8.12.9-5
        names = Object.getOwnPropertyNames(Desc);
        if (names.length === 0) {
            return true;
        }

        // 8.12.9-6
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

        // 8.12.9-7
        if (!current.Configurable) {
            // 8.12.9-7-a
            if (Desc.Configurable) {
                return Reject('8.12.9-7-a');
            }

            // 8.12.9-7-b
            if (Desc.hasOwnProperty('Enumerable') && Desc.Enumerable !== current.Enumerable) {
                return Reject('8.12.9-7-b');
            }
        }

        // 8.12.9-8
        if (IsGenericDescriptor(Desc)) {
        }
        // 8.12.9-9
        else if (IsDataDescriptor(current) !== IsDataDescriptor(Desc)) {
            // 8.12.9-9-a
            if (!current.Configurable) {
                return Reject('8.12.9-9-a');
            }

            // 8.12.9-9-b
            if (IsDataDescriptor(current)) {
                // 8.12.9-9-b-i
                this.__record[P] = DefaultAccessorDescriptor({
                    Configurable: current.Configurable,
                    Enumerable: current.Enumerable
                });
            }
            // 8.12.9-9-c
            else {
                // 8.12.9-9-c-i
                this.__record[P] = DefaultDataDescriptor({
                    Configurable: current.Configurable,
                    Enumerable: current.Enumerable
                });
            }
        }
        // 8.12.9-10
        else if (IsDataDescriptor(current)) {
            // 8.12.9-10-a
            if (!current.Configurable) {
                // 8.12.9-10-a-i
                if (!current.Writable && Desc.Writable) {
                    return Reject('8.12.9-10-a-i');
                }

                // 8.12.9-10-a-ii
                if (!current.Writable) {
                    // 8.12.9-10-a-ii-1
                    if (Desc.hasOwnProperty('Value') && !SameValue(Desc.Value, current.Value)) {
                        return Reject('8.12.9-10-a-ii-1');
                    }
                }
            }
        }
        // 8.12.9-11
        else {
            // 8.12.9-11-a
            if (!current.Configurable) {
                // 8.12.9-11-a-i
                if (Desc.hasOwnProperty('Set') && !SameValue(Desc.Set, current.Set)) {
                    return Reject('8.12.9-11-a-i');
                }

                // 8.12.9-11-a-ii
                if (Desc.hasOwnProperty('Get') && !SameValue(Desc.Get, current.Get)) {
                    return Reject('8.12.9-11-a-ii');
                }
            }
        }

        // 8.12.9-12
        Object.getOwnPropertyNames(Desc).forEach(function (name) {
            this.__record[P][name] = Desc[name];
        }, this);

        // 8.12.9-13
        return true;
    });

    // no error
    // 8.12.10
    JSObject.prototype.Enumerate = function Enumerate(includePrototype, onlyEnumerable) {
        var obj, proto, propList;

        // 8.12.10-1
        obj = this;

        // 8.12.10-2
        proto = this.Prototype;

        // 8.12.10-3
        if (!includePrototype || proto === null) {
            // 8.12.10-3-a
            propList = [];
        }
        // 8.12.10-4
        else {
            // 8.12.10-4-a
            propList = proto.Enumerable(true, onlyEnumerable);
        }

        // 8.12.10-5
        Object.getOwnPropertyNames(this.__record).forEach(function (name) {
            var desc, index;

            // 8.12.10-5-a
            desc = this.GetOwnProperty(name);

            // 8.12.10-5-b
            index = propList.indexOf(name);
            if (index !== -1) {
                propList.splice(index, 1);
            }

            // 8.12.10-5-c
            if (!onlyEnumerable || desc.Enumerable) {
                propList.push(name);
            }
        }, this);

        // 8.12.10-6
        propList.sort();

        // 8.12.10-7
        return propList;
    };

    // FIXME error or not?
    JSObject.prototype.Iterate = AbstractOperation(function Iterate() {
        var itr;
        itr = Iterator(this, []);
        return itr;
    });

    function JSFunction() {
        JSObject.call(this);
    }

    // 13.6
    // functionPrototype, homeObject and methodName are optional
    function FunctionCreate(kind, FormalParameterList, FunctionBody, Scope, Strict, functionPrototype, homeObject, methodName) {
        var F, len, thrower;

        F = new JSFunction();
        F.NativeBrand = NativeBrand.NativeFunction;
        if (functionPrototype === undefined) {
            functionPrototype = realm.FunctionPrototype;
        }
        F.Prototype = functionPrototype;
        F.Scope = Scope;
        F.FormalParameters = FormalParameterList;
        F.Code = FunctionBody;
        F.Extensible = true;
        F.Realm = realm;
        if (homeObject !== undefined) {
            F.Home = homeObject;
        }
        if (methodName !== undefined) {
            F.MethodName = methodName;
        }

        if (kind === 'Arrow') {
            F.ThisMode = 'lexical';
        } else if (Strict) {
            F.ThisMode = 'strict';
        } else {
            F.ThisMode = 'global';
        }

        len = FormalParameterList.ExpectedArgumentCount;
        F.DefineOwnProperty('length', {
            Value: len,
            Writable: false,
            Enumerable: false,
            Configurable: false
        }, false);
        if (kind === 'Normal' && Strict) {
            thrower = realm.ThrowTypeError;
            F.DefineOwnProperty('caller', {
                Get: thrower,
                Set: thrower,
                Enumerable: false,
                Configurable: false,
            }, false);
            F.DefineOwnProperty('arguments', {
                Get: thrower,
                Set: thrower,
                Enumerable: false,
                Configurable: false,
            }, false);
        }
        F.Strict = Strict;
        return F;
    }

    // 13.5
    // writablePrototype and prototype are optional
    function MakeConstructor(F, writablePrototype, prototype) {
        var installNeeded;
        installNeeded = false;
        if (prototype === undefined) {
            installNeeded = true;
            prototype = ObjectCreate();
        }
        if (writablePrototype === undefined) {
            writablePrototype = true;
        }
        F.Construct = FunctionConstruct;
        F.HasInstance = FunctionHasInstance;
        if (installNeeded) {
            F.DefineOwnProperty('constructor', {
                Value: F,
                Writable: writablePrototype,
                Enumerable: false,
                Configurable: writablePrototype
            }, false);
        }
        F.DefineOwnProperty('prototype', {
            Value: prototype,
            Writable: writablePrototype,
            Enumerable: false,
            Configurable: writablePrototype
        }, false);
        return;
    }

    // 11.1.5
    var DefineProperty = AbstractOperation(function (object, propName, propValue) {
        var desc;
        // 11.1.5-4
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(propValue)) { return propValue; } else if (propValue instanceof Completion) { propValue = propValue.value; }
        // 11.1.5-5
        desc = {
            Value: propValue,
            Writable: true,
            Enumerable: true,
            Configurable: true
        };
        // 11.1.5-6
        return object.DefineOwnProperty(propName, desc, false);
    });

    // 13.3
    var PropertyDefinitionEvaluation = AbstractOperation(function (kind, object, propName, code) {
        switch (kind) {
        case 'method':
            return DefineMethod(object, propName, code);
        case 'get':
            return DefineGetter(object, propName, code);
        case 'set':
            return DefineSetter(object, propName, code);
        }
    });

    // 13.3
    var DefineMethod = AbstractOperation(function (object, propName, code) {
        var strict, scope, needsSuperBinding, closure, desc, status;
        // 13.3-2
        strict = true;
        // 13.3-3
        scope = realm.executionContext.LexicalEnvironment;
        // 13.3-4,5
        needsSuperBinding = code.NeedsSuperBinding;
        // 13.3-6
        if (needsSuperBinding) {
            // 13.3-6-a
            closure = FunctionCreate('Method', code.params, code, scope, strict, undefined, object, propName);
        }
        // 13.3-7
        else {
            // 13.3-7-a
            closure = FunctionCreate('Method', code.params, code, scope, strict);
        }
        // 13.3-8
        desc = {
            Value: closure,
            Writable: false,
            Enumerable: false,
            Configurable: true
        };
        // 13.3-9
        status = object.DefineOwnProperty(propName, desc, false);
        // 13.3-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }
        // 13.3-11
        return closure;
    });

    // 13.3
    var DefineGetter = AbstractOperation(function (object, propName, code) {
        var strict, scope, formalParameterList, needsSuperBinding, closure, desc, status;
        // 13.3-2
        strict = code.Strict;
        // 13.3-3
        scope = realm.executionContext.LexicalEnvironment;
        // 13.3-4
        // FIXME spec bug
        // why formalParameterList variable is used?
        formalParameterList = code.params;
        // 13.3-5
        needsSuperBinding = code.NeedsSuperBinding;
        // 13.3-6
        if (needsSuperBinding) {
            // 13.3-6-a
            // FIXME spec bug
            // homeObject is inserted by myself
            closure = FunctionCreate('Method', formalParameterList, code, scope, strict, undefined, object, propName);
        }
        // 13.3-7
        else {
            // 13.3-7-a
            closure = FunctionCreate('Method', formalParameterList, code, scope, strict);
        }
        // 13.3-8
        MakeConstructor(closure);
        // 13.3-9
        desc = {
            Get: closure,
            Enumerable: true,
            Configurable: true
        };
        // 13.3-10
        status = object.DefineOwnProperty(propName, desc, false);
        // 13.3-11
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }
        // 13.3-12
        return closure;
    });

    // 13.3
    var DefineSetter = AbstractOperation(function (object, propName, code) {
        var strict, scope, formalParameterList, needsSuperBinding, closure, desc, status;
        // 13.3-2
        strict = code.Strict;
        // 13.3-3
        scope = realm.executionContext.LexicalEnvironment;
        // 13.3-5
        needsSuperBinding = code.NeedsSuperBinding;
        // 13.3-6
        if (needsSuperBinding) {
            // 13.3-6-a
            closure = FunctionCreate('Method', code.params, code, scope, strict, undefined, object, propName);
        }
        // 13.3-7
        else {
            // 13.3-7-a
            closure = FunctionCreate('Method', code.params, code, scope, strict);
        }
        // 13.3-8
        MakeConstructor(closure);
        // 13.3-9
        desc = {
            Set: closure,
            Enumerable: true,
            Configurable: true
        };
        // 13.3-9
        status = object.DefineOwnProperty(propName, desc, false);
        // 13.3-10
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(status)) { return status; } else if (status instanceof Completion) { status = status.value; }
        // 13.3-11
        return closure;
    });

    JSFunction.prototype = shibuya.common.inherit(JSFunction, JSObject);

    JSFunction.prototype.Call = AbstractOperation(function Call(thisArgument, argumentsList) {
        var callerContext, calleeContext, thisMode, localEnv, thisValue, status, result;
        callerContext = realm.executionContext;
        // suspend?
        calleeContext = new ExecutionContext();
        calleeContext.PreviousContext = callerContext;
        calleeContext.Realm = this.Realm;
        calleeContext.code = this.Code;
        thisMode = this.ThisMode;
        if (thisMode === 'lexical') {
            localEnv = NewDeclarativeEnvironment(this.Scope);
        } else {
            if (thisMode === 'strict') {
                thisValue = thisArgument;
            } else {
                if (thisArgument === null || thisArgument === undefined) {
                    thisValue = realm.this;
                } else if (Type(thisArgument) !== 'Object') {
                    // FIXME fix this typo, thisArg
                    thisValue = ToObject(thisArgument);
                    // expanded ReturnIfAbrupt by preprocess.js
                    if (isAbruptCompletion(thisValue)) { return thisValue; } else if (thisValue instanceof Completion) { thisValue = thisValue.value; }
                } else {
                    thisValue = thisArgument;
                }
            }
            localEnv = NewMethodEnvironment(this, thisValue);
        }
        calleeContext.LexicalEnvironment = localEnv;
        calleeContext.VariableEnvironment = localEnv;

        this.Realm.executionContext = calleeContext;

        // FIXME argumentsList is missing!!!
        status = FunctionDeclarationInstantiation(this, argumentsList, localEnv);
        if (isAbruptCompletion(status)) {
            callerContext.restore();
            return status;
        }
        result = calleeContext.run(this.Code);
        callerContext.restore();
        if (result.type === Completion.Type.return) {
            return NormalCompletion(result.Value);
        }
        return result;
    });

    var FunctionConstruct = AbstractOperation(function FunctionConstruct(argumentsList) {
        var proto, obj, result;
        proto = this.Get('prototype');
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(proto)) { return proto; } else if (proto instanceof Completion) { proto = proto.value; }
        if (Type(proto) === 'Object') {
            obj = ObjectCreate(proto);
        }
        // FIXME spec, why this is else?
        if (Type(proto) !== 'Object') {
            obj = ObjectCreate();
        }
        result = this.Call(obj, argumentsList);
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(result)) { return result; } else if (result instanceof Completion) { result = result.value; }
        if (Type(result) === 'Object') {
            return result;
        }
        return NormalCompletion(obj);
    });

    // 15.3.5.3
    var FunctionHasInstance = AbstractOperation(function FunctionHasInstance(V) {
        var O;

        // 15.3.5.3-1
        if (Type(V) !== 'Object') {
            return false;
        }

        // 15.3.5.3-2
        O = F.Get('prototype');

        // 15.3.5.3-3
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(O)) { return O; } else if (O instanceof Completion) { O = O.value; }

        // 15.3.5.3-4
        if (Type(O) !== 'Object') {
            throw new TypeError('15.3.5.3-4');
        }

        // 15.3.5.3-5
        while (true) {
            // 15.3.5.3-5-a
            V = V.Prototype;

            // 15.3.5.3-5-b
            if (V === null) {
                return false;
            }

            // 15.3.5.3-5-c
            if (O === V) {
                return true;
            }
        }
    });

    // 15.3.5.4
    JSFunction.prototype.Get = AbstractOperation(function FunctionGet(P) {
        var v;
        // 15.3.5.4-3
        v = JSObject.prototype.Get.call(this, P);

        // FIXME spec bug. inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(v)) { return v; } else if (v instanceof Completion) { v = v.value; }

        // 15.3.5.4-2
        if (P === 'caller' && IsCallable(v) && v.Strict) {
            throw new TypeError('15.3.5.4-2');
        }

        // 15.3.5.4-3
        return v;
    });

    function JSArray() {
        JSObject.call(this);
    }

    function ArrayCreate(length) {
        var A = new JSArray();
        A.Prototype = realm.ArrayPrototype;
        A.NativeBrand = NativeBrand.NativeArray;
        A.Extensible = true;
        // FIXME later see it, this maybe spec bug => ACCEPTED
        // We should use default DefineOwnProperty.
        // Reported at
        //   https://mail.mozilla.org/pipermail/es-discuss/2012-June/023694.html
        JSObject.prototype.DefineOwnProperty.call(A, 'length', {
            Value: length,
            Writable: true,
            Enumerable: false,
            Configurable: false
        }, false);
        return A;
    }

    JSArray.prototype = shibuya.common.inherit(JSArray, JSObject);

    // 15.4.5.1
    JSArray.prototype.DefineOwnProperty = AbstractOperation(function DefineOwnProperty(P, Desc, Throw) {
        var oldLenDesc, oldLen, newLenDesc, newLen, val, newWritable, succeeded, deleteSucceeded, index;
        function Reject(str) {
            if (Throw) {
                throw new TypeError(str);
            }
            return false;
        }

        // 15.4.5.1-1
        oldLenDesc = this.GetOwnProperty('length');
        shibuya.common.assert(oldLenDesc !== undefined);

        // 15.4.5.1-2
        oldLen = oldLenDesc.Value;

        // 15.4.5.1-3
        if (P === 'length') {
            // 15.4.5.1-3-a
            if (!Desc.hasOwnProperty('Value')) {
                return JSObject.prototype.DefineOwnProperty.call(this, 'length', Desc, Throw);
            }

            // 15.4.5.1-3-b
            newLenDesc = copy(Desc);

            // 15.4.5.1-3-c
            newLen = ToUint32(Desc.Value);

            // 15.4.5.1-3-d
            // FIXME(Constellation) inserted
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(newLen)) { return newLen; } else if (newLen instanceof Completion) { newLen = newLen.value; }
            val = ToNumber(Desc.Value);
            // FIXME(Constellation) inserted
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(val)) { return val; } else if (val instanceof Completion) { val = val.value; }
            if (newLen !== val) {
                throw RangeError('15.4.5.1-3-d');
            }

            // 15.4.5.1-3-e
            newLen = newLenDesc.Value;

            // 15.4.5.1-3-f
            if (newLen >= oldLen) {
                // 15.4.5.1-3-f-i
                return JSObject.prototype.DefineOwnProperty.call(this, 'length', newLenDesc, Throw);
            }

            // 15.4.5.1-3-g
            if (oldLenDesc.Writable === false) {
                Reject('15.4.5.1-3-g');
            }

            // 15.4.5.1-3-h
            if (!newLenDesc.hasOwnProperty('Writable') || newLenDesc.Writable) {
                newWritable = true;
            }

            // 15.4.5.1-3-i
            else {
                // 15.4.5.1-3-i-i
                // need to defer setting the [[Writable]] attribute to false in
                // case any elements cannot be deleted.

                // 15.4.5.1-3-i-ii
                newWritable = false;

                // 15.4.5.1-3-i-iii
                newLenDesc.Writable = true;
            }

            // 15.4.5.1-3-j
            succeeded = JSObject.prototype.DefineOwnProperty.call(this, 'length', newLenDesc, Throw);
            // FIXME(Constellation) inserted
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(succeeded)) { return succeeded; } else if (succeeded instanceof Completion) { succeeded = succeeded.value; }

            // 15.4.5.1-3-k
            if (succeeded === false) {
                return false;
            }

            // 15.4.5.1-3-l
            while (newLen < oldLen) {
                // 15.4.5.1-3-l-i
                oldLen = oldLen - 1;

                // 15.4.5.1-3-l-ii
                deleteSucceeded = this.Delete(String(oldLen), false);
                // expanded ReturnIfAbrupt by preprocess.js
                if (isAbruptCompletion(deleteSucceeded)) { return deleteSucceeded; } else if (deleteSucceeded instanceof Completion) { deleteSucceeded = deleteSucceeded.value; }

                // 15.4.5.1-3-l-iii
                if (!deleteSucceeded) {
                    // 15.4.5.1-3-l-iii-1
                    newLenDesc.Value = oldLen + 1;

                    // 15.4.5.1-3-l-iii-2
                    if (!newWritable) {
                        newLenDesc.Writable = false;
                    }

                    // 15.4.5.1-3-l-iii-3
                    JSObject.prototype.DefineOwnProperty.call(this, 'length', newLenDesc, false);

                    // 15.4.5.1-3-l-iii-4
                    Reject('15.4.5.1-3-l-iii-4');
                }
            }

            // 15.4.5.1-3-m
            if (!newWritable) {
                // 15.4.5.1-3-m-i
                JSObject.prototype.DefineOwnProperty.call(this, 'length', {
                    Writable: false
                }, false);
            }

            // 15.4.5.1-3-n
            return true;
        }
        // 15.4.5.1-4
        else if (isArrayIndex(P)) {
            // 15.4.5.1-4-a
            index = ToUint32(P);

            // 15.4.5.1-4-b
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(index)) { return index; } else if (index instanceof Completion) { index = index.value; }

            // 15.4.5.1-4-c
            if (index >= oldLen && oldLenDesc.Writable === false) {
                Reject('15.4.5.1-4-c');
            }

            // 15.4.5.1-4-d
            succeeded = JSObject.prototype.DefineOwnProperty.call(this, P, Desc, false);
            // FIXME(Constellation) inserted
            // expanded ReturnIfAbrupt by preprocess.js
            if (isAbruptCompletion(succeeded)) { return succeeded; } else if (succeeded instanceof Completion) { succeeded = succeeded.value; }

            // 15.4.5.1-4-e
            if (succeeded === false) {
                Reject('15.4.5.1-4-e');
            }

            // 15.4.5.1-4-f
            if (index >= oldLen) {
                // 15.4.5.1-4-f-i
                oldLenDesc.Value = index + 1;

                // 15.4.5.1-4-f-ii
                JSObject.prototype.DefineOwnProperty.call(this, 'length', oldLenDesc, false);
            }
            // 15.4.5.1-4-g
            return true;
        }

        // 15.4.5.1-5
        return JSObject.prototype.DefineOwnProperty.call(this, P, Desc, P);
    });

    function JSString() {
        JSObject.call(this);
    }

    function StringCreate(str) {
        var S = new JSString();
        S.Prototype = realm.StringPrototype;
        S.NativeBrand = NativeBrand.StringWrapper;
        S.Extensible = true;
        S.DefineOwnProperty('length', {
            Value: str.length,
            Writable: false,
            Enumerable: false,
            Configurable: false
        }, false);
        S.PrimitiveValue = str;
        return S;
    }

    JSString.prototype = shibuya.common.inherit(JSString, JSObject);

    // 15.5.5.2
    JSString.prototype.GetOwnProperty = function GetOwnProperty(P) {
        var desc, val, str, index, len, resultStr;
        desc = JSObject.prototype.GetOwnProperty.call(this, P);
        if (desc !== undefined) {
            return desc;
        }
        val = ToInteger(P);
        // FIXME inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(val)) { return val; } else if (val instanceof Completion) { val = val.value; }
        val = Math.abs(val);
        val = ToString(val);
        // FIXME inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(val)) { return val; } else if (val instanceof Completion) { val = val.value; }
        if (val !== P) {
            return undefined;
        }
        str = this.PrimitiveValue;
        index = ToInteger(P);
        // FIXME inserted
        // expanded ReturnIfAbrupt by preprocess.js
        if (isAbruptCompletion(index)) { return index; } else if (index instanceof Completion) { index = index.value; }
        len = str.length;
        if (len <= index) {
            return undefined;
        }
        resultStr = str[index];
        return {
            Value: resultStr,
            Enumerable: true,
            Writable: false,
            Configurable: false
        };
    };

    function JSBoolean() {
        JSObject.call(this);
    }

    function BooleanCreate(bool) {
        var B = new JSBoolean();
        B.Prototype = realm.BooleanPrototype;
        B.NativeBrand = NativeBrand.BooleanWrapper;
        B.Extensible = true;
        B.PrimitiveValue = bool;
        return B;
    }

    JSBoolean.prototype = shibuya.common.inherit(JSBoolean, JSObject);

    function JSNumber() {
        JSObject.call(this);
    }

    function NumberCreate(num) {
        var N = new JSNumber();
        N.Prototype = realm.NumberPrototype;
        N.NativeBrand = NativeBrand.NumberWrapper;
        N.Extensible = true;
        N.PrimitiveValue = num;
        return N;
    }

    JSNumber.prototype = shibuya.common.inherit(JSNumber, JSObject);

    function JSRegExp() {
        JSObject.call(this);
    }

    function RegExpCreate(regexp) {
        var R = new JSRegExp();
        R.Prototype = realm.RegExpPrototype;
        R.NativeBrand = NativeBrand.NativeRegExp;
        R.Extensible = true;
        // 15.10.7
        R.Match = regexp;
        // 15.10.7.1
        R.DefineOwnProperty('source', {
            Value: regexp.source,
            Writable: false,
            Enumerable: false,
            Configurable: false
        }, false);
        // 15.10.7.2
        R.DefineOwnProperty('global', {
            Value: regexp.global,
            Writable: false,
            Enumerable: false,
            Configurable: false
        }, false);
        // 15.10.7.3
        R.DefineOwnProperty('ignoreCase', {
            Value: regexp.ignoreCase,
            Writable: false,
            Enumerable: false,
            Configurable: false
        }, false);
        // 15.10.7.4
        R.DefineOwnProperty('multiline', {
            Value: regexp.multiline,
            Writable: false,
            Enumerable: false,
            Configurable: false
        }, false);
        // 15.10.7.5
        R.DefineOwnProperty('lastIndex', {
            Value: 0,
            Writable: true,
            Enumerable: false,
            Configurable: false
        }, false);
        return R;
    }

    JSRegExp.prototype = shibuya.common.inherit(JSRegExp, JSObject);


    // Native Function

    function JSNativeFunction() {
        JSFunction.call(this);
    }

    JSNativeFunction.prototype = shibuya.common.inherit(JSNativeFunction, JSFunction);

    JSNativeFunction.prototype.Call = AbstractOperation(function Call(thisArgument, argumentsList) {
        return this.Code.call(thisArgument, argumentsList);
    });

    function NativeFunctionCreate(name, len, func) {
        var F;
        F = new JSNativeFunction();
        F.NativeBrand = NativeBrand.NativeFunction;
        F.Prototype = realm.FunctionPrototype;
        F.Code = func;
        F.Extensible = true;
        F.Realm = realm;
        F.DefineOwnProperty('length', {
            Value: len,
            Writable: false,
            Enumerable: false,
            Configurable: false
        }, false);
        return F;
    }

    // Freezing prototypes
    Object.freeze(JSObject.prototype);
    Object.freeze(JSFunction.prototype);
    Object.freeze(JSArray.prototype);
    Object.freeze(JSString.prototype);
    Object.freeze(JSBoolean.prototype);
    Object.freeze(JSNumber.prototype);
    Object.freeze(Realm.prototype);

    // export core objects
    exports.Object = JSObject,
    exports.Function = JSFunction,
    exports.Array = JSArray,
    exports.String = JSString,
    exports.Boolean = JSBoolean,
    exports.Number = JSNumber

    // export factories
    exports.ObjectCreate = ObjectCreate;
    exports.FunctionCreate = FunctionCreate;
    exports.ArrayCreate = ArrayCreate;
    exports.StringCreate = StringCreate;
    exports.BooleanCreate = BooleanCreate;
    exports.NumberCreate = NumberCreate;
    exports.NativeFunctionCreate = NativeFunctionCreate;

    // export core modules
    exports.Realm = Realm;
    exports.isAbruptCompletion = isAbruptCompletion;
}(typeof exports === 'undefined' ? (typeof shibuya.runtime === 'undefined' ? shibuya.runtime = {} : shibuya.runtime) : exports));
/* vim: set sw=4 ts=4 et tw=80 : */
