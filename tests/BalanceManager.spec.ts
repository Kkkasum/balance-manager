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
                'b5ee9c7201021101000323000114ff00f4a413f4bcf2c80b0102016202030202cc0405001ba0f605da89a1f401f481f481a8610201d40607020120080900c30831c02497c138007434c0c05c6c2544d7c0fc03383e903e900c7e800c5c75c87e800c7e800c1cea6d0000b4c7e08403e29fa954882ea54c4d167c0278208405e3514654882ea58c511100fc02b80d60841657c1ef2ea4d67c02f817c12103fcbc2000113e910c1c2ebcb853600201200a0b0083d40106b90f6a2687d007d207d206a1802698fc1080bc6a28ca9105d41083deecbef09dd0958f97162e99f98fd001809d02811e428027d012c678b00e78b6664f6aa401f1503d33ffa00fa4021f001ed44d0fa00fa40fa40d4305136a1522ac705f2e2c128c2fff2e2c254344270542013541403c85004fa0258cf1601cf16ccc922c8cb0112f400f400cb00c920f9007074c8cb02ca07cbffc9d004fa40f40431fa0020d749c200f2e2c4778018c8cb055008cf1670fa0217cb6b13cc80c0201200d0e009e8210178d4519c8cb1f19cb3f5007fa0222cf165006cf1625fa025003cf16c95005cc2391729171e25008a813a08209c9c380a014bcf2e2c504c98040fb001023c85004fa0258cf1601cf16ccc9ed5402f73b51343e803e903e90350c0234cffe80145468017e903e9014d6f1c1551cdb5c150804d50500f214013e809633c58073c5b33248b232c044bd003d0032c0327e401c1d3232c0b281f2fff274140371c1472c7cb8b0c2be80146a2860822625a019ad822860822625a028062849e5c412440e0dd7c138c34975c2c0600f1000d73b51343e803e903e90350c01f4cffe803e900c145468549271c17cb8b049f0bffcb8b08160824c4b402805af3cb8b0e0841ef765f7b232c7c572cfd400fe8088b3c58073c5b25c60063232c14933c59c3e80b2dab33260103ec01004f214013e809633c58073c5b3327b552000705279a018a182107362d09cc8cb1f5230cb3f58fa025007cf165007cf16c9718010c8cb0524cf165006fa0215cb6a14ccc971fb0010241023007cc30023c200b08e218210d53276db708010c8cb055008cf165004fa0216cb6a12cb1f12cb3fc972fb0093356c21e203c85004fa0258cf1601cf16ccc9ed54',
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

    it('should withdraw jetton for owner', async () => {
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
        const withdrawJettonResult = await balanceManager.sendWithdraw(deployer.getSender(), {
            value: toNano('0.05'),
            jettonAmount: withdrawJettonAmount,
            destination: destination,
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

    it('should not withdraw jetton for not owner', async () => {
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
        const withdrawJettonResult = await balanceManager.sendWithdraw(sender.getSender(), {
            value: toNano('0.05'),
            jettonAmount: withdrawJettonAmount,
            destination: destination,
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
            value: toNano('0.05'),
            jettonAmount: withdrawJettonAmount,
            destination: destination,
            jettonMasterAddress: customJettonMinter.address,
            jettonWalletCode: jettonWalletCode,
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
            value: toNano('0.05'),
            jettonAmount: withdrawJettonAmount,
            destination: destination,
            jettonMasterAddress: customJettonMinter.address,
            jettonWalletCode: jettonWalletCode,
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
