export interface Ctx {
    path: string
    key: string | number | null
    parent: any
    root: any
    __abortPipe?: boolean
    [key: string]: any
}

export type Validator<Input = any, Output = Input> = (value: Input, ctx: Ctx) => Output

export interface ValidationError extends Error {
    expected?: string
    actual?: any
    path?: string
    key?: string | number | null
    parent?: any
    root?: any
}

export type ValidatorFactory<Input = any, Output = Input, Args extends any[] = any[]> = (
    ...args: Args
) => Validator<Input, Output>

export function makeCtx(parentCtx: Ctx | null, key: string | number | null, value: any, root?: any): Ctx {
    let path: string
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

export function formatValue(value: any): string {
    if (value === null || value === undefined) return String(value)

    const type = typeof value

    if (type === 'string') return value as string
    if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value)
    if (type === 'symbol') return (value as symbol).toString()
    if (type === 'function') {
        const name = (value as Function).name ? `: ${(value as Function).name}` : ''
        return `[Function${name}]`
    }
    if (value instanceof RegExp) return value.toString()
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value) || (value && Object.getPrototypeOf(value) === Object.prototype)) {
        return JSON.stringify(value)
    }

    return Object.prototype.toString.call(value)
}

export function createValidator<I = unknown, O = I, Args extends any[] = any[]>(
    name: string,
    handler: (value: I, ctx: Ctx, args: Args) => O
) {
    return function validatorFactory(...args: Args): Validator<I, O> {
        return function validatorFn(value, ctx) {
            try {
                return handler(value, ctx, args)
            } catch (err) {
                const error: ValidationError =
                    err instanceof Error ? (err as ValidationError) : (new Error(String(err)) as ValidationError)

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
interface ControlValidator {
    __control?: true
}
type IsControl<V> = V extends ControlValidator ? true : false
type InputOf<V> =
    V extends (value: infer I, ctx: Ctx) => any ? I : never

type OutputOf<V> =
    V extends (value: any, ctx: Ctx) => infer O ? O : never

type Simplify<T> = { [K in keyof T]: T[K] } & {}

type DeepSimplify<T> =
    T extends string | number | boolean | bigint | symbol | null | undefined ? T
    : T extends Function ? T
    : T extends (infer U)[] ? Array<DeepSimplify<U>>
    : T extends object ? Simplify<{ [K in keyof T]: DeepSimplify<T[K]> }>
    : T

export type InferOutput<V> =
    V extends (value: any, ctx: Ctx) => infer O ? DeepSimplify<O> : never

type Last<T extends unknown[]> =
    T extends [...any[], infer L] ? L : never

type ValidateChain<Vs extends unknown[]> =
    Vs extends [
        infer V1,
        infer V2,
        ...infer Rest
    ]
    ? IsControl<V1> extends true
    ? [
        V1,
        ...ValidateChain<[V2, ...Rest]>
    ]
    : OutputOf<V1> extends InputOf<V2>
    ? [
        V1,
        ...ValidateChain<[V2, ...Rest]>
    ]
    : never
    : Vs
export function pipe<
    Vs extends [
        Validator<any, any>,
        ...(Validator<any, any>)[]
    ]
>(
    ...validators: ValidateChain<Vs>
): Validator<
    InputOf<Vs[0]>,
    OutputOf<Last<Vs>>
> {
    return createValidator('pipe', (value, ctx) => {
        for (const validator of validators) {
            if (ctx.__abortPipe) break
            value = validator(value, ctx)
        }
        delete ctx.__abortPipe
        return value
    })() as any
}

export function transform<I = any, O = any>(fn: (value: I, ctx: Ctx) => O) {
    return createValidator<I, O>('transform', (value, ctx) => fn(value, ctx))()
}

export function check<I = any>(fn: (value: I, ctx: Ctx) => boolean, msg?: string) {
    const expected = fn.name || 'check'
    return createValidator<I, I>(expected, (value, ctx) => {
        const result = fn(value, ctx)
        if (result === true) return value
        throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ ${expected}`)
    })()
}

export type ValidateResult<O> =
    | { valid: true; result: O; error?: undefined }
    | { valid: false; error: ValidationError; result: any }

export function validate<I, O>(schema: Validator<I, O>, value: I, rootPath = '$'): ValidateResult<O> {
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
    } catch (error: any) {
        return {
            valid: false,
            error,
            result: value
        }
    }
}

export const required = createValidator<any, any, [string?]>('required', (value, ctx, args) => {
    const [msg] = args

    if (value == null) {
        throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ required`)
    }

    return value
})

export const optional = createValidator<unknown, unknown>('optional', (value, ctx) => {
    if (value == null) {
        ctx.__abortPipe = true
        return value
    }

    return value
}) as () => (Validator<any, any> & ControlValidator)

export const string = createValidator<string, string, [string?]>('string', (value, ctx, args) => {
    const [msg] = args
    if (typeof value !== 'string') {
        throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ string`)
    }

    return value
})

export const number = createValidator<number, number, [string?]>('number', (value, ctx, args) => {
    const [msg] = args

    if (typeof value !== 'number') {
        throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ number`)
    }

    return value
})

export const bigint = createValidator<bigint, bigint, [string?]>('bigint', (value, ctx, args) => {
    const [msg] = args

    if (typeof value !== 'bigint') {
        throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ bigint`)
    }

    return value
})

export const boolean = createValidator<boolean, boolean, [string?]>('boolean', (value, ctx, args) => {
    const [msg] = args

    if (typeof value !== 'boolean') {
        throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ boolean`)
    }

    return value
})

export const symbol = createValidator<symbol, symbol, [string?]>('symbol', (value, ctx, args) => {
    const [msg] = args

    if (typeof value !== 'symbol') {
        throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ symbol`)
    }

    return value
})

export type InferShape<S> = { [K in keyof S]: S[K] extends Validator<any, infer O> ? O : never }

export function object<S extends Record<string, Validator<any, any>>>(shape: S, msg?: string) {
    return createValidator<unknown, InferShape<S>>('object', (value, ctx) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ object`)
        }

        const result: any = {}
        for (const key in shape) {
            const childCtx = makeCtx(ctx, key, (value as any)[key])
            result[key] = shape[key]((value as any)[key], childCtx)
        }
        return result
    })()
}

export function array<T>(validator: Validator<any, T>, msg?: string) {
    return createValidator<T[], T[]>('array', (value, ctx) => {
        if (!Array.isArray(value)) {
            throw new Error(msg || `(${ctx.path}: ${formatValue(value)}) ✖ array`)
        }

        return value.map((item, i) => {
            const childCtx = makeCtx(ctx, i, item)
            return validator(item, childCtx)
        })
    })()
}
