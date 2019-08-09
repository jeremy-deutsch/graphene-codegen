#!/usr/bin/env node

import { parse, TypeNode, InputValueDefinitionNode, FieldDefinitionNode } from "graphql/language"
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
          const fieldArguments = getFieldArguments(field)
          const fieldType = getFieldTypeDeclaration(field.type, fieldArguments)
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

function objToDictLiteral(obj: { [key: string]: string }): string {
  const pairs = Object.keys(obj).map(key => `'${key}': ${obj[key]}`)
  return `{${pairs.join(", ")}}`
}

function getFieldArguments(field: FieldDefinitionNode): string {
  const reservedArgNames = new Set()
  const extraArgs = []
  if (isSnakeCase(field.name.value)) {
    extraArgs.push(`name='${field.name.value}'`)
    reservedArgNames.add("name")
  }
  if (field.arguments) {
    // these are the args that will make up the "args" parameter
    let collisionArgs = null
    for (const arg of field.arguments) {
      const argName = arg.name.value
      if (reservedArgNames.has(argName)) {
        imports.add("Argument")
        const typeName = `Argument(${getNestedTypeDeclaration(arg.type)})`
        if (!collisionArgs) {
          collisionArgs = { [argName]: typeName }
        } else {
          collisionArgs[argName] = typeName
        }
      } else {
        const typeName = getArgumentTypeDeclaration(arg.type)
        extraArgs.push(`${argName}=${typeName}`)
      }
    }
    
    if (collisionArgs) {
      extraArgs.push(`args=${objToDictLiteral(collisionArgs)}`)
    }
  }
  return extraArgs.join(", ")
}

function getFieldTypeDeclaration(
  typeNode: TypeNode,
  extraArgsStr: string
): string {
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
        // honestly I just don't feel like handling this yet
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

function isSnakeCase(str: string) {
  return str.includes("_")
}

function camelCaseToSnakeCase(str: string) {
  return str.replace(/[\w]([A-Z])/g, m => m[0] + "_" + m[1]).toLowerCase();
}
