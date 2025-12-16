import { describe, test, expect } from '@jest/globals'
import {
  makeCtx,
  formatValue,
  createValidator,
  pipe,
  transform,
  check,
  validate,
  required,
  optional,
  string,
  number,
  bigint,
  boolean,
  symbol,
  object,
  array,
  ValidationError,
  InferOutput
} from '../index.ts'

describe('formatValue', () => {
  test('null and undefined', () => {
    expect(formatValue(null)).toBe('null')
    expect(formatValue(undefined)).toBe('undefined')
  })

  test('primitive types', () => {
    expect(formatValue('foo')).toBe('foo')
    expect(formatValue(123)).toBe('123')
    expect(formatValue(true)).toBe('true')
    expect(formatValue(10n)).toBe('10')
  })

  test('symbol and function', () => {
    const s = Symbol('x')
    expect(formatValue(s)).toBe(s.toString())

    function foo () {}
    expect(formatValue(foo)).toBe('[Function: foo]')

    const bar = function () {}
    expect(formatValue(bar)).toBe('[Function: bar]')

    expect(formatValue(() => {})).toBe('[Function]')
  })

  test('RegExp and Date', () => {
    const re = /abc/i
    expect(formatValue(re)).toBe(re.toString())

    const d = new Date('2020-01-01T00:00:00.000Z')
    expect(formatValue(d)).toBe(d.toISOString())
  })

  test('plain object and array', () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}')
    expect(formatValue([1, 2])).toBe('[1,2]')
  })

  test('other objects fallback to Object.prototype.toString', () => {
    class MyClass {}
    const v = new MyClass()
    expect(formatValue(v)).toBe(Object.prototype.toString.call(v))
  })
})

describe('makeCtx', () => {
  test('root ctx', () => {
    const ctx = makeCtx(null, null, 123)
    expect(ctx).toEqual({
      path: '$',
      key: null,
      parent: null,
      root: 123,
      value: 123
    })
  })

  test('object key path', () => {
    const parent = makeCtx(null, null, { user: {} })
    const child = makeCtx(parent, 'user', {})
    expect(child.path).toBe('$.user')
  })

  test('array index path', () => {
    const parent = makeCtx(null, null, { list: [] })
    const listCtx = makeCtx(parent, 'list', [])
    const itemCtx = makeCtx(listCtx, 0, 'foo')
    expect(itemCtx.path).toBe('$.list[0]')
  })
})

describe('createValidator', () => {
  test('success passes through value', () => {
    const v = createValidator<number>('double', (value) => value * 2)()
    expect(v(2, makeCtx(null, null, 2))).toBe(4)
  })

  test('wraps non-Error throws and enriches error', () => {
    const v = createValidator('testValidator', () => {
      throw 'boom' // eslint-disable-line
    })()

    const ctx = makeCtx(null, 'x', 42)
    try {
      v(42, ctx)
      throw new Error('should not reach here')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err.expected).toBe('testValidator')
      expect(err.actual).toBe(42)
      expect(err.path).toBe('$')
      expect(err.key).toBe('x')
      expect(err.parent).toBe(null)
      expect(err.root).toBe(42)
    }
  })

  test('does not override expected if already set', () => {
    const v = createValidator('outer', () => {
      const e = new Error('inner') as ValidationError
      e.expected = 'inner'
      throw e
    })()

    const ctx = makeCtx(null, null, 'x')
    try {
      v('x', ctx)
      throw new Error('should not reach here')
    } catch (err) {
      expect(err.expected).toBe('inner')
    }
  })
})

describe('pipe', () => {
  test('runs validators in sequence', () => {
    const add1 = createValidator<number>('add1', v => v + 1)()
    const mul2 = createValidator<number>('mul2', v => v * 2)()

    const schema = pipe(add1, mul2)
    const ctx = makeCtx(null, null, 1)
    expect(schema(1, ctx)).toBe((1 + 1) * 2)
  })

  test('propagates error from inner validator', () => {
    const fail = createValidator<any>('fail', (v) => {
      throw new Error('fail')
    })()
    const schema = pipe(fail)

    expect(() => schema(1, makeCtx(null, null, 1))).toThrow('fail')
  })
})

describe('transform', () => {
  test('applies transformation only', () => {
    const t = transform(v => String(v) + '!')
    const ctx = makeCtx(null, null, 1)
    expect(t(1, ctx)).toBe('1!')
  })
})

