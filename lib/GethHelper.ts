import GethConnector from './GethConnector';
import * as Promise from 'bluebird';
import {TX_MINED} from './Constants';

class GethHelper {
    public watcher: any;
    public txQueue = new Map();
    public syncing: boolean = true;
    public watching = false;

    /**
     *
     * @returns {any}
     */
    public inSync() {
        if (!GethConnector.getInstance().serviceStatus.api) {
            return Promise.reject(new Error('not connected to IPC'));
        }

        const rules = [
            GethConnector.getInstance().web3.eth.getSyncingAsync(),
            GethConnector.getInstance().web3.net.getPeerCountAsync(),
            GethConnector.getInstance().web3.eth.getBlockAsync('latest')
        ];

        return Promise.all(rules).then((data) => {
            const timeStamp = Math.floor(new Date().getTime() / 1000);
            if (data[0]) {
                return [data[1], data[0]];
            }

            if (!data[0] && data[1] > 0 && (data[2].timestamp + 60 * 2) > timeStamp) {
                this.syncing = false;
                return [];
            }

            return [data[1]];
        });
    }

    /**
     * @fires GethConnector#TX_MINED
     * @returns {boolean}
     */
    public startTxWatch() {
        if (this.syncing) {
            throw new Error('Geth node is syncing, try calling #inSync() before this');
        }
        if (this.txQueue.size === 0) {
            return;
        }

        const currentQueue: string[] = [];
        this.watching = true;
        this.watcher = GethConnector.getInstance().web3.eth.filter('latest');
        this.watcher.watch((err: any, block: any) => {
            if (err) {
                return;
            }
            for (let hash of this.getCurrentTxQueue()) {
                currentQueue.push(
                    GethConnector.getInstance().web3.eth.getTransactionReceiptAsync(hash)
                );
            }
            Promise.all(currentQueue).then((receipt: any[]) => {
                receipt.forEach((data: any) => {
                    if (data) {
                        this.txQueue.delete(data.transactionHash);
                        if (this.txQueue.size === 0) {
                            this.stopTxWatch();
                        }
                        /**
                         * @event GethConnector#TX_MINED
                         */
                        GethConnector.getInstance().emit(TX_MINED, data.transactionHash);
                    }
                });
            });
        });
        return true;
    }

    /**
     *
     * @returns {string}
     */
    public stopTxWatch() {
        this.watching = false;
        return (this.watcher) ? this.watcher.stopWatching() : '';
    }

    /**
     *
     * @param tx
     * @param autoWatch
     * @returns {GethHelper}
     */
    public addTxToWatch(tx: string, autoWatch = true) {
        this.txQueue.set(tx, '');
        if (!this.watching && autoWatch) {
            this.startTxWatch();
        }
        return this;
    }

    /**
     *
     * @returns {IterableIterator<any>}
     */
    public getCurrentTxQueue() {
        return this.txQueue.keys();
    }
}

const helper = new GethHelper();
export default helper;