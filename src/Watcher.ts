import chalk from "chalk";
import { TokenValue } from "@beanstalk/sdk-core";
import { Wallet } from "./Wallet";
import { Llamas } from "./generated";
import { Auction } from "./types";
import { exec } from "child_process";
import { BigNumber } from "ethers";
import fs from "fs";

const MIN_MINUTES = 5;
const SETTLE_MINUTES = 15;
const MAX_PRICE = TokenValue.fromHuman(2.5, 18);

type ShouldBid = {
  shouldBid: boolean;
  nextRetry: number;
};

export class Watcher {
  wallet: Wallet;
  contract: Llamas;
  // isPaused: boolean = true;

  constructor(wallet: Wallet, contract: Llamas) {
    this.wallet = wallet;
    this.contract = contract;
  }

  async watch() {
    while (true) {
      const waitTime = await this.watchFunction();
      process.stdout.write(
        ` Retrying in ${Number(waitTime / 60).toFixed(1)} minutes\n`
      );
      await this.sleep(waitTime);
    }
  }

  async watchFunction() {
    const auction = await this.getAuction();
    this.print(auction);
    this.saveToDB(auction);

    const { shouldBid, nextRetry } = await this.shouldMakeBid(auction);

    if (shouldBid) {
      try {
        await this.makeBid(auction);
      } catch (err) {
        console.log(err.message);
      }
    }

    return nextRetry;
  }

  async shouldMakeBid(auction: Auction): Promise<ShouldBid> {
    let shouldBid = false;
    let nextRetry = 60;
    let bidAmount = MAX_PRICE;

    if (auction.secondsLeft <= -1 * SETTLE_MINUTES * 60) {
      process.stdout.write(`${SETTLE_MINUTES} old. Settling...`);
      await this.settle(auction);
      shouldBid = false;
      nextRetry = 5;
      return { shouldBid, nextRetry };
    }
    if (auction.secondsLeft < 0) {
      process.stdout.write("Waiting to settle :: ");
      shouldBid = false;
      nextRetry = SETTLE_MINUTES * 60 + auction.secondsLeft;
      return { shouldBid, nextRetry };
    }
    if (auction.secondsLeft < 15) {
      process.stdout.write("Auction over :: ");
      shouldBid = false;
      nextRetry = 30;
      return { shouldBid, nextRetry };
    }

    if (auction.secondsLeft > MIN_MINUTES * 60) {
      process.stdout.write("Too early :: ");
      shouldBid = false;
      nextRetry = auction.secondsLeft - MIN_MINUTES * 60;
      return { shouldBid, nextRetry };
    }

    if (auction.amount.gte(bidAmount)) {
      process.stdout.write("Too expensive :: ");
      shouldBid = false;
      nextRetry = auction.secondsLeft + 5;
      return { shouldBid, nextRetry };
    }

    if (auction.bidder.toLowerCase() === this.wallet.address.toLowerCase()) {
      process.stdout.write("My Bid :: ");
      shouldBid = false;
      nextRetry = 15;
      return { shouldBid, nextRetry };
    }

    shouldBid = false;
    nextRetry = 30;
    return { shouldBid, nextRetry };
  }

  async makeBid(auction: Auction) {
    console.log("Bid: ", auction.amount.toHuman());
    const amount = auction.amount.eq(0)
      ? TokenValue.fromHuman(0.2, 18)
      : auction.amount.pct(102);
    console.log("Making a bid: ", amount.toHuman());
    const toSpend = await this.getAmountToSpend(amount);
    console.log("To Spend: ", toSpend.toHuman());
    const sig: string = process.env.SIG!;
    const estimatedGas = await this.contract.estimateGas.create_wl_bid(
      auction.id,
      amount.toBigNumber(),
      sig,
      {
        value: toSpend.toBigNumber(),
      }
    );

    console.log("Estimated Gas: ", estimatedGas.toString());
    console.log("Actual Gas: ", this.increaseGasLimit(estimatedGas).toString());

    const tx = await this.contract.create_wl_bid(
      auction.id,
      amount.toBigNumber(),
      sig,
      {
        value: toSpend.toBigNumber(),
        gasLimit: this.increaseGasLimit(estimatedGas),
      }
    );

    await tx.wait();
    console.log("MADE BID!");
  }

  increaseGasLimit(estimatedGasLimit: BigNumber) {
    return estimatedGasLimit.mul(200).div(100); // increase by 200%
  }

  async notify(auction: Auction) {
    const minLeft = auction.secondsLeft / 60;
    const currentBid = parseFloat(auction.amount.toHuman()).toFixed(2);
    const message = `Make a bid! Price is ${currentBid} eeth`;
    exec(`say "Let's go"`);
  }

  async getAmountToSpend(amountToBid: TokenValue) {
    const _reserve = await this.contract.pending_returns(this.wallet.address);
    const reserve = TokenValue.fromBlockchain(_reserve, 18);

    const toSpend = amountToBid.sub(reserve);
    const result = toSpend.lte(0) ? TokenValue.ZERO : toSpend;

    return result;
  }

  async settle(auction: Auction) {
    try {
      const tx = await this.contract.settle_current_and_create_new_auction();
      await tx.wait();
      console.log("Settled!");
    } catch (err) {
      console.log(`Failed: ${err.message}`);
    }
  }

  async getAuction() {
    const [id, amount, start_time, end_time, bidder, settled] =
      await this.contract.auction();
    return {
      id: id.toString(),
      amount: TokenValue.fromBlockchain(amount, 18),
      startTime: new Date(start_time.toNumber() * 1000),
      endTime: new Date(end_time.toNumber() * 1000),
      bidder,
      settled,
      secondsLeft: end_time.toNumber() - new Date().getTime() / 1000,
    };
  }

  print(auction: Auction) {
    let time;
    const minDiff = Number((auction.secondsLeft / 60).toFixed(1));

    if (minDiff < 0) {
      time = `ended ${minDiff * -1} minutes ago`;
    } else {
      time = `${minDiff} min`;
    }

    process.stdout.write(
      `${chalk.green(auction.id)}:: ${chalk.white(
        auction.amount.toHuman()
      )} :: ${auction.bidder} :: ${time} -\t`
    );
  }

  saveToDB(auction: Auction) {
    const file = "./src/db.json";
    const text = fs.readFileSync(file, "utf-8");
    const db = JSON.parse(text);
    db[auction.id] = {
      bidder: auction.bidder,
      amount: auction.amount.toHuman(),
      timestamp: `${new Date().toLocaleDateString()} : ${new Date().toLocaleTimeString()}`,
    };
    fs.writeFileSync(file, JSON.stringify(db, null, 4));
  }

  sleep(seconds: number) {
    return new Promise((res) => setTimeout(res, seconds * 1000));
  }
}
