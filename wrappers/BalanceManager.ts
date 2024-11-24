import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export const Op = {
    withdraw: 0xb5de5f9e,
    withdrawTon: 0x37726bdb,
    withdrawJetton: 0x11c09682,
    excess: 0x8ac8cfd1,
    changeOwner: 0x93b05b31,
    changeJetton: 0xbe845442,
};

export const Error = {
    wrongWorkchain: 100,
    unauthorizedOwnerRequest: 101,
    notEnoughTon: 102,
};

export type BalanceManagerConfig = {
    ownerAddress: Address;
    jettonMasterAddress: Address;
    jettonWalletCode: Cell;
};

export function balanceManagerConfigToCell(config: BalanceManagerConfig): Cell {
    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.jettonMasterAddress)
        .storeRef(config.jettonWalletCode)
        .endCell();
}

export class BalanceManager implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new BalanceManager(address);
    }

    static createFromConfig(config: BalanceManagerConfig, code: Cell, workchain = 0) {
        const data = balanceManagerConfigToCell(config);
        const init = { code, data };
        return new BalanceManager(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; jettonAmount: bigint; destination: Address },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.withdraw, 32)
                .storeUint(0, 64)
                .storeCoins(opts.jettonAmount)
                .storeAddress(opts.destination)
                .endCell(),
        });
    }

    async sendWithdrawTon(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; amount: bigint; destination: Address },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.withdrawTon, 32)
                .storeUint(0, 64)
                .storeCoins(opts.amount)
                .storeAddress(opts.destination)
                .endCell(),
        });
    }

    async sendWithdrawJetton(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            jettonAmount: bigint;
            destination: Address;
            jettonMasterAddress: Address;
            jettonWalletCode: Cell;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.withdrawJetton, 32)
                .storeUint(0, 64)
                .storeCoins(opts.jettonAmount)
                .storeAddress(opts.destination)
                .storeAddress(opts.jettonMasterAddress)
                .storeRef(opts.jettonWalletCode)
                .endCell(),
        });
    }

    async sendChangeOwner(provider: ContractProvider, via: Sender, opts: { value: bigint; newOwnerAddress: Address }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.changeOwner, 32)
                .storeUint(0, 64)
                .storeAddress(opts.newOwnerAddress)
                .endCell(),
        });
    }

    async sendChangeJetton(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; newJettonMasterAddress: Address; newJettonWalletCode: Cell },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Op.changeJetton, 32)
                .storeUint(0, 64)
                .storeAddress(opts.newJettonMasterAddress)
                .storeRef(opts.newJettonWalletCode)
                .endCell(),
        });
    }

    async getStorageData(
        provider: ContractProvider,
    ): Promise<{ ownerAddress: Address; jettonMasterAddress: Address; jettonWalletCode: Cell }> {
        const res = await provider.get('get_storage_data', []);
        const ownerAddress = res.stack.readAddress();
        const jettonMasterAddress = res.stack.readAddress();
        const jettonWalletCode = res.stack.readCell();

        return {
            ownerAddress,
            jettonMasterAddress,
            jettonWalletCode,
        };
    }
}
