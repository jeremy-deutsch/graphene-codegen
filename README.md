# graphene-codegen

### For when you have a schema but want to use Python.

Note: doesn't output classes in the correct dependency order.
Also doesn't translate directives or default arguments yet.

### Usage

```sh
$ npm i -g graphene-codegen
$ graphene-codegen --schema="./schema.graphql" --out="gen.py"
```
