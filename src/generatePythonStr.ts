import {
  parse,
  TypeNode,
  FieldDefinitionNode,
  ObjectTypeDefinitionNode,
  InputValueDefinitionNode
} from "graphql/language"

const builtInScalars = new Set(["String", "Float", "Int", "Boolean", "ID"])

interface Context {
  addGrapheneImport: (importName: string) => void
}

export default function generatePythonStr(schemaStr: string): string {
  const schemaASTRoot = parse(schemaStr)

  const imports = new Set<string>()
  const classDeclarations: string[] = []

  const context = {
    addGrapheneImport(importName: string) {
      imports.add(importName)
    }
  }

  for (const definition of schemaASTRoot.definitions) {
    switch (definition.kind) {
      case "ObjectTypeDefinition": {
        context.addGrapheneImport("ObjectType")

        let classStr = `class ${definition.name.value}(ObjectType):\n`
        let isEmptyClass = true

        const classMeta = getObjectTypeMeta(definition)
        if (classMeta) {
          classStr += classMeta
          isEmptyClass = false
        }

        if (definition.fields && definition.fields.length) {
          isEmptyClass = false
          const fieldStrs: string[] = []
          for (const field of definition.fields) {
            const fieldName = camelCaseToSnakeCase(field.name.value)
            const fieldArguments = getFieldArguments(field, context)
            const fieldType = getFieldTypeDeclaration(
              field.type,
              fieldArguments,
              context
            )
            fieldStrs.push(`  ${fieldName} = ${fieldType}`)
          }
          classStr += fieldStrs.join("\n") + "\n"
        }
        if (isEmptyClass) {
          classStr += "  pass\n"
        }
        classDeclarations.push(classStr)
      }
    }
  }

  let outStr = ""
  if (classDeclarations.length) {
    if (imports.size) {
      outStr += `from graphene import ${Array.from(imports).join(", ")}\n\n`
    }
    outStr += classDeclarations.join("\n")
  }
  return outStr
}

function getObjectTypeMeta(
  definition: ObjectTypeDefinitionNode
): string | null {
  const metaOptions: string[] = []
  if (definition.description) {
    metaOptions.push(`    description = '${definition.description.value}'`)
  }
  if (metaOptions.length) {
    return `  class Meta:\n${metaOptions.join("\n")}\n\n`
  } else {
    return null
  }
}

function objToDictLiteral(obj: { [key: string]: string }): string {
  const pairs = Object.keys(obj).map(key => `'${key}': ${obj[key]}`)
  return `{${pairs.join(", ")}}`
}

function getFieldArguments(field: FieldDefinitionNode, ctx: Context): string {
  const reservedArgNames = new Set()
  const extraArgs = []
  if (isSnakeCase(field.name.value)) {
    extraArgs.push(`name='${field.name.value}'`)
    reservedArgNames.add("name")
  }
  if (field.description) {
    extraArgs.push(`description='${field.description.value}'`)
    reservedArgNames.add("description")
  }
  if (field.arguments) {
    // these are the args that will make up the "args" parameter
    let collisionArgs = null
    for (const arg of field.arguments) {
      const argName = arg.name.value
      if (reservedArgNames.has(argName)) {
        ctx.addGrapheneImport("Argument")
        const typeName = `Argument(${getNestedTypeDeclaration(arg.type, ctx)})`
        if (!collisionArgs) {
          collisionArgs = { [argName]: typeName }
        } else {
          collisionArgs[argName] = typeName
        }
      } else {
        const typeName = getArgumentTypeDeclaration(arg, ctx)
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
  extraArgsStr: string,
  ctx: Context
): string {
  switch (typeNode.kind) {
    case "NonNullType": {
      if (extraArgsStr !== "") extraArgsStr = ", " + extraArgsStr

      ctx.addGrapheneImport("NonNull")
      return `NonNull(${getNestedTypeDeclaration(
        typeNode.type,
        ctx
      )}${extraArgsStr})`
    }
    case "ListType": {
      if (extraArgsStr !== "") extraArgsStr = ", " + extraArgsStr

      ctx.addGrapheneImport("List")
      return `List(${getNestedTypeDeclaration(
        typeNode.type,
        ctx
      )}${extraArgsStr})`
    }
    case "NamedType": {
      if (builtInScalars.has(typeNode.name.value)) {
        ctx.addGrapheneImport(typeNode.name.value)
        return `${typeNode.name.value}(${extraArgsStr})`
      }
      if (extraArgsStr !== "") extraArgsStr = ", " + extraArgsStr
      ctx.addGrapheneImport("Field")
      return `Field(${typeNode.name.value}${extraArgsStr})`
    }
  }

  // @ts-ignore should never reach this line
  throw new Error(`Expected type node but node was ${typeNode.kind}`)
}

function getArgumentTypeDeclaration(
  argNode: InputValueDefinitionNode,
  ctx: Context
): string {
  let argsStr = ""
  if (argNode.description) {
    argsStr = `description='${argNode.description.value}'`
  }

  const typeNode = argNode.type
  switch (typeNode.kind) {
    case "NonNullType": {
      ctx.addGrapheneImport("NonNull")
      if (argsStr !== "") argsStr = ", " + argsStr
      return `NonNull(${getNestedTypeDeclaration(
        typeNode.type,
        ctx
      )}${argsStr})`
    }
    case "ListType": {
      ctx.addGrapheneImport("List")
      if (argsStr !== "") argsStr = ", " + argsStr
      return `List(${getNestedTypeDeclaration(typeNode.type, ctx)}${argsStr})`
    }
    case "NamedType": {
      if (builtInScalars.has(typeNode.name.value)) {
        ctx.addGrapheneImport(typeNode.name.value)
        return `${typeNode.name.value}(${argsStr})`
      } else {
        // honestly I just don't feel like handling this yet
        throw new Error(`Invalid argument type ${typeNode.name.value}`)
      }
    }
  }
}

function getNestedTypeDeclaration(typeNode: TypeNode, ctx: Context): string {
  switch (typeNode.kind) {
    case "NonNullType": {
      ctx.addGrapheneImport("NonNull")
      return `NonNull(${getNestedTypeDeclaration(typeNode.type, ctx)})`
    }
    case "ListType": {
      ctx.addGrapheneImport("List")
      return `List(${getNestedTypeDeclaration(typeNode.type, ctx)})`
    }
    case "NamedType": {
      if (builtInScalars.has(typeNode.name.value)) {
        ctx.addGrapheneImport(typeNode.name.value)
      }
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
  return str.replace(/[\w]([A-Z])/g, m => m[0] + "_" + m[1]).toLowerCase()
}
