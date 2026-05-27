/**
 * Payment Rail Configuration
 *
 * Defines the payment rails (bank transfer systems) supported across regions.
 */

export interface PaymentRail {
    id: string;
    name: string;
    description: string;
    type: 'bank_transfer' | 'card' | 'mobile_money' | 'other';
}

export const PAYMENT_RAILS: Record<string, PaymentRail> = {
    spei: {
        id: 'spei',
        name: 'SPEI',
        description:
            "Sistema de Pagos Electrónicos Interbancarios - Mexico's real-time payment system",
        type: 'bank_transfer',
    },
    pix: {
        id: 'pix',
        name: 'PIX',
        description:
            "Brazil's instant payment system operated by the Central Bank, enabling 24/7 real-time transfers",
        type: 'bank_transfer',
    },
    bank: {
        id: 'bank',
        name: 'Bank Transfer',
        description:
            'Generic bank transfer rail used by the SEP test anchor for end-to-end integration testing.',
        type: 'bank_transfer',
    },
    instapay: {
        id: 'instapay',
        name: 'InstaPay',
        description:
            "The Philippines' real-time, low-value electronic fund transfer system for instant interbank transfers.",
        type: 'bank_transfer',
    },
    pesonet: {
        id: 'pesonet',
        name: 'PESONet',
        description:
            'A Philippine batch electronic fund transfer rail for higher-value interbank transfers, settled same-day.',
        type: 'bank_transfer',
    },
    gcash: {
        id: 'gcash',
        name: 'GCash',
        description:
            'A leading Philippine mobile wallet for payments, transfers, and cash-in/cash-out.',
        type: 'mobile_money',
    },
    maya: {
        id: 'maya',
        name: 'Maya',
        description:
            'A Philippine mobile wallet and digital bank supporting payments and transfers.',
        type: 'mobile_money',
    },
};

export function getPaymentRail(id: string): PaymentRail | undefined {
    return PAYMENT_RAILS[id];
}
