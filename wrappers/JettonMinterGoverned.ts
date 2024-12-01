import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type JettonMinterGovernedConfig = {
    adminAddress: Address;
    nextAdminAddress: Address;
    jettonWalletCode: Cell;
    content: Cell;
};

export function contentToCell(content: string): Cell {
    return beginCell().storeStringTail(content).endCell();
}

export function jettonMinterGovernedConfigToCell(config: JettonMinterGovernedConfig): Cell {
    return beginCell()
        .storeCoins(0)
        .storeAddress(config.adminAddress)
        .storeAddress(config.nextAdminAddress)
        .storeRef(config.jettonWalletCode)
        .storeRef(config.content)
        .endCell();
}

export class JettonMinterGoverned implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonMinterGoverned(address);
    }

    static createFromConfig(config: JettonMinterGovernedConfig, code: Cell, workchain = 0) {
        const data = jettonMinterGovernedConfigToCell(config);
        const init = { code, data };
        return new JettonMinterGoverned(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0xd372158c, 32).storeUint(0, 64).endCell(),
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        opts: {
            totalTonAmount: bigint;
            toAddress: Address;
            jettonAmount: bigint;
            from?: Address;
            response?: Address;
            customPayload?: Cell;
            forwardTonAmount: bigint;
        },
    ) {
        const mintMsg = beginCell()
            .storeUint(0x178d4519, 32)
            .storeUint(0, 64)
            .storeCoins(opts.jettonAmount)
            .storeAddress(opts.from)
            .storeAddress(opts.response)
            .storeCoins(opts.forwardTonAmount)
            .storeMaybeRef(opts.customPayload)
            .endCell();
        await provider.internal(via, {
            value: opts.totalTonAmount,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x642b7d07, 32)
                .storeUint(0, 64)
                .storeAddress(opts.toAddress)
                .storeCoins(opts.totalTonAmount)
                .storeRef(mintMsg)
                .endCell(),
        });
    }

    async getJettonData(provider: ContractProvider): Promise<{
        totalSupply: bigint;
        mintable: boolean;
        adminAddress: Address;
        contentCell: Cell;
        jettonWalletCode: Cell;
    }> {
        const res = await provider.get('get_jetton_data', []);
        const totalSupply = res.stack.readBigNumber();
        const mintable = res.stack.readBoolean();
        const adminAddress = res.stack.readAddress();
        const contentCell = res.stack.readCell();
        const jettonWalletCode = res.stack.readCell();

        return {
            totalSupply,
            mintable,
            adminAddress,
            contentCell,
            jettonWalletCode,
        };
    }

    async getWalletAddress(provider: ContractProvider, ownerAddress: Address): Promise<Address> {
        const res = await provider.get('get_wallet_address', [
            { type: 'slice', cell: beginCell().storeAddress(ownerAddress).endCell() },
        ]);

        return res.stack.readAddress();
    }

    async getNextAdminAddress(provider: ContractProvider): Promise<Address> {
        const res = await provider.get('get_next_admin_address', []);
        return res.stack.readAddress();
    }
}
