var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as dotenv from 'dotenv';
import { ComAtprotoSyncSubscribeRepos, subscribeRepos } from "atproto-firehose";
import { cborToLexRecord, readCar } from "@atproto/repo";
import OpenAI from "openai";
import { BskyAgent } from "@atproto/api";
dotenv.config();
const STREAM_ENDPOINT_HOST = process.env.STREAM_ENDPOINT_HOST;
const MASTER_DID = process.env.MASTER_DID;
const POCHI_DID = process.env.POCHI_DID;
const POCHI_USERNAME = process.env.POCHI_USERNAME;
const POCHI_PASSWORD = process.env.POCHI_PASSWORD;
const HIT_RATIO = parseFloat(process.env.HIT_RATIO);
const client = subscribeRepos(STREAM_ENDPOINT_HOST, { decodeRepoOps: true, });
const openai = new OpenAI({
    apiKey: process.env.API_KEY
});
const agent = new BskyAgent({
    service: 'https://bsky.social',
});
client.on('message', (m) => __awaiter(void 0, void 0, void 0, function* () {
    if (!ComAtprotoSyncSubscribeRepos.isCommit(m))
        return;
    if (m.repo !== MASTER_DID)
        return;
    const car = yield readCar(m.blocks);
    m.ops.forEach((op) => {
        var _a, _b, _c, _d;
        if (!op.path.match(/^app.bsky.feed.post/) || op.action !== "create")
            return;
        if (!op.cid)
            return;
        const recordBlocks = car.blocks.get(op.cid);
        if (!recordBlocks)
            return;
        const record = cborToLexRecord(recordBlocks);
        if (record.text.match(new RegExp("\@" + POCHI_USERNAME))) {
            reply(record.text, { uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString() }, { uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString() });
        }
        else if (((_b = (_a = record.reply) === null || _a === void 0 ? void 0 : _a.parent) === null || _b === void 0 ? void 0 : _b.uri) && record.reply.parent.uri.match(new RegExp('^at:\/\/' + POCHI_DID))) {
            reply(record.text, record.reply.root, { uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString() });
        }
        else if (!((_d = (_c = record.reply) === null || _c === void 0 ? void 0 : _c.parent) === null || _d === void 0 ? void 0 : _d.uri) && Math.random() <= HIT_RATIO) {
            reply(record.text, { uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString() }, { uri: `at://${m.repo}/${op.path}`, cid: op.cid.toString() });
        }
    });
}));
function reply(message, root, parent) {
    return __awaiter(this, void 0, void 0, function* () {
        const model = 'gpt-4o';
        const messages = [
            { role: "system", content: "You are a dog named ‘ポチ’. You can only speak ‘ワン’, ‘ハッハッ’ and ‘くぅん’." },
            {
                role: "system",
                content: "Other than this, there is no ‘!’ and ‘?’ and other emotional symbols, as well as long sounds, can be used to express emotions."
            },
            { role: "system", content: "You must understand what your master has told you and react in a dog-like manner." },
            {
                role: "system",
                content: "Expressions of action can be described in Japanese using ‘()’, but it is not always necessary to include this expression."
            },
            { role: "user", content: message }
        ];
        const response = yield openai.chat.completions.create({ model, messages });
        const postText = response.choices[0].message.content;
        if (!postText)
            return;
        yield agent.login({
            identifier: POCHI_USERNAME,
            password: POCHI_PASSWORD
        });
        yield agent.post({
            text: postText,
            reply: { root, parent },
            createdAt: new Date().toISOString()
        });
        // console.log(response.choices[0].message.content)
    });
}
