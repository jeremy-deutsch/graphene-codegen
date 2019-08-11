# graphene-codegen

### For when you have a schema but want to use Python.

Note: doesn't generate union or interface types yet, and doesn't output classes in the right order.
Also doesn't translate directives or default arguments yet.

### Usage

```sh
$ npm i -g graphene-codegen
$ graphene-codegen --schema="./schema.graphql" --out="gen.py"
```
