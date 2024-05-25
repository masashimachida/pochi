import * as dotenv from 'dotenv'
import {ComAtprotoSyncSubscribeRepos, subscribeRepos, SubscribeReposMessage} from "atproto-firehose"
import {cborToLexRecord, readCar} from "@atproto/repo"
import OpenAI from "openai"
import {BskyAgent} from "@atproto/api";

dotenv.config()

const STREAM_ENDPOINT_HOST = process.env.STREAM_ENDPOINT_HOST!
const MASTER_DID = process.env.MASTER_DID!
const POCHI_NAME = process.env.POCHI_NAME!
const POCHI_DID = process.env.POCHI_DID!
const POCHI_USERNAME = process.env.POCHI_USERNAME!
const POCHI_PASSWORD = process.env.POCHI_PASSWORD!
const HIT_RATIO = parseFloat(process.env.HIT_RATIO!)

const client = subscribeRepos(STREAM_ENDPOINT_HOST!, {decodeRepoOps: true,})

const openai = new OpenAI({
  apiKey: process.env.API_KEY!
})

const agent = new BskyAgent({
  service: 'https://bsky.social',
})

client.on('message', async (m: SubscribeReposMessage) => {
  if (!ComAtprotoSyncSubscribeRepos.isCommit(m)) return

  if (m.repo !== MASTER_DID) return

  const car = await readCar(m.blocks)

  m.ops.forEach((op) => {
    if (!op.path.match(/^app.bsky.feed.post/) || op.action !== "create") return

    if (!op.cid) return

    const recordBlocks = car.blocks.get(op.cid)
    if (!recordBlocks) return

    const record = cborToLexRecord(recordBlocks)

    if (
      record.text.match(new RegExp("\@" + POCHI_USERNAME, 'g')) ||
      record.text.match(new RegExp(POCHI_NAME, 'g'))
    ) {
      reply(
        record.text,
        {uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString()},
        {uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString()},
      )
    } else if (record.reply?.parent?.uri && record.reply.parent.uri.match(new RegExp('^at:\/\/' + POCHI_DID))) {
      reply(
        record.text,
        record.reply.root,
        {uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString()},
      )
    } else if (!record.reply?.parent?.uri && Math.random() <= HIT_RATIO) {
      reply(
        record.text,
        {uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString()},
        {uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString()},
      )
    }
  })
})

async function reply(message: string, root: { uri: string, cid: string }, parent: { uri: string, cid: string }) {

  const model: OpenAI.ChatModel = 'gpt-4o'
  const messages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = [
    {role: "system", content: "You are a dog named ‘ポチ’. You can only speak ‘ワン’, ‘ハッハッ’ and ‘くぅん’."},
    {
      role: "system",
      content: "Other than this, there is no ‘!’ and ‘?’ and other emotional symbols, as well as long sounds, can be used to express emotions."
    },
    {role: "system", content: "You must understand what your master has told you and react in a dog-like manner."},
    {
      role: "system",
      content: "Expressions of action can be described in Japanese using ‘()’, but it is not always necessary to include this expression."
    },
    {role: "user", content: message}
  ]

  const response = await openai.chat.completions.create({model, messages})

  const postText = response.choices[0].message.content
  if (!postText) return

  await agent.login({
    identifier: POCHI_USERNAME,
    password: POCHI_PASSWORD
  })

  await agent.post({
    text: postText,
    reply: {root, parent},
    createdAt: new Date().toISOString()
  })

  // console.log(response.choices[0].message.content)
}