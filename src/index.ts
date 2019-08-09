#!/usr/bin/env node

import { parse, TypeNode, InputValueDefinitionNode } from "graphql/language"
import fs from "fs"
import program from "commander"

program
  .option("-s, --schema <path>", "the path to your schema file")
  .option("-o, --out <path>", "the path to generated python code [gen.py]")
  .parse(process.argv)

if (!program.schema) {
  throw new Error("No schema file specified.")
}

const builtInScalars = new Set(["String", "Float", "Int", "Boolean", "ID"])

const schemaDocument = fs.readFileSync(program.schema)
const schemaString = schemaDocument.toString()
const schemaASTRoot = parse(schemaString)

const imports = new Set<string>()
const classDeclarations: string[] = []

for (const definition of schemaASTRoot.definitions) {
  switch (definition.kind) {
    case "ObjectTypeDefinition": {
      imports.add("ObjectType")
      const classStr = `class ${definition.name.value}(ObjectType):`
      if (definition.fields) {
        const fieldStrs: string[] = []
        for (const field of definition.fields) {
          const fieldName = camelCaseToSnakeCase(field.name.value)
          const fieldType = getFieldTypeDeclaration(field.type, field.arguments)
          fieldStrs.push(
            `  ${fieldName} = ${fieldType}`
          )
        }
        const pythonClassDef = classStr + "\n" + fieldStrs.join("\n") + "\n"
        classDeclarations.push(pythonClassDef)
      } else {
        const pythonClassDef = classStr + "\n  pass\n"
        classDeclarations.push(pythonClassDef)
      }
    }
  }
}

let outFilePath = "./gen.py"
if (typeof program.out === "string") {
  outFilePath = program.out
}

if (classDeclarations.length){
  let outStr = ""
  if (imports.size) {
    outStr += `from graphene import ${Array.from(imports).join(", ")}\n\n`
  }
  outStr += classDeclarations.join("\n")
  fs.writeFile(outFilePath, outStr, err => {
    if (err) throw err
    else console.log(`Wrote file at ${outFilePath}`)
  })
}

function getFieldTypeDeclaration(
  typeNode: TypeNode,
  fieldArgs: ReadonlyArray<InputValueDefinitionNode> | undefined
): string {
  const extraArgs = []
  if (fieldArgs) {
    for (const arg of fieldArgs) {
      const argName = arg.name.value
      const typeName = getArgumentTypeDeclaration(arg.type)
      extraArgs.push(`${argName}=${typeName}`)
    }
  }
  let extraArgsStr = extraArgs.join(", ")

  switch (typeNode.kind) {
    case "NonNullType": {
      if (extraArgsStr) extraArgsStr = ", " + extraArgsStr

      imports.add("NonNull")
      return `NonNull(${getNestedTypeDeclaration(typeNode.type)}${extraArgsStr})`
    }
    case "ListType": {
      if (extraArgsStr) extraArgsStr = ", " + extraArgsStr

      imports.add("List")
      return `List(${getNestedTypeDeclaration(typeNode.type)}${extraArgsStr})`
    }
    case "NamedType": {
      if (builtInScalars.has(typeNode.name.value)) {
        imports.add(typeNode.name.value)
        return `${typeNode.name.value}(${extraArgsStr})`
      }
      if (extraArgsStr) extraArgsStr = ", " + extraArgsStr
      imports.add("Field")
      return `Field(${typeNode.name.value}${extraArgsStr})`
    }
  }

  // @ts-ignore should never reach this line
  throw new Error(`Expected type node but node was ${typeNode.kind}`)
}

function getArgumentTypeDeclaration(typeNode: TypeNode) {
  switch (typeNode.kind) {
    case "NonNullType": {
      imports.add("NonNull")
      return `NonNull(${getNestedTypeDeclaration(typeNode.type)})`
    }
    case "ListType": {
      imports.add("List")
      return `List(${getNestedTypeDeclaration(typeNode.type)})`
    }
    case "NamedType": {
      if (builtInScalars.has(typeNode.name.value)) {
        imports.add(typeNode.name.value)
        return `${typeNode.name.value}()`
      } else {
        // honestly I just don't know how to handle this case
        throw new Error(`Invalid argument type ${typeNode.name.value}`)
      }
    }
  }
}

function getNestedTypeDeclaration(typeNode: TypeNode): string {
  switch (typeNode.kind) {
    case "NonNullType": {
      imports.add("NonNull")
      return `NonNull(${getNestedTypeDeclaration(typeNode.type)})`
    }
    case "ListType": {
      imports.add("List")
      return `List(${getNestedTypeDeclaration(typeNode.type)})`
    }
    case "NamedType": {
      imports.add(typeNode.name.value)
      return typeNode.name.value
    }
  }

  // @ts-ignore should never reach this line
  throw new Error(`Expected type node but node was ${typeNode.kind}`)
}

// TODO: convert camel case to snake case
function camelCaseToSnakeCase(str: string) {
  return str
}