describe('check', () => {
  test('passes when fn returns true', () => {
    const schema = pipe(
      number(),
      check<number>(v => v > 0)
    )
    const res = validate(schema, 1)
    expect(res.valid).toBe(true)
    expect(res.result).toBe(1)
  })

  test('fails when fn returns false with custom message', () => {
    const schema = pipe(
      number(),
      check<number>(v => v > 0, 'must be > 0')
    )
    const res = validate(schema, 0)
    expect(res.valid).toBe(false)
    expect((res.error as ValidationError)).toBeInstanceOf(Error)
    expect((res.error as ValidationError).message).toBe('must be > 0')
  })

  test('fails with default message when fn returns false and no msg', () => {
    const namedFn = function isPositive (v) { return v > 0 }
    const schema = pipe(
      number(),
      check(namedFn)
    )
    const res = validate(schema, 0)
    expect(res.valid).toBe(false)
    expect((res.error as ValidationError).message).toContain('isPositive')
    expect((res.error as ValidationError).message).toContain('$')
  })

  test('uses default name when fn is anonymous', () => {
    const schema = pipe(
      number(),
      check<number>(v => v > 0)
    )
    const res = validate(schema, 0)
    expect(res.valid).toBe(false)
    expect((res.error as ValidationError).message).toContain('check')
  })

  test('if fn throws, error is wrapped by createValidator', () => {
    const schema = pipe(
      number(),
      check(() => {
        throw new Error('boom')
      })
    )
    const res = validate(schema, 1)
    expect(res.valid).toBe(false)
    expect((res.error as ValidationError).message).toBe('boom')
    expect((res.error as ValidationError).expected).toBe('check')
  })
})

describe('validate', () => {
  test('returns valid true on success', () => {
    const schema = number()
    const res = validate(schema, 123)
    expect(res.valid).toBe(true)
    expect(res.result).toBe(123)
  })

  test('returns valid false and keeps original value', () => {
    const schema = number()
    const res = validate(schema, 'not number' as any)
    expect(res.valid).toBe(false)
    expect(res.result).toBe('not number')
    expect((res.error as ValidationError)).toBeInstanceOf(Error)
  })
})

describe('primitive validators', () => {
  test('string success and failure', () => {
    const ctx = makeCtx(null, null, 'x')
    expect(string()('x', ctx)).toBe('x')
    expect(() => string()(
      1 as any,
      makeCtx(null, 's', 1)
    )).toThrow('string')
  })

  test('number success and failure', () => {
    expect(number()(1, makeCtx(null, null, 1))).toBe(1)
    expect(() => number()('1' as any, makeCtx(null, null, '1'))).toThrow('number')
  })

  test('bigint success and failure', () => {
    expect(bigint()(10n, makeCtx(null, null, 10n))).toBe(10n)
    expect(() => bigint()(1 as any, makeCtx(null, null, 1))).toThrow('bigint')
  })

  test('boolean success and failure', () => {
    expect(boolean()(true, makeCtx(null, null, true))).toBe(true)
    expect(() => boolean()('true' as any, makeCtx(null, null, 'true'))).toThrow('boolean')
  })

  test('symbol success and failure', () => {
    const s = Symbol('x')
    expect(symbol()(s, makeCtx(null, null, s))).toBe(s)
    expect(() => symbol()('sym' as any, makeCtx(null, null, 'sym'))).toThrow('symbol')
  })
})

describe('required and optional', () => {
  test('required passes for non-null and fails for null with default message', () => {
    const ctxOk = makeCtx(null, null, 'x')
    expect(required()('x', ctxOk)).toBe('x')

    const ctxBad = makeCtx(null, 'r', null)
    expect(() => required()(null, ctxBad)).toThrow('required')
  })

  test('required uses custom message when provided', () => {
    const ctx = makeCtx(null, null, undefined)
    expect(() => required('must not be null or undefined')(undefined, ctx)).toThrow('must not be null or undefined')
  })

  test('optional skips following validators in pipe when value is null', () => {
    const schema = pipe(
      optional(),
      string()
    )

    const resNull = validate(schema, null)
    expect(resNull.valid).toBe(true)
    expect(resNull.result).toBeNull()

    const resValue = validate(schema, 'ok')
    expect(resValue.valid).toBe(true)
    expect(resValue.result).toBe('ok')
  })
})

describe('required and optional', () => {
  test('required passes for non-null and fails for null with default message', () => {
    const ctxOk = makeCtx(null, null, 'x')
    expect(required()('x', ctxOk)).toBe('x')

    const ctxBad = makeCtx(null, 'r', null)
    expect(() => required()(null, ctxBad)).toThrow('required')
  })

  test('required uses custom message when provided', () => {
    const ctx = makeCtx(null, null, undefined)
    expect(() => required('must not be null or undefined')(undefined, ctx)).toThrow('must not be null or undefined')
  })

  test('optional skips following validators in pipe when value is null', () => {
    const schema = pipe(
      optional(),
      string()
    )

    const resNull = validate(schema, null)
    expect(resNull.valid).toBe(true)
    expect(resNull.result).toBeNull()

    const resValue = validate(schema, 'ok')
    expect(resValue.valid).toBe(true)
    expect(resValue.result).toBe('ok')
  })
})

