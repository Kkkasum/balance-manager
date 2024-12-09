import { compile } from '@ton/blueprint';
import { beginCell, Cell, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { BalanceManager, Error, Op } from '../wrappers/BalanceManager';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';

describe('BalanceManager', () => {
    let code: Cell;
    let jettonMinterCode: Cell;
    let jettonWalletCode: Cell;

    beforeAll(async () => {
        code = await compile('BalanceManager');
        jettonMinterCode = await compile('JettonMinter');
        jettonWalletCode = Cell.fromBoc(
            Buffer.from(
                'b5ee9c72010101010023000842028f452d7a4dfd74066b682365177259ed05734435be76b5fd4bd5d8af2b7c3d68',
                'hex',
            ),
        )[0];
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let sender: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let balanceManager: SandboxContract<BalanceManager>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        sender = await blockchain.treasury('sender');

        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    adminAddress: deployer.address,
                    content: Cell.EMPTY,
                    jettonWalletCode: jettonWalletCode,
                },
                jettonMinterCode,
            ),
        );
        const deployJettonMinterResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployJettonMinterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        });

        balanceManager = blockchain.openContract(
            BalanceManager.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    jettonMasterAddress: jettonMinter.address,
                    jettonWalletCode: jettonWalletCode,
                },
                code,
            ),
        );

        const deployResult = await balanceManager.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: balanceManager.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and balanceManager are ready to use
    });

    it('should withdraw usdt for owner', async () => {
        const balanceManagerJettonWalletAddress = await jettonMinter.getWalletAddress(balanceManager.address);
        const balanceManagerJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: balanceManager.address,
                    jettonMasterAddress: jettonMinter.address,
                    jettonWalletCode,
                },
                jettonWalletCode,
            ),
        );
        expect(balanceManagerJettonWalletAddress).toEqualAddress(balanceManagerJettonWallet.address);

        const mintJettonAmount = toNano('1000');
        const mintCustomJettonResult = await jettonMinter.sendMint(deployer.getSender(), {
            value: toNano('0.1'),
            toAddress: balanceManager.address,
            jettonAmount: mintJettonAmount,
            forwardTonAmount: toNano('0.05'),
            totalTonAmount: toNano('0.1'),
        });
        expect(mintCustomJettonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });
        expect(mintCustomJettonResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: balanceManagerJettonWalletAddress,
            deploy: true,
            success: true,
        });

        let balanceManagerJettonWalletBalance = (await balanceManagerJettonWallet.getWalletData()).balance;
        expect(balanceManagerJettonWalletBalance).toEqual(mintJettonAmount);

        const destination = (await blockchain.treasury('destination')).address;
        const destinationJettonWalletAddress = await jettonMinter.getWalletAddress(destination);
        const destinationJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: destination,
                    jettonMasterAddress: jettonMinter.address,
                    jettonWalletCode,
                },
                jettonWalletCode,
            ),
        );
        expect(destinationJettonWalletAddress).toEqualAddress(destinationJettonWallet.address);

        const withdrawJettonAmount = toNano('100');
        const withdrawJettonResult = await balanceManager.sendWithdrawUsdt(deployer.getSender(), {
            value: toNano('0.1'),
            jettonAmount: withdrawJettonAmount,
            destination: destination,
            fwdFee: toNano('0.05'),
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: balanceManager.address,
            success: true,
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: balanceManager.address,
            to: balanceManagerJettonWalletAddress,
            op: 0xf8a7ea5,
            success: true,
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: balanceManagerJettonWalletAddress,
            to: destinationJettonWalletAddress,
            op: 0x178d4519,
            deploy: true,
            success: true,
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: destinationJettonWalletAddress,
            to: destination,
            op: 0x7362d09c,
            success: true,
        });

        balanceManagerJettonWalletBalance = (await balanceManagerJettonWallet.getWalletData()).balance;
        expect(balanceManagerJettonWalletBalance).toEqual(mintJettonAmount - withdrawJettonAmount);

        const destinationJettonWalletBalance = (await destinationJettonWallet.getWalletData()).balance;
        expect(destinationJettonWalletBalance).toEqual(withdrawJettonAmount);
    });

    it('should not withdraw usdt for not owner', async () => {
        const balanceManagerJettonWalletAddress = await jettonMinter.getWalletAddress(balanceManager.address);
        const balanceManagerJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: balanceManager.address,
                    jettonMasterAddress: jettonMinter.address,
                    jettonWalletCode,
                },
                jettonWalletCode,
            ),
        );
        expect(balanceManagerJettonWalletAddress).toEqualAddress(balanceManagerJettonWallet.address);

        const mintJettonAmount = toNano('1000');
        const mintCustomJettonResult = await jettonMinter.sendMint(deployer.getSender(), {
            value: toNano('0.1'),
            toAddress: balanceManager.address,
            jettonAmount: mintJettonAmount,
            forwardTonAmount: toNano('0.05'),
            totalTonAmount: toNano('0.1'),
        });
        expect(mintCustomJettonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: true,
        });
        expect(mintCustomJettonResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: balanceManagerJettonWalletAddress,
            deploy: true,
            success: true,
        });

        let balanceManagerJettonWalletBalance = (await balanceManagerJettonWallet.getWalletData()).balance;
        expect(balanceManagerJettonWalletBalance).toEqual(mintJettonAmount);

        const destination = (await blockchain.treasury('destination')).address;
        const destinationJettonWalletAddress = await jettonMinter.getWalletAddress(destination);
        const destinationJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: destination,
                    jettonMasterAddress: jettonMinter.address,
                    jettonWalletCode,
                },
                jettonWalletCode,
            ),
        );
        expect(destinationJettonWalletAddress).toEqualAddress(destinationJettonWallet.address);

        const withdrawJettonAmount = toNano('100');
        const withdrawJettonResult = await balanceManager.sendWithdrawUsdt(sender.getSender(), {
            value: toNano('0.1'),
            jettonAmount: withdrawJettonAmount,
            destination: destination,
            fwdFee: toNano('0.05'),
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: sender.address,
            to: balanceManager.address,
            exitCode: Error.unauthorizedOwnerRequest,
            aborted: true,
        });
    });

    it('should withdraw ton for owner', async () => {
        await deployer.send({ value: toNano('10'), to: balanceManager.address });

        const deployerBalanceBefore = await deployer.getBalance();
        const withdrawTonAmount = toNano('10');
        const withdrawTonResult = await balanceManager.sendWithdrawTon(deployer.getSender(), {
            value: toNano('0.05'),
            amount: withdrawTonAmount,
            destination: deployer.address,
        });
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: balanceManager.address,
            success: true,
        });
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: balanceManager.address,
            to: deployer.address,
            op: Op.excess,
            success: true,
        });

        const deployerBalanceAfter = await deployer.getBalance();
        expect(deployerBalanceAfter).toBeGreaterThan(deployerBalanceBefore);
    });

    it('should not withdraw ton for not owner', async () => {
        const withdrawTonAmount = toNano('10');
        const withdrawTonResult = await balanceManager.sendWithdrawTon(sender.getSender(), {
            value: toNano('0.05'),
            amount: withdrawTonAmount,
            destination: deployer.address,
        });
        expect(withdrawTonResult.transactions).toHaveTransaction({
            from: sender.address,
            to: balanceManager.address,
            exitCode: Error.unauthorizedOwnerRequest,
            aborted: true,
        });
    });

    it('should withdraw custom jetton for owner', async () => {
        const customJettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    adminAddress: deployer.address,
                    content: beginCell().storeUint(1, 16).endCell(),
                    jettonWalletCode: jettonWalletCode,
                },
                jettonMinterCode,
            ),
        );
        const deployJettonMinterResult = await customJettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployJettonMinterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: customJettonMinter.address,
            deploy: true,
            success: true,
        });

        const balanceManagerJettonWalletAddress = await customJettonMinter.getWalletAddress(balanceManager.address);
        const balanceManagerJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: balanceManager.address,
                    jettonMasterAddress: customJettonMinter.address,
                    jettonWalletCode,
                },
                jettonWalletCode,
            ),
        );
        expect(balanceManagerJettonWalletAddress).toEqualAddress(balanceManagerJettonWallet.address);

        const mintJettonAmount = toNano('1000');
        const mintCustomJettonResult = await customJettonMinter.sendMint(deployer.getSender(), {
            value: toNano('0.1'),
            toAddress: balanceManager.address,
            jettonAmount: mintJettonAmount,
            forwardTonAmount: toNano('0.05'),
            totalTonAmount: toNano('0.1'),
        });
        expect(mintCustomJettonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: customJettonMinter.address,
            success: true,
        });
        expect(mintCustomJettonResult.transactions).toHaveTransaction({
            from: customJettonMinter.address,
            to: balanceManagerJettonWalletAddress,
            deploy: true,
            success: true,
        });

        let balanceManagerJettonWalletBalance = (await balanceManagerJettonWallet.getWalletData()).balance;
        expect(balanceManagerJettonWalletBalance).toEqual(mintJettonAmount);

        const destination = (await blockchain.treasury('destination')).address;
        const destinationJettonWalletAddress = await customJettonMinter.getWalletAddress(destination);
        const destinationJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: destination,
                    jettonMasterAddress: customJettonMinter.address,
                    jettonWalletCode,
                },
                jettonWalletCode,
            ),
        );
        expect(destinationJettonWalletAddress).toEqualAddress(destinationJettonWallet.address);

        const withdrawJettonAmount = toNano('100');
        const withdrawJettonResult = await balanceManager.sendWithdrawJetton(deployer.getSender(), {
            value: toNano('0.1'),
            jettonAmount: withdrawJettonAmount,
            destination: destination,
            jettonMasterAddress: customJettonMinter.address,
            jettonWalletCode: jettonWalletCode,
            fwdFee: toNano('0.05'),
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: balanceManager.address,
            success: true,
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: balanceManager.address,
            to: balanceManagerJettonWalletAddress,
            op: 0xf8a7ea5,
            success: true,
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: balanceManagerJettonWalletAddress,
            to: destinationJettonWalletAddress,
            op: 0x178d4519,
            deploy: true,
            success: true,
        });

        balanceManagerJettonWalletBalance = (await balanceManagerJettonWallet.getWalletData()).balance;
        expect(balanceManagerJettonWalletBalance).toEqual(mintJettonAmount - withdrawJettonAmount);

        const destinationJettonWalletBalance = (await destinationJettonWallet.getWalletData()).balance;
        expect(destinationJettonWalletBalance).toEqual(withdrawJettonAmount);
    });

    it('should not withdraw custom jetton for not owner', async () => {
        const customJettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    adminAddress: deployer.address,
                    content: beginCell().storeUint(1, 16).endCell(),
                    jettonWalletCode: jettonWalletCode,
                },
                await compile('JettonMinter'),
            ),
        );
        const deployJettonMinterResult = await customJettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployJettonMinterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: customJettonMinter.address,
            deploy: true,
            success: true,
        });

        const balanceManagerJettonWalletAddress = await customJettonMinter.getWalletAddress(balanceManager.address);
        const balanceManagerJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: balanceManager.address,
                    jettonMasterAddress: customJettonMinter.address,
                    jettonWalletCode,
                },
                jettonWalletCode,
            ),
        );
        expect(balanceManagerJettonWalletAddress).toEqualAddress(balanceManagerJettonWallet.address);

        const mintJettonAmount = toNano('1000');
        const mintCustomJettonResult = await customJettonMinter.sendMint(deployer.getSender(), {
            value: toNano('0.1'),
            toAddress: balanceManager.address,
            jettonAmount: mintJettonAmount,
            forwardTonAmount: toNano('0.05'),
            totalTonAmount: toNano('0.1'),
        });
        expect(mintCustomJettonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: customJettonMinter.address,
            success: true,
        });
        expect(mintCustomJettonResult.transactions).toHaveTransaction({
            from: customJettonMinter.address,
            to: balanceManagerJettonWalletAddress,
            deploy: true,
            success: true,
        });

        let balanceManagerJettonWalletBalance = (await balanceManagerJettonWallet.getWalletData()).balance;
        expect(balanceManagerJettonWalletBalance).toEqual(mintJettonAmount);

        const destination = (await blockchain.treasury('destination')).address;
        const destinationJettonWalletAddress = await customJettonMinter.getWalletAddress(destination);
        const destinationJettonWallet = blockchain.openContract(
            JettonWallet.createFromConfig(
                {
                    ownerAddress: destination,
                    jettonMasterAddress: customJettonMinter.address,
                    jettonWalletCode,
                },
                jettonWalletCode,
            ),
        );
        expect(destinationJettonWalletAddress).toEqualAddress(destinationJettonWallet.address);

        const withdrawJettonAmount = toNano('100');
        const withdrawJettonResult = await balanceManager.sendWithdrawJetton(sender.getSender(), {
            value: toNano('0.1'),
            jettonAmount: withdrawJettonAmount,
            destination: destination,
            jettonMasterAddress: customJettonMinter.address,
            jettonWalletCode: jettonWalletCode,
            fwdFee: toNano('0.05'),
        });
        expect(withdrawJettonResult.transactions).toHaveTransaction({
            from: sender.address,
            to: balanceManager.address,
            exitCode: Error.unauthorizedOwnerRequest,
            aborted: true,
        });
    });

    it('should change owner for owner', async () => {
        const newOwnerAddress = (await blockchain.treasury('newOwner')).address;

        const changeOwnerResult = await balanceManager.sendChangeOwner(deployer.getSender(), {
            value: toNano('0.05'),
            newOwnerAddress,
        });
        expect(changeOwnerResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: balanceManager.address,
            success: true,
        });
        expect(changeOwnerResult.transactions).toHaveTransaction({
            from: balanceManager.address,
            to: deployer.address,
            success: true,
        });

        const { ownerAddress } = await balanceManager.getStorageData();
        expect(ownerAddress).toEqualAddress(newOwnerAddress);
    });

    it('should not change owner for not owner', async () => {
        const newOwnerAddress = (await blockchain.treasury('newOwner')).address;

        const changeOwnerResult = await balanceManager.sendChangeOwner(sender.getSender(), {
            value: toNano('0.05'),
            newOwnerAddress,
        });
        expect(changeOwnerResult.transactions).toHaveTransaction({
            from: sender.address,
            to: balanceManager.address,
            exitCode: Error.unauthorizedOwnerRequest,
            aborted: true,
        });
    });

    it('should change jetton for owner', async () => {
        const newJettonMasterAddress = (await blockchain.treasury('newJettonMasterAddress')).address;
        const newJettonWalletCode = beginCell().storeUint(0, 6).endCell();

        const changeJettonResult = await balanceManager.sendChangeJetton(deployer.getSender(), {
            value: toNano('0.05'),
            newJettonMasterAddress,
            newJettonWalletCode,
        });
        expect(changeJettonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: balanceManager.address,
            success: true,
        });
        expect(changeJettonResult.transactions).toHaveTransaction({
            from: balanceManager.address,
            to: deployer.address,
            success: true,
        });

        const { jettonMasterAddress, jettonWalletCode } = await balanceManager.getStorageData();
        expect(jettonMasterAddress).toEqualAddress(newJettonMasterAddress);
        expect(jettonWalletCode).toEqualCell(newJettonWalletCode);
    });

    it('should not change jetton for not owner', async () => {
        const newJettonMasterAddress = (await blockchain.treasury('newJettonMasterAddress')).address;
        const newJettonWalletCode = beginCell().storeUint(0, 6).endCell();

        const changeJettonResult = await balanceManager.sendChangeJetton(sender.getSender(), {
            value: toNano('0.05'),
            newJettonMasterAddress,
            newJettonWalletCode,
        });
        expect(changeJettonResult.transactions).toHaveTransaction({
            from: sender.address,
            to: balanceManager.address,
            exitCode: Error.unauthorizedOwnerRequest,
            aborted: true,
        });
    });
});
