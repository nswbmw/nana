<div align="center">
  <img src="https://raw.githubusercontent.com/nswbmw/nana/master/nana.png" width="100%" alt="Nana"/>
</div>

## Nana

A minimal validator for any JavaScript environment.

- ~200 lines of code, 0 dependencies
- Only 3 concepts: `pipe`, `transform`, `check`
- Rich error context: `expected/actual/path/key/parent/root`

## Install

```sh
$ npm install nana
```

## Basic usage

```js
import { string, object, pipe, check, validate } from 'nana'

const userSchema = object({
  name: string('Name must be a string'),
  job: object({
    title: pipe(
      string('Job title must be a string'),
      check(v => v !== 'God', 'You cannot be God')
    )
  })
})

console.log(
  validate(userSchema, {
    name: 'nana',
    job: {
      title: 'God'
    }
  })
)
/*
{
  valid: false,
  error: Error: You cannot be God
      at ...
    expected: 'check',
    actual: 'God',
    path: '$.job.title',
    key: 'title',
    parent: { title: 'God' },
    root: { name: 'nana', job: [Object] }
  },
  result: { name: 'nana', job: { title: 'God' } }
}
*/
```

### Core concepts

- **`pipe(...validators)`**
  Compose multiple validators/transformers in order. The output of the previous step becomes the input of the next.

- **`transform(fn)`**
  Only transforms the value, without validating. For example, convert a `number` to `string`, or change letter case.

- **`check(fn, msg?)`**
  Custom validation logic: `fn(value, ctx)` **must return `true` to pass**. Any other result throws an error.

For example:

```js
// Combine multiple validations and transformations
pipe(
  string('Name must be a string'),
  transform(v => v.trim()),
  transform(v => v.toUpperCase()),
  check(v => v.length >= 3, 'Name length must be >= 3')
)
```

## transform

```js
import { string, number, object, pipe, transform, validate } from 'nana'

const userSchema = object({
  name: pipe(
    string('Name must be a string'),
    transform(v => v.toUpperCase())
  ),
  age: pipe(
    number('Age must be a number'),
    transform(v => v + 1)
  )
})

console.log(
  validate(userSchema, {
    name: 'nana',
    age: 18
  })
)
/*
{
  valid: true,
  result: {
    name: 'NANA',
    age: 19
  }
}
*/
```

## Create custom validator with `createValidator`

```js
import { string, number, object, pipe, transform, check, validate, createValidator, formatValue } from 'nana'

const minLength = createValidator('minLength', (value, ctx, args) => {
  const [expected, msg] = args

  if (value.length < expected) {
    throw new Error(
      msg || `(${ctx.path}: ${formatValue(value)}) ✖ (minLength: ${formatValue(expected)})`
    )
  }

  return value
})

const userSchema = object({
  profile: object({
    name: pipe(
      string('Name must be a string'),
      // check(v => v.length >= 6, 'Name too short')
      minLength(6)
    ),
    age: pipe(
      number('Age must be a number'),
      check(v => v >= 18, 'Age must be >= 18')
    ),
    gender: pipe(
      string('Gender must be a string'),
      check(v => ['male', 'female'].includes(v), 'Gender must be male or female')
    )
  })
})

console.log(
  validate(userSchema, {
    profile: {
      name: 'nana',
      age: 16,
      gender: 'lalala',
    }
  })
)
/*
{
  valid: false,
  error: Error: ($.profile.name: nana) ✖ (minLength: 6)
      at ...
    expected: 'minLength',
    actual: 'nana',
    path: '$.profile.name',
    key: 'name',
    parent: { name: 'nana', age: 16, gender: 'lalala' },
    root: { profile: [Object] }
  },
  result: { profile: { name: 'nana', age: 16, gender: 'lalala' } }
}
*/
```

## With third party validator

```js
import { string, object, pipe, check, validate } from 'nana'
import isEmail from 'validator/lib/isEmail.js'

const userSchema = object({
  name: string('Name must be a string'),
  emails: array(pipe(string(), check(isEmail)))
})

console.log(
  validate(userSchema, {
    name: 'nana',
    emails: ['nana@example.com', 'email']
  })
)
/*
{
  valid: false,
  error: Error: ($.emails[1]: email) ✖ isEmail
      at ...
    expected: 'isEmail',
    actual: 'email',
    path: '$.emails[1]',
    key: 1,
    parent: [ 'nana@example.com', 'email' ],
    root: { name: 'nana', emails: [Array] }
  },
  result: { name: 'nana', emails: [ 'nana@example.com', 'email' ] }
}
*/
```

## Built-in validators

- `required(msg?)`
- `optional()`
- `string(msg?)`
- `number(msg?)`
- `bigint(msg?)`
- `boolean(msg?)`
- `symbol(msg?)`
- `object(obj, msg?)`
- `array(validator, msg?)`

## Test (100% coverage)

```sh
$ npm test
```

## License

MIT
