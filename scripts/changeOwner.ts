import { compile, NetworkProvider } from '@ton/blueprint';
import { Address, Cell, toNano } from '@ton/core';
import { BalanceManager } from '../wrappers/BalanceManager';

export async function run(provider: NetworkProvider) {
    const ownerAddress = Address.parse('');
    const jettonMasterAddress = Address.parse('');
    const jettonWalletCode = Cell.fromBoc(Buffer.from('', 'hex'))[0];
    // в переменные выше добавляешь данные, которые использовались при деплое

    const balanceManager = provider.open(
        BalanceManager.createFromConfig(
            {
                ownerAddress,
                jettonMasterAddress,
                jettonWalletCode,
            },
            await compile('BalanceManager'),
        ),
    );

    const newOwnerAddress = Address.parse(''); // новый владалец
    await balanceManager.sendChangeOwner(provider.sender(), { value: toNano('0.05'), newOwnerAddress });

    await provider.waitForDeploy(balanceManager.address);

    // run methods on `balanceManager`
}
