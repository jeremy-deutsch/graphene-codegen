# graphene-codegen

### For when you have a schema but want to use Python.

Note: only generates object and scalar types at the moment, and doesn't output classes in the right order.
Also doesn't support default arguments yet.

### Usage

```sh
$ npm i -g graphene-codegen
$ graphene-codegen --schema="./schema.graphql" --out="gen.py"
```
