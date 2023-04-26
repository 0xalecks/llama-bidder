import { TokenValue } from "@beanstalk/sdk-core";

export type Auction = {
  id: string;
  amount: TokenValue;
  startTime: Date;
  endTime: Date;
  bidder: string;
  settled: boolean;
  secondsLeft: number;
};