describe('object validator', () => {
  test('fails when not plain object', () => {
    expect(() => object({})(
      null,
      makeCtx(null, null, null)
    )).toThrow('object')
    expect(() => object({})(
      [],
      makeCtx(null, null, [])
    )).toThrow('object')
  })

  test('validates nested shape and builds child ctx correctly', () => {
    const schema = object({
      user: object({
        name: string(),
        age: number()
      })
    })

    const value = { user: { name: 'nana', age: 20 } }
    const res = validate(schema, value)
    expect(res.valid).toBe(true)
    expect(res.result).toEqual(value)
  })

  test('propagates child error with correct path', () => {
    const schema = object({
      user: object({
        name: string(),
        age: number()
      })
    })

    const value = { user: { name: 'nana', age: 'bad' } }
    const res = validate(schema, value)
    expect(res.valid).toBe(false)
    expect((res.error as ValidationError).path).toBe('$.user.age')
  })
})

describe('array validator', () => {
  test('fails when not array', () => {
    const schema = array(number())
    expect(() => schema('not array' as any, makeCtx(null, null, 'not array'))).toThrow('array')
  })

  test('validates each element with proper path', () => {
    const schema = array(number())
    type Schema = InferOutput<typeof schema>
    const res = validate(schema, [1, 2, 3] as Schema)
    expect(res.valid).toBe(true)
    expect(res.result).toEqual([1, 2, 3])

    const bad = validate(schema, [1, 'x', 3])
    expect(bad.valid).toBe(false)
    if (!bad.valid) {
      expect(bad.error.path).toBe('$[1]')
    }
  })
})

describe('complex scene', () => {
  test('nested object array', () => {
    const allActions = [
      'action_1',
      'action_2',
      'action_3',
      'action_4',
      'action_5',
    ] as const
    const onlineActions = [
      'action_1',
      'action_2'
    ] as const
    const platforms = ['platform_1', 'platform_2'] as const
    const serviceCheck = check<number>(function serviceCheck (value, ctx) {
      return value > 0
    })
    const childServiceSchema = object({
      platform: check<(typeof platforms)[number]>(function platformCheck (value, ctx) {
        return platforms.includes(value)
      }),
      service: pipe(number(), serviceCheck),
      weight: pipe(number(), check<number>(function weightCheck (value, ctx) {
        return value >= 0
      }))
    })
    const mainServiceSchema = object({
      action: check<(typeof allActions)[number]>(function mainActionCheck (value, ctx) {
        return allActions.includes(value)
      }),
      service: pipe(number(), serviceCheck),
      childServices: pipe(
        check(function childServicesLengthCheck (value, ctx) {
          return value.length > 0
        }, 'childServices must not be empty'),
        array(childServiceSchema)
      )
    })
    type MainServiceSchema = InferOutput<typeof mainServiceSchema>

    const schema = pipe(
      array(mainServiceSchema),
      check(function duplicateServiceCheck (value, ctx) {
        const services = value.map(ws => ws.service)
        const serviceSet = new Set(services)
        return services.length === serviceSet.size
      }),
      check(function includeAllOnlineActionCheck (value, ctx) {
        const mainActions = value.map(ws => ws.action)
        return onlineActions.every(a => mainActions.includes(a))
      }),
      check(function actionInAllActionCheck (value, ctx) {
        const mainActions = value.map(ws => ws.action)
        return mainActions.every(a => allActions.includes(a))
      })
    )
    try {
      const data = [
        {
          action: 'action_1',
          service: 1200,
          childServices: [
            {
              platform: 'platform_1',
              service: 7787,
              weight: 1
            },
            {
              platform: 'platform_1',
              service: 8219,
              weight: 0
            }
          ]
        },
        {
          action: 'action_10',
          service: 1200,
          childServices: [
            {
              platform: 'platform_2',
              service: 21417,
              weight: 1
            },
            {
              platform: 'platform_1',
              service: 8219,
              weight: 0
            }
          ]
        }
      ] as MainServiceSchema[]
      const bad = schema(data, makeCtx(null, null, data))
      console.log(bad)
    } catch (error) {
      console.log(error)
    }
  })
})
