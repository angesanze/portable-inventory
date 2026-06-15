import React from 'react';
import { TransactionWidget } from './TransactionWidget';
import { ScannerWidget } from './ScannerWidget';
import { QRConfigWidget } from './QRConfigWidget';

export const Widget: React.FC = () => {
    const searchParams = new URL(window.location.href).searchParams;
    const mode = searchParams.get('mode');
    const configureMode = searchParams.get('configure_mode') === 'true';

    if (configureMode) return <QRConfigWidget />;
    if (mode === 'scan') return <ScannerWidget />;
    return <TransactionWidget />;
};
