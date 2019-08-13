# graphene-codegen

### Turn your GraphQL schema into Python boilerplate.

Note: doesn't output classes in the correct dependency order.
Also doesn't translate directives or default arguments yet.

### Usage

```sh
$ npm i -g graphene-codegen
$ graphene-codegen --schema="./schema.graphql" --out="gen.py"
```

### Example

#### Input file
```graphql
enum Episode {
  NEWHOPE
  EMPIRE
  JEDI
}

"""
You can use these to get around the galaxy.
"""
type Starship {
  id: ID!
  name: String!
  length(unit: String): Float
}

interface Character {
  id: ID!
  name: String!
  friends: [Character]
  appearsIn: [Episode]!
}

type Human implements Character {
  id: ID!
  name: String!
  friends: [Character]
  appearsIn: [Episode]!
  starships: [Starship]
  totalCredits: Int
}

type Droid implements Character {
  id: ID!
  name: String!
  friends: [Character]
  appearsIn: [Episode]!
  primaryFunction: String
}

union SearchResult = Human | Droid | Starship

type Query {
  hero(episode: Episode): Character
  droid(id: ID!): Droid
}
```

#### Output file
```python
from graphene import Schema, Enum, ObjectType, NonNull, ID, String, Float, Interface, List, Int, Union, Argument, Field

class Episode(Enum):
  NEWHOPE = 0
  EMPIRE = 1
  JEDI = 2

class Starship(ObjectType):
  '''You can use these to get around the galaxy.'''
  id = NonNull(ID)
  name = NonNull(String)
  length = Float(unit=String())

class Character(Interface):
  id = NonNull(ID)
  name = NonNull(String)
  friends = List(Character)
  appears_in = NonNull(List(Episode))

class Human(ObjectType):
  class Meta:
    interfaces = (Character, )

  id = NonNull(ID)
  name = NonNull(String)
  friends = List(Character)
  appears_in = NonNull(List(Episode))
  starships = List(Starship)
  total_credits = Int()

class Droid(ObjectType):
  class Meta:
    interfaces = (Character, )

  id = NonNull(ID)
  name = NonNull(String)
  friends = List(Character)
  appears_in = NonNull(List(Episode))
  primary_function = String()

class SearchResult(Union):
  class Meta:
    types = (Human, Droid, Starship)

class Query(ObjectType):
  hero = Field(Character, episode=Argument(Episode))
  droid = Field(Droid, id=NonNull(ID))

schema = Schema(query=Query)
```
