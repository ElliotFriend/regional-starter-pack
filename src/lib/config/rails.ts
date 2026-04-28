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
    instapay: {
        id: 'instapay',
        name: 'InstaPay',
        description:
            "Philippines' real-time retail payment system enabling instant interbank transfers up to PHP 50,000 per transaction",
        type: 'bank_transfer',
    },
    pesonet: {
        id: 'pesonet',
        name: 'PESONet',
        description:
            "Philippines' batch electronic fund transfer system, settling same-day for higher-value transfers between participating banks and e-money issuers",
        type: 'bank_transfer',
    },
};

export function getPaymentRail(id: string): PaymentRail | undefined {
    return PAYMENT_RAILS[id];
}
