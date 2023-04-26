import { TokenValue } from "@beanstalk/sdk-core";
import { ethers, providers } from "ethers";

export class Wallet {
  provider: providers.JsonRpcProvider;
  signer: ethers.providers.JsonRpcSigner | ethers.Wallet;
  address: string;

  constructor(url, privateKey) {
    this.provider = new ethers.providers.StaticJsonRpcProvider(url);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.address = this.signer.address;
  }

  async impersonate(account: string) {
    await this.provider.send("anvil_impersonateAccount", [account]);
    this.signer = await this.provider.getSigner(account);
    return () => this.stopImpersonating(account);
  }

  async stopImpersonating(account: string) {
    await this.provider.send("anvil_stopImpersonatingAccount", [account]);
  }

  async getBalance() {
    let b = await this.provider.getBalance(this.address);
    return TokenValue.fromBlockchain(b, 18);
  }

  async setBalance(balance: TokenValue) {
    await this.provider.send("hardhat_setBalance", [
      this.address,
      balance.toHex(),
    ]);
  }
}
