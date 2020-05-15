const moment = require('moment')
const { getExpirationFields } = require('../../../utils/shared/expiration.js')

function childNodeCreator({
  node,
  actions: { createNode, createParentChildLink }
}) {
  return async function ({ children = [], ...rest }) {
    const newNode = {
      parent: node.id,
      children,
      ...rest
    }

    await createNode(newNode)
    await createParentChildLink({ parent: node, child: newNode })
  }
}

module.exports = {
  async createSchemaCustomization({
    actions: { createTypes },
    schema: { buildObjectType }
  }) {
    createTypes([
      buildObjectType({
        name: 'CommunityHero',
        interfaces: ['Node'],
        fields: {
          date: 'Date',
          expires: 'Date',
          expired: 'Boolean',
          url: 'String',
          sourceIndex: 'Int',
          pictureDesktop: 'String',
          pictureMobile: 'String'
        }
      }),
      buildObjectType({
        name: 'CommunityEvent',
        interfaces: ['Node'],
        fields: {
          date: 'Date',
          expires: 'Date',
          expired: 'Boolean',
          title: 'String',
          url: 'String',
          description: 'String',
          sourceIndex: 'Int',
          city: 'String',
          pictureUrl: 'String'
        }
      }),
      buildObjectType({
        name: 'CommunityRest',
        interfaces: ['Node'],
        fields: {
          content: 'JSON'
        }
      })
    ])
  },
  async onParseJsonFile(api, { content }) {
    const createChildNode = childNodeCreator(api)
    const { node, createNodeId, createContentDigest } = api
    // Only operate on the File node for data.json
    if (node.relativePath !== 'community.json') return null
    const { events, hero, ...rest } = content

    const heroesPromise =
      hero &&
      Promise.all(
        hero.map(async (hero, sourceIndex) => {
          const { expires, expired } = getExpirationFields(hero)
          const fields = {
            ...hero,
            expires,
            expired,
            sourceIndex
          }
          await createChildNode({
            id: createNodeId(`CommunityHero >>> ${sourceIndex}`),
            ...fields,
            internal: {
              type: 'CommunityHero',
              contentDigest: createContentDigest(fields)
            }
          })
        })
      )

    const eventsPromise =
      events &&
      Promise.all(
        events.map(async (event, sourceIndex) => {
          const { title, date } = event
          const { expires, expired } = getExpirationFields(event)
          const fields = {
            ...event,
            sourceIndex,
            date: date ? moment(date).toDate() : null,
            expires,
            expired
          }
          await createChildNode({
            id: createNodeId(`Event >>> ${date} >>> ${title}`),
            ...fields,
            internal: {
              type: 'CommunityEvent',
              contentDigest: createContentDigest(fields)
            }
          })
        })
      )

    /*
       Create a catch-all node with the rest of the data from community.json
       accessible as a JSON field. This way, we don't have to duplicate imported
       data before updating all Community components.
    */
    const restPromise = createChildNode({
      id: createNodeId(`DVCCommunityRest`),
      content: rest,
      internal: {
        type: 'CommunityRest',
        contentDigest: createContentDigest(rest)
      }
    })

    return Promise.all([heroesPromise, eventsPromise, restPromise])
  }
}
