import { Wallet } from "./Wallet";
import * as dotenv from "dotenv";
import { Llamas, Llamas__factory } from "./generated";
dotenv.config();
const PK = process.env.PK;
const LLAMA_CONTRACT = "0xc5e5ca79d59c25a5f41e2aea4251f1c48419c2ab";
const LLAMA_OWNER = "0x73eb240a06f0e0747c698a219462059be6aaccc8";
let llamas: Llamas;

main().catch((e) => {
  console.log("FAILED:");
  console.log(e);
});

async function main() {
  const rpcUrl = "http://127.0.0.1:3030";
  const wallet = new Wallet(rpcUrl, PK);
  const stop = await wallet.impersonate(LLAMA_OWNER);

  llamas = Llamas__factory.connect(LLAMA_CONTRACT, wallet.signer);

  await go();

  await stop();
}

async function go() {
  // const tx = await llamas.pause();
  // await tx.wait();
  // const paused = await llamas.paused();
  // console.log("Is Paused: ", paused);
  // const tx = await llamas.unpause();
  // await tx.wait();
  const tx2 = await llamas.settle_current_and_create_new_auction();
  await tx2.wait();
}
