import values from 'lodash/values'

const INTS = [
  'Int',
  'Int8',
  'Int16',
  'Int32',
  'Int64'
]

const captializeFirstLetter = str => str.charAt(0).toUpperCase() + str.slice(1)

const getTab = num => {
  let result = ''
  for (let i = 0; i < num; i++) {
    result += '  '
  }
  return result
}

function _fromEnum (context, property) {
  if (context.enums[property.label]) {
    return
  }
  let text = `public enum ${captializeFirstLetter(property.label)} {\n`
  const vals = property.range.values.map(val => `  ${val}`)
  text += vals.join(',\n')
  text += '\n}\n\n'
  context.enums[property.label] = text
  return captializeFirstLetter(property.label)
}

function _fromLinkedClassType (context, ref) {
  const classItem = context.classCache[ref]
  return captializeFirstLetter(classItem.label)
}

function _fromNestedObjectType (context, property) {
  return captializeFirstLetter(property.label)
}

function _getType (context, property, depth) {
  const { range } = property

  switch (range.type) {
    case 'Boolean': return 'boolean'
    case 'Text': return 'String'
    case 'Date':
      context.dateUsed = true
      return 'Date'
    case 'Number':
      switch (range.format) {
        case 'Int': return 'int'
        case 'Int8': return 'byte'
        case 'Int16': return 'short'
        case 'Int32': return 'int'
        case 'Int64': return 'long'
        case 'Float32': return 'float'
        case 'Float64': return 'double'
        default: return 'float'
      }
    case 'Enum':
      return _fromEnum(context, property)
    case 'LinkedClass':
      return _fromLinkedClassType(context, range.ref)
    case 'NestedObject':
      return _fromNestedObjectType(context, property)
    // case 'Text':
    default:
      return 'AAAA'
  }
}

function _buildConstructor (mainLabel, constructorParams, depth) {
  const len = constructorParams.length
  const args = constructorParams.reduce((prev, next, index) => {
    prev += `${next.type} init${captializeFirstLetter(next.label)}`
    if (index !== len - 1) {
      prev += ', '
    }
    return prev
  }, '')

  let text = `${getTab(depth)}public ${mainLabel} (${args}) {\n`

  constructorParams.forEach(param => {
    text += `${getTab(depth + 1)} ${param.label} = init${captializeFirstLetter(param.label)};\n`
  })

  text += `${getTab(depth)}}`

  return text
}

export function _generateJavaClass (context, label, propertySpecs, depth = 1) {
  const mainLabel = captializeFirstLetter(label)
  let text = `${getTab(depth - 1)}public class ${mainLabel} {\n`

  var elements = {
    nestedClasses: [],
    private: [],
    constructorParams: [],
    getFunc: [],
    setFunc: []
  }

  propertySpecs.forEach(propertySpec => {
    const property = context.propertyCache[propertySpec.ref]
    const { label } = property
    const capitalLabel = captializeFirstLetter(label)

    if (property.range.type === 'NestedObject') {
      elements.nestedClasses.push(_generateJavaClass(
        context,
        property.label,
        property.range.propertySpecs,
        depth + 1
      ))
    }

    let type = _getType(context, property)

    elements.private.push(`${getTab(depth)}private ${type} ${property.label}`)

    elements.constructorParams.push({ type, label: property.label})

    let getStr = `${getTab(depth)}public ${type} get${capitalLabel}() {\n`
    getStr += `${getTab(depth + 1)}return ${label};\n`
    getStr += `${getTab(depth)}}`

    elements.getFunc.push(getStr)

    let setStr = `${getTab(depth)}public void set${capitalLabel}(${type} val) {\n`
    setStr += `${getTab(depth + 1)}${label} = val;\n`
    setStr += `${getTab(depth)}}`

    elements.setFunc.push(setStr)
  })

  text += '\n'
  if (elements.nestedClasses.length) {
    text += elements.nestedClasses.join('\n')
    text += '\n\n'
  }
  text += elements.private.join(';\n')
  text += ';\n\n'
  text += _buildConstructor(mainLabel, elements.constructorParams, depth)
  text += ';\n\n'
  text += elements.getFunc.join(';\n\n')
  text += ';\n\n'
  text += elements.setFunc.join(';\n\n')

  text += `;\n${getTab(depth - 1)}}`

  return text
}

export function generateFromClass (graph, classUid, opts = {}) {
  /* Create a simple context obj to thread through */
  const context = {
    classCache: {},
    propertyCache: {},
    dateUsed: false,
    enums: {}
  }

  /* Create a dict lookup for classes and properties for speed and convenience */
  graph.forEach(node => {
    if (node.type === 'Class') {
      context.classCache[node.uid] = node
    } else if (node.type === 'Property') {
      context.propertyCache[node.uid] = node
    }
  })

  /* TODO: make this optional, use graphql interfaces */
  // flattenHierarchies(context)

  const currentClass = context.classCache[classUid]
  if (!currentClass) {
    throw new Error(`Could not find class ${classUid} in graph`)
  }

  let text = _generateJavaClass(context, currentClass.label, currentClass.propertySpecs)
  const enumKeys = Object.keys(context.enums)
  if (enumKeys.length) {
    enumKeys.forEach(key => {
      text = context.enums[key] + text
    })
  }

  if (context.dateUsed) {
    text = 'import java.util.Date;\n\n' + text
  }

  return text

  // const combined = [
  //   ...values(context.enums),
  //   ...values(context.types)
  // ]

  // return combined.join('\n\n')
}
