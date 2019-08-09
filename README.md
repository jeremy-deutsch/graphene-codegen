# graphene-codegen

### For when you have a schema but want to use Python.

Note: only supports object types at the moment, and doesn't convert camel case to snake case.

### Usage

```sh
$ npm i -g graphene-codegen
$ graphene-codegen --schema="./schema.graphql" --out="gen.py"
```