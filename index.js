export function makeCtx (parentCtx, key, value) {
  let path
  if (!parentCtx) path = '$'
  else if (typeof key === 'number') path = `${parentCtx.path}[${key}]`
  else path = `${parentCtx.path}.${key}`

  return {
    path,
    key,
    parent: parentCtx ? parentCtx.value : null,
    root: parentCtx ? parentCtx.root : value,
    value
  }
}

export function formatValue (value) {
  if (value === null || value === undefined) return String(value)

  const type = typeof value

  if (type === 'string') return value
  if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value)
  if (type === 'symbol') return value.toString()
  if (type === 'function') {
    const name = value.name ? `: ${value.name}` : ''
    return `[Function${name}]`
  }
  if (value instanceof RegExp) return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value) || (value && Object.getPrototypeOf(value) === Object.prototype)) {
    return JSON.stringify(value)
  }

  return Object.prototype.toString.call(value)
}

export function createValidator (name, handler) {
  return function validatorFactory (...args) {
    return function validatorFn (value, ctx) {
      try {
        return handler(value, ctx, args)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))

        if (!error.expected) {
          error.expected = name
          error.actual = value

          error.path = ctx.path
          error.key = ctx.key
          error.parent = ctx.parent
          error.root = ctx.root
        }

        throw error
      }
    }
  }
}

export function pipe (...validators) {
  return createValidator('pipe', (value, ctx) =>
    validators.reduce((v, validator) => validator(v, ctx), value)
  )()
}

export function transform (fn) {
  return createValidator('transform', (value, ctx) => fn(value, ctx))()
}

export function check (fn, msg) {
  return createValidator('check', (value, ctx) => {
    const result = fn(value, ctx)

    if (result === true) return value

    const message = msg || `(${ctx.path}: ${formatValue(value)}) ✖ ${fn.name || 'check'}`
    throw new Error(message)
  })()
}

export function validate (schema, value, rootPath = '$') {
  const ctx = {
    path: rootPath,
    key: null,
    parent: null,
    root: value,
    value
  }

  try {
    const result = schema(value, ctx)
    return { valid: true, result }
  } catch (error) {
    return {
      valid: false,
      error,
      result: value
    }
  }
}

export const string = createValidator('string', (value, ctx, args) => {
  const [msg] = args

  if (typeof value !== 'string') {
    throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ string`)
  }

  return value
})

export const number = createValidator('number', (value, ctx, args) => {
  const [msg] = args

  if (typeof value !== 'number') {
    throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ number`)
  }

  return value
})

export const bigint = createValidator('bigint', (value, ctx, args) => {
  const [msg] = args

  if (typeof value !== 'bigint') {
    throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ bigint`)
  }

  return value
})

export const boolean = createValidator('boolean', (value, ctx, args) => {
  const [msg] = args

  if (typeof value !== 'boolean') {
    throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ boolean`)
  }

  return value
})

export const symbol = createValidator('symbol', (value, ctx, args) => {
  const [msg] = args

  if (typeof value !== 'symbol') {
    throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ symbol`)
  }

  return value
})

export const object = createValidator('object', (value, ctx, args) => {
  const [obj, msg] = args

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ object`)
  }

  const result = {}
  for (const key in obj) {
    const childCtx = makeCtx(ctx, key, value[key])
    result[key] = obj[key](value[key], childCtx)
  }
  return result
})

export const array = createValidator('array', (value, ctx, args) => {
  const [validator, msg] = args

  if (!Array.isArray(value)) {
    throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ array`)
  }

  return value.map((item, i) => {
    const childCtx = makeCtx(ctx, i, item)
    return validator(item, childCtx)
  })
})
