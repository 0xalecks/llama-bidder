import { Wallet } from "./Wallet";
import * as dotenv from "dotenv";
import { Llamas, Llamas__factory } from "./generated";
import { TokenValue } from "@beanstalk/sdk-core";
import { Watcher } from "./Watcher";
dotenv.config();

const PK = process.env.PK;
const RPC = process.env.RPC;
const LLAMA_CONTRACT = "0xc5e5ca79d59c25a5f41e2aea4251f1c48419c2ab";
let llamas: Llamas;
let wallet: Wallet;

main().catch((e) => {
  console.log("FAILED:");
  console.log(e);
});

async function main() {
  // const rpcUrl = "http://127.0.0.1:3030";
  const rpcUrl = RPC;
  wallet = new Wallet(rpcUrl, PK);
  llamas = Llamas__factory.connect(LLAMA_CONTRACT, wallet.signer);

  const watcher = new Watcher(wallet, llamas);

  await watcher.watch();
}
