import {
  parse,
  TypeNode,
  FieldDefinitionNode,
  InputValueDefinitionNode
} from "graphql/language"

const builtInScalars = new Set(["String", "Float", "Int", "Boolean", "ID"])

interface Context {
  addGrapheneImport: (importName: string) => void
}

export default function generatePythonStr(schemaStr: string): string {
  const schemaASTRoot = parse(schemaStr)

  const imports = new Set<string>(["Schema"])
  let queryTypeName = "Query"
  let mutationTypeName: string | null = null
  const classDeclarations: string[] = []

  const context = {
    addGrapheneImport(importName: string) {
      imports.add(importName)
    }
  }

  for (const definition of schemaASTRoot.definitions) {
    switch (definition.kind) {
      case "SchemaDefinition": {
        for (const operationType of definition.operationTypes) {
          switch (operationType.operation) {
            case "query": {
              queryTypeName = operationType.type.name.value
              break
            }
            case "mutation": {
              mutationTypeName = operationType.type.name.value
              break
            }
          }
        }
        break
      }
      case "ObjectTypeDefinition": {
        context.addGrapheneImport("ObjectType")

        if (definition.name.value === "Mutation" && mutationTypeName === null) {
          mutationTypeName = "Mutation"
        }

        let classStr = `class ${definition.name.value}(ObjectType):\n`
        let isEmptyClass = true

        if (definition.description && definition.description.value.length) {
          classStr += `  '''${definition.description.value}'''\n`
        }

        if (definition.interfaces && definition.interfaces.length) {
          isEmptyClass = false
          classStr += "  class Meta:\n"
          const interfaceNames = definition.interfaces.map(
            iface => iface.name.value
          )
          classStr += `    interfaces = ${tupleStr(interfaceNames)}\n`
        }

        if (definition.fields && definition.fields.length) {
          if (!isEmptyClass) classStr += "\n"
          isEmptyClass = false
          const fieldStrs: string[] = []
          for (const field of definition.fields) {
            const fieldName = camelCaseToSnakeCase(field.name.value)
            const fieldArguments = getFieldArguments(field, context)
            const fieldType = getFieldTypeDeclaration(
              field,
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
        break
      }
      case "InputObjectTypeDefinition": {
        context.addGrapheneImport("InputObjectType")

        let classStr = `class ${definition.name.value}(InputObjectType):\n`

        if (definition.description && definition.description.value.length) {
          classStr += `  '''${definition.description.value}'''\n`
        }

        if (definition.fields && definition.fields.length) {
          const fieldStrs: string[] = []
          for (const field of definition.fields) {
            const fieldName = camelCaseToSnakeCase(field.name.value)
            const fieldArguments = getFieldArguments(field, context)
            const fieldType = getFieldTypeDeclaration(
              field,
              fieldArguments,
              context
            )
            fieldStrs.push(`  ${fieldName} = ${fieldType}`)
          }
          classStr += fieldStrs.join("\n") + "\n"
        } else {
          classStr += "  pass\n"
        }

        classDeclarations.push(classStr)
        break
      }
      case "InterfaceTypeDefinition": {
        context.addGrapheneImport("Interface")

        let classStr = `class ${definition.name.value}(Interface):\n`
        if (definition.description && definition.description.value.length) {
          classStr += `  '''${definition.description.value}'''\n`
        }

        if (definition.fields && definition.fields.length) {
          const fieldStrs: string[] = []
          for (const field of definition.fields) {
            const fieldName = camelCaseToSnakeCase(field.name.value)
            const fieldArguments = getFieldArguments(field, context)
            const fieldType = getFieldTypeDeclaration(
              field,
              fieldArguments,
              context
            )
            fieldStrs.push(`  ${fieldName} = ${fieldType}`)
          }
          classStr += fieldStrs.join("\n") + "\n"
        } else {
          classStr += "  pass\n"
        }

        classDeclarations.push(classStr)
        break
      }
      case "ScalarTypeDefinition": {
        context.addGrapheneImport("Scalar")
        let classStr = `class ${definition.name.value}(Scalar):\n`
        if (definition.description && definition.description.value.length) {
          classStr += `  '''${definition.description.value}'''\n`
        }
        classStr += "  pass\n"
        classDeclarations.push(classStr)
        break
      }
      case "EnumTypeDefinition": {
        context.addGrapheneImport("Enum")
        let classStr = `class ${definition.name.value}(Enum):\n`
        if (definition.description && definition.description.value.length) {
          classStr += `  '''${definition.description.value}'''\n`
        }
        if (definition.values) {
          for (let i = 0; i < definition.values.length; i++) {
            classStr += `  ${definition.values[i].name.value} = ${i}\n`
          }
        } else {
          classStr += "  pass\n"
        }
        classDeclarations.push(classStr)
        break
      }
      case "UnionTypeDefinition": {
        context.addGrapheneImport("Union")
        let classStr = `class ${definition.name.value}(Union):\n`
        if (definition.description && definition.description.value.length) {
          classStr += `  '''${definition.description.value}'''\n`
        }
        if (definition.types && definition.types.length) {
          classStr += "  class Meta:\n"
          const unionTypeNames = definition.types.map(type => type.name.value)
          classStr += `    types = ${tupleStr(unionTypeNames)}\n`
        } else {
          classStr += "  pass\n"
        }
        classDeclarations.push(classStr)
        break
      }
    }
  }

  let outStr = ""
  if (classDeclarations.length) {
    if (imports.size) {
      outStr += `from graphene import ${Array.from(imports).join(", ")}\n\n`
    }
    outStr += classDeclarations.join("\n")
    const mutationArg =
      mutationTypeName !== null ? `, mutation=${mutationTypeName}` : ""
    outStr += `\nschema = Schema(query=${queryTypeName}${mutationArg})\n`
  }
  return outStr
}

function objToDictLiteral(obj: { [key: string]: string }): string {
  const pairs = Object.keys(obj).map(key => `'${key}': ${obj[key]}`)
  return `{${pairs.join(", ")}}`
}

function getFieldArguments(
  field: FieldDefinitionNode | InputValueDefinitionNode,
  ctx: Context
): string {
  const reservedArgNames = new Set()
  const extraArgs = []
  // special case arguments - these need to work for both Fields and InputFields
  if (isSnakeCase(field.name.value)) {
    extraArgs.push(`name='${field.name.value}'`)
    reservedArgNames.add("name")
  }
  if (field.description) {
    extraArgs.push(`description='${field.description.value}'`)
    reservedArgNames.add("description")
  }
  // input fields don't have arguments
  if ("arguments" in field && field.arguments) {
    // these are the args that will make up the "args" parameter
    let collisionArgs = null
    for (const arg of field.arguments) {
      const argName = arg.name.value
      if (reservedArgNames.has(argName)) {
        let descriptionStr = ""
        if (arg.description) {
          descriptionStr = `, description=${arg.description.value}`
        }

        ctx.addGrapheneImport("Argument")
        const typeName = `Argument(${getNestedTypeDeclaration(
          arg.type,
          ctx
        )}${descriptionStr})`
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
  fieldNode: FieldDefinitionNode | InputValueDefinitionNode,
  extraArgsStr: string,
  ctx: Context
): string {
  const typeNode = fieldNode.type
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
      const fieldClassName =
        fieldNode.kind === "FieldDefinition" ? "Field" : "InputField"
      ctx.addGrapheneImport(fieldClassName)
      return `${fieldClassName}(${typeNode.name.value}${extraArgsStr})`
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
        if (argsStr !== "") argsStr = ", " + argsStr
        ctx.addGrapheneImport("Argument")
        return `Argument(${typeNode.name.value}${argsStr})`
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

function tupleStr(strs: string[]) {
  if (strs.length === 1) {
    return `(${strs[0]}, )`
  } else {
    return `(${strs.join(", ")})`
  }
}
